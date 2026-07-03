"""Fable-backed Data-Contract draft assistant.

This is the one place in Signal where a frontier LLM (Claude Fable 5) earns its
keep: turning the aggregate facts Signal already extracts — a table's profile,
its lineage neighbours, inventory metadata — into a *draft* semantic Data
Contract for a human steward to review. It is deliberately confined to the
authoring boundary and obeys the project invariants:

- [ENGINE-FROZEN / G7] Lives in ``services/api/`` and imports the SDK lazily.
  ``dq_core`` stays framework-free and never sees an LLM.
- [G1] The model emits **SQL-free semantic YAML only**. It is handed straight to
  the deterministic ``validate_contract`` gate; the existing compiler still
  produces the SQL. A draft that fails validation is returned *as* an error, not
  silently used.
- [PII-GATE / G8] Only aggregate statistics leave the process — column names,
  counts, distinct counts, null ratios, min/max/avg/median. Raw rows and sample
  values are stripped by an allowlist before the prompt is built. Nothing here
  reads or forwards HANA row content.

Fable specifics (see docs / claude-api skill): thinking is always on — the
``thinking`` parameter is omitted entirely (an explicit value 400s); depth is
controlled with ``output_config.effort``. A safety-classifier ``refusal`` is a
successful HTTP 200, so ``stop_reason`` is checked before reading content, and
server-side fallback to Opus 4.8 is opted into by default. Fable also requires
30-day data retention — ZDR orgs get a 400 on every request.
"""
from __future__ import annotations

import textwrap
from typing import Any

# Aggregate-only column fields we are willing to forward to the model. Anything
# not on this list (e.g. sample values) is dropped — the [PII-GATE] in code.
_AGG_COLUMN_FIELDS = (
    "column", "data_type", "total", "nulls", "null_pct", "distinct",
    "uniqueness_pct", "pk_candidate", "text_like", "numeric_like",
    "decimal_like", "empty_count", "empty_pct", "min", "max", "avg", "median",
)

_FABLE_FAMILY = ("claude-fable", "claude-mythos")

_SYSTEM_PROMPT = textwrap.dedent(
    """\
    You are a data contract authoring assistant for Signal, a data-quality
    cockpit for SAP Datasphere. From aggregate profiling and lineage facts you
    draft a *semantic* Data Contract in YAML for a human steward to review.

    Hard rules:
    - Output a single YAML document and nothing else — no prose, no code fences.
    - The contract is SQL-free. Never emit a `sql:` or `query:` key, or any raw
      SQL. Guarantees are declarative families only.
    - Top-level keys: product, kind, dataset, owned_by, owners, version,
      lifecycle, description, guarantees. Use version "0.1.0" and
      lifecycle "draft" for a new draft.
    - `guarantees` may contain: `schema` (columns list + `mode: closed|open`),
      `keys` (list of {columns, unique, severity}), `not_null`
      (list of {columns, severity}), `volume` ({min_rows, severity}),
      `freshness` ({column, max_age as ISO-8601 duration, severity}).
    - severity is one of: warn | fail | critical.
    - Only propose a guarantee the evidence supports. Base `keys` on the primary
      key candidates, `not_null` on columns with a 0% null ratio, `volume` on a
      conservative fraction of the observed row count, and `freshness` only on a
      plausible timestamp/date column. Prefer omission over a guess.
    """
)


class ContractAssistantError(Exception):
    """Raised for configuration / model-call failures. Carries an HTTP status so
    the router can surface it as RFC-7807 without leaking internals."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def is_configured(settings: Any) -> bool:
    """The assistant is usable only when explicitly enabled and a credential is
    resolvable. We never fail open into a surprise LLM call."""
    if not getattr(settings, "contract_assistant_enabled", False):
        return False
    import os

    return bool(getattr(settings, "anthropic_api_key", "") or os.environ.get("ANTHROPIC_API_KEY"))


def _sanitize_columns(profile: dict) -> list[dict]:
    """Copy only aggregate fields off each profiled column — the code-level
    [PII-GATE]. Sample values, if the caller included any, never make it in."""
    out: list[dict] = []
    for col in profile.get("columns") or []:
        if not isinstance(col, dict):
            continue
        out.append({k: col[k] for k in _AGG_COLUMN_FIELDS if k in col})
    return out


def _lineage_neighbours(lineage: dict, product: str) -> dict[str, list[str]]:
    """Direct upstream/downstream object ids for *product* from the lineage
    graph. Edge direction keys vary by extractor — handle the common shapes."""
    upstream: list[str] = []
    downstream: list[str] = []
    for edge in lineage.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        src = edge.get("source") or edge.get("from") or edge.get("src")
        dst = edge.get("target") or edge.get("to") or edge.get("dst")
        if dst == product and src:
            upstream.append(str(src))
        elif src == product and dst:
            downstream.append(str(dst))
    return {"upstream": sorted(set(upstream)), "downstream": sorted(set(downstream))}


def build_context(
    *,
    product: str,
    kind: str,
    profile: dict,
    inventory: list[dict],
    lineage: dict,
) -> dict:
    """Assemble the aggregate-only context handed to the model."""
    meta = next((o for o in inventory if o.get("id") == product or o.get("name") == product), {})
    return {
        "product": product,
        "kind": kind,
        "dataset": product,
        "owned_by": meta.get("owned_by", "product"),
        "owners": meta.get("owners", []),
        "space": meta.get("space", ""),
        "layer": meta.get("layer", ""),
        "row_count": profile.get("row_count"),
        "column_count": profile.get("column_count"),
        "pk_candidates": (profile.get("pk_candidates") or {}).get("single", []),
        "columns": _sanitize_columns(profile),
        "lineage": _lineage_neighbours(lineage, product),
    }


def _build_prompt(context: dict) -> str:
    import json

    return (
        "Draft a Data Contract from these aggregate facts. Return YAML only.\n\n"
        + json.dumps(context, indent=2, sort_keys=True, default=str)
    )


def _call_model(settings: Any, prompt: str) -> tuple[str, str]:
    """Single seam that actually talks to the API — tests monkeypatch this.

    Returns (yaml_text, model_that_served). Raises ContractAssistantError on a
    missing SDK, a refusal that fell through, or an empty response.
    """
    try:
        import anthropic
    except ImportError as exc:  # SDK is an optional dep; feature is off without it.
        raise ContractAssistantError(
            503, "Contract assistant is enabled but the 'anthropic' SDK is not installed."
        ) from exc

    api_key = getattr(settings, "anthropic_api_key", "") or None
    client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

    model = getattr(settings, "contract_assistant_model", "claude-fable-5")
    effort = getattr(settings, "contract_assistant_effort", "high")
    common = dict(
        model=model,
        max_tokens=16000,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": effort},  # thinking is always-on on Fable — do not set `thinking`
    )

    try:
        if model.startswith(_FABLE_FAMILY):
            # Opt into server-side refusal fallback so a false-positive classifier
            # hit on benign data work is transparently re-served by Opus 4.8.
            fallback = getattr(settings, "contract_assistant_fallback_model", "claude-opus-4-8")
            resp = client.beta.messages.create(
                betas=["server-side-fallback-2026-06-01"],
                fallbacks=[{"model": fallback}],
                **common,
            )
        else:
            resp = client.messages.create(**common)
    except Exception as exc:  # network / auth / 400 — details go to logs, not the client.
        raise ContractAssistantError(502, "The model request failed.") from exc

    if getattr(resp, "stop_reason", None) == "refusal":
        raise ContractAssistantError(422, "The model declined to draft this contract.")

    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
    if not text.strip():
        raise ContractAssistantError(502, "The model returned an empty draft.")
    return text.strip(), getattr(resp, "model", model)


def draft_contract(settings: Any, context: dict) -> tuple[str, str]:
    """Public entry: build the prompt for *context* and return (yaml, model)."""
    return _call_model(settings, _build_prompt(context))

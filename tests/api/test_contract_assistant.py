"""Contract-assistant endpoint + PII-gate tests.

No network or SDK: the single model seam (``_call_model``) is monkeypatched, so
these exercise the wiring, the deterministic validation gate, and the
aggregate-only [PII-GATE] sanitisation.
"""
from __future__ import annotations

import services.api.contract_assistant as ca


def _enable(monkeypatch):
    """Turn the feature on and force settings to be re-read on the next request."""
    import services.api.settings as settings_mod

    monkeypatch.setenv("CONTRACT_ASSISTANT_ENABLED", "true")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    settings_mod._settings = None


_VALID_DRAFT = """\
product: DS_SALES_ORDERS
kind: internal_gate
dataset: DS_SALES_ORDERS
version: 0.1.0
lifecycle: draft
guarantees:
  schema:
    columns: [ORDER_ID, AMOUNT]
    mode: closed
  keys:
    - columns: [ORDER_ID]
      unique: true
      severity: critical
"""


def test_draft_disabled_returns_503(api_client):
    resp = api_client.post(
        "/api/contract-assistant/draft",
        json={"product": "DS_SALES_ORDERS", "profile": {}},
    )
    assert resp.status_code == 503
    assert resp.headers["content-type"].startswith("application/problem+json")


def test_draft_happy_path_validates(api_client, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setattr(ca, "_call_model", lambda settings, prompt, model: (_VALID_DRAFT, model))

    resp = api_client.post(
        "/api/contract-assistant/draft",
        json={
            "product": "DS_SALES_ORDERS",
            "kind": "internal_gate",
            "profile": {
                "row_count": 12000,
                "columns": [{"column": "ORDER_ID", "null_pct": 0.0, "pk_candidate": True}],
                "pk_candidates": {"single": ["ORDER_ID"]},
            },
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    # Default configured model is used when no override is given.
    assert body["model"] == "claude-opus-4-8"
    assert body["valid"] is True
    assert body["validation_errors"] == []
    assert body["parsed"]["product"] == "DS_SALES_ORDERS"


def test_per_request_model_override(api_client, monkeypatch):
    _enable(monkeypatch)
    # The model the caller picks is what actually reaches the seam.
    monkeypatch.setattr(ca, "_call_model", lambda settings, prompt, model: (_VALID_DRAFT, model))

    resp = api_client.post(
        "/api/contract-assistant/draft",
        json={"product": "DS_SALES_ORDERS", "profile": {}, "model": "claude-sonnet-5"},
    )
    assert resp.status_code == 200
    assert resp.json()["model"] == "claude-sonnet-5"


def test_draft_invalid_yaml_reported_not_raised(api_client, monkeypatch):
    _enable(monkeypatch)
    # A syntactically-fine YAML mapping that violates the contract schema.
    monkeypatch.setattr(ca, "_call_model", lambda s, p, model: ("product: X\ndataset: X\n", model))

    resp = api_client.post(
        "/api/contract-assistant/draft",
        json={"product": "X", "profile": {}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["valid"] is False
    assert body["validation_errors"]  # missing version/guarantees, surfaced not swallowed


def test_refusal_maps_to_422(api_client, monkeypatch):
    _enable(monkeypatch)

    def _refuse(settings, prompt, model):
        raise ca.ContractAssistantError(422, "The model declined to draft this contract.")

    monkeypatch.setattr(ca, "_call_model", _refuse)
    resp = api_client.post(
        "/api/contract-assistant/draft",
        json={"product": "DS_SALES_ORDERS", "profile": {}},
    )
    assert resp.status_code == 422


def test_resolve_model_override_wins():
    class _S:
        contract_assistant_model = "claude-opus-4-8"

    s = _S()
    assert ca.resolve_model(s) == "claude-opus-4-8"
    assert ca.resolve_model(s, None) == "claude-opus-4-8"
    assert ca.resolve_model(s, "  ") == "claude-opus-4-8"  # blank override ignored
    assert ca.resolve_model(s, "claude-haiku-4-5") == "claude-haiku-4-5"


def test_build_context_strips_non_aggregate_fields():
    """[PII-GATE] sample values must never reach the prompt context."""
    profile = {
        "row_count": 5,
        "column_count": 1,
        "pk_candidates": {"single": ["ORDER_ID"]},
        "columns": [
            {
                "column": "CUSTOMER_EMAIL",
                "null_pct": 0.0,
                "distinct": 5,
                "samples": ["alice@example.com", "bob@example.com"],  # must be dropped
                "sample_rows": [{"CUSTOMER_EMAIL": "alice@example.com"}],
            }
        ],
    }
    ctx = ca.build_context(
        product="DS_SALES_ORDERS", kind="internal_gate",
        profile=profile, inventory=[], lineage={"edges": []},
    )
    col = ctx["columns"][0]
    assert col["column"] == "CUSTOMER_EMAIL"
    assert "samples" not in col
    assert "sample_rows" not in col
    # And nothing resembling raw values survives anywhere in the serialised context.
    import json

    assert "alice@example.com" not in json.dumps(ctx)

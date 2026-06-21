"""Data profiling endpoint (Tier-2) — exposes dq_core.profile over a live HANA
connection.

Profiling runs aggregate-only queries (COUNT / COUNT DISTINCT / MIN / MAX /
MEDIAN, never SELECT *) by default and returns per-column statistics plus
primary-key candidates with name-based heuristic scoring. Optional sample rows
are a separate [PII-GATE] path: default off, projected to server-allowlisted
columns only.

[AUTHZ] Like a DQ run, profiling loads HANA — viewer must not trigger it.
Fail-closed (S-13): profiling requires a configured environment; it never runs
against the mock (which cannot produce meaningful statistics).
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from ..auth.provider import PrincipalDep
from ..deps import get_environment, get_inventory
from ..settings import get_settings

logger = logging.getLogger("dq_cockpit.profile")

router = APIRouter(prefix="/api/objects", tags=["profile"])


class ProfileRequest(BaseModel):
    environment: str | None = None
    include_composite: bool = True
    include_samples: bool = False
    sample_limit: int = 20


def _sample_payload(
    *,
    enabled: bool,
    columns: list[str],
    rows: list[dict[str, Any]] | None = None,
    reason: str = "",
) -> dict[str, Any]:
    return {
        "enabled": enabled,
        "columns": columns,
        "rows": rows or [],
        "reason": reason,
    }


def _fetch_sample_rows(cursor: Any, schema: str, table: str, columns: list[str], limit: int) -> list[dict[str, Any]]:
    from dq_core.connect.query_helpers import jsonable, qualified, quote_identifier

    selected = ", ".join(quote_identifier(col) for col in columns)
    cursor.execute(f"SELECT {selected} FROM {qualified(schema, table)} LIMIT {limit}")
    names = [col[0] for col in (getattr(cursor, "description", None) or [])]
    raw_rows = cursor.fetchall()
    return [
        {name: jsonable(value) for name, value in zip(names, row)}
        for row in raw_rows
    ]


def _maybe_add_sample_rows(result: dict[str, Any], cursor: Any, schema: str, table: str, body: ProfileRequest) -> None:
    if not body.include_samples:
        return

    settings = get_settings()
    if not settings.allow_profile_samples:
        result["sample_rows"] = _sample_payload(
            enabled=False,
            columns=[],
            reason="Profile samples are disabled by server policy.",
        )
        return

    available = {str(col.get("column")) for col in result.get("columns", []) if col.get("column")}
    columns = [col for col in settings.profile_sample_columns if col in available]
    if not columns:
        result["sample_rows"] = _sample_payload(
            enabled=False,
            columns=[],
            reason="No profile sample columns are allowlisted.",
        )
        return

    limit = min(max(int(body.sample_limit or 20), 1), 50)
    try:
        result["sample_rows"] = _sample_payload(
            enabled=True,
            columns=columns,
            rows=_fetch_sample_rows(cursor, schema, table, columns, limit),
        )
    except Exception:  # noqa: BLE001 - sample rows are optional; keep aggregates usable.
        logger.warning("Sample-row profiling failed for %s.%s", schema, table, exc_info=True)
        result["sample_rows"] = _sample_payload(
            enabled=False,
            columns=columns,
            reason="Sample rows could not be read.",
        )


@router.post("/{object_id}/profile")
def profile_object(
    object_id: str,
    principal: PrincipalDep,
    body: ProfileRequest = Body(default=ProfileRequest()),
    inventory: list[dict] = Depends(get_inventory),
):
    """Profile one object's columns over a live HANA connection.

    Returns per-column stats, PK candidates (single + composite), and
    heuristic key scores. Requires steward role or higher and a configured
    environment with a real HANA connection.
    """
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Profiling requires steward role or higher.")

    obj = next(
        (o for o in inventory if (o.get("id") or o.get("technicalName") or o.get("name")) == object_id),
        None,
    )
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object {object_id!r} not found")

    env_cfg = get_environment(body.environment) if body.environment else None
    if body.environment and env_cfg is None:
        raise HTTPException(status_code=422, detail=f"Unknown environment {body.environment!r}")
    if env_cfg is None:
        # [SCHEMA-MAP]/S-13: profiling needs real data — no mock fallback.
        raise HTTPException(
            status_code=422,
            detail="Profiling requires a configured environment with a live HANA connection.",
        )

    from dq_core.connect.db_connection import get_connection
    from dq_core.profile.heuristics import enrich_result_with_context
    from dq_core.profile.pk_detection import (
        analyze_composite_candidates,
        rank_single_candidates,
    )
    from dq_core.profile.profiler import profile_table

    schema = env_cfg.get("schema") or obj.get("schema") or "LOCAL"  # [SCHEMA-MAP]
    table = obj.get("technicalName") or obj.get("name") or object_id

    conn = None
    try:
        conn = get_connection(
            host=env_cfg.get("host", ""),
            port=int(env_cfg.get("port", 443)),
            user=env_cfg.get("user", ""),
            password=env_cfg.get("password", ""),
            schema=schema,
        )
        cursor = conn.cursor()

        result = profile_table(cursor, schema, table)
        result["view"] = table  # heuristics.enrich_result_with_context keys off 'view'

        ranked_single = rank_single_candidates(result["columns"])
        exact_combos: list = []
        ranked_composite: list = []
        search_meta: dict = {}
        if body.include_composite:
            exact_combos, ranked_composite, search_meta = analyze_composite_candidates(
                result["columns"], ranked_single, cursor, schema, table, max_cols=3
            )

        result["pk_candidates"] = {
            "single": (result.get("pk_candidates") or {}).get("single", []),
            "composite": [list(c) for c in exact_combos],
            "ranked_single": ranked_single,
            "ranked_composite": ranked_composite,
            "search_meta": search_meta,
        }

        _maybe_add_sample_rows(result, cursor, schema, table, body)

        try:
            return enrich_result_with_context(result, obj)
        except Exception:  # noqa: BLE001 — heuristics are an enhancement; never fail the profile
            logger.warning("Heuristic enrichment failed for %s; returning base profile.", object_id, exc_info=True)
            return result
    except HTTPException:
        raise
    except RuntimeError as exc:
        # Fail-closed connector errors (e.g. driver missing) → 503, message is safe.
        raise HTTPException(status_code=503, detail=str(exc))
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass

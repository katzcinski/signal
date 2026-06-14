"""Data profiling endpoint (Tier-2) — exposes dq_core.profile over a live HANA
connection.

Profiling runs aggregate-only queries (COUNT / COUNT DISTINCT / MIN / MAX /
MEDIAN, never SELECT *) against the object's table/view and returns per-column
statistics plus primary-key candidates with name-based heuristic scoring.

[AUTHZ] Like a DQ run, profiling loads HANA — viewer must not trigger it.
Fail-closed (S-13): profiling requires a configured environment; it never runs
against the mock (which cannot produce meaningful statistics).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from ..auth.provider import PrincipalDep
from ..deps import get_environment, get_inventory

logger = logging.getLogger("dq_cockpit.profile")

router = APIRouter(prefix="/api/objects", tags=["profile"])


class ProfileRequest(BaseModel):
    environment: str | None = None
    include_composite: bool = True


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

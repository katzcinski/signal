"""Incident-Lifecycle (R4-1): persistente Breach-Episoden mit Status, Owner
und Aktions-Timeline. Die abgeleitete Sicht auf fehlgeschlagene Checks bleibt
unter /api/incidents/checks erhalten (Drilldown-Quelle)."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel

from ..auth.provider import PrincipalDep
from ..deps import StoreDep

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

VALID_INCIDENT_STATUS = {"open", "acknowledged", "investigating", "resolved"}


class IncidentTransitionIn(BaseModel):
    status: str | None = None
    owner: str | None = None
    note: str = ""


@router.get("")
def list_incidents(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    store: StoreDep = ...,
):
    if status and status not in VALID_INCIDENT_STATUS:
        raise HTTPException(status_code=422, detail=f"Unknown status {status!r}")
    return store.list_incidents(status=status, severity=severity, limit=limit)


@router.get("/checks")
def list_failing_checks(
    severity: str | None = Query(default=None),
    dataset: str | None = Query(default=None),
    store: StoreDep = ...,
):
    """Derived view: breached check results within last 7 days (not a separate store)."""
    conn = sqlite3.connect(store.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row

    where_clauses = [
        "cr.passed = 0",
        "cr.severity IN ('critical', 'fail')",
        "cr.state IN ('executed', 'error')",
        "r.started_at >= datetime('now', '-7 days')",
        "r.run_state = 'finished'",
    ]
    params: list = []
    if severity:
        where_clauses.append("cr.severity = ?")
        params.append(severity)
    if dataset:
        where_clauses.append("r.dataset = ?")
        params.append(dataset)

    sql = f"""
        SELECT
          cr.check_name,
          r.dataset,
          cr.severity,
          cr.expect_expr,
          cr.actual_value,
          cr.error_message,
          cr.state,
          r.run_id,
          r.started_at,
          r.schema_name
        FROM dq_check_results cr
        JOIN dq_runs r ON cr.run_id = r.run_id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY r.started_at DESC
        LIMIT 200
    """
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    # Stabile id für FE-Row-Keys (run_id × check_name ist eindeutig je Lauf).
    return [{**dict(r), "id": f"{r['run_id']}:{r['check_name']}"} for r in rows]


@router.get("/{incident_id}")
def get_incident(incident_id: int, store: StoreDep = ...):
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident


@router.post("/{incident_id}/transition")
def transition_incident(
    incident_id: int,
    principal: PrincipalDep,
    body: IncidentTransitionIn = Body(...),
    store: StoreDep = ...,
):
    """[AUTHZ] Statuswechsel/Assign/Note — jede Aktion landet in der Timeline."""
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Incident actions require steward role or higher.")
    if body.status and body.status not in VALID_INCIDENT_STATUS:
        raise HTTPException(status_code=422, detail=f"Unknown status {body.status!r}")
    incident = store.transition_incident(
        incident_id, body.status, principal.name, owner=body.owner, note=body.note
    )
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident

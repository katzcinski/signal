from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Query

from ..auth.provider import PrincipalDep
from ..deps import StoreDep
from ..schemas.incident_schemas import (
    IncidentAssignIn,
    IncidentDetailOut,
    IncidentOut,
    IncidentTransitionIn,
)

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

_VALID_STATUS = {"open", "acknowledged", "investigating", "resolved"}


@router.get("", response_model=list[IncidentOut])
def list_incidents(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    store: StoreDep = ...,
):
    """R4-1 Inbox: incidents from the lifecycle table, severity-sorted."""
    return store.get_incidents(status=status, severity=severity, limit=limit, offset=offset)


@router.get("/{incident_id}", response_model=IncidentDetailOut)
def get_incident(incident_id: str, store: StoreDep = ...):
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id!r} not found")
    return incident


@router.post("/{incident_id}/transition", response_model=IncidentDetailOut)
def transition_incident(
    incident_id: str,
    principal: PrincipalDep,
    body: IncidentTransitionIn = Body(...),
    store: StoreDep = ...,
):
    """[AUTHZ] Acknowledge/investigate/resolve — steward role or higher."""
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Incident actions require steward role or higher.")
    if body.status not in _VALID_STATUS:
        raise HTTPException(status_code=422, detail=f"Invalid status {body.status!r}")
    incident = store.transition_incident(incident_id, body.status, principal.name, body.note)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id!r} not found")
    return incident


@router.post("/{incident_id}/assign", response_model=IncidentDetailOut)
def assign_incident(
    incident_id: str,
    principal: PrincipalDep,
    body: IncidentAssignIn = Body(...),
    store: StoreDep = ...,
):
    """[AUTHZ] Assign an owner — steward role or higher."""
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Incident actions require steward role or higher.")
    incident = store.assign_incident(incident_id, body.owner, principal.name)
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id!r} not found")
    return incident

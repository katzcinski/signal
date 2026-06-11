from __future__ import annotations

from pydantic import BaseModel


class IncidentEventOut(BaseModel):
    kind: str
    actor: str = ""
    detail: str = ""
    at: str = ""


class IncidentOut(BaseModel):
    id: str
    product: str
    run_id: str = ""
    check_name: str = ""
    severity: str = "fail"
    status: str = "open"
    owner: str = ""
    summary: str = ""
    opened_at: str = ""
    resolved_at: str = ""


class IncidentDetailOut(IncidentOut):
    events: list[IncidentEventOut] = []


class IncidentTransitionIn(BaseModel):
    status: str  # acknowledged | investigating | resolved | open
    note: str = ""


class IncidentAssignIn(BaseModel):
    owner: str

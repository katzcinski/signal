from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


class FamilyStatus(BaseModel):
    status: str = "unknown"  # pass | warn | fail | critical | error | unknown
    passed: int = 0
    total: int = 0


from .run_schemas import RunSummaryOut, RunListItem


class ObjectOut(BaseModel):
    id: str
    name: str
    schema_name: str = ""
    family: str = "quality"
    layer: str = ""
    status: str = "unknown"
    contract_status: str = ""
    cov_flag: str = "out_of_scope"  # covered | partial | gap | out_of_scope
    check_count: int = 0
    owned_by: str = "platform"
    last_run: Optional[str] = None
    last_run_id: Optional[str] = None
    space: str = ""
    # R3-2: per-family status map (family is an attribute of checks, not objects).
    families: dict[str, FamilyStatus] = {}


class ObjectDetailOut(ObjectOut):
    latest_run: Optional[RunSummaryOut] = None
    run_history: list[RunListItem] = []
    contract: Optional[dict[str, Any]] = None

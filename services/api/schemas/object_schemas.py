from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel

from .run_schemas import RunSummaryOut, RunListItem


class ObjectOut(BaseModel):
    id: str
    name: str
    schema_name: str = ""
    family: str = "quality"
    layer: str = ""
    status: str = "unknown"
    contract_status: str = ""
    coverage_flag: str = "○"
    check_count: int = 0
    owned_by: str = "platform"
    last_run: Optional[str] = None
    last_run_id: Optional[str] = None
    space: str = ""


class ObjectDetailOut(ObjectOut):
    latest_run: Optional[RunSummaryOut] = None
    run_history: list[RunListItem] = []
    contract: Optional[dict[str, Any]] = None

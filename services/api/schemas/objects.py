from pydantic import BaseModel
from typing import Optional, List


class ObjectStatusSchema(BaseModel):
    object_name: str
    last_run_id: Optional[str] = None
    last_run_at: Optional[str] = None
    overall_status: Optional[str] = None
    total_checks: int = 0
    passed_checks: int = 0
    failed_checks: int = 0
    warning_checks: int = 0
    compliance: str = "unknown"
    contract_version: str = ""


class CheckHistoryPoint(BaseModel):
    actual_value: Optional[str]
    started_at: str

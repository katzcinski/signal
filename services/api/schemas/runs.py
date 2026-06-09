from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime


class CheckResultSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    check_name: str
    sql_text: Optional[str] = None
    expect_expr: Optional[str] = None
    severity: Optional[str] = None
    passed: Optional[bool] = None
    actual_value: Optional[str] = None
    error_message: Optional[str] = None
    duration_ms: Optional[float] = None
    state: str = "executed"


class RunSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    run_id: str
    dataset: str
    schema_name: str
    started_at: str
    finished_at: Optional[str] = None
    overall_status: Optional[str] = None
    total_checks: int = 0
    passed_checks: int = 0
    failed_checks: int = 0
    warning_checks: int = 0
    triggered_by: str = ""
    contract_version: str = ""
    actor: str = ""
    run_state: str = "finished"


class RunDetailSchema(RunSchema):
    checks: List[CheckResultSchema] = []


class RunTriggerRequest(BaseModel):
    dataset: str
    environment: str = "default"
    execution_mode: str = "live"  # live | dry_run


class RunTriggerResponse(BaseModel):
    run_id: str
    status: str = "accepted"

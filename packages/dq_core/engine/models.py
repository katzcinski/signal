# ENGINE-FROZEN - Do not add framework imports (fastapi/flask/starlette)
from dataclasses import dataclass, field
from typing import Optional, List, Any


@dataclass
class CheckDef:
    name: str
    sql: str
    expect: str
    severity: str = "fail"
    description: str = ""
    timeout_s: int = 30
    enabled: bool = True
    type: str = ""
    unit: str = ""


@dataclass
class DatasetConfig:
    dataset: str
    schema: str
    contract_version: str = ""
    checks: List[CheckDef] = field(default_factory=list)


@dataclass
class CheckResult:
    name: str
    sql: str
    expect: str
    severity: str
    passed: bool
    actual_value: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    diagnostic_rows: List[dict] = field(default_factory=list)
    state: str = "executed"  # executed | skipped_stale | skipped_dependency | downgraded | error


@dataclass
class RunSummary:
    run_id: str
    dataset: str
    schema: str
    started_at: str
    finished_at: str
    overall_status: str
    total: int
    passed: int
    failed: int
    warnings: int
    results: List[CheckResult] = field(default_factory=list)
    triggered_by: str = ""
    contract_version: str = ""
    contract_hash: str = ""
    actor: str = ""
    run_state: str = "finished"  # running | finished | error


VALID_SEVERITIES = {"critical", "fail", "warn"}

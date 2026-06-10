# [ENGINE-FROZEN] — pure dataclasses, zero framework imports
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

VALID_OWNERS: frozenset[str] = frozenset({"platform", "product"})
VALID_SEVERITIES: frozenset[str] = frozenset({"critical", "fail", "warn"})


@dataclass
class CheckDef:
    name: str
    sql: str
    expect: str
    severity: str = "fail"
    description: str = ""
    timeout_s: int = 60
    enabled: bool = True
    type: str = ""
    unit: str = ""
    owned_by: str = "platform"
    # [PII-GATE] WS0-6: Diagnostik nur je Check mit Spalten-Allowlist.
    # Default off — ohne enabled+Allowlist verlassen keine Rohzeilen HANA.
    diagnostics_enabled: bool = False
    diagnostics_columns: list[str] = field(default_factory=list)


@dataclass
class CheckResult:
    name: str
    sql: str
    expect: str
    severity: str
    passed: bool
    actual_value: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: int = 0
    diagnostic_rows: list[dict[str, Any]] = field(default_factory=list)
    # Gating state — never silently omit (G6)
    state: str = "executed"
    # allowed: executed | skipped_stale | skipped_dependency | downgraded | error


@dataclass
class DatasetConfig:
    dataset: str
    schema: str
    contract_version: str = ""
    owned_by: str = "platform"
    checks: list[CheckDef] = field(default_factory=list)


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
    results: list[CheckResult] = field(default_factory=list)
    triggered_by: str = "manual"
    contract_version: str = ""
    contract_hash: str = ""
    actor: str = ""
    run_state: str = "finished"
    # allowed: running | finished | error

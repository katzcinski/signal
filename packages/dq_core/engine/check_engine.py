# ENGINE-FROZEN
import time
import threading
from datetime import datetime, timezone
from typing import Optional, Callable
import uuid

from dq_core.engine.models import DatasetConfig, CheckResult, RunSummary, VALID_SEVERITIES
from dq_core.engine.expectation import evaluate_expectation


class CheckEngine:
    def __init__(self, connection, store=None, on_progress: Optional[Callable] = None):
        self.connection = connection  # must have .execute(sql) -> list of rows
        self.store = store
        self.on_progress = on_progress

    def run_dataset(self, dataset_config: DatasetConfig, triggered_by: str = "manual", actor: str = "") -> RunSummary:
        run_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc).isoformat()
        results = []

        if self.store:
            self.store.update_run_state(run_id, "running")

        for check in dataset_config.checks:
            if not check.enabled:
                results.append(CheckResult(
                    name=check.name, sql=check.sql, expect=check.expect,
                    severity=check.severity, passed=True, state="skipped_dependency",
                ))
                continue
            result = self._run_check(check, dataset_config.schema, run_id)
            results.append(result)
            if self.on_progress:
                try:
                    self.on_progress(run_id, check.name, result)
                except Exception:
                    pass

        finished_at = datetime.now(timezone.utc).isoformat()
        passed = sum(1 for r in results if r.passed and r.state == "executed")
        failed = sum(1 for r in results if not r.passed and r.severity in ("fail", "critical"))
        warnings = sum(1 for r in results if not r.passed and r.severity == "warn")

        if any(r.severity == "critical" and not r.passed for r in results):
            overall_status = "critical"
        elif any(r.severity in ("fail", "critical") and not r.passed for r in results):
            overall_status = "fail"
        elif any(r.severity == "warn" and not r.passed for r in results):
            overall_status = "warn"
        else:
            overall_status = "pass"

        summary = RunSummary(
            run_id=run_id,
            dataset=dataset_config.dataset,
            schema=dataset_config.schema,
            started_at=started_at,
            finished_at=finished_at,
            overall_status=overall_status,
            total=len(results),
            passed=passed,
            failed=failed,
            warnings=warnings,
            results=results,
            triggered_by=triggered_by,
            contract_version=dataset_config.contract_version,
            actor=actor,
            run_state="finished",
        )

        if self.store:
            self.store.save_run(summary)

        return summary

    def _run_check(self, check, schema: str, run_id: str) -> CheckResult:
        start = time.monotonic()
        sql = check.sql.replace("{schema}", schema)
        try:
            rows = self.connection.execute(sql)
            actual_value = rows[0][0] if rows else None
            previous_value = None
            if self.store:
                hist = self.store.get_previous_actuals(schema, check.name, limit=1)
                if hist:
                    previous_value = hist[0].get("actual_value")
            passed = evaluate_expectation(check.expect, actual_value, previous_value)
            duration_ms = (time.monotonic() - start) * 1000
            return CheckResult(
                name=check.name, sql=check.sql, expect=check.expect,
                severity=check.severity, passed=passed,
                actual_value=actual_value, duration_ms=duration_ms,
                state="executed",
            )
        except Exception as e:
            duration_ms = (time.monotonic() - start) * 1000
            return CheckResult(
                name=check.name, sql=check.sql, expect=check.expect,
                severity=check.severity, passed=False,
                error=str(e), duration_ms=duration_ms, state="error",
            )

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..deps import StoreDep
from ..schemas.run_schemas import RunSummaryOut, RunListItem, CheckResultOut

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _result_out(row: dict) -> CheckResultOut:
    """Map a raw dq_check_results row to the API/FE field names."""
    return CheckResultOut(
        name=row.get("check_name", ""),
        sql=row.get("sql_text", "") or "",
        expect=row.get("expect_expr", "") or "",
        severity=row.get("severity", "fail"),
        passed=bool(row.get("passed")),
        actual_value=row.get("actual_value"),
        error=row.get("error_message"),
        duration_ms=row.get("duration_ms", 0) or 0,
        state=row.get("state", "executed"),
    )


def _run_out(run: dict) -> RunSummaryOut:
    """Normalise a raw dq_runs row (+ results) into the FE-facing schema."""
    return RunSummaryOut(
        run_id=run["run_id"],
        dataset=run.get("dataset", ""),
        schema_name=run.get("schema_name", ""),
        started_at=run.get("started_at", "") or "",
        finished_at=run.get("finished_at", "") or "",
        overall_status=run.get("overall_status", "pass"),
        total=run.get("total_checks", 0) or 0,
        passed=run.get("passed_checks", 0) or 0,
        failed=run.get("failed_checks", 0) or 0,
        warnings=run.get("warning_checks", 0) or 0,
        triggered_by=run.get("triggered_by", "manual"),
        contract_version=run.get("contract_version", "") or "",
        contract_hash=run.get("contract_hash", "") or "",
        actor=run.get("actor", "") or "",
        run_state=run.get("run_state", "finished"),
        results=[_result_out(r) for r in run.get("results", [])],
    )


@router.get("", response_model=list[RunListItem])
def list_runs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    store: StoreDep = ...,
):
    runs = store.get_all_runs(limit=limit + offset)[offset:]
    return [RunListItem(**{k: v for k, v in r.items() if k in RunListItem.model_fields}) for r in runs]


@router.get("/{run_id}", response_model=RunSummaryOut)
def get_run(run_id: str, store: StoreDep = ...):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return _run_out(run)


@router.get("/{run_id}/events")
def get_run_events(run_id: str, store: StoreDep = ...):
    """Polling fallback for SSE (A5): returns persisted progress lines."""
    import sqlite3
    from pathlib import Path
    db_path = store.db_path
    if not Path(db_path).exists():
        return []
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT ts, line FROM dq_run_progress WHERE run_id=? ORDER BY id",
        (run_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

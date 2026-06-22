from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..auth.provider import PrincipalDep
from ..deps import StoreDep
from ..schemas.run_schemas import RunSummaryOut, RunListItem, CheckResultOut

router = APIRouter(prefix="/api/runs", tags=["runs"])

# Normalised per-check status used for the regression diff (UX-N5). Gating
# states (skipped/downgraded) never collapse into pass/fail (G6).
_STATUS_RANK = {"pass": 0, "skipped": 0, "warn": 1, "fail": 2, "error": 3}


def _check_status(res: CheckResultOut) -> str:
    if res.state == "error":
        return "error"
    if res.state in ("skipped_stale", "skipped_dependency"):
        return "skipped"
    if res.passed:
        return "pass"
    return "warn" if res.severity == "warn" else "fail"


def _transition(base: str | None, head: str | None) -> str:
    """Classify a per-check status change between two runs (base → head)."""
    if base is None:
        return "added"
    if head is None:
        return "removed"
    if base == head:
        return "unchanged"
    base_rank = _STATUS_RANK.get(base, 0)
    head_rank = _STATUS_RANK.get(head, 0)
    if head_rank > base_rank:
        return "regressed"
    if head_rank < base_rank:
        return "recovered"
    return "changed"


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
        type=row.get("check_type", "") or "",
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
    runs = store.get_all_runs(limit=limit, offset=offset)
    return [RunListItem(**{k: v for k, v in r.items() if k in RunListItem.model_fields}) for r in runs]


def _compare_header(run: dict) -> dict:
    return {
        "run_id": run["run_id"],
        "dataset": run.get("dataset", ""),
        "started_at": run.get("started_at", "") or "",
        "finished_at": run.get("finished_at", "") or "",
        "overall_status": run.get("overall_status", "pass"),
        "total": run.get("total_checks", 0) or 0,
        "passed": run.get("passed_checks", 0) or 0,
        "failed": run.get("failed_checks", 0) or 0,
        "warnings": run.get("warning_checks", 0) or 0,
    }


@router.get("/compare")
def compare_runs(
    base: str = Query(..., description="Baseline run_id (earlier)"),
    head: str = Query(..., description="Comparison run_id (later)"),
    store: StoreDep = ...,
):
    """UX-N5: regression diff of two runs — per-check status transitions
    (newly red vs. recovered). Server-authoritative so the FE only renders."""
    base_run = store.get_run(base)
    if not base_run:
        raise HTTPException(status_code=404, detail=f"Run {base!r} not found")
    head_run = store.get_run(head)
    if not head_run:
        raise HTTPException(status_code=404, detail=f"Run {head!r} not found")

    base_status = {r.name: _check_status(r) for r in (_result_out(x) for x in base_run.get("results", []))}
    head_status = {r.name: _check_status(r) for r in (_result_out(x) for x in head_run.get("results", []))}

    changes = []
    summary = {"regressed": 0, "recovered": 0, "added": 0, "removed": 0, "changed": 0, "unchanged": 0}
    for name in sorted(base_status.keys() | head_status.keys()):
        b = base_status.get(name)
        h = head_status.get(name)
        transition = _transition(b, h)
        summary[transition] = summary.get(transition, 0) + 1
        changes.append({
            "check_name": name,
            "base_status": b,
            "head_status": h,
            "transition": transition,
        })

    return {
        "base": _compare_header(base_run),
        "head": _compare_header(head_run),
        "summary": summary,
        "changes": changes,
    }


@router.get("/{run_id}", response_model=RunSummaryOut)
def get_run(run_id: str, store: StoreDep = ...):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return _run_out(run)


@router.get("/{run_id}/results", response_model=list[CheckResultOut])
def get_run_results(run_id: str, store: StoreDep = ...):
    """WS1-2: nur die Check-Ergebnisse eines Runs (ohne Run-Header)."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return [_result_out(r) for r in run.get("results", [])]


@router.get("/{run_id}/diagnostics")
def get_run_diagnostics(
    run_id: str,
    principal: PrincipalDep,
    check_name: str | None = Query(default=None),
    store: StoreDep = ...,
):
    """[PII-GATE] Diagnostik-Zeilen (bereits allowlist-projiziert persistiert).

    Defense-in-depth: Rohzeilen-Sicht erfordert steward+ — viewer sieht
    Skalare, nie Datensätze.
    """
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Diagnostics require steward role or higher.")
    if not store.get_run(run_id):
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return store.get_diagnostics(run_id, check_name)


@router.get("/{run_id}/events")
def get_run_events(run_id: str, store: StoreDep = ...):
    """Polling fallback for SSE (A5): returns persisted progress lines."""
    return store.get_progress(run_id)

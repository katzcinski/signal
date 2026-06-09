from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..deps import StoreDep
from ..schemas.run_schemas import RunSummaryOut, RunListItem, CheckResultOut

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("", response_model=list[RunListItem])
def list_runs(store: StoreDep = ...):
    runs = store.get_all_runs(limit=200)
    return [RunListItem(**{k: v for k, v in r.items() if k in RunListItem.model_fields}) for r in runs]


@router.get("/{run_id}")
def get_run(run_id: str, store: StoreDep = ...):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    return run


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

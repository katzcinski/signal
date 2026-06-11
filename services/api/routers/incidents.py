from __future__ import annotations

import sqlite3
from fastapi import APIRouter, Query

from ..deps import StoreDep

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("")
def list_incidents(
    severity: str | None = Query(default=None),
    dataset: str | None = Query(default=None),
    store: StoreDep = ...,
):
    """Derived view: breached dq_results within last 7 days (not a separate store)."""
    conn = sqlite3.connect(store.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row

    where_clauses = [
        "cr.passed = 0",
        "cr.severity IN ('critical', 'fail')",
        "r.started_at >= datetime('now', '-7 days')",
        "r.run_state = 'finished'",
    ]
    params: list = []
    if severity:
        where_clauses.append("cr.severity = ?")
        params.append(severity)
    if dataset:
        where_clauses.append("r.dataset = ?")
        params.append(dataset)

    sql = f"""
        SELECT
          cr.check_name,
          r.dataset,
          cr.severity,
          cr.expect_expr,
          cr.actual_value,
          cr.error_message,
          cr.state,
          r.run_id,
          r.started_at,
          r.schema_name
        FROM dq_check_results cr
        JOIN dq_runs r ON cr.run_id = r.run_id
        WHERE {' AND '.join(where_clauses)}
        ORDER BY r.started_at DESC
        LIMIT 200
    """
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    # Stabile id für FE-Row-Keys (run_id × check_name ist eindeutig je Lauf).
    return [{**dict(r), "id": f"{r['run_id']}:{r['check_name']}"} for r in rows]

"""Server-Sent Events (F2/A5): run state lives in the DB — SSE streams it.

Kein geteilter In-Memory-Zustand mehr (S-9): jeder SSE-Consumer liest mit
eigenem Cursor aus `dq_run_progress` + `dq_runs`. Damit liefern SSE und
Polling dieselbe Wahrheit und das Verhalten ist bei ≥2 Workern identisch.

Event-Typen: connected | run_started | progress | run_finished | run_error
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
from typing import Any, AsyncGenerator

_POLL_INTERVAL_S = 0.5
_KEEPALIVE_EVERY = 30  # Polls zwischen Keepalives


def _fetch_progress(db_path: str, run_id: str, after_id: int) -> list[sqlite3.Row]:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT id, ts, line FROM dq_run_progress WHERE run_id=? AND id>? ORDER BY id",
            (run_id, after_id),
        ).fetchall()
    finally:
        conn.close()


def _fetch_run(db_path: str, run_id: str) -> sqlite3.Row | None:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT run_id, dataset, run_state, overall_status FROM dq_runs WHERE run_id=?",
            (run_id,),
        ).fetchone()
    finally:
        conn.close()


def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def sse_generator(db_path: str, run_id: str) -> AsyncGenerator[str, None]:
    """Streamt Progress + Terminalzustand eines Runs aus dem Store."""
    yield _sse({"type": "connected", "run_id": run_id})

    run = await asyncio.to_thread(_fetch_run, db_path, run_id)
    if run is not None:
        yield _sse({"type": "run_started", "run_id": run_id, "dataset": run["dataset"]})

    cursor = 0
    idle = 0
    while True:
        rows = await asyncio.to_thread(_fetch_progress, db_path, run_id, cursor)
        for row in rows:
            cursor = row["id"]
            yield _sse({"type": "progress", "run_id": run_id, "ts": row["ts"], "line": row["line"]})

        run = await asyncio.to_thread(_fetch_run, db_path, run_id)
        state = run["run_state"] if run is not None else None
        if state == "finished":
            yield _sse({"type": "run_finished", "run_id": run_id,
                        "overall_status": run["overall_status"]})
            return
        if state == "error":
            yield _sse({"type": "run_error", "run_id": run_id,
                        "error": "Run failed — see progress log."})
            return

        idle += 1
        if idle >= _KEEPALIVE_EVERY:
            idle = 0
            yield ": keepalive\n\n"
        await asyncio.sleep(_POLL_INTERVAL_S)


def make_progress_callback(run_id: str, store: Any) -> Any:
    """Return an on_progress callback that persists progress lines (A5).

    SSE-Consumer lesen dieselben Zeilen über ihren Cursor — kein Push-Kanal.
    """
    from datetime import datetime, timezone

    def callback(line: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        try:
            conn = sqlite3.connect(store.db_path, check_same_thread=False)
            conn.execute(
                "INSERT INTO dq_run_progress(run_id, ts, line) VALUES (?,?,?)",
                (run_id, now, line),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

    return callback

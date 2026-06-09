"""Server-Sent Events broadcast (F2/A5): run state lives in DB, SSE is push enhancement."""
from __future__ import annotations

import json
import queue
import threading
from typing import Any, Generator

# Module-level queue — works for single-process dev; for multi-worker prod use Redis pub/sub
_event_queue: queue.SimpleQueue[dict[str, Any]] = queue.SimpleQueue()
_lock = threading.Lock()


def push_event(event: dict[str, Any]) -> None:
    _event_queue.put_nowait(event)


def sse_generator(run_id: str | None = None) -> Generator[str, None, None]:
    """Yields SSE-formatted lines. Filtered to run_id if provided."""
    yield "data: {\"type\":\"connected\"}\n\n"
    while True:
        try:
            event = _event_queue.get(timeout=30)
            if run_id is None or event.get("run_id") == run_id:
                yield f"data: {json.dumps(event)}\n\n"
            else:
                # Put it back for other consumers — broadcast pattern
                _event_queue.put_nowait(event)
        except queue.Empty:
            yield ": keepalive\n\n"


def make_progress_callback(run_id: str, store: Any) -> Any:
    """Return an on_progress callback that pushes to SSE AND persists to DB."""
    from datetime import datetime, timezone

    def callback(line: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        # Persist for polling fallback (A5)
        try:
            import sqlite3
            conn = sqlite3.connect(store.db_path, check_same_thread=False)
            conn.execute(
                "INSERT INTO dq_run_progress(run_id, ts, line) VALUES (?,?,?)",
                (run_id, now, line),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
        push_event({"type": "progress", "run_id": run_id, "ts": now, "line": line})

    return callback

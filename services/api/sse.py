import asyncio
import json
from typing import AsyncGenerator


async def run_progress_stream(store, run_id: str) -> AsyncGenerator[str, None]:
    """
    SSE generator for run progress events.
    Polls store for new progress lines and yields them as SSE.
    """
    last_id = 0
    max_polls = 300  # 5 minutes at 1s poll

    for _ in range(max_polls):
        lines = store.get_run_progress(run_id, after_id=last_id)
        for line in lines:
            last_id = line["id"]
            data = json.dumps({"ts": line["ts"], "line": line["line"]})
            yield f"data: {data}\n\n"

        run = store.get_run_detail(run_id)
        if run and run.get("run_state") in ("finished", "error"):
            yield f"data: {json.dumps({'event': 'done', 'run_state': run['run_state']})}\n\n"
            return

        await asyncio.sleep(1)

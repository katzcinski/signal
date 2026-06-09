from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..sse import sse_generator

router = APIRouter(prefix="/api/stream", tags=["stream"])


@router.get("")
def stream_events(run_id: str | None = None):
    """SSE endpoint — filtered to run_id if provided. Polling fallback: /api/runs/{id}/events"""
    return StreamingResponse(
        sse_generator(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx proxy buffering disable
        },
    )

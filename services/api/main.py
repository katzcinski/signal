"""FastAPI application factory. [ENGINE-FROZEN] dq_core is never modified here."""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure dq_core is importable
_root = Path(__file__).resolve().parents[2]
for _pkg in [str(_root / "packages"), str(_root)]:
    if _pkg not in sys.path:
        sys.path.insert(0, _pkg)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .settings import get_settings
from .routers import library, objects, runs, lineage, contracts, incidents, proposals, stream


def create_app() -> FastAPI:
    settings = get_settings()

    # S5: fail-closed — if binding to 0.0.0.0 without auth, refuse to start
    if settings.bind_host == "0.0.0.0" and settings.auth_mode == "noauth":
        raise RuntimeError(
            "SECURITY: bind_host=0.0.0.0 requires AUTH_MODE != 'noauth'. "
            "Set AUTH_MODE=oidc or keep BIND_HOST=127.0.0.1."
        )

    app = FastAPI(
        title="DQ & Observability Cockpit API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # RFC-7807 error format
    @app.exception_handler(Exception)
    async def _generic_error(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={
                "type": "about:blank",
                "title": "Internal Server Error",
                "detail": str(exc),
                "status": 500,
            },
        )

    for router in [library.router, objects.router, runs.router, lineage.router,
                   contracts.router, incidents.router, proposals.router, stream.router]:
        app.include_router(router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run("services.api.main:app", host=settings.bind_host, port=settings.bind_port, reload=settings.debug)

import sys
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from services.api.settings import settings

# Fail-closed: block 0.0.0.0 with noauth (S5)
if settings.BIND_HOST == "0.0.0.0" and settings.AUTH_MODE == "noauth":
    print("ERROR: BIND_HOST=0.0.0.0 is only allowed when AUTH_MODE != noauth. Aborting.", file=sys.stderr)
    sys.exit(1)

app = FastAPI(
    title="DQ Cockpit API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "type": "about:blank",
            "title": "Internal Server Error",
            "detail": str(exc),
            "status": 500,
        },
        media_type="application/problem+json",
    )


from services.api.routers import objects, runs, contracts, library, extract

app.include_router(objects.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(contracts.router, prefix="/api")
app.include_router(library.router, prefix="/api")
app.include_router(extract.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}

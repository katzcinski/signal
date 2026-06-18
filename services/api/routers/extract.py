"""Extract / inventory endpoints (WS1-2, WS2-6).

The analyzer chain extracts inventory and lineage snapshots from Datasphere when
connectivity is configured. In local mode we serve and refresh the snapshot files
on disk. `/inventory` backs the contract-editor object/column picker; lineage is
served by the dedicated `lineage` router.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field

from ..auth.provider import Principal, PrincipalDep, require_roles
from ..deps import StoreDep, get_inventory, get_lineage

router = APIRouter(prefix="/api", tags=["extract"])
require_admin = require_roles("admin")


class ExtractIn(BaseModel):
    """Phase-1 trigger payload for the admin inventory tool."""

    environment: str | None = Field(default=None)
    profile: str | None = Field(default=None)
    spaces: list[str] = Field(default_factory=list)
    include_sql: bool = Field(default=True)
    force: bool = Field(default=False)


_LATEST_STATUS: dict[str, Any] | None = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _artifact_paths(settings: Any) -> dict[str, str]:
    return {
        "inventory": str(settings.inventory_file),
        "lineage": str(settings.lineage_file),
    }


def _snapshot_timestamp(settings: Any) -> str | None:
    mtimes = [
        Path(fpath).stat().st_mtime
        for fpath in (settings.inventory_file, settings.lineage_file)
        if Path(fpath).exists()
    ]
    if not mtimes:
        return None
    return datetime.fromtimestamp(max(mtimes), tz=timezone.utc).isoformat()


def _counts(inventory: list[dict], lineage: dict) -> dict[str, int]:
    return {
        "lineage_nodes": len(lineage.get("nodes", [])),
        "lineage_edges": len(lineage.get("edges", [])),
        "inventory_items": len(inventory),
    }


def _status_payload(
    *,
    job_id: str | None,
    status: str,
    environment: str,
    profile: str | None,
    spaces: list[str],
    source: str,
    current_step: str,
    counts: dict[str, int],
    settings: Any,
    started_at: str | None = None,
    updated_at: str | None = None,
    finished_at: str | None = None,
    warnings: list[str] | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "status": status,
        "environment": environment,
        "profile": profile or environment,
        "spaces": spaces,
        "source": source,
        "started_at": started_at,
        "updated_at": updated_at or _utc_now_iso(),
        "finished_at": finished_at,
        "current_step": current_step,
        "counts": counts,
        "warnings": warnings or [],
        "error": error,
        "runtime_artifact_paths": _artifact_paths(settings),
        "published_snapshot_timestamp": _snapshot_timestamp(settings),
    }


@router.post("/extract")
def trigger_extract(
    body: ExtractIn | None = Body(default=None),
    environment: str = Query(default="default"),
    principal: Principal = require_admin,
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
    lineage: dict = Depends(get_lineage),
):
    """Extract inventory/lineage and report counts.

    FastAPI runs this sync handler in a threadpool, so the blocking I/O does not
    stall the event loop. The response keeps the legacy top-level count fields
    while also returning the richer status shape used by the Phase-1 admin UI.
    """
    import os

    from ..extraction import run_extraction
    from ..settings import get_settings

    settings = get_settings()
    selected_environment = (body.environment if body and body.environment else environment) or "default"
    profile = body.profile if body else None
    spaces = body.spaces if body else []
    job_id = str(uuid4())
    started_at = _utc_now_iso()

    counts = _counts(inventory, lineage)
    source = "local"
    global _LATEST_STATUS
    _LATEST_STATUS = _status_payload(
        job_id=job_id,
        status="running",
        environment=selected_environment,
        profile=profile,
        spaces=spaces,
        source=source,
        current_step="starting",
        counts=counts,
        settings=settings,
        started_at=started_at,
    )

    try:
        result = run_extraction(settings)
    except Exception as exc:  # noqa: BLE001 - surface extraction failure, never 500 silently
        error = f"Extraction failed: {exc}"
        _LATEST_STATUS = _status_payload(
            job_id=job_id,
            status="failed",
            environment=selected_environment,
            profile=profile,
            spaces=spaces,
            source="datasphere",
            current_step="failed",
            counts=counts,
            settings=settings,
            started_at=started_at,
            finished_at=_utc_now_iso(),
            error=error,
        )
        return {
            **_LATEST_STATUS,
            "extracted_at": None,
            "source": "datasphere",
            "inventory_items": counts["inventory_items"],
            "lineage_nodes": counts["lineage_nodes"],
            "lineage_edges": counts["lineage_edges"],
        }

    warnings: list[str] = []
    if result is not None:
        source = "datasphere"
        counts = {
            "lineage_nodes": result["lineage_nodes"],
            "lineage_edges": result["lineage_edges"],
            "inventory_items": result["inventory_items"],
            "column_edges": result["column_edges"],
        }
    else:
        warnings = ["No live extraction source configured; refreshed local snapshot timestamps."]

    now_ts = datetime.now(timezone.utc).timestamp()
    for fpath in (settings.inventory_file, settings.lineage_file):
        path = Path(fpath)
        if path.exists():
            os.utime(path, (now_ts, now_ts))

    extracted_at = datetime.fromtimestamp(now_ts, tz=timezone.utc).isoformat()
    _LATEST_STATUS = _status_payload(
        job_id=job_id,
        status="succeeded",
        environment=selected_environment,
        profile=profile,
        spaces=spaces,
        source=source,
        current_step="published_snapshot",
        counts=counts,
        settings=settings,
        started_at=started_at,
        updated_at=extracted_at,
        finished_at=extracted_at,
        warnings=warnings,
    )
    return {
        **_LATEST_STATUS,
        "extracted_at": extracted_at,
        "source": source,
        **counts,
    }


@router.get("/extract/status")
def extract_status(
    principal: PrincipalDep,
    inventory: list[dict] = Depends(get_inventory),
    lineage: dict = Depends(get_lineage),
):
    """Latest extract status for the platform-admin inventory tool."""
    from ..settings import get_settings

    settings = get_settings()
    if _LATEST_STATUS is not None:
        return {
            **_LATEST_STATUS,
            "can_trigger": principal.has_role("admin"),
        }

    snapshot_ts = _snapshot_timestamp(settings)
    status = "succeeded" if snapshot_ts else "idle"
    return {
        **_status_payload(
            job_id=None,
            status=status,
            environment="default",
            profile="default",
            spaces=[],
            source="local",
            current_step="snapshot_loaded" if snapshot_ts else "waiting_for_first_extract",
            counts=_counts(inventory, lineage),
            settings=settings,
            finished_at=snapshot_ts,
        ),
        "can_trigger": principal.has_role("admin"),
    }


@router.get("/inventory")
def list_inventory(inventory: list[dict] = Depends(get_inventory)):
    """Object/column picker source for the ContractEditor autocomplete (U2)."""
    return {"datasets": inventory}


@router.get("/environments")
def list_environments():
    """Environment names for the RunTriggerDialog, never credentials (S-13)."""
    import yaml

    from ..settings import get_settings

    path = Path(get_settings().environments_file)
    if not path.exists():
        return {"environments": []}
    envs = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {
        "environments": [
            {"name": name, "schema": (cfg or {}).get("schema", "")}
            for name, cfg in envs.items()
        ]
    }

"""Extract / inventory endpoints (WS1-2, WS2-6).

The analyzer chain (lineage + inventory extraction from HANA) is the documented
placeholder (F5): in local mode we serve the snapshot files on disk. `/inventory`
backs the contract-editor object/column picker (U2); the lineage graph itself is
served by the dedicated `lineage` router.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth.provider import PrincipalDep
from ..deps import StoreDep, get_environment, get_inventory, get_lineage

router = APIRouter(prefix="/api", tags=["extract"])


@router.post("/extract")
def trigger_extract(
    environment: str = "default",
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
    lineage: dict = Depends(get_lineage),
):
    """Extract inventory/lineage from Datasphere (when configured) and report counts.

    Tier-2: when a live source (REST catalog or the @sap/datasphere-cli) is
    configured, run the real extraction — pull objects with columns + CSN,
    assemble the inventory, build the object + column lineage, and write the
    Meridian-shaped snapshots. FastAPI runs this sync handler in a threadpool,
    so the blocking I/O does not stall the event loop.

    F5 fallback: with no connectivity configured (local mode), touch the
    snapshot files to reset the mtime-based staleness clock. Either way the
    response carries the new extraction timestamp for the staleness indicator.
    """
    import os
    from datetime import datetime, timezone
    from pathlib import Path
    from ..extraction import run_extraction
    from ..settings import get_settings

    settings = get_settings()

    counts = {
        "lineage_nodes": len(lineage.get("nodes", [])),
        "lineage_edges": len(lineage.get("edges", [])),
        "inventory_items": len(inventory),
    }
    source = "local"
    try:
        result = run_extraction(settings)
    except Exception as exc:  # noqa: BLE001 — surface extraction failure, never 500 silently
        return {
            "environment": environment,
            "extracted_at": None,
            "source": "datasphere",
            "error": f"Extraction failed: {exc}",
            **counts,
        }

    if result is not None:
        # Real extraction wrote fresh snapshots — report the new counts.
        source = "datasphere"
        counts = {
            "lineage_nodes": result["lineage_nodes"],
            "lineage_edges": result["lineage_edges"],
            "inventory_items": result["inventory_items"],
            "column_edges": result["column_edges"],
        }

    now_ts = datetime.now(timezone.utc).timestamp()
    for fpath in (settings.inventory_file, settings.lineage_file):
        p = Path(fpath)
        if p.exists():
            os.utime(p, (now_ts, now_ts))

    extracted_at = datetime.fromtimestamp(now_ts, tz=timezone.utc).isoformat()
    return {
        "environment": environment,
        "extracted_at": extracted_at,
        "source": source,
        **counts,
    }


@router.get("/inventory")
def list_inventory(inventory: list[dict] = Depends(get_inventory)):
    """Object/column picker source for the ContractEditor autocomplete (U2)."""
    return {"datasets": inventory}


@router.get("/environments")
def list_environments():
    """Environment-Namen für den RunTriggerDialog — NIE Credentials (S-13)."""
    import yaml
    from pathlib import Path
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


@router.post("/environments/{name}/test", status_code=status.HTTP_202_ACCEPTED)
def test_environment_connection(
    name: str,
    principal: PrincipalDep,
    store: StoreDep = ...,
):
    """Start a live HANA/Datasphere connection test for an environment."""
    import json
    import threading
    import uuid

    from dq_core.connect.db_connection import check_connection
    from ..sse import make_progress_callback

    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Connection tests require steward role or higher.")

    env_cfg = get_environment(name)
    if env_cfg is None:
        raise HTTPException(status_code=422, detail=f"Unknown environment {name!r}")

    op_id = str(uuid.uuid4())
    if not store.begin_operation(op_id, "connection_test", created_by=principal.sub):
        raise HTTPException(status_code=409, detail="Operation already exists.")

    def _worker() -> None:
        callback = make_progress_callback(op_id, store)
        try:
            result = check_connection(
                host=env_cfg.get("host", ""),
                port=int(env_cfg.get("port", 443)),
                user=env_cfg.get("user", ""),
                password=env_cfg.get("password", ""),
                schema=env_cfg.get("schema", ""),
                encrypt=bool(env_cfg.get("encrypt", True)),
                validate_cert=bool(env_cfg.get("validate_cert", True)),
                on_progress=callback,
                environment_name=name,
            )
            store.finish_operation(op_id, "finished", result_json=json.dumps(result))
        except Exception:  # noqa: BLE001 - internals stay out of the API result
            store.finish_operation(
                op_id,
                "error",
                error="Connection test failed to complete.",
            )

    threading.Thread(target=_worker, daemon=True).start()
    return {"op_id": op_id}

"""Extract / inventory endpoints (WS1-2, WS2-6).

The analyzer chain (lineage + inventory extraction from HANA) is the documented
placeholder (F5): in local mode we serve the snapshot files on disk. `/inventory`
backs the contract-editor object/column picker (U2); the lineage graph itself is
served by the dedicated `lineage` router.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import StoreDep, get_inventory, get_lineage

router = APIRouter(prefix="/api", tags=["extract"])


@router.post("/extract")
def trigger_extract(
    environment: str = "default",
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
    lineage: dict = Depends(get_lineage),
):
    """Reload inventory/lineage snapshots and report counts (analyzer placeholder)."""
    return {
        "environment": environment,
        "lineage_nodes": len(lineage.get("nodes", [])),
        "lineage_edges": len(lineage.get("edges", [])),
        "inventory_items": len(inventory),
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

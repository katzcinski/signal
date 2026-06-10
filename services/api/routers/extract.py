import sys
import os
import json
from fastapi import APIRouter, Depends

from services.api.deps import get_store, get_principal
from services.api.settings import settings

router = APIRouter(tags=["extract"])

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages"))


@router.post("/extract")
def trigger_extract(environment: str = "default", store=Depends(get_store)):
    """Load lineage.json and inventory.json from disk (analyzer chain placeholder)."""
    lineage = {}
    if os.path.exists(settings.LINEAGE_FILE):
        with open(settings.LINEAGE_FILE) as f:
            lineage = json.load(f)

    inventory = {}
    if os.path.exists(settings.INVENTORY_FILE):
        with open(settings.INVENTORY_FILE) as f:
            inventory = json.load(f)

    return {
        "lineage_nodes": len(lineage.get("nodes", [])),
        "lineage_edges": len(lineage.get("edges", [])),
        "inventory_items": len(inventory) if isinstance(inventory, (list, dict)) else 0,
    }


@router.get("/inventory")
def get_inventory():
    """Object/column picker for ContractEditor autocomplete."""
    if not os.path.exists(settings.INVENTORY_FILE):
        return {"datasets": []}
    with open(settings.INVENTORY_FILE) as f:
        data = json.load(f)
    if isinstance(data, list):
        return {"datasets": data}
    return {"datasets": list(data.values()) if isinstance(data, dict) else []}


@router.get("/lineage/graph")
def get_lineage_graph(store=Depends(get_store)):
    """Return lineage graph with coverage annotations."""
    from dq_core.lineage.analyzer_loader import LineageAnalyzer

    analyzer = LineageAnalyzer(settings.LINEAGE_FILE)
    nodes = analyzer.get_nodes()
    edges = analyzer.get_edges()
    contracts = {c["product"]: c for c in store.list_contracts()}

    annotated_nodes = []
    for node in nodes:
        name = node.get("id") or node.get("technicalName", "")
        has_contract = name in contracts
        coverage = "✓" if has_contract else "⚠"
        annotated_nodes.append({**node, "coverage": coverage, "has_contract": has_contract})

    return {
        "nodes": annotated_nodes,
        "edges": edges,
        "extract_age_seconds": analyzer.get_extract_age_seconds(),
    }

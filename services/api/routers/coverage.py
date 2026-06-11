"""R4-4: coverage metrics — how much of the estate is under an active contract,
compiled, and recently validated. Object-level (GX-style)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends

from ..deps import StoreDep, get_inventory
from ..settings import get_settings

router = APIRouter(prefix="/api/coverage", tags=["coverage"])

_STALE_DAYS = 30


def _active_contract_datasets() -> dict[str, dict[str, Any]]:
    """Map dataset/product → contract data for active contracts only."""
    contracts_dir = Path(get_settings().contracts_dir)
    out: dict[str, dict[str, Any]] = {}
    if not contracts_dir.exists():
        return out
    for path in sorted(contracts_dir.glob("*.y*ml")):
        if path.name.endswith(".active.yml"):
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if data.get("lifecycle") != "active":
            continue
        dataset = data.get("dataset") or data.get("product") or path.stem
        out[dataset] = data
        if data.get("product"):
            out[data["product"]] = data
    return out


def _compiled_datasets() -> set[str]:
    checks_dir = Path(get_settings().checks_dir)
    if not checks_dir.exists():
        return set()
    return {p.stem for p in checks_dir.glob("*.y*ml")}


def _object_id(obj: dict[str, Any]) -> str:
    return obj.get("id") or obj.get("technicalName") or obj.get("name") or ""


@router.get("/summary")
def coverage_summary(
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    active = _active_contract_datasets()
    compiled = _compiled_datasets()

    # Last finished run per dataset (for staleness).
    status_rows = {r["dataset"]: r for r in store.get_object_status()}

    total = len(inventory)
    with_contract = 0
    with_checks = 0
    stale: list[str] = []
    unvalidated: list[dict[str, Any]] = []

    for obj in inventory:
        oid = _object_id(obj)
        has_contract = oid in active
        has_checks = oid in compiled
        if has_contract:
            with_contract += 1
        if has_checks:
            with_checks += 1
        row = status_rows.get(oid)
        last_run = (row or {}).get("last_run") or (row or {}).get("last_run_id")
        if has_contract and not last_run:
            stale.append(oid)
        if not has_contract:
            unvalidated.append({
                "object": oid,
                "layer": obj.get("layer", ""),
                "space": obj.get("space", ""),
            })

    pct = lambda n: round(100.0 * n / total, 1) if total else 0.0
    return {
        "total_objects": total,
        "objects_with_contract": with_contract,
        "objects_with_checks": with_checks,
        "pct_with_contract": pct(with_contract),
        "pct_with_checks": pct(with_checks),
        "stale_objects": stale,
        "stale_threshold_days": _STALE_DAYS,
        "unvalidated": unvalidated,
    }

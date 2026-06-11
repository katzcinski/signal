"""Coverage-Metriken (R4-4) + Status-Badge (R4-5).

Coverage nach GX-Cloud-Vorbild: % Objekte mit aktivem Contract / mit Checks,
Objekte >30 Tage unvalidiert. Badge = dbt-Health-Tile-Analogon (SVG/JSON,
read-only) zur Einbettung in SAC/Confluence.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from ..deps import StoreDep, get_inventory
from ..settings import get_settings

router = APIRouter(prefix="/api", tags=["metrics"])

_BADGE_COLORS = {
    "compliant": "#2da44e",
    "breached": "#d1242f",
    "unknown": "#6e7781",
}


@router.get("/coverage/summary")
def coverage_summary(
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    settings = get_settings()
    object_ids = [
        o.get("id") or o.get("technicalName") or o.get("name") or ""
        for o in inventory
    ]
    object_ids = [o for o in object_ids if o]

    # Aktive Contracts je Produkt (Identitäts-Join: product == technicalName)
    active_products: set[str] = set()
    contracts_dir = Path(settings.contracts_dir)
    if contracts_dir.exists():
        for path in contracts_dir.glob("*.y*ml"):
            if path.name.endswith(".active.yml"):
                continue
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except Exception:
                continue
            if data.get("lifecycle") == "active":
                active_products.add(data.get("product") or path.stem)

    checks_dir = Path(settings.checks_dir)
    with_checks = {
        obj_id for obj_id in object_ids
        if (checks_dir / obj_id / "checks.yml").exists()
        or (checks_dir / f"{obj_id}.yml").exists()
    }

    # Unvalidiert >30d: kein Lauf oder letzter Lauf älter als 30 Tage
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    last_runs = {s["dataset"]: s.get("last_run") for s in store.get_object_status()}
    unvalidated = sorted(
        obj_id for obj_id in object_ids
        if not last_runs.get(obj_id) or str(last_runs[obj_id]) < cutoff
    )

    total = len(object_ids)
    with_active = len([o for o in object_ids if o in active_products])
    return {
        "objects_total": total,
        "with_active_contract": with_active,
        "with_checks": len(with_checks),
        "contract_coverage_pct": round(100.0 * with_active / total, 1) if total else 0.0,
        "unvalidated_30d": unvalidated,
    }


@router.get("/badge/{product}")
def status_badge(
    product: str,
    format: str = Query(default="svg"),
    store: StoreDep = ...,
):
    """Read-only Compliance-Badge. format=svg (default) | json."""
    import re
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", product):
        raise HTTPException(status_code=422, detail="Invalid product name")

    compliance_row = store.get_compliance(product)
    compliance = compliance_row["compliance"] if compliance_row else "unknown"
    version = compliance_row.get("contract_version", "") if compliance_row else ""

    if format == "json":
        return {"product": product, "compliance": compliance, "contract_version": version}

    color = _BADGE_COLORS.get(compliance, _BADGE_COLORS["unknown"])
    label = f"DQ {product}"
    value = compliance
    lw = 6 * len(label) + 12
    vw = 6 * len(value) + 12
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{lw + vw}" height="20" '
        f'role="img" aria-label="{label}: {value}">'
        f'<rect width="{lw}" height="20" fill="#24292f"/>'
        f'<rect x="{lw}" width="{vw}" height="20" fill="{color}"/>'
        f'<g fill="#fff" font-family="Verdana,sans-serif" font-size="10">'
        f'<text x="6" y="14">{label}</text>'
        f'<text x="{lw + 6}" y="14">{value}</text>'
        f'</g></svg>'
    )
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache, max-age=60"},
    )

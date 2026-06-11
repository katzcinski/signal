"""R4-5: embeddable status badge (SVG + JSON) for SAC/Confluence — read-only.

dbt-health-tile analogon. Optional token gate via BADGE_TOKEN.
"""
from __future__ import annotations

from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..deps import StoreDep
from ..settings import get_settings

router = APIRouter(prefix="/api/badge", tags=["badge"])

# Compliance state → (label color, display text).
_COLORS = {
    "compliant": ("#2da44e", "compliant"),
    "breached": ("#cf222e", "breached"),
    "unknown": ("#9a9a9a", "unknown"),
}


def _contract_exists(product: str) -> bool:
    contracts_dir = Path(get_settings().contracts_dir)
    for ext in (".yaml", ".yml"):
        if (contracts_dir / f"{product}{ext}").exists():
            return True
    return False


def _svg(label: str, message: str, color: str) -> str:
    # Self-contained shields.io-style SVG (no external fetch).
    lw = 6 * len(label) + 16
    mw = 6 * len(message) + 16
    total = lw + mw
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="20" '
        f'role="img" aria-label="{label}: {message}">'
        f'<linearGradient id="s" x2="0" y2="100%">'
        f'<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>'
        f'<stop offset="1" stop-opacity=".1"/></linearGradient>'
        f'<rect rx="3" width="{total}" height="20" fill="#555"/>'
        f'<rect rx="3" x="{lw}" width="{mw}" height="20" fill="{color}"/>'
        f'<rect rx="3" width="{total}" height="20" fill="url(#s)"/>'
        f'<g fill="#fff" text-anchor="middle" '
        f'font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">'
        f'<text x="{lw / 2}" y="14">{label}</text>'
        f'<text x="{lw + mw / 2}" y="14">{message}</text>'
        f'</g></svg>'
    )


@router.get("/{product}")
def badge(
    product: str,
    format: str = Query(default="svg"),
    token: str = Query(default=""),
    store: StoreDep = ...,
):
    settings = get_settings()
    if settings.badge_token and token != settings.badge_token:
        raise HTTPException(status_code=401, detail="Invalid or missing badge token.")
    if not _contract_exists(product):
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")

    row = store.get_compliance(product)
    state = (row or {}).get("compliance") or "unknown"
    color, message = _COLORS.get(state, _COLORS["unknown"])

    if format == "json":
        # Shields.io endpoint-badge compatible payload.
        return {
            "schemaVersion": 1,
            "label": "data contract",
            "message": message,
            "color": color.lstrip("#"),
            "product": product,
        }
    return Response(content=_svg("data contract", message, color), media_type="image/svg+xml")

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..deps import StoreDep, get_lineage

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


@router.get("")
def get_lineage_graph(
    space: str | None = Query(default=None),
    lineage: dict = Depends(get_lineage),
    store: StoreDep = ...,
):
    from dq_core.lineage.loader import get_coverage
    from pathlib import Path
    from ..settings import get_settings

    settings = get_settings()
    nodes = lineage.get("nodes") or []
    edges = lineage.get("edges") or []

    if space:
        nodes = [n for n in nodes if n.get("space") == space]
        node_ids = {n.get("id") for n in nodes}
        edges = [e for e in edges if e.get("source") in node_ids or e.get("target") in node_ids]

    # Annotate with live DQ status and coverage flags
    object_statuses = store.get_object_status()
    contracts_dir = Path(settings.contracts_dir)
    contracted = (
        [p.stem for p in contracts_dir.glob("*.y*ml") if not p.name.endswith(".active.yml")]
        if contracts_dir.exists()
        else []
    )

    annotated_nodes = get_coverage(nodes, object_statuses, contracted)

    # F5: Extrakt-Alter — FE zeigt eine Staleness-Warnung darauf an.
    extract_age_days = None
    extracted_at = None
    stale = False
    lineage_path = Path(settings.lineage_file)
    if lineage_path.exists():
        from datetime import datetime, timezone
        mtime = datetime.fromtimestamp(lineage_path.stat().st_mtime, tz=timezone.utc)
        extracted_at = mtime.isoformat()
        extract_age_days = (datetime.now(timezone.utc) - mtime).days
        stale = extract_age_days > settings.extract_stale_days

    return {
        "nodes": annotated_nodes,
        "edges": edges,
        "extracted_at": extracted_at,
        "extract_age": extract_age_days,
        "stale": stale,
    }

"""Real inventory + lineage extraction from SAP Datasphere (Tier-2, read-only).

Hybrid connectivity (scope decision): the @sap/datasphere-cli is the preferred
source because it returns full CSN (required for column-level lineage); the
REST/OAuth catalog API is the headless fallback for object listing/metadata.
When neither is configured, callers keep the local snapshot behaviour — this
module's entry points return ``None`` so the caller can no-op gracefully.

Output is written in the exact Meridian inventory/lineage format so the parser
and the cockpit consume it unchanged:
  inventory.json = {meta:{schemaVersion}, space, objects:[INVOBJ,...]}
  lineage.json   = build_lineage_graph(objects) merged with
                   build_column_lineage(objects).serialize()
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("dq_cockpit.extraction")

# Object types we inventory — those that carry columns / CSN / lineage. Flows and
# governance objects (task-chains, replication-flows, data-access-controls) are
# out of scope for the read-only lineage extract.
OBJECT_TYPES = (
    "views",
    "local-tables",
    "remote-tables",
    "analytic-models",
    "transformation-flows",
)

_OBJECT_TYPE_ALIASES = {
    "view": "views",
    "table": "local-tables",
    "local table": "local-tables",
    "localtable": "local-tables",
    "remote table": "remote-tables",
    "remotetable": "remote-tables",
    "analytic model": "analytic-models",
    "analyticmodel": "analytic-models",
    "transformation flow": "transformation-flows",
}


def _normalize_object_type(raw: str) -> str:
    """Best-effort map a catalog objectType string onto the schema enum."""
    if not raw:
        return "views"
    key = str(raw).strip().lower()
    if key in OBJECT_TYPES:
        return key
    hy = key.replace("_", "-").replace(" ", "-")
    if hy in OBJECT_TYPES:
        return hy
    return _OBJECT_TYPE_ALIASES.get(key, hy or "views")


def extraction_available(settings: Any) -> bool:
    """True when a live extraction source (REST catalog or CLI) is configured."""
    from .connector_config import effective_space_id
    if not effective_space_id(settings):
        return False
    from .datasphere_catalog import get_catalog_client

    if get_catalog_client() is not None:
        return True
    return _cli_if_ready(settings) is not None


def run_extraction(settings: Any, *, space_id: str | None = None) -> dict[str, Any] | None:
    """Extract inventory + lineage from the configured space and write snapshots.

    Returns count summary on success, or ``None`` when no connectivity is
    configured (caller should fall back to the local snapshot behaviour).
    ``space_id`` overrides the configured default when provided.
    """
    from .connector_config import effective_space_id
    space = space_id or effective_space_id(settings)
    if not space:
        return None

    raw_objects = _gather_objects(settings, space)
    if raw_objects is None:
        return None

    from dq_core.lineage._column_lineage import build_column_lineage
    from dq_core.lineage._semantics import SCHEMA_VERSION
    from dq_core.lineage.inventory import build_inventory_object, build_lineage_graph

    inv_objs: list[dict[str, Any]] = []
    for raw in raw_objects:
        inv_objs.append(
            build_inventory_object(
                raw.get("definition") or {},
                technical_name=raw.get("technicalName", ""),
                object_type=raw.get("objectType", "views"),
                status=raw.get("status", ""),
                space=space,
                sql=raw.get("sql", ""),
                business_name=raw.get("businessName", ""),
                semantic_usage=raw.get("semanticUsage", ""),
            )
        )

    inventory = {"meta": {"schemaVersion": SCHEMA_VERSION}, "space": space, "objects": inv_objs}

    lineage = build_lineage_graph(inv_objs)
    lineage.update(build_column_lineage(inv_objs).serialize())
    lineage.setdefault("meta", {})["schemaVersion"] = SCHEMA_VERSION

    _write_json(settings.inventory_file, inventory)
    _write_json(settings.lineage_file, lineage)

    summary = {
        "inventory_items": len(inv_objs),
        "lineage_nodes": len(lineage.get("nodes", [])),
        "lineage_edges": len(lineage.get("edges", [])),
        "column_edges": len(lineage.get("columnEdges", [])),
    }
    logger.info("Extraction wrote space=%s: %s", space, summary)
    return summary


# ---------------------------------------------------------------------------
# Source gathering
# ---------------------------------------------------------------------------

def _gather_objects(settings: Any, space: str) -> list[dict[str, Any]] | None:
    """Return a normalized object list, or None when no source is configured.

    Each entry: {technicalName, objectType, status, businessName, semanticUsage,
    sql, definition(CSN dict|{})}. CLI is preferred (full CSN); REST catalog is
    the headless fallback.
    """
    cli = _cli_if_ready(settings)
    if cli is not None:
        return _gather_via_cli(cli, space)

    from .datasphere_catalog import get_catalog_client

    catalog = get_catalog_client()
    if catalog is not None:
        return _gather_via_catalog(catalog, space)
    return None


def _cli_if_ready(settings: Any):
    """Return a logged-in DatasphereCli when the optional CLI path is enabled."""
    from .connector_config import effective_cli_host, effective_use_cli
    if not effective_use_cli(settings):
        return None
    try:
        from .datasphere_cli import CliError, DatasphereCli

        cli = DatasphereCli(host=effective_cli_host(settings) or None)
        if not cli.is_available():
            return None
        if not cli.check_login():
            logger.warning("Datasphere CLI available but not logged in — falling back to REST catalog.")
            return None
        return cli
    except Exception as exc:  # noqa: BLE001 — CLI is best-effort; fall back to REST
        logger.warning("Datasphere CLI unavailable (%s) — falling back to REST catalog.", exc)
        return None


def _gather_via_cli(cli: Any, space: str) -> list[dict[str, Any]]:
    from .datasphere_cli import CliError

    out: list[dict[str, Any]] = []
    for obj_type in OBJECT_TYPES:
        try:
            listed = cli.list_objects(space, object_type=obj_type)
        except CliError as exc:
            logger.warning("CLI list_objects(%s) failed: %s", obj_type, exc)
            continue
        for meta in listed:
            name = meta.get("technicalName") or meta.get("name") or ""
            if not name:
                continue
            definition: dict[str, Any] = {}
            try:
                definition = cli.read_object(space, name, object_type=obj_type, accept="csn") or {}
            except CliError as exc:
                logger.debug("CLI read_object(%s/%s) failed: %s", obj_type, name, exc)
            out.append(
                {
                    "technicalName": name,
                    "objectType": obj_type,
                    "status": meta.get("status", ""),
                    "businessName": meta.get("businessName", ""),
                    "semanticUsage": meta.get("semanticUsage", ""),
                    "sql": meta.get("sql", ""),
                    "definition": definition,
                }
            )
    return out


def _gather_via_catalog(catalog: Any, space: str) -> list[dict[str, Any]] | None:
    from .datasphere_catalog import CatalogError

    try:
        listed = catalog.list_objects(space)
    except CatalogError as exc:
        logger.warning("Catalog list_objects(%s) failed: %s", space, exc)
        return None

    out: list[dict[str, Any]] = []
    for meta in listed:
        name = meta.get("technicalName") or meta.get("name") or ""
        if not name:
            continue
        definition: dict[str, Any] = {}
        try:
            definition = catalog.read_object_definition(space, name) or {}
        except CatalogError as exc:
            logger.debug("Catalog read_object_definition(%s) failed: %s", name, exc)
        out.append(
            {
                "technicalName": name,
                "objectType": _normalize_object_type(meta.get("objectType", "")),
                "status": meta.get("status", ""),
                "businessName": meta.get("businessName", ""),
                "semanticUsage": meta.get("semanticUsage", ""),
                "sql": meta.get("sql", ""),
                "definition": definition,
            }
        )
    return out


def _write_json(path: str, data: dict[str, Any]) -> None:
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

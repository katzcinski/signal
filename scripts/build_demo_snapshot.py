#!/usr/bin/env python3
"""Erzeugt den ausgelieferten Demo-Snapshot aus ``scripts/demo_landscape.py``.

Schreibt — jeweils vollständig neu:

* ``data/inventory.json``  Objekt-Snapshot inkl. CSN-Query, ``csnProjection``
                           und abgeleiteten Layer-/Rollen-Metadaten
* ``data/lineage.json``    Objekt-Graph + Spalten-Lineage
* ``contracts/*.yaml``     Contracts (G1-validiert), zusätzlich
                           ``*.active.yml`` als Zertifizierungs-Snapshot
* ``checks/<product>/checks.yml``  kompilierte Check-Suiten
* ``products/*.yaml``      Data-Product-Manifeste

Alles läuft durch die **echte** Engine: ``build_inventory_object`` /
``build_lineage_graph`` / ``build_column_lineage`` für den Snapshot,
``validate_contract`` + ``compile_contract`` für Contracts und Checks. Ein
Objekt, das die Engine nicht mag, fliegt hier auf — nicht erst im Cockpit.

Idempotent: gleicher Input → byte-identische Ausgabe.

Aufruf:  ``python scripts/build_demo_snapshot.py``
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT))

from dq_core.contract.compiler import (  # noqa: E402
    compile_contract,
    compiled_contract_hash,
    compiler_hash,
)
from dq_core.contract.validator import validate_contract  # noqa: E402
from dq_core.engine.check_engine import dataset_config_to_yaml  # noqa: E402
from dq_core.library.check_library import load_library  # noqa: E402
from dq_core.lineage._column_lineage import build_column_lineage  # noqa: E402
from dq_core.lineage.inventory import (  # noqa: E402
    build_inventory_object,
    build_lineage_graph,
)

from scripts.demo_landscape import (  # noqa: E402
    CDS_TO_CONTRACT_TYPE,
    CONTRACTS,
    LAYER_FAMILY,
    OBJECTS,
    OBJECTS_BY_ID,
    PRODUCT_MANIFESTS,
    TENANT_SPACE,
    ContractSpec,
    ObjectSpec,
)

INVENTORY = ROOT / "data" / "inventory.json"
LINEAGE = ROOT / "data" / "lineage.json"
CONTRACTS_DIR = ROOT / "contracts"
CHECKS_DIR = ROOT / "checks"
PRODUCTS_DIR = ROOT / "products"

SNAPSHOT_META = {
    "schemaVersion": 6,
    "sanitized": True,
    "source": "demo-landscape",
    "generatedBy": "scripts/build_demo_snapshot.py",
}


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

def _csn_definition(spec: ObjectSpec) -> dict[str, Any]:
    """Roh-CSN wie es ein echter Extract für dieses Objekt liefern würde."""
    elements: dict[str, Any] = {}
    for name, cds_type, is_key, label in spec.columns:
        meta: dict[str, Any] = {"type": cds_type, "@EndUserText.label": label}
        if is_key:
            meta["key"] = True
            meta["notNull"] = True
        elements[name] = meta

    definition: dict[str, Any] = {"kind": "entity", "elements": elements}
    if spec.query is not None:
        definition["query"] = spec.query
    if spec.semantic_usage:
        definition["@ObjectModel.semanticUsage"] = spec.semantic_usage
    return {"definitions": {spec.id: definition}}


def build_inventory_objects() -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for spec in OBJECTS:
        record = build_inventory_object(
            _csn_definition(spec),
            technical_name=spec.id,
            object_type=spec.object_type,
            status=spec.status,
            space=spec.space,
            business_name=spec.business_name,
            semantic_usage=spec.semantic_usage,
        )
        # Datasphere-Objektklasse statt des CSN-"entity" anzeigen.
        record["kind"] = spec.kind
        # Raw-Objekte beziehen ihre Herkunft aus der Replikation, nicht aus einer
        # Query — der Extract trägt sie als lineageEdges, hier nachgezogen.
        if spec.external_source:
            record["lineageEdges"] = [
                {"name": spec.external_source, "type": spec.external_connection}
            ]
            record["lineageSources"] = [spec.external_source]

        # Governance-/Katalog-Felder, die nicht aus dem CSN kommen.
        record.update({
            "id": spec.id,
            "name": spec.id,
            "technicalName": spec.id,
            "display_name": spec.business_name,
            "schema": spec.space,
            "family": LAYER_FAMILY.get(record.get("layer", ""), "quality"),
            "role": record.get("role", "other"),
            "lifecycle": spec.lifecycle,
            "owned_by": spec.owned_by,
            "owners": list(spec.owners),
            "description": spec.description,
        })
        objects.append(record)
    return objects


def _ordered_object(record: dict[str, Any]) -> dict[str, Any]:
    """Stabile Feldreihenfolge — hält Diffs des Snapshots lesbar."""
    lead = [
        "objectType", "kind", "semanticUsage", "id", "name", "technicalName",
        "display_name", "businessName", "space", "schema", "layer", "layerCode",
        "family", "role", "confidence", "lifecycle", "owned_by", "owners",
        "status", "description", "columns", "columnCount",
    ]
    out = {key: record[key] for key in lead if key in record}
    out.update({k: v for k, v in record.items() if k not in out})
    return out


# ---------------------------------------------------------------------------
# Lineage
# ---------------------------------------------------------------------------

def build_lineage(objects: list[dict[str, Any]]) -> dict[str, Any]:
    graph = build_lineage_graph(objects)

    specs_by_id = {spec.id: spec for spec in OBJECTS}
    for node in graph["nodes"]:
        node["label"] = node["id"]
        spec = specs_by_id.get(node["id"])
        node["family"] = LAYER_FAMILY.get(node.get("layer", ""), "quality")
        if spec is None:  # externer Quellknoten (S4:*)
            node["family"] = "observability"
            node.setdefault("space", "")
        node["lifecycle"] = spec.lifecycle if spec else "active"

    # Objekt-Kanten deduplizieren (ein Join kann dieselbe Quelle mehrfach
    # nennen) und mit stabilen IDs versehen.
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for edge in graph["edges"]:
        key = (edge["source"], edge["target"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append({
            "id": f"edge:{edge['source']}->{edge['target']}",
            "source": edge["source"],
            "target": edge["target"],
            "type": "lineage",
            "edgeType": "lineage",
            **{k: v for k, v in edge.items() if k not in ("source", "target")},
        })

    column_lineage = build_column_lineage(objects).serialize()

    # Adjazenz/Upstream aus den deduplizierten Kanten neu aufbauen.
    adjacency: dict[str, list[str]] = {}
    upstream: dict[str, list[str]] = {}
    for edge in deduped:
        adjacency.setdefault(edge["source"], []).append(edge["target"])
        upstream.setdefault(edge["target"], []).append(edge["source"])

    return {
        "meta": dict(SNAPSHOT_META),
        "nodes": sorted(graph["nodes"], key=lambda n: n["id"]),
        "edges": sorted(deduped, key=lambda e: (e["source"], e["target"])),
        "columnEdges": column_lineage["columnEdges"],
        "columnEdgeMeta": column_lineage["columnEdgeMeta"],
        "adjacency": {k: sorted(v) for k, v in sorted(adjacency.items())},
        "upstream": {k: sorted(v) for k, v in sorted(upstream.items())},
    }


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

def contract_dict(spec: ContractSpec) -> dict[str, Any]:
    """ContractSpec → Contract-YAML-Struktur (Schema v1, G1-konform)."""
    obj = OBJECTS_BY_ID[spec.product]

    types: dict[str, dict[str, Any]] = {}
    for name, cds_type, is_key, _label in obj.columns:
        entry: dict[str, Any] = {"type": CDS_TO_CONTRACT_TYPE[cds_type]}
        if is_key:
            entry["key"] = True
            entry["nullable"] = False
        types[name] = entry

    guarantees: dict[str, Any] = {
        "schema": {
            "columns": obj.column_names,
            "mode": spec.schema_mode,
            "severity": spec.schema_severity,
            "types": types,
        },
    }

    if spec.unique_keys:
        guarantees["keys"] = [
            {"columns": list(cols), "unique": True, "severity": "critical"}
            for cols in spec.unique_keys
        ]
    if spec.referential:
        guarantees["referential"] = [
            {"fk": [fk], "parent": parent, "parent_key": [parent_key], "severity": severity}
            for fk, parent, parent_key, severity in spec.referential
        ]
    if spec.freshness:
        column, max_age, severity = spec.freshness
        guarantees["freshness"] = {"column": column, "max_age": max_age, "severity": severity}
    if spec.volume_min_rows is not None:
        volume: dict[str, Any] = {"min_rows": spec.volume_min_rows, "severity": spec.volume_severity}
        if spec.volume_baseline:
            volume["baseline"] = "rolling"
            volume["bounds"] = "auto"
        guarantees["volume"] = volume
    if spec.completeness:
        completeness: list[dict[str, Any]] = []
        for column, min_pct, severity, segment_by in spec.completeness:
            entry = {"column": column, "min_pct": min_pct, "severity": severity}
            if segment_by:
                entry["segment_by"] = segment_by
                entry["max_segments"] = 12
            completeness.append(entry)
        guarantees["completeness"] = completeness
    if spec.not_null:
        guarantees["not_null"] = [
            {"columns": list(cols), "severity": severity} for cols, severity in spec.not_null
        ]

    data: dict[str, Any] = {
        "product": spec.product,
        "kind": spec.kind,
        "dataset": spec.product,
        "owned_by": obj.owned_by,
        "owners": list(obj.owners),
        "version": spec.version,
        "lifecycle": spec.lifecycle,
        "description": spec.description,
    }
    if spec.enforcement_default != "monitor":
        data["enforcement_default"] = spec.enforcement_default
    if spec.quarantine_style:
        data["quarantine"] = {"style": spec.quarantine_style}
    if spec.observability:
        data["observability"] = spec.observability
    if spec.quality_proposals:
        data["quality_proposals"] = [dict(p) for p in spec.quality_proposals]
    data["guarantees"] = guarantees
    if spec.library_checks:
        data["checks"] = [dict(c) for c in spec.library_checks]
    return data


def compile_checks_yaml(product: str, data: dict[str, Any], inventory_columns: set[str]) -> str:
    """Kompilierte checks.yml inkl. Determinismus-Header (wie /certify)."""
    config = compile_contract(data, inventory_columns=inventory_columns)
    header = (
        f"# contract_hash: {compiled_contract_hash(data)}\n"
        f"# library_version: {load_library().get('version', '1')}\n"
        f"# compiler_hash: {compiler_hash(data)}\n"
    )
    return header + dataset_config_to_yaml(config)


# ---------------------------------------------------------------------------
# Schreiben
# ---------------------------------------------------------------------------

def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _write_yaml(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(payload, sort_keys=False, default_flow_style=False, allow_unicode=True),
        encoding="utf-8",
    )


def _reset_dir(path: Path) -> None:
    """Verzeichnis leeren — der Neuseed lässt keine Altbestände zurück.

    Versteckte Dateien bleiben: in ``contracts/`` liegt z. B. die Lock-Datei des
    Git-Writers (``.git_write.lock``), die nicht zum Inhalt gehört.
    """
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
        return
    for child in sorted(path.iterdir()):
        if child.name.startswith("."):
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def build_snapshot(
    *,
    inventory_path: str | Path = INVENTORY,
    lineage_path: str | Path = LINEAGE,
    contracts_dir: str | Path = CONTRACTS_DIR,
    checks_dir: str | Path = CHECKS_DIR,
    products_dir: str | Path = PRODUCTS_DIR,
) -> dict[str, int]:
    contracts_dir = Path(contracts_dir)
    checks_dir = Path(checks_dir)
    products_dir = Path(products_dir)

    objects = build_inventory_objects()
    lineage = build_lineage(objects)

    _write_json(Path(inventory_path), {
        "meta": dict(SNAPSHOT_META),
        "space": TENANT_SPACE,
        "objects": [_ordered_object(o) for o in objects],
    })
    _write_json(Path(lineage_path), lineage)

    inventory_columns = {
        obj["id"]: {c["name"] for c in obj["columns"]} for obj in objects
    }

    _reset_dir(contracts_dir)
    _reset_dir(checks_dir)
    _reset_dir(products_dir)

    contract_files = 0
    check_files = 0
    for spec in CONTRACTS:
        data = contract_dict(spec)
        errors = validate_contract(data)
        if errors:
            raise SystemExit(f"[G1] Contract {spec.product} ist ungültig: {errors}")

        _write_yaml(contracts_dir / f"{spec.product}.yaml", data)
        contract_files += 1

        # Zertifiziert = active: Snapshot als G3-Diff-Basis + kompilierte Suite.
        if spec.lifecycle == "active":
            _write_yaml(contracts_dir / f"{spec.product}.active.yml", data)
            contract_files += 1
            yaml_out = compile_checks_yaml(spec.product, data, inventory_columns[spec.product])
            checks_path = checks_dir / spec.product / "checks.yml"
            checks_path.parent.mkdir(parents=True, exist_ok=True)
            checks_path.write_text(yaml_out, encoding="utf-8")
            check_files += 1

    for manifest in PRODUCT_MANIFESTS:
        _write_yaml(products_dir / f"{manifest['product']}.yaml", dict(manifest))

    return {
        "objects": len(objects),
        "object_edges": len(lineage["edges"]),
        "column_edges": len(lineage["columnEdges"]),
        "contract_files": contract_files,
        "check_files": check_files,
        "product_files": len(PRODUCT_MANIFESTS),
    }


def main() -> None:
    summary = build_snapshot()
    print(f"inventory.json : {summary['objects']} Objekte")
    print(f"lineage.json   : {summary['object_edges']} Objekt-Kanten, "
          f"{summary['column_edges']} Spalten-Kanten")
    print(f"contracts/     : {summary['contract_files']} Dateien")
    print(f"checks/        : {summary['check_files']} kompilierte Suiten")
    print(f"products/      : {summary['product_files']} Manifeste")


if __name__ == "__main__":
    main()

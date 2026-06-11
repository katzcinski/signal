"""R5-1: deterministic export of the internal §1.5 contract to ODCS 3.1.

The Open Data Contract Standard (ODCS) is the interop *export* format — it is
never read back as a second internal schema (that was the S-3/S-4 lesson). This
module maps a validated internal contract dict to an ODCS v3.1 document.

Mapping (per PLAN R5-1):
  schema       → schema[].properties (required / unique / primaryKey)
  keys         → property primaryKey flags + uniqueness
  referential  → schema[].properties[].authoritativeDefinitions + relationships
  freshness    → slaProperties (freshness)
  volume       → slaProperties (volume)
  completeness → property quality (nullCount / min %)
  lifecycle    → status
  rest         → customProperties

[A1] compliance is deliberately NOT exported — it lives only in the store, and
ODCS has no place for run-time state in the contract document.
"""
from __future__ import annotations

from typing import Any

# ODCS lifecycle status vocabulary; our lifecycle maps onto it deterministically.
_STATUS_MAP = {
    "draft": "draft",
    "active": "active",
    "deprecated": "deprecated",
}


def to_odcs(contract: dict[str, Any]) -> dict[str, Any]:
    """Map an internal contract dict to a deterministic ODCS 3.1 document."""
    product = str(contract.get("product") or "")
    dataset = str(contract.get("dataset") or product)
    guarantees = contract.get("guarantees") or {}

    schema_g = guarantees.get("schema") or {}
    columns = list(schema_g.get("columns") or [])

    # Key columns → primaryKey + unique flags, in declared order.
    key_columns: list[str] = []
    for key in guarantees.get("keys") or []:
        if key.get("unique"):
            key_columns.extend(c for c in (key.get("columns") or []))
    key_order = {col: i + 1 for i, col in enumerate(key_columns)}

    # Completeness → per-column minimum non-null percentage.
    completeness_pct: dict[str, float] = {}
    for comp in guarantees.get("completeness") or []:
        col = comp.get("column")
        if col is not None:
            completeness_pct[col] = float(comp.get("min_pct", 0))

    # Referential → per-FK-column relationship target.
    relationships: dict[str, dict[str, Any]] = {}
    for ref in guarantees.get("referential") or []:
        parent = ref.get("parent", "")
        parent_key = ref.get("parent_key") or []
        for i, fk_col in enumerate(ref.get("fk") or []):
            target_col = parent_key[i] if i < len(parent_key) else fk_col
            relationships[fk_col] = {"to": f"{parent}.{target_col}"}

    properties: list[dict[str, Any]] = []
    # Union of declared columns and any column referenced by a guarantee, sorted
    # for determinism but keeping declared columns first in declared order.
    extra_cols = sorted(
        set(completeness_pct) | set(relationships) | set(key_order) - set(columns)
    )
    for col in [*columns, *[c for c in extra_cols if c not in columns]]:
        prop: dict[str, Any] = {"name": col, "logicalType": "string"}
        if col in key_order:
            prop["primaryKey"] = True
            prop["primaryKeyPosition"] = key_order[col]
            prop["required"] = True
            prop["unique"] = True
        if col in completeness_pct:
            prop["required"] = True
            prop["quality"] = [
                {
                    "type": "library",
                    "rule": "nullCount",
                    "mustBeLessThan": round(100.0 - completeness_pct[col], 6),
                    "unit": "percent",
                }
            ]
        if col in relationships:
            prop["authoritativeDefinitions"] = [
                {"type": "businessDefinition", "url": relationships[col]["to"]}
            ]
        properties.append(prop)

    schema_objects = [
        {
            "name": dataset,
            "physicalName": dataset,
            "logicalType": "object",
            "properties": properties,
        }
    ]

    sla_properties: list[dict[str, Any]] = []
    freshness = guarantees.get("freshness")
    if freshness:
        sla_properties.append(
            {
                "property": "frequency",
                "value": freshness.get("max_age", ""),
                "element": f"{dataset}.{freshness.get('column', '')}",
                "driver": "operational",
            }
        )
    volume = guarantees.get("volume")
    if volume:
        sla_properties.append(
            {
                "property": "volume",
                "value": str(volume.get("baseline", "rolling")),
                "element": dataset,
                "driver": "operational",
            }
        )

    doc: dict[str, Any] = {
        "apiVersion": "v3.1.0",
        "kind": "DataContract",
        "id": product,
        "name": product,
        "version": str(contract.get("version", "0.1.0")),
        "status": _STATUS_MAP.get(contract.get("lifecycle", "draft"), "draft"),
        "schema": schema_objects,
    }
    if sla_properties:
        doc["slaProperties"] = sla_properties

    description = contract.get("description")
    if description:
        doc["description"] = {"purpose": str(description)}

    # Ownership → ODCS team/custom; owned_by + owners as custom properties.
    custom: list[dict[str, Any]] = [
        {"property": "owned_by", "value": contract.get("owned_by", "platform")},
    ]
    owners = contract.get("owners") or []
    if owners:
        custom.append({"property": "owners", "value": ",".join(owners)})
    doc["customProperties"] = custom

    return doc

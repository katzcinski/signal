# Contract auto-seeder: inventory snapshot → draft contract guarantees (WS2-2)
from __future__ import annotations

from typing import Any


def seed_from_inventory(obj: dict[str, Any]) -> dict[str, Any]:
    """Generate a draft contract dict from an inventory object."""
    name = obj.get("technicalName") or obj.get("id") or obj.get("name") or ""
    schema = obj.get("schema") or obj.get("schemaName") or ""
    owned_by = obj.get("owned_by", "platform")

    guarantees: dict[str, Any] = {}

    # Schema — capture declared columns
    columns = [
        c.get("name") or c.get("technicalName")
        for c in (obj.get("columns") or obj.get("properties") or [])
        if c.get("name") or c.get("technicalName")
    ]
    if columns:
        guarantees["schema"] = {"columns": columns, "mode": "closed"}

    # Keys — declared key columns from CSN projection
    key_cols = (
        obj.get("csnProjection", {}).get("keyColumns")
        or obj.get("keyColumns")
        or []
    )
    if key_cols:
        guarantees["keys"] = [{"columns": key_cols, "unique": True, "severity": "critical"}]
    else:
        # Warn: no declared key — flag as coverage gap
        guarantees["_key_gap"] = {
            "_note": "No declared key found. Add 'keys' guarantee manually.",
            "severity": "critical",
        }

    # Freshness — if object has a timestamp column
    ts_cols = [
        c.get("name") for c in (obj.get("columns") or [])
        if any(kw in (c.get("name") or "").upper() for kw in ("TS", "TIME", "DATE", "LOAD", "CHANGE"))
    ]
    if ts_cols:
        guarantees["freshness"] = {"column": ts_cols[0], "max_age": "PT24H", "severity": "warn"}

    # Volume
    guarantees["volume"] = {"baseline": "rolling", "bounds": "auto", "severity": "warn"}

    return {
        "product": name,
        "dataset": name,
        "schema": schema,
        "owned_by": owned_by,
        "owners": [],
        "version": "0.1.0",
        "lifecycle": "draft",
        "guarantees": guarantees,
    }

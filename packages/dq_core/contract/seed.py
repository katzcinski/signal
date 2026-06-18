# Contract auto-seeder: inventory snapshot → draft contract guarantees (WS2-2)
from __future__ import annotations

from typing import Any

# Heuristik für Key-Kandidaten, wenn das Inventar keinen Schlüssel deklariert.
_KEY_HINTS = ("ID", "NO", "NR", "KEY", "CODE")
_TS_HINTS = ("TS", "TIME", "DATE", "LOAD", "CHANGE")


def _column_names(obj: dict[str, Any]) -> list[str]:
    return [
        c.get("name") or c.get("technicalName")
        for c in (obj.get("columns") or obj.get("properties") or [])
        if c.get("name") or c.get("technicalName")
    ]


def _key_candidates(columns: list[str]) -> list[str]:
    """Deterministische Key-Heuristik: Spalten mit ID-artigen Suffixen,
    in Inventar-Reihenfolge. WS2-2: ein Dataset ohne deklarierten Schlüssel
    bekommt einen KONKRETEN Pflichtvorschlag, kein Freitext-Hinweisfeld."""
    return [
        col for col in columns
        if any(col.upper().endswith(h) for h in _KEY_HINTS)
    ]


def seed_from_inventory(obj: dict[str, Any]) -> dict[str, Any]:
    """Generate a draft contract dict from an inventory object.

    A2: kein 'schema:'-Key im Output — Schema-Bindung erfolgt zur Laufzeit.
    """
    name = obj.get("technicalName") or obj.get("id") or obj.get("name") or ""
    owned_by = obj.get("owned_by", "platform")

    guarantees: dict[str, Any] = {}

    columns = _column_names(obj)
    if columns:
        guarantees["schema"] = {"columns": columns, "mode": "closed"}

    key_cols = (
        obj.get("csnProjection", {}).get("keyColumns")
        or obj.get("keyColumns")
        or []
    )
    if key_cols:
        guarantees["keys"] = [{"columns": key_cols, "unique": True, "severity": "critical"}]
    else:
        candidates = _key_candidates(columns)
        if candidates:
            guarantees["keys"] = [{
                "columns": candidates,
                "unique": True,
                "severity": "critical",
                "proposed": True,  # Steward muss den Vorschlag im Workbench bestätigen
            }]

    ts_cols = [c for c in columns if any(h in c.upper() for h in _TS_HINTS)]
    if ts_cols:
        guarantees["freshness"] = {"column": ts_cols[0], "max_age": "PT24H", "severity": "warn"}

    guarantees["volume"] = {"baseline": "rolling", "bounds": "auto", "severity": "warn"}

    return {
        "product": name,
        "dataset": name,
        "owned_by": owned_by,
        "kind": "internal_gate",
        "owners": [],
        "version": "0.1.0",
        "lifecycle": "draft",
        "guarantees": guarantees,
    }

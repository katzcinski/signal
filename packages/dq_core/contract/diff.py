# Contract diff engine (WS2-4) — homegrown ~150 LOC, no ODCS dependency yet
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class DiffEntry:
    kind: str       # removed_column | type_narrowing | key_change | constraint_tightened
    path: str
    old_value: Any
    new_value: Any
    breaking: bool


def diff_contracts(old: dict[str, Any], new: dict[str, Any]) -> list[DiffEntry]:
    """Compare two contract dicts; return breaking/non-breaking changes."""
    entries: list[DiffEntry] = []
    _diff_guarantees(
        old.get("guarantees") or {},
        new.get("guarantees") or {},
        entries,
    )
    # Version bump required if any breaking change
    return entries


def is_breaking(entries: list[DiffEntry]) -> bool:
    return any(e.breaking for e in entries)


def _diff_guarantees(
    old_g: dict[str, Any],
    new_g: dict[str, Any],
    out: list[DiffEntry],
) -> None:
    # schema: removed columns = breaking
    old_schema = old_g.get("schema") or {}
    new_schema = new_g.get("schema") or {}
    old_cols = set(old_schema.get("columns") or [])
    new_cols = set(new_schema.get("columns") or [])
    for col in old_cols - new_cols:
        out.append(DiffEntry("removed_column", f"guarantees.schema.columns", col, None, True))

    # keys: any change = breaking
    old_keys = _normalise_keys(old_g.get("keys") or [])
    new_keys = _normalise_keys(new_g.get("keys") or [])
    if old_keys != new_keys:
        out.append(DiffEntry("key_change", "guarantees.keys", old_keys, new_keys, True))

    # freshness: tightening = breaking
    _diff_freshness(
        old_g.get("freshness") or {},
        new_g.get("freshness") or {},
        out,
    )

    # completeness: raising min_pct = breaking
    for item in new_g.get("completeness") or []:
        col = item.get("column", "")
        old_items = {
            i["column"]: i
            for i in (old_g.get("completeness") or [])
            if i.get("column")
        }
        old_item = old_items.get(col)
        if old_item is None:
            continue
        old_pct = float(old_item.get("min_pct", 0))
        new_pct = float(item.get("min_pct", 0))
        if new_pct > old_pct:
            out.append(
                DiffEntry(
                    "constraint_tightened",
                    f"guarantees.completeness[{col}].min_pct",
                    old_pct, new_pct, True,
                )
            )

    # referential: new FK = breaking for consumers
    old_refs = {_ref_key(r): r for r in (old_g.get("referential") or [])}
    new_refs = {_ref_key(r): r for r in (new_g.get("referential") or [])}
    for key in old_refs:
        if key not in new_refs:
            out.append(DiffEntry("removed_referential", f"guarantees.referential", old_refs[key], None, True))


def _normalise_keys(keys: list[dict]) -> list[tuple]:
    return sorted(tuple(sorted(k.get("columns") or [])) for k in keys)


def _ref_key(r: dict) -> str:
    fk = ",".join(sorted(r.get("fk") or []))
    return f"{fk}→{r.get('parent', '')}:{','.join(sorted(r.get('parent_key') or []))}"


def _diff_freshness(
    old_f: dict[str, Any],
    new_f: dict[str, Any],
    out: list[DiffEntry],
) -> None:
    old_age = _parse_duration(old_f.get("max_age", ""))
    new_age = _parse_duration(new_f.get("max_age", ""))
    if old_age and new_age and new_age < old_age:
        out.append(
            DiffEntry(
                "constraint_tightened",
                "guarantees.freshness.max_age",
                old_f.get("max_age"), new_f.get("max_age"), True,
            )
        )


def _parse_duration(s: str) -> int | None:
    """Parse ISO 8601 duration string like PT1H, PT24H, P1D → seconds."""
    import re
    if not s:
        return None
    m = re.match(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", s)
    if not m:
        return None
    days = int(m.group(1) or 0)
    hours = int(m.group(2) or 0)
    minutes = int(m.group(3) or 0)
    seconds = int(m.group(4) or 0)
    return days * 86400 + hours * 3600 + minutes * 60 + seconds

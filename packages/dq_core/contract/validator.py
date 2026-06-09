# [CONTRACT-SQL-FREE] — Gate G1: reject any SQL in contract YAML
from __future__ import annotations

import re
from typing import Any

# Patterns that indicate raw SQL slipping into a contract (G1)
_SQL_PATTERNS = [
    re.compile(r"\bSELECT\b", re.IGNORECASE),
    re.compile(r"\bFROM\b\s+\w", re.IGNORECASE),
    re.compile(r"\bWHERE\b", re.IGNORECASE),
    re.compile(r"\bINSERT\b", re.IGNORECASE),
    re.compile(r"\bUPDATE\b", re.IGNORECASE),
    re.compile(r"\bDELETE\b", re.IGNORECASE),
    re.compile(r"\bDROP\b", re.IGNORECASE),
]

# Identifier safety (S2) — prevents injection via column/table names
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

VALID_LIFECYCLES = {"draft", "active", "deprecated"}
VALID_OWNED_BY = {"platform", "product"}


def _scan_sql_in_value(value: Any, path: str, errors: list[str]) -> None:
    if isinstance(value, str):
        for pat in _SQL_PATTERNS:
            if pat.search(value):
                errors.append(
                    f"[G1] SQL detected in contract at '{path}': {value[:80]!r}"
                )
                return
    elif isinstance(value, dict):
        for k, v in value.items():
            _scan_sql_in_value(v, f"{path}.{k}", errors)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _scan_sql_in_value(v, f"{path}[{i}]", errors)


def validate_contract(data: dict[str, Any]) -> list[str]:
    """Return a list of validation error strings; empty = valid."""
    errors: list[str] = []

    # Required fields
    if not data.get("product") and not data.get("dataset"):
        errors.append("Contract must have a 'product' or 'dataset' field.")

    # owned_by
    owned_by = data.get("owned_by", "platform")
    if owned_by not in VALID_OWNED_BY:
        errors.append(f"owned_by must be one of {sorted(VALID_OWNED_BY)}, got {owned_by!r}.")

    # lifecycle
    lifecycle = data.get("lifecycle", "draft")
    if lifecycle not in VALID_LIFECYCLES:
        errors.append(f"lifecycle must be one of {sorted(VALID_LIFECYCLES)}, got {lifecycle!r}.")

    # G1: no SQL anywhere in the contract
    _scan_sql_in_value(data, "root", errors)

    # S2: identifier safety on column names and dataset name
    dataset = str(data.get("dataset") or "")
    if dataset and not _SAFE_IDENTIFIER.match(dataset):
        errors.append(f"[S2] dataset name {dataset!r} contains unsafe characters.")

    guarantees = data.get("guarantees") or {}
    for gtype, gval in guarantees.items():
        if isinstance(gval, dict):
            for k in ("column", "columns"):
                col = gval.get(k)
                if isinstance(col, str) and not _SAFE_IDENTIFIER.match(col):
                    errors.append(f"[S2] Column name {col!r} in guarantee '{gtype}' is unsafe.")
                elif isinstance(col, list):
                    for c in col:
                        if isinstance(c, str) and not _SAFE_IDENTIFIER.match(c):
                            errors.append(f"[S2] Column name {c!r} in guarantee '{gtype}' is unsafe.")

    return errors

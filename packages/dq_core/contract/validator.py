# [CONTRACT-SQL-FREE] — Gate G1: contracts carry guarantees, never SQL.
# Two layers: (1) structural jsonschema validation of the canonical contract
# schema v1, (2) lint pass — SQL smuggling patterns and identifier safety (S2)
# on EVERY identifier-bearing field, including list-valued guarantees.
from __future__ import annotations

import re
from typing import Any

import jsonschema

# Identifier safety (S2) — anything that becomes a SQL identifier or filename.
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# ISO-8601 duration (the only accepted freshness notation; PT26H, P1D, PT30M …)
ISO_DURATION = re.compile(r"^P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$")

SEMVER = re.compile(r"^\d+\.\d+\.\d+$")

VALID_LIFECYCLES = {"draft", "active", "deprecated"}
VALID_OWNED_BY = {"platform", "product"}
VALID_SEVERITIES = {"critical", "fail", "warn"}

_IDENT = {"type": "string", "pattern": SAFE_IDENTIFIER.pattern}
_IDENT_LIST = {"type": "array", "items": _IDENT, "minItems": 1}
_SEVERITY = {"enum": sorted(VALID_SEVERITIES)}

# Canonical contract schema v1 (HANDOVER §1.5). additionalProperties: false is
# the structural half of G1 — an `sql:`/`query:` key anywhere is rejected.
CONTRACT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["product", "dataset", "version", "guarantees"],
    "properties": {
        "product": _IDENT,
        "dataset": _IDENT,
        "owned_by": {"enum": sorted(VALID_OWNED_BY)},
        "owners": {"type": "array", "items": {"type": "string"}},
        "version": {"type": "string", "pattern": SEMVER.pattern},
        "lifecycle": {"enum": sorted(VALID_LIFECYCLES)},
        "description": {"type": "string"},
        # Accepted but ignored by the compiler; written by proposal accepts.
        "quality_proposals": {"type": "array"},
        "guarantees": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["columns"],
                    "properties": {
                        "columns": _IDENT_LIST,
                        "mode": {"enum": ["closed", "open"]},
                        "severity": _SEVERITY,
                    },
                },
                "keys": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["columns"],
                        "properties": {
                            "columns": _IDENT_LIST,
                            "unique": {"type": "boolean"},
                            "severity": _SEVERITY,
                            "proposed": {"type": "boolean"},
                        },
                    },
                },
                "referential": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["fk", "parent", "parent_key"],
                        "properties": {
                            "fk": _IDENT_LIST,
                            "parent": _IDENT,
                            "parent_key": _IDENT_LIST,
                            "severity": _SEVERITY,
                        },
                    },
                },
                "freshness": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["column", "max_age"],
                    "properties": {
                        "column": _IDENT,
                        "max_age": {"type": "string", "pattern": ISO_DURATION.pattern},
                        "severity": _SEVERITY,
                    },
                },
                "volume": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "min_rows": {"type": "integer", "minimum": 0},
                        "baseline": {"enum": ["rolling"]},
                        "bounds": {"enum": ["auto"]},
                        "severity": _SEVERITY,
                    },
                },
                "completeness": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["column", "min_pct"],
                        "properties": {
                            "column": _IDENT,
                            "min_pct": {"type": "number", "minimum": 0, "maximum": 100},
                            "severity": _SEVERITY,
                        },
                    },
                },
                "not_null": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["columns"],
                        "properties": {
                            "columns": _IDENT_LIST,
                            "severity": _SEVERITY,
                        },
                    },
                },
            },
        },
    },
}

_VALIDATOR = jsonschema.Draft202012Validator(CONTRACT_SCHEMA)

# Lint patterns: SQL keywords/structure that must never appear in identifier or
# structural fields. Descriptions are exempt (the schema constrains where these
# patterns are scanned, so prose like "harmonised from RAW_SALES" stays legal).
_SQL_SMUGGLE = re.compile(
    r"(;|--|/\*|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b"
    r"|\bMERGE\b|\bEXEC\b|'|\")",
    re.IGNORECASE,
)

_FREE_TEXT_FIELDS = {"description", "rationale", "_note"}


def _lint_strings(value: Any, path: str, errors: list[str]) -> None:
    if isinstance(value, str):
        if _SQL_SMUGGLE.search(value):
            errors.append(f"[G1] SQL-verdaechtiges Muster in '{path}': {value[:80]!r}")
    elif isinstance(value, dict):
        for k, v in value.items():
            if k in _FREE_TEXT_FIELDS:
                continue
            _lint_strings(v, f"{path}.{k}", errors)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _lint_strings(v, f"{path}[{i}]", errors)


def validate_contract(data: dict[str, Any]) -> list[str]:
    """Return a list of validation error strings; empty = valid."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["Contract muss ein YAML-Objekt sein."]

    # A2: schema binding happens at run time, never in the contract.
    if "schema" in data:
        errors.append(
            "[A2] 'schema' gehoert nicht in den Contract — Schema wird zur "
            "Laufzeit ueber das Environment gebunden."
        )
        data = {k: v for k, v in data.items() if k != "schema"}

    for err in sorted(_VALIDATOR.iter_errors(data), key=lambda e: list(e.absolute_path)):
        loc = ".".join(str(p) for p in err.absolute_path) or "root"
        errors.append(f"[SCHEMA] {loc}: {err.message}")

    # Lint everything except free-text fields — catches quotes, semicolons,
    # comments and SQL keywords inside identifier-bearing values (S2/G1).
    _lint_strings(
        {k: v for k, v in data.items() if k not in _FREE_TEXT_FIELDS},
        "root",
        errors,
    )
    return errors

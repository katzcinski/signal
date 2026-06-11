"""Guarantees → check_library → CheckDef Compiler. [DETERMINISM] [SCHEMA-MAP]

Der EINZIGE Ort, an dem aus einer semantischen Garantie (Contract-Schema v1,
HANDOVER §1.5) ausführbares SQL wird. Es gibt KEINEN Roh-SQL-Pfad — Gate G1
gilt absolut; `type: sql` o. ä. existiert nicht.

Gates:  G1  kein SQL im Contract; jede Garantie mappt auf ein Library-Template
        G2  '{schema}' bleibt wörtlich im Output und wird erst zur Laufzeit
            gebunden (bind_schema) — nie hartkodiert
        S2  dreistufige Identifier-Verteidigung: Regex → optionale Inventar-
            Existenzprüfung → Quote-Escaping
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Iterable

from ..library.check_library import check_by_id, load_library
from ..engine.models import CheckDef, DatasetConfig, VALID_OWNERS, VALID_SEVERITIES

SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_ISO_DURATION = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")

# Erkennt ungebundene Template-Tokens (<SPALTE>, :<YEAR>) — NICHT '{schema}'.
_UNBOUND_TOKEN = re.compile(r":?<[A-Za-z0-9_]+>")


class CompileError(ValueError):
    pass


def _ident(value: Any, where: str, known: set[str] | None = None) -> str:
    """S2: validate one identifier. Regex, optional inventory existence, escape."""
    s = str(value or "")
    if not SAFE_IDENTIFIER.match(s):
        raise CompileError(f"[S2] Unsicherer Identifier {s!r} in {where}")
    if known is not None and s not in known:
        raise CompileError(f"[S2] Identifier {s!r} in {where} existiert nicht im Inventar")
    return s.replace('"', '""')  # defense-in-depth; Regex lässt kein '"' zu


def _idents(values: Iterable[Any], where: str, known: set[str] | None = None) -> list[str]:
    out = [_ident(v, where, known) for v in values]
    if not out:
        raise CompileError(f"Leere Identifier-Liste in {where}")
    return out


def _severity(g: dict[str, Any], default: str) -> str:
    sev = str(g.get("severity") or default)
    if sev not in VALID_SEVERITIES:
        raise CompileError(f"Unbekannte severity {sev!r}")
    return sev


def parse_iso_duration(s: str) -> int:
    """ISO-8601-Dauer (PT26H, P1D …) → Sekunden."""
    m = _ISO_DURATION.match(str(s or ""))
    if not m or not any(m.groups()):
        raise CompileError(f"max_age muss ISO-8601-Dauer sein (z. B. PT24H), nicht {s!r}")
    d, h, mi, sec = (int(g or 0) for g in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + sec


def _bind(template_id: str, dataset: str, params: dict[str, Any]) -> str:
    """Template-SQL binden. '{schema}' bleibt wörtlich erhalten (G2)."""
    entry = check_by_id(template_id)
    if entry is None or not entry.get("sql_template"):
        raise CompileError(f"Unbekannte/leere templateId {template_id!r}")
    sql = entry["sql_template"].replace("{dataset}", dataset)
    # längste Tokens zuerst, damit <MAX> nicht in <MAX_X> kollidiert
    for token in sorted(params.keys(), key=len, reverse=True):
        sql = sql.replace(token, str(params[token]))
    leftover = _UNBOUND_TOKEN.search(sql)
    if leftover:
        raise CompileError(f"{template_id}: ungebundener Parameter {leftover.group(0)!r}")
    return sql


def _mk(template_id: str, dataset: str, params: dict[str, Any], *,
        name: str, expect: str, severity: str, owner: str, unit: str = "") -> CheckDef:
    return CheckDef(name=name, sql=_bind(template_id, dataset, params),
                    expect=expect, severity=severity, type=template_id,
                    unit=unit, owned_by=owner)


def compile_contract(
    contract: dict[str, Any],
    *,
    inventory_columns: set[str] | None = None,
) -> DatasetConfig:
    """Contract-Dict (validiert, §1.5) → DatasetConfig mit '{schema}'-Platzhalter.

    `inventory_columns`: optionaler Spalten-Snapshot des Datasets; wenn gesetzt,
    wird jede referenzierte Spalte gegen das Inventar geprüft (S2 Stufe 2).
    """
    dataset = _ident(contract.get("dataset") or contract.get("product"), "dataset")
    owner = str(contract.get("owned_by", "platform"))
    if owner not in VALID_OWNERS:
        raise CompileError(f"owned_by muss {sorted(VALID_OWNERS)} sein, nicht {owner!r}")
    g = contract.get("guarantees") or {}
    cols = inventory_columns
    checks: list[CheckDef] = []

    schema_g = g.get("schema")
    if schema_g:
        expected = _idents(schema_g.get("columns") or [], "guarantees.schema.columns", cols)
        closed = (schema_g.get("mode") or "closed") == "closed"
        checks.append(_mk(
            "schema", dataset, {},
            name="schema_columns",
            expect=("= %d" % len(expected)) if closed else (">= %d" % len(expected)),
            severity=_severity(schema_g, "critical"), owner=owner,
        ))

    for i, key in enumerate(g.get("keys") or []):
        kcols = _idents(key.get("columns") or [], f"guarantees.keys[{i}].columns", cols)
        sev = _severity(key, "critical")
        if len(kcols) == 1:
            checks.append(_mk("duplicate", dataset, {"<SPALTE>": kcols[0]},
                              name=f"key_{kcols[0]}_unique", expect="= 0",
                              severity=sev, owner=owner))
        else:
            key_expr = " || '|' || ".join(f'"{c}"' for c in kcols)
            checks.append(_mk("duplicate_composite", dataset, {"<KEY_EXPR>": key_expr},
                              name="key_" + "_".join(kcols) + "_unique", expect="= 0",
                              severity=sev, owner=owner))

    for i, ref in enumerate(g.get("referential") or []):
        where = f"guarantees.referential[{i}]"
        fk = _idents(ref.get("fk") or [], f"{where}.fk", cols)
        pk = _idents(ref.get("parent_key") or [], f"{where}.parent_key", None)
        parent = _ident(ref.get("parent"), f"{where}.parent")
        if len(fk) != 1 or len(pk) != 1:
            raise CompileError(f"{where}: zusammengesetzte FKs sind in v1 nicht unterstützt")
        checks.append(_mk(
            "reference_integrity", dataset,
            {"<DIMENSION>": parent, "<FK>": fk[0], "<PK>": pk[0]},
            name=f"ref_{fk[0]}_{parent}", expect="= 0",
            severity=_severity(ref, "fail"), owner=owner,
        ))

    fresh = g.get("freshness")
    if fresh:
        col = _ident(fresh.get("column"), "guarantees.freshness.column", cols)
        seconds = parse_iso_duration(fresh.get("max_age"))
        checks.append(_mk("freshness", dataset, {"<SPALTE>": col},
                          name=f"freshness_{col}", expect=f"< {seconds}",
                          severity=_severity(fresh, "warn"), owner=owner, unit="s"))

    vol = g.get("volume")
    if vol and vol.get("min_rows") is not None:
        min_rows = int(vol["min_rows"])
        checks.append(_mk("row_count", dataset, {},
                          name="volume_min_rows", expect=f">= {min_rows}",
                          severity=_severity(vol, "warn"), owner=owner))
    # volume.baseline=rolling ist Observability-Konfiguration (dq_baselines),
    # kein kompilierbarer Check — bewusst kein Output hier.

    for i, comp in enumerate(g.get("completeness") or []):
        col = _ident(comp.get("column"), f"guarantees.completeness[{i}].column", cols)
        max_null_pct = round(100.0 - float(comp.get("min_pct", 100)), 4)
        checks.append(_mk("completeness_pct", dataset, {"<SPALTE>": col},
                          name=f"completeness_{col}", expect=f"<= {max_null_pct}",
                          severity=_severity(comp, "warn"), owner=owner, unit="%"))

    for i, nn in enumerate(g.get("not_null") or []):
        sev = _severity(nn, "fail")
        for col in _idents(nn.get("columns") or [], f"guarantees.not_null[{i}].columns", cols):
            checks.append(_mk("missing", dataset, {"<SPALTE>": col},
                              name=f"{col}_not_null", expect="= 0",
                              severity=sev, owner=owner))

    return DatasetConfig(
        dataset=dataset,
        schema="{schema}",  # [SCHEMA-MAP] G2: Bindung erst zur Laufzeit
        contract_version=str(contract.get("version") or ""),
        owned_by=owner,
        checks=checks,
    )


def compiler_hash(contract: dict[str, Any]) -> str:
    """A4: Determinismus-Hash = f(Contract-Inhalt, Library-Version)."""
    import yaml
    contract_hash = hashlib.sha256(
        yaml.safe_dump(contract, sort_keys=True).encode()
    ).hexdigest()[:16]
    library_version = str(load_library().get("version", "1"))
    return hashlib.sha256(f"{contract_hash}:{library_version}".encode()).hexdigest()[:16]


def bind_schema(config: DatasetConfig, schema: str) -> DatasetConfig:
    """[SCHEMA-MAP] Laufzeit-Bindung: ersetzt '{schema}' in allen Checks.

    Der einzige Ort, an dem der Platzhalter aufgelöst wird (G2).
    """
    bound = _ident(schema, "environment.schema")
    config.schema = bound
    for c in config.checks:
        c.sql = c.sql.replace("{schema}", bound)
    return config

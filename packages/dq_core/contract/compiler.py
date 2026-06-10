"""Garantie → check_library → CheckDef Compiler (Stufe 1, HANDOVER WS3-1).

Der EINZIGE Ort, an dem aus einer semantischen Garantie ausführbares SQL wird.
Primärer Pfad: `compile_contract` liest das §1.5-Garantie-Format (SQL-frei) und
bildet jede Garantie-Familie auf ein `check_library`-Template ab. Der Runner
(check_engine) bleibt unverändert.

Der ODCS-v3-Pfad (`compile_contract_odcs`) ist Stufe 2 und bewusst zurückgestellt
(O1) — er bleibt als Referenz erhalten, ist aber nicht verdrahtet.

Gates:  G1  kein roher SQL im Contract (Validator erzwingt das beim PUT)
        G2  {schema} bleibt Platzhalter im Output, nie hartkodiert (A2)
        G3  jede Garantie muss auf ein check_library-Template auflösen
        S2  Bezeichner werden vor dem Binden auf Sicherheit geprüft
        A4  Determinismus: gleicher Contract ⇒ byte-identische checks.yml
"""
from __future__ import annotations

import re
from typing import Any

from ..library.check_library import check_by_id
from ..engine.models import CheckDef, DatasetConfig, VALID_OWNERS


# ODCS-library-rule → check_library-id. Gegen die genutzte ODCS-Version pinnen;
# datacontract lint erzwingt das Vokabular auf der Contract-Seite, G3 hier im Compiler.
_LIBRARY_TO_TEMPLATE = {
    "rowCount": "row_count",
    "duplicateCount": "duplicate",
    "nullCount": "missing",  # bei unit=percent → completeness_pct (s. _check_from_rule)
    "invalidCount": "invalid",
}

_OPS = {
    "mustBe": "= {0}",
    "mustNotBe": "!= {0}",
    "mustBeGreaterThan": "> {0}",
    "mustBeGreaterThanOrEqualTo": ">= {0}",
    "mustBeLessThan": "< {0}",
    "mustBeLessThanOrEqualTo": "<= {0}",
}

# Erkennt ungebundene Template-Tokens (<SPALTE>, :<YEAR>) — NICHT den Operator " < ".
_UNBOUND_TOKEN = re.compile(r":?<[A-Za-z0-9_]+>")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _custom_prop(node: dict[str, Any], key: str, default: Any = None) -> Any:
    for cp in (node.get("customProperties") or []):
        if cp.get("property") == key:
            return cp.get("value")
    return default


def _resolve_owner(node: dict[str, Any], default: str) -> str:
    owner = node.get("owned_by") or _custom_prop(node, "owned_by") or default
    if owner not in VALID_OWNERS:
        raise ValueError(f"owned_by muss {sorted(VALID_OWNERS)} sein, nicht '{owner}'")
    return owner


def _operator_to_expect(rule: dict[str, Any]) -> str:
    for key, tmpl in _OPS.items():
        if key in rule:
            return tmpl.format(rule[key])
    if "mustBeBetween" in rule:
        lo, hi = rule["mustBeBetween"]
        return f"BETWEEN {lo} AND {hi}"
    if "mustChangeByLessThanPercent" in rule:  # Toolbox-Erweiterung (Drift vs. letzter Lauf)
        return f"DELTA < {rule['mustChangeByLessThanPercent']}%"
    # Toolbox-Erweiterungen, die als customProperty mitgeführt werden (Toleranz/IN/MATCHES)
    raw = _custom_prop(rule, "expect")
    if raw:
        return str(raw)
    raise ValueError(f"Kein unterstützter Operator in Regel: {rule!r}")


def _bind(template_id: str, schema: str, dataset: str, params: dict[str, Any]) -> str:
    entry = check_by_id(template_id)
    if entry is None or not entry.get("sql_template"):
        raise ValueError(f"Unbekannte/leere templateId '{template_id}' (Gate G3)")
    sql = entry["sql_template"].replace("{schema}", schema).replace("{dataset}", dataset)
    # längste Tokens zuerst ersetzen, damit z. B. <MAX> nicht in <MAX_X> kollidiert
    for token in sorted((params or {}).keys(), key=len, reverse=True):
        sql = sql.replace(token, str(params[token]))
    leftover = _UNBOUND_TOKEN.search(sql)
    if leftover:
        raise ValueError(f"Regel '{template_id}': ungebundener Parameter {leftover.group(0)!r}")
    return sql


def _mk(
    template_id: str,
    schema: str,
    dataset: str,
    params: dict[str, Any],
    expect: str,
    severity: str,
    owner: str,
    *,
    name: str | None = None,
    unit: str = "",
) -> CheckDef:
    return CheckDef(
        name=name or template_id,
        sql=_bind(template_id, schema, dataset, params),
        expect=expect,
        severity=severity,
        type=template_id,
        unit=unit,
        owned_by=owner,
    )


def _to_seconds(value: Any, unit: str) -> int:
    factor = {"s": 1, "sec": 1, "m": 60, "min": 60, "h": 3600, "hour": 3600, "d": 86400, "day": 86400}
    return int(float(value) * factor.get(str(unit).lower(), 1))


# --------------------------------------------------------------------------- #
# Regel-/Property-/SLA-Übersetzung
# --------------------------------------------------------------------------- #
def _checks_from_property(schema: str, dataset: str, prop: dict[str, Any], default_owner: str) -> list[CheckDef]:
    col = prop.get("name")
    owner = _resolve_owner(prop, default_owner)
    sev = prop.get("severity", "fail")
    out: list[CheckDef] = []

    if prop.get("required"):
        out.append(_mk("missing", schema, dataset, {"<SPALTE>": col}, "= 0", sev, owner, name=f"{col}_not_null"))
    if prop.get("unique") or prop.get("primaryKey"):
        out.append(_mk("duplicate", schema, dataset, {"<SPALTE>": col}, "= 0", "critical", owner, name=f"{col}_unique"))

    vv = prop.get("validValues")
    if vv:
        lit = ", ".join("'%s'" % str(v).replace("'", "''") for v in vv)
        out.append(
            _mk("allowed_values", schema, dataset,
                {"<SPALTE>": col, "'<WERT1>', '<WERT2>'": lit}, "= 0", sev, owner, name=f"{col}_allowed")
        )

    lto = prop.get("logicalTypeOptions") or {}
    if "pattern" in lto:
        out.append(_mk("pattern_match", schema, dataset,
                       {"<SPALTE>": col, "<REGEX>": lto["pattern"]}, "= 0", sev, owner, name=f"{col}_pattern"))
    if "minLength" in lto or "maxLength" in lto:
        out.append(_mk("string_length", schema, dataset,
                       {"<SPALTE>": col, "<MIN>": lto.get("minLength", 0), "<MAX>": lto.get("maxLength", 2147483647)},
                       "= 0", "warn", owner, name=f"{col}_length"))
    if "minimum" in lto or "maximum" in lto:
        out.append(_mk("value_range", schema, dataset,
                       {"<SPALTE>": col, "<MIN>": lto.get("minimum"), "<MAX>": lto.get("maximum")},
                       "= 0", "fail", owner, name=f"{col}_range"))

    for rule in (prop.get("quality") or []):
        out.append(_check_from_rule(schema, dataset, rule, default_owner, column=col))
    return out


def _check_from_rule(
    schema: str, dataset: str, rule: dict[str, Any], default_owner: str, *, column: str | None = None
) -> CheckDef:
    rtype = rule.get("type", "library")
    name = rule.get("name") or rule.get("rule") or "rule"
    sev = rule.get("severity", "fail")
    owner = _resolve_owner(rule, default_owner)

    if rtype == "library":
        if rule.get("rule") not in _LIBRARY_TO_TEMPLATE:
            raise ValueError(f"Unbekannte library-rule '{rule.get('rule')}' (Gate G3)")
        tid = _LIBRARY_TO_TEMPLATE[rule["rule"]]
        if rule["rule"] == "nullCount" and rule.get("unit") == "percent":
            tid = "completeness_pct"
        params = dict(rule.get("params", {}))
        if column and "<SPALTE>" not in params:
            params["<SPALTE>"] = column
        return CheckDef(name=name, sql=_bind(tid, schema, dataset, params),
                        expect=_operator_to_expect(rule), severity=sev,
                        type=tid, unit=rule.get("unit", ""), owned_by=owner)

    if rtype == "custom" and rule.get("engine") == "hana-toolbox":
        impl = rule.get("implementation") or {}
        return CheckDef(name=name, sql=_bind(impl["templateId"], schema, dataset, impl.get("params", {})),
                        expect=impl.get("expect", "= 0"), severity=sev,
                        type=impl["templateId"], owned_by=owner)

    if rtype == "sql":  # EINZIGE SQL-Ausnahme — Gate G1
        if owner != "product":
            raise ValueError(f"Regel '{name}': roher SQL (type: sql) erfordert owned_by: product (Gate G1)")
        return CheckDef(name=name, sql=rule["query"], expect=_operator_to_expect(rule),
                        severity=sev, type="custom_sql", owned_by="product")

    raise ValueError(f"Regeltyp '{rtype}' ist nicht ausführbar (text-Regeln sind rein deskriptiv)")


def _check_from_sla(schema: str, dataset: str, sla: dict[str, Any], default_owner: str) -> CheckDef | None:
    if str(sla.get("property", "")).lower() not in ("latency", "frequency", "freshness"):
        return None
    element = sla.get("element") or ""  # Konvention: "dataset.column"
    col = element.split(".")[-1] if element else None
    if not col:
        return None
    seconds = _to_seconds(sla.get("value"), sla.get("unit", "s"))
    replication = str(sla.get("driver", "")).lower() == "replication"
    tid = "sap_replication_lag" if replication else "freshness"
    token = "<TIMESTAMP_COL>" if replication else "<SPALTE>"
    return CheckDef(name=f"freshness_{col}", sql=_bind(tid, schema, dataset, {token: col}),
                    expect=f"< {seconds}", severity=sla.get("severity", "warn"),
                    type=tid, unit="s", owned_by=_resolve_owner(sla, default_owner))


# --------------------------------------------------------------------------- #
# Stufe 2 (zurückgestellt, O1) — ODCS-v3 → CheckDef.
# Bewusst nicht verdrahtet bis R3/R9 geklärt; bleibt als Referenz erhalten.
# --------------------------------------------------------------------------- #
def compile_contract_odcs(odcs: dict[str, Any], *, schema_override: str = "") -> DatasetConfig:
    server = (odcs.get("servers") or [{}])[0]
    schema = schema_override or server.get("schema") or ""  # Gate G2
    obj = (odcs.get("schema") or [{}])[0]
    dataset = obj.get("physicalName") or obj.get("name") or ""
    default_owner = _custom_prop(odcs, "owned_by", "platform")
    if default_owner not in VALID_OWNERS:
        raise ValueError(f"Contract owned_by muss {sorted(VALID_OWNERS)} sein, nicht '{default_owner}'")

    checks: list[CheckDef] = []
    for prop in (obj.get("properties") or []):
        checks += _checks_from_property(schema, dataset, prop, default_owner)
    for rule in [*(obj.get("quality") or []), *(odcs.get("quality") or [])]:
        checks.append(_check_from_rule(schema, dataset, rule, default_owner))
    for sla in (odcs.get("slaProperties") or []):
        c = _check_from_sla(schema, dataset, sla, default_owner)
        if c:
            checks.append(c)

    return DatasetConfig(dataset=dataset, schema=schema,
                         contract_version=str(odcs.get("version") or ""),
                         owned_by=default_owner, checks=checks)


# --------------------------------------------------------------------------- #
# Stufe 1 — §1.5-Garantie-Format → CheckDef  (primärer Pfad, WS3-1)
# --------------------------------------------------------------------------- #
_SAFE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# Feste Verarbeitungsreihenfolge ⇒ deterministischer Output unabhängig von
# der Schlüsselreihenfolge im YAML (A4).
_GUARANTEE_ORDER = [
    "schema", "schema_columns", "keys", "not_null",
    "completeness", "row_count", "referential", "freshness", "volume",
]


def _ident(col: Any) -> str:
    """[S2] Bezeichner vor dem Binden prüfen; gibt den rohen Namen zurück."""
    if not _SAFE_IDENT.match(str(col)):
        raise ValueError(f"[S2] Unsicherer Bezeichner: {col!r}")
    return str(col)


def _col_token(columns: list[str]) -> str:
    """Spalten als <SPALTE>-Tokenwert; das Template liefert die äußeren Quotes.

    Einzelspalte ``A`` → ``A`` (Template macht ``"A"``).
    Mehrspaltig ``[A, B]`` → ``A", "B`` (Template macht ``"A", "B"``).
    """
    cols = [_ident(c) for c in columns]
    return '", "'.join(cols)


def _duration_to_seconds(value: Any) -> int | None:
    """ISO-8601-Dauer (PT24H/P1D) oder eine reine Stundenzahl → Sekunden."""
    if value is None:
        return None
    s = str(value)
    m = re.match(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$", s)
    if m and any(m.groups()):
        d, h, mi, se = (int(g or 0) for g in m.groups())
        return d * 86400 + h * 3600 + mi * 60 + se
    try:
        return int(float(s))
    except ValueError:
        return None


def _g_keys(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    out: list[CheckDef] = []
    for k in val or []:
        cols = k.get("columns") or []
        if not cols or not k.get("unique", True):
            continue
        out.append(_mk(
            "duplicate", schema, dataset, {"<SPALTE>": _col_token(cols)},
            "= 0", k.get("severity", "critical"), owner,
            name="key_unique_" + "_".join(_ident(c) for c in cols),
        ))
    return out


def _g_not_null(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    out: list[CheckDef] = []
    for entry in val or []:
        for col in (entry.get("columns") or []):
            out.append(_mk(
                "missing", schema, dataset, {"<SPALTE>": _ident(col)},
                "= 0", entry.get("severity", "fail"), owner, name=f"not_null_{_ident(col)}",
            ))
    return out


def _g_completeness(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    out: list[CheckDef] = []
    for entry in val or []:
        col = entry.get("column")
        if not col:
            continue
        min_pct = float(entry.get("min_pct", 100))
        max_null = round(100.0 - min_pct, 4)
        out.append(_mk(
            "completeness_pct", schema, dataset, {"<SPALTE>": _ident(col)},
            f"<= {max_null}", entry.get("severity", "warn"), owner,
            name=f"completeness_{_ident(col)}", unit="%",
        ))
    return out


def _g_row_count(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    val = val or {}
    lo, hi = val.get("min"), val.get("max")
    if lo is not None and hi is not None:
        expect = f"BETWEEN {lo} AND {hi}"
    elif lo is not None:
        expect = f">= {lo}"
    elif hi is not None:
        expect = f"<= {hi}"
    else:
        expect = "> 0"
    return [_mk("row_count", schema, dataset, {}, expect,
               val.get("severity", "critical"), owner, name="row_count")]


def _g_referential(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    out: list[CheckDef] = []
    for ref in val or []:
        fk = ref.get("fk") or []
        pk = ref.get("parent_key") or fk
        parent = ref.get("parent")
        if not fk or not parent:
            continue
        # Stufe 1: einspaltige FK; mehrspaltige FKs nutzen die erste Spalte.
        out.append(_mk(
            "reference_integrity", schema, dataset,
            {"<DIMENSION>": _ident(parent), "<FK>": _ident(fk[0]), "<PK>": _ident(pk[0])},
            "= 0", ref.get("severity", "critical"), owner,
            name=f"ref_{_ident(fk[0])}_{_ident(parent)}",
        ))
    return out


def _g_freshness(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    val = val or {}
    col = val.get("column")
    if not col:
        return []
    seconds = _duration_to_seconds(val.get("max_age")) \
        or _duration_to_seconds(val.get("max_age_hours") and val.get("max_age_hours") * 3600) \
        or 86400
    return [_mk("freshness", schema, dataset, {"<SPALTE>": _ident(col)},
               f"< {seconds}", val.get("severity", "warn"), owner,
               name=f"freshness_{_ident(col)}", unit="s")]


def _g_schema(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    val = val or {}
    columns = val.get("columns") or val.get("expected") or []
    if not columns:
        return []
    n = len(columns)
    expect = f"= {n}" if (val.get("mode") == "closed") else f">= {n}"
    return [_mk("schema", schema, dataset, {}, expect,
               val.get("severity", "critical"), owner, name="schema_columns")]


def _g_volume(schema: str, dataset: str, val: Any, owner: str) -> list[CheckDef]:
    # Volume-Bounds brauchen Obs-Baselines (WS5-1). Bis dahin: sichtbar, aber
    # deaktiviert (G6 — nie still auslassen), DELTA gegen den letzten Lauf.
    return [CheckDef(
        name="volume",
        sql=_bind("row_count", schema, dataset, {}),
        expect="DELTA <= 50%",
        severity=(val or {}).get("severity", "warn"),
        type="volume",
        owned_by=owner,
        enabled=False,
        description="Volume drift — requires WS5-1 baselines (skipped_dependency).",
    )]


_BUILDERS = {
    "schema": _g_schema,
    "schema_columns": _g_schema,
    "keys": _g_keys,
    "not_null": _g_not_null,
    "completeness": _g_completeness,
    "row_count": _g_row_count,
    "referential": _g_referential,
    "freshness": _g_freshness,
    "volume": _g_volume,
}


def compile_contract(contract: dict[str, Any], *, schema_override: str = "") -> DatasetConfig:
    """§1.5-Garantie-Format → DatasetConfig. Primärer (Stufe-1) Pfad.

    [G2] Schema bleibt als ``{schema}``-Platzhalter, sofern kein ``schema_override``
    übergeben wird — Bindung erfolgt zur Laufzeit über das Environment (A2).
    """
    schema = schema_override or "{schema}"  # [G2] niemals hartkodieren
    dataset = str(contract.get("dataset") or contract.get("product") or "")
    if dataset and not _SAFE_IDENT.match(dataset):
        raise ValueError(f"[S2] Unsicherer dataset-Name: {dataset!r}")

    owner = contract.get("owned_by", "platform")
    if owner not in VALID_OWNERS:
        raise ValueError(f"Contract owned_by muss {sorted(VALID_OWNERS)} sein, nicht '{owner}'")

    guarantees = contract.get("guarantees") or {}
    checks: list[CheckDef] = []
    seen: set[str] = set()
    for family in _GUARANTEE_ORDER:
        if family not in guarantees:
            continue
        for check in _BUILDERS[family](schema, dataset, guarantees[family], owner):
            # Doppelte Namen eindeutig machen (z. B. zwei Keys gleicher Spalten).
            base = check.name
            i = 2
            while check.name in seen:
                check.name = f"{base}_{i}"
                i += 1
            seen.add(check.name)
            checks.append(check)

    return DatasetConfig(
        dataset=dataset, schema=schema,
        contract_version=str(contract.get("version") or ""),
        owned_by=owner, checks=checks,
    )

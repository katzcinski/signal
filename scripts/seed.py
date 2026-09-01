#!/usr/bin/env python3
"""Kompletter Neuseed des lokalen Demo-Workspace.

Der Seed erzeugt eine **in sich konsistente** Landschaft: Objekte, Contracts,
kompilierte Checks, Lauf-Historie, Ampeln, Incidents, Quarantäne, Proposals,
Baselines, Profile, Schema-Drift und Betriebsdaten passen zueinander, weil
alles aus einer Quelle stammt (``scripts/demo_landscape.py``) und über die
echten Engine-Bausteine läuft:

* Check-Namen/-Erwartungen kommen aus ``compile_contract`` — nie handgetippt.
* Lauf-Rollups nutzen dieselben Funktionen wie die Engine (``_overall_status``,
  ``_gate_verdict``), inkl. Frische-Gating (``skipped_stale``) und
  Observability-Abstufung (``downgraded``) — G6-Zustände entstehen also
  genauso wie im Produktivpfad.
* Ampeln, Incidents und Quarantäne werden **aus** der Lauf-Historie abgeleitet,
  nicht daneben gesetzt.
* RCA nutzt ``dq_core.obs.rca``, Proposals ``dq_core.obs.miner``, Schema-Drift
  ``dq_core.contract.schema_drift`` — jeweils gegen die echten Daten.

Achtung: Der Seed schreibt ``data/``, ``contracts/``, ``checks/`` und
``products/`` **neu** und ersetzt dabei lokale Änderungen an diesen Dateien.
Mit ``--db-only`` bleibt der Datei-Snapshot unangetastet.

Aufruf:  ``SQLITE_DB=signal.db python scripts/seed.py [--db-only]``
"""
from __future__ import annotations

import json
import os
import random
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages"))
sys.path.insert(0, str(ROOT))

os.environ.setdefault("SQLITE_DB", "signal.db")
os.environ.setdefault("INVENTORY_FILE", "data/inventory.json")
os.environ.setdefault("LINEAGE_FILE", "data/lineage.json")
os.environ.setdefault("CONTRACTS_DIR", "contracts")
os.environ.setdefault("CHECKS_DIR", "checks")
os.environ.setdefault("PRODUCTS_DIR", "products")

from dq_core.contract.compiler import compile_contract  # noqa: E402
from dq_core.contract.compliance import compute_compliance  # noqa: E402
from dq_core.contract.schema_drift import columns_hash, detect_schema_drift  # noqa: E402
from dq_core.engine.check_engine import (  # noqa: E402
    EXPENSIVE_TYPES,
    GATE_TYPES,
    _gate_verdict,
    _overall_status,
)
from dq_core.engine.expectation import evaluate  # noqa: E402
from dq_core.engine.models import CheckDef, CheckResult, RunSummary  # noqa: E402
from dq_core.obs.baselines import BaselineManager  # noqa: E402
from dq_core.obs.miner import ProposalMiner  # noqa: E402
from dq_core.obs.rca import analyze_incident  # noqa: E402
from dq_core.store.sqlite_store import ResultStore  # noqa: E402

from scripts.build_demo_snapshot import build_snapshot, contract_dict  # noqa: E402
from scripts.demo_landscape import (  # noqa: E402
    CAPABILITIES,
    CONTRACTS_BY_PRODUCT,
    DEMO_ENVIRONMENT,
    DEMO_PROFILE_ENV,
    LAST_RUN_INDEX,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_MUTES,
    NOTIFICATION_RULES,
    OBJECTS_BY_ID,
    RUN_COUNT,
    RUN_PROFILES,
    SCHEDULES,
    RunProfile,
)

RNG_SEED = 20260803

# Steward-Namen der Demo (erscheinen als actor/owner in der Historie).
STEWARD = "Mia Steward"
OWNER = "Lucas Owner"
PLATFORM = "Platform Ops"
BOT = "signal-bot"


# ---------------------------------------------------------------------------
# Zurücksetzen
# ---------------------------------------------------------------------------

# Alles, was ausschließlich aus der Demo-Historie abgeleitet ist, wird vor dem
# Neuseed entfernt — sonst summieren sich Check-Ergebnisse, Incidents und
# Episoden über mehrere Läufe auf. Nutzer-Konfiguration (Notification-Kanäle)
# bleibt bewusst unangetastet; sie wird nur befüllt, wenn sie leer ist.
_RESET_STATEMENTS = (
    "DELETE FROM dq_diagnostics WHERE run_id LIKE 'seed-%'",
    "DELETE FROM dq_segment_results WHERE run_id LIKE 'seed-%'",
    "DELETE FROM dq_check_results WHERE run_id LIKE 'seed-%'",
    "DELETE FROM dq_run_progress WHERE run_id LIKE 'seed-%'",
    "DELETE FROM dq_progress WHERE stream_id LIKE 'seed-%'",
    "DELETE FROM dq_runs WHERE run_id LIKE 'seed-%'",
    "DELETE FROM dq_incident_events",
    "DELETE FROM dq_incident_rca",
    "DELETE FROM dq_incident_clusters",
    "DELETE FROM dq_incidents",
    "DELETE FROM dq_quarantine_events",
    "DELETE FROM dq_quarantine",
    "DELETE FROM dq_compliance_events",
    "DELETE FROM dq_compliance",
    "DELETE FROM dq_proposals",
    "DELETE FROM dq_baseline_buckets",
    "DELETE FROM dq_baselines",
    "DELETE FROM dq_schema_drift",
    "DELETE FROM dq_schema_snapshots",
    "DELETE FROM dq_profile_snapshots WHERE environment=?",
    "DELETE FROM contract_index",
    "DELETE FROM dq_schedules WHERE schedule_id LIKE 'seed-%'",
    "DELETE FROM dq_operations WHERE op_id LIKE 'seed-%'",
    "DELETE FROM dq_capabilities WHERE environment=?",
    # Nur die vom Seed angelegten Kanäle (und die daran hängenden Regeln);
    # selbst gepflegte Kanäle bleiben unberührt.
    "DELETE FROM dq_notification_rules WHERE channel_id IN "
    "(SELECT id FROM dq_notification_channels WHERE url LIKE 'https://example.invalid/%')",
    "DELETE FROM dq_notification_channels WHERE url LIKE 'https://example.invalid/%'",
    "DELETE FROM dq_notification_mutes WHERE reason LIKE 'Wartungsfenster%'",
)


def reset_seeded_state(store: ResultStore) -> None:
    """Abgeleitete Demo-Zustände entfernen, damit der Seed wiederholbar ist."""
    with sqlite3.connect(store.db_path) as conn:
        for statement in _RESET_STATEMENTS:
            if statement.endswith("environment=?"):
                param = DEMO_PROFILE_ENV if "profile" in statement else DEMO_ENVIRONMENT
                conn.execute(statement, (param,))
            else:
                conn.execute(statement)
        conn.commit()


# ---------------------------------------------------------------------------
# Check-Suiten je Dataset (aus dem Contract kompiliert)
# ---------------------------------------------------------------------------

def _contract_for(dataset: str) -> dict[str, Any]:
    return contract_dict(CONTRACTS_BY_PRODUCT[dataset])


def _compiled_checks(dataset: str) -> list[CheckDef]:
    obj = OBJECTS_BY_ID[dataset]
    config = compile_contract(_contract_for(dataset), inventory_columns=set(obj.column_names))
    return list(config.checks)


def _adaptive_checks(dataset: str, profile: RunProfile) -> list[CheckDef]:
    """Adaptive Observability-Checks, wie der Resolver sie ergänzt.

    Existieren nur für Contracts mit ``observability:``-Block; die Grenzen
    entstehen hier aus dem Profil (statt aus der Baseline-Tabelle), bleiben aber
    formgleich zu ``dq_core.obs.resolver``.
    """
    contract = _contract_for(dataset)
    obs = contract.get("observability") or {}
    checks: list[CheckDef] = []
    if obs.get("volume"):
        lo = int(profile.rows * (1 - 4 * profile.noise))
        hi = int(profile.rows * (1 + 4 * profile.noise))
        checks.append(CheckDef(
            name="volume_adaptive_rows",
            sql=f'SELECT COUNT(*) FROM "{{schema}}"."{dataset}"',
            expect=f"BETWEEN {lo} AND {hi}",
            severity="warn", type="volume_anomaly", unit="rows",
            owned_by=OBJECTS_BY_ID[dataset].owned_by, kind="internal_gate",
        ))
    if obs.get("freshness"):
        column = str((contract["guarantees"].get("freshness") or {}).get("column") or "")
        if column:
            lo = 0
            hi = int(profile.freshness_seconds * 2.2)
            checks.append(CheckDef(
                name=f"freshness_adaptive_{column}",
                sql=(f'SELECT SECONDS_BETWEEN(MAX("{column}"), CURRENT_TIMESTAMP) '
                     f'FROM "{{schema}}"."{dataset}"'),
                expect=f"BETWEEN {lo} AND {hi}",
                severity="warn", type="freshness_anomaly", unit="s",
                owned_by=OBJECTS_BY_ID[dataset].owned_by, kind="internal_gate",
            ))
    return checks


# ---------------------------------------------------------------------------
# Messwert-Generator
# ---------------------------------------------------------------------------

def _expect_bound(expect: str) -> float:
    """Zahl aus einer einfachen Erwartung ('<= 2.0', '>= 480', '< 36000')."""
    try:
        return float(expect.strip().split()[-1])
    except (ValueError, IndexError):
        return 0.0


def _generated_actual(
    check: CheckDef,
    profile: RunProfile,
    rng: random.Random,
    *,
    column_count: int,
) -> float:
    """Plausibler Messwert für einen Check — Basis vor den Störungen."""
    kind = check.type
    if kind == "schema":
        return column_count
    if kind in ("row_count", "volume_anomaly"):
        return max(0, int(profile.rows * (1 + rng.gauss(0, profile.noise))))
    if kind in ("freshness", "freshness_anomaly"):
        return max(60, int(profile.freshness_seconds * (1 + rng.gauss(0, 0.22))))
    if kind == "completeness_pct":
        limit = _expect_bound(check.expect)
        return round(max(0.0, limit * 0.35 * (1 + rng.gauss(0, 0.45))), 2)
    # Alle übrigen Familien zählen Verletzungen: sauber = 0.
    return 0


def _flaky_hit(check: CheckDef, profile: RunProfile, rng: random.Random) -> float | None:
    for name, probability in profile.flaky_checks:
        if check.name == name and rng.random() < probability:
            return float(rng.randint(1, 4))
    return None


def _degradation(check: CheckDef, profile: RunProfile, run_idx: int) -> float | None:
    for name, first, last, value in profile.degradations:
        if check.name == name and first <= run_idx <= last:
            return value
    return None


def _build_results(
    dataset: str,
    checks: list[CheckDef],
    profile: RunProfile,
    rng: random.Random,
    *,
    run_idx: int,
    column_count: int,
) -> list[CheckResult]:
    """Ein Lauf-Ergebnissatz — inkl. Frische-Gating und Fehlerläufen."""
    errored = run_idx in profile.error_runs
    results: list[CheckResult] = []
    for check in checks:
        actual = _generated_actual(check, profile, rng, column_count=column_count)
        override = _degradation(check, profile, run_idx)
        if override is None:
            override = _flaky_hit(check, profile, rng)
        if override is not None:
            actual = override

        if errored:
            results.append(CheckResult(
                name=check.name, sql=check.sql, expect=check.expect,
                severity=check.severity, passed=False, actual_value=None,
                error="Verbindung zum Environment waehrend der Ausfuehrung verloren",
                duration_ms=rng.randint(200, 900), state="error",
                type=check.type, kind=check.kind, enforcement=check.enforcement,
            ))
            continue

        results.append(CheckResult(
            name=check.name, sql=check.sql, expect=check.expect,
            severity=check.severity, passed=evaluate(actual, check.expect),
            actual_value=str(actual), duration_ms=rng.randint(15, 780),
            state="executed", type=check.type, kind=check.kind,
            enforcement=check.enforcement,
        ))

    if errored:
        return results

    # Frische-Gating (wie ``_run_with_gating``): reisst ein Gate-Check, werden
    # teure Checks nicht ausgeführt — sichtbar als skipped_stale (G6).
    stale = any(
        not r.passed and r.state == "executed"
        for r in results
        if r.type in GATE_TYPES
    )
    if stale:
        for idx, result in enumerate(results):
            if result.type in EXPENSIVE_TYPES:
                results[idx] = CheckResult(
                    name=result.name, sql=result.sql, expect=result.expect,
                    severity=result.severity, passed=False, actual_value=None,
                    state="skipped_stale", type=result.type, kind=result.kind,
                    enforcement=result.enforcement,
                )
    return results


def _downgraded_results(checks: list[CheckDef]) -> list[CheckResult]:
    """Adaptive Checks ohne belastbare Baseline — abgestuft statt geraten."""
    return [
        CheckResult(
            name=check.name, sql=check.sql, expect="baseline_ready",
            severity="warn", passed=False, actual_value=None,
            error="baseline_warmup", state="downgraded",
            type=check.type, kind=check.kind,
        )
        for check in checks
    ]


# ---------------------------------------------------------------------------
# Lauf-Historie
# ---------------------------------------------------------------------------

def _run_id(dataset: str, run_idx: int) -> str:
    return f"seed-{dataset}-{run_idx:02d}"


def _run_started(base_now: datetime, dataset: str, run_idx: int) -> datetime:
    """Ein Lauf pro Tag; die Uhrzeit streut je Dataset stabil."""
    offset_hour = 2 + (sum(ord(c) for c in dataset) % 6)
    day = base_now - timedelta(days=LAST_RUN_INDEX - run_idx)
    return day.replace(hour=offset_hour, minute=(run_idx * 7) % 60, second=0, microsecond=0)


def seed_run_history(store: ResultStore, *, base_now: datetime) -> dict[str, Any]:
    """35 Läufe je zertifiziertem Dataset. Rückgabe: Historie-Index."""
    history: dict[str, list[dict[str, Any]]] = {}
    run_count = 0

    for dataset, profile in RUN_PROFILES.items():
        obj = OBJECTS_BY_ID[dataset]
        contract = _contract_for(dataset)
        checks = _compiled_checks(dataset)
        adaptive = _adaptive_checks(dataset, profile)
        base_columns = len(obj.columns)
        rng = random.Random(f"{RNG_SEED}:{dataset}")

        history[dataset] = []
        for run_idx in range(RUN_COUNT):
            column_count = base_columns
            if profile.schema_drift_from is not None and run_idx >= profile.schema_drift_from:
                column_count += 1

            results = _build_results(
                dataset, checks, profile, rng,
                run_idx=run_idx, column_count=column_count,
            )
            # Adaptive Checks: erst nach der Warmup-Phase belastbar.
            if adaptive:
                if run_idx in profile.downgraded_runs or run_idx < BaselineManager.WARMUP_N:
                    results.extend(_downgraded_results(adaptive))
                else:
                    results.extend(_build_results(
                        dataset, adaptive, profile, rng,
                        run_idx=run_idx, column_count=column_count,
                    ))

            started = _run_started(base_now, dataset, run_idx)
            finished = started + timedelta(seconds=rng.randint(8, 160))
            executed = [r for r in results if r.state in ("executed", "error")]
            summary = RunSummary(
                run_id=_run_id(dataset, run_idx),
                dataset=dataset,
                schema=obj.space,
                started_at=started.isoformat(),
                finished_at=finished.isoformat(),
                overall_status=_overall_status(results),
                total=len(results),
                passed=sum(1 for r in executed if r.passed),
                failed=sum(1 for r in executed if not r.passed and r.severity in ("critical", "fail")),
                warnings=sum(1 for r in executed if not r.passed and r.severity == "warn"),
                results=results,
                triggered_by="schedule" if run_idx % 4 else "ui",
                actor=BOT if run_idx % 4 else STEWARD,
                contract_version=str(contract.get("version") or ""),
                run_state="finished",
                gate_verdict=_gate_verdict(results),
            )
            store.save_run(summary)
            run_count += 1
            history[dataset].append({
                "run_id": summary.run_id,
                "run_idx": run_idx,
                "started_at": summary.started_at,
                "status": summary.overall_status,
                "verdict": summary.gate_verdict,
                "failed_checks": [
                    r.name for r in executed
                    if not r.passed and r.severity in ("critical", "fail", "warn")
                ],
                "breaching_checks": [
                    r.name for r in executed
                    if not r.passed and r.severity in ("critical", "fail")
                ],
                "severity": "critical" if summary.overall_status == "critical" else "fail",
                "column_count": column_count,
            })

    return {"runs": run_count, "history": history}


def seed_running_run(store: ResultStore, *, base_now: datetime) -> int:
    """Ein noch laufender Lauf inkl. Progress-Zeilen für die Live-Ansicht."""
    dataset = "ic_sales_order_item_v"
    if dataset not in RUN_PROFILES:
        return 0
    run_id = f"seed-{dataset}-running"
    started = base_now - timedelta(minutes=3)
    summary = RunSummary(
        run_id=run_id,
        dataset=dataset,
        schema=OBJECTS_BY_ID[dataset].space,
        started_at=started.isoformat(),
        finished_at="",
        overall_status="pass",
        total=0, passed=0, failed=0, warnings=0,
        results=[],
        triggered_by="ui",
        actor=STEWARD,
        contract_version=str(_contract_for(dataset).get("version") or ""),
        run_state="running",
    )
    store.save_run(summary)
    for line in (
        f"[DQ] Lauf gestartet fuer {dataset} (Environment {DEMO_ENVIRONMENT})",
        "[DQ] Schema gebunden, 12 Checks kompiliert",
        "[DQ]   PASS: schema_columns (= 12)",
        "[DQ]   PASS: key_SALES_ORDER_ID_ORDER_ITEM_ID_unique (= 0)",
        "[DQ] Fuehre teure Konsistenzchecks aus ...",
    ):
        store.append_progress(run_id, line)
    return 1


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------

def seed_baselines(store: ResultStore) -> int:
    """Rollende und saisonale Baselines aus der echten Messhistorie."""
    manager = BaselineManager(store)
    written = 0
    for dataset in RUN_PROFILES:
        contract = _contract_for(dataset)
        obs = contract.get("observability") or {}
        for metric, values in _numeric_series(store, dataset).items():
            if len(values) < BaselineManager.WARMUP_N:
                continue
            manager.update_baseline(dataset, metric, values)
            written += 1
            family = "volume" if metric == "volume_min_rows" else "freshness"
            cfg = obs.get(family) or {}
            if cfg.get("baseline") == "seasonal":
                buckets: dict[str, list[float]] = {}
                for at, value in _numeric_points(store, dataset, metric):
                    key = manager.bucket_key_for(at, cfg.get("season") or ["dow"])
                    buckets.setdefault(key, []).append(value)
                for key, bucket_values in buckets.items():
                    manager.update_baseline(
                        dataset, metric, bucket_values,
                        strategy="seasonal", bucket_key=key,
                    )
                    written += 1
    return written


def _numeric_points(store: ResultStore, dataset: str, metric: str) -> list[tuple[str, float]]:
    with sqlite3.connect(store.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT r.started_at AS at, cr.actual_value AS value
                 FROM dq_check_results cr JOIN dq_runs r ON cr.run_id = r.run_id
                WHERE r.dataset=? AND cr.check_name=? AND cr.state='executed'
                  AND cr.actual_value IS NOT NULL
                ORDER BY r.started_at""",
            (dataset, metric),
        ).fetchall()
    out: list[tuple[str, float]] = []
    for row in rows:
        try:
            out.append((row["at"], float(row["value"])))
        except (TypeError, ValueError):
            continue
    return out


def _numeric_series(store: ResultStore, dataset: str) -> dict[str, list[float]]:
    """Messreihen der Observability-Metriken (row_count / freshness) je Check."""
    with sqlite3.connect(store.db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT cr.check_name AS name, cr.actual_value AS value
                 FROM dq_check_results cr JOIN dq_runs r ON cr.run_id = r.run_id
                WHERE r.dataset=? AND cr.state='executed'
                  AND cr.check_type IN ('row_count','freshness')
                  AND cr.actual_value IS NOT NULL
                ORDER BY r.started_at""",
            (dataset,),
        ).fetchall()
    series: dict[str, list[float]] = {}
    for row in rows:
        try:
            series.setdefault(row["name"], []).append(float(row["value"]))
        except (TypeError, ValueError):
            continue
    return series


# ---------------------------------------------------------------------------
# Compliance-Ampeln (aus der Historie abgeleitet)
# ---------------------------------------------------------------------------

BOUNDARY_KINDS = ("consumer_contract", "provider_contract")


def compliance_for_run(store: ResultStore, run_id: str) -> str:
    """Ampel eines Laufs — genau wie der Live-Pfad sie berechnet.

    Gleiche Regel und gleicher Filter wie ``routers/objects.py``: nur Ergebnisse
    von Contract-Checks zählen, und die Zustände sind ausschliesslich die des
    Modells (``compliant``/``breached``/``unknown``). Der Seed darf keine
    Zustände erfinden, die die Engine nie erzeugt.
    """
    run = store.get_run(run_id) or {}
    contract_results = [r for r in run.get("results", []) if r["kind"] in BOUNDARY_KINDS]
    return compute_compliance(contract_results)


def seed_compliance(store: ResultStore, history: dict[str, list[dict]]) -> int:
    """Ampel je Boundary-Contract — abgeleitet aus den echten Lauf-Ergebnissen.

    Die Übergänge entstehen dabei echt: der Seed spielt die letzten Läufe der
    Reihe nach ein, sodass ``dq_compliance_events`` eine plausible Historie
    trägt statt eines einzelnen Sprungs.
    """
    written = 0
    for dataset, runs in history.items():
        spec = CONTRACTS_BY_PRODUCT[dataset]
        if spec.kind == "internal_gate":
            continue  # interne Gates tragen keine Contract-Ampel

        previous = None
        transitions: list[tuple[str, str]] = []   # (run_id, started_at)
        for entry in runs[-12:]:
            state = compliance_for_run(store, entry["run_id"])
            store.set_compliance(dataset, spec.version, state, entry["run_id"])
            if state != previous:
                transitions.append((entry["run_id"], entry["started_at"]))
                previous = state
        _backdate_compliance(store, dataset, transitions)
        written += 1
    return written


def _backdate_compliance(
    store: ResultStore, product: str, transitions: list[tuple[str, str]]
) -> None:
    """Übergangszeitpunkte auf die auslösenden Läufe legen."""
    if not transitions:
        return
    with sqlite3.connect(store.db_path) as conn:
        for run_id, at in transitions:
            conn.execute(
                "UPDATE dq_compliance_events SET at=? WHERE product=? AND run_id=?",
                (at, product, run_id),
            )
        conn.execute(
            "UPDATE dq_compliance SET since=? WHERE product=?",
            (transitions[-1][1], product),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Incidents (aus Fehler-Episoden der Historie)
# ---------------------------------------------------------------------------

def _episodes(runs: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Zusammenhängende Läufe mit fail/critical → eine Episode."""
    episodes: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for entry in runs:
        if entry["status"] in ("fail", "critical", "error") and entry["breaching_checks"]:
            current.append(entry)
        elif current:
            episodes.append(current)
            current = []
    if current:
        episodes.append(current)
    return episodes


def _impacted_objects(lineage: dict[str, Any], root: str) -> list[dict[str, Any]]:
    """Downstream-Objekte mit Distanz — Blast-Radius für den Incident."""
    adjacency = lineage.get("adjacency") or {}
    nodes = {n["id"]: n for n in lineage.get("nodes") or []}
    out: list[dict[str, Any]] = []
    seen = {root}
    frontier = [(root, 0)]
    while frontier:
        current, distance = frontier.pop(0)
        for target in adjacency.get(current, []):
            if target in seen:
                continue
            seen.add(target)
            node = nodes.get(target, {})
            out.append({
                "product": target,
                "distance": distance + 1,
                "object_type": node.get("type", ""),
                "space": node.get("space", ""),
                "layer": node.get("layer", ""),
                "role": node.get("role", ""),
            })
            frontier.append((target, distance + 1))
    return sorted(out, key=lambda item: (item["distance"], item["product"]))


_INCIDENT_TITLES = {
    "duplicate": "Doppelte Schlüssel",
    "duplicate_composite": "Doppelte Schlüssel",
    "completeness_pct": "Vollständigkeit unter dem Zusagewert",
    "completeness_pct_segment": "Vollständigkeit in einzelnen Segmenten verletzt",
    "missing": "Pflichtfeld nicht gefüllt",
    "freshness": "Frische-Zusage verletzt",
    "row_count": "Volumen unter der Untergrenze",
    "reference_integrity": "Referenzen ohne Gegenstück",
    "value_range": "Werte ausserhalb des Wertebereichs",
    "allowed_values": "Unerlaubte Werte",
    "pattern_match": "Format weicht vom Muster ab",
    "string_length": "Feldlänge ausserhalb der Zusage",
    "schema": "Schema weicht vom Contract ab",
}

_SEVERITY_RANK = {"critical": 0, "fail": 1, "warn": 2}


def _leading_failure(store: ResultStore, run_id: str, checks: list[str]) -> dict[str, Any] | None:
    """Der schwerwiegendste gerissene Check des Laufs — trägt den Titel."""
    results = [
        row for row in (store.get_run(run_id) or {}).get("results", [])
        if row["check_name"] in checks and not row["passed"]
    ]
    if not results:
        return None
    return sorted(results, key=lambda r: (_SEVERITY_RANK.get(r["severity"], 9), r["id"]))[0]


def _incident_title(store: ResultStore, run_id: str, checks: list[str]) -> str:
    leading = _leading_failure(store, run_id, checks)
    if leading is None:
        return f"Contract-Verletzung ({', '.join(checks[:2])})"
    if leading["state"] == "error":
        return "Lauf abgebrochen — Checks konnten nicht ausgeführt werden"
    label = _INCIDENT_TITLES.get(leading["check_type"], "Contract-Verletzung")
    return f"{label} ({leading['check_name']})"


def _incident_worthy(episode: list[dict[str, Any]]) -> bool:
    """Nur belastbare Episoden werden zum Incident.

    Ein einzelner Ausrutscher in einem Lauf ist Rauschen — erst eine Episode
    über mehrere Läufe, eine kritische Severity oder ein noch offener Zustand
    im jüngsten Lauf rechtfertigt einen Vorfall mit Lifecycle.
    """
    return (
        len(episode) > 1
        or any(entry["status"] == "critical" for entry in episode)
        or episode[-1]["run_idx"] == LAST_RUN_INDEX
    )


def seed_incidents(
    store: ResultStore,
    history: dict[str, list[dict]],
    lineage: dict[str, Any],
    *,
    base_now: datetime,
) -> int:
    """Für jede belastbare Fehler-Episode ein Incident mit Lifecycle, RCA, Cluster."""
    contract_index = store.get_contract_index()
    created = 0

    for dataset, runs in sorted(history.items()):
        spec = CONTRACTS_BY_PRODUCT[dataset]
        for episode in _episodes(runs):
            if not _incident_worthy(episode):
                continue
            first, last = episode[0], episode[-1]
            checks = sorted({c for entry in episode for c in entry["breaching_checks"]})
            opened = store.open_incident_record(
                dataset,
                first["run_id"],
                first["severity"],
                _incident_title(store, first["run_id"], checks),
                checks,
                spec.version,
                kind=spec.kind,
                actor=BOT,
                impacted_objects=_impacted_objects(lineage, dataset),
            )
            if opened is None or not opened.created:
                continue
            created += 1
            incident_id = opened.incident_id

            opened_at = _parse(first["started_at"])
            ongoing = last["run_idx"] == LAST_RUN_INDEX
            if ongoing:
                store.transition_incident(
                    incident_id, "acknowledged", actor=STEWARD,
                    owner=f"{dataset.split('_')[0]}.oncall",
                    note="Übernommen, Ursache wird eingegrenzt.",
                )
                if first["severity"] == "critical":
                    store.transition_incident(
                        incident_id, "investigating", actor=OWNER,
                        note="Upstream-Lauf wird gegen die Quelle abgeglichen.",
                    )
            else:
                store.transition_incident(
                    incident_id, "acknowledged", actor=STEWARD,
                    owner=f"{dataset.split('_')[0]}.oncall",
                )
                store.transition_incident(
                    incident_id, "resolved", actor=STEWARD,
                    note="Nachlauf der Quelle abgeschlossen, Folgelauf wieder grün.",
                )

            # Zeitstempel des Lifecycles auf die Episode legen (die Store-API
            # stempelt bewusst mit "jetzt" — für die Demo-Historie zu spät).
            _backdate_incident_timeline(
                store, incident_id,
                opened_at=opened_at,
                closed_at=None if ongoing else _parse(last["started_at"]) + timedelta(hours=5),
            )

            # Korrelation: Incidents desselben Laufzeitfensters clustern.
            store.assign_incident_cluster(
                incident_id, f"{first['started_at'][:10]}:{checks[0] if checks else dataset}",
            )

            # RCA über die echte Heuristik gegen Lineage + Historie.
            run = store.get_run(first["run_id"]) or {}
            incident = store.get_incident(incident_id) or {}
            snapshot = analyze_incident(
                incident=incident,
                run=run,
                lineage=lineage,
                contract_index=contract_index,
                recent_failures=store.get_recent_failures(first["started_at"], window_minutes=180),
                prior_incidents=store.get_prior_incidents(dataset, first["started_at"], days=90),
            )
            store.save_incident_rca(incident_id, snapshot)

    del base_now
    return created


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _backdate_incident_timeline(
    store: ResultStore,
    incident_id: int,
    *,
    opened_at: datetime,
    closed_at: datetime | None,
) -> None:
    """Öffnung, Timeline-Events und Resolved-Zeitpunkt in die Episode legen.

    Die Events behalten ihre Reihenfolge (nach ``id``) und werden gleichmässig
    zwischen Öffnung und Abschluss verteilt; eine offene Episode endet beim
    letzten bekannten Zeitpunkt der Episode.
    """
    end = closed_at or (opened_at + timedelta(hours=6))
    with sqlite3.connect(store.db_path) as conn:
        conn.row_factory = sqlite3.Row
        event_ids = [
            row["id"] for row in conn.execute(
                "SELECT id FROM dq_incident_events WHERE incident_id=? ORDER BY id",
                (incident_id,),
            )
        ]
        span = (end - opened_at) / max(1, len(event_ids) - 1) if len(event_ids) > 1 else timedelta()
        for position, event_id in enumerate(event_ids):
            conn.execute(
                "UPDATE dq_incident_events SET at=? WHERE id=?",
                ((opened_at + span * position).isoformat(), event_id),
            )
        conn.execute(
            "UPDATE dq_incidents SET opened_at=? WHERE id=?",
            (opened_at.isoformat(), incident_id),
        )
        if closed_at is not None:
            conn.execute(
                "UPDATE dq_incidents SET resolved_at=? WHERE id=? AND status='resolved'",
                (closed_at.isoformat(), incident_id),
            )
        conn.commit()


# ---------------------------------------------------------------------------
# Quarantäne
# ---------------------------------------------------------------------------

def seed_quarantine(store: ResultStore, history: dict[str, list[dict]]) -> int:
    """Episoden über den vollen Lifecycle, nur für Contracts mit Quarantäne.

    Quelle sind echte Verletzungen aus der Historie: Contracts mit
    ``enforcement`` ``gate``/``quarantine`` parken bei einem Breach Zeilen.
    Noch laufende Episoden bleiben offen bzw. abgeglichen, abgeschlossene
    durchlaufen abwechselnd Freigabe/Rückführung bzw. Ablösung — so trägt jeder
    Tab des Quarantäne-Screens Daten.
    """
    created = 0
    closed_seen = 0
    open_seen = 0
    for dataset, runs in sorted(history.items()):
        spec = CONTRACTS_BY_PRODUCT[dataset]
        if not spec.quarantine_style and spec.enforcement_default not in ("quarantine", "gate"):
            continue
        for episode in _episodes(runs):
            if not _incident_worthy(episode):
                continue
            entry = episode[0]
            checks = sorted({c for item in episode for c in item["breaching_checks"]})
            quarantine_id = store.open_quarantine(
                dataset, entry["run_id"], checks,
                contract_version=spec.version,
                manifest_hash=f"seed-{dataset}-{entry['run_idx']:02d}",
                actor=BOT,
            )
            if not quarantine_id:
                continue
            created += 1

            if episode[-1]["run_idx"] == LAST_RUN_INDEX:
                # Laufende Episode: eine bleibt roh offen, die nächste ist
                # abgeglichen und wartet auf die Freigabeentscheidung.
                if open_seen:
                    store.reconcile_quarantine(quarantine_id, 40 + 17 * open_seen, actor=BOT)
                open_seen += 1
                continue

            store.reconcile_quarantine(quarantine_id, 12 + 9 * closed_seen, actor=BOT)
            if closed_seen % 3 == 0:
                store.release_quarantine(
                    quarantine_id, STEWARD,
                    note="Nachlieferung validiert, Zeilen freigegeben.",
                )
                store.resolve_quarantine(
                    quarantine_id, OWNER, reason="reprocessed",
                    note="Rückführung in den Zielbestand bestätigt.",
                )
            elif closed_seen % 3 == 1:
                store.release_quarantine(
                    quarantine_id, STEWARD,
                    note="Nach Korrektur an der Quelle freigegeben.",
                )
            else:
                store.supersede_quarantine(
                    quarantine_id, actor=BOT,
                    note="Prädikat durch eine neuere Contract-Version abgelöst.",
                )
            closed_seen += 1
    return created


# ---------------------------------------------------------------------------
# Proposals (echtes Mining + Steward-Entscheidungen)
# ---------------------------------------------------------------------------

def _is_useful_proposal(proposal: Any) -> bool:
    """Nur Vorschläge auf Schwellen, die ein Steward wirklich entscheidet.

    Der Miner schlägt auch Verengungen auf strukturellen Checks vor (z. B.
    ``schema_columns``); die sind fachlich uninteressant und wären für die Demo
    irreführend.
    """
    name = str(proposal.check_name or "")
    return (
        name == "volume_min_rows"
        or name.startswith("freshness_")
        or name.startswith("completeness_")
    )


def seed_proposals(store: ResultStore, history: dict[str, list[dict]]) -> int:
    """Mined Proposals aus der echten Historie; drei davon werden entschieden.

    Die Entscheidungen liegen bewusst auf den Datasets mit den *jüngsten*
    Läufen: ``GET /api/proposals`` mint live über die letzten Läufe, eine
    Entscheidung auf einem älteren Dataset wäre im Cockpit nicht sichtbar.
    """
    miner = ProposalMiner(store)
    recent_first = sorted(
        RUN_PROFILES,
        key=lambda ds: history[ds][-1]["started_at"] if history.get(ds) else "",
        reverse=True,
    )
    mined: list[Any] = []
    for dataset in recent_first:
        spec = CONTRACTS_BY_PRODUCT[dataset]
        current = {c.name: c.expect for c in _compiled_checks(dataset)}
        mined.extend(
            p for p in miner.mine(dataset, current, kind=spec.kind) if _is_useful_proposal(p)
        )
    if not mined:
        return 0

    # Je Dataset höchstens eine Entscheidung — sonst hängen alle drei am
    # alphabetisch ersten Produkt.
    by_product: dict[str, Any] = {}
    for proposal in mined:
        by_product.setdefault(proposal.product, proposal)
    mined = list(by_product.values())

    decisions = ["accepted", "snoozed", "rejected"]
    written = 0
    with sqlite3.connect(store.db_path) as conn:
        for proposal, status in zip(mined, decisions):
            conn.execute(
                """INSERT OR REPLACE INTO dq_proposals
                   (id, product, guarantee_patch, evidence, status, created_at)
                   VALUES (?,?,?,?,?,?)""",
                (
                    proposal.id,
                    proposal.product,
                    proposal.proposed_expect,
                    json.dumps({
                        "check_name": proposal.check_name,
                        "current_expect": proposal.current_expect,
                        "rationale": proposal.rationale,
                        "confidence": proposal.confidence,
                        "stats": proposal.stats,
                    }),
                    status,
                    proposal.created_at or datetime.now(timezone.utc).isoformat(),
                ),
            )
            written += 1
        conn.commit()
    return written


# ---------------------------------------------------------------------------
# Profile / Schema-Snapshots / Segment-Ergebnisse
# ---------------------------------------------------------------------------

def _profile_column(
    row_count: int,
    *,
    column: str,
    data_type: str,
    distinct: int,
    null_pct: float = 0.0,
    empty_pct: float | None = None,
    pk_candidate: bool = False,
    minimum: Any = None,
    maximum: Any = None,
    avg: Any = None,
    median: Any = None,
) -> dict[str, Any]:
    nulls = int(round(row_count * (null_pct / 100.0)))
    empties = None if empty_pct is None else int(round(row_count * (empty_pct / 100.0)))
    uniqueness = round((distinct / row_count) * 100.0, 2) if row_count else 0.0
    return {
        "column": column,
        "data_type": data_type,
        "total": row_count,
        "nulls": nulls,
        "null_pct": round(null_pct, 2),
        "distinct": distinct,
        "uniqueness_pct": uniqueness,
        "pk_candidate": pk_candidate,
        "empty_count": empties,
        "empty_pct": None if empty_pct is None else round(empty_pct, 2),
        "min": minimum,
        "max": maximum,
        "avg": avg,
        "median": median,
    }


def _profile_snapshot(
    dataset: str,
    row_count: int,
    *,
    rng: random.Random,
    null_boost: float = 0.0,
    issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Profil-Snapshot aus der echten Spaltenliste des Objekts."""
    obj = OBJECTS_BY_ID[dataset]
    key_columns = obj.key_columns or [obj.column_names[0]]
    columns: list[dict[str, Any]] = []
    for name, cds_type, is_key, _label in obj.columns:
        numeric = cds_type in ("cds.Decimal", "cds.Integer", "cds.Double")
        if is_key:
            distinct = row_count
            null_pct = 0.0
        else:
            distinct = max(1, int(row_count * rng.uniform(0.02, 0.9)))
            null_pct = round(max(0.0, rng.uniform(0.0, 1.6) + null_boost), 2)
        columns.append(_profile_column(
            row_count,
            column=name,
            data_type=cds_type,
            distinct=distinct,
            null_pct=null_pct,
            pk_candidate=is_key,
            empty_pct=None if numeric else round(rng.uniform(0.0, 1.1), 2),
            minimum=round(rng.uniform(0.0, 40.0), 2) if numeric else None,
            maximum=round(rng.uniform(400.0, 90000.0), 2) if numeric else None,
            avg=round(rng.uniform(80.0, 4000.0), 2) if numeric else None,
            median=round(rng.uniform(70.0, 3800.0), 2) if numeric else None,
        ))

    ranked_single = [
        {
            "column": column,
            "exact": idx == 0,
            "distinct": row_count,
            "uniqueness_pct": 100.0,
            "rank_reason": "Schlüsselkandidat aus dem CSN-Schlüssel",
            "technical_score": 94 - idx,
            "business_score": 90 - idx,
            "final_score": 92 - idx,
            "reasons": ["nonnull", "unique", "key in CSN"],
        }
        for idx, column in enumerate(key_columns)
    ]
    return {
        "schema": obj.space,
        "table": dataset,
        "view": dataset,
        "row_count": row_count,
        "column_count": len(columns),
        "columns": columns,
        "pk_candidates": {
            "single": key_columns[:1],
            "composite": [key_columns] if len(key_columns) > 1 else [],
            "ranked_single": ranked_single,
            "ranked_composite": [],
            "search_meta": {
                "max_width": 4,
                "eligible_columns": len(columns),
                "eligible_column_names": [c["column"] for c in columns],
                "heuristic_combo_count": len(key_columns),
            },
        },
        "profiling": {
            "empty_string_columns": [
                {"column": c["column"], "empty_count": c["empty_count"], "empty_pct": c["empty_pct"]}
                for c in columns if c.get("empty_count")
            ],
            "numeric_stats": [
                {"column": c["column"], "min": c["min"], "max": c["max"],
                 "avg": c["avg"], "median": c["median"]}
                for c in columns if c.get("avg") is not None
            ],
        },
        "issues": issues or [],
        "scores": {
            "overall_key_confidence": 92 if len(key_columns) == 1 else 86,
            "uniqueness": 96,
            "completeness": 88 if null_boost else 94,
            "business_fit": 87,
            "compound_viability": 74,
        },
        "heuristics": {"seeded": True},
    }


# Objekte mit zwei Profil-Ständen — Basis für den Objekt-Diff im Cockpit.
PROFILED_DATASETS = (
    "bc_sales_order_item_fact_v",
    "ic_customer_v",
    "bc_customer_dim_v",
    "bc_revenue_monthly_fact_v",
)


def seed_profiles(store: ResultStore) -> int:
    inserted = 0
    for dataset in PROFILED_DATASETS:
        profile = RUN_PROFILES[dataset]
        rng = random.Random(f"{RNG_SEED}:profile:{dataset}")
        with sqlite3.connect(store.db_path) as conn:
            existing = conn.execute(
                "SELECT COUNT(*) FROM dq_profile_snapshots WHERE object_name=? AND environment=?",
                (dataset, DEMO_PROFILE_ENV),
            ).fetchone()[0]
        if existing:
            continue
        store.save_profile_snapshot(
            dataset,
            _profile_snapshot(dataset, int(profile.rows * 0.94), rng=rng),
            environment=DEMO_PROFILE_ENV,
        )
        store.save_profile_snapshot(
            dataset,
            _profile_snapshot(
                dataset, profile.rows, rng=rng,
                null_boost=2.4 if profile.degradations else 0.0,
                issues=(
                    [{"column": profile.degradations[0][0].split("_", 1)[-1],
                      "type": "null_spike",
                      "detail": "Null-Rate nach dem letzten Quell-Release gestiegen."}]
                    if profile.degradations else []
                ),
            ),
            environment=DEMO_PROFILE_ENV,
        )
        inserted += 2
    return inserted


def seed_schema_snapshots(store: ResultStore, inventory: list[dict[str, Any]]) -> int:
    """Schema-Snapshot je Contract + Drift-Befund, wo die Quelle abweicht."""
    by_id = {obj["id"]: obj for obj in inventory}
    written = 0
    for dataset, profile in RUN_PROFILES.items():
        spec = CONTRACTS_BY_PRODUCT[dataset]
        contract = _contract_for(dataset)
        columns = list(by_id[dataset]["columns"])

        if profile.schema_drift_from is not None and profile.schema_drift_column:
            columns = columns + [{
                "name": profile.schema_drift_column,
                "type": "cds.String",
                "key": "",
                "nullable": "",
                "businessName": "Produkthierarchie",
            }]

        store.save_schema_snapshot(dataset, columns, columns_hash(columns))
        written += 1

        findings = detect_schema_drift(contract, columns)
        if findings:
            store.record_schema_drift(
                dataset,
                [f.to_dict() for f in findings],
                contract_version=spec.version,
            )
    return written


SEGMENT_VALUES = ("DE10", "DE20", "AT10", "CH10", "FR10", "NL10")


def seed_segment_results(store: ResultStore, history: dict[str, list[dict]]) -> int:
    """Segment-Detailzeilen zum segmentierten Vollständigkeits-Check.

    Die Anzahl gerissener Segmente entspricht exakt dem gemessenen Wert des
    Checks im jeweiligen Lauf — Detail und Aggregat widersprechen sich nicht.
    """
    dataset = "bc_sales_order_item_fact_v"
    check_name = "completeness_REGION_CODE_by_SALES_ORG"
    if dataset not in history:
        return 0
    checks = {c.name: c for c in _compiled_checks(dataset)}
    if check_name not in checks:
        return 0
    threshold = 100.0 - 98.0   # min_pct der Garantie → max. erlaubte Null-Quote

    rng = random.Random(f"{RNG_SEED}:segments")
    written = 0
    for entry in history[dataset][-8:]:
        run = store.get_run(entry["run_id"]) or {}
        measured = next(
            (r["actual_value"] for r in run.get("results", []) if r["check_name"] == check_name),
            None,
        )
        try:
            breached_count = int(float(measured))
        except (TypeError, ValueError):
            continue

        rows: list[dict[str, Any]] = []
        for position, org in enumerate(SEGMENT_VALUES):
            breached = position < breached_count
            actual = (
                round(rng.uniform(threshold + 0.6, threshold + 4.5), 2) if breached
                else round(rng.uniform(0.0, threshold * 0.8), 2)
            )
            rows.append({
                "segment_value": org,
                "actual_value": actual,
                "threshold_value": threshold,
                "breached": breached,
            })
        store.save_segment_results(entry["run_id"], check_name, "SALES_ORG", rows)
        written += len(rows)
    return written


# ---------------------------------------------------------------------------
# Betriebsdaten
# ---------------------------------------------------------------------------

def seed_notifications(store: ResultStore, *, base_now: datetime) -> int:
    seeded_urls = {cfg["url"] for cfg in NOTIFICATION_CHANNELS}
    if any(c["url"] in seeded_urls for c in store.list_notification_channels()):
        return 0
    channels = [
        store.create_notification_channel(
            name=cfg["name"], type=cfg["type"], url=cfg["url"],
            enabled=cfg["enabled"], actor=PLATFORM,
        )
        for cfg in NOTIFICATION_CHANNELS
    ]
    written = len(channels)
    for rule in NOTIFICATION_RULES:
        created = store.create_notification_rule(
            name=rule["name"],
            channel_id=int(channels[rule["channel"]]["id"]),
            match_severity=rule.get("match_severity", ""),
            match_space=rule.get("match_space", ""),
            match_product=rule.get("match_product", ""),
            match_owned_by=rule.get("match_owned_by", ""),
            match_kind=rule.get("match_kind", ""),
            enabled=rule.get("enabled", True),
            actor=PLATFORM,
        )
        if created:
            written += 1
    for mute in NOTIFICATION_MUTES:
        starts = base_now + timedelta(days=mute["starts_in_days"])
        store.create_notification_mute(
            starts_at=starts.isoformat(),
            ends_at=(starts + timedelta(days=mute["duration_days"])).isoformat(),
            reason=mute["reason"],
            match_space=mute.get("match_space", ""),
            match_product=mute.get("match_product", ""),
            actor=PLATFORM,
        )
        written += 1
    return written


def seed_schedules(store: ResultStore, history: dict[str, list[dict]], *, base_now: datetime) -> int:
    written = 0
    for cfg in SCHEDULES:
        object_id = cfg["object_id"]
        schedule_id = f"seed-schedule-{object_id}"
        if store.get_schedule(schedule_id):
            continue
        interval = int(cfg["interval_seconds"])
        store.create_schedule(
            schedule_id=schedule_id,
            object_id=object_id,
            interval_seconds=interval,
            mode="internal",
            environment=DEMO_ENVIRONMENT,
            execution_mode="auto",
            enabled=bool(cfg["enabled"]),
            next_due_at=(base_now + timedelta(seconds=interval)).isoformat(),
            created_by=PLATFORM,
        )
        written += 1
        runs = history.get(object_id) or []
        if runs:
            last = runs[-1]
            store.record_schedule_run(
                schedule_id, last["run_id"],
                "ok" if last["status"] in ("pass", "warn") else "failed",
            )
    return written


def seed_capabilities(store: ResultStore) -> int:
    for cap in CAPABILITIES:
        store.set_capability(
            cap["key"], cap["status"], cap.get("detail", ""), environment=DEMO_ENVIRONMENT,
        )
    return len(CAPABILITIES)


def seed_operations(store: ResultStore, *, base_now: datetime) -> int:
    """Abgeschlossene Hintergrundoperationen (Extract, Dry-Run) für die Historie."""
    operations = (
        ("seed-op-extract", "extract", "succeeded",
         {"objects": 26, "space": "SIGNAL_DEMO", "duration_s": 42}),
        ("seed-op-dryrun", "dry_run", "succeeded",
         {"dataset": "bc_delivery_performance_fact_v", "checks": 6, "verdict": "proceed"}),
        ("seed-op-profile", "profile", "failed", None),
    )
    written = 0
    for op_id, kind, state, result in operations:
        if store.get_operation(op_id):
            continue
        store.begin_operation(op_id, kind, created_by=PLATFORM)
        store.finish_operation(
            op_id, state,
            result_json=json.dumps(result) if result else None,
            error=None if result else "Profiling-Timeout nach 120 s",
        )
        written += 1
    del base_now
    return written


def seed_contract_index(store: ResultStore) -> int:
    """Contract-Index vorbelegen (die API würde ihn sonst lazy nachziehen)."""
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(store.db_path) as conn:
        for product, spec in CONTRACTS_BY_PRODUCT.items():
            data = _contract_for(product)
            conn.execute(
                """INSERT OR REPLACE INTO contract_index
                   (product, lifecycle, owned_by, version, head_hash, updated_at, kind)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    product, spec.lifecycle, data["owned_by"], spec.version,
                    "", now, spec.kind,
                ),
            )
        conn.commit()
    return len(CONTRACTS_BY_PRODUCT)


# ---------------------------------------------------------------------------
# Orchestrierung
# ---------------------------------------------------------------------------

def seed_workspace(
    *,
    db_path: str | Path,
    products_dir: str | Path,
    contracts_dir: str | Path,
    checks_dir: str | Path | None = None,
    inventory_path: str | Path | None = None,
    lineage_path: str | Path | None = None,
    base_now: datetime | None = None,
    write_files: bool = True,
) -> dict[str, int]:
    base = Path(str(db_path)).parent
    checks_dir = checks_dir or (base / "checks")
    inventory_path = inventory_path or (base / "inventory.json")
    lineage_path = lineage_path or (base / "lineage.json")

    snapshot: dict[str, int] = {}
    if write_files:
        snapshot = build_snapshot(
            inventory_path=inventory_path,
            lineage_path=lineage_path,
            contracts_dir=contracts_dir,
            checks_dir=checks_dir,
            products_dir=products_dir,
        )

    now = base_now or datetime.now(timezone.utc)
    store = ResultStore(str(db_path))

    inventory = json.loads(Path(inventory_path).read_text(encoding="utf-8"))["objects"]
    lineage = json.loads(Path(lineage_path).read_text(encoding="utf-8"))

    reset_seeded_state(store)
    contract_rows = seed_contract_index(store)
    run_result = seed_run_history(store, base_now=now)
    history = run_result["history"]
    running = seed_running_run(store, base_now=now)
    baselines = seed_baselines(store)
    compliance = seed_compliance(store, history)
    incidents = seed_incidents(store, history, lineage, base_now=now)
    quarantine = seed_quarantine(store, history)
    proposals = seed_proposals(store, history)
    profiles = seed_profiles(store)
    schema_rows = seed_schema_snapshots(store, inventory)
    segments = seed_segment_results(store, history)
    notifications = seed_notifications(store, base_now=now)
    schedules = seed_schedules(store, history, base_now=now)
    capabilities = seed_capabilities(store)
    operations = seed_operations(store, base_now=now)

    return {
        "objects": snapshot.get("objects", len(inventory)),
        "contract_files": snapshot.get("contract_files", 0),
        "check_files": snapshot.get("check_files", 0),
        "product_files": snapshot.get("product_files", 0),
        "object_edges": snapshot.get("object_edges", len(lineage.get("edges") or [])),
        "column_edges": snapshot.get("column_edges", len(lineage.get("columnEdges") or [])),
        "contract_rows": contract_rows,
        "runs": run_result["runs"],
        "running_runs": running,
        "baseline_rows": baselines,
        "compliance_rows": compliance,
        "incident_rows": incidents,
        "quarantine_rows": quarantine,
        "proposal_rows": proposals,
        "profile_rows": profiles,
        "schema_rows": schema_rows,
        "segment_rows": segments,
        "notification_rows": notifications,
        "schedule_rows": schedules,
        "capability_rows": capabilities,
        "operation_rows": operations,
    }


def main() -> None:
    db_only = "--db-only" in sys.argv
    summary = seed_workspace(
        db_path=os.environ["SQLITE_DB"],
        products_dir=os.environ["PRODUCTS_DIR"],
        contracts_dir=os.environ["CONTRACTS_DIR"],
        checks_dir=os.environ["CHECKS_DIR"],
        inventory_path=os.environ["INVENTORY_FILE"],
        lineage_path=os.environ["LINEAGE_FILE"],
        write_files=not db_only,
    )
    if not db_only:
        print(f"Snapshot  : {summary['objects']} Objekte, "
              f"{summary['object_edges']} Objekt-Kanten, {summary['column_edges']} Spalten-Kanten")
        print(f"Dateien   : {summary['contract_files']} Contracts, "
              f"{summary['check_files']} Check-Suiten, {summary['product_files']} Produkte")
    print(f"Läufe     : {summary['runs']} abgeschlossen, {summary['running_runs']} laufend")
    print(f"Ampeln    : {summary['compliance_rows']} Boundary-Contracts, "
          f"{summary['baseline_rows']} Baselines")
    print(f"Vorfälle  : {summary['incident_rows']} Incidents, "
          f"{summary['quarantine_rows']} Quarantäne-Episoden, "
          f"{summary['proposal_rows']} entschiedene Proposals")
    print(f"Analyse   : {summary['profile_rows']} Profile, {summary['schema_rows']} Schema-Snapshots, "
          f"{summary['segment_rows']} Segmentzeilen")
    print(f"Betrieb   : {summary['notification_rows']} Notification-Objekte, "
          f"{summary['schedule_rows']} Zeitpläne, {summary['capability_rows']} Capabilities, "
          f"{summary['operation_rows']} Operationen")
    print(f"Datenbank : {os.environ['SQLITE_DB']}")


if __name__ == "__main__":
    main()

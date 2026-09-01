"""Regression auf den Demo-Seed: vollständig, konsistent und wiederholbar.

Der Seed ist die Grundlage jeder Demo und jedes lokalen Rundgangs. Geprüft wird
daher nicht nur "es läuft durch", sondern dass die erzeugten Zustände
zueinander passen: Check-Namen stammen aus dem Compiler, Ampeln aus dem
jüngsten Lauf, Incidents aus echten Verletzungen — und ein zweiter Lauf ändert
nichts.
"""
from __future__ import annotations

import json
import sqlite3

import pytest
import yaml

from dq_core.contract.compiler import compile_contract
from dq_core.store.sqlite_store import ResultStore
from scripts.demo_landscape import (
    CONTRACTS_BY_PRODUCT,
    DEMO_PROFILE_ENV,
    OBJECTS_BY_ID,
    RUN_COUNT,
    RUN_PROFILES,
)
from scripts.seed import compliance_for_run, seed_workspace


def _latest_finished(store: ResultStore, dataset: str) -> dict:
    """Jüngster abgeschlossener Lauf — der Seed legt zusätzlich einen laufenden an."""
    runs = [r for r in store.get_runs(dataset, limit=50) if r["run_state"] == "finished"]
    return store.get_run(runs[0]["run_id"])


def _seed(tmp_path):
    return seed_workspace(
        db_path=tmp_path / "seed.db",
        products_dir=tmp_path / "products",
        contracts_dir=tmp_path / "contracts",
        checks_dir=tmp_path / "checks",
        inventory_path=tmp_path / "inventory.json",
        lineage_path=tmp_path / "lineage.json",
    )


@pytest.fixture(scope="module")
def workspace(tmp_path_factory):
    """Einmal seeden, von allen lesenden Tests geteilt (ein Seed dauert ~20 s)."""
    path = tmp_path_factory.mktemp("seeded-workspace")
    return path, _seed(path)


def test_seed_is_repeatable(tmp_path):
    """Zweiter Lauf ⇒ identische Kennzahlen, keine Dubletten im Store."""
    first = _seed(tmp_path)
    second = _seed(tmp_path)
    assert first == second

    store = ResultStore(tmp_path / "seed.db")
    assert first["runs"] == len(RUN_PROFILES) * RUN_COUNT
    with sqlite3.connect(store.db_path) as conn:
        duplicates = conn.execute(
            """SELECT run_id, check_name, COUNT(*) FROM dq_check_results
                GROUP BY run_id, check_name HAVING COUNT(*) > 1"""
        ).fetchall()
    assert duplicates == []


def test_seed_writes_the_full_workspace(workspace):
    tmp_path, summary = workspace

    inventory = json.loads((tmp_path / "inventory.json").read_text(encoding="utf-8"))
    lineage = json.loads((tmp_path / "lineage.json").read_text(encoding="utf-8"))
    assert len(inventory["objects"]) == len(OBJECTS_BY_ID)
    assert lineage["columnEdges"], "Spalten-Lineage fehlt"

    # Zertifizierte Contracts tragen Snapshot + kompilierte Suite, Entwürfe nicht.
    for product, spec in CONTRACTS_BY_PRODUCT.items():
        assert (tmp_path / "contracts" / f"{product}.yaml").exists()
        active = tmp_path / "contracts" / f"{product}.active.yml"
        checks = tmp_path / "checks" / product / "checks.yml"
        assert active.exists() is (spec.lifecycle == "active")
        assert checks.exists() is (spec.lifecycle == "active")

    for product in ("sales_orders", "customer_master", "revenue_reporting",
                    "budget_controlling", "product_master", "delivery_performance"):
        assert (tmp_path / "products" / f"{product}.yaml").exists()

    assert summary["check_files"] == len(RUN_PROFILES)
    assert summary["schedule_rows"] > 0
    assert summary["capability_rows"] > 0
    assert summary["operation_rows"] > 0
    assert summary["notification_rows"] > 0


def test_run_results_use_compiled_check_names(workspace):
    """G1-Kette: gemessen wird genau, was der Compiler aus dem Contract erzeugt."""
    tmp_path, _summary = workspace
    store = ResultStore(tmp_path / "seed.db")

    for dataset in RUN_PROFILES:
        contract_path = tmp_path / "contracts" / f"{dataset}.yaml"
        contract = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        config = compile_contract(
            contract, inventory_columns=set(OBJECTS_BY_ID[dataset].column_names)
        )
        compiled = {c.name for c in config.checks}

        latest = _latest_finished(store, dataset)
        measured = {r["check_name"] for r in latest["results"]}
        # Adaptive Observability-Checks kommen erst zur Laufzeit dazu.
        assert compiled <= measured
        assert {n for n in measured - compiled if not n.startswith(("volume_adaptive", "freshness_adaptive"))} == set()


def test_compliance_matches_latest_run(workspace):
    """Ampel je Boundary-Contract = Status des jüngsten Laufs, nichts daneben."""
    tmp_path, _summary = workspace
    store = ResultStore(tmp_path / "seed.db")

    boundary = [p for p, s in CONTRACTS_BY_PRODUCT.items() if s.kind != "internal_gate"]
    for product in boundary:
        if product not in RUN_PROFILES:
            continue
        latest = _latest_finished(store, product)
        expected = compliance_for_run(store, latest["run_id"])
        assert expected in ("compliant", "breached", "unknown"), expected
        row = store.get_compliance(product)
        assert row is not None, product
        assert row["compliance"] == expected, product
        assert row["contract_version"] == CONTRACTS_BY_PRODUCT[product].version

    # Interne Gates tragen bewusst keine Contract-Ampel.
    for product, spec in CONTRACTS_BY_PRODUCT.items():
        if spec.kind == "internal_gate":
            assert store.get_compliance(product) is None, product


def test_incidents_reference_real_breaches(workspace):
    """Jeder Incident hängt an einem Lauf, in dem die genannten Checks rissen."""
    tmp_path, _summary = workspace
    store = ResultStore(tmp_path / "seed.db")

    incidents = store.list_incidents(limit=100)
    assert incidents, "keine Incidents erzeugt"
    for incident in incidents:
        run = store.get_run(incident["run_id"])
        assert run is not None, incident
        broken = {
            r["check_name"] for r in run["results"]
            if not r["passed"] and r["state"] in ("executed", "error")
        }
        assert set(incident["failed_checks"]) <= broken, incident["product"]
        assert store.get_incident_rca(incident["id"]) is not None
    assert {i["status"] for i in incidents} & {"acknowledged", "investigating"}
    assert any(i["status"] == "resolved" for i in incidents)


def test_gating_states_are_present_and_status_neutral(workspace):
    """G6: skipped/downgraded/error entstehen — und färben kein Objekt rot."""
    tmp_path, _summary = workspace
    store = ResultStore(tmp_path / "seed.db")

    with sqlite3.connect(store.db_path) as conn:
        states = {row[0] for row in conn.execute("SELECT DISTINCT state FROM dq_check_results")}
    assert {"executed", "skipped_stale", "downgraded", "error"} <= states

    # Der Objekt-Rollup muss dem Lauf-Rollup folgen.
    for entry in store.get_object_status():
        latest = store.get_run(entry["last_run_id"]) or {}
        assert entry["status"] == latest.get("overall_status"), entry["dataset"]


def test_quarantine_covers_the_lifecycle(workspace):
    tmp_path, _summary = workspace
    store = ResultStore(tmp_path / "seed.db")
    states = {episode["status"] for episode in store.list_quarantine(limit=50)}
    assert {"open", "reconciled", "released", "resolved", "superseded"} <= states


def test_profiles_and_schema_snapshots(workspace):
    tmp_path, summary = workspace
    store = ResultStore(tmp_path / "seed.db")

    snapshots = store.list_profile_snapshots("bc_sales_order_item_fact_v", limit=10)
    assert len(snapshots) == 2, "zwei Stände je Objekt — sonst kein Profil-Diff"
    head = store.get_profile_snapshot(snapshots[0]["id"])
    assert head["environment"] == DEMO_PROFILE_ENV
    assert head["stats"]["row_count"] > 0

    assert summary["schema_rows"] == len(RUN_PROFILES)
    drift = store.get_schema_drift("bc_material_dim_v")
    assert drift, "erwarteter Schema-Drift (neue Spalte) fehlt"
    assert all(entry["breaking"] == 0 for entry in drift), "offenes Schema ⇒ nicht breaking"

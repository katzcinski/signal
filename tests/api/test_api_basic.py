"""API smoke tests — library endpoint and Gate G1 (contract PUT)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[2]))

import os
import json
import tempfile
import pytest

# Use temp directory for all test artefacts
_tmpdir = tempfile.mkdtemp(prefix="dq_test_")
os.environ["SQLITE_DB"] = str(Path(_tmpdir) / "test.db")
os.environ["CONTRACTS_DIR"] = str(Path(_tmpdir) / "contracts")
os.environ["CHECKS_DIR"] = str(Path(_tmpdir) / "checks")
os.environ["INVENTORY_FILE"] = str(Path(_tmpdir) / "inventory.json")
os.environ["LINEAGE_FILE"] = str(Path(_tmpdir) / "lineage.json")

Path(os.environ["CONTRACTS_DIR"]).mkdir(exist_ok=True)
Path(os.environ["CHECKS_DIR"]).mkdir(exist_ok=True)
Path(os.environ["INVENTORY_FILE"]).write_text('{"objects":[]}')
Path(os.environ["LINEAGE_FILE"]).write_text('{"nodes":[],"edges":[]}')

# Import AFTER env vars are set so settings picks them up
from services.api.settings import Settings
from services.api import main as _api_main

# Reset singletons so test env vars take effect
import services.api.settings as _settings_mod
import services.api.deps as _deps_mod
_settings_mod._settings = None
_deps_mod._store_instance = None

from fastapi.testclient import TestClient
from services.api.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_library_returns_checks():
    resp = client.get("/api/library")
    assert resp.status_code == 200
    data = resp.json()
    assert "checks" in data
    assert len(data["checks"]) > 0


def test_library_has_categories():
    resp = client.get("/api/library")
    data = resp.json()
    assert "categories" in data
    assert len(data["categories"]) > 0


def test_library_has_families():
    resp = client.get("/api/library")
    data = resp.json()
    assert data["families"] == ["observability", "quality"]
    # Every check carries the functional classification consumed by engine/store.
    for check in data["checks"]:
        assert check["family"] in {"observability", "quality"}
        assert check["gating"] in {"gate", "expensive", "standard"}


def test_objects_empty():
    resp = client.get("/api/objects")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_runs_empty():
    resp = client.get("/api/runs")
    assert resp.status_code == 200


def test_incidents_empty():
    resp = client.get("/api/incidents")
    assert resp.status_code == 200


def test_lineage_empty():
    resp = client.get("/api/lineage")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


def test_contract_put_gate_g1_sql_rejected():
    """Gate G1: PUT with SQL in guarantees must return 422."""
    Path("/tmp/test_contracts").mkdir(exist_ok=True)
    resp = client.put(
        "/api/contracts/test_product",
        json={
            "product": "test_product",
            "dataset": "test_dataset",
            "owned_by": "platform",
            "lifecycle": "draft",
            "version": "0.1.0",
            "guarantees": {
                "bad_rule": "SELECT * FROM secrets"
            },
        },
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert any("G1" in str(e) for e in detail.get("errors", []))


def test_contract_put_valid():
    """Valid contract should be saved successfully."""
    resp = client.put(
        "/api/contracts/test_product_valid",
        json={
            "product": "test_product_valid",
            "dataset": "test_dataset",
            "owned_by": "platform",
            "lifecycle": "draft",
            "version": "0.1.0",
            "guarantees": {
                "keys": [{"columns": ["ID"], "unique": True}],
            },
        },
    )
    assert resp.status_code == 200, resp.text

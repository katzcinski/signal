"""„Für Monitoring verfügbar machen" — Schmalspur (ADR-0002).

Deckt die testbaren Teile ab: die reine Share-Patch-Funktion, die JSON-Registry,
den Safety-Gate (Schreibzugriff AUS per Default) und den orchestrierten
Share-Flow mit gemockter CLI. Der echte CLI-Schreib-Verb ist nicht Teil dieser
Tests (kein Tenant) — er ist in ``datasphere_cli.deploy_object`` isoliert.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[2]))

import pytest
from fastapi.testclient import TestClient

from services.api.monitoring_share import add_monitoring_share

SHARE_KEY = "@DataWarehouse.sharing.targets"


# --- pure patch function ---

def test_add_monitoring_share_idempotent():
    src = {"name": "X"}
    once = add_monitoring_share(src, "MON")
    twice = add_monitoring_share(once, "MON")
    assert once[SHARE_KEY] == ["MON"]
    assert twice[SHARE_KEY] == ["MON"]
    assert SHARE_KEY not in src  # original untouched


def test_add_monitoring_share_appends_without_loss():
    out = add_monitoring_share({SHARE_KEY: ["OTHER"]}, "MON")
    assert out[SHARE_KEY] == ["OTHER", "MON"]


def test_add_monitoring_share_empty_space_raises():
    with pytest.raises(ValueError):
        add_monitoring_share({}, "")


# --- endpoints ---

@pytest.fixture
def client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    contracts = tmp_path / "contracts"
    checks = tmp_path / "checks"
    for d in (data_dir, contracts, checks):
        d.mkdir()
    inv = data_dir / "inventory.json"
    inv.write_text(json.dumps({"objects": [
        {"id": "OBJ_A", "technicalName": "OBJ_A", "name": "OBJ_A", "space": "SP1"},
    ]}))

    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("INVENTORY_FILE", str(inv))
    monkeypatch.setenv("CONTRACTS_DIR", str(contracts))
    monkeypatch.setenv("CHECKS_DIR", str(checks))
    monkeypatch.setenv("SQLITE_DB", str(tmp_path / "t.db"))

    import services.api.settings as settings_mod
    import services.api.deps as deps_mod
    settings_mod._settings = None
    deps_mod._store_instance = None

    from services.api.main import create_app
    yield TestClient(create_app()), monkeypatch, settings_mod

    settings_mod._settings = None
    deps_mod._store_instance = None


def _reset_settings(settings_mod):
    settings_mod._settings = None


def test_disabled_by_default(client):
    c, _, _ = client
    cfg = c.get("/api/monitoring/config").json()
    assert cfg["enabled"] is False
    assert c.get("/api/monitoring/shares").json() == {"object_ids": []}
    # No monitoring space configured → 503.
    assert c.post("/api/monitoring/shares/OBJ_A").status_code == 503


def test_space_set_but_write_disabled(client):
    c, mp, settings_mod = client
    mp.setenv("DATASPHERE_MONITORING_SPACE", "MON")
    _reset_settings(settings_mod)
    r = c.post("/api/monitoring/shares/OBJ_A")
    assert r.status_code == 503
    assert "deaktiviert" in r.json()["detail"].lower()


def test_share_flow_with_mocked_cli(client):
    c, mp, settings_mod = client
    mp.setenv("DATASPHERE_MONITORING_SPACE", "MON")
    mp.setenv("DATASPHERE_ALLOW_SHARE", "true")
    _reset_settings(settings_mod)

    import services.api.datasphere_cli as cli_mod
    mp.setattr(cli_mod.DatasphereCli, "read_object", lambda self, *a, **k: {"name": "OBJ_A"})
    mp.setattr(cli_mod.DatasphereCli, "deploy_object", lambda self, *a, **k: "ok")

    cfg = c.get("/api/monitoring/config").json()
    assert cfg == {"enabled": True, "monitoring_space": "MON"}

    r1 = c.post("/api/monitoring/shares/OBJ_A").json()
    assert r1["status"] == "shared"
    assert c.get("/api/monitoring/shares").json()["object_ids"] == ["OBJ_A"]

    # Idempotent: second call does not re-deploy.
    assert c.post("/api/monitoring/shares/OBJ_A").json()["status"] == "already_shared"

    # Unshare removes it from the cockpit registry.
    c.request("DELETE", "/api/monitoring/shares/OBJ_A")
    assert c.get("/api/monitoring/shares").json()["object_ids"] == []


def test_share_unknown_object_404(client):
    c, mp, settings_mod = client
    mp.setenv("DATASPHERE_MONITORING_SPACE", "MON")
    mp.setenv("DATASPHERE_ALLOW_SHARE", "true")
    _reset_settings(settings_mod)
    assert c.post("/api/monitoring/shares/NOPE").status_code == 404

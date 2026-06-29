"""Datasphere-Connector-Admin-Endpoint (/api/admin/connector).

Isolierter Client mit eigenem connector_file + secrets_file unter tmp_path, damit
keine echten datasphere.yml / secrets.local.yml im Repo geschrieben werden.
Deckt ab: Roundtrip von space_id/use_cli/cli_host/REST-Feldern, Secret wird als
Referenz abgelegt (nie im Klartext zurückgegeben), source_mode-Logik.
"""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[2]))


@pytest.fixture
def client(tmp_path, monkeypatch):
    connector_file = tmp_path / "datasphere.yml"
    secrets_file = tmp_path / "secrets.local.yml"
    inv = tmp_path / "inventory.json"
    lin = tmp_path / "lineage.json"
    inv.write_text(json.dumps({"objects": []}))
    lin.write_text(json.dumps({"nodes": [], "edges": []}))

    monkeypatch.setenv("SQLITE_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("CONNECTOR_FILE", str(connector_file))
    monkeypatch.setenv("SECRETS_FILE", str(secrets_file))
    monkeypatch.setenv("INVENTORY_FILE", str(inv))
    monkeypatch.setenv("LINEAGE_FILE", str(lin))
    # Ensure no ambient env or repo .env Datasphere settings leak into the test.
    monkeypatch.setenv("DATASPHERE_SPACE_ID", "")
    monkeypatch.setenv("DATASPHERE_USE_CLI", "false")
    monkeypatch.setenv("DATASPHERE_CLIENT_SECRET", "")
    monkeypatch.setenv("DATASPHERE_BASE_URL", "")
    monkeypatch.setenv("DATASPHERE_CLIENT_ID", "")
    monkeypatch.setenv("DATASPHERE_AUTHORIZATION_URL", "")
    monkeypatch.setenv("DATASPHERE_TOKEN_URL", "")
    monkeypatch.setenv("DATASPHERE_OAUTH_SECRETS_FILE", "")

    import services.api.settings as settings_mod
    import services.api.deps as deps_mod
    settings_mod._settings = None
    deps_mod._store_instance = None

    from services.api.main import create_app
    c = TestClient(create_app())
    yield c, secrets_file

    settings_mod._settings = None
    deps_mod._store_instance = None


def test_get_connector_defaults_empty(client):
    c, _ = client
    resp = c.get("/api/admin/connector")
    assert resp.status_code == 200
    data = resp.json()
    assert data["space_id"] == ""
    assert data["secret_configured"] is False
    assert data["source_mode"] == "none"
    # Never an echoed secret field.
    assert "client_secret" not in data


def test_put_persists_rest_config_and_stores_secret_as_ref(client):
    c, secrets_file = client
    resp = c.put("/api/admin/connector", json={
        "space_id": "MY_SPACE", "use_cli": False,
        "cli_host": "tenant.example",
        "base_url": "https://tenant.example", "client_id": "my-cid",
        "authorization_url": "https://tenant.example/oauth/authorize",
        "token_url": "https://tenant.example/oauth/token",
        "oauth_secrets_file": r"C:\secrets\datasphere.json",
        "client_secret": "top-secret-value",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["space_id"] == "MY_SPACE"
    assert data["base_url"] == "https://tenant.example"
    assert data["client_id"] == "my-cid"
    assert data["authorization_url"] == "https://tenant.example/oauth/authorize"
    assert data["secret_configured"] is True
    assert data["file_oauth_secrets_file"] == r"C:\secrets\datasphere.json"
    # The raw secret is never echoed back.
    assert "top-secret-value" not in json.dumps(data)
    # Catalog is now considered configured (base_url + client_id present).
    assert data["catalog_configured"] is True
    assert data["source_mode"] == "catalog"

    # Secret landed in secrets.local.yml under the ref var, the value resolvable.
    assert secrets_file.exists()
    assert "top-secret-value" in secrets_file.read_text(encoding="utf-8")
    # datasphere.yml must NOT contain the plaintext secret.
    from services.api.settings import get_settings
    raw_cfg = Path(get_settings().connector_file).read_text(encoding="utf-8")
    assert "top-secret-value" not in raw_cfg


def test_put_keeps_existing_secret_when_blank(client):
    c, _ = client
    c.put("/api/admin/connector", json={
        "space_id": "S", "use_cli": False, "base_url": "https://t", "client_id": "cid",
        "client_secret": "first-secret",
    })
    # Second PUT without a secret keeps the stored one.
    resp = c.put("/api/admin/connector", json={
        "space_id": "S2", "use_cli": False, "base_url": "https://t", "client_id": "cid",
    })
    assert resp.json()["secret_configured"] is True
    assert resp.json()["space_id"] == "S2"


def test_put_clear_secret_removes_ref(client):
    c, _ = client
    c.put("/api/admin/connector", json={
        "space_id": "S", "use_cli": False, "base_url": "https://t", "client_id": "cid",
        "client_secret": "secret",
    })
    resp = c.put("/api/admin/connector", json={
        "space_id": "S", "use_cli": False, "base_url": "https://t", "client_id": "cid",
        "clear_secret": True,
    })
    assert resp.json()["secret_configured"] is False


def test_post_login_starts_cli_cmd(client, monkeypatch):
    c, _ = client
    from services.api import datasphere_cli

    started = []

    monkeypatch.setattr(datasphere_cli.DatasphereCli, "is_available", lambda self: True)

    def fake_open(self):
        command = self.login_command()
        started.append(command)
        return command

    monkeypatch.setattr(datasphere_cli.DatasphereCli, "open_login_cmd", fake_open)
    resp = c.post("/api/admin/connector/login")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["command"].startswith("datasphere login")
    assert started


def test_connector_requires_admin(client):
    c, _ = client
    resp = c.get("/api/admin/connector", headers={"X-DQ-Role": "viewer"})
    assert resp.status_code == 403

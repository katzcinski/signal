"""Connector-Runtime-Config (datasphere.yml) — effektive Auflösung + Secret-Ref.

Deckt ab:
  - Roundtrip read/write inkl. der neuen Felder (cli_host, base_url, client_id,
    token_url, secret_ref).
  - Env-Precedence der effective_*-Helper.
  - secret_configured / effective_client_secret über den Secret-Resolver, ohne
    je den Klartext in der Config zu persistieren (S-13).
Synthetische Werte only.
"""
from __future__ import annotations

from types import SimpleNamespace

from services.api import connector_config as cc


def _settings(tmp_path, **env):
    return SimpleNamespace(
        connector_file=str(tmp_path / "datasphere.yml"),
        secrets_file=str(tmp_path / "secrets.local.yml"),
        datasphere_space_id=env.get("space_id", ""),
        datasphere_use_cli=env.get("use_cli", False),
        datasphere_base_url=env.get("base_url", ""),
        datasphere_client_id=env.get("client_id", ""),
        datasphere_client_secret=env.get("client_secret", ""),
        datasphere_authorization_url=env.get("authorization_url", ""),
        datasphere_token_url=env.get("token_url", ""),
        datasphere_oauth_secrets_file=env.get("oauth_secrets_file", ""),
    )


def test_roundtrip_persists_new_fields(tmp_path):
    path = str(tmp_path / "datasphere.yml")
    cc.write_connector_config(path, {
        "space_id": "MY_SPACE", "use_cli": True, "cli_host": "tenant.example",
        "base_url": "https://t.example", "client_id": "cid",
        "authorization_url": "https://auth.example/oauth/authorize",
        "token_url": "https://t.example/oauth/token",
        "oauth_secrets_file": r"C:\secrets\datasphere.json",
        "secret_ref": "DATASPHERE_CLIENT_SECRET",
    })
    cfg = cc.read_connector_config(path)
    assert cfg == {
        "space_id": "MY_SPACE", "use_cli": True, "cli_host": "tenant.example",
        "base_url": "https://t.example", "client_id": "cid",
        "authorization_url": "https://auth.example/oauth/authorize",
        "token_url": "https://t.example/oauth/token",
        "oauth_secrets_file": r"C:\secrets\datasphere.json",
        "secret_ref": "DATASPHERE_CLIENT_SECRET",
    }


def test_write_never_persists_plaintext_secret(tmp_path):
    """The config holds only a ref — never the secret value itself."""
    path = str(tmp_path / "datasphere.yml")
    cc.write_connector_config(path, {"client_id": "cid", "secret_ref": "DATASPHERE_CLIENT_SECRET"})
    raw = (tmp_path / "datasphere.yml").read_text(encoding="utf-8")
    assert "DATASPHERE_CLIENT_SECRET" in raw  # the ref
    assert "secret_ref" in raw
    # No key that could carry a literal secret value.
    assert "client_secret" not in raw


def test_env_wins_over_file(tmp_path):
    cc.write_connector_config(str(tmp_path / "datasphere.yml"), {
        "space_id": "FILE_SPACE", "base_url": "https://file.example", "client_id": "file_cid",
    })
    s = _settings(tmp_path, space_id="ENV_SPACE", base_url="https://env.example", client_id="env_cid")
    assert cc.effective_space_id(s) == "ENV_SPACE"
    assert cc.effective_base_url(s) == "https://env.example"
    assert cc.effective_client_id(s) == "env_cid"


def test_file_used_when_env_unset(tmp_path):
    cc.write_connector_config(str(tmp_path / "datasphere.yml"), {
        "space_id": "FILE_SPACE", "cli_host": "file.tenant", "base_url": "https://file.example",
        "client_id": "file_cid",
        "authorization_url": "https://file.example/a",
        "token_url": "https://file.example/t",
        "oauth_secrets_file": "secrets.json",
    })
    s = _settings(tmp_path)
    assert cc.effective_space_id(s) == "FILE_SPACE"
    assert cc.effective_cli_host(s) == "file.tenant"
    assert cc.effective_base_url(s) == "https://file.example"
    assert cc.effective_client_id(s) == "file_cid"
    assert cc.effective_authorization_url(s) == "https://file.example/a"
    assert cc.effective_token_url(s) == "https://file.example/t"
    assert cc.effective_oauth_secrets_file(s) == "secrets.json"


def test_cli_host_falls_back_to_base_url_when_not_set(tmp_path):
    cc.write_connector_config(str(tmp_path / "datasphere.yml"), {
        "base_url": "https://file.example",
    })
    assert cc.effective_cli_host(_settings(tmp_path)) == "https://file.example"


def test_secret_configured_via_env(tmp_path):
    s = _settings(tmp_path, client_secret="super-secret")
    assert cc.secret_configured(s) is True
    assert cc.effective_client_secret(s) == "super-secret"
    assert cc.effective_secret_ref(s) == cc.DEFAULT_SECRET_REF


def test_secret_resolved_via_file_ref(tmp_path, monkeypatch):
    from services.api import secrets as secrets_mod

    secrets_path = tmp_path / "secrets.local.yml"
    secrets_mod.write_secret("DATASPHERE_CLIENT_SECRET", "from-file", secrets_path)
    # Point the default resolver at this secrets file.
    secrets_mod.init_resolver(str(secrets_path))
    monkeypatch.delenv("DATASPHERE_CLIENT_SECRET", raising=False)

    cc.write_connector_config(str(tmp_path / "datasphere.yml"), {
        "client_id": "cid", "secret_ref": "DATASPHERE_CLIENT_SECRET",
    })
    s = _settings(tmp_path)  # no env secret
    assert cc.secret_configured(s) is True
    assert cc.effective_client_secret(s) == "from-file"

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest


_DATASPHERE_ENV: dict[str, str] = {
    "DATASPHERE_BASE_URL": "",
    "DATASPHERE_CLIENT_ID": "",
    "DATASPHERE_CLIENT_SECRET": "",
    "DATASPHERE_AUTHORIZATION_URL": "",
    "DATASPHERE_TOKEN_URL": "",
    "DATASPHERE_OAUTH_SECRETS_FILE": "",
    "DATASPHERE_SPACE_ID": "",
    "DATASPHERE_USE_CLI": "false",
    "DATASPHERE_MONITORING_SPACE": "",
}

_SESSION_CONFIG_DIR = Path(tempfile.mkdtemp(prefix="signal_pytest_config_"))
_FILE_ENV: dict[str, str] = {
    "CONNECTOR_FILE": str(_SESSION_CONFIG_DIR / "datasphere.yml"),
    "ENVIRONMENTS_FILE": str(_SESSION_CONFIG_DIR / "environments.yml"),
    "SECRETS_FILE": str(_SESSION_CONFIG_DIR / "secrets.local.yml"),
}


def _apply_isolated_env(env: dict[str, str]) -> None:
    for key, value in {**_DATASPHERE_ENV, **env}.items():
        os.environ[key] = value


def _reset_runtime_state() -> None:
    import services.api.datasphere as datasphere_mod
    import services.api.datasphere_catalog as catalog_mod
    import services.api.deps as deps_mod
    import services.api.settings as settings_mod
    from services.api import secrets as secrets_mod

    settings_mod._settings = None
    deps_mod._store_instance = None
    datasphere_mod.reset_client()
    catalog_mod.reset_catalog_client()
    secrets_mod.init_resolver(os.environ.get("SECRETS_FILE", "secrets.local.yml"))


_apply_isolated_env(_FILE_ENV)


@pytest.fixture(autouse=True)
def isolate_runtime_config(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    file_env = {
        "CONNECTOR_FILE": str(tmp_path / "datasphere.yml"),
        "ENVIRONMENTS_FILE": str(tmp_path / "environments.yml"),
        "SECRETS_FILE": str(tmp_path / "secrets.local.yml"),
    }
    for key, value in {**_DATASPHERE_ENV, **file_env}.items():
        monkeypatch.setenv(key, value)

    _reset_runtime_state()
    yield
    _reset_runtime_state()

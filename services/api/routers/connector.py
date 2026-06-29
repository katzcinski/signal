"""Datasphere connector admin endpoint.

GET  /api/admin/connector  — aktuelle Konfiguration + CLI-Status
PUT  /api/admin/connector  — space_id / use_cli persistieren (→ datasphere.yml)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..auth.provider import Principal, require_roles
from ..settings import get_settings

logger = logging.getLogger("dq_cockpit.connector")
router = APIRouter(prefix="/api/admin/connector", tags=["admin", "connector"])
require_admin = require_roles("admin")


class ConnectorIn(BaseModel):
    space_id: str = Field(default="", max_length=128)
    use_cli: bool = False
    cli_host: str = Field(default="", max_length=512)
    base_url: str = Field(default="", max_length=512)
    client_id: str = Field(default="", max_length=256)
    authorization_url: str = Field(default="", max_length=512)
    token_url: str = Field(default="", max_length=512)
    oauth_secrets_file: str = Field(default="", max_length=1024)
    # Write-only: raw client secret. Stored via the secret resolver as a ref,
    # never persisted in datasphere.yml and never echoed back (S-13).
    client_secret: str = Field(default="", max_length=4096)
    clear_secret: bool = False


def _build_status(principal: Principal) -> dict:
    from ..connector_config import (
        effective_base_url,
        effective_authorization_url,
        effective_cli_host,
        effective_client_id,
        effective_oauth_secrets_file,
        effective_space_id,
        effective_token_url,
        effective_use_cli,
        read_connector_config,
        secret_configured,
    )
    from ..datasphere_catalog import get_catalog_client

    settings = get_settings()
    file_cfg = read_connector_config(settings.connector_file)
    configured_host = effective_cli_host(settings)
    authorization_url = effective_authorization_url(settings)
    token_url = effective_token_url(settings)
    oauth_secrets_file = effective_oauth_secrets_file(settings)

    # CLI path resolution is pure filesystem — fast, no subprocess. We probe the
    # login whenever the CLI is installed (not only when use_cli is on), so an
    # existing `datasphere login` is reliably surfaced before the toggle is set.
    cli_available = False
    cli_logged_in = False
    cli_host: str | None = None
    try:
        from ..datasphere_cli import DatasphereCli
        cli = DatasphereCli(
            host=configured_host or None,
            authorization_url=authorization_url or None,
            token_url=token_url or None,
            secrets_file=oauth_secrets_file or None,
        )
        cli_available = cli.is_available()
        if cli_available:
            try:
                cli_logged_in = cli.check_login()
                cli_host = cli.configured_cli_host() or (configured_host or None)
            except Exception as exc:
                logger.debug("CLI login check failed: %s", exc)
                cli_host = configured_host or None
    except Exception as exc:
        logger.debug("CLI availability check failed: %s", exc)

    catalog_configured = get_catalog_client() is not None
    space = effective_space_id(settings)
    use_cli = effective_use_cli(settings)

    if space and use_cli and cli_available and cli_logged_in:
        source_mode = "cli"
    elif space and catalog_configured:
        source_mode = "catalog"
    else:
        source_mode = "none"

    return {
        "space_id": space,
        "use_cli": use_cli,
        "cli_available": cli_available,
        "cli_logged_in": cli_logged_in,
        "cli_host": cli_host,
        "catalog_configured": catalog_configured,
        "source_mode": source_mode,
        "config_file": settings.connector_file,
        # REST/OAuth connector config — non-secret fields only; the secret is
        # reported as a boolean status, never echoed (S-13).
        "base_url": effective_base_url(settings),
        "client_id": effective_client_id(settings),
        "authorization_url": authorization_url,
        "token_url": token_url,
        "oauth_secrets_file": oauth_secrets_file,
        "secret_configured": secret_configured(settings),
        "login_command": cli.login_command() if cli_available else "",
        "file_space_id": file_cfg.get("space_id", ""),
        "file_use_cli": bool(file_cfg.get("use_cli", False)),
        "file_cli_host": file_cfg.get("cli_host", ""),
        "file_base_url": file_cfg.get("base_url", ""),
        "file_client_id": file_cfg.get("client_id", ""),
        "file_authorization_url": file_cfg.get("authorization_url", ""),
        "file_token_url": file_cfg.get("token_url", ""),
        "file_oauth_secrets_file": file_cfg.get("oauth_secrets_file", ""),
        "env_space_id": getattr(settings, "datasphere_space_id", ""),
        "env_use_cli": getattr(settings, "datasphere_use_cli", False),
        "env_base_url": getattr(settings, "datasphere_base_url", ""),
        "env_client_id": getattr(settings, "datasphere_client_id", ""),
        "env_authorization_url": getattr(settings, "datasphere_authorization_url", ""),
        "env_token_url": getattr(settings, "datasphere_token_url", ""),
        "env_oauth_secrets_file": getattr(settings, "datasphere_oauth_secrets_file", ""),
    }


@router.get("")
def get_connector_status(principal: Principal = require_admin):
    """Aktuelle Connector-Konfiguration und CLI-Verfügbarkeit."""
    return _build_status(principal)


@router.post("/login")
def open_connector_login(principal: Principal = require_admin):
    """Start the interactive Datasphere CLI OAuth login in a visible CMD window."""
    from ..connector_config import (
        effective_authorization_url,
        effective_cli_host,
        effective_oauth_secrets_file,
        effective_token_url,
    )
    from ..datasphere_cli import CliError, DatasphereCli

    settings = get_settings()
    cli = DatasphereCli(
        host=effective_cli_host(settings) or None,
        authorization_url=effective_authorization_url(settings) or None,
        token_url=effective_token_url(settings) or None,
        secrets_file=effective_oauth_secrets_file(settings) or None,
    )
    if not cli.is_available():
        raise HTTPException(status_code=400, detail="Datasphere CLI ist nicht verfuegbar.")
    try:
        command = cli.open_login_cmd()
    except CliError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "command": command}


@router.put("")
def put_connector_config(body: ConnectorIn, principal: Principal = require_admin):
    """Speichert Connector-Konfiguration in datasphere.yml.

    Persistiert space_id, use_cli, cli_host und die REST/OAuth-Felder (base_url,
    client_id, token_url). Das Client-Secret wird — falls als Klartext übergeben
    — über den Secret-Resolver unter einer stabilen Referenz abgelegt (S-13);
    die datasphere.yml hält nur die Referenz, niemals den Wert.
    """
    from ..connector_config import (
        DEFAULT_SECRET_REF,
        read_connector_config,
        write_connector_config,
    )
    from ..secrets import write_secret
    from .. import datasphere, datasphere_catalog

    settings = get_settings()
    existing = read_connector_config(settings.connector_file)
    secret_ref = existing.get("secret_ref", "")

    if body.clear_secret:
        secret_ref = ""
    elif body.client_secret:
        secret_ref = secret_ref or DEFAULT_SECRET_REF
        # Stores under secrets.local.yml (S-13). The value is never logged.
        write_secret(secret_ref, body.client_secret, settings.secrets_file)

    write_connector_config(settings.connector_file, {
        "space_id": body.space_id.strip(),
        "use_cli": body.use_cli,
        "cli_host": body.cli_host.strip(),
        "base_url": body.base_url.strip(),
        "client_id": body.client_id.strip(),
        "authorization_url": body.authorization_url.strip(),
        "token_url": body.token_url.strip(),
        "oauth_secrets_file": body.oauth_secrets_file.strip(),
        "secret_ref": secret_ref,
    })

    # Drop cached REST clients so the next call rebuilds from the new config.
    datasphere_catalog.reset_catalog_client()
    datasphere.reset_client()
    return _build_status(principal)

"""Datasphere connector admin endpoint.

GET  /api/admin/connector  — aktuelle Konfiguration + CLI-Status
PUT  /api/admin/connector  — space_id / use_cli persistieren (→ datasphere.yml)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..auth.provider import Principal, require_roles
from ..settings import get_settings

logger = logging.getLogger("dq_cockpit.connector")
router = APIRouter(prefix="/api/admin/connector", tags=["admin", "connector"])
require_admin = require_roles("admin")


class ConnectorIn(BaseModel):
    space_id: str = Field(default="", max_length=128)
    use_cli: bool = False


def _build_status(principal: Principal) -> dict:
    from ..connector_config import effective_space_id, effective_use_cli, read_connector_config
    from ..datasphere_catalog import get_catalog_client

    settings = get_settings()
    file_cfg = read_connector_config(settings.connector_file)

    # CLI path resolution is pure filesystem — fast, no subprocess.
    cli_available = False
    cli_logged_in = False
    cli_host: str | None = None
    try:
        from ..datasphere_cli import DatasphereCli
        cli = DatasphereCli()
        cli_available = cli.is_available()
        if cli_available and effective_use_cli(settings):
            try:
                cli_logged_in = cli.check_login()
                cli_host = cli.configured_cli_host()
            except Exception as exc:
                logger.debug("CLI login check failed: %s", exc)
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
        "file_space_id": file_cfg.get("space_id", ""),
        "file_use_cli": bool(file_cfg.get("use_cli", False)),
        "env_space_id": getattr(settings, "datasphere_space_id", ""),
        "env_use_cli": getattr(settings, "datasphere_use_cli", False),
    }


@router.get("")
def get_connector_status(principal: Principal = require_admin):
    """Aktuelle Connector-Konfiguration und CLI-Verfügbarkeit."""
    return _build_status(principal)


@router.put("")
def put_connector_config(body: ConnectorIn, principal: Principal = require_admin):
    """Speichert space_id und use_cli in datasphere.yml."""
    from ..connector_config import write_connector_config
    settings = get_settings()
    write_connector_config(settings.connector_file, {
        "space_id": body.space_id.strip(),
        "use_cli": body.use_cli,
    })
    return _build_status(principal)

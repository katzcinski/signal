"""„Für Monitoring verfügbar machen" — Schmalspur-Endpunkte (ADR-0002).

Teilt ein Inventar-Objekt in den Monitoring-Hub-Space. Der Schreibzugriff in
Datasphere ist per ``datasphere_allow_share`` standardmäßig AUS; ohne
Freischaltung + konfigurierten ``datasphere_monitoring_space`` antworten die
Mutationen mit 503 und einer umsetzbaren Meldung. Read-Endpunkte (Config/Status)
laufen immer.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_inventory
from ..monitoring_share import (
    add_monitoring_share,
    load_shared_ids,
    record_shared_id,
    remove_shared_id,
)
from ..settings import get_settings

logger = logging.getLogger("dq_cockpit.monitoring")

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/config")
def monitoring_config() -> dict[str, Any]:
    """Ob der Schmalspur-Share aktiv ist — steuert Sichtbarkeit im Cockpit."""
    settings = get_settings()
    return {
        "enabled": bool(settings.datasphere_allow_share and settings.datasphere_monitoring_space),
        "monitoring_space": settings.datasphere_monitoring_space,
    }


@router.get("/shares")
def list_shares() -> dict[str, list[str]]:
    return {"object_ids": load_shared_ids()}


def _resolve_object(object_id: str, inventory: list[dict]) -> dict:
    for obj in inventory:
        if object_id in (obj.get("id"), obj.get("technicalName"), obj.get("name")):
            return obj
    raise HTTPException(status_code=404, detail=f"Objekt {object_id} nicht im Inventar.")


@router.post("/shares/{object_id}")
def share_object(object_id: str, inventory: list[dict] = Depends(get_inventory)) -> dict[str, Any]:
    """Exportiert das Objekt via CLI, ergänzt den Share auf den Monitoring-Space
    und deployt es zurück. Idempotent: ist es schon registriert, kein erneuter
    Schreibzugriff."""
    settings = get_settings()
    if not settings.datasphere_monitoring_space:
        raise HTTPException(
            status_code=503,
            detail="Kein Monitoring-Space konfiguriert (DATASPHERE_MONITORING_SPACE).",
        )
    if not settings.datasphere_allow_share:
        raise HTTPException(
            status_code=503,
            detail=(
                "Schreibzugriff deaktiviert. Zum Aktivieren DATASPHERE_ALLOW_SHARE=true "
                "setzen und den CLI-Share-Verb gegen die eigene CLI-Version verifizieren."
            ),
        )

    obj = _resolve_object(object_id, inventory)
    if object_id in load_shared_ids():
        return {"status": "already_shared", "object_id": object_id}

    space = obj.get("space") or obj.get("schema") or ""
    technical_name = obj.get("technicalName") or obj.get("id") or object_id
    object_type = obj.get("object_type") or "views"

    from ..datasphere_cli import CliAuthError, CliError, DatasphereCli

    cli = DatasphereCli()
    try:
        definition = cli.read_object(space, technical_name, object_type=object_type)
        patched = add_monitoring_share(definition, settings.datasphere_monitoring_space)
        cli.deploy_object(space, technical_name, patched, object_type=object_type)
    except CliAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except CliError as exc:
        raise HTTPException(status_code=502, detail=f"Datasphere-CLI-Fehler: {exc}") from exc

    record_shared_id(object_id)
    logger.info("Objekt %s in Monitoring-Space %s geteilt.", object_id, settings.datasphere_monitoring_space)
    return {"status": "shared", "object_id": object_id, "monitoring_space": settings.datasphere_monitoring_space}


@router.delete("/shares/{object_id}")
def unshare_object(object_id: str) -> dict[str, Any]:
    """Schmalspur: entfernt das Objekt aus der Registry (Cockpit-Status), ohne
    den Share in Datasphere rückgängig zu machen — bewusst manuell."""
    remaining = remove_shared_id(object_id)
    return {"status": "removed", "object_id": object_id, "object_ids": remaining}

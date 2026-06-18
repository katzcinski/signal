"""„Für Monitoring verfügbar machen" — Schmalspur-Pfad (ohne Git/CI-Gate).

Teilt ein Inventar-Objekt in einen dedizierten Monitoring-Hub-Space (ADR-0002,
Variante Monitoring-Hub). Der eigentliche Schreibzugriff in Datasphere läuft
über die CLI und ist per ``datasphere_allow_share`` standardmäßig AUS — Signal
bleibt read-only, bis das bewusst freigeschaltet wird.

Dieses Modul kapselt:
  * eine schlanke JSON-Registry (welche Objekte bereits geteilt sind), damit das
    Cockpit Status/Idempotenz ohne CLI-Roundtrip zeigen kann, und
  * die reine Patch-Funktion ``add_monitoring_share`` (gut testbar).

Der konkrete CLI-Schreib-Verb (``deploy_object``) ist je CLI-Version zu
verifizieren — siehe ``[VERIFY-VERB]`` in ``datasphere_cli.py``.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .settings import get_settings

logger = logging.getLogger("dq_cockpit.monitoring_share")

# Marker-Schlüssel, unter dem die Share-Absicht in die exportierte Definition
# geschrieben wird. [VERIFY-CSN] gegen das reale CSN-/Sharing-Schema eurer
# Datasphere-Version prüfen und ggf. auf die echte Annotation umbiegen.
_SHARE_KEY = "@DataWarehouse.sharing.targets"


def _registry_path() -> Path:
    settings = get_settings()
    return Path(settings.data_dir) / "monitoring_shares.json"


def load_shared_ids() -> list[str]:
    """IDs der bereits ins Monitoring übernommenen Objekte (sortiert)."""
    path = _registry_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("monitoring_shares.json unlesbar — behandelt als leer.")
        return []
    ids = data.get("object_ids", []) if isinstance(data, dict) else []
    return sorted({str(i) for i in ids})


def record_shared_id(object_id: str) -> list[str]:
    ids = set(load_shared_ids())
    ids.add(object_id)
    return _write_ids(ids)


def remove_shared_id(object_id: str) -> list[str]:
    ids = set(load_shared_ids())
    ids.discard(object_id)
    return _write_ids(ids)


def _write_ids(ids: set[str]) -> list[str]:
    path = _registry_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(ids)
    path.write_text(json.dumps({"object_ids": ordered}, indent=2), encoding="utf-8")
    return ordered


def add_monitoring_share(definition: dict[str, Any], monitoring_space: str) -> dict[str, Any]:
    """Ergänzt die Share-Absicht (Ziel = Monitoring-Space) in einer exportierten
    Objekt-Definition — idempotent. Reine Funktion, keine Seiteneffekte.

    Bewusst konservativ: hängt ``monitoring_space`` an eine Ziel-Liste an, ohne
    bestehende Einträge zu verlieren. Das ``_SHARE_KEY``-Schema ist gegen die
    reale CSN-Annotation zu verifizieren ([VERIFY-CSN])."""
    if not monitoring_space:
        raise ValueError("monitoring_space darf nicht leer sein.")
    patched = dict(definition)
    targets = patched.get(_SHARE_KEY)
    if not isinstance(targets, list):
        targets = []
    if monitoring_space not in targets:
        targets = [*targets, monitoring_space]
    patched[_SHARE_KEY] = targets
    return patched

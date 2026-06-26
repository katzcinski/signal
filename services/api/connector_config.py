"""Datasphere connector runtime config — persisted to datasphere.yml.

Env vars (DATASPHERE_SPACE_ID, DATASPHERE_USE_CLI) always take precedence.
This file is a runtime alternative for operators who cannot set env vars.
It is git-ignored by convention (like secrets.local.yml).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any


def read_connector_config(connector_file: str) -> dict[str, Any]:
    import yaml
    path = Path(connector_file)
    if not path.exists():
        return {"space_id": "", "use_cli": False}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        return {"space_id": "", "use_cli": False}
    return {
        "space_id": str(data.get("space_id") or ""),
        "use_cli": bool(data.get("use_cli", False)),
    }


def write_connector_config(connector_file: str, cfg: dict[str, Any]) -> None:
    import yaml
    path = Path(connector_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    safe = {
        "space_id": str(cfg.get("space_id") or ""),
        "use_cli": bool(cfg.get("use_cli", False)),
    }
    path.write_text(
        yaml.safe_dump(safe, sort_keys=True, default_flow_style=False, allow_unicode=True),
        encoding="utf-8",
    )


def effective_space_id(settings: Any) -> str:
    """Effective space: env var wins, then datasphere.yml."""
    env_val = str(getattr(settings, "datasphere_space_id", "") or "")
    if env_val:
        return env_val
    cfg = read_connector_config(getattr(settings, "connector_file", "datasphere.yml"))
    return str(cfg.get("space_id") or "")


def effective_use_cli(settings: Any) -> bool:
    """Effective use_cli: env var wins (True → True), then datasphere.yml."""
    if getattr(settings, "datasphere_use_cli", False):
        return True
    cfg = read_connector_config(getattr(settings, "connector_file", "datasphere.yml"))
    return bool(cfg.get("use_cli", False))

"""Dependency providers for FastAPI routes."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends

# Make dq_core importable from service context
_root = Path(__file__).resolve().parents[2]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root / "packages"))

from dq_core.store.sqlite_store import ResultStore
from .settings import get_settings

_store_instance: ResultStore | None = None


def get_store() -> ResultStore:
    global _store_instance
    if _store_instance is None:
        settings = get_settings()
        _store_instance = ResultStore(settings.sqlite_db)
    return _store_instance


StoreDep = Annotated[ResultStore, Depends(get_store)]


def get_inventory() -> list[dict[str, Any]]:
    """Load inventory.json from data_dir."""
    import json
    settings = get_settings()
    path = Path(settings.inventory_file)
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("objects") or []


def get_lineage() -> dict[str, Any]:
    """Load lineage.json from data_dir."""
    import json
    settings = get_settings()
    path = Path(settings.lineage_file)
    if not path.exists():
        return {"nodes": [], "edges": []}
    return json.loads(path.read_text(encoding="utf-8"))

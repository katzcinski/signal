"""HANA result store stub — future deployment against `dq_results_lt` (O6).

Methodennamen folgen `ResultStoreProtocol` (base.py), damit die Implementierung
das Protocol erfüllen KANN; der Konformitätstest in tests/unit sichert das ab.
"""
from __future__ import annotations

from typing import Any, Optional

from ..engine.models import RunSummary


class HanaStore:
    def __init__(self, connection):
        self._conn = connection

    def save_run(self, summary: RunSummary) -> None:
        raise NotImplementedError("HanaStore.save_run not yet implemented")

    def get_run(self, run_id: str) -> Optional[dict]:
        raise NotImplementedError

    def get_runs(self, dataset: str, limit: int = 100) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_previous_actuals(self, dataset: str) -> dict[str, str]:
        raise NotImplementedError

    def get_check_history(self, dataset: str, check_name: str, limit: int = 50) -> list[dict[str, Any]]:
        raise NotImplementedError

    def set_run_state(self, run_id: str, state: str, finished_at: str | None = None) -> None:
        raise NotImplementedError

    def get_compliance(self, product: str) -> Optional[dict]:
        raise NotImplementedError

    def set_compliance(self, product: str, version: str, compliance: str, run_id: str) -> None:
        raise NotImplementedError

    def get_diagnostics(self, run_id: str, check_name: str | None = None) -> list[dict[str, Any]]:
        raise NotImplementedError

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass

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

    def open_incident(self, product: str, run_id: str, severity: str, summary: str, check_name: str = "") -> Optional[str]:
        raise NotImplementedError

    def resolve_open_incidents(self, product: str, run_id: str) -> None:
        raise NotImplementedError

    def get_incidents(self, status: str | None = None, severity: str | None = None, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_incident(self, incident_id: str) -> Optional[dict]:
        raise NotImplementedError

    def transition_incident(self, incident_id: str, status: str, actor: str, note: str = "") -> Optional[dict]:
        raise NotImplementedError

    def assign_incident(self, incident_id: str, owner: str, actor: str) -> Optional[dict]:
        raise NotImplementedError

    def get_sla(self, product: str, window_days: int = 30) -> dict[str, Any]:
        raise NotImplementedError

    def get_object_family_status(self) -> dict[str, dict[str, dict[str, Any]]]:
        raise NotImplementedError

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass

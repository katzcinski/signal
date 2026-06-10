from typing import List, Optional
from dq_core.engine.models import RunSummary


class HanaStore:
    """HANA result store stub - for future deployment against dq_results_lt table."""

    def __init__(self, connection):
        self._conn = connection

    def save_run(self, summary: RunSummary) -> None:
        raise NotImplementedError("HanaStore.save_run not yet implemented")

    def get_run_detail(self, run_id: str) -> Optional[dict]: raise NotImplementedError
    def get_latest_run(self, dataset: str) -> Optional[dict]: raise NotImplementedError
    def get_history(self, dataset: str, limit: int = 10) -> List[dict]: raise NotImplementedError
    def get_previous_actuals(self, dataset: str, check_name: str, limit: int = 10) -> List[dict]: raise NotImplementedError
    def get_diagnostics(self, run_id: str, check_name: str) -> List[dict]: raise NotImplementedError
    def list_runs(self, limit: int = 50) -> List[dict]: raise NotImplementedError
    def get_object_status(self) -> List[dict]: raise NotImplementedError
    def update_run_state(self, run_id: str, state: str) -> None: raise NotImplementedError
    def save_compliance(self, product: str, contract_version: str, compliance: str, last_run_id: str) -> None: raise NotImplementedError
    def get_compliance(self, product: str) -> Optional[dict]: raise NotImplementedError
    def list_contracts(self) -> List[dict]: raise NotImplementedError
    def upsert_contract_index(self, product: str, lifecycle: str, owned_by: str, version: str, head_hash: str) -> None: raise NotImplementedError
    def save_proposal(self, proposal: dict) -> None: raise NotImplementedError
    def list_proposals(self, status: str = "open") -> List[dict]: raise NotImplementedError
    def update_proposal_status(self, proposal_id: str, status: str) -> None: raise NotImplementedError

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass

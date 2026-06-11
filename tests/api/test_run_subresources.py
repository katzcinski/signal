"""R2-6: Run-Sub-Ressourcen /results und /diagnostics (PII-gated)."""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[2]))


def _seed_run(db_path, *, with_diagnostics: bool):
    from dq_core.engine.models import CheckResult, RunSummary
    from dq_core.store.sqlite_store import ResultStore

    store = ResultStore(db_path, allow_diagnostics=with_diagnostics)
    now = datetime.now(timezone.utc).isoformat()
    result = CheckResult(
        name="amount_not_null", sql="SELECT 1", expect="= 0", severity="fail",
        passed=False, actual_value=3, type="missing",
        diagnostic_rows=[{"ORDER_ID": 1}, {"ORDER_ID": 2}],
    )
    store.save_run(RunSummary(
        run_id="run-1", dataset="DS_SALES_ORDERS", schema="S",
        started_at=now, finished_at=now, overall_status="fail",
        total=1, passed=0, failed=1, warnings=0,
        results=[result], run_state="finished",
    ))
    return store


def test_results_endpoint(api_client):
    import services.api.deps as deps_mod
    _seed_run(deps_mod.get_store().db_path, with_diagnostics=False)

    resp = api_client.get("/api/runs/run-1/results")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "amount_not_null"
    assert body[0]["state"] == "executed"
    assert body[0]["type"] == "missing"
    assert api_client.get("/api/runs/nope/results").status_code == 404


def test_diagnostics_endpoint_authz_and_gate(api_client):
    import services.api.deps as deps_mod
    _seed_run(deps_mod.get_store().db_path, with_diagnostics=False)

    # viewer darf nie Rohzeilen sehen
    resp = api_client.get("/api/runs/run-1/diagnostics", headers={"X-DQ-Role": "viewer"})
    assert resp.status_code == 403

    # Gate war off → nichts persistiert, leere Antwort (kein 500)
    resp = api_client.get("/api/runs/run-1/diagnostics")
    assert resp.status_code == 200
    assert resp.json() == []
    assert api_client.get("/api/runs/nope/diagnostics").status_code == 404


def test_diagnostics_returned_when_gate_enabled(api_client):
    import services.api.deps as deps_mod
    _seed_run(deps_mod.get_store().db_path, with_diagnostics=True)

    resp = api_client.get("/api/runs/run-1/diagnostics")
    assert resp.status_code == 200
    rows = resp.json()
    assert rows == [
        {"check_name": "amount_not_null", "row": {"ORDER_ID": 1}},
        {"check_name": "amount_not_null", "row": {"ORDER_ID": 2}},
    ]
    # Filter auf check_name
    assert api_client.get("/api/runs/run-1/diagnostics?check_name=other").json() == []

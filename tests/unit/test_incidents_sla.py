"""R4-1 incident lifecycle, R4-3 SLA-over-time, R2-6 diagnostics reader."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

from dq_core.engine.models import CheckResult, RunSummary
from dq_core.store.sqlite_store import ResultStore


def _store(tmp_path, **kw):
    return ResultStore(tmp_path / "t.db", **kw)


# ---------------------------------------------------------------- incidents


def test_open_incident_is_idempotent_per_episode(tmp_path):
    store = _store(tmp_path)
    first = store.open_incident("P", "r1", "critical", "2 failing checks")
    second = store.open_incident("P", "r2", "fail", "another fail")
    assert first is not None
    # Same open episode → same incident, not a second one.
    assert second == first
    assert len(store.get_incidents()) == 1


def test_incident_transition_and_timeline(tmp_path):
    store = _store(tmp_path)
    iid = store.open_incident("P", "r1", "fail", "breach")
    store.transition_incident(iid, "acknowledged", "alice", "looking")
    incident = store.transition_incident(iid, "investigating", "alice")
    assert incident["status"] == "investigating"
    kinds = [e["kind"] for e in incident["events"]]
    assert kinds == ["opened", "acknowledged", "investigating"]
    assert incident["events"][1]["actor"] == "alice"


def test_resolve_reopens_a_fresh_episode(tmp_path):
    store = _store(tmp_path)
    first = store.open_incident("P", "r1", "fail", "breach 1")
    store.transition_incident(first, "resolved", "alice")
    # After resolution a new breach opens a *new* incident.
    second = store.open_incident("P", "r2", "fail", "breach 2")
    assert second != first
    assert len(store.get_incidents()) == 2
    assert len(store.get_incidents(status="open")) == 1


def test_auto_resolve_open_incidents(tmp_path):
    store = _store(tmp_path)
    store.open_incident("P", "r1", "fail", "breach")
    store.resolve_open_incidents("P", "r2")
    assert store.get_incidents(status="open") == []
    resolved = store.get_incidents(status="resolved")
    assert len(resolved) == 1
    assert resolved[0]["resolved_at"]


def test_assign_incident(tmp_path):
    store = _store(tmp_path)
    iid = store.open_incident("P", "r1", "fail", "breach")
    incident = store.assign_incident(iid, "team-data", "alice")
    assert incident["owner"] == "team-data"
    assert incident["events"][-1]["kind"] == "assigned"


def test_incidents_sorted_by_severity(tmp_path):
    store = _store(tmp_path)
    store.open_incident("A", "r1", "fail", "x")
    store.open_incident("B", "r2", "critical", "y")
    rows = store.get_incidents()
    assert [r["product"] for r in rows] == ["B", "A"]


# ---------------------------------------------------------------- SLA


def test_sla_fully_compliant_window(tmp_path):
    store = _store(tmp_path)
    # No breach events → 100% uptime.
    sla = store.get_sla("P", window_days=30)
    assert sla["uptime_pct"] == 100.0
    assert sla["breached_seconds"] == 0


def test_sla_accounts_for_breached_interval(tmp_path):
    store = _store(tmp_path)
    now = datetime.now(timezone.utc)
    # Hand-craft a breach that started 10 days ago and recovered 5 days ago.
    with store._conn() as conn:
        conn.execute(
            "INSERT INTO dq_compliance_events (product, from_state, to_state, contract_version, run_id, at) VALUES (?,?,?,?,?,?)",
            ("P", "compliant", "breached", "1.0.0", "r1", (now - timedelta(days=10)).isoformat()),
        )
        conn.execute(
            "INSERT INTO dq_compliance_events (product, from_state, to_state, contract_version, run_id, at) VALUES (?,?,?,?,?,?)",
            ("P", "breached", "compliant", "1.0.0", "r2", (now - timedelta(days=5)).isoformat()),
        )
    sla = store.get_sla("P", window_days=30)
    # ~5 days breached out of 30 → ~83% uptime.
    assert 82.0 < sla["uptime_pct"] < 84.0
    assert sla["current_state"] == "compliant"


# ---------------------------------------------------------------- diagnostics


def test_get_diagnostics_returns_allowlisted_rows(tmp_path):
    store = ResultStore(tmp_path / "t.db", allow_diagnostics=True, diagnostics_columns=["COL"])
    summary = RunSummary(
        run_id="r1", dataset="DS", schema="S",
        started_at=datetime.now(timezone.utc).isoformat(), finished_at="",
        overall_status="fail", total=1, passed=0, failed=1, warnings=0,
        results=[CheckResult(name="c", sql="SELECT 1", expect="= 1", severity="fail",
                             passed=False, diagnostic_rows=[{"COL": "v", "SECRET": "x"}])],
    )
    store.save_run(summary)
    diags = store.get_diagnostics("r1")
    assert len(diags) == 1
    assert diags[0]["row"] == {"COL": "v"}  # SECRET projected out at write time
    assert diags[0]["check_name"] == "c"

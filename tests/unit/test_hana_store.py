"""HanaStore (O6) — Slice-1-Verifikation.

Zwei Ebenen, beide hier ausführbar (ohne echten Tenant):

1. **Round-Trip der Kern-Tranche** gegen ein DBAPI-Double, das die
   `hdbcli`-Zugriffsform nachbildet (Cursor→Tupel + description, session-scoped
   Identity) und die *wenigen* HANA-Dialekt-Konstrukte (UPSERT,
   CURRENT_IDENTITY_VALUE) für die Ausführung auf SQLite rückübersetzt. Damit
   läuft der **reale HanaStore-Python-Pfad** (seine Bodies + HANA-Dialekt-
   Strings) und wird auf Korrektheit geprüft. `[HANA-VERIFY]` Die Ausführung
   der echten HANA-DDL/-SQL bleibt der Smoke-Harness vorbehalten (C4/L1).

2. **Oberflächen-Parität**: HanaStore deckt die volle public-Fläche des
   SqliteStore ab (implementiert oder als getrackter NotImplementedError-Stub).
"""
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

from dq_core.engine.models import CheckResult, RunSummary
from dq_core.store.hana_store import HanaStore, PENDING_HANA_METHODS
from dq_core.store.sqlite_store import ResultStore


# ----------------------------------------------------------------------
# DBAPI-Double: spricht die hdbcli-Form, führt auf SQLite aus.
# ----------------------------------------------------------------------

def _rewrite_hana_sql(sql: str) -> str:
    # UPSERT t (cols) VALUES (...) WITH PRIMARY KEY  →  INSERT OR REPLACE INTO t (...)
    s = re.sub(r"^\s*UPSERT\s+", "INSERT OR REPLACE INTO ", sql, flags=re.IGNORECASE)
    s = re.sub(r"\s+WITH\s+PRIMARY\s+KEY\s*$", "", s, flags=re.IGNORECASE)
    # Session-scoped Identity → SQLite-Äquivalent.
    s = re.sub(r"CURRENT_IDENTITY_VALUE\(\)\s+FROM\s+DUMMY", "last_insert_rowid()", s, flags=re.IGNORECASE)
    return s


class _FakeCursor:
    def __init__(self, cur: sqlite3.Cursor) -> None:
        self._cur = cur

    def execute(self, sql, params=None):
        sql = _rewrite_hana_sql(sql)
        if params:
            self._cur.execute(sql, list(params))
        else:
            self._cur.execute(sql)
        return self

    @property
    def description(self):
        return self._cur.description

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def close(self):
        self._cur.close()


class _FakeHanaConnection:
    """hdbcli-förmige Fassade über eine SQLite-Verbindung (Tupel-Zeilen)."""

    def __init__(self, sqlite_path: str) -> None:
        self._db = sqlite3.connect(sqlite_path)  # default: Tupel-Zeilen + description

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self._db.cursor())

    def commit(self) -> None:
        self._db.commit()

    def rollback(self) -> None:
        self._db.rollback()

    def close(self) -> None:
        self._db.close()


def _summary(run_id: str, dataset: str = "DS_X", state: str = "finished", actual: str = "42") -> RunSummary:
    return RunSummary(
        run_id=run_id, dataset=dataset, schema="S",
        started_at=datetime.now(timezone.utc).isoformat(),
        finished_at="", overall_status="pass",
        total=1, passed=1, failed=0, warnings=0,
        results=[CheckResult(name="row_count", sql="SELECT 1", expect="> 0",
                             severity="warn", passed=True, actual_value=actual)],
        run_state=state,
    )


@pytest.fixture()
def hana(tmp_path):
    """HanaStore auf einem DBAPI-Double; Schema aus den realen Migrationen
    (über einen SqliteStore auf derselben Datei aufgebaut)."""
    db = tmp_path / "hana_double.db"
    ResultStore(db)  # legt das komplette Schema an (gemeinsame Migrationen)
    conn = _FakeHanaConnection(str(db))
    store = HanaStore(conn, allow_diagnostics=False)
    yield store
    store.close()


def _sqlite_readback(tmp_path):
    return ResultStore(tmp_path / "hana_double.db")


def test_save_and_get_run_roundtrip(hana):
    hana.save_run(_summary("r1"))
    run = hana.get_run("r1")
    assert run is not None
    assert run["run_id"] == "r1"
    assert run["dataset"] == "DS_X"
    assert len(run["results"]) == 1
    assert run["results"][0]["check_name"] == "row_count"


def test_get_runs_and_previous_actuals(hana):
    hana.save_run(_summary("r1", actual="10"))
    hana.save_run(_summary("r2", actual="20"))
    runs = hana.get_runs("DS_X", limit=10)
    assert {r["run_id"] for r in runs} == {"r1", "r2"}
    # jüngster finished-Run bestimmt die previous actuals
    actuals = hana.get_previous_actuals("DS_X")
    assert actuals.get("row_count") in {"10", "20"}


def test_set_run_state(hana):
    hana.save_run(_summary("r1", state="running"))
    hana.set_run_state("r1", "finished", datetime.now(timezone.utc).isoformat())
    assert hana.get_run("r1")["run_state"] == "finished"


def test_compliance_events_and_since(hana):
    hana.set_compliance("P", "1.0.0", "compliant", "r1")
    first = hana.get_compliance("P")
    hana.set_compliance("P", "1.0.0", "compliant", "r2")   # kein Wechsel
    assert hana.get_compliance("P")["since"] == first["since"]
    assert len(hana.get_compliance_events("P")) == 1
    hana.set_compliance("P", "1.0.0", "breached", "r3")     # Übergang
    events = hana.get_compliance_events("P")
    assert len(events) == 2
    assert events[0]["from_state"] == "compliant" and events[0]["to_state"] == "breached"


def test_progress_append_and_read(hana):
    i1 = hana.append_progress("op1", "line-1")
    i2 = hana.append_progress("op1", "line-2")
    assert i2 > i1
    rows = hana.get_progress("op1", after_id=i1)
    assert [r["line"] for r in rows] == ["line-2"]


def test_operation_update_and_meta(hana):
    # finish_operation (Update-Pfad) — begin_operation kommt in Tranche 2.
    with hana._conn() as c:
        c.execute(
            "INSERT INTO dq_operations (op_id, kind, state, created_by, started_at) VALUES (?,?,?,?,?)",
            ("op1", "run", "running", "", datetime.now(timezone.utc).isoformat()),
        )
    hana.finish_operation("op1", "done", result_json='{"ok":true}')
    op = hana.get_operation("op1")
    assert op["state"] == "done"
    hana.set_meta("k", "v1")
    hana.set_meta("k", "v2")  # Upsert überschreibt
    assert hana.get_meta("k") == "v2"


# ----------------------------------------------------------------------
# Oberflächen-Parität
# ----------------------------------------------------------------------

def test_hana_covers_full_sqlite_surface():
    sqlite_surface = {
        n for n in dir(ResultStore)
        if not n.startswith("_") and callable(getattr(ResultStore, n))
    }
    missing = {n for n in sqlite_surface if not hasattr(HanaStore, n)}
    assert not missing, f"HanaStore fehlt Oberfläche: {sorted(missing)}"


def test_tranche_is_really_implemented_not_stubbed():
    implemented = {
        "save_run", "set_run_state", "get_run", "get_runs", "get_all_runs",
        "get_latest_run", "get_previous_actuals", "get_check_history",
        "set_compliance", "get_compliance", "get_compliance_events",
        "get_diagnostics", "append_progress", "get_progress",
        "finish_operation", "get_operation", "get_meta", "set_meta",
    }
    assert implemented.isdisjoint(set(PENDING_HANA_METHODS))


def test_pending_methods_raise_clear_notimplemented():
    store = HanaStore(connection=None)
    with pytest.raises(NotImplementedError, match=r"Tranche 2\+"):
        store.begin_operation("op", "run")

"""HanaStore-Smoke gegen einen ECHTEN HANA/Datasphere-Tenant (O6 · C4/L1).

`[HANA-VERIFY]` Diese Suite ist der einzige Ort, an dem die HANA-DDL/-SQL
tatsächlich ausgeführt wird — sie kann daher nicht in der normalen CI laufen
(kein Tenant, kein `hdbcli`-Pfad). Sie ist doppelt gegatet:

* Umgebungsvariable ``HANA_SMOKE=1`` **und**
* eine konfigurierte ``RESULTS_ENVIRONMENT`` (Name in ``ENVIRONMENTS_FILE``).

Fehlt eines von beidem, wird die Suite übersprungen (kein Fehlschlag).

Start: ``make hana-smoke`` (setzt ``HANA_SMOKE=1``).

Prüft, was `docs/OPEN_TASKS.md` C als Acceptance nennt:
`ensure_schema()` legt die Tabellen im Open-SQL-Schema an und die Kern-Tranche
schreibt/liest deckungsgleich zum SqliteStore.
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

pytestmark = pytest.mark.skipif(
    os.environ.get("HANA_SMOKE") != "1",
    reason="HanaStore-Smoke nur mit HANA_SMOKE=1 gegen echten Tenant (C4/L1).",
)


@pytest.fixture(scope="module")
def store():
    # Baut den Store exakt über den Produktionspfad (deps._build_hana_store),
    # damit Environment-Auflösung, Schema-Bindung und Migrationen mitgetestet werden.
    from services.api.settings import get_settings
    from services.api.deps import _build_hana_store

    settings = get_settings()
    if settings.store_backend != "hana" or not settings.results_environment:
        pytest.skip("STORE_BACKEND=hana + RESULTS_ENVIRONMENT erforderlich.")
    s = _build_hana_store(settings)
    yield s
    s.close()


def _summary(run_id, dataset, state="finished"):
    from dq_core.engine.models import CheckResult, RunSummary
    return RunSummary(
        run_id=run_id, dataset=dataset, schema="SMOKE",
        started_at=datetime.now(timezone.utc).isoformat(),
        finished_at="", overall_status="pass",
        total=1, passed=1, failed=0, warnings=0,
        results=[CheckResult(name="row_count", sql="SELECT 1", expect="> 0",
                             severity="warn", passed=True, actual_value="7")],
        run_state=state,
    )


def test_ensure_schema_and_run_roundtrip(store):
    ds = f"SMOKE_{uuid.uuid4().hex[:8]}"
    rid = f"r_{uuid.uuid4().hex[:8]}"
    store.save_run(_summary(rid, ds))
    run = store.get_run(rid)
    assert run is not None and run["run_id"] == rid
    assert run["results"][0]["check_name"] == "row_count"
    assert store.get_previous_actuals(ds).get("row_count") == "7"


def test_compliance_transition(store):
    prod = f"P_{uuid.uuid4().hex[:8]}"
    store.set_compliance(prod, "1.0.0", "compliant", "r1")
    store.set_compliance(prod, "1.0.0", "breached", "r2")
    events = store.get_compliance_events(prod)
    assert events and events[0]["to_state"] == "breached"


def test_doublerun_guard_generated_column(store):
    """[HANA-VERIFY] Der F2-Guard läuft auf HANA über eine generierte Guard-Spalte
    + Unique-Constraint (Übersetzung des SQLite-Partial-Index). Genau hier zeigt
    sich, ob generierte Spalte und Mehrfach-NULL-Unique wie erwartet greifen."""
    ds = f"SMOKE_{uuid.uuid4().hex[:8]}"
    r1 = f"r_{uuid.uuid4().hex[:8]}"
    assert store.try_begin_run(_summary(r1, ds, state="running")) is True
    assert store.try_begin_run(_summary(f"r_{uuid.uuid4().hex[:8]}", ds, state="running")) is False
    store.set_run_state(r1, "finished", datetime.now(timezone.utc).isoformat())
    assert store.try_begin_run(_summary(f"r_{uuid.uuid4().hex[:8]}", ds, state="running")) is True

"""HANA-Result-Store (O6) — `hdbcli`-Backend für Full-Deployment & Managed Service.

Teilt sich mit `ResultStore` (SQLite) den **gemeinsamen Kern**: denselben
Migrations-Runner (`migration_runner.run_migrations`) über **eine** Migrations-
Quelle, zur Laufzeit per `HanaDialect` in HANA-Syntax übersetzt, und dieselben
qmark-Parameter (`?`).

**Stand (Slice 1, O6):** Die dialekt-sichere **Kern-Tranche** (Runs, Ergebnisse,
Compliance, Progress, Operations-Update, Diagnostics, Meta) ist implementiert und
gegen ein DBAPI-Double round-trip-getestet
(`tests/unit/test_hana_store.py`). Die übrige Store-Fläche (Incidents, Schedules,
Quarantäne, Notifications, Healing, Profiling, Schema-Drift sowie die datums-
arithmetischen Reports) ist als getrackte `NotImplementedError` markiert und
folgt in Tranche 2+ (siehe `docs/OPEN_TASKS.md` C).

`[HANA-VERIFY]` Ausführung gegen einen echten Tenant ist hier nicht möglich
(nur `MockConnection`); die Verifikation läuft über die env-gegatete
Smoke-Harness (`tests/integration/test_hana_smoke.py`, `make hana-smoke`, C4/L1).
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator, Optional

from ..engine.models import RunSummary
from .dialect import HANA


# ----------------------------------------------------------------------
# DBAPI-Fassade: gibt `hdbcli`-Zeilen als dict aus und liefert `lastrowid`
# session-scoped über CURRENT_IDENTITY_VALUE — so sind die Method-Bodies
# formgleich zum SqliteStore (dict-Zeilen, `cur.lastrowid`).
# ----------------------------------------------------------------------

class _Result:
    def __init__(self, raw_cursor: Any, connection: Any) -> None:
        self._cur = raw_cursor
        self._conn = connection

    def _columns(self) -> list[str]:
        desc = self._cur.description or []
        return [d[0] for d in desc]

    def fetchone(self) -> Optional[dict[str, Any]]:
        row = self._cur.fetchone()
        if row is None:
            return None
        return dict(zip(self._columns(), row))

    def fetchall(self) -> list[dict[str, Any]]:
        cols = self._columns()
        return [dict(zip(cols, row)) for row in self._cur.fetchall()]

    @property
    def lastrowid(self) -> int:
        # `[HANA-VERIFY]` session-scoped zuletzt generierte Identity.
        cur = self._conn.cursor()
        try:
            cur.execute("SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY")
            row = cur.fetchone()
            return int(row[0]) if row and row[0] is not None else 0
        finally:
            cur.close()


class _ConnFacade:
    """Bietet die `conn.execute(sql, params) -> result`-Form (wie sqlite3)."""

    def __init__(self, connection: Any) -> None:
        self._conn = connection

    def execute(self, sql: str, params: tuple | list = ()) -> _Result:
        cur = self._conn.cursor()
        if params:
            cur.execute(sql, list(params))
        else:
            cur.execute(sql)
        return _Result(cur, self._conn)


class HanaStore:
    """Result-Store gegen SAP HANA (`hdbcli`). Deckungsgleich zu `ResultStore`."""

    def __init__(
        self,
        connection: Any,
        *,
        schema: str | None = None,
        allow_diagnostics: bool = False,
        diagnostics_columns: list[str] | None = None,
    ) -> None:
        self._conn_raw = connection
        self._schema = schema
        self._dialect = HANA
        # [PII-GATE] Default off — nur bei explizitem Opt-in werden Diagnosezeilen
        # persistiert (S1/G8), identisch zum SqliteStore.
        self._allow_diagnostics = allow_diagnostics
        self._diagnostics_columns = set(diagnostics_columns) if diagnostics_columns else None
        # Kein DB-I/O im Konstruktor: `HanaStore(connection=None)` bleibt für den
        # Protokoll-/Paritätstest konstruierbar. Schema-Setup ist explizit.

    # ------------------------------------------------------------------
    # Connection / Schema
    # ------------------------------------------------------------------

    @contextmanager
    def _conn(self) -> Generator[_ConnFacade, None, None]:
        if self._conn_raw is None:
            raise RuntimeError("HanaStore: keine Verbindung gesetzt.")
        facade = _ConnFacade(self._conn_raw)
        try:
            yield facade
            self._conn_raw.commit()
        except Exception:
            self._conn_raw.rollback()
            raise

    def ensure_schema(self) -> list[str]:
        """Legt Migrations- und Store-Tabellen im gebundenen Open-SQL-Schema an.

        `[SCHEMA-MAP]` Das Schema wird an der Verbindung gebunden (currentSchema
        beim Connect bzw. `SET SCHEMA`), nicht in DDL literalisiert (G2). Nur
        aufrufen, wenn eine echte Verbindung vorliegt.
        """
        from .migration_runner import run_migrations

        with self._conn() as conn:
            if self._schema:
                # Identifier, kein Literal-in-Paket: kommt aus der Environment-Config.
                conn.execute(f'SET SCHEMA "{self._schema}"')
            conn.execute(
                self._dialect.translate_ddl(
                    "CREATE TABLE IF NOT EXISTS schema_migrations "
                    "(version TEXT PRIMARY KEY, applied_at TEXT)"
                )
            )
            applied = {
                r["version"]
                for r in conn.execute("SELECT version FROM schema_migrations").fetchall()
            }

            def _record(version: str) -> None:
                conn.execute(
                    "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                    (version, datetime.now(timezone.utc).isoformat()),
                )

            return run_migrations(
                execute=lambda stmt: conn.execute(stmt),
                already_applied=applied,
                record=_record,
                dialect=self._dialect,
            )

    def close(self) -> None:
        try:
            if self._conn_raw is not None:
                self._conn_raw.close()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Kern-Tranche: Runs & Ergebnisse
    # ------------------------------------------------------------------

    _RUN_COLUMNS = [
        "run_id", "dataset", "schema_name", "started_at", "finished_at",
        "overall_status", "total_checks", "passed_checks", "failed_checks",
        "warning_checks", "triggered_by", "contract_version", "contract_hash",
        "actor", "run_state", "gate_verdict",
    ]

    def save_run(self, summary: RunSummary) -> None:
        with self._conn() as conn:
            conn.execute(
                self._dialect.upsert("dq_runs", self._RUN_COLUMNS, ["run_id"]),
                (
                    summary.run_id, summary.dataset, summary.schema,
                    summary.started_at, summary.finished_at,
                    summary.overall_status, summary.total, summary.passed,
                    summary.failed, summary.warnings, summary.triggered_by,
                    summary.contract_version, summary.contract_hash,
                    summary.actor, summary.run_state, summary.gate_verdict,
                ),
            )
            for result in summary.results:
                row = conn.execute(
                    """INSERT INTO dq_check_results
                       (run_id, check_name, sql_text, expect_expr, severity,
                        passed, actual_value, error_message, duration_ms, state, check_type, kind,
                        enforcement_mode)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        summary.run_id, result.name, result.sql, result.expect,
                        result.severity, int(result.passed),
                        str(result.actual_value) if result.actual_value is not None else None,
                        result.error, result.duration_ms, result.state, result.type, result.kind,
                        result.enforcement,
                    ),
                ).lastrowid
                # [PII-GATE] nur bei explizitem Opt-in (S1/G8).
                if self._allow_diagnostics and result.diagnostic_rows:
                    for diag in result.diagnostic_rows:
                        if self._diagnostics_columns:
                            diag = {k: v for k, v in diag.items() if k in self._diagnostics_columns}
                        conn.execute(
                            "INSERT INTO dq_diagnostics(result_id, run_id, check_name, row_data) "
                            "VALUES (?,?,?,?)",
                            (row, summary.run_id, result.name, json.dumps(diag)),
                        )

    def set_run_state(self, run_id: str, state: str, finished_at: str | None = None) -> None:
        with self._conn() as conn:
            if finished_at:
                conn.execute(
                    "UPDATE dq_runs SET run_state=?, finished_at=? WHERE run_id=?",
                    (state, finished_at, run_id),
                )
            else:
                conn.execute(
                    "UPDATE dq_runs SET run_state=? WHERE run_id=?",
                    (state, run_id),
                )

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM dq_runs WHERE run_id=?", (run_id,)).fetchone()
            if not row:
                return None
            run = dict(row)
            results = conn.execute(
                "SELECT * FROM dq_check_results WHERE run_id=? ORDER BY id", (run_id,),
            ).fetchall()
            run["results"] = [dict(r) for r in results]
            return run

    def get_runs(self, dataset: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_runs WHERE dataset=? ORDER BY started_at DESC LIMIT ?",
                (dataset, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_all_runs(self, limit: int = 200, offset: int = 0) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_runs ORDER BY started_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_latest_run(self, dataset: str) -> dict[str, Any] | None:
        runs = self.get_runs(dataset, limit=1)
        if not runs:
            return None
        return self.get_run(runs[0]["run_id"])

    def get_previous_actuals(self, dataset: str) -> dict[str, str]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT cr.check_name, cr.actual_value
                   FROM dq_check_results cr
                   JOIN dq_runs r ON cr.run_id = r.run_id
                   WHERE r.dataset = ? AND r.run_state = 'finished'
                   AND r.started_at = (
                       SELECT MAX(r2.started_at) FROM dq_runs r2
                       WHERE r2.dataset = ? AND r2.run_state = 'finished'
                   )""",
                (dataset, dataset),
            ).fetchall()
            return {r["check_name"]: r["actual_value"] for r in rows if r["actual_value"] is not None}

    def get_check_history(self, dataset: str, check_name: str, limit: int = 50) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT cr.actual_value, cr.passed, cr.state, r.started_at, r.run_id
                   FROM dq_check_results cr
                   JOIN dq_runs r ON cr.run_id = r.run_id
                   WHERE r.dataset=? AND cr.check_name=?
                   ORDER BY r.started_at DESC LIMIT ?""",
                (dataset, check_name, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_diagnostics(self, run_id: str, check_name: str | None = None) -> list[dict[str, Any]]:
        with self._conn() as conn:
            if check_name:
                rows = conn.execute(
                    "SELECT check_name, row_data FROM dq_diagnostics "
                    "WHERE run_id=? AND check_name=? ORDER BY id",
                    (run_id, check_name),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT check_name, row_data FROM dq_diagnostics WHERE run_id=? ORDER BY id",
                    (run_id,),
                ).fetchall()
        out = []
        for r in rows:
            try:
                data = json.loads(r["row_data"])
            except (TypeError, ValueError):
                data = {}
            out.append({"check_name": r["check_name"], "row": data})
        return out

    # ------------------------------------------------------------------
    # Kern-Tranche: Compliance
    # ------------------------------------------------------------------

    def set_compliance(self, product: str, version: str, compliance: str, run_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT compliance, since FROM dq_compliance WHERE product=?", (product,)
            ).fetchone()
            previous = row["compliance"] if row else None
            since = now if previous != compliance else row["since"]
            conn.execute(
                self._dialect.upsert(
                    "dq_compliance",
                    ["product", "contract_version", "compliance", "since", "last_run_id"],
                    ["product"],
                ),
                (product, version, compliance, since, run_id),
            )
            if previous != compliance:
                conn.execute(
                    """INSERT INTO dq_compliance_events
                       (product, from_state, to_state, contract_version, run_id, at)
                       VALUES (?,?,?,?,?,?)""",
                    (product, previous or "unknown", compliance, version, run_id, now),
                )

    def get_compliance(self, product: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_compliance WHERE product=?", (product,)
            ).fetchone()
            return dict(row) if row else None

    def get_compliance_events(self, product: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_compliance_events WHERE product=? ORDER BY id DESC LIMIT ?",
                (product, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Kern-Tranche: Progress / Operations (Update-Pfad) / Meta
    # ------------------------------------------------------------------

    def append_progress(self, stream_id: str, line: str) -> int:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO dq_progress(stream_id, ts, line) VALUES (?,?,?)",
                (stream_id, now, line),
            )
            return int(cur.lastrowid)

    def get_progress(self, stream_id: str, after_id: int = 0) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, stream_id, ts, line FROM dq_progress "
                "WHERE stream_id=? AND id>? ORDER BY id",
                (stream_id, int(after_id or 0)),
            ).fetchall()
            return [dict(r) for r in rows]

    def finish_operation(
        self,
        op_id: str,
        state: str,
        result_json: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """UPDATE dq_operations
                   SET state=?, finished_at=?, result_json=?, error=?
                   WHERE op_id=?""",
                (state, datetime.now(timezone.utc).isoformat(), result_json, error, op_id),
            )

    def get_operation(self, op_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_operations WHERE op_id=?", (op_id,)
            ).fetchone()
            return dict(row) if row else None

    def get_meta(self, key: str) -> str | None:
        with self._conn() as conn:
            row = conn.execute("SELECT value FROM dq_meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None

    def set_meta(self, key: str, value: str) -> None:
        with self._conn() as conn:
            conn.execute(
                self._dialect.upsert("dq_meta", ["key", "value"], ["key"]),
                (key, value),
            )

    # ------------------------------------------------------------------
    # Tranche 2: Doppellauf-/Duplikat-Schutz (Unique-Verletzung dialekt-erkannt)
    # ------------------------------------------------------------------

    def try_begin_run(self, summary: RunSummary) -> bool:
        """F2: Run-Registrierung mit Store-seitigem Doppellauf-Schutz.

        Bewusst **plain INSERT** (kein Upsert): der Doppellauf-Guard je Dataset
        (auf HANA: generierte Guard-Spalte + Unique-Constraint, Übersetzung des
        SQLite-Partial-Index in `HanaDialect.translate_ddl`) muss feuern statt
        still zu ersetzen. Returns False, wenn bereits ein Run für das Dataset läuft.
        """
        try:
            with self._conn() as conn:
                conn.execute(
                    """INSERT INTO dq_runs
                       (run_id, dataset, schema_name, started_at, finished_at,
                        overall_status, total_checks, passed_checks, failed_checks,
                        warning_checks, triggered_by, contract_version, contract_hash,
                        actor, run_state, gate_verdict)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        summary.run_id, summary.dataset, summary.schema,
                        summary.started_at, summary.finished_at,
                        summary.overall_status, summary.total, summary.passed,
                        summary.failed, summary.warnings, summary.triggered_by,
                        summary.contract_version, summary.contract_hash,
                        summary.actor, summary.run_state, summary.gate_verdict,
                    ),
                )
            return True
        except Exception as exc:  # noqa: BLE001 — Dialekt entscheidet Unique-Verletzung
            if self._dialect.is_unique_violation(exc):
                return False
            raise

    def begin_operation(self, op_id: str, kind: str, created_by: str = "") -> bool:
        """Registriert eine Hintergrund-Operation einmalig; doppelte op_ids
        (PK-Konflikt) werden abgelehnt."""
        try:
            with self._conn() as conn:
                conn.execute(
                    """INSERT INTO dq_operations
                       (op_id, kind, state, created_by, started_at)
                       VALUES (?,?,?,?,?)""",
                    (op_id, kind, "running", created_by, datetime.now(timezone.utc).isoformat()),
                )
            return True
        except Exception as exc:  # noqa: BLE001 — Dialekt entscheidet Unique-Verletzung
            if self._dialect.is_unique_violation(exc):
                return False
            raise


# ----------------------------------------------------------------------
# Paritäts-Sicherung: jede public-Methode des SqliteStore, die HanaStore
# (noch) nicht implementiert, wird als getrackter NotImplementedError-Stub
# injiziert. Damit erfüllt HanaStore die volle Store-Oberfläche strukturell
# (Protokoll-/Paritätstest) und die offene Portierung ist selbst-dokumentiert.
# ----------------------------------------------------------------------

def _install_pending_stubs() -> list[str]:
    from .sqlite_store import ResultStore as _Sqlite

    pending: list[str] = []

    def _make(name: str):
        def _stub(self, *args: Any, **kwargs: Any):  # noqa: ANN001
            raise NotImplementedError(
                f"HanaStore.{name} — noch nicht portiert (O6, Tranche 2+). "
                "Siehe docs/OPEN_TASKS.md Abschnitt C."
            )
        _stub.__name__ = name
        _stub.__qualname__ = f"HanaStore.{name}"
        _stub.__doc__ = f"[pending O6] {name}: in Tranche 2+ zu portieren."
        return _stub

    for name in dir(_Sqlite):
        if name.startswith("_"):
            continue
        if not callable(getattr(_Sqlite, name)):
            continue
        if not hasattr(HanaStore, name):
            setattr(HanaStore, name, _make(name))
            pending.append(name)
    return pending


#: Namen der noch offenen (gestubten) Store-Methoden — für Tests/Reporting.
PENDING_HANA_METHODS: list[str] = _install_pending_stubs()

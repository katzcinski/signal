from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

from ..engine.models import CheckResult, RunSummary


class ResultStore:
    """SQLite-backed result store. [SCHEMA-MAP] schema binding lives at run-time."""

    def __init__(self, db_path: str | Path = "signal.db") -> None:
        self.db_path = str(db_path)
        self._init_db()

    # ------------------------------------------------------------------
    # Connection helper
    # ------------------------------------------------------------------

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Schema initialisation (migration runner)
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        migrations_dir = Path(__file__).parent / "migrations"
        with self._conn() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version TEXT PRIMARY KEY, applied_at TEXT)"
            )
            applied = {
                row[0]
                for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
            }
            for path in sorted(migrations_dir.glob("*.sql")):
                version = path.stem
                if version not in applied:
                    self._run_migration(conn, path.read_text(encoding="utf-8"))
                    conn.execute(
                        "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                        (version, datetime.now(timezone.utc).isoformat()),
                    )

    @staticmethod
    def _run_migration(conn: sqlite3.Connection, sql: str) -> None:
        """Run a migration statement-by-statement, skipping ADD COLUMN
        statements that fail because the column already exists."""
        for stmt in sql.split(";"):
            # Strip comment-only lines at the top of a statement, then check
            # if anything executable remains.
            lines = [ln for ln in stmt.splitlines() if not ln.strip().startswith("--")]
            executable = "\n".join(lines).strip()
            if not executable:
                continue
            try:
                conn.execute(executable)
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    continue
                raise

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def save_run(self, summary: RunSummary) -> None:
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO dq_runs
                   (run_id, dataset, schema_name, started_at, finished_at,
                    overall_status, total_checks, passed_checks, failed_checks,
                    warning_checks, triggered_by, contract_version, contract_hash,
                    actor, run_state)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    summary.run_id, summary.dataset, summary.schema,
                    summary.started_at, summary.finished_at,
                    summary.overall_status, summary.total, summary.passed,
                    summary.failed, summary.warnings, summary.triggered_by,
                    summary.contract_version, summary.contract_hash,
                    summary.actor, summary.run_state,
                ),
            )
            for result in summary.results:
                row = conn.execute(
                    """INSERT INTO dq_check_results
                       (run_id, check_name, sql_text, expect_expr, severity,
                        passed, actual_value, error_message, duration_ms, state)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (
                        summary.run_id, result.name, result.sql, result.expect,
                        result.severity, int(result.passed),
                        str(result.actual_value) if result.actual_value is not None else None,
                        result.error, result.duration_ms, result.state,
                    ),
                ).lastrowid
                # [PII-GATE] diagnostic_rows only when explicitly enabled (handled upstream)
                for diag in result.diagnostic_rows:
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

    def set_compliance(self, product: str, version: str, compliance: str, run_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO dq_compliance
                   (product, contract_version, compliance, since, last_run_id)
                   VALUES (?,?,?,?,?)""",
                (product, version, compliance, now, run_id),
            )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_runs WHERE run_id=?", (run_id,)
            ).fetchone()
            if not row:
                return None
            run = dict(row)
            results = conn.execute(
                "SELECT * FROM dq_check_results WHERE run_id=? ORDER BY id",
                (run_id,),
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

    def get_all_runs(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_runs ORDER BY started_at DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_previous_actuals(self, dataset: str) -> dict[str, str]:
        """Return the latest actual_value per check_name for *dataset*."""
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

    def get_compliance(self, product: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_compliance WHERE product=?", (product,)
            ).fetchone()
            return dict(row) if row else None

    def get_latest_run(self, dataset: str) -> dict[str, Any] | None:
        runs = self.get_runs(dataset, limit=1)
        if not runs:
            return None
        return self.get_run(runs[0]["run_id"])

    def get_object_status(self) -> list[dict[str, Any]]:
        """Rollup: per object/dataset the worst active status across all families."""
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT
                     r.dataset,
                     MAX(CASE WHEN cr.severity='critical' AND cr.passed=0 THEN 4
                              WHEN cr.severity='fail'     AND cr.passed=0 THEN 3
                              WHEN cr.severity='warn'     AND cr.passed=0 THEN 2
                              WHEN cr.error_message IS NOT NULL        THEN 1
                              ELSE 0 END) AS worst_score,
                     SUM(cr.passed) AS passed_checks,
                     COUNT(cr.id)   AS total_checks,
                     MAX(r.finished_at) AS last_run,
                     r.run_id AS last_run_id
                   FROM dq_check_results cr
                   JOIN dq_runs r ON cr.run_id = r.run_id
                   WHERE r.started_at = (
                     SELECT MAX(r2.started_at) FROM dq_runs r2
                     WHERE r2.dataset = r.dataset AND r2.run_state='finished'
                   )
                   GROUP BY r.dataset""",
                (),
            ).fetchall()
            status_map = {0: "pass", 1: "error", 2: "warn", 3: "fail", 4: "critical"}
            return [
                {**dict(r), "status": status_map.get(r["worst_score"], "unknown")}
                for r in rows
            ]

import sqlite3
import json
import threading
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from dq_core.engine.models import RunSummary, CheckResult


class SQLiteStore:
    def __init__(self, db_path: str = "dq_results.db", allow_diagnostics: bool = False):
        self._db_path = db_path
        self._allow_diagnostics = allow_diagnostics or os.environ.get("ALLOW_LOCAL_DIAGNOSTICS", "").lower() == "true"
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._run_migrations()

    def _run_migrations(self):
        migrations_dir = Path(__file__).parent / "migrations"
        migration_files = sorted(migrations_dir.glob("*.sql"))

        # Ensure schema_migrations table exists
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
              name TEXT PRIMARY KEY, applied_at TEXT NOT NULL
            )
        """)
        self._conn.commit()

        applied = {row[0] for row in self._conn.execute("SELECT name FROM schema_migrations")}

        for mf in migration_files:
            if mf.name in applied:
                continue
            sql = mf.read_text()
            # Execute each statement, skipping ALTER TABLE errors (idempotency for SQLite)
            for stmt in sql.split(";"):
                stmt = stmt.strip()
                if not stmt or stmt.startswith("--"):
                    continue
                try:
                    self._conn.execute(stmt)
                except sqlite3.OperationalError as e:
                    if "duplicate column name" in str(e).lower():
                        continue  # idempotent
                    raise
            self._conn.execute(
                "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
                (mf.name, datetime.now(timezone.utc).isoformat())
            )
            self._conn.commit()

    def save_run(self, summary: RunSummary) -> None:
        with self._lock:
            self._conn.execute("""
                INSERT OR REPLACE INTO dq_runs
                  (run_id, dataset, schema_name, started_at, finished_at,
                   overall_status, total_checks, passed_checks, failed_checks,
                   warning_checks, triggered_by, contract_version, contract_hash,
                   actor, run_state)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                summary.run_id, summary.dataset, summary.schema,
                summary.started_at, summary.finished_at, summary.overall_status,
                summary.total, summary.passed, summary.failed, summary.warnings,
                summary.triggered_by, summary.contract_version, summary.contract_hash,
                summary.actor, summary.run_state,
            ))
            for r in summary.results:
                self._conn.execute("""
                    INSERT INTO dq_check_results
                      (run_id, check_name, sql_text, expect_expr, severity,
                       passed, actual_value, error_message, duration_ms, state)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    summary.run_id, r.name, r.sql, r.expect, r.severity,
                    1 if r.passed else 0,
                    str(r.actual_value) if r.actual_value is not None else None,
                    r.error, r.duration_ms, r.state,
                ))
                if self._allow_diagnostics and r.diagnostic_rows:
                    for row in r.diagnostic_rows:
                        self._conn.execute(
                            "INSERT INTO dq_diagnostics (run_id, check_name, row_data) VALUES (?,?,?)",
                            (summary.run_id, r.name, json.dumps(row))
                        )
            self._conn.commit()

    def update_run_state(self, run_id: str, state: str) -> None:
        # Also create a skeleton run row if it doesn't exist yet
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            self._conn.execute("""
                INSERT OR IGNORE INTO dq_runs
                  (run_id, dataset, schema_name, started_at, run_state)
                VALUES (?, '', '', ?, ?)
            """, (run_id, now, state))
            self._conn.execute(
                "UPDATE dq_runs SET run_state=? WHERE run_id=?", (state, run_id)
            )
            self._conn.commit()

    def get_run_detail(self, run_id: str) -> Optional[dict]:
        row = self._conn.execute(
            "SELECT * FROM dq_runs WHERE run_id=?", (run_id,)
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        checks = self._conn.execute(
            "SELECT * FROM dq_check_results WHERE run_id=? ORDER BY id", (run_id,)
        ).fetchall()
        result["checks"] = [dict(c) for c in checks]
        return result

    def get_latest_run(self, dataset: str) -> Optional[dict]:
        row = self._conn.execute(
            "SELECT * FROM dq_runs WHERE dataset=? ORDER BY started_at DESC LIMIT 1",
            (dataset,)
        ).fetchone()
        return dict(row) if row else None

    def get_history(self, dataset: str, limit: int = 10) -> List[dict]:
        rows = self._conn.execute(
            "SELECT * FROM dq_runs WHERE dataset=? ORDER BY started_at DESC LIMIT ?",
            (dataset, limit)
        ).fetchall()
        return [dict(r) for r in rows]

    def get_previous_actuals(self, dataset: str, check_name: str, limit: int = 10) -> List[dict]:
        rows = self._conn.execute("""
            SELECT cr.actual_value, r.started_at
            FROM dq_check_results cr
            JOIN dq_runs r ON r.run_id = cr.run_id
            WHERE r.dataset=? AND cr.check_name=?
            ORDER BY r.started_at DESC LIMIT ?
        """, (dataset, check_name, limit)).fetchall()
        return [dict(r) for r in rows]

    def get_diagnostics(self, run_id: str, check_name: str) -> List[dict]:
        if not self._allow_diagnostics:
            return []
        rows = self._conn.execute(
            "SELECT row_data FROM dq_diagnostics WHERE run_id=? AND check_name=?",
            (run_id, check_name)
        ).fetchall()
        return [json.loads(r["row_data"]) for r in rows]

    def list_runs(self, limit: int = 50) -> List[dict]:
        rows = self._conn.execute(
            "SELECT * FROM dq_runs ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    def get_object_status(self) -> List[dict]:
        rows = self._conn.execute("""
            SELECT
              r.dataset AS object_name,
              r.run_id AS last_run_id,
              r.started_at AS last_run_at,
              r.overall_status,
              r.total_checks,
              r.passed_checks,
              r.failed_checks,
              r.warning_checks,
              COALESCE(c.compliance, 'unknown') AS compliance,
              COALESCE(c.contract_version, '') AS contract_version
            FROM dq_runs r
            LEFT JOIN dq_compliance c ON c.product = r.dataset
            WHERE r.started_at = (
              SELECT MAX(r2.started_at) FROM dq_runs r2 WHERE r2.dataset = r.dataset
            )
            GROUP BY r.dataset
            ORDER BY r.dataset
        """).fetchall()
        return [dict(r) for r in rows]

    def save_compliance(self, product: str, contract_version: str, compliance: str, last_run_id: str) -> None:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            self._conn.execute("""
                INSERT OR REPLACE INTO dq_compliance
                  (product, contract_version, compliance, since, last_run_id)
                VALUES (?,?,?,?,?)
            """, (product, contract_version, compliance, now, last_run_id))
            self._conn.commit()

    def get_compliance(self, product: str) -> Optional[dict]:
        row = self._conn.execute(
            "SELECT * FROM dq_compliance WHERE product=?", (product,)
        ).fetchone()
        return dict(row) if row else None

    def list_contracts(self) -> List[dict]:
        rows = self._conn.execute("SELECT * FROM contract_index ORDER BY product").fetchall()
        return [dict(r) for r in rows]

    def upsert_contract_index(self, product: str, lifecycle: str, owned_by: str, version: str, head_hash: str) -> None:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            self._conn.execute("""
                INSERT OR REPLACE INTO contract_index
                  (product, lifecycle, owned_by, version, head_hash, updated_at)
                VALUES (?,?,?,?,?,?)
            """, (product, lifecycle, owned_by, version, head_hash, now))
            self._conn.commit()

    def save_proposal(self, proposal: dict) -> None:
        with self._lock:
            self._conn.execute("""
                INSERT OR REPLACE INTO dq_proposals
                  (id, product, guarantee_patch, evidence, status, created_at)
                VALUES (?,?,?,?,?,?)
            """, (
                proposal["id"], proposal["product"],
                json.dumps(proposal.get("guarantee_patch", {})),
                json.dumps(proposal.get("evidence", {})),
                proposal.get("status", "open"),
                proposal.get("created_at", datetime.now(timezone.utc).isoformat()),
            ))
            self._conn.commit()

    def list_proposals(self, status: str = "open") -> List[dict]:
        if status == "all":
            rows = self._conn.execute("SELECT * FROM dq_proposals ORDER BY created_at DESC").fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM dq_proposals WHERE status=? ORDER BY created_at DESC", (status,)
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["guarantee_patch"] = json.loads(d["guarantee_patch"])
            d["evidence"] = json.loads(d["evidence"]) if d["evidence"] else {}
            result.append(d)
        return result

    def update_proposal_status(self, proposal_id: str, status: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE dq_proposals SET status=? WHERE id=?", (status, proposal_id)
            )
            self._conn.commit()

    def append_run_progress(self, run_id: str, line: str) -> None:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            self._conn.execute(
                "INSERT INTO dq_run_progress (run_id, ts, line) VALUES (?,?,?)",
                (run_id, now, line)
            )
            self._conn.commit()

    def get_run_progress(self, run_id: str, after_id: int = 0) -> List[dict]:
        rows = self._conn.execute(
            "SELECT id, ts, line FROM dq_run_progress WHERE run_id=? AND id>? ORDER BY id",
            (run_id, after_id)
        ).fetchall()
        return [dict(r) for r in rows]

    def close(self) -> None:
        self._conn.close()

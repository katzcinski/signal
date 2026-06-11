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

    def __init__(
        self,
        db_path: str | Path = "signal.db",
        *,
        allow_diagnostics: bool = False,
        diagnostics_columns: list[str] | None = None,
        diagnostics_ttl_days: int = 0,
    ) -> None:
        self.db_path = str(db_path)
        # [PII-GATE] Default off. Only persist diagnostic_rows when explicitly enabled (S1/G8).
        self._allow_diagnostics = allow_diagnostics
        self._diagnostics_columns = set(diagnostics_columns) if diagnostics_columns else None
        self._init_db()
        # [PII-GATE] Retention-TTL: abgelaufene Diagnostik beim Öffnen löschen.
        if diagnostics_ttl_days > 0:
            self._cleanup_diagnostics(diagnostics_ttl_days)

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
                # [PII-GATE] Only persist diagnostics when explicitly enabled (S1/G8).
                if self._allow_diagnostics and result.diagnostic_rows:
                    for diag in result.diagnostic_rows:
                        # Apply column allowlist when configured.
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

    def set_compliance(self, product: str, version: str, compliance: str, run_id: str) -> None:
        """WS2-5: Übergänge als Events; `since` markiert den letzten ÜBERGANG,
        nicht den letzten Lauf. Gibt es keinen Zustandswechsel, bleibt `since`."""
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT compliance, since FROM dq_compliance WHERE product=?", (product,)
            ).fetchone()
            previous = row["compliance"] if row else None
            since = now if previous != compliance else row["since"]
            conn.execute(
                """INSERT OR REPLACE INTO dq_compliance
                   (product, contract_version, compliance, since, last_run_id)
                   VALUES (?,?,?,?,?)""",
                (product, version, compliance, since, run_id),
            )
            if previous != compliance:
                conn.execute(
                    """INSERT INTO dq_compliance_events
                       (product, from_state, to_state, contract_version, run_id, at)
                       VALUES (?,?,?,?,?,?)""",
                    (product, previous or "unknown", compliance, version, run_id, now),
                )

    def get_compliance_events(self, product: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_compliance_events WHERE product=? ORDER BY id DESC LIMIT ?",
                (product, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Incidents (R4-1) — one open incident per product breach-episode.
    # ------------------------------------------------------------------

    _INCIDENT_STATES = ("open", "acknowledged", "investigating", "resolved")

    def open_incident(
        self, product: str, run_id: str, severity: str, summary: str,
        check_name: str = "",
    ) -> str | None:
        """Open an incident for a breach episode, or return the existing open
        one's id (idempotent per episode via the partial unique index). Returns
        the incident id, or None on a race that another writer won."""
        import uuid

        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            existing = conn.execute(
                "SELECT id FROM dq_incidents WHERE product=? AND status!='resolved'",
                (product,),
            ).fetchone()
            if existing:
                return existing["id"]
            incident_id = str(uuid.uuid4())
            try:
                conn.execute(
                    """INSERT INTO dq_incidents
                       (id, product, run_id, check_name, severity, status,
                        owner, summary, opened_at, resolved_at)
                       VALUES (?,?,?,?,?,'open','',?,?,'')""",
                    (incident_id, product, run_id, check_name, severity, summary, now),
                )
                conn.execute(
                    """INSERT INTO dq_incident_events
                       (incident_id, kind, actor, detail, at)
                       VALUES (?, 'opened', 'system', ?, ?)""",
                    (incident_id, summary, now),
                )
                return incident_id
            except sqlite3.IntegrityError:
                row = conn.execute(
                    "SELECT id FROM dq_incidents WHERE product=? AND status!='resolved'",
                    (product,),
                ).fetchone()
                return row["id"] if row else None

    def resolve_open_incidents(self, product: str, run_id: str) -> None:
        """Auto-resolve open incidents for a product (compliance recovered)."""
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id FROM dq_incidents WHERE product=? AND status!='resolved'",
                (product,),
            ).fetchall()
            for r in rows:
                conn.execute(
                    "UPDATE dq_incidents SET status='resolved', resolved_at=? WHERE id=?",
                    (now, r["id"]),
                )
                conn.execute(
                    """INSERT INTO dq_incident_events (incident_id, kind, actor, detail, at)
                       VALUES (?, 'resolved', 'system', ?, ?)""",
                    (r["id"], f"auto-recovery run {run_id}", now),
                )

    def get_incidents(
        self, status: str | None = None, severity: str | None = None,
        limit: int = 50, offset: int = 0,
    ) -> list[dict[str, Any]]:
        where, params = [], []
        if status:
            where.append("status=?")
            params.append(status)
        if severity:
            where.append("severity=?")
            params.append(severity)
        clause = (" WHERE " + " AND ".join(where)) if where else ""
        # Severity-Sortierung: critical > fail > warn, offene zuerst.
        order = ("ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'fail' THEN 1 "
                 "ELSE 2 END, opened_at DESC")
        with self._conn() as conn:
            rows = conn.execute(
                f"SELECT * FROM dq_incidents{clause} {order} LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_incident(self, incident_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_incidents WHERE id=?", (incident_id,)
            ).fetchone()
            if not row:
                return None
            incident = dict(row)
            events = conn.execute(
                "SELECT kind, actor, detail, at FROM dq_incident_events "
                "WHERE incident_id=? ORDER BY id",
                (incident_id,),
            ).fetchall()
            incident["events"] = [dict(e) for e in events]
            return incident

    def transition_incident(
        self, incident_id: str, status: str, actor: str, note: str = "",
    ) -> dict[str, Any] | None:
        if status not in self._INCIDENT_STATES:
            raise ValueError(f"invalid incident status {status!r}")
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM dq_incidents WHERE id=?", (incident_id,)
            ).fetchone()
            if not row:
                return None
            resolved_at = now if status == "resolved" else ""
            conn.execute(
                "UPDATE dq_incidents SET status=?, resolved_at=? WHERE id=?",
                (status, resolved_at, incident_id),
            )
            conn.execute(
                """INSERT INTO dq_incident_events (incident_id, kind, actor, detail, at)
                   VALUES (?,?,?,?,?)""",
                (incident_id, status, actor, note, now),
            )
        return self.get_incident(incident_id)

    def assign_incident(
        self, incident_id: str, owner: str, actor: str,
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM dq_incidents WHERE id=?", (incident_id,)
            ).fetchone()
            if not row:
                return None
            conn.execute(
                "UPDATE dq_incidents SET owner=? WHERE id=?", (owner, incident_id)
            )
            conn.execute(
                """INSERT INTO dq_incident_events (incident_id, kind, actor, detail, at)
                   VALUES (?, 'assigned', ?, ?, ?)""",
                (incident_id, actor, owner, now),
            )
        return self.get_incident(incident_id)

    # ------------------------------------------------------------------
    # SLA over time (R4-3) — derived from the compliance event-log.
    # ------------------------------------------------------------------

    def get_sla(self, product: str, window_days: int = 30) -> dict[str, Any]:
        """% of the window the product spent in a non-breached state, derived by
        integrating the compliance event-log over [now - window, now]."""
        now = datetime.now(timezone.utc)
        window_start = now.timestamp() - window_days * 86400
        with self._conn() as conn:
            events = conn.execute(
                "SELECT to_state, at FROM dq_compliance_events WHERE product=? ORDER BY at",
                (product,),
            ).fetchall()
        # State at window start = last transition before it (else 'unknown').
        state = "unknown"
        transitions: list[tuple[float, str]] = []
        for e in events:
            ts = _parse_iso(e["at"])
            if ts is None:
                continue
            if ts <= window_start:
                state = e["to_state"]
            else:
                transitions.append((ts, e["to_state"]))
        # Integrate seconds spent breached vs. observed.
        breached_s = 0.0
        cursor = window_start
        cur_state = state
        for ts, to_state in transitions:
            if cur_state == "breached":
                breached_s += ts - cursor
            cursor = ts
            cur_state = to_state
        if cur_state == "breached":
            breached_s += now.timestamp() - cursor
        total_s = now.timestamp() - window_start
        uptime_pct = round(100.0 * (1 - breached_s / total_s), 3) if total_s > 0 else 100.0
        return {
            "product": product,
            "window_days": window_days,
            "uptime_pct": uptime_pct,
            "breached_seconds": int(breached_s),
            "current_state": cur_state,
        }

    # ------------------------------------------------------------------
    # Diagnostics reader (R2-6) — Allowlist-projected at write time already.
    # ------------------------------------------------------------------

    def get_diagnostics(self, run_id: str, check_name: str | None = None) -> list[dict[str, Any]]:
        where = ["run_id=?"]
        params: list = [run_id]
        if check_name:
            where.append("check_name=?")
            params.append(check_name)
        with self._conn() as conn:
            rows = conn.execute(
                f"SELECT check_name, row_data FROM dq_diagnostics WHERE {' AND '.join(where)} ORDER BY id",
                params,
            ).fetchall()
        out = []
        for r in rows:
            try:
                data = json.loads(r["row_data"])
            except (json.JSONDecodeError, TypeError):
                data = {"_raw": r["row_data"]}
            out.append({"check_name": r["check_name"], "row": data})
        return out

    def try_begin_run(self, summary: RunSummary) -> bool:
        """F2: Run-Registrierung mit Store-seitigem Doppellauf-Schutz.

        Returns False, wenn für das Dataset bereits ein Run läuft (partieller
        Unique-Index idx_dq_runs_one_running) — check-then-act-frei. Bewusst
        plain INSERT: save_run (INSERT OR REPLACE) würde den Konflikt still
        durch Ersetzen auflösen.
        """
        try:
            with self._conn() as conn:
                conn.execute(
                    """INSERT INTO dq_runs
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
            return True
        except sqlite3.IntegrityError:
            return False

    def _cleanup_diagnostics(self, ttl_days: int) -> None:
        with self._conn() as conn:
            conn.execute(
                """DELETE FROM dq_diagnostics WHERE run_id IN (
                     SELECT run_id FROM dq_runs
                     WHERE started_at < datetime('now', ?)
                   )""",
                (f"-{int(ttl_days)} days",),
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

    def get_object_family_status(self) -> dict[str, dict[str, dict[str, Any]]]:
        """R3-2: per dataset, the worst status per *check family* from the latest
        finished run. Family is derived from the check name/type (families.py),
        so no schema change is needed. Returns
        ``{dataset: {family: {status, passed, total}}}``."""
        from ..library.families import family_of

        with self._conn() as conn:
            rows = conn.execute(
                """SELECT r.dataset, cr.check_name, cr.severity, cr.passed,
                          cr.error_message, cr.state
                   FROM dq_check_results cr
                   JOIN dq_runs r ON cr.run_id = r.run_id
                   WHERE r.started_at = (
                     SELECT MAX(r2.started_at) FROM dq_runs r2
                     WHERE r2.dataset = r.dataset AND r2.run_state='finished'
                   )""",
            ).fetchall()

        score_of = lambda sev, passed, err: (
            4 if sev == "critical" and not passed
            else 3 if sev == "fail" and not passed
            else 2 if sev == "warn" and not passed
            else 1 if err is not None
            else 0
        )
        status_map = {0: "pass", 1: "error", 2: "warn", 3: "fail", 4: "critical"}

        out: dict[str, dict[str, dict[str, Any]]] = {}
        for r in rows:
            # Gated (non-executed) checks don't contribute a pass/fail verdict.
            if r["state"] and r["state"] != "executed":
                continue
            fam = family_of(r["check_name"], "")
            bucket = out.setdefault(r["dataset"], {}).setdefault(
                fam, {"worst": 0, "passed": 0, "total": 0}
            )
            bucket["total"] += 1
            bucket["passed"] += 1 if r["passed"] else 0
            bucket["worst"] = max(bucket["worst"], score_of(r["severity"], r["passed"], r["error_message"]))

        return {
            dataset: {
                fam: {
                    "status": status_map.get(b["worst"], "unknown"),
                    "passed": b["passed"],
                    "total": b["total"],
                }
                for fam, b in fams.items()
            }
            for dataset, fams in out.items()
        }


def _parse_iso(value: Any) -> float | None:
    """Parse an ISO-8601 timestamp to a POSIX float; tolerant of a trailing Z
    and of naive timestamps (assumed UTC)."""
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except (ValueError, TypeError):
        return None

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
                        passed, actual_value, error_message, duration_ms, state, check_type)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        summary.run_id, result.name, result.sql, result.expect,
                        result.severity, int(result.passed),
                        str(result.actual_value) if result.actual_value is not None else None,
                        result.error, result.duration_ms, result.state, result.type,
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

    def get_diagnostics(self, run_id: str, check_name: str | None = None) -> list[dict[str, Any]]:
        """Diagnostik-Zeilen eines Runs. Zeilen wurden beim Schreiben bereits
        durch das PII-Gate (enabled + Allowlist) gefiltert — hier nur lesen."""
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

    # ------------------------------------------------------------------
    # Incidents (R4-1) — persistente Breach-Episoden mit Timeline
    # ------------------------------------------------------------------

    def open_incident(
        self,
        product: str,
        run_id: str,
        severity: str,
        title: str,
        failed_checks: list[str],
        contract_version: str = "",
        actor: str = "",
    ) -> int | None:
        """Eröffnet ein Incident — höchstens EINES je product+Breach-Episode:
        existiert bereits ein ungelöstes Incident für das Produkt, wird nur
        ein Event angehängt (Sifflet-Lektion: gruppieren, nicht fluten)."""
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id FROM dq_incidents WHERE product=? AND status != 'resolved' "
                "ORDER BY id DESC LIMIT 1",
                (product,),
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT INTO dq_incident_events(incident_id, at, actor, action, note) "
                    "VALUES (?,?,?,?,?)",
                    (row["id"], now, actor, "note",
                     f"Erneuter Breach in Run {run_id}: {', '.join(failed_checks)}"),
                )
                return row["id"]
            cur = conn.execute(
                """INSERT INTO dq_incidents
                   (product, run_id, severity, status, title, failed_checks,
                    opened_at, contract_version)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (product, run_id, severity, "open", title,
                 json.dumps(failed_checks), now, contract_version),
            )
            incident_id = cur.lastrowid
            conn.execute(
                "INSERT INTO dq_incident_events(incident_id, at, actor, action, note) "
                "VALUES (?,?,?,?,?)",
                (incident_id, now, actor, "opened", title),
            )
            return incident_id

    def auto_resolve_incidents(self, product: str, run_id: str) -> None:
        """Recovery: offener Incident wird automatisch gelöst, mit Event."""
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id FROM dq_incidents WHERE product=? AND status != 'resolved'",
                (product,),
            ).fetchall()
            for row in rows:
                conn.execute(
                    "UPDATE dq_incidents SET status='resolved', resolved_at=? WHERE id=?",
                    (now, row["id"]),
                )
                conn.execute(
                    "INSERT INTO dq_incident_events(incident_id, at, actor, action, note) "
                    "VALUES (?,?,?,?,?)",
                    (row["id"], now, "system", "auto_resolved",
                     f"Folgelauf {run_id} vollständig grün — automatisch gelöst."),
                )

    def list_incidents(
        self,
        status: str | None = None,
        severity: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        where, params = [], []
        if status:
            where.append("status=?")
            params.append(status)
        if severity:
            where.append("severity=?")
            params.append(severity)
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        with self._conn() as conn:
            rows = conn.execute(
                f"SELECT * FROM dq_incidents {clause} ORDER BY id DESC LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
            return [self._incident_row(r) for r in rows]

    def get_incident(self, incident_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_incidents WHERE id=?", (incident_id,)
            ).fetchone()
            if not row:
                return None
            incident = self._incident_row(row)
            events = conn.execute(
                "SELECT id, at, actor, action, note FROM dq_incident_events "
                "WHERE incident_id=? ORDER BY id",
                (incident_id,),
            ).fetchall()
            incident["events"] = [dict(e) for e in events]
            return incident

    def transition_incident(
        self,
        incident_id: int,
        status: str | None,
        actor: str,
        owner: str | None = None,
        note: str = "",
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_incidents WHERE id=?", (incident_id,)
            ).fetchone()
            if not row:
                return None
            if status and status != row["status"]:
                resolved_at = now if status == "resolved" else None
                conn.execute(
                    "UPDATE dq_incidents SET status=?, resolved_at=? WHERE id=?",
                    (status, resolved_at, incident_id),
                )
                conn.execute(
                    "INSERT INTO dq_incident_events(incident_id, at, actor, action, note) "
                    "VALUES (?,?,?,?,?)",
                    (incident_id, now, actor, "status_changed",
                     f"{row['status']} → {status}" + (f" — {note}" if note else "")),
                )
            if owner is not None and owner != row["owner"]:
                conn.execute(
                    "UPDATE dq_incidents SET owner=? WHERE id=?", (owner, incident_id)
                )
                conn.execute(
                    "INSERT INTO dq_incident_events(incident_id, at, actor, action, note) "
                    "VALUES (?,?,?,?,?)",
                    (incident_id, now, actor, "assigned", owner),
                )
            if note and not status:
                conn.execute(
                    "INSERT INTO dq_incident_events(incident_id, at, actor, action, note) "
                    "VALUES (?,?,?,?,?)",
                    (incident_id, now, actor, "note", note),
                )
        return self.get_incident(incident_id)

    @staticmethod
    def _incident_row(row) -> dict[str, Any]:
        d = dict(row)
        try:
            d["failed_checks"] = json.loads(d.get("failed_checks") or "[]")
        except (TypeError, ValueError):
            d["failed_checks"] = []
        return d

    # ------------------------------------------------------------------
    # SLA über Zeitfenster (R4-3) — aus dem Compliance-Event-Log
    # ------------------------------------------------------------------

    def get_sla(self, product: str, days: int) -> float | None:
        """% der Zeit im Zustand 'compliant' innerhalb der letzten *days* Tage.

        Timeline aus dq_compliance_events; gemessen ab max(Fensterbeginn,
        erstem bekannten Zustand). None, wenn keine Events existieren.
        """
        from datetime import timedelta

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=days)
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT from_state, to_state, at FROM dq_compliance_events "
                "WHERE product=? ORDER BY id",
                (product,),
            ).fetchall()
        if not rows:
            return None

        def _ts(s: str) -> datetime:
            ts = datetime.fromisoformat(s)
            return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)

        events = [(_ts(r["at"]), r["from_state"], r["to_state"]) for r in rows]
        # Zustand am Fensterbeginn: letztes Event davor, sonst from_state des ersten
        state = events[0][1]
        start = max(window_start, events[0][0]) if events[0][0] > window_start else window_start
        for at, _from, to in events:
            if at <= window_start:
                state = to
        # Messbeginn: Fensterstart, außer der erste bekannte Zustand liegt später
        measure_start = max(window_start, min(e[0] for e in events))
        compliant_s = 0.0
        cursor = measure_start
        cur_state = state
        for at, _from, to in events:
            if at <= measure_start:
                cur_state = to
                continue
            if cur_state == "compliant":
                compliant_s += (at - cursor).total_seconds()
            cursor = at
            cur_state = to
        if cur_state == "compliant":
            compliant_s += (now - cursor).total_seconds()
        total_s = (now - measure_start).total_seconds()
        if total_s <= 0:
            return None
        return round(100.0 * compliant_s / total_s, 2)

    # ------------------------------------------------------------------
    # Familien-Status (R3-2) — Objekt × Familie statt Entweder-oder
    # ------------------------------------------------------------------

    _OBS_TYPES = (
        "freshness", "row_count", "schema",
        "volume_delta", "column_count", "recent_volume",
    )

    def get_object_family_status(self) -> dict[str, dict[str, str]]:
        """Je Dataset der schlechteste Status getrennt nach Familie
        (Observability = Frische/Volumen/Schema, Quality = Rest), aus dem
        jeweils jüngsten abgeschlossenen Lauf. Gating-Zustände zählen nicht."""
        placeholders = ",".join("?" for _ in self._OBS_TYPES)
        with self._conn() as conn:
            rows = conn.execute(
                f"""SELECT
                      r.dataset,
                      CASE WHEN cr.check_type IN ({placeholders})
                           THEN 'observability' ELSE 'quality' END AS family,
                      MAX(CASE WHEN cr.state != 'executed' THEN 0
                               WHEN cr.severity='critical' AND cr.passed=0 THEN 4
                               WHEN cr.severity='fail'     AND cr.passed=0 THEN 3
                               WHEN cr.severity='warn'     AND cr.passed=0 THEN 2
                               WHEN cr.error_message IS NOT NULL          THEN 1
                               ELSE 0 END) AS worst_score
                    FROM dq_check_results cr
                    JOIN dq_runs r ON cr.run_id = r.run_id
                    WHERE r.started_at = (
                      SELECT MAX(r2.started_at) FROM dq_runs r2
                      WHERE r2.dataset = r.dataset AND r2.run_state='finished'
                    )
                    GROUP BY r.dataset, family""",
                self._OBS_TYPES,
            ).fetchall()
        status_map = {0: "pass", 1: "error", 2: "warn", 3: "fail", 4: "critical"}
        out: dict[str, dict[str, str]] = {}
        for r in rows:
            out.setdefault(r["dataset"], {})[r["family"]] = status_map.get(r["worst_score"], "unknown")
        return out

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

    def get_all_runs(self, limit: int = 200, offset: int = 0) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_runs ORDER BY started_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
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

    # Observability metric families for the time-series view (UX-N1).
    # row_count/recent_volume → "volume"; freshness → "freshness".
    _METRIC_FAMILY = {
        "row_count": "volume",
        "recent_volume": "volume",
        "freshness": "freshness",
    }

    def get_metric_series(self, dataset: str, limit: int = 200) -> dict[str, Any]:
        """UX-N1: per observability check, the chronological actual_value series
        with its rolling baseline band (mean ± 3σ from dq_baselines) and
        per-point anomaly flags. Source for the Freshness/Volume time-series.

        A point is an anomaly when the check did not pass, or when its numeric
        value falls outside the baseline band. Non-numeric actuals carry a null
        value and are excluded from band/anomaly logic.
        """
        metric_types = tuple(self._METRIC_FAMILY)
        placeholders = ",".join("?" for _ in metric_types)
        with self._conn() as conn:
            rows = conn.execute(
                f"""SELECT cr.check_name, cr.check_type, cr.actual_value, cr.passed,
                           cr.state, r.started_at, r.run_id
                    FROM dq_check_results cr
                    JOIN dq_runs r ON cr.run_id = r.run_id
                    WHERE r.dataset=? AND cr.check_type IN ({placeholders})
                      AND r.run_state='finished'
                    ORDER BY cr.check_name, r.started_at DESC""",
                (dataset, *metric_types),
            ).fetchall()
            baseline_rows = conn.execute(
                "SELECT * FROM dq_baselines WHERE dataset=?", (dataset,)
            ).fetchall()

        baselines = {b["metric"]: dict(b) for b in baseline_rows}

        def _num(v: Any) -> float | None:
            try:
                return float(v)
            except (TypeError, ValueError):
                return None

        grouped: dict[str, list[Any]] = {}
        order: list[str] = []
        for r in rows:
            name = r["check_name"]
            if name not in grouped:
                grouped[name] = []
                order.append(name)
            if len(grouped[name]) < limit:
                grouped[name].append(r)

        series: list[dict[str, Any]] = []
        for name in order:
            recs = list(reversed(grouped[name]))  # oldest → newest
            check_type = recs[0]["check_type"]
            metric = self._METRIC_FAMILY.get(check_type, "observability")

            base = baselines.get(name)
            band = None
            if base and not base.get("warmup_remaining"):
                mean = base.get("mean_v") or 0.0
                std = base.get("stddev_v") or 0.0
                band = {
                    "mean": mean,
                    "lower": mean - 3 * std,
                    "upper": mean + 3 * std,
                    "p01": base.get("p01"),
                    "p99": base.get("p99"),
                }

            points = []
            for rec in recs:
                value = _num(rec["actual_value"])
                passed = bool(rec["passed"])
                out_of_band = (
                    band is not None
                    and value is not None
                    and (value < band["lower"] or value > band["upper"])
                )
                points.append({
                    "at": rec["started_at"],
                    "value": value,
                    "raw": rec["actual_value"],
                    "passed": passed,
                    "state": rec["state"],
                    "run_id": rec["run_id"],
                    "anomaly": bool((not passed) or out_of_band),
                })

            series.append({
                "check_name": name,
                "check_type": check_type,
                "metric": metric,
                "baseline": band,
                "points": points,
            })

        return {"dataset": dataset, "series": series}

    def get_health_trend(self) -> dict[str, Any]:
        """UX-N12: data-health trend. Per dataset, compare the latest finished
        run's status to the run before it; report the share of datasets passing
        now vs. one run earlier (over datasets that have ≥2 finished runs, so the
        comparison is apples-to-apples). Direction source for the health gauge."""
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT dataset, overall_status,
                          ROW_NUMBER() OVER (
                            PARTITION BY dataset ORDER BY started_at DESC, run_id DESC
                          ) AS rn
                   FROM dq_runs WHERE run_state='finished'"""
            ).fetchall()

        latest: dict[str, str] = {}
        prior: dict[str, str] = {}
        for r in rows:
            if r["rn"] == 1:
                latest[r["dataset"]] = r["overall_status"]
            elif r["rn"] == 2:
                prior[r["dataset"]] = r["overall_status"]

        def pct(status_map: dict[str, str]) -> float | None:
            if not status_map:
                return None
            passing = sum(1 for v in status_map.values() if v == "pass")
            return round(100.0 * passing / len(status_map), 1)

        # Trend over the common set (datasets with a prior run).
        common = {d: latest[d] for d in prior if d in latest}
        return {
            "current_pct": pct(common),
            "previous_pct": pct(prior),
            "datasets": len(common),
        }

    # GitHub-contribution-style reliability score per day (higher = worse).
    _STATUS_SCORE = {"pass": 0, "unknown": 0, "error": 1, "warn": 2, "fail": 3, "critical": 4}
    _SCORE_STATUS = {0: "pass", 1: "error", 2: "warn", 3: "fail", 4: "critical"}

    def get_status_heatmap(self, days: int = 30) -> dict[str, Any]:
        """UX-N10: per-object × per-day worst run status over the last N days.
        At-a-glance reliability — a day with no run is omitted (rendered neutral)."""
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT dataset, date(started_at) AS day, overall_status
                   FROM dq_runs
                   WHERE run_state='finished'
                     AND date(started_at) >= date('now', ?)""",
                (f"-{int(days)} days",),
            ).fetchall()

        worst: dict[str, dict[str, int]] = {}
        for r in rows:
            score = self._STATUS_SCORE.get(r["overall_status"], 0)
            cell = worst.setdefault(r["dataset"], {})
            day = r["day"]
            if day not in cell or score > cell[day]:
                cell[day] = score

        # Dense day axis (today back to days-1), oldest → newest.
        from datetime import date, timedelta
        today = date.today()
        day_axis = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]

        matrix = {
            ds: {day: self._SCORE_STATUS[s] for day, s in cells.items()}
            for ds, cells in worst.items()
        }
        return {"days": day_axis, "datasets": sorted(matrix), "matrix": matrix}

    # ------------------------------------------------------------------
    # UX-N2: notification routing (channels / rules / mute windows)
    # ------------------------------------------------------------------

    def list_notification_channels(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_notification_channels ORDER BY id"
            ).fetchall()
            return [self._channel_row(r) for r in rows]

    @staticmethod
    def _channel_row(r: Any) -> dict[str, Any]:
        d = dict(r)
        d["enabled"] = bool(d.get("enabled", 1))
        return d

    def create_notification_channel(
        self, *, name: str, type: str, url: str, enabled: bool = True, actor: str = ""
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            cur = conn.execute(
                """INSERT INTO dq_notification_channels(name, type, url, enabled, created_at, created_by)
                   VALUES (?,?,?,?,?,?)""",
                (name, type, url, int(enabled), now, actor),
            )
            cid = cur.lastrowid
            row = conn.execute(
                "SELECT * FROM dq_notification_channels WHERE id=?", (cid,)
            ).fetchone()
        return self._channel_row(row)

    def update_notification_channel(
        self, channel_id: int, *, name: str | None = None, type: str | None = None,
        url: str | None = None, enabled: bool | None = None,
    ) -> dict[str, Any] | None:
        sets, params = [], []
        for col, val in (("name", name), ("type", type), ("url", url)):
            if val is not None:
                sets.append(f"{col}=?")
                params.append(val)
        if enabled is not None:
            sets.append("enabled=?")
            params.append(int(enabled))
        if not sets:
            return self.get_notification_channel(channel_id)
        params.append(channel_id)
        with self._conn() as conn:
            conn.execute(
                f"UPDATE dq_notification_channels SET {', '.join(sets)} WHERE id=?",
                params,
            )
            row = conn.execute(
                "SELECT * FROM dq_notification_channels WHERE id=?", (channel_id,)
            ).fetchone()
        return self._channel_row(row) if row else None

    def get_notification_channel(self, channel_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_notification_channels WHERE id=?", (channel_id,)
            ).fetchone()
        return self._channel_row(row) if row else None

    def delete_notification_channel(self, channel_id: int) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM dq_notification_channels WHERE id=?", (channel_id,)
            )
            # FK ON DELETE CASCADE removes dependent rules.
            return cur.rowcount > 0

    def list_notification_rules(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_notification_rules ORDER BY id"
            ).fetchall()
            return [self._rule_row(r) for r in rows]

    @staticmethod
    def _rule_row(r: Any) -> dict[str, Any]:
        d = dict(r)
        d["enabled"] = bool(d.get("enabled", 1))
        return d

    def create_notification_rule(
        self, *, name: str, channel_id: int, match_severity: str = "",
        match_space: str = "", match_product: str = "", match_owned_by: str = "",
        match_owner: str = "", enabled: bool = True, actor: str = "",
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            if not conn.execute(
                "SELECT 1 FROM dq_notification_channels WHERE id=?", (channel_id,)
            ).fetchone():
                return None
            cur = conn.execute(
                """INSERT INTO dq_notification_rules
                   (name, channel_id, match_severity, match_space, match_product,
                    match_owned_by, match_owner, enabled, created_at, created_by)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (name, channel_id, match_severity, match_space, match_product,
                 match_owned_by, match_owner, int(enabled), now, actor),
            )
            row = conn.execute(
                "SELECT * FROM dq_notification_rules WHERE id=?", (cur.lastrowid,)
            ).fetchone()
        return self._rule_row(row)

    def delete_notification_rule(self, rule_id: int) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM dq_notification_rules WHERE id=?", (rule_id,)
            )
            return cur.rowcount > 0

    def list_notification_mutes(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM dq_notification_mutes ORDER BY id"
            ).fetchall()
            return [dict(r) for r in rows]

    def create_notification_mute(
        self, *, starts_at: str, ends_at: str, reason: str = "",
        match_space: str = "", match_product: str = "", actor: str = "",
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            cur = conn.execute(
                """INSERT INTO dq_notification_mutes
                   (reason, match_space, match_product, starts_at, ends_at, created_at, created_by)
                   VALUES (?,?,?,?,?,?,?)""",
                (reason, match_space, match_product, starts_at, ends_at, now, actor),
            )
            row = conn.execute(
                "SELECT * FROM dq_notification_mutes WHERE id=?", (cur.lastrowid,)
            ).fetchone()
        return dict(row)

    def delete_notification_mute(self, mute_id: int) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM dq_notification_mutes WHERE id=?", (mute_id,)
            )
            return cur.rowcount > 0

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

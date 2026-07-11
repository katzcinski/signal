"""Materialisierung der Gate-Konsum-Oberfläche (Slice ③). [ENGINE-FROZEN]

Führt die von `dq_core.enforce` erzeugte DDL/DML gegen das Signal-eigene
Open-SQL-Schema aus — über dieselbe Verbindungsidentität wie die Checks
(ADR-0002-Amendment: read-only gegenüber Kundendaten, Schreiben nur im
eigenen Schema). Doppelt gegated: `ENFORCEMENT_MATERIALIZE_ENABLED`
(Kill-Switch, default aus) UND `DATASPHERE_SIGNAL_SCHEMA` (Ziel-Schema).
"""
from __future__ import annotations

import logging
import threading
from typing import Any

from dq_core.enforce import bootstrap_plan, verdict_upsert_statements

logger = logging.getLogger("dq_cockpit.enforcement")

# Bootstrap ist idempotent, aber nicht gratis (Katalog-Query + DDL) — je
# Prozess und Schema nur einmal, sofern kein force-Apply kommt.
_bootstrapped: set[str] = set()
_bootstrap_lock = threading.Lock()


def materialization_enabled(settings) -> bool:
    return bool(
        getattr(settings, "enforcement_materialize_enabled", False)
        and getattr(settings, "datasphere_signal_schema", "")
    )


def _existing_tables(conn: Any, schema: str) -> set[str]:
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT TABLE_NAME FROM SYS.TABLES WHERE SCHEMA_NAME = ?", (schema,)
        )
        rows = cursor.fetchall() or []
        return {str(row[0]) for row in rows if row and row[0]}
    finally:
        try:
            cursor.close()
        except Exception:  # noqa: BLE001
            pass


def ensure_bootstrap(conn: Any, settings, *, force: bool = False) -> list[str]:
    """Gate-Infrastruktur sicherstellen (Tabellen nur wenn abwesend,
    View/Prozedur CREATE OR REPLACE). Liefert die ausgeführten Statements."""
    if not materialization_enabled(settings) or conn is None:
        return []
    schema = settings.datasphere_signal_schema
    with _bootstrap_lock:
        if schema in _bootstrapped and not force:
            return []
        statements = bootstrap_plan(existing_tables=_existing_tables(conn, schema), schema=schema)
        cursor = conn.cursor()
        try:
            for stmt in statements:
                cursor.execute(stmt)
        finally:
            try:
                cursor.close()
            except Exception:  # noqa: BLE001
                pass
        _bootstrapped.add(schema)
        if statements:
            logger.info("Enforcement bootstrap applied %d statement(s) in %s", len(statements), schema)
        return statements


def publish_verdict(conn: Any, summary, settings, *, contract_id: str = "") -> bool:
    """Verdict eines abgeschlossenen Laufs in DQ_GATE_STATUS(+HISTORY)
    publizieren. Projektion, nie primär: der Result-Store bleibt die Wahrheit —
    Fehler hier dürfen den Lauf nicht beeinflussen (Aufrufer fängt ab)."""
    if not materialization_enabled(settings) or conn is None:
        return False
    ensure_bootstrap(conn, settings)
    statements = verdict_upsert_statements(
        schema=settings.datasphere_signal_schema,
        object_id=summary.dataset,
        run_id=summary.run_id,
        gate_verdict=summary.gate_verdict,
        overall_status=summary.overall_status,
        evaluated_at=summary.finished_at or summary.started_at,
        contract_id=contract_id or summary.dataset,
        contract_version=summary.contract_version,
        manifest=summary.contract_hash,
        ttl_seconds=int(getattr(settings, "enforcement_verdict_ttl_seconds", 0) or 0),
    )
    cursor = conn.cursor()
    try:
        for sql, params in statements:
            cursor.execute(sql, params)
    finally:
        try:
            cursor.close()
        except Exception:  # noqa: BLE001
            pass
    logger.info(
        "Published gate verdict %s for %s (run %s)",
        summary.gate_verdict, summary.dataset, summary.run_id,
    )
    return True


def reset_bootstrap_cache() -> None:
    """Testhilfe/Force-Reset — nächster Aufruf prüft den Katalog erneut."""
    with _bootstrap_lock:
        _bootstrapped.clear()

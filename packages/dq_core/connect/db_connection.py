"""Database connection helper. [SCHEMA-MAP] schema is bound at run-time, never hardcoded."""
from __future__ import annotations

import time
from typing import Any

# Substrings that mark a *transient* connect failure worth retrying (network
# blips, dropped/expired sessions). Deliberately excludes the bare word
# "connection" so genuine auth/config errors fail fast instead of being retried.
TRANSIENT_ERROR_MARKERS = (
    "connection closed",
    "connection broken",
    "connection reset",
    "session closed",
    "session expired",
    "temporarily unavailable",
    "network",
)


def _is_transient_error(exc: Exception) -> bool:
    message = " ".join(str(part) for part in exc.args if part).strip().lower()
    if not message:
        message = exc.__class__.__name__.lower()
    return any(marker in message for marker in TRANSIENT_ERROR_MARKERS)


class MockConnection:
    """In-process mock for development when no HANA is available."""

    def cursor(self) -> "MockCursor":
        return MockCursor()

    def close(self) -> None:
        pass


class MockCursor:
    """Verhält sich wie ein echter Ein-Zeilen-Skalar-Cursor: fetchone liefert
    genau eine Zeile und danach None; Batch-SQL (UNION ALL mit check_name)
    liefert je Check eine (name, 0)-Zeile."""

    def __init__(self) -> None:
        self.description: list = [("result",)]
        self._rows: list = []

    def execute(self, sql: str, params: Any = None) -> None:
        import re
        if str(sql).strip().upper().startswith("SET"):
            self._rows = []
            return
        names = re.findall(r"'((?:[^']|'')*)' AS check_name", str(sql))
        if names:
            self.description = [("check_name",), ("actual_value",)]
            self._rows = [(n.replace("''", "'"), 0) for n in names]
        else:
            self.description = [("result",)]
            self._rows = [(0,)]

    def fetchone(self) -> tuple | None:
        return self._rows.pop(0) if self._rows else None

    def fetchall(self) -> list:
        rows, self._rows = self._rows, []
        return rows

    def fetchmany(self, size: int = 100) -> list:
        rows, self._rows = self._rows[:size], self._rows[size:]
        return rows

    def close(self) -> None:
        pass


def get_connection(
    host: str,
    port: int,
    user: str,
    password: str,
    schema: str,  # [SCHEMA-MAP] bound here, not in contract
    *,
    encrypt: bool = True,
    validate_cert: bool = True,
    statement_timeout_ms: int = 120_000,
    max_retry_attempts: int = 3,
) -> Any:
    """Return a hdbcli connection.

    Fail-closed (S-13): fehlt der Treiber, gibt es einen harten Fehler statt
    eines stillen Mock-Fallbacks — fake-grüne Checks in Prod sind schlimmer
    als ein Startfehler. Mock-Nutzung ist eine explizite Caller-Entscheidung.

    Härtung (übernommen aus Meridian/datasphere-tools): transiente
    Verbindungsfehler (Netz, abgelaufene Session) werden mit exponentiellem
    Backoff erneut versucht — Auth-/Konfigfehler dagegen sofort durchgereicht.
    Pro Verbindung wird ein ``statementTimeout`` gesetzt, damit Runaway-Queries
    nicht unbegrenzt laufen (``statement_timeout_ms <= 0`` deaktiviert das).
    """
    try:
        from hdbcli import dbapi  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "hdbcli ist nicht installiert — HANA-Verbindung nicht möglich. "
            "Installiere das Extra 'dq_core[hana]' oder nutze explizit MockConnection."
        ) from exc

    def _connect() -> Any:
        conn = dbapi.connect(
            address=host,
            port=port,
            user=user,
            password=password,
            currentSchema=schema,
            encrypt=encrypt,
            sslValidateCertificate=validate_cert,
        )
        if statement_timeout_ms and statement_timeout_ms > 0:
            cursor = conn.cursor()
            try:
                cursor.execute(f"SET 'statementTimeout' = '{int(statement_timeout_ms)}'")
            finally:
                cursor.close()
        return conn

    attempt = 1
    while True:
        try:
            return _connect()
        except Exception as exc:  # noqa: BLE001 — retry only transient connect errors
            if attempt >= max_retry_attempts or not _is_transient_error(exc):
                raise
            time.sleep(2.0 * (2 ** (attempt - 1)))
            attempt += 1

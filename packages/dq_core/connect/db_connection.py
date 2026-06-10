"""Database connection helper. [SCHEMA-MAP] schema is bound at run-time, never hardcoded."""
from __future__ import annotations

from typing import Any


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
) -> Any:
    """Return a hdbcli connection.

    Fail-closed (S-13): fehlt der Treiber, gibt es einen harten Fehler statt
    eines stillen Mock-Fallbacks — fake-grüne Checks in Prod sind schlimmer
    als ein Startfehler. Mock-Nutzung ist eine explizite Caller-Entscheidung.
    """
    try:
        from hdbcli import dbapi  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "hdbcli ist nicht installiert — HANA-Verbindung nicht möglich. "
            "Installiere das Extra 'dq_core[hana]' oder nutze explizit MockConnection."
        ) from exc
    return dbapi.connect(
        address=host,
        port=port,
        user=user,
        password=password,
        currentSchema=schema,
        encrypt=encrypt,
        sslValidateCertificate=validate_cert,
    )

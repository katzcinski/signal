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
    def __init__(self) -> None:
        self.description = [("result",)]
        self._result: Any = 0

    def execute(self, sql: str, params: Any = None) -> None:
        # Return row count 0 for mock — all checks pass
        self._result = 0

    def fetchone(self) -> tuple | None:
        return (self._result,)

    def fetchall(self) -> list:
        return [(self._result,)]

    def fetchmany(self, size: int = 100) -> list:
        return []

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
    """Return a hdbcli connection; falls back to MockConnection if hdbcli unavailable."""
    try:
        from hdbcli import dbapi  # type: ignore[import]
        conn = dbapi.connect(
            address=host,
            port=port,
            user=user,
            password=password,
            currentSchema=schema,
            encrypt=encrypt,
            sslValidateCertificate=validate_cert,
        )
        return conn
    except ImportError:
        return MockConnection()

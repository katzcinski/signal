"""Connector hardening (ported from Meridian): transient-error retry +
statement timeout, without regressing the S-13 fail-closed contract.

No live HANA — the driver's ``connect`` is monkeypatched.
"""
import pytest

from dq_core.connect import db_connection
from dq_core.connect.db_connection import (
    MockConnection,
    _is_transient_error,
    get_connection,
)


class _FakeCursor:
    def execute(self, *args, **kwargs):
        pass

    def close(self):
        pass


class _FakeConn:
    def cursor(self):
        return _FakeCursor()


def test_is_transient_error_only_matches_network_session_failures():
    assert _is_transient_error(Exception("Network is unreachable"))
    assert _is_transient_error(Exception("session expired, please re-login"))
    assert _is_transient_error(Exception("connection broken"))
    # Auth / privilege / config errors must NOT be treated as transient.
    assert not _is_transient_error(Exception("authentication failed: invalid credentials"))
    assert not _is_transient_error(Exception("insufficient privilege"))


def test_get_connection_retries_transient_then_succeeds(monkeypatch):
    import hdbcli.dbapi as dbapi

    calls = {"n": 0}

    def fake_connect(**kwargs):
        calls["n"] += 1
        if calls["n"] < 3:
            raise Exception("network error: connection broken")
        return _FakeConn()

    monkeypatch.setattr(dbapi, "connect", fake_connect)
    monkeypatch.setattr(db_connection.time, "sleep", lambda *_: None)

    conn = get_connection("host", 443, "user", "pw", "SCHEMA", max_retry_attempts=3)
    assert isinstance(conn, _FakeConn)
    assert calls["n"] == 3


def test_get_connection_does_not_retry_auth_error(monkeypatch):
    import hdbcli.dbapi as dbapi

    calls = {"n": 0}

    def fake_connect(**kwargs):
        calls["n"] += 1
        raise Exception("authentication failed")

    monkeypatch.setattr(dbapi, "connect", fake_connect)
    monkeypatch.setattr(db_connection.time, "sleep", lambda *_: None)

    with pytest.raises(Exception, match="authentication failed"):
        get_connection("host", 443, "user", "pw", "SCHEMA")
    assert calls["n"] == 1  # fail-fast, no retry on auth errors


def test_get_connection_sets_statement_timeout(monkeypatch):
    import hdbcli.dbapi as dbapi

    executed: list[str] = []

    class RecordingCursor(_FakeCursor):
        def execute(self, sql, *args, **kwargs):
            executed.append(sql)

    class RecordingConn(_FakeConn):
        def cursor(self):
            return RecordingCursor()

    monkeypatch.setattr(dbapi, "connect", lambda **kwargs: RecordingConn())

    get_connection("host", 443, "user", "pw", "SCHEMA", statement_timeout_ms=5000)
    assert any("statementTimeout" in sql and "5000" in sql for sql in executed)


def test_mock_connection_still_returns_scalar_row():
    cur = MockConnection().cursor()
    cur.execute("SELECT 1 AS result FROM DUMMY")
    assert cur.fetchone() == (0,)
    assert cur.fetchone() is None

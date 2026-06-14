"""POST /api/objects/{id}/profile — profiling over a (faked) HANA connection.

Reuses the profiler's synthetic FakeCursor; get_connection + get_environment are
monkeypatched so no live HANA is needed. Object DS_SALES_ORDERS comes from the
api_client fixture inventory.
"""
from tests.unit.test_profile import (
    FakeCursor,
    _DEMO_AGG_ROW,
    _DEMO_COLUMNS,
    _DEMO_PROFILE_ROW,
)


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def close(self):
        pass


def _patch_live_hana(monkeypatch):
    import dq_core.connect.db_connection as dbmod
    import services.api.routers.profile as profile_mod

    monkeypatch.setattr(
        profile_mod, "get_environment",
        lambda name: {"host": "h", "port": 443, "user": "u", "password": "p", "schema": "CORE_DWH"},
    )
    monkeypatch.setattr(
        dbmod, "get_connection",
        lambda **kwargs: _FakeConn(FakeCursor(_DEMO_COLUMNS, _DEMO_AGG_ROW, _DEMO_PROFILE_ROW)),
    )


def test_profile_returns_column_stats_and_pk_candidates(api_client, monkeypatch):
    _patch_live_hana(monkeypatch)
    resp = api_client.post(
        "/api/objects/DS_SALES_ORDERS/profile",
        json={"environment": "prod", "include_composite": True},
        headers={"X-DQ-Role": "steward"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["row_count"] == 100
    assert data["column_count"] == 3
    by_col = {c["column"]: c for c in data["columns"]}
    assert by_col["ID"]["pk_candidate"] is True
    assert by_col["ID"]["uniqueness_pct"] == 100.0
    ranked = [c["column"] for c in data["pk_candidates"]["ranked_single"]]
    assert "ID" in ranked
    assert "AMOUNT" not in ranked  # decimal measure excluded from PK candidates


def test_profile_forbidden_for_viewer(api_client, monkeypatch):
    _patch_live_hana(monkeypatch)
    resp = api_client.post(
        "/api/objects/DS_SALES_ORDERS/profile",
        json={"environment": "prod"},
        headers={"X-DQ-Role": "viewer"},
    )
    assert resp.status_code == 403


def test_profile_requires_environment(api_client):
    # No environment configured → fail-closed 422 (profiling needs real data).
    resp = api_client.post(
        "/api/objects/DS_SALES_ORDERS/profile",
        json={},
        headers={"X-DQ-Role": "steward"},
    )
    assert resp.status_code == 422


def test_profile_unknown_object_404(api_client, monkeypatch):
    _patch_live_hana(monkeypatch)
    resp = api_client.post(
        "/api/objects/NOPE/profile",
        json={"environment": "prod"},
        headers={"X-DQ-Role": "steward"},
    )
    assert resp.status_code == 404

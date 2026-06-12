"""Extract / inventory endpoints (WS1-2, WS2-6).
F5: Extrakt-Aktualität — POST /api/extract setzt mtime, GET /api/lineage liefert
stale-Flag anhand des konfigurierbaren Schwellwerts (EXTRACT_STALE_DAYS)."""
import os
import time


def test_inventory_lists_datasets(api_client):
    resp = api_client.get("/api/inventory")
    assert resp.status_code == 200
    data = resp.json()
    assert "datasets" in data
    assert any(d["id"] == "DS_SALES_ORDERS" for d in data["datasets"])


def test_extract_reports_counts(api_client):
    resp = api_client.post("/api/extract")
    assert resp.status_code == 200
    data = resp.json()
    assert data["inventory_items"] == 1
    assert data["lineage_nodes"] == 1


def test_extract_updates_file_mtime(api_client, tmp_path, monkeypatch):
    """F5: POST /api/extract resets the staleness clock by touching snapshot files."""
    import services.api.settings as settings_mod
    import services.api.deps as deps_mod

    # Use the fixture files already created by the api_client fixture
    import services.api.settings as sm
    settings = sm.get_settings()
    lineage_path = settings.lineage_file

    # Back-date the lineage file to 10 days ago
    old_ts = time.time() - 10 * 86400
    os.utime(lineage_path, (old_ts, old_ts))
    old_mtime = os.path.getmtime(lineage_path)

    resp = api_client.post("/api/extract")
    assert resp.status_code == 200
    assert "extracted_at" in resp.json()

    new_mtime = os.path.getmtime(lineage_path)
    assert new_mtime > old_mtime, "POST /api/extract must update the lineage file mtime"


def test_lineage_stale_flag_when_old(api_client, monkeypatch, tmp_path):
    """F5: GET /api/lineage returns stale=True when extract_age > EXTRACT_STALE_DAYS."""
    import services.api.settings as sm
    settings = sm.get_settings()

    # Back-date the lineage file to well beyond the threshold
    lineage_path = settings.lineage_file
    old_ts = time.time() - (settings.extract_stale_days + 2) * 86400
    os.utime(lineage_path, (old_ts, old_ts))

    resp = api_client.get("/api/lineage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stale"] is True, f"Expected stale=True but got: {data}"
    assert data["extract_age"] is not None
    assert data["extracted_at"] is not None


def test_lineage_not_stale_after_extract(api_client):
    """F5: After POST /api/extract the stale flag goes back to False."""
    import services.api.settings as sm
    settings = sm.get_settings()

    # Back-date the lineage file
    lineage_path = settings.lineage_file
    old_ts = time.time() - (settings.extract_stale_days + 5) * 86400
    os.utime(lineage_path, (old_ts, old_ts))

    # Trigger extract → resets mtime
    assert api_client.post("/api/extract").status_code == 200

    resp = api_client.get("/api/lineage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stale"] is False, f"Expected stale=False after extract, got: {data}"

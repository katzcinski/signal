"""Extract / inventory endpoints (WS1-2, WS2-6)."""


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

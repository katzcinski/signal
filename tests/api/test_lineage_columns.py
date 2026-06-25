"""GET /api/lineage/columns — per-column lineage served from columnEdges (O3)."""
import json
from pathlib import Path


def _seed_column_edges(api_client):
    import services.api.settings as sm
    lin_path = Path(sm.get_settings().lineage_file)
    data = json.loads(lin_path.read_text(encoding="utf-8"))
    data["columnEdges"] = [
        {"source": "Sales_Orders", "sourceColumn": "OrderID", "target": "v_OrderSummary",
         "targetColumn": "OrderID", "edgeType": "direct", "expression": ""},
        {"source": "Sales_Orders", "sourceColumn": "Amount", "target": "v_OrderSummary",
         "targetColumn": "TotalAmount", "edgeType": "computed", "expression": "SUM(o.Amount)"},
    ]
    lin_path.write_text(json.dumps(data), encoding="utf-8")


def test_columns_for_object(api_client):
    _seed_column_edges(api_client)
    resp = api_client.get("/api/lineage/columns", params={"object": "v_OrderSummary"})
    assert resp.status_code == 200
    cols = resp.json()["columns"]
    assert cols["TotalAmount"]["upstream"][0]["object"] == "Sales_Orders"
    assert cols["TotalAmount"]["upstream"][0]["edgeType"] == "computed"


def test_single_column_lineage(api_client):
    _seed_column_edges(api_client)
    resp = api_client.get(
        "/api/lineage/columns", params={"object": "Sales_Orders", "column": "OrderID"}
    )
    assert resp.status_code == 200
    down = resp.json()["lineage"]["downstream"]
    assert {"object": "v_OrderSummary", "column": "OrderID", "edgeType": "direct"} in down


def test_unknown_object_returns_empty(api_client):
    _seed_column_edges(api_client)
    resp = api_client.get("/api/lineage/columns", params={"object": "nope"})
    assert resp.status_code == 200
    assert resp.json()["columns"] == {}


def test_graph_includes_column_edges(api_client):
    """GET /api/lineage liefert columnEdges mit (fuer das Schaltplan-Board)."""
    _seed_column_edges(api_client)
    resp = api_client.get("/api/lineage")
    assert resp.status_code == 200
    body = resp.json()
    assert "columnEdges" in body
    pairs = {
        (e["source"], e["sourceColumn"], e["target"], e["targetColumn"])
        for e in body["columnEdges"]
    }
    assert ("Sales_Orders", "Amount", "v_OrderSummary", "TotalAmount") in pairs

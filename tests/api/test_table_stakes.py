"""API tests for R4 (incidents/coverage/badge/SLA) and R5-1 (ODCS export)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[2]))


def _seed_contract(api_client, product="DS_SALES_ORDERS"):
    resp = api_client.post(f"/api/contracts/{product}/seed")
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ---------------------------------------------------------------- coverage


def test_coverage_summary_shape(api_client):
    resp = api_client.get("/api/coverage/summary")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("total_objects", "objects_with_contract", "pct_with_contract",
                "stale_objects", "unvalidated"):
        assert key in data
    assert data["total_objects"] == 1


# ---------------------------------------------------------------- badge


def test_badge_svg_and_json(api_client):
    _seed_contract(api_client)
    svg = api_client.get("/api/badge/DS_SALES_ORDERS")
    assert svg.status_code == 200
    assert svg.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in svg.text

    js = api_client.get("/api/badge/DS_SALES_ORDERS?format=json")
    assert js.status_code == 200
    body = js.json()
    assert body["schemaVersion"] == 1
    assert body["message"] in ("compliant", "breached", "unknown")


def test_badge_unknown_product_404(api_client):
    assert api_client.get("/api/badge/NOPE").status_code == 404


# ---------------------------------------------------------------- SLA


def test_sla_endpoint(api_client):
    _seed_contract(api_client)
    resp = api_client.get("/api/contracts/DS_SALES_ORDERS/sla?window_days=7")
    assert resp.status_code == 200
    data = resp.json()
    assert data["window_days"] == 7
    assert data["uptime_pct"] == 100.0


# ---------------------------------------------------------------- ODCS


def test_odcs_export_endpoint(api_client):
    _seed_contract(api_client)
    resp = api_client.get("/api/contracts/DS_SALES_ORDERS/export/odcs")
    assert resp.status_code == 200
    doc = resp.json()
    assert doc["kind"] == "DataContract"
    assert doc["apiVersion"].startswith("v3.")
    assert "compliance" not in resp.text.lower()


# ---------------------------------------------------------------- incidents


def test_incident_lifecycle_via_api(api_client):
    # Empty inbox initially.
    assert api_client.get("/api/incidents").json() == []

    # Seed an incident directly in the store the app uses.
    from services.api.deps import get_store
    store = get_store()
    iid = store.open_incident("DS_SALES_ORDERS", "r1", "critical", "2 checks failing")

    inbox = api_client.get("/api/incidents").json()
    assert len(inbox) == 1
    assert inbox[0]["id"] == iid
    assert inbox[0]["status"] == "open"

    # Acknowledge → investigate → resolve via the API.
    ack = api_client.post(f"/api/incidents/{iid}/transition", json={"status": "acknowledged"})
    assert ack.status_code == 200
    assert ack.json()["status"] == "acknowledged"

    assign = api_client.post(f"/api/incidents/{iid}/assign", json={"owner": "team-data"})
    assert assign.status_code == 200
    assert assign.json()["owner"] == "team-data"

    detail = api_client.get(f"/api/incidents/{iid}").json()
    kinds = [e["kind"] for e in detail["events"]]
    assert "opened" in kinds and "acknowledged" in kinds and "assigned" in kinds

    res = api_client.post(f"/api/incidents/{iid}/transition", json={"status": "resolved"})
    assert res.json()["status"] == "resolved"
    assert api_client.get("/api/incidents?status=open").json() == []


def test_incident_invalid_status_422(api_client):
    from services.api.deps import get_store
    iid = get_store().open_incident("DS_SALES_ORDERS", "r1", "fail", "x")
    resp = api_client.post(f"/api/incidents/{iid}/transition", json={"status": "bogus"})
    assert resp.status_code == 422


# ---------------------------------------------------------------- run sub-resources


def test_run_results_unknown_404(api_client):
    assert api_client.get("/api/runs/nope/results").status_code == 404
    assert api_client.get("/api/runs/nope/diagnostics").status_code == 404

"""Contract lifecycle endpoints — approve / deprecate + breaking guard (WS2-6 / M2)."""


def _put_draft(client, product, version, key_columns):
    return client.put(
        f"/api/contracts/{product}",
        json={
            "product": product,
            "dataset": product,
            "owned_by": "product",
            "lifecycle": "draft",
            "version": version,
            "guarantees": {"keys": [{"columns": key_columns, "unique": True}]},
        },
    )


def test_approve_promotes_draft_to_active(api_client):
    assert _put_draft(api_client, "P1", "1.0.0", ["ORDER_ID"]).status_code == 200

    resp = api_client.post("/api/contracts/P1/approve")
    assert resp.status_code == 200, resp.text
    assert resp.json()["lifecycle"] == "active"

    # Subsequent GET reflects the active lifecycle.
    assert api_client.get("/api/contracts/P1").json()["lifecycle"] == "active"


def test_approve_rejects_non_draft(api_client):
    _put_draft(api_client, "P2", "1.0.0", ["ORDER_ID"])
    api_client.post("/api/contracts/P2/approve")
    # Already active → cannot approve again.
    resp = api_client.post("/api/contracts/P2/approve")
    assert resp.status_code == 409


def test_breaking_change_requires_major_bump(api_client):
    # Certify v1.
    _put_draft(api_client, "P3", "1.0.0", ["ORDER_ID"])
    assert api_client.post("/api/contracts/P3/approve").status_code == 200

    # Breaking change (key change) without a major bump → blocked (Gate G3).
    _put_draft(api_client, "P3", "1.1.0", ["ORDER_ID", "ITEM_NO"])
    resp = api_client.post("/api/contracts/P3/approve")
    assert resp.status_code == 409, resp.text
    assert "major" in str(resp.json()["detail"]).lower()

    # Same breaking change WITH a major bump → allowed.
    _put_draft(api_client, "P3", "2.0.0", ["ORDER_ID", "ITEM_NO"])
    resp = api_client.post("/api/contracts/P3/approve")
    assert resp.status_code == 200, resp.text
    assert resp.json()["lifecycle"] == "active"


def test_deprecate_active_contract(api_client):
    _put_draft(api_client, "P4", "1.0.0", ["ORDER_ID"])
    api_client.post("/api/contracts/P4/approve")

    resp = api_client.post("/api/contracts/P4/deprecate")
    assert resp.status_code == 200, resp.text
    assert resp.json()["lifecycle"] == "deprecated"


def test_deprecate_rejects_non_active(api_client):
    _put_draft(api_client, "P5", "1.0.0", ["ORDER_ID"])  # still draft
    resp = api_client.post("/api/contracts/P5/deprecate")
    assert resp.status_code == 409


def test_approve_missing_contract_404(api_client):
    assert api_client.post("/api/contracts/NOPE/approve").status_code == 404

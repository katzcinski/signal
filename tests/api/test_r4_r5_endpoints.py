"""R4/R5-Endpunkte: Incidents-Lifecycle, SLA, Coverage, Badge, Environments, ODCS."""


def _activate_contract(client, product="DS_SALES_ORDERS"):
    client.put(
        f"/api/contracts/{product}",
        json={
            "product": product, "dataset": product, "owned_by": "platform",
            "version": "1.0.0",
            "guarantees": {"keys": [{"columns": ["ORDER_ID"], "unique": True}]},
        },
    )
    return client.post(f"/api/contracts/{product}/approve")


def test_incident_endpoints(api_client):
    # leer
    assert api_client.get("/api/incidents").json() == []
    # alte abgeleitete Sicht lebt unter /checks weiter
    assert api_client.get("/api/incidents/checks").status_code == 200
    # ungültiger Statusfilter
    assert api_client.get("/api/incidents?status=bogus").status_code == 422
    # Transition auf nicht existentes Incident
    assert api_client.post("/api/incidents/999/transition", json={"status": "resolved"}).status_code == 404
    # Viewer darf nicht transitionieren
    resp = api_client.post(
        "/api/incidents/1/transition", json={"status": "resolved"},
        headers={"X-DQ-Role": "viewer"},
    )
    assert resp.status_code == 403


def test_sla_endpoint(api_client):
    assert _activate_contract(api_client).status_code == 200
    resp = api_client.get("/api/contracts/DS_SALES_ORDERS/sla")
    assert resp.status_code == 200
    body = resp.json()
    assert body["current"] in ("unknown", "compliant", "breached")
    assert set(body["windows"].keys()) == {"7d", "30d", "90d"}
    assert api_client.get("/api/contracts/NOPE/sla").status_code == 404


def test_coverage_summary(api_client):
    resp = api_client.get("/api/coverage/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["objects_total"] >= 1
    assert "contract_coverage_pct" in body
    assert isinstance(body["unvalidated_30d"], list)


def test_badge(api_client):
    _activate_contract(api_client)
    svg = api_client.get("/api/badge/DS_SALES_ORDERS")
    assert svg.status_code == 200
    assert svg.headers["content-type"].startswith("image/svg+xml")
    assert "DQ DS_SALES_ORDERS" in svg.text

    js = api_client.get("/api/badge/DS_SALES_ORDERS?format=json").json()
    assert js["product"] == "DS_SALES_ORDERS"
    assert api_client.get("/api/badge/bad%20name").status_code == 422


def test_environments_no_secrets(api_client, tmp_path, monkeypatch):
    env_file = tmp_path / "environments.yml"
    env_file.write_text(
        "dev:\n  host: hana.example.com\n  port: 443\n  schema: DEV_SCHEMA\n"
        "  user: SECRET_USER\n  password: SECRET_PW\n"
    )
    monkeypatch.setenv("ENVIRONMENTS_FILE", str(env_file))
    import services.api.settings as settings_mod
    settings_mod._settings = None

    resp = api_client.get("/api/environments")
    assert resp.status_code == 200
    body = resp.json()
    assert body["environments"] == [{"name": "dev", "schema": "DEV_SCHEMA"}]
    assert "SECRET" not in resp.text  # S-13: nie Credentials ausliefern

    settings_mod._settings = None


def test_odcs_export_endpoint(api_client):
    _activate_contract(api_client)
    resp = api_client.get("/api/contracts/DS_SALES_ORDERS/export/odcs")
    assert resp.status_code == 200
    body = resp.json()
    assert body["apiVersion"] == "v3.1.0"
    assert body["kind"] == "DataContract"
    assert body["status"] == "active"

    yml = api_client.get("/api/contracts/DS_SALES_ORDERS/export/odcs?format=yaml")
    assert yml.status_code == 200
    assert "DataContract" in yml.text


def test_family_status_in_objects(api_client):
    resp = api_client.get("/api/objects")
    assert resp.status_code == 200
    for obj in resp.json():
        fs = obj["family_status"]
        assert set(fs.keys()) == {"observability", "quality"}


def test_contract_list_served_from_index(api_client):
    """A3: Liste kommt aus contract_index (guarantees leer), Detail aus der Datei."""
    _activate_contract(api_client, "IDX1")
    listed = api_client.get("/api/contracts").json()
    entry = next(c for c in listed if c["product"] == "IDX1")
    assert entry["lifecycle"] == "active"
    assert entry["guarantees"] == {}
    detail = api_client.get("/api/contracts/IDX1").json()
    assert detail["guarantees"]["keys"]


# ---- Pagination ----

def test_incidents_pagination(api_client):
    assert api_client.get("/api/incidents?limit=10&offset=0").status_code == 200
    assert api_client.get("/api/incidents?limit=1&offset=0").status_code == 200
    assert api_client.get("/api/incidents?limit=501").status_code == 422
    assert api_client.get("/api/incidents?limit=0").status_code == 422


def test_runs_pagination(api_client):
    assert api_client.get("/api/runs?limit=10&offset=0").status_code == 200
    assert api_client.get("/api/runs?limit=501").status_code == 422
    assert api_client.get("/api/runs?limit=0").status_code == 422


def test_incidents_pagination_offset_reduces_result(api_client):
    """Offset pagination: requesting past the end returns an empty list."""
    result = api_client.get("/api/incidents?limit=50&offset=999").json()
    assert result == []


def test_runs_pagination_offset_reduces_result(api_client):
    result = api_client.get("/api/runs?limit=50&offset=999").json()
    assert result == []


# ---- Observability ----

def test_metrics_health_endpoint(api_client):
    resp = api_client.get("/api/metrics/health")
    assert resp.status_code == 200
    body = resp.json()
    assert "requests_total" in body
    assert "requests_4xx" in body
    assert "requests_5xx" in body
    assert "uptime_s" in body
    assert body["requests_total"] >= 1  # at least this request was counted


def test_request_id_header_injected(api_client):
    resp = api_client.get("/api/health")
    assert resp.status_code == 200
    assert "x-request-id" in resp.headers


def test_request_id_propagated(api_client):
    resp = api_client.get("/api/health", headers={"X-Request-ID": "test-id-123"})
    assert resp.headers.get("x-request-id") == "test-id-123"

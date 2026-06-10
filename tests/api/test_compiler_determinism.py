"""WS3 acceptance: compiling the same contract twice is byte-identical,
and the determinism hash folds in the library version (A4)."""


def _put_draft(client, product):
    return client.put(
        f"/api/contracts/{product}",
        json={
            "product": product,
            "dataset": product,
            "owned_by": "product",
            "lifecycle": "draft",
            "version": "1.0.0",
            "guarantees": {"keys": [{"columns": ["ORDER_ID"], "unique": True}]},
        },
    )


def test_compile_is_deterministic(api_client):
    assert _put_draft(api_client, "DET1").status_code == 200

    first = api_client.post("/api/contracts/DET1/compile?dry_run=true")
    second = api_client.post("/api/contracts/DET1/compile?dry_run=true")
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text

    a, b = first.json(), second.json()
    assert a["determinism_hash"]  # non-empty
    assert a["determinism_hash"] == b["determinism_hash"]
    assert a["yaml_preview"] == b["yaml_preview"]


def test_compile_produces_checks_from_guarantees(api_client):
    api_client.put(
        "/api/contracts/RICH",
        json={
            "product": "RICH", "dataset": "RICH", "owned_by": "product",
            "lifecycle": "draft", "version": "1.0.0",
            "guarantees": {
                "keys": [{"columns": ["ID"], "unique": True}],
                "not_null": [{"columns": ["ID", "AMOUNT"]}],
                "row_count": {"min": 10},
            },
        },
    )
    resp = api_client.post("/api/contracts/RICH/compile?dry_run=true")
    assert resp.status_code == 200, resp.text
    checks = resp.json()["checks"]
    # 1 key + 2 not_null + 1 row_count
    assert len(checks) == 4
    assert {c["type"] for c in checks} == {"duplicate", "missing", "row_count"}
    assert "{schema}" in resp.json()["yaml_preview"]  # G2 placeholder preserved

"""R5-1: ODCS-3.1-Export validiert gegen das OFFIZIELLE Bitol-JSON-Schema."""
import json
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

from dq_core.contract.odcs_export import to_odcs

FIXTURE = Path(__file__).parents[1] / "fixtures" / "odcs-json-schema-v3.1.0.json"


def _full_contract() -> dict:
    return {
        "product": "DS_SALES_ORDERS",
        "dataset": "DS_SALES_ORDERS",
        "owned_by": "product",
        "owners": ["grp:data-platform"],
        "version": "1.0.0",
        "lifecycle": "active",
        "description": "Sales order fact table",
        "guarantees": {
            "schema": {"columns": ["ORDER_ID", "CUSTOMER_ID", "NET_AMOUNT", "ORDER_DATE"], "mode": "closed"},
            "keys": [{"columns": ["ORDER_ID"], "unique": True, "severity": "critical"}],
            "referential": [{"fk": ["CUSTOMER_ID"], "parent": "DS_CUSTOMERS",
                             "parent_key": ["CUSTOMER_ID"], "severity": "fail"}],
            "freshness": {"column": "ORDER_DATE", "max_age": "PT26H", "severity": "warn"},
            "volume": {"min_rows": 1000, "severity": "warn"},
            "completeness": [{"column": "NET_AMOUNT", "min_pct": 99.5, "severity": "warn"}],
            "not_null": [{"columns": ["ORDER_ID", "CUSTOMER_ID"], "severity": "fail"}],
        },
    }


def test_validates_against_official_odcs_schema():
    if not FIXTURE.exists():
        pytest.skip("ODCS schema fixture missing")
    import jsonschema
    schema = json.loads(FIXTURE.read_text())
    odcs = to_odcs(_full_contract())
    jsonschema.Draft201909Validator(schema).validate(odcs)


def test_structural_mapping():
    odcs = to_odcs(_full_contract())
    assert odcs["apiVersion"] == "v3.1.0"
    assert odcs["kind"] == "DataContract"
    assert odcs["status"] == "active"

    obj = odcs["schema"][0]
    props = {p["name"]: p for p in obj["properties"]}
    assert props["ORDER_ID"]["primaryKey"] is True
    assert props["ORDER_ID"]["required"] is True
    assert props["CUSTOMER_ID"]["required"] is True
    # completeness → nullValues percent
    q = props["NET_AMOUNT"]["quality"][0]
    assert q["metric"] == "nullValues" and q["mustBeLessOrEqualTo"] == 0.5
    # referential → v3.1 relationships
    assert obj["relationships"][0]["from"] == "DS_SALES_ORDERS.CUSTOMER_ID"
    assert obj["relationships"][0]["to"] == "DS_CUSTOMERS.CUSTOMER_ID"
    # volume → rowCount
    assert obj["quality"][0]["metric"] == "rowCount"
    assert obj["quality"][0]["mustBeGreaterOrEqualTo"] == 1000
    # freshness → slaProperties (26h)
    sla = odcs["slaProperties"][0]
    assert sla["property"] == "latency" and sla["value"] == 26 and sla["unit"] == "h"
    # Compliance bewusst NICHT enthalten (A1)
    assert "compliance" not in json.dumps(odcs)


def test_shipped_contracts_export_cleanly():
    contracts_dir = Path(__file__).parents[2] / "contracts"
    for path in contracts_dir.glob("*.y*ml"):
        if path.name.endswith(".active.yml"):
            continue
        odcs = to_odcs(yaml.safe_load(path.read_text(encoding="utf-8")))
        assert odcs["schema"][0]["properties"], path.name
        if FIXTURE.exists():
            import jsonschema
            jsonschema.Draft201909Validator(json.loads(FIXTURE.read_text())).validate(odcs)


def test_deterministic():
    assert to_odcs(_full_contract()) == to_odcs(_full_contract())

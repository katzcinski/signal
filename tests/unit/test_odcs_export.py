"""R5-1: ODCS 3.1 export — deterministic, schema-valid, compliance-free (A1)."""
import json
import sys
from pathlib import Path

import jsonschema
import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

from dq_core.contract.odcs_export import to_odcs

_REPO = Path(__file__).parents[2]
_SCHEMA = json.loads((_REPO / "tests/fixtures/odcs_3_1_schema.json").read_text())


def _load_repo_contract() -> dict:
    return yaml.safe_load((_REPO / "contracts/DS_SALES_ORDERS.yaml").read_text())


def test_export_validates_against_odcs_schema():
    doc = to_odcs(_load_repo_contract())
    jsonschema.validate(doc, _SCHEMA)


def test_export_is_deterministic():
    contract = _load_repo_contract()
    a = json.dumps(to_odcs(contract), sort_keys=True)
    b = json.dumps(to_odcs(contract), sort_keys=True)
    assert a == b


def test_compliance_never_exported():
    contract = _load_repo_contract()
    contract["compliance"] = "breached"  # must be ignored
    doc = to_odcs(contract)
    blob = json.dumps(doc).lower()
    assert "breached" not in blob
    assert "compliance" not in blob


def test_lifecycle_maps_to_status():
    contract = _load_repo_contract()
    contract["lifecycle"] = "active"
    assert to_odcs(contract)["status"] == "active"


def test_keys_become_primary_key_properties():
    doc = to_odcs(_load_repo_contract())
    props = {p["name"]: p for p in doc["schema"][0]["properties"]}
    pks = [p for p in props.values() if p.get("primaryKey")]
    # DS_SALES_ORDERS declares a composite key → at least one PK property.
    assert pks, "expected at least one primaryKey property"
    for p in pks:
        assert p["unique"] is True
        assert p["required"] is True

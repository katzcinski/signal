"""Gate G1 tests — SQL in contract must be rejected. [CONTRACT-SQL-FREE]"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

from dq_core.contract.validator import validate_contract


VALID_CONTRACT = {
    "product": "sales_orders",
    "dataset": "Sales_Orders_View",
    "owned_by": "platform",
    "lifecycle": "draft",
    "version": "0.1.0",
    "guarantees": {
        "keys": [{"columns": ["OrderID"], "unique": True}],
        "freshness": {"column": "LOAD_TS", "max_age": "PT24H"},
    },
}


def test_valid_contract_passes():
    errors = validate_contract(VALID_CONTRACT)
    assert errors == []


def test_g1_rejects_select_in_value():
    bad = {**VALID_CONTRACT, "guarantees": {"custom": "SELECT * FROM table"}}
    errors = validate_contract(bad)
    assert any("[G1]" in e for e in errors), errors


def test_g1_rejects_nested_sql():
    bad = {
        **VALID_CONTRACT,
        "guarantees": {"rule": {"sql": "SELECT COUNT(*) FROM foo WHERE x > 0"}},
    }
    errors = validate_contract(bad)
    assert any("[G1]" in e for e in errors), errors


def test_s2_rejects_unsafe_identifier():
    bad = {
        **VALID_CONTRACT,
        "dataset": "'; DROP TABLE users; --",
    }
    errors = validate_contract(bad)
    assert any("[S2]" in e for e in errors), errors


def test_invalid_lifecycle():
    bad = {**VALID_CONTRACT, "lifecycle": "published"}
    errors = validate_contract(bad)
    assert any("lifecycle" in e for e in errors), errors


def test_invalid_owned_by():
    bad = {**VALID_CONTRACT, "owned_by": "external"}
    errors = validate_contract(bad)
    assert any("owned_by" in e for e in errors), errors

import pytest
from dq_core.engine.expectation import evaluate_expectation, validate_expectation
from dq_core.contract.validator import ContractValidator
from dq_core.contract.model import Contract, Guarantees, SchemaGuarantee, KeyGuarantee
from dq_core.contract.diff import ContractDiff
from dq_core.contract.compiler import ContractCompiler
from dq_core.contract.seed import seed_contract


# --- Expectation tests ---

def test_is_null():
    assert evaluate_expectation("IS NULL", None) is True
    assert evaluate_expectation("IS NULL", 0) is False

def test_is_not_null():
    assert evaluate_expectation("IS NOT NULL", 1) is True
    assert evaluate_expectation("IS NOT NULL", None) is False

def test_compare_equal():
    assert evaluate_expectation("= 5", 5) is True
    assert evaluate_expectation("= 5", 6) is False

def test_compare_range():
    assert evaluate_expectation(">= 10", 10) is True
    assert evaluate_expectation("> 10", 10) is False
    assert evaluate_expectation("<= 10", 11) is False

def test_between():
    assert evaluate_expectation("BETWEEN 1 AND 10", 5) is True
    assert evaluate_expectation("BETWEEN 1 AND 10", 11) is False

def test_tolerance():
    assert evaluate_expectation("= 100 ±5", 103) is True
    assert evaluate_expectation("= 100 ±5", 106) is False

def test_in():
    assert evaluate_expectation("IN(1, 2, 3)", 2) is True
    assert evaluate_expectation("IN(1, 2, 3)", 4) is False

def test_not_in():
    assert evaluate_expectation("NOT IN(1, 2, 3)", 4) is True
    assert evaluate_expectation("NOT IN(1, 2, 3)", 2) is False

def test_delta():
    assert evaluate_expectation("DELTA < 10%", 105, previous_value=100) is True
    assert evaluate_expectation("DELTA < 10%", 120, previous_value=100) is False

def test_matches():
    assert evaluate_expectation("MATCHES /^[0-9]+$/", "12345") is True
    assert evaluate_expectation("MATCHES /^[0-9]+$/", "abc") is False

def test_validate_expectation():
    assert validate_expectation(">= 0") is True
    assert validate_expectation("IS NULL") is True
    assert validate_expectation("garbage expression xyz") is False


# --- Contract validator tests ---

def make_contract(**kwargs):
    defaults = dict(
        product="test_product", dataset="test_dataset",
        owned_by="platform", owners=[], version="1.0.0", lifecycle="draft",
        guarantees=Guarantees(),
    )
    defaults.update(kwargs)
    return Contract(**defaults)

def test_validator_rejects_sql_in_product():
    c = make_contract(product="SELECT * FROM users")
    errors = ContractValidator().validate(c)
    assert any("SQL pattern" in e for e in errors)

def test_validator_rejects_sql_in_dataset():
    c = make_contract(dataset="DROP TABLE users")
    errors = ContractValidator().validate(c)
    assert any("SQL" in e or "identifier" in e.lower() for e in errors)

def test_validator_rejects_invalid_lifecycle():
    c = make_contract(lifecycle="breached")
    errors = ContractValidator().validate(c)
    assert any("lifecycle" in e.lower() for e in errors)

def test_validator_accepts_valid_contract():
    c = make_contract()
    errors = ContractValidator().validate(c)
    assert errors == []


# --- Diff engine tests ---

def test_diff_removing_column_is_breaking():
    old = make_contract(guarantees=Guarantees(schema=SchemaGuarantee(columns=["a", "b"])))
    new = make_contract(guarantees=Guarantees(schema=SchemaGuarantee(columns=["a"])))
    result = ContractDiff().diff(old, new)
    assert result.is_breaking
    assert any("removed" in c for c in result.breaking_changes)

def test_diff_adding_column_open_schema_is_non_breaking():
    old = make_contract(guarantees=Guarantees(schema=SchemaGuarantee(columns=["a"], mode="open")))
    new = make_contract(guarantees=Guarantees(schema=SchemaGuarantee(columns=["a", "b"], mode="open")))
    result = ContractDiff().diff(old, new)
    assert not result.is_breaking

def test_diff_key_removal_is_breaking():
    old = make_contract(guarantees=Guarantees(keys=[KeyGuarantee(columns=["id"])]))
    new = make_contract(guarantees=Guarantees(keys=[]))
    result = ContractDiff().diff(old, new)
    assert result.is_breaking


# --- Compiler determinism test ---

def test_compiler_determinism():
    contract = make_contract(
        guarantees=Guarantees(
            schema=SchemaGuarantee(columns=["id", "name"]),
            keys=[KeyGuarantee(columns=["id"])],
        )
    )
    compiler = ContractCompiler()
    result1 = compiler.compile(contract)
    result2 = compiler.compile(contract)
    assert result1["header_hash"] == result2["header_hash"]
    assert len(result1["checks"]) == len(result2["checks"])


# --- Seed test ---

def test_seed_creates_key_when_none_declared():
    inventory = {
        "dataset": "Sales_Orders_View",
        "columns": [
            {"name": "OrderID", "type": "INTEGER", "nullable": False},
            {"name": "ItemNo", "type": "INTEGER", "nullable": False},
            {"name": "Amount", "type": "DECIMAL", "nullable": True},
        ],
        "declared_keys": [],
    }
    contract = seed_contract(inventory, "Sales_Orders_View")
    assert len(contract.guarantees.keys) == 1
    assert set(contract.guarantees.keys[0].columns) == {"OrderID", "ItemNo"}
    assert contract.guarantees.keys[0].severity == "critical"

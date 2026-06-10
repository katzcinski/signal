"""WS3 — Stufe-1 guarantees compiler (§1.5 format → CheckDef)."""
import sys
import tempfile
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "packages"))

import pytest

from dq_core.contract.compiler import compile_contract
from dq_core.engine.check_engine import dataset_config_to_yaml, load_dataset_config
from dq_core.library.check_library import check_by_id


SALES = {
    "product": "DS_SALES_ORDERS",
    "dataset": "DS_SALES_ORDERS",
    "owned_by": "product",
    "version": "1.0.0",
    "guarantees": {
        "keys": [{"columns": ["ORDER_ID"], "unique": True}],
        "not_null": [{"columns": ["ORDER_ID", "NET_AMOUNT"]}],
        "row_count": {"min": 1000},
        "freshness": {"column": "ORDER_DATE", "max_age_hours": 26},
        "schema_columns": {"expected": ["ORDER_ID", "NET_AMOUNT", "ORDER_DATE"]},
    },
}


def test_each_guarantee_maps_to_a_library_template():
    cfg = compile_contract(SALES)
    # type carries the guarantee/template id (traceability)
    types = [c.type for c in cfg.checks]
    assert types.count("missing") == 2          # two not_null columns
    assert "duplicate" in types                  # unique key
    assert "row_count" in types
    assert "freshness" in types
    assert "schema" in types
    # G3: every emitted check resolves to a real library template
    for c in cfg.checks:
        assert check_by_id(c.type) is not None, c.type


def test_composite_key_produces_multi_column_distinct():
    cfg = compile_contract({
        "dataset": "T", "owned_by": "product", "version": "1.0.0",
        "guarantees": {"keys": [{"columns": ["A", "B"], "unique": True}]},
    })
    key = next(c for c in cfg.checks if c.type == "duplicate")
    assert 'COUNT(DISTINCT "A", "B")' in key.sql
    assert key.expect == "= 0"


def test_completeness_inverts_min_pct():
    cfg = compile_contract({
        "dataset": "T", "owned_by": "product", "version": "1.0.0",
        "guarantees": {"completeness": [{"column": "AMOUNT", "min_pct": 99.5}]},
    })
    c = cfg.checks[0]
    assert c.type == "completeness_pct"
    assert c.expect == "<= 0.5"  # allowed NULL percentage


def test_g2_schema_stays_a_placeholder_and_no_hardcoding():
    yaml_out = dataset_config_to_yaml(compile_contract(SALES))
    assert "{schema}" in yaml_out
    assert "CENTRAL" not in yaml_out


def test_determinism_byte_identical():
    a = dataset_config_to_yaml(compile_contract(SALES))
    b = dataset_config_to_yaml(compile_contract(SALES))
    assert a == b


def test_roundtrip_compiles_to_loadable_valid_checks():
    yaml_out = dataset_config_to_yaml(compile_contract(SALES))
    p = pathlib.Path(tempfile.mktemp(suffix=".yml"))
    p.write_text(yaml_out)
    cfg = load_dataset_config(p)  # validates expects + severities
    assert len(cfg.checks) == len(compile_contract(SALES).checks)


def test_volume_is_emitted_disabled():
    cfg = compile_contract({
        "dataset": "T", "owned_by": "product", "version": "1.0.0",
        "guarantees": {"volume": {"baseline": "rolling", "bounds": "auto"}},
    })
    vol = next(c for c in cfg.checks if c.type == "volume")
    assert vol.enabled is False  # skipped_dependency until WS5-1 baselines


def test_s2_rejects_unsafe_identifier():
    with pytest.raises(ValueError, match="S2"):
        compile_contract({
            "dataset": "T", "owned_by": "product", "version": "1.0.0",
            "guarantees": {"not_null": [{"columns": ["A; DROP TABLE x"]}]},
        })


def test_invalid_owner_rejected():
    with pytest.raises(ValueError):
        compile_contract({"dataset": "T", "owned_by": "intruder", "guarantees": {}})

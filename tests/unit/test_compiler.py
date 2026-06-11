"""Compiler-Tests: §1.5-Garantien → CheckDefs. [DETERMINISM] [SCHEMA-MAP] G1/G2/S2."""
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))

from dq_core.contract.compiler import (
    CompileError,
    bind_schema,
    compile_contract,
    compiler_hash,
    parse_iso_duration,
)
from dq_core.engine.check_engine import dataset_config_to_yaml


def _shipped_contract() -> dict:
    path = Path(__file__).parents[2] / "contracts" / "DS_SALES_ORDERS.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_compiles_shipped_contract_to_checks():
    """§0-Regression: der Repo-Contract muss kompilieren — und zwar nicht leer."""
    config = compile_contract(_shipped_contract())
    assert config.dataset == "DS_SALES_ORDERS"
    assert len(config.checks) >= 6  # schema + key + 4×not_null + volume + freshness
    names = {c.name for c in config.checks}
    assert "key_ORDER_ID_unique" in names
    assert "volume_min_rows" in names
    assert "freshness_ORDER_DATE" in names


def test_schema_placeholder_preserved_g2():
    """L-2: '{schema}' bleibt wörtlich im Output — Bindung erst zur Laufzeit."""
    config = compile_contract(_shipped_contract())
    assert config.schema == "{schema}"
    assert all("{schema}" in c.sql for c in config.checks)
    # und im serialisierten Artefakt
    assert "'{schema}'" in dataset_config_to_yaml(config) or "{schema}" in dataset_config_to_yaml(config)


def test_bind_schema_resolves_placeholder():
    config = compile_contract(_shipped_contract())
    bind_schema(config, "CORE_DWH")
    assert config.schema == "CORE_DWH"
    assert all("{schema}" not in c.sql for c in config.checks)
    assert any('"CORE_DWH"' in c.sql for c in config.checks)


def test_bind_schema_rejects_unsafe_schema():
    config = compile_contract(_shipped_contract())
    with pytest.raises(CompileError):
        bind_schema(config, 'X"; DROP TABLE y; --')


def test_determinism_nonempty_byte_identical():
    """L-1: Determinismus-Test mit Nicht-leer-Wache — nie wieder vakuum."""
    a = compile_contract(_shipped_contract())
    b = compile_contract(_shipped_contract())
    assert len(a.checks) > 0
    assert dataset_config_to_yaml(a) == dataset_config_to_yaml(b)
    assert compiler_hash(_shipped_contract()) == compiler_hash(_shipped_contract())


def test_compiler_hash_changes_with_contract():
    base = _shipped_contract()
    changed = yaml.safe_load(yaml.safe_dump(base))
    changed["guarantees"]["volume"]["min_rows"] = 9999
    assert compiler_hash(base) != compiler_hash(changed)


def test_injection_in_key_columns_raises():
    """S-4: der frühere Verifikationsfall 'A" OR 1=1 --' muss hart scheitern."""
    bad = {
        "product": "X", "dataset": "X", "version": "1.0.0",
        "guarantees": {"keys": [{"columns": ['A" OR 1=1 --'], "unique": True}]},
    }
    with pytest.raises(CompileError):
        compile_contract(bad)


def test_no_raw_sql_path_exists():
    """S-3: type:sql existiert nicht mehr — unbekannte Garantie-Keys werden ignoriert,
    es gibt keinen Pfad, der einen String als SQL übernimmt."""
    contract = {
        "product": "X", "dataset": "X", "version": "1.0.0",
        "guarantees": {"keys": [{"columns": ["ID"], "unique": True}]},
        # smuggle attempt — Compiler liest dieses Feld schlicht nicht
        "quality": [{"type": "sql", "query": "SELECT 1; DROP TABLE x"}],
    }
    config = compile_contract(contract)
    assert all("DROP" not in c.sql for c in config.checks)


def test_inventory_existence_check_s2_stage2():
    contract = {
        "product": "X", "dataset": "X", "version": "1.0.0",
        "guarantees": {"not_null": [{"columns": ["GHOST_COL"]}]},
    }
    with pytest.raises(CompileError, match="existiert nicht im Inventar"):
        compile_contract(contract, inventory_columns={"REAL_COL"})
    # mit passendem Inventar kompiliert es
    contract["guarantees"]["not_null"][0]["columns"] = ["REAL_COL"]
    assert compile_contract(contract, inventory_columns={"REAL_COL"}).checks


def test_composite_key_uses_composite_template():
    contract = {
        "product": "X", "dataset": "X", "version": "1.0.0",
        "guarantees": {"keys": [{"columns": ["ORDER_ID", "ITEM_NO"], "unique": True}]},
    }
    config = compile_contract(contract)
    assert config.checks[0].type == "duplicate_composite"
    assert '"ORDER_ID" || \'|\' || "ITEM_NO"' in config.checks[0].sql


def test_completeness_maps_min_pct_to_null_quote():
    contract = {
        "product": "X", "dataset": "X", "version": "1.0.0",
        "guarantees": {"completeness": [{"column": "AMOUNT", "min_pct": 99.5}]},
    }
    config = compile_contract(contract)
    assert config.checks[0].expect == "<= 0.5"


def test_parse_iso_duration():
    assert parse_iso_duration("PT26H") == 26 * 3600
    assert parse_iso_duration("P1D") == 86400
    assert parse_iso_duration("PT30M") == 1800
    with pytest.raises(CompileError):
        parse_iso_duration("26h")

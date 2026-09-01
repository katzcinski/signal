"""WS-A-Regression: der ausgelieferte Demo-Snapshot trägt echte Spalten-Lineage.

Sichert ab, dass ``data/inventory.json`` CSN-``csnProjection`` enthält, sodass
``build_column_lineage`` echte ``computed``-Kanten (inkl. Expression) und die
mehrstufige Impact-Kette über die Layer erzeugt — nicht ``direct``/leer-
Platzhalter (O3). Erzeugt von ``scripts/build_demo_snapshot.py``.
"""

from __future__ import annotations

import json
from pathlib import Path

from dq_core.lineage._column_lineage import build_column_indexes, build_column_lineage

REPO_ROOT = Path(__file__).resolve().parents[2]
INVENTORY = REPO_ROOT / "data" / "inventory.json"


def _objects() -> list[dict]:
    return json.loads(INVENTORY.read_text(encoding="utf-8"))["objects"]


def test_demo_inventory_carries_csn_projection() -> None:
    enriched = [o for o in _objects() if o.get("csnProjection", {}).get("projectionLineage")]
    assert enriched, "kein Objekt mit csnProjection.projectionLineage — Snapshot-Skript laufen lassen"


def test_demo_yields_computed_edges_with_expression() -> None:
    result = build_column_lineage(_objects())
    computed = [e for e in result.edges if e.edge_type == "computed"]
    assert computed, "keine computed-Kanten — Walker bekam keinen CSN-query-AST"
    assert all(e.expression for e in computed), "computed-Kante ohne Expression"


def test_demo_region_code_impact_chain() -> None:
    """ic_customer_v.REGION_CODE → bc_customer_dim_v → bc_sales_order_item_fact_v."""
    idx = build_column_indexes(build_column_lineage(_objects()))

    dim = idx["bc_customer_dim_v"]["REGION_CODE"]
    up = {(u["object"], u["column"]) for u in dim["upstream"]}
    down = {(d["object"], d["column"]) for d in dim["downstream"]}
    assert ("ic_customer_v", "REGION_CODE") in up
    assert ("bc_sales_order_item_fact_v", "REGION_CODE") in down


def test_demo_arithmetic_emits_edge_per_source_column() -> None:
    """``a.REVENUE_EUR - b.BUDGET_AMOUNT`` → je eine Kante pro Quellspalte."""
    result = build_column_lineage(_objects())
    sources = {
        (e.source_object, e.source_column)
        for e in result.edges
        if e.target_object == "bc_budget_actual_fact_v" and e.target_column == "VARIANCE_AMOUNT"
    }
    assert ("bc_revenue_monthly_fact_v", "REVENUE_EUR") in sources
    assert ("ic_budget_plan_v", "BUDGET_AMOUNT") in sources

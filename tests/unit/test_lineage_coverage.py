from dq_core.lineage.loader import get_coverage


def test_get_coverage_annotates_kind():
    nodes = [{"id": "ds1"}, {"id": "ds2"}, {"id": "ds3"}]
    statuses = [
        {"dataset": "ds1", "status": "pass"},
        {"dataset": "ds2", "status": "pass"},
    ]
    contracted = ["ds1", "ds2"]

    result = get_coverage(
        nodes,
        statuses,
        contracted,
        gate_products={"ds1"},
        contract_products={"ds2"},
    )
    ds1 = next(n for n in result if n["id"] == "ds1")
    ds2 = next(n for n in result if n["id"] == "ds2")
    ds3 = next(n for n in result if n["id"] == "ds3")

    assert ds1["has_internal_gate"] is True
    assert ds1["has_boundary_contract"] is False
    assert ds2["has_internal_gate"] is False
    assert ds2["has_boundary_contract"] is True
    assert ds3["has_internal_gate"] is False
    assert ds3["coverage_flag"] == "\u25b2"


def test_external_source_nodes_are_out_of_scope_not_a_gap():
    """Quellen ausserhalb des Tenants können keinen Contract tragen.

    ``build_lineage_graph`` stellt sie als eigene Knoten in den Graphen
    (``type``/``layer`` = external). Ohne diese Unterscheidung liest die
    Coverage-Map jede replizierte Quellsystem-Tabelle als Governance-Lücke.
    """
    nodes = [
        {"id": "S4:VBAK", "type": "external", "layer": "external"},
        {"id": "ext_legacy", "sourceScope": "external_system"},
        {"id": "legacy_snapshot", "objectType": "external_raw"},
        {"id": "r_s4h_vbak_rt", "type": "remote-tables", "layer": "raw"},
    ]

    result = {n["id"]: n for n in get_coverage(nodes, [], [])}

    assert result["S4:VBAK"]["coverage_flag"] == "○"
    assert result["ext_legacy"]["coverage_flag"] == "○"
    assert result["legacy_snapshot"]["coverage_flag"] == "○"
    # Ein Objekt im Tenant ohne Contract bleibt eine echte Lücke.
    assert result["r_s4h_vbak_rt"]["coverage_flag"] == "▲"

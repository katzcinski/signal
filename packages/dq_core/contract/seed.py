from typing import Optional
from dq_core.contract.model import (
    Contract, Guarantees, SchemaGuarantee, KeyGuarantee,
    CompletenessGuarantee, FreshnessGuarantee
)


def seed_contract(inventory_snapshot: dict, dataset_name: str, product_name: Optional[str] = None) -> Contract:
    """
    Create a draft Contract from an inventory snapshot.

    inventory_snapshot shape:
    {
      "dataset": "Sales_Orders_View",
      "columns": [
        {"name": "OrderID", "type": "INTEGER", "nullable": false},
        {"name": "ItemNo", "type": "INTEGER", "nullable": false},
        ...
      ],
      "declared_keys": [["OrderID", "ItemNo"]],  # optional
      "load_ts_column": "LOAD_TS",  # optional
    }
    """
    product = product_name or dataset_name.lower().replace(" ", "_")
    columns = inventory_snapshot.get("columns", [])
    col_names = [c["name"] for c in columns]

    schema_g = SchemaGuarantee(columns=col_names, mode="open") if col_names else None

    declared_keys = inventory_snapshot.get("declared_keys", [])
    keys = []
    if declared_keys:
        for key_cols in declared_keys:
            keys.append(KeyGuarantee(columns=key_cols, unique=True, severity="critical"))
    else:
        # No declared key: propose composite from first two non-nullable columns
        non_null_cols = [c["name"] for c in columns if not c.get("nullable", True)]
        if len(non_null_cols) >= 2:
            keys.append(KeyGuarantee(columns=non_null_cols[:2], unique=True, severity="critical"))
        elif len(col_names) >= 2:
            keys.append(KeyGuarantee(columns=col_names[:2], unique=True, severity="critical"))

    freshness = None
    if load_ts := inventory_snapshot.get("load_ts_column"):
        freshness = FreshnessGuarantee(column=load_ts, max_age="PT24H", severity="warn")

    completeness = []
    for col in columns:
        if not col.get("nullable", True):
            completeness.append(CompletenessGuarantee(column=col["name"], min_pct=100.0, severity="warn"))

    guarantees = Guarantees(
        schema=schema_g,
        keys=keys,
        freshness=freshness,
        completeness=completeness,
    )

    return Contract(
        product=product,
        dataset=dataset_name,
        owned_by="platform",
        owners=["grp:data-platform"],
        version="1.0.0",
        lifecycle="draft",
        guarantees=guarantees,
    )

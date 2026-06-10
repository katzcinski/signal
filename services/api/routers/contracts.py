# [CONTRACT-SQL-FREE] — all contract writes go through validator (G1)
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from ..auth.provider import PrincipalDep
from ..deps import StoreDep, get_inventory
from ..schemas.contract_schemas import CompileOut, ContractIn, ContractOut
from ..settings import get_settings

router = APIRouter(prefix="/api/contracts", tags=["contracts"])


def _contracts_dir() -> Path:
    return Path(get_settings().contracts_dir)


def _load_contract(product: str) -> dict[str, Any] | None:
    path = _contracts_dir() / f"{product}.yml"
    if not path.exists():
        return None
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _save_contract(product: str, data: dict[str, Any], principal_name: str) -> None:
    _contracts_dir().mkdir(parents=True, exist_ok=True)
    path = _contracts_dir() / f"{product}.yml"
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


@router.get("", response_model=list[ContractOut])
def list_contracts(
    lifecycle: str | None = Query(default=None),
    store: StoreDep = ...,
):
    contracts_dir = _contracts_dir()
    if not contracts_dir.exists():
        return []
    result = []
    for path in sorted(contracts_dir.glob("*.yml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not data:
            continue
        if lifecycle and data.get("lifecycle") != lifecycle:
            continue
        compliance_row = store.get_compliance(data.get("product") or path.stem)
        result.append(
            ContractOut(
                product=data.get("product") or path.stem,
                dataset=data.get("dataset", ""),
                owned_by=data.get("owned_by", "platform"),
                owners=data.get("owners") or [],
                version=str(data.get("version", "0.1.0")),
                lifecycle=data.get("lifecycle", "draft"),
                guarantees=data.get("guarantees") or {},
                compliance=compliance_row["compliance"] if compliance_row else None,
            )
        )
    return result


@router.get("/{product}", response_model=ContractOut)
def get_contract(product: str, store: StoreDep = ...):
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")
    compliance_row = store.get_compliance(product)
    return ContractOut(
        product=data.get("product") or product,
        dataset=data.get("dataset", ""),
        owned_by=data.get("owned_by", "platform"),
        owners=data.get("owners") or [],
        version=str(data.get("version", "0.1.0")),
        lifecycle=data.get("lifecycle", "draft"),
        guarantees=data.get("guarantees") or {},
        compliance=compliance_row["compliance"] if compliance_row else None,
    )


@router.put("/{product}", response_model=ContractOut)
def update_contract(
    product: str,
    principal: PrincipalDep,
    body: ContractIn = Body(...),
    store: StoreDep = ...,
):
    """[CONTRACT-SQL-FREE] [AUTHZ] Update a contract — Gate G1 enforced here."""
    from dq_core.contract.validator import validate_contract

    data = body.model_dump()

    # [AUTHZ] — can the principal write this contract?
    if not principal.can_write_contract(data.get("owned_by", "platform"), data.get("owners") or []):
        raise HTTPException(status_code=403, detail="Insufficient permissions to write this contract.")

    # [CONTRACT-SQL-FREE] Gate G1
    errors = validate_contract(data)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Contract validation failed (Gate G1)", "errors": errors},
        )

    _save_contract(product, data, principal.name)

    # Update contract_index (A3)
    _update_index(store, product, data)

    compliance_row = store.get_compliance(product)
    return ContractOut(**data, compliance=compliance_row["compliance"] if compliance_row else None)


@router.post("/{product}/seed", response_model=ContractOut)
def seed_contract(
    product: str,
    principal: PrincipalDep,
    inventory: list[dict] = Depends(get_inventory),
    store: StoreDep = ...,
):
    """Seed a draft contract from the inventory object (WS2-2)."""
    from dq_core.contract.seed import seed_from_inventory

    obj = next(
        (o for o in inventory if (o.get("id") or o.get("technicalName") or o.get("name")) == product),
        None,
    )
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object {product!r} not found in inventory")

    data = seed_from_inventory(obj)
    _save_contract(product, data, principal.name)
    _update_index(store, product, data)

    return ContractOut(**data)


@router.post("/{product}/diff")
def diff_contract(
    product: str,
    body: ContractIn = Body(...),
):
    """Compare submitted contract against current active version (WS2-4)."""
    from dq_core.contract.diff import diff_contracts, is_breaking

    current = _load_contract(product)
    if not current:
        return {"breaking": False, "entries": [], "message": "No existing contract"}

    entries = diff_contracts(current, body.model_dump())
    return {
        "breaking": is_breaking(entries),
        "entries": [
            {"kind": e.kind, "path": e.path, "old": e.old_value, "new": e.new_value}
            for e in entries
        ],
    }


@router.post("/{product}/compile", response_model=CompileOut)
def compile_contract(
    product: str,
    principal: PrincipalDep,
    dry_run: bool = Query(default=False),
    store: StoreDep = ...,
):
    """[DETERMINISM] Compile contract → CheckDefs. [CONTRACT-SQL-FREE]"""
    import hashlib as _hashlib

    from dq_core.contract.compiler import compile_contract as _compile
    from dq_core.engine.check_engine import dataset_config_to_yaml
    from dq_core.library.check_library import load_library
    from ..settings import get_settings

    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")

    settings_obj = get_settings()
    schema_override = ""  # [SCHEMA-MAP] bound at run-time via environment

    config = _compile(data, schema_override=schema_override)

    # [DETERMINISM] hash computed on pre-merge compiled output — A4
    contract_hash = _hashlib.sha256(
        yaml.safe_dump(data, sort_keys=True).encode()
    ).hexdigest()[:16]
    library_version = str(load_library().get("version", "1"))
    det_hash = _hashlib.sha256(f"{contract_hash}:{library_version}".encode()).hexdigest()[:16]

    # Existing-wins merge: keep handwritten checks when names collide
    checks_dir = Path(settings_obj.checks_dir) / product
    existing_checks_path = checks_dir / "checks.yml"
    conflicts: list[str] = []
    if existing_checks_path.exists():
        try:
            existing_data = yaml.safe_load(existing_checks_path.read_text(encoding="utf-8")) or {}
            existing_by_name = {c["name"]: c for c in (existing_data.get("checks") or [])}
            merged = []
            for c in config.checks:
                if c.name in existing_by_name:
                    conflicts.append(c.name)
                    ec = existing_by_name[c.name]
                    from dq_core.engine.models import CheckDef
                    merged.append(CheckDef(
                        name=ec["name"], sql=ec.get("sql", c.sql),
                        expect=ec.get("expect", c.expect), severity=ec.get("severity", c.severity),
                        type=ec.get("type", c.type), unit=ec.get("unit", c.unit),
                        owned_by=ec.get("owned_by", c.owned_by),
                    ))
                else:
                    merged.append(c)
            config.checks = merged
        except Exception:
            pass  # if existing file is malformed, use compiled checks as-is

    yaml_out = dataset_config_to_yaml(config)

    if not dry_run:
        checks_dir.mkdir(parents=True, exist_ok=True)
        existing_checks_path.write_text(yaml_out, encoding="utf-8")

    return CompileOut(
        product=product,
        dataset=config.dataset,
        checks=[
            {
                "name": c.name,
                "sql": c.sql,
                "expect": c.expect,
                "severity": c.severity,
                "type": c.type,
                "unit": c.unit,
                "owned_by": c.owned_by,
            }
            for c in config.checks
        ],
        yaml_preview=yaml_out,
        conflicts=conflicts,
        determinism_hash=det_hash,
    )


def _update_index(store, product: str, data: dict) -> None:
    import sqlite3
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn = sqlite3.connect(store.db_path, check_same_thread=False)
        conn.execute(
            """INSERT OR REPLACE INTO contract_index
               (product, lifecycle, owned_by, version, head_hash, updated_at)
               VALUES (?,?,?,?,?,?)""",
            (
                product,
                data.get("lifecycle", "draft"),
                data.get("owned_by", "platform"),
                str(data.get("version", "0.1.0")),
                hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16],
                now,
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


@router.post("/{product}/export/bdc")
def export_bdc(product: str, principal: PrincipalDep):
    """Generate CSN + ORD artifact fragments for BDC integration. (WS5-4)

    Einseitig (E1): files are returned as JSON for manual deployment.
    Never writes to DB or catalog.
    """
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")

    guarantees = data.get("guarantees") or {}
    dataset = data.get("dataset", product)

    # CSN fragment: custom namespace annotations per column/guarantee
    csn_elements: dict = {}
    schema_g = guarantees.get("schema") or {}
    for col in (schema_g.get("columns") or []):
        csn_elements[col] = {"@DQ.guarantee": "schema", "@DQ.product": product}
    for comp in (guarantees.get("completeness") or []):
        col = comp.get("column", "")
        if col:
            csn_elements.setdefault(col, {})
            csn_elements[col]["@DQ.completeness"] = comp.get("min_pct", 99.0)
    for ref in (guarantees.get("referential") or []):
        for fk_col in (ref.get("fk") or []):
            csn_elements.setdefault(fk_col, {})
            csn_elements[fk_col]["@DQ.referential"] = ref.get("parent", "")

    csn_fragment = {
        "$version": "2.0",
        "definitions": {
            dataset: {
                "kind": "entity",
                "@DQ.product": product,
                "@DQ.lifecycle": data.get("lifecycle", "draft"),
                "elements": csn_elements,
            }
        },
    }

    # ORD fragment: custom labels for product-level guarantees
    guarantee_labels: list[str] = []
    if guarantees.get("keys"):
        guarantee_labels.append("keys:unique")
    if guarantees.get("freshness"):
        freshness = guarantees["freshness"]
        guarantee_labels.append(f"freshness:{freshness.get('max_age','')}")
    if guarantees.get("volume"):
        guarantee_labels.append("volume:baseline")
    if guarantees.get("schema"):
        mode = (guarantees["schema"].get("mode") or "open")
        guarantee_labels.append(f"schema:{mode}")

    ord_fragment = {
        "openResourceDiscovery": "1.9",
        "consumptionBundles": [
            {
                "ordId": f"sap.dq:{product}:consumptionBundle:dq:v1",
                "title": f"DQ Contract — {dataset}",
                "description": f"Data quality guarantees for {dataset}",
                "labels": {
                    "dq:product": [product],
                    "dq:lifecycle": [data.get("lifecycle", "draft")],
                    "dq:guarantee": guarantee_labels,
                    "dq:owned_by": [data.get("owned_by", "platform")],
                },
            }
        ],
    }

    return {"csn_fragment": csn_fragment, "ord_fragment": ord_fragment}

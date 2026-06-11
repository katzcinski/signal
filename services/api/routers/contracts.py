# [CONTRACT-SQL-FREE] — all contract writes go through validator (G1)
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from ..auth.provider import PrincipalDep, can_write_contract_data
from ..deps import StoreDep, get_inventory
from ..schemas.contract_schemas import CompileOut, ContractIn, ContractOut
from ..settings import get_settings

router = APIRouter(prefix="/api/contracts", tags=["contracts"])

# S2/S-11: product wird Dateiname und SQL-Identifier — gleiche Policy wie Spalten.
_SAFE_PRODUCT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _validate_product(product: str) -> str:
    if not _SAFE_PRODUCT.match(product or ""):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid product name {product!r} (allowed: ^[A-Za-z_][A-Za-z0-9_]*$)",
        )
    return product


def _contracts_dir() -> Path:
    return Path(get_settings().contracts_dir)


def _contract_path(product: str) -> Path:
    """Return the on-disk path for a contract, tolerating .yaml and .yml.

    Prefers an existing file (whatever its extension); falls back to .yaml
    for new writes so seeded `<product>.yaml` files stay the source of truth.
    """
    base = _contracts_dir()
    for ext in (".yaml", ".yml"):
        candidate = base / f"{product}{ext}"
        if candidate.exists():
            return candidate
    return base / f"{product}.yaml"


def _load_contract(product: str) -> dict[str, Any] | None:
    path = _contract_path(product)
    if not path.exists():
        return None
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _save_contract(product: str, data: dict[str, Any]) -> None:
    _contracts_dir().mkdir(parents=True, exist_ok=True)
    path = _contract_path(product)
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def _active_snapshot_path(product: str) -> Path:
    """Certified-version snapshot used as the diff baseline for approvals."""
    return _contracts_dir() / f"{product}.active.yml"


def _require_write(principal, existing: dict[str, Any] | None) -> None:
    """[AUTHZ] S-2: Entscheidung anhand des bestehenden Contracts, nie des Bodys."""
    if not can_write_contract_data(principal, existing):
        raise HTTPException(status_code=403, detail="Insufficient permissions for this contract.")


def _contract_out(store, product: str, data: dict[str, Any]) -> ContractOut:
    compliance_row = store.get_compliance(product)
    return ContractOut(
        product=data.get("product") or product,
        dataset=data.get("dataset", ""),
        owned_by=data.get("owned_by", "platform"),
        owners=data.get("owners") or [],
        version=str(data.get("version", "0.1.0")),
        lifecycle=data.get("lifecycle", "draft"),
        description=str(data.get("description") or ""),
        guarantees=data.get("guarantees") or {},
        compliance=compliance_row["compliance"] if compliance_row else None,
    )


@router.get("", response_model=list[ContractOut])
def list_contracts(
    lifecycle: str | None = Query(default=None),
    store: StoreDep = ...,
):
    contracts_dir = _contracts_dir()
    if not contracts_dir.exists():
        return []
    result = []
    paths = sorted(p for p in contracts_dir.glob("*.y*ml") if not p.name.endswith(".active.yml"))
    for path in paths:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not data:
            continue
        if lifecycle and data.get("lifecycle") != lifecycle:
            continue
        result.append(_contract_out(store, data.get("product") or path.stem, data))
    return result


@router.get("/{product}", response_model=ContractOut)
def get_contract(product: str, store: StoreDep = ...):
    _validate_product(product)
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")
    return _contract_out(store, product, data)


@router.put("/{product}", response_model=ContractOut)
def update_contract(
    product: str,
    principal: PrincipalDep,
    body: ContractIn = Body(...),
    store: StoreDep = ...,
):
    """[CONTRACT-SQL-FREE] [AUTHZ] Update a contract — Gate G1 enforced here.

    Lifecycle ist kein Eingabefeld: das Ergebnis eines PUT ist IMMER ein Draft.
    Ein PUT auf einen aktiven Contract erzeugt damit ein Draft-Amendment — die
    zertifizierte Version bleibt als `.active.yml`-Snapshot die G3-Diff-Basis,
    bis ein erneutes Approve sie ersetzt.
    """
    from dq_core.contract.validator import validate_contract

    _validate_product(product)
    existing = _load_contract(product)

    # [AUTHZ] — S-2: gegen den bestehenden Contract entscheiden, nicht den Body.
    _require_write(principal, existing)

    data = body.model_dump()
    data["lifecycle"] = "draft"

    # [CONTRACT-SQL-FREE] Gate G1
    errors = validate_contract(data)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Contract validation failed (Gate G1)", "errors": errors},
        )

    _save_contract(product, data)
    _update_index(store, product, data)
    return _contract_out(store, product, data)


@router.post("/{product}/seed", response_model=ContractOut)
def seed_contract(
    product: str,
    principal: PrincipalDep,
    inventory: list[dict] = Depends(get_inventory),
    store: StoreDep = ...,
):
    """[AUTHZ] Seed a draft contract from the inventory object (WS2-2)."""
    from dq_core.contract.seed import seed_from_inventory

    _validate_product(product)
    existing = _load_contract(product)
    _require_write(principal, existing)
    if existing and existing.get("lifecycle") not in (None, "draft"):
        raise HTTPException(
            status_code=409,
            detail=f"Contract {product!r} is {existing.get('lifecycle')!r} — seeding would overwrite a certified contract.",
        )

    obj = next(
        (o for o in inventory if (o.get("id") or o.get("technicalName") or o.get("name")) == product),
        None,
    )
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object {product!r} not found in inventory")

    data = seed_from_inventory(obj)
    _save_contract(product, data)
    _update_index(store, product, data)
    return _contract_out(store, product, data)


@router.post("/{product}/diff")
def diff_contract(
    product: str,
    body: ContractIn = Body(...),
):
    """Compare submitted contract against current version (WS2-4)."""
    from dq_core.contract.diff import diff_contracts, is_breaking

    _validate_product(product)
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


def _semver_major(version: str) -> int:
    try:
        return int(str(version).split(".")[0])
    except (ValueError, IndexError):
        return 0


@router.post("/{product}/approve", response_model=ContractOut)
def approve_contract(
    product: str,
    principal: PrincipalDep,
    store: StoreDep = ...,
):
    """[AUTHZ] Promote a draft contract to active (WS2-6 / M2).

    Server-side breaking guard (G3): if the change is breaking versus the last
    certified version, a SemVer **major** bump is required.
    """
    from dq_core.contract.diff import diff_contracts, is_breaking
    from dq_core.contract.validator import validate_contract

    _validate_product(product)
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")
    if data.get("lifecycle") != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"Contract {product!r} is {data.get('lifecycle')!r}, only drafts can be approved.",
        )

    # [AUTHZ] — Entscheidung anhand des Contracts auf Platte.
    _require_write(principal, data)

    # G1 auch auf dem Disk-Pfad: nie einen invaliden Contract zertifizieren.
    errors = validate_contract(data)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Contract validation failed (Gate G1)", "errors": errors},
        )

    # G3 — breaking change must carry a major version bump.
    snapshot_path = _active_snapshot_path(product)
    if snapshot_path.exists():
        prior = yaml.safe_load(snapshot_path.read_text(encoding="utf-8")) or {}
        entries = diff_contracts(prior, data)
        if is_breaking(entries) and _semver_major(data.get("version", "0")) <= _semver_major(prior.get("version", "0")):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Breaking change requires a major version bump (Gate G3).",
                    "from_version": prior.get("version"),
                    "to_version": data.get("version"),
                    "breaking": [
                        {"kind": e.kind, "path": e.path, "old": e.old_value, "new": e.new_value}
                        for e in entries if e.breaking
                    ],
                },
            )

    data["lifecycle"] = "active"
    _save_contract(product, data)
    snapshot_path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    _update_index(store, product, data)

    # One commit per approve. Fehler werden sichtbar gemacht (S-12), aber ein
    # fehlendes Git-Repo (lokaler Modus mit externem CONTRACTS_DIR) ist legal.
    commit_error = None
    try:
        from ..git_repo import GitRepo
        GitRepo(get_settings().contracts_dir, get_settings().git_remote).write_contract(
            product,
            yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
            principal.name,
            f"{principal.sub}@dq-cockpit",
            f"Approve contract {product} v{data.get('version')}",
        )
    except Exception as exc:  # noqa: BLE001
        commit_error = str(exc)

    # Compliance starts 'unknown' until the first run of the active version.
    if not store.get_compliance(product):
        store.set_compliance(product, str(data.get("version", "")), "unknown", "")

    out = _contract_out(store, product, data)
    if commit_error:
        # Approve gilt (Datei + Snapshot geschrieben), aber der Commit schlug fehl —
        # niemals stillschweigend verschlucken.
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Contract approved, but the Git commit failed — repository intervention required.",
                "git_error": commit_error,
                "contract": out.model_dump(),
            },
        )
    return out


@router.post("/{product}/deprecate", response_model=ContractOut)
def deprecate_contract(
    product: str,
    principal: PrincipalDep,
    store: StoreDep = ...,
):
    """[AUTHZ] Retire an active contract (WS2-6)."""
    _validate_product(product)
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")
    if data.get("lifecycle") != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Only active contracts can be deprecated (got {data.get('lifecycle')!r}).",
        )
    _require_write(principal, data)

    data["lifecycle"] = "deprecated"
    _save_contract(product, data)
    _update_index(store, product, data)
    return _contract_out(store, product, data)


@router.post("/{product}/compile", response_model=CompileOut)
def compile_contract(
    product: str,
    principal: PrincipalDep,
    dry_run: bool = Query(default=False),
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    """[DETERMINISM] [SCHEMA-MAP] Compile contract → CheckDefs.

    G1: der Contract wird auch auf dem Disk-Pfad validiert (kein Schmuggel an
    PUT vorbei). G2: '{schema}' bleibt als Platzhalter im Output. Non-dry-run
    erfordert lifecycle=active (WS3-2) und Schreibrecht.
    """
    from dq_core.contract.compiler import compile_contract as _compile
    from dq_core.contract.compiler import compiler_hash, CompileError
    from dq_core.contract.validator import validate_contract
    from dq_core.engine.check_engine import dataset_config_to_yaml
    from dq_core.engine.models import CheckDef
    from dq_core.library.check_library import load_library

    _validate_product(product)
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")

    # [CONTRACT-SQL-FREE] G1 gilt für jeden Ingestion-Pfad (S-3).
    errors = validate_contract(data)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Contract validation failed (Gate G1)", "errors": errors},
        )

    if not dry_run:
        _require_write(principal, data)
        if data.get("lifecycle") != "active":
            raise HTTPException(
                status_code=409,
                detail=f"Compile (persist) requires lifecycle=active, got {data.get('lifecycle')!r}. Use dry_run=true.",
            )

    # S2 Stufe 2: Spalten-Existenzprüfung gegen das Inventar, falls vorhanden.
    inventory_columns: set[str] | None = None
    dataset_name = data.get("dataset") or product
    obj = next(
        (o for o in inventory if (o.get("id") or o.get("technicalName") or o.get("name")) == dataset_name),
        None,
    )
    if obj:
        cols = {
            c.get("name") or c.get("technicalName")
            for c in (obj.get("columns") or obj.get("properties") or [])
        }
        inventory_columns = {c for c in cols if c} or None

    try:
        config = _compile(data, inventory_columns=inventory_columns)
    except CompileError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if not config.checks:
        raise HTTPException(
            status_code=422,
            detail="Contract compiles to zero checks — add at least one guarantee.",
        )

    contract_hash = hashlib.sha256(
        yaml.safe_dump(data, sort_keys=True).encode()
    ).hexdigest()[:16]
    library_version = str(load_library().get("version", "1"))
    det_hash = compiler_hash(data)

    # Existing-wins merge: keep handwritten checks when names collide
    settings_obj = get_settings()
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

    # [DETERMINISM] A4: Hashes stehen IM Artefakt, nicht nur in der Response.
    header = (
        f"# contract_hash: {contract_hash}\n"
        f"# library_version: {library_version}\n"
        f"# compiler_hash: {det_hash}\n"
    )
    yaml_out = header + dataset_config_to_yaml(config)

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
    _validate_product(product)
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


@router.get("/{product}/export/odcs")
def export_odcs(product: str):
    """R5-1: deterministic ODCS 3.1 export. [A1] compliance stays out."""
    _validate_product(product)
    data = _load_contract(product)
    if not data:
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")
    from dq_core.contract.odcs_export import to_odcs
    return to_odcs(data)


@router.get("/{product}/sla")
def get_sla(
    product: str,
    window_days: int = Query(default=30, ge=1, le=365),
    store: StoreDep = ...,
):
    """R4-3: % of the window the contract spent non-breached (status-page style)."""
    _validate_product(product)
    if not _load_contract(product):
        raise HTTPException(status_code=404, detail=f"Contract {product!r} not found")
    return store.get_sla(product, window_days)

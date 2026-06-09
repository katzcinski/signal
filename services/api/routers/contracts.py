import os
import sys
import yaml
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

from services.api.deps import get_store, get_principal
from services.api.schemas.contracts import (
    ContractIndexSchema, ContractWriteRequest, SeedRequest,
    DiffRequest, CompileResponse, ProposalSchema
)
from services.api.git_repo import GitRepo
from services.api.settings import settings
from services.api.auth.oidc import can_write_contract

router = APIRouter(tags=["contracts"])

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages"))


def _get_git_repo() -> GitRepo:
    return GitRepo(contracts_dir=settings.CONTRACTS_DIR, remote=settings.GIT_REMOTE)


def _load_contract_from_store_or_git(product: str, store, repo: GitRepo):
    content = repo.read_contract(product)
    if not content:
        return None
    from dq_core.contract.model import load_contract
    import tempfile, pathlib
    with tempfile.NamedTemporaryFile(suffix=".yml", mode="w", delete=False) as f:
        f.write(content)
        tmp = f.name
    try:
        return load_contract(tmp)
    finally:
        os.unlink(tmp)


@router.get("/contracts", response_model=List[ContractIndexSchema])
def list_contracts(store=Depends(get_store)):
    rows = store.list_contracts()
    result = []
    for r in rows:
        compliance = store.get_compliance(r["product"])
        r["compliance"] = compliance["compliance"] if compliance else "unknown"
        result.append(r)
    return result


@router.get("/contracts/{product}")
def get_contract(product: str, store=Depends(get_store)):
    repo = _get_git_repo()
    content = repo.read_contract(product)
    if not content:
        raise HTTPException(status_code=404, detail=f"Contract '{product}' not found")
    return yaml.safe_load(content)


@router.put("/contracts/{product}", status_code=200)
def update_contract(
    product: str,
    req: ContractWriteRequest,
    store=Depends(get_store),
    principal=Depends(get_principal),
):
    from dq_core.contract.model import Contract, Guarantees, contract_to_dict
    from dq_core.contract.validator import ContractValidator

    repo = _get_git_repo()
    existing_content = repo.read_contract(product)

    # AUTHZ check
    if not can_write_contract(principal, req.model_dump()):
        raise HTTPException(status_code=403, detail="Not authorized to write this contract")

    # Only allow edits when lifecycle=draft (or admin)
    if existing_content:
        existing = yaml.safe_load(existing_content)
        if existing.get("lifecycle") not in ("draft",) and "admin" not in principal.roles:
            raise HTTPException(status_code=409, detail="Contract is not in draft state")

    from dq_core.contract.model import _parse_guarantees
    contract = Contract(
        product=req.product, dataset=req.dataset, owned_by=req.owned_by,
        owners=req.owners, version=req.version, lifecycle=req.lifecycle,
        guarantees=_parse_guarantees({"guarantees": req.guarantees}),
    )
    errors = ContractValidator().validate(contract)
    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})

    from dq_core.contract.model import contract_to_dict
    content = yaml.dump(contract_to_dict(contract), default_flow_style=False, sort_keys=False)
    commit_hash = repo.write_contract(
        product=product, content=content,
        author_name=principal.name, author_email=f"{principal.sub}@local",
        message=f"Update contract {product} (lifecycle={req.lifecycle})",
    )
    store.upsert_contract_index(
        product=product, lifecycle=req.lifecycle, owned_by=req.owned_by,
        version=req.version, head_hash=commit_hash,
    )
    return {"product": product, "commit": commit_hash}


@router.post("/contracts/{product}/seed")
def seed_contract(product: str, req: SeedRequest, store=Depends(get_store)):
    from dq_core.contract.seed import seed_contract as do_seed
    from dq_core.contract.model import contract_to_dict

    inventory = {}
    if os.path.exists(settings.INVENTORY_FILE):
        with open(settings.INVENTORY_FILE) as f:
            import json
            all_inventory = json.load(f)
            if isinstance(all_inventory, list):
                for item in all_inventory:
                    if item.get("dataset") == req.dataset or item.get("name") == req.dataset:
                        inventory = item
                        break
            else:
                inventory = all_inventory.get(req.dataset, {})

    inventory["dataset"] = req.dataset
    contract = do_seed(inventory, req.dataset, product_name=req.product or product)
    return contract_to_dict(contract)


@router.post("/contracts/{product}/diff")
def diff_contract(product: str, req: DiffRequest, store=Depends(get_store)):
    from dq_core.contract.diff import ContractDiff
    from dq_core.contract.model import _parse_guarantees, Contract

    repo = _get_git_repo()
    old_contract = _load_contract_from_store_or_git(product, store, repo)
    if not old_contract:
        raise HTTPException(status_code=404, detail=f"Current contract '{product}' not found")

    nd = req.new_contract
    new_contract = Contract(
        product=nd.get("product", product), dataset=nd.get("dataset", product),
        owned_by=nd.get("owned_by", ""), owners=nd.get("owners", []),
        version=nd.get("version", "1.0.0"), lifecycle=nd.get("lifecycle", "draft"),
        guarantees=_parse_guarantees(nd),
    )
    result = ContractDiff().diff(old_contract, new_contract)
    return {
        "is_breaking": result.is_breaking,
        "requires_major_bump": result.requires_major_bump,
        "breaking_changes": result.breaking_changes,
        "non_breaking_changes": result.non_breaking_changes,
    }


@router.post("/contracts/{product}/approve")
def approve_contract(product: str, store=Depends(get_store), principal=Depends(get_principal)):
    from dq_core.contract.model import load_contract, contract_to_dict
    from dq_core.contract.compiler import ContractCompiler
    from dq_core.library.check_library import CheckLibrary

    repo = _get_git_repo()
    content = repo.read_contract(product)
    if not content:
        raise HTTPException(status_code=404, detail=f"Contract '{product}' not found")

    contract_data = yaml.safe_load(content)
    if not can_write_contract(principal, contract_data):
        raise HTTPException(status_code=403, detail="Not authorized to approve this contract")

    if contract_data.get("lifecycle") != "draft":
        raise HTTPException(status_code=409, detail="Only draft contracts can be approved")

    # Check breaking diff: compare with currently active version
    # (simplified: just promote to active here)
    contract_data["lifecycle"] = "active"
    new_content = yaml.dump(contract_data, default_flow_style=False, sort_keys=False)
    commit_hash = repo.write_contract(
        product=product, content=new_content,
        author_name=principal.name, author_email=f"{principal.sub}@local",
        message=f"Approve contract {product} v{contract_data.get('version', '?')}",
    )
    store.upsert_contract_index(
        product=product, lifecycle="active", owned_by=contract_data.get("owned_by", ""),
        version=contract_data.get("version", "1.0.0"), head_hash=commit_hash,
    )
    return {"product": product, "lifecycle": "active", "commit": commit_hash}


@router.post("/contracts/{product}/deprecate")
def deprecate_contract(product: str, store=Depends(get_store), principal=Depends(get_principal)):
    repo = _get_git_repo()
    content = repo.read_contract(product)
    if not content:
        raise HTTPException(status_code=404, detail=f"Contract '{product}' not found")

    contract_data = yaml.safe_load(content)
    if not can_write_contract(principal, contract_data):
        raise HTTPException(status_code=403, detail="Not authorized to deprecate this contract")

    contract_data["lifecycle"] = "deprecated"
    new_content = yaml.dump(contract_data, default_flow_style=False, sort_keys=False)
    commit_hash = repo.write_contract(
        product=product, content=new_content,
        author_name=principal.name, author_email=f"{principal.sub}@local",
        message=f"Deprecate contract {product}",
    )
    store.upsert_contract_index(
        product=product, lifecycle="deprecated", owned_by=contract_data.get("owned_by", ""),
        version=contract_data.get("version", "1.0.0"), head_hash=commit_hash,
    )
    return {"product": product, "lifecycle": "deprecated", "commit": commit_hash}


@router.post("/contracts/{product}/compile")
def compile_contract(product: str, dry_run: bool = False, store=Depends(get_store)):
    from dq_core.contract.compiler import ContractCompiler
    from dq_core.library.check_library import CheckLibrary
    from dq_core.contract.model import _parse_guarantees, Contract

    repo = _get_git_repo()
    content = repo.read_contract(product)
    if not content:
        raise HTTPException(status_code=404, detail=f"Contract '{product}' not found")

    contract_data = yaml.safe_load(content)
    contract = Contract(
        product=contract_data["product"], dataset=contract_data["dataset"],
        owned_by=contract_data.get("owned_by", ""), owners=contract_data.get("owners", []),
        version=contract_data.get("version", "1.0.0"),
        lifecycle=contract_data.get("lifecycle", "draft"),
        guarantees=_parse_guarantees(contract_data),
    )

    compiler = ContractCompiler(CheckLibrary())
    result = compiler.compile(contract)

    checks_data = {"version": result["header_hash"], "checks": [
        {
            "name": c.name, "sql": c.sql, "expect": c.expect,
            "severity": c.severity, "type": c.type, "enabled": c.enabled,
            "description": c.description,
        }
        for c in result["checks"]
    ]}
    checks_yaml = yaml.dump(checks_data, default_flow_style=False, sort_keys=False)

    if not dry_run and contract_data.get("lifecycle") == "active":
        os.makedirs("checks", exist_ok=True)
        with open(f"checks/{contract_data['dataset']}.yml", "w") as f:
            f.write(checks_yaml)

    return CompileResponse(
        checks_yaml=checks_yaml,
        header_hash=result["header_hash"],
        conflicts=result["conflicts"],
    )


@router.get("/proposals")
def list_proposals(status: str = "open", store=Depends(get_store)):
    return store.list_proposals(status=status)


@router.post("/proposals/{proposal_id}/accept")
def accept_proposal(proposal_id: str, store=Depends(get_store), principal=Depends(get_principal)):
    store.update_proposal_status(proposal_id, "accepted")
    return {"status": "accepted"}


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal(proposal_id: str, store=Depends(get_store), principal=Depends(get_principal)):
    store.update_proposal_status(proposal_id, "rejected")
    return {"status": "rejected"}

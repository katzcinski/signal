from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..auth.provider import PrincipalDep
from ..deps import StoreDep
from ..schemas.proposal_schemas import ProposalOut

router = APIRouter(prefix="/api/proposals", tags=["proposals"])


@router.get("", response_model=list[ProposalOut])
def list_proposals(
    dataset: str | None = Query(default=None),
    store: StoreDep = ...,
):
    """Mine proposals from all datasets (or a specific one)."""
    from dq_core.obs.miner import ProposalMiner

    all_runs = store.get_all_runs(limit=10)
    datasets = list({r["dataset"] for r in all_runs})
    if dataset:
        datasets = [d for d in datasets if d == dataset]

    miner = ProposalMiner(store)
    all_proposals = []
    for ds in datasets:
        proposals = miner.mine(ds)
        all_proposals.extend(proposals)

    return [
        ProposalOut(
            id=p.id,
            product=p.product,
            check_name=p.check_name,
            current_expect=p.current_expect,
            proposed_expect=p.proposed_expect,
            rationale=p.rationale,
            confidence=p.confidence,
            stats=p.stats,
            status=p.status,
            created_at=p.created_at,
        )
        for p in all_proposals
    ]


@router.post("/{proposal_id}/accept")
def accept_proposal(
    proposal_id: str,
    principal: PrincipalDep,
    store: StoreDep = ...,
):
    """Accept a proposal — creates a draft contract amendment. No auto-apply (WS5-2)."""
    import yaml
    from pathlib import Path
    from ..settings import get_settings

    # Re-mine to find the proposal (proposals are not persisted in DB yet)
    all_runs = store.get_all_runs(limit=10)
    datasets = list({r["dataset"] for r in all_runs})

    from dq_core.obs.miner import ProposalMiner
    miner = ProposalMiner(store)
    target_proposal = None
    for ds in datasets:
        for p in miner.mine(ds):
            if p.id == proposal_id:
                target_proposal = p
                break
        if target_proposal:
            break

    if not target_proposal:
        raise HTTPException(status_code=404, detail=f"Proposal {proposal_id!r} not found")

    settings = get_settings()
    contracts_dir = Path(settings.contracts_dir)
    contract_path = contracts_dir / f"{target_proposal.product}.yml"

    if not contract_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No contract found for product {target_proposal.product!r}",
        )

    data = yaml.safe_load(contract_path.read_text(encoding="utf-8")) or {}

    # Add proposed_expect as a quality annotation in the guarantees — draft amendment only
    if "quality_proposals" not in data:
        data["quality_proposals"] = []
    data["quality_proposals"].append({
        "check_name": target_proposal.check_name,
        "proposed_expect": target_proposal.proposed_expect,
        "rationale": target_proposal.rationale,
        "accepted_by": principal.name,
    })
    # Downgrade to draft so it must be re-approved
    data["lifecycle"] = "draft"

    contract_path.write_text(
        yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8"
    )

    return {
        "id": proposal_id,
        "status": "accepted",
        "product": target_proposal.product,
        "message": (
            f"Draft amendment created for {target_proposal.product!r}. "
            "Contract reverted to 'draft' — review in Workbench and re-approve."
        ),
    }


@router.post("/{proposal_id}/reject")
def reject_proposal(proposal_id: str, principal: PrincipalDep):
    return {"id": proposal_id, "status": "rejected"}


@router.post("/{proposal_id}/snooze")
def snooze_proposal(proposal_id: str, principal: PrincipalDep):
    return {"id": proposal_id, "status": "snoozed"}

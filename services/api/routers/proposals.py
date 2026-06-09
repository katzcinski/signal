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
    """Accept a proposal — stubs the contract amendment (WS2 will wire this fully)."""
    return {"id": proposal_id, "status": "accepted", "message": "Proposal accepted (stub — contract amendment via /api/contracts WS2)"}


@router.post("/{proposal_id}/reject")
def reject_proposal(proposal_id: str, principal: PrincipalDep):
    return {"id": proposal_id, "status": "rejected"}


@router.post("/{proposal_id}/snooze")
def snooze_proposal(proposal_id: str, principal: PrincipalDep):
    return {"id": proposal_id, "status": "snoozed"}

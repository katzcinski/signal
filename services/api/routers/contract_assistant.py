"""Data-Contract draft assistant endpoint (pluggable model).

POST /api/contract-assistant/draft turns an aggregate profiling result into a
draft semantic Data Contract (YAML) for review, using whichever Claude model the
operator has configured (optionally overridden per request). The model output is
run through the deterministic ``validate_contract`` gate before it is returned —
the draft is never written to ``contracts/`` here (that stays the Workbench's
job), so G1 and the approval flow are untouched.

[AUTHZ] Authoring a contract is a steward+ action. [PII-GATE] Only aggregate
statistics are forwarded to the model (see ``contract_assistant``).
"""
from __future__ import annotations

import logging

import yaml
from fastapi import APIRouter, HTTPException

from .. import contract_assistant
from ..auth.provider import PrincipalDep
from ..deps import get_inventory, get_lineage
from ..schemas.contract_assistant_schemas import DraftRequest, DraftResponse
from ..settings import get_settings

logger = logging.getLogger("dq_cockpit.contract_assistant")

router = APIRouter(prefix="/api/contract-assistant", tags=["contract-assistant"])


@router.post("/draft", response_model=DraftResponse)
def draft(request: DraftRequest, principal: PrincipalDep):
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Drafting contracts requires steward role or higher.")

    settings = get_settings()
    if not contract_assistant.is_configured(settings):
        raise HTTPException(
            status_code=503,
            detail="Contract assistant is not configured (set CONTRACT_ASSISTANT_ENABLED and an API key).",
        )

    context = contract_assistant.build_context(
        product=request.product,
        kind=request.kind,
        profile=request.profile,
        inventory=get_inventory(),
        lineage=get_lineage(),
    )

    try:
        draft_yaml, model = contract_assistant.draft_contract(settings, context, model=request.model)
    except contract_assistant.ContractAssistantError as exc:
        # Detail is caller-safe; internals (if any) were already logged at the seam.
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    # Deterministic gate: parse + validate. A malformed or non-conforming draft
    # is surfaced as errors for review, not swallowed.
    parsed = None
    errors: list[str]
    try:
        loaded = yaml.safe_load(draft_yaml)
        if isinstance(loaded, dict):
            parsed = loaded
        else:
            errors = ["Model output did not parse to a YAML mapping."]
            return DraftResponse(
                product=request.product, model=model, draft_yaml=draft_yaml,
                parsed=None, valid=False, validation_errors=errors,
            )
    except yaml.YAMLError:
        return DraftResponse(
            product=request.product, model=model, draft_yaml=draft_yaml,
            parsed=None, valid=False, validation_errors=["Model output was not valid YAML."],
        )

    from dq_core.contract.validator import validate_contract

    errors = validate_contract(parsed)
    return DraftResponse(
        product=request.product,
        model=model,
        draft_yaml=draft_yaml,
        parsed=parsed,
        valid=not errors,
        validation_errors=errors,
    )

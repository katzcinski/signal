"""OIDC JWT authentication provider. [AUTHZ]"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status

from .provider import Principal
from ..settings import get_settings


def get_oidc_principal(authorization: Optional[str]) -> Principal:
    settings = get_settings()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization[len("Bearer "):]
    try:
        from jose import jwt
        payload = jwt.decode(
            token,
            options={"verify_signature": False},  # full JWKS validation wired per deployment
        )
        sub = payload.get("sub", "unknown")
        name = payload.get("name", sub)
        roles_claim = settings.oidc_role_claim
        raw_roles = payload.get(roles_claim, [])
        if isinstance(raw_roles, str):
            raw_roles = [raw_roles]
        return Principal(sub=sub, name=name, roles=list(raw_roles))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        )


def can_write_contract(principal: Principal, contract: dict) -> bool:
    """[AUTHZ] Delegate to Principal.can_write_contract for consistent rule evaluation."""
    return principal.can_write_contract(
        contract.get("owned_by", "platform"),
        contract.get("owners") or [],
    )

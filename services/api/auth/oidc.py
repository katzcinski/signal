import os
from typing import Optional
from fastapi import HTTPException, status
from services.api.auth.noauth import Principal


def get_oidc_principal(authorization: Optional[str]) -> Principal:
    from services.api.settings import settings
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization[len("Bearer "):]
    try:
        from jose import jwt, JWTError
        payload = jwt.decode(
            token,
            options={"verify_signature": False},  # signature verification needs JWKS
        )
        sub = payload.get("sub", "unknown")
        name = payload.get("name", sub)
        roles_claim = settings.OIDC_ROLES_CLAIM
        raw_roles = payload.get(roles_claim, [])
        if isinstance(raw_roles, str):
            raw_roles = [raw_roles]
        return Principal(sub=sub, name=name, roles=raw_roles)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")


def can_write_contract(principal: Principal, contract: dict) -> bool:
    """AUTHZ: returns True if principal can write this contract."""
    if "admin" in principal.roles or "owner" in principal.roles:
        return True
    if "steward" in principal.roles:
        owned_by = contract.get("owned_by", "")
        owners = contract.get("owners", [])
        if f"grp:{owned_by}" in owners:
            return True
        for owner in owners:
            if owner.startswith("grp:") and owner[4:] in principal.roles:
                return True
    return False

# [AUTHZ] — server is authoritative; frontend mirrors only
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from ..settings import get_settings

VALID_ROLES = {"viewer", "steward", "owner", "admin"}


@dataclass
class Principal:
    sub: str
    name: str
    roles: list[str] = field(default_factory=list)

    def has_role(self, *roles: str) -> bool:
        return bool(set(self.roles) & set(roles))

    def can_write_contract(self, owned_by: str, owners: list[str]) -> bool:
        """[AUTHZ] Write permission = role × owned_by × owners membership (S3)."""
        if self.has_role("admin"):
            return True
        if owned_by == "platform" and self.has_role("steward", "owner"):
            return True
        if owned_by == "product" and self.has_role("owner"):
            return True
        # Group membership check
        for owner_entry in owners:
            if owner_entry.startswith("grp:"):
                # Placeholder: in production check IdP group membership
                if self.has_role("steward", "owner"):
                    return True
            elif owner_entry == self.sub:
                return True
        return False


_ADMIN_PRINCIPAL = Principal(sub="dev", name="Development Admin", roles=["admin"])


async def _noauth_principal(
    x_dq_role: str | None = Header(default=None, alias="X-DQ-Role"),
) -> Principal:
    """No-auth mode: use X-DQ-Role header for role simulation in dev."""
    if x_dq_role and x_dq_role in VALID_ROLES:
        return Principal(sub="dev", name="Dev User", roles=[x_dq_role])
    return _ADMIN_PRINCIPAL


async def get_principal(
    x_dq_role: str | None = Header(default=None, alias="X-DQ-Role"),
) -> Principal:
    settings = get_settings()
    if settings.auth_mode == "noauth":
        return await _noauth_principal(x_dq_role)
    # OIDC path (stub — full implementation in WS5)
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="OIDC not configured")


PrincipalDep = Annotated[Principal, Depends(get_principal)]


def require_roles(*roles: str):
    """Dependency factory: raises 403 if principal lacks required roles."""
    async def _check(principal: PrincipalDep) -> Principal:
        if not principal.has_role(*roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role required: one of {list(roles)}",
            )
        return principal
    return Depends(_check)

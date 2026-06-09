import os
import yaml
from functools import lru_cache
from typing import Optional, Annotated

from fastapi import Depends, Header, HTTPException
from services.api.settings import settings


@lru_cache(maxsize=1)
def get_store():
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "packages"))
    from dq_core.store.sqlite_store import SQLiteStore
    return SQLiteStore(
        db_path=settings.DB_PATH,
        allow_diagnostics=settings.ALLOW_LOCAL_DIAGNOSTICS,
    )


def get_principal(authorization: Optional[str] = Header(default=None)):
    from services.api.auth.noauth import get_noauth_principal
    from services.api.auth.oidc import get_oidc_principal
    if settings.AUTH_MODE == "oidc":
        return get_oidc_principal(authorization)
    return get_noauth_principal()


def get_environment(name: str) -> Optional[dict]:
    if not settings.ENVIRONMENTS_FILE or not os.path.exists(settings.ENVIRONMENTS_FILE):
        return None
    with open(settings.ENVIRONMENTS_FILE) as f:
        envs = yaml.safe_load(f) or {}
    return envs.get(name)

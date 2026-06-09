from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Server
    bind_host: str = Field(default="127.0.0.1")  # S5: default loopback
    bind_port: int = Field(default=8000)
    debug: bool = Field(default=False)

    # Auth — S5: if noauth + 0.0.0.0, fail-closed at startup
    auth_mode: Literal["noauth", "oidc"] = Field(default="noauth")
    oidc_issuer: str = Field(default="")
    oidc_audience: str = Field(default="")
    oidc_role_claim: str = Field(default="roles")

    # Store
    store_backend: Literal["sqlite", "hana"] = Field(default="sqlite")
    sqlite_db: str = Field(default="signal.db")

    # Git / Contracts
    git_remote: str = Field(default="")
    contracts_dir: str = Field(default="contracts")
    checks_dir: str = Field(default="checks")

    # Data
    data_dir: str = Field(default="data")
    inventory_file: str = Field(default="data/inventory.json")
    lineage_file: str = Field(default="data/lineage.json")

    # Environments
    environments_file: str = Field(default="environments.yml")

    # Diagnostics PII gate (S1)
    allow_local_diagnostics: bool = Field(default=False)
    diagnostics_ttl_days: int = Field(default=7)

    # CORS
    cors_origins: list[str] = Field(default=["http://localhost:5173", "http://localhost:3000"])


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings

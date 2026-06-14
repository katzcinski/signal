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

    # Auth — S5: if noauth + non-loopback bind, fail-closed at startup
    auth_mode: Literal["noauth", "oidc"] = Field(default="noauth")
    oidc_issuer: str = Field(default="")
    oidc_audience: str = Field(default="")
    oidc_jwks_url: str = Field(default="")  # optional override; sonst Issuer-Discovery
    oidc_role_claim: str = Field(default="roles")
    oidc_groups_claim: str = Field(default="groups")
    # Claim-Wert → Cockpit-Rolle (viewer|steward|owner|admin), pro Engagement (O4)
    oidc_role_mapping: dict[str, str] = Field(default_factory=dict)

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

    # F5: Staleness threshold for inventory/lineage extract (days)
    extract_stale_days: int = Field(default=7)

    # Lokalmodus: Runs ohne konfiguriertes Environment laufen gegen den Mock.
    # In Kunden-Deployments MUSS dies false sein — dann erfordert jeder Run ein
    # Environment mit echter HANA-Verbindung (kein stiller Fail-Open, S-13).
    allow_mock_connection: bool = Field(default=True)

    # CORS
    cors_origins: list[str] = Field(default=["http://localhost:5173", "http://localhost:3000"])

    # Webhook (WS5-3) — breach notification
    webhook_url: str = Field(default="")
    webhook_allowlist: list[str] = Field(default=[])  # host patterns (regex), e.g. [".*\\.example\\.com"]
    # Notification routing (R4-2): owner → channel(s). Optional YAML file; when
    # absent, webhook_url acts as an implicit default target. Every target URL is
    # still validated against webhook_allowlist (no SSRF bypass via routing).
    notifications_file: str = Field(default="notifications.yml")

    # Datasphere API — data load status (R7)
    # base_url: e.g. https://mytenant.eu10.hcs.cloud.sap
    # token_url: defaults to {base_url}/oauth/token when empty
    datasphere_base_url: str = Field(default="")
    datasphere_client_id: str = Field(default="")
    datasphere_client_secret: str = Field(default="")
    datasphere_token_url: str = Field(default="")
    datasphere_space_id: str = Field(default="")
    # Tier-2 extraction: REST/OAuth catalog is the default source; set true to
    # also use the local @sap/datasphere-cli when available (richest CSN).
    datasphere_use_cli: bool = Field(default=False)


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings

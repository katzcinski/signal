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
    products_dir: str = Field(default="products")

    # Data
    data_dir: str = Field(default="data")
    inventory_file: str = Field(default="data/inventory.json")
    lineage_file: str = Field(default="data/lineage.json")

    # Environments
    environments_file: str = Field(default="environments.yml")
    secrets_file: str = Field(default="secrets.local.yml")

    # Diagnostics PII gate (S1)
    allow_local_diagnostics: bool = Field(default=False)
    diagnostics_ttl_days: int = Field(default=7)
    allow_profile_samples: bool = Field(default=False)
    profile_sample_columns: list[str] = Field(default=[])
    segment_value_columns: list[str] = Field(default=[])

    # F5: Staleness threshold for inventory/lineage extract (days)
    extract_stale_days: int = Field(default=7)

    # Lokalmodus: Runs ohne konfiguriertes Environment laufen gegen den Mock.
    # In Kunden-Deployments MUSS dies false sein — dann erfordert jeder Run ein
    # Environment mit echter HANA-Verbindung (kein stiller Fail-Open, S-13).
    allow_mock_connection: bool = Field(default=True)

    # Scheduler (Option E) — in-process poller for internal schedules. Opt-in:
    # off by default so the documented external-scheduler model is unchanged
    # unless an operator turns the poller on. Tick is the poll cadence in
    # seconds (how often due schedules are claimed), not the run interval.
    scheduler_enabled: bool = Field(default=False)
    scheduler_tick_seconds: int = Field(default=30, ge=5, le=3600)

    # CORS
    cors_origins: list[str] = Field(default=["http://localhost:5173", "http://localhost:3000"])

    # Webhook (WS5-3) — breach notification
    webhook_url: str = Field(default="")
    webhook_allowlist: list[str] = Field(default=[])  # host patterns (regex), e.g. [".*\\.example\\.com"]
    # Notification routing (R4-2): owner → channel(s). Optional YAML file; when
    # absent, webhook_url acts as an implicit default target. Every target URL is
    # still validated against webhook_allowlist (no SSRF bypass via routing).
    notifications_file: str = Field(default="notifications.yml")
    incident_cluster_window_minutes: int = Field(default=15, ge=1, le=1440)

    # Contract assistant (Fable) — off by default, opt-in. Drafts SQL-free
    # semantic contract YAML from aggregate profiling; output is always run
    # through validate_contract before it reaches a steward. Fable requires
    # 30-day data retention (ZDR orgs 400) and premium pricing, so keep the
    # narrower assistive uses on the Opus-tier fallback.
    contract_assistant_enabled: bool = Field(default=False)
    anthropic_api_key: str = Field(default="")
    contract_assistant_model: str = Field(default="claude-fable-5")
    contract_assistant_fallback_model: str = Field(default="claude-opus-4-8")
    contract_assistant_effort: Literal["low", "medium", "high", "xhigh", "max"] = Field(default="high")

    # Datasphere connector config file (runtime alternative to env vars, git-ignored)
    connector_file: str = Field(default="datasphere.yml")

    # Datasphere REST API — headless catalog / load status
    # base_url: e.g. https://mytenant.eu10.hcs.cloud.sap
    # token_url: defaults to {base_url}/oauth/token when empty
    datasphere_base_url: str = Field(default="")
    datasphere_client_id: str = Field(default="")
    datasphere_client_secret: str = Field(default="")
    datasphere_token_url: str = Field(default="")
    datasphere_space_id: str = Field(default="")
    # Datasphere CLI OAuth / host config. The legacy shared env names
    # DATASPHERE_AUTHORIZATION_URL and DATASPHERE_OAUTH_SECRETS_FILE are kept so
    # older local setups continue to work; the split UI now prefers the
    # DATASPHERE_CLI_* names.
    datasphere_cli_host: str = Field(default="", validation_alias="DSP_CLI_HOST")
    datasphere_cli_client_id: str = Field(default="")
    datasphere_cli_client_secret: str = Field(default="")
    datasphere_cli_authorization_url: str = Field(default="")
    datasphere_cli_token_url: str = Field(default="")
    datasphere_cli_oauth_secrets_file: str = Field(default="")
    datasphere_authorization_url: str = Field(default="")
    datasphere_oauth_secrets_file: str = Field(default="")
    # Tier-2 extraction: REST/OAuth catalog is the default source; set true to
    # also use the local @sap/datasphere-cli when available (richest CSN).
    datasphere_use_cli: bool = Field(default=False)

    # "Make available for monitoring" (Hybrid): Signal records the desired-state
    # set; an external, privileged script reconciles share + projection view in
    # this monitoring hub space and reports status back. Signal never writes to
    # Datasphere itself (stays read-only) — it only needs the hub space name.
    datasphere_monitoring_space: str = Field(default="")
    # S-2: dediziertes Service-Token für die maschinellen Monitoring-Endpunkte
    # (GET /manifest, PUT …/status), die das externe Reconcile-Skript aufruft.
    # Gesetzt ⇒ Header X-Service-Token wird erzwungen; leer ⇒ Fallback auf einen
    # steward+-Principal (nie anonym offen). EventSource/Skript nutzen das Token.
    monitoring_service_token: str = Field(default="")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings

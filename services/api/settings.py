from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    AUTH_MODE: str = "noauth"           # noauth | oidc
    STORE_BACKEND: str = "sqlite"       # sqlite | hana
    GIT_REMOTE: str = ""                # git remote URL for contracts
    CONTRACTS_DIR: str = "contracts"    # local contracts directory
    ENVIRONMENTS_FILE: str = ""         # YAML: name -> {host, port, schema, secret_ref}
    DB_PATH: str = "dq_results.db"
    BIND_HOST: str = "127.0.0.1"
    BIND_PORT: int = 8000
    ALLOW_LOCAL_DIAGNOSTICS: bool = False
    DIAGNOSTICS_TTL_DAYS: int = 30
    OIDC_ISSUER: str = ""
    OIDC_AUDIENCE: str = ""
    OIDC_ROLES_CLAIM: str = "roles"
    LINEAGE_FILE: str = "lineage.json"
    INVENTORY_FILE: str = "inventory.json"


settings = Settings()

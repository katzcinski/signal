from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


class ContractIn(BaseModel):
    product: str
    dataset: str = ""
    owned_by: str = "platform"
    owners: list[str] = []
    version: str = "0.1.0"
    lifecycle: str = "draft"
    guarantees: dict[str, Any] = {}


class ContractOut(BaseModel):
    product: str
    dataset: str = ""
    owned_by: str = "platform"
    owners: list[str] = []
    version: str = "0.1.0"
    lifecycle: str = "draft"
    guarantees: dict[str, Any] = {}
    compliance: Optional[str] = None


class CheckDefOut(BaseModel):
    name: str
    sql: str
    expect: str
    severity: str
    type: str = ""
    unit: str = ""
    owned_by: str = "platform"


class CompileOut(BaseModel):
    product: str
    dataset: str
    checks: list[CheckDefOut] = []
    yaml_preview: str = ""
    conflicts: list[str] = []
    determinism_hash: str = ""

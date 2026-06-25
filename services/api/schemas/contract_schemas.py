from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


class ContractIn(BaseModel):
    """Lifecycle ist bewusst KEIN Eingabefeld — Übergänge laufen nur über
    approve/deprecate; PUT erzwingt draft (S-2)."""
    product: str
    kind: str = "internal_gate"
    dataset: str = ""
    owned_by: str = "platform"
    owners: list[str] = []
    version: str = "0.1.0"
    kind: str = "internal_gate"
    description: str = ""
    guarantees: dict[str, Any] = {}
    # checks[]: library-instantiated checks (internal gates, Iteration 1). Rides
    # through model_dump() → validate → save; the compiler turns each into a
    # CheckDef. G1 stays intact — these reference library templates, never raw SQL.
    checks: list[dict[str, Any]] = []


class ContractOut(BaseModel):
    product: str
    kind: str = "internal_gate"
    dataset: str = ""
    owned_by: str = "platform"
    owners: list[str] = []
    version: str = "0.1.0"
    kind: str = "internal_gate"
    lifecycle: str = "draft"
    description: str = ""
    guarantees: dict[str, Any] = {}
    checks: list[dict[str, Any]] = []
    compliance: Optional[str] = None
    certified: bool = False


class CheckDefOut(BaseModel):
    name: str
    sql: str
    expect: str
    severity: str
    type: str = ""
    unit: str = ""
    owned_by: str = "platform"
    kind: str = "internal_gate"


class CompileOut(BaseModel):
    product: str
    dataset: str
    checks: list[CheckDefOut] = []
    yaml_preview: str = ""
    conflicts: list[str] = []
    determinism_hash: str = ""

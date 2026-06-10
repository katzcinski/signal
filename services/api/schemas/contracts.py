from pydantic import BaseModel
from typing import Optional, List, Any, Dict


class ContractIndexSchema(BaseModel):
    product: str
    lifecycle: str = "draft"
    owned_by: str = ""
    version: str = "1.0.0"
    head_hash: str = ""
    updated_at: Optional[str] = None
    compliance: str = "unknown"


class ContractWriteRequest(BaseModel):
    product: str
    dataset: str
    owned_by: str = "platform"
    owners: List[str] = []
    version: str = "1.0.0"
    lifecycle: str = "draft"
    guarantees: Dict[str, Any] = {}


class SeedRequest(BaseModel):
    dataset: str
    product: Optional[str] = None


class DiffRequest(BaseModel):
    new_contract: Dict[str, Any]


class CompileResponse(BaseModel):
    checks_yaml: str
    header_hash: str
    conflicts: List[str] = []
    diff_to_current: Optional[str] = None


class ProposalSchema(BaseModel):
    id: str
    product: str
    guarantee_patch: Dict[str, Any]
    evidence: Dict[str, Any] = {}
    status: str = "open"
    created_at: Optional[str] = None

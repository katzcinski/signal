from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class DraftRequest(BaseModel):
    product: str
    # Aggregate profiling result (as returned by POST /api/objects/{id}/profile).
    # Only aggregate fields are forwarded to the model; sample rows are dropped.
    profile: dict[str, Any] = Field(default_factory=dict)
    kind: str = "internal_gate"


class DraftResponse(BaseModel):
    product: str
    model: str  # which model actually served the draft (Fable, or its fallback)
    draft_yaml: str
    parsed: Optional[dict[str, Any]] = None
    valid: bool = False
    validation_errors: list[str] = Field(default_factory=list)

from dataclasses import dataclass, field
from typing import List, Optional
import yaml


@dataclass
class SchemaGuarantee:
    columns: List[str] = field(default_factory=list)
    mode: str = "open"  # open | closed


@dataclass
class KeyGuarantee:
    columns: List[str] = field(default_factory=list)
    unique: bool = True
    severity: str = "critical"


@dataclass
class ReferentialGuarantee:
    fk: List[str] = field(default_factory=list)
    parent: str = ""
    parent_key: List[str] = field(default_factory=list)
    severity: str = "fail"


@dataclass
class FreshnessGuarantee:
    column: str = ""
    max_age: str = "PT24H"  # ISO 8601 duration
    severity: str = "warn"


@dataclass
class VolumeGuarantee:
    baseline: str = "rolling"
    bounds: str = "auto"
    severity: str = "warn"


@dataclass
class CompletenessGuarantee:
    column: str = ""
    min_pct: float = 99.0
    severity: str = "warn"


@dataclass
class Guarantees:
    schema: Optional[SchemaGuarantee] = None
    keys: List[KeyGuarantee] = field(default_factory=list)
    referential: List[ReferentialGuarantee] = field(default_factory=list)
    freshness: Optional[FreshnessGuarantee] = None
    volume: Optional[VolumeGuarantee] = None
    completeness: List[CompletenessGuarantee] = field(default_factory=list)


@dataclass
class Contract:
    product: str
    dataset: str
    owned_by: str
    owners: List[str]
    version: str
    lifecycle: str  # draft | active | deprecated
    guarantees: Guarantees = field(default_factory=Guarantees)


def _parse_guarantees(data: dict) -> Guarantees:
    g = data.get("guarantees", {}) or {}
    schema_g = None
    if "schema" in g:
        s = g["schema"]
        schema_g = SchemaGuarantee(columns=s.get("columns", []), mode=s.get("mode", "open"))
    keys = [KeyGuarantee(
        columns=k.get("columns", []), unique=k.get("unique", True),
        severity=k.get("severity", "critical")
    ) for k in g.get("keys", [])]
    refs = [ReferentialGuarantee(
        fk=r.get("fk", []), parent=r.get("parent", ""),
        parent_key=r.get("parent_key", []), severity=r.get("severity", "fail")
    ) for r in g.get("referential", [])]
    fresh = None
    if "freshness" in g:
        f = g["freshness"]
        fresh = FreshnessGuarantee(column=f.get("column", ""), max_age=f.get("max_age", "PT24H"),
                                    severity=f.get("severity", "warn"))
    vol = None
    if "volume" in g:
        v = g["volume"]
        vol = VolumeGuarantee(baseline=v.get("baseline", "rolling"), bounds=v.get("bounds", "auto"),
                               severity=v.get("severity", "warn"))
    completeness = [CompletenessGuarantee(
        column=c.get("column", ""), min_pct=float(c.get("min_pct", 99.0)),
        severity=c.get("severity", "warn")
    ) for c in g.get("completeness", [])]
    return Guarantees(schema=schema_g, keys=keys, referential=refs,
                      freshness=fresh, volume=vol, completeness=completeness)


def load_contract(yaml_path: str) -> "Contract":
    with open(yaml_path) as f:
        data = yaml.safe_load(f)
    return Contract(
        product=data["product"],
        dataset=data["dataset"],
        owned_by=data.get("owned_by", ""),
        owners=data.get("owners", []),
        version=data.get("version", "1.0.0"),
        lifecycle=data.get("lifecycle", "draft"),
        guarantees=_parse_guarantees(data),
    )


def contract_to_dict(contract: "Contract") -> dict:
    g = contract.guarantees
    guarantees = {}
    if g.schema:
        guarantees["schema"] = {"columns": g.schema.columns, "mode": g.schema.mode}
    if g.keys:
        guarantees["keys"] = [{"columns": k.columns, "unique": k.unique, "severity": k.severity}
                               for k in g.keys]
    if g.referential:
        guarantees["referential"] = [
            {"fk": r.fk, "parent": r.parent, "parent_key": r.parent_key, "severity": r.severity}
            for r in g.referential
        ]
    if g.freshness:
        f = g.freshness
        guarantees["freshness"] = {"column": f.column, "max_age": f.max_age, "severity": f.severity}
    if g.volume:
        v = g.volume
        guarantees["volume"] = {"baseline": v.baseline, "bounds": v.bounds, "severity": v.severity}
    if g.completeness:
        guarantees["completeness"] = [
            {"column": c.column, "min_pct": c.min_pct, "severity": c.severity}
            for c in g.completeness
        ]
    return {
        "product": contract.product,
        "dataset": contract.dataset,
        "owned_by": contract.owned_by,
        "owners": contract.owners,
        "version": contract.version,
        "lifecycle": contract.lifecycle,
        "guarantees": guarantees,
    }


def save_contract(contract: "Contract", yaml_path: str) -> None:
    import os
    os.makedirs(os.path.dirname(yaml_path), exist_ok=True)
    with open(yaml_path, "w") as f:
        yaml.dump(contract_to_dict(contract), f, default_flow_style=False, sort_keys=False)

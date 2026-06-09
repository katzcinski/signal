import re
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from dq_core.contract.model import Contract

SQL_PATTERNS = [
    re.compile(r'\bSELECT\b', re.IGNORECASE),
    re.compile(r'\bINSERT\b', re.IGNORECASE),
    re.compile(r'\bUPDATE\b', re.IGNORECASE),
    re.compile(r'\bDELETE\b', re.IGNORECASE),
    re.compile(r'\bDROP\b', re.IGNORECASE),
    re.compile(r'\bCREATE\b', re.IGNORECASE),
    re.compile(r'\bALTER\b', re.IGNORECASE),
    re.compile(r'\bEXEC\b', re.IGNORECASE),
    re.compile(r'\bEXECUTE\b', re.IGNORECASE),
    re.compile(r'--'),
    re.compile(r'/\*'),
    re.compile(r'\*/'),
    re.compile(r';'),
]

IDENTIFIER_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
VALID_LIFECYCLES = {"draft", "active", "deprecated"}
VALID_OWNED_BY = {"platform", "product_owner"}
SEMVER_RE = re.compile(r'^\d+\.\d+\.\d+$')


class ContractValidator:
    def validate(self, contract: "Contract") -> List[str]:
        errors: List[str] = []
        self._check_required_fields(contract, errors)
        self._check_lifecycle(contract, errors)
        self._check_version(contract, errors)
        self._check_sql_injection(contract, errors)
        self._check_identifiers(contract, errors)
        return errors

    def _check_required_fields(self, contract: "Contract", errors: List[str]):
        if not contract.product:
            errors.append("product is required")
        if not contract.dataset:
            errors.append("dataset is required")
        if not contract.owned_by:
            errors.append("owned_by is required")

    def _check_lifecycle(self, contract: "Contract", errors: List[str]):
        if contract.lifecycle not in VALID_LIFECYCLES:
            errors.append(f"lifecycle must be one of {VALID_LIFECYCLES}, got {contract.lifecycle!r}")
        if contract.lifecycle == "breached":
            errors.append("lifecycle must not be 'breached' — compliance lives in the store, not the contract")

    def _check_version(self, contract: "Contract", errors: List[str]):
        if not SEMVER_RE.match(contract.version or ""):
            errors.append(f"version must be SemVer (x.y.z), got {contract.version!r}")

    def _check_sql_injection(self, contract: "Contract", errors: List[str]):
        def check_value(v, path):
            if isinstance(v, str):
                for pattern in SQL_PATTERNS:
                    if pattern.search(v):
                        errors.append(f"SQL pattern detected in {path}: {v!r}")
                        return
            elif isinstance(v, dict):
                for k, sub in v.items():
                    check_value(sub, f"{path}.{k}")
            elif isinstance(v, list):
                for i, item in enumerate(v):
                    check_value(item, f"{path}[{i}]")

        from dq_core.contract.model import contract_to_dict
        data = contract_to_dict(contract)
        check_value(data, "contract")

    def _check_identifiers(self, contract: "Contract", errors: List[str]):
        def check_id(v, path):
            if v and not IDENTIFIER_RE.match(v):
                errors.append(f"Invalid identifier at {path}: {v!r} (must match ^[A-Za-z_][A-Za-z0-9_]*$)")

        check_id(contract.dataset, "dataset")
        check_id(contract.product, "product")
        g = contract.guarantees
        if g.schema:
            for col in g.schema.columns:
                check_id(col, f"guarantees.schema.columns[{col}]")
        for i, k in enumerate(g.keys):
            for col in k.columns:
                check_id(col, f"guarantees.keys[{i}].columns[{col}]")
        if g.freshness:
            check_id(g.freshness.column, "guarantees.freshness.column")
        for i, c in enumerate(g.completeness):
            check_id(c.column, f"guarantees.completeness[{i}].column")

import hashlib
import json
import re
from typing import List, Optional, Tuple, TYPE_CHECKING

from dq_core.engine.models import CheckDef
from dq_core.library.check_library import CheckLibrary
from dq_core.contract.model import Contract

IDENTIFIER_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _validate_identifier(name: str, context: str) -> None:
    if not IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid identifier {name!r} in {context}")


def _iso_duration_to_seconds(duration: str) -> int:
    """Convert ISO 8601 duration (e.g. PT24H, P1D) to seconds."""
    import re
    m = re.match(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?', duration)
    if not m:
        return 86400
    days = int(m.group(1) or 0)
    hours = int(m.group(2) or 0)
    minutes = int(m.group(3) or 0)
    seconds = int(m.group(4) or 0)
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


class ContractCompiler:
    def __init__(self, library: Optional[CheckLibrary] = None):
        self.library = library or CheckLibrary()

    def compile(self, contract: Contract, existing_checks: Optional[List[CheckDef]] = None) -> dict:
        """
        Returns {
            'checks': List[CheckDef],   # {schema} placeholder preserved [SCHEMA-MAP]
            'header_hash': str,         # deterministic hash [DETERMINISM]
            'conflicts': List[str],
        }
        """
        compiled: List[CheckDef] = []
        dataset = contract.dataset
        _validate_identifier(dataset, "contract.dataset")

        g = contract.guarantees
        if g.schema:
            compiled.extend(self._compile_schema(g.schema, dataset))
        for key_g in g.keys:
            compiled.extend(self._compile_key(key_g, dataset))
        for ref_g in g.referential:
            compiled.extend(self._compile_referential(ref_g, dataset))
        if g.freshness:
            compiled.extend(self._compile_freshness(g.freshness, dataset))
        for comp_g in g.completeness:
            compiled.extend(self._compile_completeness(comp_g, dataset))
        if g.volume:
            compiled.extend(self._compile_volume(g.volume, dataset))

        merged, conflicts = self._merge_with_existing(compiled, existing_checks or [])

        contract_hash = self.compute_contract_hash(contract)
        lib_version = self.library.get_version()
        header_hash = hashlib.sha256(
            f"{contract_hash}:{lib_version}".encode()
        ).hexdigest()

        return {"checks": merged, "header_hash": header_hash, "conflicts": conflicts}

    def _compile_schema(self, g, dataset: str) -> List[CheckDef]:
        checks = []
        tmpl = self.library.get_template("schema_column_count")
        if tmpl:
            checks.append(CheckDef(
                name=f"{dataset}__schema_column_count",
                sql=tmpl["sql_template"].replace("{dataset}", dataset),
                expect=f">= {len(g.columns)}",
                severity="fail",
                type="schema",
                description="Minimum column count from contract",
            ))
        for col in g.columns:
            _validate_identifier(col, f"schema.columns[{col}]")
            tmpl = self.library.get_template("schema_column_exists")
            if tmpl:
                sql = tmpl["sql_template"].replace("{dataset}", dataset).replace("{column}", col)
                checks.append(CheckDef(
                    name=f"{dataset}__col_exists_{col}",
                    sql=sql,
                    expect="= 1",
                    severity="fail",
                    type="schema",
                    description=f"Column {col} must exist",
                ))
        return checks

    def _compile_key(self, g, dataset: str) -> List[CheckDef]:
        for col in g.columns:
            _validate_identifier(col, f"key.columns[{col}]")
        cols_expr = ", ".join(g.columns)
        if len(g.columns) == 1:
            tmpl = self.library.get_template("unique_count")
            sql = tmpl["sql_template"].replace("{dataset}", dataset).replace("{column}", g.columns[0])
        else:
            tmpl = self.library.get_template("composite_unique")
            sql = tmpl["sql_template"].replace("{dataset}", dataset).replace("{columns}", cols_expr)
        key_name = "_".join(g.columns)
        return [CheckDef(
            name=f"{dataset}__key_{key_name}_unique",
            sql=sql,
            expect="= 0",
            severity=g.severity,
            type="uniqueness",
            description=f"Key {g.columns} must be unique",
        )]

    def _compile_referential(self, g, dataset: str) -> List[CheckDef]:
        _validate_identifier(g.parent, "referential.parent")
        for col in g.fk:
            _validate_identifier(col, f"referential.fk[{col}]")
        for col in g.parent_key:
            _validate_identifier(col, f"referential.parent_key[{col}]")
        fk_col = g.fk[0] if g.fk else "id"
        pk_col = g.parent_key[0] if g.parent_key else "id"
        tmpl = self.library.get_template("referential_orphans")
        sql = (tmpl["sql_template"]
               .replace("{dataset}", dataset)
               .replace("{parent_dataset}", g.parent)
               .replace("{parent_key}", pk_col)
               .replace("{fk_column}", fk_col))
        return [CheckDef(
            name=f"{dataset}__ref_{fk_col}_to_{g.parent}",
            sql=sql,
            expect="= 0",
            severity=g.severity,
            type="referential",
            description=f"FK {g.fk} must reference {g.parent}",
        )]

    def _compile_freshness(self, g, dataset: str) -> List[CheckDef]:
        _validate_identifier(g.column, "freshness.column")
        max_seconds = _iso_duration_to_seconds(g.max_age)
        tmpl = self.library.get_template("freshness_seconds")
        sql = tmpl["sql_template"].replace("{dataset}", dataset).replace("{column}", g.column)
        return [CheckDef(
            name=f"{dataset}__freshness_{g.column}",
            sql=sql,
            expect=f"<= {max_seconds}",
            severity=g.severity,
            type="freshness",
            description=f"Data must be fresher than {g.max_age}",
        )]

    def _compile_completeness(self, g, dataset: str) -> List[CheckDef]:
        _validate_identifier(g.column, "completeness.column")
        tmpl = self.library.get_template("completeness_pct")
        sql = tmpl["sql_template"].replace("{dataset}", dataset).replace("{column}", g.column)
        return [CheckDef(
            name=f"{dataset}__completeness_{g.column}",
            sql=sql,
            expect=f">= {g.min_pct}",
            severity=g.severity,
            type="completeness",
            description=f"Column {g.column} must be {g.min_pct}% complete",
        )]

    def _compile_volume(self, g, dataset: str) -> List[CheckDef]:
        tmpl = self.library.get_template("row_count")
        sql = tmpl["sql_template"].replace("{dataset}", dataset)
        return [CheckDef(
            name=f"{dataset}__row_count",
            sql=sql,
            expect=">= 1",
            severity=g.severity,
            type="volume",
            description="Dataset must have at least 1 row",
        )]

    def _merge_with_existing(self, compiled: List[CheckDef], existing: List[CheckDef]) -> Tuple[List[CheckDef], List[str]]:
        existing_map = {c.name: c for c in existing}
        conflicts = []
        result = []
        compiled_names = {c.name for c in compiled}
        for c in compiled:
            if c.name in existing_map:
                result.append(existing_map[c.name])  # existing-wins
                conflicts.append(c.name)
            else:
                result.append(c)
        for c in existing:
            if c.name not in compiled_names:
                result.append(c)  # keep hand-crafted checks not in compiled set
        return result, conflicts

    def compute_contract_hash(self, contract: Contract) -> str:
        from dq_core.contract.model import contract_to_dict
        data = contract_to_dict(contract)
        canonical = json.dumps(data, sort_keys=True, ensure_ascii=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

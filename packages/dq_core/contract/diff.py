from dataclasses import dataclass, field
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from dq_core.contract.model import Contract


@dataclass
class DiffResult:
    is_breaking: bool
    breaking_changes: List[str] = field(default_factory=list)
    non_breaking_changes: List[str] = field(default_factory=list)
    requires_major_bump: bool = False

    @property
    def has_changes(self) -> bool:
        return bool(self.breaking_changes or self.non_breaking_changes)


class ContractDiff:
    """Stage 1 homegrown diff (~150 LOC). ODCS/datacontract-cli is Stage 2 (deferred)."""

    def diff(self, old: "Contract", new: "Contract") -> DiffResult:
        breaking: List[str] = []
        non_breaking: List[str] = []

        self._diff_schema(old.guarantees.schema, new.guarantees.schema, old, non_breaking, breaking)
        self._diff_keys(old.guarantees.keys, new.guarantees.keys, non_breaking, breaking)
        self._diff_freshness(old.guarantees.freshness, new.guarantees.freshness, non_breaking, breaking)
        self._diff_completeness(old.guarantees.completeness, new.guarantees.completeness, non_breaking, breaking)
        self._diff_referential(old.guarantees.referential, new.guarantees.referential, non_breaking, breaking)
        self._diff_volume(old.guarantees.volume, new.guarantees.volume, non_breaking, breaking)
        self._diff_metadata(old, new, non_breaking)

        return DiffResult(
            is_breaking=bool(breaking),
            breaking_changes=breaking,
            non_breaking_changes=non_breaking,
            requires_major_bump=bool(breaking),
        )

    def _diff_schema(self, old_g, new_g, contract, non_breaking, breaking):
        if old_g is None and new_g is None:
            return
        if old_g is None:
            non_breaking.append("schema guarantee added")
            return
        if new_g is None:
            breaking.append("schema guarantee removed")
            return
        old_cols = set(old_g.columns)
        new_cols = set(new_g.columns)
        for col in old_cols - new_cols:
            breaking.append(f"column removed: {col}")
        for col in new_cols - old_cols:
            if new_g.mode == "closed":
                breaking.append(f"column added in closed schema: {col}")
            else:
                non_breaking.append(f"column added: {col}")
        if old_g.mode == "open" and new_g.mode == "closed":
            breaking.append("schema mode changed from open to closed")
        elif old_g.mode == "closed" and new_g.mode == "open":
            non_breaking.append("schema mode changed from closed to open")

    def _diff_keys(self, old_keys, new_keys, non_breaking, breaking):
        old_map = {tuple(sorted(k.columns)): k for k in old_keys}
        new_map = {tuple(sorted(k.columns)): k for k in new_keys}
        for key in old_map:
            if key not in new_map:
                breaking.append(f"key guarantee removed: {list(key)}")
        for key, new_k in new_map.items():
            if key not in old_map:
                non_breaking.append(f"key guarantee added: {list(key)}")
            else:
                old_k = old_map[key]
                if old_k.severity != new_k.severity:
                    sev_order = {"warn": 0, "fail": 1, "critical": 2}
                    if sev_order.get(new_k.severity, 0) > sev_order.get(old_k.severity, 0):
                        breaking.append(f"key severity escalated from {old_k.severity} to {new_k.severity}")
                    else:
                        non_breaking.append(f"key severity relaxed from {old_k.severity} to {new_k.severity}")

    def _diff_freshness(self, old_f, new_f, non_breaking, breaking):
        if old_f is None and new_f is None:
            return
        if old_f is None:
            non_breaking.append("freshness guarantee added")
            return
        if new_f is None:
            breaking.append("freshness guarantee removed")
            return
        if old_f.column != new_f.column:
            breaking.append(f"freshness column changed from {old_f.column!r} to {new_f.column!r}")
        if old_f.max_age != new_f.max_age:
            non_breaking.append(f"freshness max_age changed from {old_f.max_age} to {new_f.max_age}")

    def _diff_completeness(self, old_list, new_list, non_breaking, breaking):
        old_map = {c.column: c for c in old_list}
        new_map = {c.column: c for c in new_list}
        for col in old_map:
            if col not in new_map:
                breaking.append(f"completeness guarantee removed for column: {col}")
        for col, new_c in new_map.items():
            if col not in old_map:
                non_breaking.append(f"completeness guarantee added for column: {col}")
            else:
                old_c = old_map[col]
                if new_c.min_pct > old_c.min_pct:
                    breaking.append(f"completeness min_pct tightened for {col}: {old_c.min_pct} -> {new_c.min_pct}")
                elif new_c.min_pct < old_c.min_pct:
                    non_breaking.append(f"completeness min_pct relaxed for {col}: {old_c.min_pct} -> {new_c.min_pct}")

    def _diff_referential(self, old_list, new_list, non_breaking, breaking):
        old_map = {(tuple(sorted(r.fk)), r.parent): r for r in old_list}
        new_map = {(tuple(sorted(r.fk)), r.parent): r for r in new_list}
        for key in old_map:
            if key not in new_map:
                breaking.append(f"referential guarantee removed: {list(key[0])} -> {key[1]}")
        for key in new_map:
            if key not in old_map:
                non_breaking.append(f"referential guarantee added: {list(key[0])} -> {key[1]}")

    def _diff_volume(self, old_v, new_v, non_breaking, breaking):
        if old_v is None and new_v is None:
            return
        if old_v is None:
            non_breaking.append("volume guarantee added")
            return
        if new_v is None:
            breaking.append("volume guarantee removed")
            return

    def _diff_metadata(self, old: "Contract", new: "Contract", non_breaking):
        if old.owned_by != new.owned_by:
            non_breaking.append(f"owned_by changed: {old.owned_by!r} -> {new.owned_by!r}")
        if set(old.owners) != set(new.owners):
            non_breaking.append("owners list changed")
        if old.lifecycle != new.lifecycle:
            non_breaking.append(f"lifecycle changed: {old.lifecycle!r} -> {new.lifecycle!r}")

    @staticmethod
    def requires_major_version_bump(diff_result: DiffResult, old_version: str, new_version: str) -> bool:
        if not diff_result.is_breaking:
            return False
        try:
            old_major = int(old_version.split(".")[0])
            new_major = int(new_version.split(".")[0])
            return new_major <= old_major
        except (ValueError, IndexError):
            return True

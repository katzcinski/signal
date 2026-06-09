from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_lineage(path: str | Path) -> dict[str, Any]:
    """Load lineage.json and return nodes/edges dict."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {
        "nodes": data.get("nodes") or [],
        "edges": data.get("edges") or [],
    }


def get_coverage(
    nodes: list[dict],
    object_statuses: list[dict],
    contracts: list[str],
) -> list[dict]:
    """Annotate lineage nodes with coverage flags.

    Coverage flags (object-granular until columnEdges parser is fixed — O3):
    ● (covered) — active contract + passing checks
    ◐ (partial)  — contract exists but some checks fail/missing
    ▲ (gap)      — no contract or key gap flagged
    ○ (out-of-scope) — external_raw / unresolved upstream
    """
    status_by_name = {s.get("dataset"): s for s in object_statuses}
    contracted = set(contracts)

    result = []
    for node in nodes:
        node_id = node.get("id") or node.get("technicalName") or ""
        status = status_by_name.get(node_id, {})
        has_contract = node_id in contracted

        if node.get("objectType") in ("external_raw", "unknown") or not node_id:
            flag = "○"
        elif not has_contract:
            flag = "▲"
        elif status.get("status") in ("fail", "critical", "error"):
            flag = "◐"
        elif status.get("status") == "pass":
            flag = "●"
        else:
            flag = "◐"

        result.append({
            **node,
            "coverage_flag": flag,
            "dq_status": status.get("status", "unknown"),
            "last_run": status.get("last_run"),
            "has_contract": has_contract,
        })
    return result

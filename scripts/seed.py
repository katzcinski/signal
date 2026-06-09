#!/usr/bin/env python3
"""Seed signal.db with 30+ historical runs per dataset so ProposalMiner has enough samples."""
import sys, os, uuid, random, math
from pathlib import Path
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).parents[1] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[1]))

os.environ.setdefault("SQLITE_DB", "signal.db")
os.environ.setdefault("INVENTORY_FILE", "data/inventory.json")
os.environ.setdefault("LINEAGE_FILE", "data/lineage.json")
os.environ.setdefault("CONTRACTS_DIR", "contracts")
os.environ.setdefault("CHECKS_DIR", "checks")

from dq_core.store.sqlite_store import ResultStore
from dq_core.engine.models import RunSummary, CheckResult

store = ResultStore(os.environ["SQLITE_DB"])

DATASETS = [
    "DS_SALES_ORDERS",
    "DS_CUSTOMERS",
    "DS_PRODUCTS",
    "DS_REVENUE_SUMMARY",
]

CHECKS_BY_DATASET: dict[str, list[dict]] = {
    "DS_SALES_ORDERS": [
        {"name": "row_count", "expect": "BETWEEN 1000 AND 999999", "severity": "fail"},
        {"name": "null_ORDER_ID", "expect": "= 0", "severity": "critical"},
        {"name": "null_CUSTOMER_ID", "expect": "= 0", "severity": "fail"},
        {"name": "duplicate_ORDER_ID", "expect": "= 0", "severity": "critical"},
        {"name": "freshness_ORDER_DATE", "expect": "<= 26", "severity": "warn"},
    ],
    "DS_CUSTOMERS": [
        {"name": "row_count", "expect": "BETWEEN 100 AND 999999", "severity": "fail"},
        {"name": "null_CUSTOMER_ID", "expect": "= 0", "severity": "critical"},
        {"name": "duplicate_CUSTOMER_ID", "expect": "= 0", "severity": "critical"},
    ],
    "DS_PRODUCTS": [
        {"name": "row_count", "expect": "BETWEEN 50 AND 99999", "severity": "fail"},
        {"name": "null_PRODUCT_ID", "expect": "= 0", "severity": "critical"},
        {"name": "duplicate_PRODUCT_ID", "expect": "= 0", "severity": "fail"},
    ],
    "DS_REVENUE_SUMMARY": [
        {"name": "row_count", "expect": "BETWEEN 12 AND 9999", "severity": "fail"},
        {"name": "null_YEAR_MONTH", "expect": "= 0", "severity": "critical"},
        {"name": "null_GROSS_REVENUE", "expect": "= 0", "severity": "fail"},
        {"name": "duplicate_YEAR_MONTH_REGION", "expect": "= 0", "severity": "critical"},
    ],
}

ACTUALS: dict[str, dict[str, tuple[float, float]]] = {
    "DS_SALES_ORDERS": {
        "row_count": (45000, 55000),
        "null_ORDER_ID": (0, 2),
        "null_CUSTOMER_ID": (0, 5),
        "duplicate_ORDER_ID": (0, 1),
        "freshness_ORDER_DATE": (1, 24),
    },
    "DS_CUSTOMERS": {
        "row_count": (8000, 9200),
        "null_CUSTOMER_ID": (0, 0),
        "duplicate_CUSTOMER_ID": (0, 0),
    },
    "DS_PRODUCTS": {
        "row_count": (1200, 1500),
        "null_PRODUCT_ID": (0, 0),
        "duplicate_PRODUCT_ID": (0, 1),
    },
    "DS_REVENUE_SUMMARY": {
        "row_count": (24, 36),
        "null_YEAR_MONTH": (0, 0),
        "null_GROSS_REVENUE": (0, 0),
        "duplicate_YEAR_MONTH_REGION": (0, 0),
    },
}

rng = random.Random(42)
now = datetime.now(timezone.utc)

def passes(check_name: str, actual: float, expect_str: str) -> bool:
    if expect_str.startswith("= "):
        return actual == float(expect_str[2:])
    if expect_str.startswith("<= "):
        return actual <= float(expect_str[3:])
    if expect_str.startswith("BETWEEN "):
        parts = expect_str.split()
        return float(parts[1]) <= actual <= float(parts[3])
    return True

count = 0
for dataset in DATASETS:
    checks = CHECKS_BY_DATASET[dataset]
    actuals_range = ACTUALS.get(dataset, {})
    for run_i in range(35):
        started = now - timedelta(days=34 - run_i, hours=rng.randint(0, 23))
        finished = started + timedelta(seconds=rng.randint(5, 120))
        run_id = str(uuid.uuid4())
        results: list[CheckResult] = []
        for chk in checks:
            lo, hi = actuals_range.get(chk["name"], (0.0, 10.0))
            actual = rng.uniform(lo, hi)
            passed = passes(chk["name"], actual, chk["expect"])
            results.append(CheckResult(
                name=chk["name"],
                sql=f"-- mock: {chk['name']}",
                expect=chk["expect"],
                severity=chk["severity"],
                passed=passed,
                actual_value=str(round(actual, 2)),
                duration_ms=rng.randint(10, 500),
                state="executed",
            ))
        p = sum(1 for r in results if r.passed)
        f = sum(1 for r in results if not r.passed and r.severity in ("critical", "fail"))
        w = sum(1 for r in results if not r.passed and r.severity == "warn")
        overall = "critical" if any(r.severity == "critical" and not r.passed for r in results) \
                  else "fail" if f > 0 else "warn" if w > 0 else "pass"
        summary = RunSummary(
            run_id=run_id,
            dataset=dataset,
            schema=dataset,
            started_at=started.isoformat(),
            finished_at=finished.isoformat(),
            overall_status=overall,
            total=len(results),
            passed=p,
            failed=f,
            warnings=w,
            results=results,
            triggered_by="seed",
            actor="seed_script",
            run_state="finished",
        )
        store.save_run(summary)
        count += 1

print(f"Seeded {count} runs across {len(DATASETS)} datasets.")
print(f"Database: {os.environ['SQLITE_DB']}")

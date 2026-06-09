#!/usr/bin/env python3
"""CLI for running DQ checks. Imports dq_core (framework-free)."""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "packages"))


def main():
    parser = argparse.ArgumentParser(description="DQ Check Runner")
    parser.add_argument("--dataset", required=True, help="Dataset name")
    parser.add_argument("--schema", required=True, help="Schema name [SCHEMA-MAP]")
    parser.add_argument("--checks", required=True, help="Path to checks YAML file")
    parser.add_argument("--db", default="dq_results.db", help="SQLite DB path")
    parser.add_argument("--dry-run", action="store_true", help="Do not persist results")
    parser.add_argument("--output", choices=["text", "json"], default="text")
    args = parser.parse_args()

    import yaml
    from dq_core.engine.models import CheckDef, DatasetConfig
    from dq_core.engine.check_engine import CheckEngine

    with open(args.checks) as f:
        data = yaml.safe_load(f) or {}

    checks = [
        CheckDef(
            name=c["name"], sql=c.get("sql", ""), expect=c.get("expect", ">= 0"),
            severity=c.get("severity", "fail"), enabled=c.get("enabled", True),
            type=c.get("type", ""), description=c.get("description", ""),
        )
        for c in data.get("checks", [])
    ]

    dataset_config = DatasetConfig(dataset=args.dataset, schema=args.schema, checks=checks)

    store = None
    if not args.dry_run:
        from dq_core.store.sqlite_store import SQLiteStore
        store = SQLiteStore(db_path=args.db)

    def on_progress(run_id, check_name, result):
        status = "PASS" if result.passed else "FAIL"
        print(f"  [{status}] {check_name}: {result.actual_value}")

    # NOTE: connection=None means checks will fail — real usage requires a DBConnection
    engine = CheckEngine(connection=None, store=store, on_progress=on_progress)
    summary = engine.run_dataset(dataset_config, triggered_by="cli")

    if args.output == "json":
        print(json.dumps({
            "run_id": summary.run_id,
            "overall_status": summary.overall_status,
            "total": summary.total,
            "passed": summary.passed,
            "failed": summary.failed,
        }, indent=2))
    else:
        print(f"\nRun: {summary.run_id}")
        print(f"Status: {summary.overall_status.upper()}")
        print(f"Checks: {summary.passed}/{summary.total} passed")

    if store:
        store.close()

    sys.exit(0 if summary.overall_status in ("pass", "warn") else 1)


if __name__ == "__main__":
    main()

"""Check-suite endpoints: dry-run execution and git-revert. (WS3-2)"""
from __future__ import annotations

import threading
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException

from ..auth.provider import PrincipalDep
from ..deps import StoreDep
from ..settings import get_settings

router = APIRouter(prefix="/api/checks", tags=["checks"])

_revert_lock = threading.Lock()


@router.post("/{dataset}/dry-run")
def dry_run_checks(
    dataset: str,
    principal: PrincipalDep,
    body: dict = Body(default={}),
):
    """Compile contract for dataset and run checks without persisting results.

    Body: { "environment": "<env-name>" }
    Returns the RunSummary dict or a compile-only preview when no DB connection
    is configured for the environment.
    """
    import yaml
    from dq_core.contract.compiler import compile_contract as _compile
    from dq_core.engine.check_engine import dataset_config_to_yaml

    settings = get_settings()
    contracts_dir = Path(settings.contracts_dir)

    # Find the contract whose dataset matches (product slug or dataset name)
    contract_data = None
    for path in contracts_dir.glob("*.yml"):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if data.get("dataset") == dataset or path.stem == dataset:
            contract_data = data
            break

    if not contract_data:
        raise HTTPException(status_code=404, detail=f"No contract found for dataset {dataset!r}")

    environment = body.get("environment", "")
    schema_override = ""

    # Resolve schema from environments file if provided
    if environment and settings.environments_file:
        env_path = Path(settings.environments_file)
        if env_path.exists():
            import yaml as _yaml
            envs = _yaml.safe_load(env_path.read_text()) or {}
            env_cfg = envs.get(environment, {})
            schema_override = env_cfg.get("schema", "")

    config = _compile(contract_data, schema_override=schema_override)

    # Attempt a real run if a DB connection can be established; otherwise
    # return a compile-only preview (no connection = stub/local mode).
    try:
        from dq_core.connect.db_connection import DBConnection
        if environment and settings.environments_file:
            env_path = Path(settings.environments_file)
            if env_path.exists():
                import yaml as _yaml
                envs = _yaml.safe_load(env_path.read_text()) or {}
                env_cfg = envs.get(environment, {})
                conn = DBConnection(
                    host=env_cfg.get("host", ""),
                    port=int(env_cfg.get("port", 443)),
                    user=env_cfg.get("user", ""),
                    password=env_cfg.get("password", ""),
                    schema=schema_override,
                )
            else:
                conn = None
        else:
            conn = None
    except Exception:
        conn = None

    if conn is None:
        # No connection: return compile preview only
        return {
            "mode": "compile_only",
            "dataset": config.dataset,
            "schema": config.schema,
            "check_count": len(config.checks),
            "checks_yaml": dataset_config_to_yaml(config),
            "message": "No environment configured — compile-only preview. Provide 'environment' in body to run against HANA.",
        }

    # Run without persisting (store=None)
    from dq_core.engine.check_engine import CheckEngine
    import uuid
    from datetime import datetime, timezone

    run_id = str(uuid.uuid4())
    engine = CheckEngine(connection=conn, store=None)
    summary = engine.run_dataset(config, run_id=run_id)

    try:
        conn.close()
    except Exception:
        pass

    return {
        "mode": "executed",
        "run_id": summary.run_id,
        "dataset": summary.dataset,
        "overall_status": summary.overall_status,
        "total": summary.total,
        "passed": summary.passed,
        "failed": summary.failed,
        "warnings": summary.warnings,
        "started_at": summary.started_at,
        "finished_at": summary.finished_at,
        "results": [
            {
                "name": r.name,
                "passed": r.passed,
                "actual_value": r.actual_value,
                "expect": r.expect,
                "severity": r.severity,
                "state": r.state,
                "error": r.error,
                "duration_ms": r.duration_ms,
            }
            for r in summary.results
        ],
    }


@router.post("/{dataset}/revert")
def revert_checks(
    dataset: str,
    principal: PrincipalDep,
):
    """Revert checks/{dataset}/checks.yml to the previous git version (F7)."""
    settings = get_settings()
    checks_path = Path(settings.checks_dir) / dataset / "checks.yml"

    if not checks_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No compiled checks found for dataset {dataset!r}",
        )

    with _revert_lock:
        try:
            import git

            repo = git.Repo(search_parent_directories=True)
            rel_path = checks_path.relative_to(repo.working_tree_dir)

            # Get the hash of the previous version
            commits = list(repo.iter_commits(paths=str(rel_path), max_count=2))
            if len(commits) < 2:
                raise HTTPException(
                    status_code=409,
                    detail="No previous version to revert to (only one commit for this file)",
                )
            prev_commit = commits[1]

            # Restore file from previous commit
            repo.git.checkout(str(prev_commit.hexsha), "--", str(rel_path))

            # Commit the revert
            repo.index.add([str(checks_path)])
            revert_commit = repo.index.commit(
                f"revert: restore checks/{dataset}/checks.yml to {prev_commit.hexsha[:8]}",
                author=git.Actor(principal.name, principal.sub or ""),
            )

            return {
                "dataset": dataset,
                "reverted": True,
                "reverted_to_commit": str(prev_commit.hexsha),
                "revert_commit": str(revert_commit.hexsha),
            }

        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="gitpython not installed — cannot revert",
            )
        except git.InvalidGitRepositoryError:
            raise HTTPException(
                status_code=409,
                detail="Checks directory is not inside a git repository",
            )

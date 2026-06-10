from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..auth.provider import PrincipalDep
from ..deps import StoreDep, get_inventory
from ..schemas.object_schemas import ObjectDetailOut, ObjectOut
from ..schemas.run_schemas import RunListItem, RunSummaryOut
from ..sse import make_progress_callback, push_event
from ..settings import get_settings

router = APIRouter(prefix="/api/objects", tags=["objects"])


def _object_status_map(store) -> dict[str, dict]:
    try:
        return {s["dataset"]: s for s in store.get_object_status()}
    except Exception:
        return {}


def _contract_lifecycle_map() -> dict[str, str]:
    """Map product → lifecycle from on-disk contracts (identity join: id == product)."""
    import yaml
    from pathlib import Path
    out: dict[str, str] = {}
    base = Path(get_settings().contracts_dir)
    if not base.exists():
        return out
    for path in base.glob("*.y*ml"):
        if path.name.endswith(".active.yml"):
            continue
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:
            continue
        product = data.get("product") or path.stem
        out[product] = data.get("lifecycle", "draft")
    return out


def _coverage_flag(object_id: str, lifecycle: str, settings) -> str:
    """Coverage status for the catalog/coverage map (WS4)."""
    if not lifecycle:
        return "out_of_scope"
    if lifecycle != "active":
        return "gap"  # contract exists but not yet certified (e.g. draft) → needs attention
    has_checks = _find_checks_file(object_id, settings) is not None
    return "covered" if has_checks else "partial"


@router.get("", response_model=list[ObjectOut])
def list_objects(
    space: str | None = Query(default=None),
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    statuses = _object_status_map(store)
    contracts = _contract_lifecycle_map()
    settings = get_settings()
    result = []
    for obj in inventory:
        obj_id = obj.get("id") or obj.get("technicalName") or obj.get("name") or ""
        if space and obj.get("space") != space:
            continue
        s = statuses.get(obj_id, {})
        lifecycle = contracts.get(obj_id, "")
        result.append(
            ObjectOut(
                id=obj_id,
                name=obj.get("name") or obj_id,
                schema_name=obj.get("schema") or "",
                family=obj.get("family", "quality"),
                layer=obj.get("layer", ""),
                status=s.get("status", "unknown"),
                contract_status=lifecycle,
                cov_flag=_coverage_flag(obj_id, lifecycle, settings),
                check_count=s.get("total_checks", obj.get("checkCount", 0)),
                owned_by=obj.get("owned_by", "platform"),
                last_run=s.get("last_run"),
                last_run_id=s.get("last_run_id"),
                space=obj.get("space", ""),
            )
        )
    return result


@router.get("/{object_id}", response_model=ObjectDetailOut)
def get_object(
    object_id: str,
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    obj = next(
        (
            o for o in inventory
            if (o.get("id") or o.get("technicalName") or o.get("name")) == object_id
        ),
        None,
    )
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object {object_id!r} not found")

    statuses = _object_status_map(store)
    s = statuses.get(object_id, {})
    runs = store.get_runs(object_id, limit=20)
    latest_run_data = store.get_run(runs[0]["run_id"]) if runs else None

    latest_run = None
    if latest_run_data:
        results = [
            RunSummaryOut(
                run_id=latest_run_data["run_id"],
                dataset=latest_run_data["dataset"],
                schema_name=latest_run_data.get("schema_name", ""),
                started_at=latest_run_data.get("started_at", ""),
                finished_at=latest_run_data.get("finished_at", ""),
                overall_status=latest_run_data.get("overall_status", "pass"),
                total=latest_run_data.get("total_checks", 0),
                passed=latest_run_data.get("passed_checks", 0),
                failed=latest_run_data.get("failed_checks", 0),
                warnings=latest_run_data.get("warning_checks", 0),
                triggered_by=latest_run_data.get("triggered_by", "manual"),
                run_state=latest_run_data.get("run_state", "finished"),
                results=[],  # detail loaded separately via /runs/:id
            )
        ]
        latest_run = results[0]

    lifecycle = _contract_lifecycle_map().get(object_id, "")
    return ObjectDetailOut(
        id=object_id,
        name=obj.get("name") or object_id,
        schema_name=obj.get("schema") or "",
        family=obj.get("family", "quality"),
        layer=obj.get("layer", ""),
        status=s.get("status", "unknown"),
        contract_status=lifecycle,
        cov_flag=_coverage_flag(object_id, lifecycle, get_settings()),
        check_count=s.get("total_checks", 0),
        owned_by=obj.get("owned_by", "platform"),
        last_run=s.get("last_run"),
        last_run_id=s.get("last_run_id"),
        space=obj.get("space", ""),
        latest_run=latest_run,
        run_history=[RunListItem(**{k: v for k, v in r.items() if k in RunListItem.model_fields}) for r in runs[:20]],
    )


@router.get("/{object_id}/runs", response_model=list[RunListItem])
def get_object_runs(object_id: str, store: StoreDep = ...):
    runs = store.get_runs(object_id, limit=100)
    return [RunListItem(**{k: v for k, v in r.items() if k in RunListItem.model_fields}) for r in runs]


@router.post("/{object_id}/run", status_code=status.HTTP_202_ACCEPTED)
def trigger_run(
    object_id: str,
    principal: PrincipalDep,
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    """Trigger a DQ run for an object. Returns run_id immediately (202). [ENGINE-FROZEN]"""
    from dq_core.connect.db_connection import MockConnection
    from dq_core.engine.check_engine import run_checks
    from dq_core.engine.models import DatasetConfig

    settings = get_settings()

    obj = next(
        (o for o in inventory if (o.get("id") or o.get("technicalName") or o.get("name")) == object_id),
        None,
    )
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object {object_id!r} not found")

    # Check if already running (F2)
    runs = store.get_runs(object_id, limit=1)
    if runs and runs[0].get("run_state") == "running":
        return {"run_id": runs[0]["run_id"], "status": "already_running"}

    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Mark run as started in store immediately (F2: registry in DB not memory)
    from dq_core.engine.models import RunSummary
    seed_summary = RunSummary(
        run_id=run_id,
        dataset=object_id,
        schema=obj.get("schema", ""),
        started_at=now,
        finished_at="",
        overall_status="pass",
        total=0,
        passed=0,
        failed=0,
        warnings=0,
        triggered_by=principal.sub,
        actor=principal.name,
        run_state="running",
    )
    store.save_run(seed_summary)
    push_event({"type": "run_started", "run_id": run_id, "dataset": object_id})

    def _run_thread():
        try:
            # Load compiled checks if available
            checks_path = _find_checks_file(object_id, settings)
            if checks_path and checks_path.exists():
                from dq_core.engine.check_engine import load_dataset_config
                config = load_dataset_config(checks_path)
            else:
                config = DatasetConfig(dataset=object_id, schema=obj.get("schema", ""))

            conn = MockConnection()  # [SCHEMA-MAP] real HANA conn via get_connection() in prod
            callback = make_progress_callback(run_id, store)
            summary = run_checks(
                config,
                conn,
                results_db=None,
                on_progress=callback,
                triggered_by=principal.sub,
            )
            summary.run_id = run_id
            summary.run_state = "finished"
            summary.actor = principal.name
            store.save_run(summary)

            # WS2-5: compliance transition — breached on fail/critical, auto-recovery on green.
            # Only objects under an active contract carry a compliance state.
            if _contract_lifecycle_map().get(object_id) == "active":
                from dq_core.contract.compliance import compute_compliance
                store.set_compliance(
                    object_id,
                    summary.contract_version or "",
                    compute_compliance(summary.results),
                    run_id,
                )

            push_event({"type": "run_finished", "run_id": run_id, "overall_status": summary.overall_status})
        except Exception as exc:
            store.set_run_state(run_id, "error", datetime.now(timezone.utc).isoformat())
            push_event({"type": "run_error", "run_id": run_id, "error": str(exc)})

    t = threading.Thread(target=_run_thread, daemon=True)
    t.start()

    return {"run_id": run_id, "status": "started"}


def _find_checks_file(object_id: str, settings) -> "Path | None":
    from pathlib import Path
    candidates = [
        Path(settings.checks_dir) / f"{object_id}.yml",
        Path(settings.checks_dir) / object_id / "checks.yml",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None

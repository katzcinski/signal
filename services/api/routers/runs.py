import asyncio
import threading
import sys
import os
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Optional

from services.api.deps import get_store, get_principal, get_environment
from services.api.schemas.runs import RunSchema, RunDetailSchema, RunTriggerRequest, RunTriggerResponse
from services.api.sse import run_progress_stream
from services.api.settings import settings

router = APIRouter(tags=["runs"])


def _run_checks_background(store, dataset: str, environment: str, run_id: str):
    """Execute checks in a background thread."""
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages"))

    try:
        store.update_run_state(run_id, "running")
        store.append_run_progress(run_id, f"Starting run {run_id} for dataset {dataset}")

        # Load checks from compiled YAML if exists
        checks_path = f"checks/{dataset}.yml"
        checks = []
        if os.path.exists(checks_path):
            import yaml
            from dq_core.engine.models import CheckDef
            with open(checks_path) as f:
                data = yaml.safe_load(f) or {}
            for c in data.get("checks", []):
                checks.append(CheckDef(
                    name=c["name"], sql=c.get("sql", ""), expect=c.get("expect", ">= 0"),
                    severity=c.get("severity", "fail"), enabled=c.get("enabled", True),
                    type=c.get("type", ""), description=c.get("description", ""),
                ))

        if not checks:
            store.append_run_progress(run_id, "No compiled checks found. Skipping.")
            store.update_run_state(run_id, "finished")
            return

        env_config = get_environment(environment)
        if not env_config:
            store.append_run_progress(run_id, f"Environment '{environment}' not configured. Cannot connect.")
            store.update_run_state(run_id, "error")
            return

        from dq_core.engine.models import DatasetConfig
        from dq_core.engine.check_engine import CheckEngine

        schema = env_config.get("schema", "")
        dataset_config = DatasetConfig(dataset=dataset, schema=schema, checks=checks)

        def on_progress(run_id, check_name, result):
            status = "PASS" if result.passed else "FAIL"
            store.append_run_progress(run_id, f"[{status}] {check_name}: {result.actual_value}")

        # NOTE: Real HANA connection would use env_config; using None for now (no live DB in dev)
        from dq_core.engine.check_engine import CheckEngine
        engine = CheckEngine(connection=None, store=store, on_progress=on_progress)
        summary = engine.run_dataset(dataset_config, triggered_by="api", actor="")
        store.append_run_progress(run_id, f"Run finished: {summary.overall_status}")
    except Exception as e:
        store.append_run_progress(run_id, f"Run error: {e}")
        store.update_run_state(run_id, "error")


@router.get("/runs", response_model=List[RunSchema])
def list_runs(limit: int = 50, store=Depends(get_store)):
    return store.list_runs(limit=limit)


@router.get("/runs/{run_id}", response_model=RunDetailSchema)
def get_run(run_id: str, store=Depends(get_store)):
    detail = store.get_run_detail(run_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Run not found")
    return detail


@router.get("/runs/{run_id}/results")
def get_run_results(run_id: str, store=Depends(get_store)):
    detail = store.get_run_detail(run_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Run not found")
    return detail.get("checks", [])


@router.get("/runs/{run_id}/diagnostics")
def get_run_diagnostics(run_id: str, check_name: str, store=Depends(get_store)):
    return store.get_diagnostics(run_id, check_name)


@router.post("/runs", response_model=RunTriggerResponse, status_code=202)
def trigger_run(req: RunTriggerRequest, background_tasks: BackgroundTasks, store=Depends(get_store)):
    import uuid
    run_id = str(uuid.uuid4())
    background_tasks.add_task(_run_checks_background, store, req.dataset, req.environment, run_id)
    return RunTriggerResponse(run_id=run_id)


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str, store=Depends(get_store)):
    return StreamingResponse(
        run_progress_stream(store, run_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

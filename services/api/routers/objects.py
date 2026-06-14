from __future__ import annotations

import hashlib
import threading
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..auth.provider import PrincipalDep
from ..deps import StoreDep, get_environment, get_inventory
from ..schemas.object_schemas import ObjectDetailOut, ObjectOut
from ..schemas.run_schemas import RunListItem, RunSummaryOut
from ..sse import make_progress_callback
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
    family_statuses = _family_status_map(store)
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
                family_status=_families_for(obj_id, family_statuses),
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


def _family_status_map(store) -> dict[str, dict[str, str]]:
    try:
        return store.get_object_family_status()
    except Exception:
        return {}


def _families_for(obj_id: str, family_map: dict[str, dict[str, str]]) -> dict[str, str]:
    fs = family_map.get(obj_id, {})
    return {
        "observability": fs.get("observability", "unknown"),
        "quality": fs.get("quality", "unknown"),
    }


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
        family_status=_families_for(object_id, _family_status_map(store)),
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


@router.get("/{object_id}/checks/{check_name}/history")
def get_check_history(
    object_id: str,
    check_name: str,
    limit: int = Query(default=50, ge=1, le=500),
    store: StoreDep = ...,
):
    """WS1-2: actual_value-Zeitreihe je Check — Sparkline- und Miner-Quelle."""
    return store.get_check_history(object_id, check_name, limit=limit)


@router.get("/{object_id}/timeseries")
def get_object_timeseries(
    object_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    store: StoreDep = ...,
):
    """UX-N1: Freshness-/Volume-Zeitreihen je Objekt mit erwartetem Baseline-Band
    (Mean ± 3σ aus `dq_baselines`) und Anomalie-Markern. Macht aus dem
    Status-Board ein Monitoring-Tool."""
    return store.get_metric_series(object_id, limit=limit)


class RunTriggerIn(BaseModel):
    environment: str = ""
    execution_mode: str = "auto"


def _active_contract_for(object_id: str) -> tuple[str, str]:
    """F3: (contract_version, contract_hash) des aktiven Contracts, sonst ('', '')."""
    import yaml
    from pathlib import Path
    base = Path(get_settings().contracts_dir)
    for ext in (".yaml", ".yml"):
        path = base / f"{object_id}{ext}"
        if path.exists():
            content = path.read_text(encoding="utf-8")
            data = yaml.safe_load(content) or {}
            if data.get("lifecycle") == "active":
                return (
                    str(data.get("version", "")),
                    hashlib.sha256(content.encode()).hexdigest()[:16],
                )
    return "", ""


def _active_contract_owner(object_id: str) -> tuple[str, list[str]]:
    """R4-2: (owned_by, owners) des aktiven Contracts für Notification-Routing."""
    import yaml
    from pathlib import Path
    base = Path(get_settings().contracts_dir)
    for ext in (".yaml", ".yml"):
        path = base / f"{object_id}{ext}"
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except Exception:
                return "", []
            if data.get("lifecycle") == "active":
                owners = data.get("owners") or []
                if not isinstance(owners, list):
                    owners = [owners]
                return str(data.get("owned_by", "")), [str(o) for o in owners]
    return "", []


@router.post("/{object_id}/run", status_code=status.HTTP_202_ACCEPTED)
def trigger_run(
    object_id: str,
    principal: PrincipalDep,
    body: RunTriggerIn = Body(default=RunTriggerIn()),
    store: StoreDep = ...,
    inventory: list[dict] = Depends(get_inventory),
):
    """Trigger a DQ run for an object. Returns run_id immediately (202). [ENGINE-FROZEN]

    [AUTHZ] Runs lösen Last auf HANA aus — viewer darf nicht triggern.
    [SCHEMA-MAP] '{schema}' aus kompilierten Checks wird HIER gebunden (G2):
    aus dem Environment, sonst aus dem Inventar-Schema des Objekts.
    """
    from dq_core.connect.db_connection import MockConnection, get_connection
    from dq_core.contract.compiler import bind_schema
    from dq_core.engine.check_engine import run_checks
    from dq_core.engine.models import DatasetConfig, RunSummary

    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Triggering runs requires steward role or higher.")

    settings = get_settings()

    obj = next(
        (o for o in inventory if (o.get("id") or o.get("technicalName") or o.get("name")) == object_id),
        None,
    )
    if not obj:
        raise HTTPException(status_code=404, detail=f"Object {object_id!r} not found")

    # Verbindung auflösen, BEVOR der Run registriert wird — fail-closed (S-13).
    env_cfg = get_environment(body.environment) if body.environment else None
    if body.environment and env_cfg is None:
        raise HTTPException(status_code=422, detail=f"Unknown environment {body.environment!r}")
    if env_cfg is None and not settings.allow_mock_connection:
        raise HTTPException(
            status_code=422,
            detail="No environment given and ALLOW_MOCK_CONNECTION=false — runs require a configured environment.",
        )

    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    contract_version, contract_hash = _active_contract_for(object_id)
    resolved_schema = (env_cfg or {}).get("schema") or obj.get("schema") or "LOCAL"

    # F2: Registry im Store, Doppellauf-Schutz über partiellen Unique-Index —
    # check-then-act-frei, auch über mehrere Worker.
    seed_summary = RunSummary(
        run_id=run_id,
        dataset=object_id,
        schema=resolved_schema,
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
        contract_version=contract_version,
        contract_hash=contract_hash,
    )
    if not store.try_begin_run(seed_summary):
        runs = store.get_runs(object_id, limit=5)
        running = next((r for r in runs if r.get("run_state") == "running"), None)
        return {"run_id": running["run_id"] if running else "", "status": "already_running"}

    def _run_thread():
        conn = None
        try:
            checks_path = _find_checks_file(object_id, settings)
            if checks_path and checks_path.exists():
                from dq_core.engine.check_engine import load_dataset_config
                config = load_dataset_config(checks_path)
            else:
                config = DatasetConfig(dataset=object_id, schema=resolved_schema)

            bind_schema(config, resolved_schema)  # [SCHEMA-MAP]

            if env_cfg is not None:
                conn = get_connection(
                    host=env_cfg.get("host", ""),
                    port=int(env_cfg.get("port", 443)),
                    user=env_cfg.get("user", ""),
                    password=env_cfg.get("password", ""),
                    schema=resolved_schema,
                )
            else:
                conn = MockConnection()  # explizit erlaubt via ALLOW_MOCK_CONNECTION

            callback = make_progress_callback(run_id, store)
            summary = run_checks(
                config,
                conn,
                results_db=None,
                on_progress=callback,
                execution_mode=body.execution_mode,
                triggered_by=principal.sub,
                gating=True,  # G6: Frische-Gate produziert skipped_stale
            )
            summary.run_id = run_id
            summary.run_state = "finished"
            summary.actor = principal.name
            summary.contract_version = contract_version
            summary.contract_hash = contract_hash
            store.save_run(summary)

            # WS5-1: Baselines aus den Zeitreihen der Obs-Checks aktualisieren —
            # Rolling-Stats (Mean/Stddev/Perzentile/MAD) für volume/freshness.
            try:
                from dq_core.obs.baselines import BaselineManager
                manager = BaselineManager(store)
                for result in summary.results:
                    if result.type not in ("row_count", "freshness", "sap_replication_lag"):
                        continue
                    history = store.get_check_history(object_id, result.name, limit=50)
                    values = []
                    for h in history:
                        try:
                            values.append(float(h["actual_value"]))
                        except (TypeError, ValueError):
                            continue
                    if values:
                        manager.update_baseline(object_id, result.name, values)
            except Exception:
                pass  # Baselines sind Beobachtung, nie Run-kritisch

            # WS2-5: compliance transition — breached on fail/critical, auto-recovery on green.
            # Only objects under an active contract carry a compliance state.
            if _contract_lifecycle_map().get(object_id) == "active":
                from dq_core.contract.compliance import compute_compliance
                previous = store.get_compliance(object_id)
                new_compliance = compute_compliance(summary.results)
                store.set_compliance(object_id, contract_version, new_compliance, run_id)
                newly_breached = new_compliance == "breached" and (
                    not previous or previous.get("compliance") != "breached"
                )
                if newly_breached:
                    # R4-1: Breach-Episode → persistentes Incident mit Timeline
                    failed = [
                        r.name for r in summary.results
                        if not r.passed and r.state == "executed"
                        and r.severity in ("fail", "critical")
                    ]
                    worst = "critical" if any(
                        r.severity == "critical" and not r.passed and r.state == "executed"
                        for r in summary.results
                    ) else "fail"
                    title = f"Contract-Breach: {object_id} v{contract_version or '?'}"
                    incident_id = store.open_incident(
                        product=object_id,
                        run_id=run_id,
                        severity=worst,
                        title=title,
                        failed_checks=failed,
                        contract_version=contract_version,
                        actor="system",
                    )
                    # R4-2: route the breach/incident-open to the owner's
                    # channel(s) (Slack/Teams/webhook). SSRF-safe per target.
                    from ..notify import notify_breach
                    owned_by, owners = _active_contract_owner(object_id)
                    space = next(
                        (o.get("space", "") for o in inventory
                         if (o.get("id") or o.get("technicalName") or o.get("name")) == object_id),
                        "",
                    )
                    notify_breach(
                        product=object_id,
                        compliance=new_compliance,
                        run_id=run_id,
                        contract_version=contract_version,
                        failed_checks=failed,
                        severity=worst,
                        title=title,
                        incident_id=incident_id,
                        owned_by=owned_by,
                        owners=owners,
                        settings=settings,
                        store=store,
                        space=space,
                    )
                elif new_compliance == "compliant" and previous and previous.get("compliance") == "breached":
                    store.auto_resolve_incidents(object_id, run_id)
        except Exception:
            store.set_run_state(run_id, "error", datetime.now(timezone.utc).isoformat())
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    t = threading.Thread(target=_run_thread, daemon=True)
    t.start()

    return {"run_id": run_id, "status": "started"}


def _find_checks_file(object_id: str, settings) -> "Path | None":
    from pathlib import Path
    base = Path(settings.checks_dir)
    candidates = [
        base / f"{object_id}.yml",
        base / f"{object_id}.yaml",
        base / object_id / "checks.yml",
        base / object_id / "checks.yaml",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None

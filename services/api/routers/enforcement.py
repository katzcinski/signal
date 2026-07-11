"""Enforcement-Materialisierung (Slice ③): Plan/Apply der Gate-Objekte im
Signal-eigenen Open-SQL-Schema (DQ_GATE_STATUS, V_DQ_GATE_STATUS,
P_DQ_ASSERT_GATE).

Plan ist reine Berechnung (Dry-Run, keine Verbindung); Apply führt die DDL
über die Space-User-Verbindung aus — doppelt gegated (Kill-Switch + Schema,
`services/api/enforcement.py`) und als Operation auditiert (ADR-0005-Kanal).
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ..auth.provider import PrincipalDep
from ..deps import StoreDep, get_environment
from ..enforcement import ensure_bootstrap, materialization_enabled
from ..settings import get_settings

router = APIRouter(prefix="/api/enforcement", tags=["enforcement"])


class EnforcementApplyIn(BaseModel):
    environment: str


@router.get("/plan")
def get_plan(principal: PrincipalDep):
    """Soll-Zustand des Signal-Schemas (Dry-Run): globale Infrastruktur
    (inkl. Bridge-Prozeduren bei Opt-in) und Split-Artefakte je Objekt
    (Slice ④/⑤). Zeigt DDL — steward+."""
    if not principal.has_role("steward", "owner", "admin"):
        raise HTTPException(status_code=403, detail="Enforcement plan requires steward role or higher.")
    settings = get_settings()
    from dq_core.enforce import bind_signal_schema, desired_objects
    from ..deps import get_inventory
    from ..enforcement import desired_split_specs

    schema = settings.datasphere_signal_schema
    include_bridge = bool(settings.enforcement_sql_bridge_enabled)
    objects = []
    for obj in desired_objects(include_bridge=include_bridge):
        objects.append({
            "name": obj.name,
            "kind": obj.kind,
            "manifest_hash": obj.manifest_hash,
            "replaceable": obj.replaceable,
            # Ohne konfiguriertes Schema bleibt der Platzhalter sichtbar —
            # der Plan ist dann Vorschau, Apply verweigert (fail-closed).
            "ddl": bind_signal_schema(obj.ddl, schema) if schema else obj.ddl,
        })
    split_specs = []
    for spec in desired_split_specs(settings, get_inventory()):
        split_specs.append({
            "object_id": spec.object_id,
            "source": spec.source,
            "clean_table": spec.clean_table,
            "quarantine_table": spec.quarantine_table,
            "released_view": spec.released_view,
            "manifest_hash": spec.manifest_hash,
            "predicates": [
                {"check": p.check_name, "type": p.check_type, "condition": p.sql}
                for p in spec.predicates
            ],
            # G6: nicht zeilenfähige Quarantäne-Checks explizit ausweisen.
            "skipped": [
                {"check": s.check_name, "type": s.check_type, "reason": s.reason}
                for s in spec.skipped
            ],
        })
    return {
        "enabled": materialization_enabled(settings),
        "signal_schema": schema,
        "bridge_enabled": include_bridge,
        "objects": objects,
        "split_artifacts": split_specs,
    }


@router.post("/apply")
def apply_plan(
    principal: PrincipalDep,
    body: EnforcementApplyIn = Body(...),
    store: StoreDep = ...,
):
    """Bootstrap der Gate-Infrastruktur anwenden. DDL im Tenant-Schema ist
    eine Betriebsentscheidung — owner/admin; jede Anwendung ist eine
    auditierte Operation."""
    if not principal.has_role("owner", "admin"):
        raise HTTPException(status_code=403, detail="Enforcement apply requires owner role or higher.")
    settings = get_settings()
    if not materialization_enabled(settings):
        raise HTTPException(
            status_code=409,
            detail="Enforcement materialization is disabled — set "
                   "ENFORCEMENT_MATERIALIZE_ENABLED=true and DATASPHERE_SIGNAL_SCHEMA.",
        )

    env_cfg = get_environment(body.environment)
    if env_cfg is None:
        raise HTTPException(status_code=422, detail=f"Unknown environment {body.environment!r}")

    from dq_core.connect.db_connection import get_connection

    op_id = str(uuid.uuid4())
    store.begin_operation(op_id, "enforcement_apply", created_by=principal.name)
    conn = None
    try:
        conn = get_connection(
            host=env_cfg.get("host", ""),
            port=int(env_cfg.get("port", 443)),
            user=env_cfg.get("user", ""),
            password=env_cfg.get("password", ""),
            schema=settings.datasphere_signal_schema,
        )
        applied = ensure_bootstrap(conn, settings, force=True)
        # Slice ④/⑤: Split-Artefakte reconcilen (Soll sicherstellen, Waisen
        # invalidieren, nach Grace droppen — DQ_Q_* nur per TTL, nie per Drop).
        from ..deps import get_inventory
        from ..enforcement import desired_split_specs, reconcile_split
        specs = desired_split_specs(
            settings, get_inventory(), default_schema=env_cfg.get("schema") or ""
        )
        reconciled = reconcile_split(conn, settings, specs)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        store.finish_operation(op_id, "error", error=str(exc))
        # Interna ins Log, generischer Fehler in die Antwort (S-14).
        raise HTTPException(status_code=502, detail="Enforcement apply failed — see server logs.") from exc
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass

    store.finish_operation(op_id, "done", result_json=json.dumps({
        "applied": len(applied), "reconciled": reconciled,
    }))
    return {
        "operation_id": op_id,
        "signal_schema": settings.datasphere_signal_schema,
        "applied_statements": len(applied),
        "reconciled": reconciled,
    }

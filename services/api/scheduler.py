"""Scheduler poller (Option E) — durable, store-backed, claim-based.

The API never runs DQ checks on a timer inside a request. Instead a single
background thread polls the ``dq_schedules`` table: every tick it asks the store
to atomically *claim* the schedules whose ``next_due_at`` has passed, then
launches each claimed run through the same path the HTTP route uses
(``objects.start_object_run``).

Multi-worker correctness
------------------------
With ≥2 uvicorn workers every worker runs its own poller. That is intentional
and safe:

* ``ResultStore.claim_due_schedules`` advances ``next_due_at`` under an
  optimistic guard, so normally only one worker claims a given slot.
* Even if two workers race and both launch, ``try_begin_run`` (the partial
  unique index ``idx_dq_runs_one_running`` on ``dataset``) rejects the second
  start with ``already_running`` — no duplicate run, just a wasted wake-up.

So the claim is an efficiency optimisation; the run-registry is the correctness
boundary. No leader election required.

This module imports only from ``services.api`` and the framework-free store; it
never lives in ``dq_core`` (G7).
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

logger = logging.getLogger("dq_cockpit.scheduler")

_thread: threading.Thread | None = None
_stop = threading.Event()


def _resolve_object(inventory: list[dict], object_id: str) -> dict | None:
    return next(
        (o for o in inventory
         if (o.get("id") or o.get("technicalName") or o.get("name")) == object_id),
        None,
    )


def _launch_due(now_iso: str) -> int:
    """Claim and launch all schedules due at ``now_iso``. Returns launch count."""
    # Lazy imports keep module import cheap and side-effect free at app build.
    from .deps import get_store, get_inventory, get_environment
    from .routers.objects import start_object_run
    from .settings import get_settings

    store = get_store()
    settings = get_settings()
    claimed = store.claim_due_schedules(now_iso)
    if not claimed:
        return 0

    inventory = get_inventory()
    launched = 0
    for sched in claimed:
        sid = sched["schedule_id"]
        object_id = sched["object_id"]
        env_name = sched.get("environment") or ""
        try:
            obj = _resolve_object(inventory, object_id)
            if obj is None:
                logger.warning("schedule %s: object %r not in inventory — skipping", sid, object_id)
                store.record_schedule_run(sid, "", "error_object_missing")
                continue

            env_cfg = get_environment(env_name) if env_name else None
            if env_name and env_cfg is None:
                logger.warning("schedule %s: unknown environment %r — skipping", sid, env_name)
                store.record_schedule_run(sid, "", "error_unknown_environment")
                continue
            if env_cfg is None and not settings.allow_mock_connection:
                logger.warning("schedule %s: no environment and mock disabled — skipping", sid)
                store.record_schedule_run(sid, "", "error_no_environment")
                continue

            result = start_object_run(
                object_id=object_id,
                obj=obj,
                env_cfg=env_cfg,
                execution_mode=sched.get("execution_mode") or "auto",
                triggered_by="scheduler",
                actor="scheduler",
                store=store,
                settings=settings,
                inventory=inventory,
            )
            store.record_schedule_run(sid, result.get("run_id", ""), result.get("status", ""))
            if result.get("status") == "started":
                launched += 1
            logger.info("schedule %s → %s (%s)", sid, result.get("status"), object_id)
        except Exception:  # a bad schedule must never kill the poller
            logger.exception("schedule %s: launch failed", sid)
            try:
                store.record_schedule_run(sid, "", "error")
            except Exception:
                pass
    return launched


def _bridge_tick() -> int:
    """Slice ⑥ (SQL-Trigger-Bridge): offene `DQ_RUN_REQUESTS` claimen und über
    denselben Ausführungspfad starten wie HTTP/Scheduler (start_object_run —
    identische Verdict-/Episode-/Compliance-Seiteneffekte, F2-Schutz greift).
    Opt-in: läuft nur mit ENFORCEMENT_SQL_BRIDGE_ENABLED + Environment."""
    from .deps import get_store, get_inventory
    from .enforcement import bridge_enabled, bridge_tick
    from .routers.objects import start_object_run
    from .settings import get_settings

    settings = get_settings()
    if not bridge_enabled(settings):
        return 0
    store = get_store()
    inventory = get_inventory()

    def _launch(object_id: str, obj: dict, env_cfg: dict | None) -> str | None:
        result = start_object_run(
            object_id=object_id,
            obj=obj,
            env_cfg=env_cfg,
            execution_mode="auto",
            triggered_by="sql_bridge",
            actor="sql_bridge",
            store=store,
            settings=settings,
            inventory=inventory,
        )
        return result.get("run_id") or None

    return bridge_tick(settings, store, inventory, launch=_launch)


def _loop(tick_seconds: int) -> None:
    logger.info("scheduler poller started (tick=%ss)", tick_seconds)
    # Wait first so app startup is not blocked and tests can drive _launch_due
    # directly without the loop firing.
    while not _stop.wait(tick_seconds):
        try:
            _launch_due(datetime.now(timezone.utc).isoformat())
        except Exception:
            logger.exception("scheduler tick failed")
        try:
            _bridge_tick()
        except Exception:
            logger.exception("bridge tick failed")
    logger.info("scheduler poller stopped")


def start(tick_seconds: int) -> None:
    """Start the background poller once per process. Idempotent."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, args=(tick_seconds,), daemon=True, name="dq-scheduler")
    _thread.start()


def stop() -> None:
    """Signal the poller to stop (best-effort; used by tests)."""
    _stop.set()
    global _thread
    _thread = None

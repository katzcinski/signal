"""Ownership-routed breach/incident notifications (R4-2).

A single generic webhook is replaced by ownership-based routing: a contract's
owner decides which channel(s) get paged, and each channel renders the breach
in its own payload shape (Slack / Microsoft Teams / generic webhook). Routing
is configured in an optional YAML file (``notifications_file``); when it is
absent, ``webhook_url`` acts as an implicit default target so existing
deployments keep working unchanged.

Security: every resolved target URL is fired through ``webhook.fire_webhook``,
which enforces the same SSRF guards (https-only, allowlist, private-IP block,
no redirects, timeout). Routing therefore can never become an SSRF bypass — a
target host that is not in ``webhook_allowlist`` is simply dropped.

Config shape (``notifications.yml``)::

    default:
      - { type: webhook, url: "https://hooks.example.com/dq" }
    routes:
      - match: { owned_by: platform }
        targets:
          - { type: slack, url: "https://hooks.slack.example.com/services/T/B/X" }
      - match: { owner: "grp:data-eng" }
        targets:
          - { type: teams, url: "https://outlook.office.example.com/webhook/..." }
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .webhook import fire_webhook

# Teams MessageCard theme colour per severity.
_SEVERITY_COLOR = {"critical": "C0392B", "fail": "E67E22", "warn": "F1C40F"}


def _load_routes(path: str) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        return {}
    try:
        return yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def _route_matches(match: dict[str, Any], owned_by: str, owners: list[str]) -> bool:
    """A route matches when every key in its ``match`` block matches the
    contract. ``owned_by`` is an equality test; ``owner`` is membership in the
    contract's ``owners`` list."""
    if not match:
        return False
    if "owned_by" in match and match["owned_by"] != owned_by:
        return False
    if "owner" in match and match["owner"] not in (owners or []):
        return False
    return True


def resolve_targets(
    routes: dict[str, Any],
    owned_by: str,
    owners: list[str],
    fallback_url: str,
) -> list[dict[str, Any]]:
    """Targets for a contract: union of matching routes, else ``default``, else
    the implicit ``webhook_url`` fallback. De-duplicated by (type, url)."""
    targets: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def _add(tgt: dict[str, Any]) -> None:
        url = tgt.get("url")
        key = (tgt.get("type", "webhook"), url or "")
        if url and key not in seen:
            seen.add(key)
            targets.append(tgt)

    for route in routes.get("routes", []) or []:
        if _route_matches(route.get("match", {}), owned_by, owners):
            for tgt in route.get("targets", []) or []:
                _add(tgt)
    if not targets:
        for tgt in routes.get("default", []) or []:
            _add(tgt)
    if not targets and fallback_url:
        _add({"type": "webhook", "url": fallback_url})
    return targets


def _format_payload(target_type: str, ctx: dict[str, Any]) -> dict[str, Any]:
    summary = f"DQ breach: {ctx['product']} v{ctx['contract_version'] or '?'} ({ctx['severity']})"
    failed = ", ".join(ctx["failed_checks"]) or "—"
    if target_type == "slack":
        return {
            "text": (
                f":rotating_light: *{summary}*\n"
                f"Failed checks: {failed}\n"
                f"<{ctx['link']}|Open in cockpit>"
            )
        }
    if target_type == "teams":
        return {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": summary,
            "themeColor": _SEVERITY_COLOR.get(ctx["severity"], "999999"),
            "title": summary,
            "sections": [
                {
                    "facts": [
                        {"name": "Product", "value": ctx["product"]},
                        {"name": "Version", "value": ctx["contract_version"] or "?"},
                        {"name": "Severity", "value": ctx["severity"]},
                        {"name": "Failed checks", "value": failed},
                        {"name": "Run", "value": ctx["run_id"]},
                    ],
                    "text": f"[Open in cockpit]({ctx['link']})",
                }
            ],
        }
    # Generic webhook — full structured context (machine-routable downstream).
    return {
        k: ctx[k]
        for k in (
            "product", "compliance", "run_id", "contract_version",
            "failed_checks", "severity", "title", "incident_id", "link", "ts",
        )
    }


def notify_breach(
    *,
    product: str,
    compliance: str,
    run_id: str,
    contract_version: str,
    failed_checks: list[str],
    severity: str,
    title: str,
    incident_id: int | None,
    owned_by: str,
    owners: list[str],
    settings: Any,
) -> None:
    """Fire breach/incident-open notifications to all routed channels.

    Non-blocking: each target is dispatched on a daemon thread. SSRF-safe via
    ``fire_webhook``. A misconfigured target never breaks the run.
    """
    routes = _load_routes(settings.notifications_file)
    targets = resolve_targets(
        routes, owned_by, owners or [], settings.webhook_url
    )
    if not targets:
        return
    ctx = {
        "product": product,
        "compliance": compliance,
        "run_id": run_id,
        "contract_version": contract_version,
        "failed_checks": failed_checks or [],
        "severity": severity,
        "title": title,
        "incident_id": incident_id,
        "link": f"/objects/{product}?run={run_id}",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    allowlist = settings.webhook_allowlist
    for tgt in targets:
        payload = _format_payload(tgt.get("type", "webhook"), ctx)
        threading.Thread(
            target=fire_webhook,
            args=(tgt["url"], payload, allowlist),
            daemon=True,
        ).start()

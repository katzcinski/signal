"""SSRF-safe outbound webhook caller for compliance breach notifications. [S6]"""
from __future__ import annotations

import ipaddress
import json
import re
import socket
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


_PRIVATE_RANGES = [
    ipaddress.ip_network(r)
    for r in [
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "127.0.0.0/8",
        "169.254.0.0/16",  # link-local
        "::1/128",
        "fc00::/7",
    ]
]


def _is_private_host(hostname: str) -> bool:
    """Return True if hostname resolves to a private/loopback address."""
    try:
        results = socket.getaddrinfo(hostname, None)
        for *_, sockaddr in results:
            addr = ipaddress.ip_address(sockaddr[0])
            if any(addr in r for r in _PRIVATE_RANGES):
                return True
        return False
    except Exception:
        return True  # fail-safe: treat unresolvable as private


def _host_in_allowlist(hostname: str, allowlist: list[str]) -> bool:
    return any(re.fullmatch(pat, hostname or "") for pat in allowlist)


def fire_webhook(
    url: str,
    payload: dict[str, Any],
    allowlist: list[str],
    timeout: int = 5,
) -> None:
    """Fire webhook with SSRF protection. Raises ValueError on policy violations.

    Safeguards (S6):
    - Host must match an entry in allowlist (regex patterns)
    - Host must not resolve to a private/loopback IP range
    - Redirects are not followed
    - Timeout enforced
    """
    if not url:
        return

    from urllib.parse import urlparse

    parsed = urlparse(url)
    hostname = parsed.hostname or ""

    if parsed.scheme != "https":
        raise ValueError(f"SSRF: webhook scheme must be https, got {parsed.scheme!r}")

    if not _host_in_allowlist(hostname, allowlist):
        raise ValueError(f"SSRF: host {hostname!r} not in WEBHOOK_ALLOWLIST")

    if _is_private_host(hostname):
        raise ValueError(f"SSRF: host {hostname!r} resolves to a private IP range")

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "dq-cockpit/1"},
        method="POST",
    )

    # No redirect following — install a handler that raises on 3xx
    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_):
            raise urllib.error.URLError("Redirects not followed (SSRF protection)")

    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=timeout):
            pass
    except Exception:
        pass  # best-effort: webhook failure must not break the main flow


def fire_webhook_async(
    product: str,
    compliance: str,
    run_id: str,
    url: str,
    allowlist: list[str],
) -> None:
    """Non-blocking wrapper — fires in a daemon thread."""
    if not url:
        return
    payload = {
        "product": product,
        "compliance": compliance,
        "run_id": run_id,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    t = threading.Thread(
        target=fire_webhook,
        args=(url, payload, allowlist),
        daemon=True,
    )
    t.start()

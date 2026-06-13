# Tool Review v2 — Remediation Status

**Stand:** 2026-06-13 · **Scope:** Follow-ups to `REVIEW_Tool_v1_Befunde.md`, delivered on
branch `claude/tool-review-improvements-7bpeyz` (PR #11).

> Context: a fresh pass over the v1 findings showed that the bulk of the v1
> criticals had already been remediated in the interim (R2–R6 work). This
> document records what v2 actually shipped, what was already in place, and what
> remains open — so the next reviewer starts from ground truth, not the stale v1
> snapshot.

---

## Shipped in v2 (PR #11)

All items verified: frontend typecheck + lint clean, production build OK, 25 FE
tests + 163 BE tests passing, lineage map visually confirmed.

| # | Area | Change |
|---|------|--------|
| 1 | Live run | Consume the existing `GET /api/stream` SSE endpoint (`useRunStream`) with a polling fallback; `LiveRunPanel` updates sub-second instead of on a 2 s tick. |
| 2 | Notifications | `services/api/notify.py` — ownership-based routing (`owned_by`/`owners` → channels) rendering Slack / Teams / generic-webhook payloads. Fires on breach/incident-open. Every target still goes through `webhook.fire_webhook`, so SSRF guards apply per target. Removed the orphaned `fire_webhook_async`. |
| 3 | Coverage perf | `coverage_summary` caches the active-contracts scan by contracts-dir signature (file set + mtimes) instead of re-parsing every YAML per request. |
| 4 | Checks lookup | `_find_checks_file` and the coverage probe accept `.yaml` as well as `.yml` (last of the glob-mismatch residue). |
| 5 | i18n | `RunDetail.tsx` hardcoded English strings routed through `i18n/de.ts`. |
| 6 | Coverage UX | Home screen leads with a contract-coverage KPI + an "unvalidated >30 days" click-through worklist. |
| 7 | Status badge | `BadgeEmbed` on the contract tab — live preview + copyable Markdown/HTML/URL for `GET /api/badge/{product}`. |
| 8 | Incident UX | `IncidentSla` time-to-acknowledge badge: open incidents unacknowledged past a severity-scaled SLA (critical 60m / fail 240m / warn 1440m) go amber then red; resolved show resolution time. List column + drawer header. |
| 9 | Miner CTA | `MinedProposalsCallout` surfaces an object's open mined proposals in its empty states (checks/contract tabs), with inline accept/reject via `useProposalAction`. |
| 10 | Map encoding | One clean SVG coverage-icon vocabulary (`coverageIcon`) — check-square / half-ring / warning-diamond / dashed-ring — shared by the canvas nodes (uniform icon-chips), the legend and the side panel. Carbon ≥3-of-4 (shape + colour + label). |

---

## Already implemented before v2 (no action needed)

The following v1 findings were resolved in the interim and were re-verified as
closed during the v2 pass:

- **Security:** JWT signature/issuer/audience verification active; PUT authz
  decides on the on-disk contract (not the request body); compiler reads the
  `guarantees:` format with 3-layer identifier defense; jsonschema + SQL-smuggle
  validator; git process-lock with 409 rebase path.
- **Architecture:** SSE backend is stateless/DB-backed (multi-worker safe);
  webhook fires on breach; full incident lifecycle (persistent incidents +
  event timeline + transitions + owner assignment); contract-version linkage on
  runs and compliance.
- **SLA-over-time:** `store.get_sla` (time-weighted uptime from the compliance
  event log) + `GET /api/contracts/{product}/sla`, surfaced in
  `ContractWorkbench`.
- **Diagnostics retention:** `DIAGNOSTICS_TTL_DAYS` enforced via
  `_cleanup_diagnostics` on store init.

---

## Open / remaining (prioritized)

1. **Column-level coverage** — coverage is object-level only; GX-style "% of
   columns with guarantees" is still missing (v1 §7.2.4). *Medium.*
2. **Richer notification triggers** — fires on breach/incident-open only; manual
   incident transitions (assign/resolve) do not notify. *Small.*
3. **Scale hardening** — pagination on `/api/incidents` and `/api/runs` list
   endpoints (the virtualized FE table is ready; the APIs are not). *Small–medium.*
4. **Tool self-observability** — structured logging + request IDs + a
   Prometheus-style metrics endpoint. *Medium.*

### Verification-only (not code gaps, unproven in the sandbox)

- **Real HANA execution path** — `allow_mock_connection` exists and local runs
  use `MockConnection`; the `hdbcli` path is not exercisable here. Needs a
  real-environment smoke test.
- **Multi-locale** — single `de.ts` (no `en`/switcher). Fine if German-only is
  intentional; flag otherwise.

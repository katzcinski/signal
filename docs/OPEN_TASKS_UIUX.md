# OPEN TASKS — UI/UX-Ausbau & Befunde · DQ & Observability Cockpit

> **Status 2026-06-22 (konsolidiert):** Der Großteil dieses Backlogs ist
> ausgeliefert. Die umgesetzten Punkte sind jetzt im implementierten Stand
> dokumentiert ([`Tooldokumentation.md`](Tooldokumentation.md) §5 API, §8 Frontend) und
> brauchen hier keinen Detail-Eintrag mehr. Diese Datei führt nur noch die
> **Status-Matrix** und die **wenigen offenen Punkte**. Historischer Kontext
> (Senior-Design-Lens-Review vom 2026-06-12 gegen Stand `b300565`) am Ende.

**Modus:** wie HANDOVER — jeder Schritt mit Acceptance, kein Merge bei rotem Gate.
Farbsemantik (Familie ⟂ Status), Mono-für-Artefakte und Carbon-≥3-von-4-Encoding
sind gesetzt und werden nicht neu verhandelt.

---

## Status-Matrix

| ID | Inhalt | Status | Dokumentiert / Beleg |
|----|--------|--------|----------------------|
| UX-F1 | Rollenmodell + Read-only-Zustände (`X-DQ-Role`, Ownership-Lock) | ✅ Done | Tooldoku §9; `claude/open-items-implementation` |
| UX-F2 | Roh-Views/native Dialoge durch designte Oberflächen ersetzt | ✅ Done | — |
| UX-F3 | Incident-Drawer als echter Dialog/Inspector | ✅ Done | Incidents-Inbox (R4-1) |
| UX-F4 | A11y-Härtung (Kontrast `--fg-3`→AA, Nav-Icon-Labels) | ✅ Done | — |
| UX-F5 | Faceted Search/Filter im Objektkatalog (URL-synced) | ✅ Done | Tooldoku §8 (`/objects`) |
| UX-F6 | Token-Disziplin Spacing/Radius + geteilte Primitives | ◑ Teilweise | Primitives + `--r-full`; Radius projektweit aus Tokens. Padding/Gap-Inline-Sweep offen |
| UX-F7 | Restpolitur (Breadcrumbs, Governance Loading/Error, Relativzeit) | ✅ Done | — |
| UX-F8 | Button-Interaktionszustände (Hover/Active/Disabled-Kontrast) | ◻ Offen | hängt an UX-F6 |
| UX-F9 | CSS-Micro-polish (::selection, FF-Scrollbar, Header-Shadow, Row-Hover) | ◻ Offen | — |
| UX-N1 | Freshness-/Volume-Zeitreihen (Band, Anomalie-Marker) | ✅ Done | Tooldoku §8 („Verlauf"-Tab) |
| UX-N2 | Alerting & Notification-Routing | ✅ Done | Tooldoku §5/§8 (`/notifications`, Migration 005/007 `match_kind`) |
| UX-N3 | Rollen-Landing „My work" | ✅ Done | Tooldoku §8 (`/my`) |
| UX-N4 | SLA/SLO-Dashboard (Burn-down, Uptime %) | ✅ Done | Tooldoku §5 (`/sla`) |
| UX-N5 | Run-Vergleich / Regressions-Diff | ✅ Done | Tooldoku §5/§8 (`/runs/compare`) |
| UX-N6 | Teilbarer Quality-Report / Data-Docs (Link/PDF) | ◻ Offen | Badge existiert (`/badge/{p}`), Report-Snapshot fehlt |
| UX-N7 | Spaltenebene-Lineage + Impact-Analyse | ◻ Offen | **blockiert durch O3** (`columnEdges`-Parser) |
| UX-N8 | Check-/Expectation-Library-Browser | ✅ Done | Tooldoku §8 (`/library`) |
| UX-N9 | Schema-Drift-/Change-Screen | ◻ Offen | — |
| UX-N10 | Status-Heatmap Objekt × Tag | ✅ Done | Tooldoku §8 (Cockpit) |
| UX-N11 | Echte Charts (Threshold-/Anomalie-Band, Zeitraum-Picker) | ✅ Done | — |
| UX-N12 | Health-Gauge mit Trendrichtung | ✅ Done | Tooldoku §8 (Cockpit) |
| UX-N13 | Diff-Viewer (Contract-Versionen & Proposals, Bedeutung) | ✅ Done | Tooldoku §5 (`/diff/active`) |
| UX-N14 | Profiling-/Sample-Row-View hinter `[PII-GATE]` | ✅ Done | Tooldoku §5/§6 (`/profile`, `ALLOW_PROFILE_SAMPLES`) |
| UX-N15 | Activity-/Audit-Feed | ✅ Done | Tooldoku §5 (`/api/activity`) |

**Offen (5):** UX-F6 (◑ teilweise — Radius/Primitives erledigt, Padding/Gap-Sweep
offen), UX-F8, UX-F9 (UI-Politur/Wartbarkeit, additiv) · UX-N6 (teilbarer Report) ·
UX-N7 (Spalten-Lineage, blockiert) · UX-N9 (Schema-Drift-Screen).

---

## Offene Punkte (Detail)

**UX-F6 Token-Disziplin Spacing/Radius + geteilte Primitives** *(Wartbarkeit)* — ◑ teilweise
Primitive-Set (`Card`, `Button`, `Field`/`Input`/`Select`, `SectionHeader`) zieht
Spacing/Radius/Shadow aus Tokens. **Radius ist jetzt projektweit token-getrieben:**
alle Inline-`borderRadius:4/5/6/8/10` → `var(--r/--r-md/--r-lg)`, Pills (`20/99/999`)
→ neues Token `--r-full`. Bewusst belassen: `0/2/3` (absichtliche Mikro-Radien an
8px-Dots/Tags — Mapping würde Quadrate zu Kreisen machen). `Panel`-Padding aus Tokens.
*Rest:* breiter Padding/Gap-Inline-Sweep (`padding`/`gap` mit px-Literalen) auf die
4px-Skala (`--s1`…`--s6`) — schrittweise, viele Werte (`10px`/asymmetrisch) brauchen
Einzelfall-Mapping.
*Acceptance:* neue Screens nutzen Primitives; Radius/Spacing kommt aus Tokens.

**UX-F8 Button-Interaktionszustände** *(hängt an UX-F6)*
Hover/Active einheitlich über das `Button`-Primitive; Disabled mit Farbton-Shift +
`cursor: not-allowed` statt reinem `opacity: 0.45` (WCAG 1.4.3).
*Acceptance:* jeder `<button>` zeigt sichtbaren Hover mit Transition; Disabled
ohne Tooltip erkennbar.

**UX-F9 CSS-Micro-polish**
`::selection` mit Accent-Farbe; Firefox-Scrollbar slim+dunkel (`scrollbar-color`/
`scrollbar-width`); sticky Table-Header `box-shadow: 0 1px 0 var(--line-2)` beim
Scrollen; Row-Hover ≥100 ms CSS-Transition + `:focus-within`.

**UX-N6 Teilbarer Quality-Report / Data-Docs** *(GX-Vorbild)*
Read-only Run-Report als Link/PDF für Nicht-Nutzer. `BadgeEmbed`/`GET /api/badge/{p}`
existiert als Tile; der vollständige, auth-gegatete Report-Snapshot fehlt noch.
*Acceptance:* öffentlich teilbarer, auth-gegateter Report-Snapshot.

**UX-N7 Spaltenebene-Lineage + Impact-Analyse** *(Datafold; blockiert)*
UI ist objektebene-only. **Blockiert durch O3** (`columnEdges`-Parser-Defekt im
Analyzer, siehe [`PLAN_Remediation_v2.md`](PLAN_Remediation_v2.md) / `REVIEW_Tool_v2_Status.md`).
*Acceptance:* Spalten-DAG + betroffene Downstream-Consumer mit Ownership aus einem
Incident heraus.

**UX-N9 Schema-Drift-/Change-Screen**
Schema-Evolution je Objekt über Zeit verfolgen; hinzugefügte/entfernte/typgeänderte
Spalten, Contract-Bruch markieren. (`diff.py` trägt Type-Narrowing erst mit Schema v2,
siehe Batch 5 „Out of scope".)
*Acceptance:* Spaltenänderungen je Objekt über Zeit, Contract-Bruch markiert.

---

## Historischer Kontext

Quelle: UI/UX-Review vom 2026-06-12 (Senior-Design-Lens) gegen Stand `b300565`,
Marktabgleich Soda/Monte Carlo/GX/dbt/Datafold. Leitidee war, die **zeitliche und
operative Dimension** (Zeitreihen/Alerting — was Soda/MC zum Monitoring statt
Reporting macht) und die **Lücke zwischen Konzept und Implementierung** (Rollenmodell,
eingebettete Lineage, designte statt Roh-Views) zu schließen. Tier 1 (UX-F1, UX-F2,
UX-N1–N4) war der demonstrative Hebel und ist vollständig ausgeliefert; die
Markt-Table-Stakes-Begründung steht in [`REVIEW_Tool_v1_Befunde.md`](REVIEW_Tool_v1_Befunde.md) §7.

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
| UX-F6 | Token-Disziplin Spacing/Radius + geteilte Primitives | ✅ Done | Primitives + `--r-full`; Radius projektweit + Padding/Gap (exakt-Token) aus Tokens |
| UX-F7 | Restpolitur (Breadcrumbs, Governance Loading/Error, Relativzeit) | ✅ Done | — |
| UX-F8 | Button-Interaktionszustände (Hover/Active/Disabled-Kontrast) | ✅ Done | Globale `button`-Regeln (index.css) + `Button`-Disabled-Tone-Shift; `Button.test.tsx` |
| UX-F9 | CSS-Micro-polish (::selection, FF-Scrollbar, Header-Shadow, Row-Hover) | ✅ Done | index.css (FF-Scrollbar, `.tbl-row` Hover/:focus-within), `Table` Sticky-Header-Shadow |
| UX-N1 | Freshness-/Volume-Zeitreihen (Band, Anomalie-Marker) | ✅ Done | Tooldoku §8 („Verlauf"-Tab) |
| UX-N2 | Alerting & Notification-Routing | ✅ Done | Tooldoku §5/§8 (`/notifications`, Migration 005/007 `match_kind`) |
| UX-N3 | Rollen-Landing „My work" | ✅ Done | Tooldoku §8 (`/my`) |
| UX-N4 | SLA/SLO-Dashboard (Burn-down, Uptime %) | ✅ Done | Tooldoku §5 (`/sla`) |
| UX-N5 | Run-Vergleich / Regressions-Diff | ✅ Done | Tooldoku §5/§8 (`/runs/compare`) |
| UX-N6 | Teilbarer Quality-Report / Data-Docs (Link/PDF) | ◻ Offen | Badge existiert (`/badge/{p}`), Report-Snapshot fehlt |
| UX-N7 | Spaltenebene-Lineage + Impact-Analyse | ◻ Offen | O3 ist **Daten-**, kein Parser-Defekt (Walker getestet). Plan: `PLAN_UX-N7_Column_Lineage.md` |
| UX-N8 | Check-/Expectation-Library-Browser | ✅ Done | Tooldoku §8 (`/library`) |
| UX-N9 | Schema-Drift-/Change-Screen | ◻ Offen | — |
| UX-N10 | Status-Heatmap Objekt × Tag | ✅ Done | Tooldoku §8 (Cockpit) |
| UX-N11 | Echte Charts (Threshold-/Anomalie-Band, Zeitraum-Picker) | ✅ Done | — |
| UX-N12 | Health-Gauge mit Trendrichtung | ✅ Done | Tooldoku §8 (Cockpit) |
| UX-N13 | Diff-Viewer (Contract-Versionen & Proposals, Bedeutung) | ✅ Done | Tooldoku §5 (`/diff/active`) |
| UX-N14 | Profiling-/Sample-Row-View hinter `[PII-GATE]` | ✅ Done | Tooldoku §5/§6 (`/profile`, `ALLOW_PROFILE_SAMPLES`) |
| UX-N15 | Activity-/Audit-Feed | ✅ Done | Tooldoku §5 (`/api/activity`) |

**Offen (3):** UX-N6 (teilbarer Report) · UX-N7 (Spalten-Lineage, blockiert) ·
UX-N9 (Schema-Drift-Screen).

---

## Offene Punkte (Detail)

**UX-F6 Token-Disziplin Spacing/Radius + geteilte Primitives** *(Wartbarkeit)* — ✅ Done
Primitive-Set (`Card`, `Button`, `Field`/`Input`/`Select`, `SectionHeader`) zieht
Spacing/Radius/Shadow aus Tokens. **Radius projektweit token-getrieben:** alle
Inline-`borderRadius:4/5/6/8/10` → `var(--r/--r-md/--r-lg)`, Pills (`20/99/999`)
→ neues Token `--r-full`. **Padding/Gap-Sweep:** ~213 Inline-Literale (numerisch +
String-Shorthands) auf die 4px-Skala (`--s1`…`--s6`) migriert — konservativ nur bei
exakter Token-Deckung (4/8/12/16/20/24), Shorthands nur wenn alle Komponenten passen.
Bewusst belassen: off-scale-Werte (`5/6/7/10/14/18…`) und Mikro-Radien (`0/2/3`) — ein
Mapping würde die Optik ändern (z. B. Quadrate zu Kreisen).
*Acceptance:* neue Screens nutzen Primitives; Radius/Spacing kommt aus Tokens. ✓

**UX-F8 Button-Interaktionszustände** *(hängt an UX-F6)* — ✅ Done
Globale `button`-Regeln in `index.css`: Transition + `:not(:disabled):hover`
(`filter: brightness(1.12)`), `:active` (`0.94`) und `:disabled { cursor:
not-allowed }`. Background-agnostisch via `filter`, daher greift es auf **jeden**
`<button>` über alle Themes ohne Kenntnis der Inline-Farben. Das `Button`-Primitive
kodiert Disabled jetzt über einen Farbton-Shift (`--bg-2`/`--fg-3`/`--line`) statt
`opacity: 0.45` (WCAG 1.4.3). Abgesichert durch `tests/Button.test.tsx`.
*Acceptance:* jeder `<button>` zeigt sichtbaren Hover mit Transition; Disabled
ohne Tooltip erkennbar. ✓

**UX-F9 CSS-Micro-polish** — ✅ Done
`::selection` mit Accent-Farbe lag bereits vor (`--selection-bg/-fg`, theme-bridged).
Ergänzt: Firefox-Scrollbar slim+getönt (`scrollbar-width: thin` + `scrollbar-color`
auf `html`, beide vererbt → wirkt überall); sticky Table-Header mit
`box-shadow: 0 1px 0 var(--line-2)`; Row-Hover/`:focus-within` jetzt als CSS-State
(`.tbl-row`, 120 ms Transition) statt JS-`onMouseEnter/Leave` — Tastatur-Fokus in
einer Zelle hebt die Zeile mit hervor.

**UX-N6 Teilbarer Quality-Report / Data-Docs** *(GX-Vorbild)*
Read-only Run-Report als Link/PDF für Nicht-Nutzer. `BadgeEmbed`/`GET /api/badge/{p}`
existiert als Tile; der vollständige, auth-gegatete Report-Snapshot fehlt noch.
*Acceptance:* öffentlich teilbarer, auth-gegateter Report-Snapshot.

**UX-N7 Spaltenebene-Lineage + Impact-Analyse** *(Datafold)*
UI ist objektebene-only. O3 ist **neu bewertet (2026-06-26): kein Parser-Defekt,
sondern ein Datenproblem.** Der CQN-Walker (`_csn_reconstructor.extract_query_details`
+ `_column_lineage.build_column_lineage`) ist implementiert und unit-getestet
(`computed`-Kanten inkl. gerenderter Expression; SQL-Pfad via sqlglot). Die API steht
ebenfalls (`GET /api/lineage/columns` → `build_column_indexes`). Blocker: die
Extract-Snapshots (`data/inventory.json`) tragen **keinen** CSN-`query`-AST/`sql`, daher
nur Seed-Platzhalter in `data/lineage.json` (alle `direct`, leere Expression).
Vollständiger Umsetzungsplan: [`PLAN_UX-N7_Column_Lineage.md`](PLAN_UX-N7_Column_Lineage.md).
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

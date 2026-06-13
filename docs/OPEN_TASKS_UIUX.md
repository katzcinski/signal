# OPEN TASKS — UI/UX-Ausbau & Befunde · DQ & Observability Cockpit

> **Status 2026-06-12:** Neu angelegt aus dem UI/UX-Review (Senior-Design-Lens) gegen den
> Stand `b300565`. Bündelt zwei Klassen offener Arbeit: **Teil A — Befunde/Mängel** (Dinge, die
> heute implementiert sind, aber unter dem Anspruch von `Konzept_DQ_Cockpit_UIUX.md` bzw. dem
> Marktabgleich Soda/Monte Carlo/GX/dbt/Datafold zurückbleiben) und **Teil B — neue Screens &
> Elemente** (Funktionslücken gegenüber State-of-the-Art-Tools). Noch nicht eingeplant in die
> R-Sequenz; bewusst als Backlog gehalten, bis priorisiert.

**Grundlage:** UI/UX-Review vom 2026-06-12 · `apps/cockpit/src` (alle 9 Screens + Primitives),
`index.css` (Tokens), `Konzept_DQ_Cockpit_UIUX.md` (Zielbild, Rollenmodell §2, Designprinzipien §1).
**Modus:** wie HANDOVER — jeder Schritt mit Acceptance, kein Merge bei rotem Gate. Boundary-Tags
und Goldene Regeln gelten unverändert. Farbsemantik (Familie ⟂ Status) und Mono-für-Artefakte sind
gesetzt und werden nicht neu verhandelt.

> **Leitidee:** Das Fundament (Token-System, objektzentrierte IA, A11y-Instinkte) ist tragfähig.
> Die offene Arbeit ist weniger Politur als **die zeitliche und operative Dimension nachziehen** —
> die Dinge, die Soda/Monte Carlo zum Monitoring statt Reporting machen — und die **Lücke zwischen
> Konzept und Implementierung** schließen (Rollenmodell, eingebettete Lineage, designte statt
> Roh-Views).

> **Umgesetzt 2026-06-13** (Branch `claude/open-items-implementation`): **UX-F1** (Rollenmodell +
> Read-only-Zustände, `X-DQ-Role`-gespiegelt, Ownership-Lock), **UX-N3** (Rollen-Landing „Meine
> Arbeit" `/my`), **UX-F4** (Kontrast `--fg-3` → AA, SVG-Nav-Icons mit aria-label, 9px-Fix),
> **UX-F7** (Breadcrumbs Objekt→Run, Governance Loading/Error, vereinheitlichte Relativzeit).
> Bereits zuvor erledigt: UX-F2, UX-F3, UX-F5, UX-N4, UX-N8.

## Übersicht & Priorisierung

| ID | Inhalt | Klasse | Tier | Aufwand (PT) | hängt ab von |
|----|--------|--------|------|--------------|--------------|
| UX-F1 | Rollenmodell + Read-only-Zustände einlösen (Konzept §2) | Befund | 1 | 5–8 | — |
| UX-F2 | `window.prompt`/Roh-JSON/Lineage-Platzhalter durch designte Views ersetzen | Befund | 1 | 2–3 | — |
| UX-F3 | Incident-Drawer als echter Dialog (Focus-Trap, ESC, Scrim) oder klarer Inspector | Befund | 2 | 1–2 | — |
| UX-F4 | A11y-Härtung: Kontrast `--fg-3`, Mindest-Schriftgrößen, Nav-Icon-Labels | Befund | 2 | 2–3 | — |
| UX-F5 | Faceted Search/Filter im Objektkatalog (Volltext + Familie/Status/Owner/Coverage) | Befund | 2 | 2–3 | — |
| UX-F6 | Token-Disziplin für Spacing/Radius; geteilte Primitives (Card/Button/Field) | Befund | 3 | 3–5 | — |
| UX-F7 | Restpolitur: Breadcrumbs, Bulk-Aktionen, Governance Loading/Error, Toast-Nutzung | Befund | 3 | 2–4 | UX-F6 |
| UX-N1 | Freshness- & Volume-Zeitreihen (erwartetes Band, Anomalie-Marker) | Neu | 1 | 6–9 | — |
| UX-N2 | Alerting & Notification-Routing-Screen (Kanäle, Regeln, Mute, Eskalation) | Neu | 1 | 6–9 | — |
| UX-N3 | Rollen-Landing „My work" (zugewiesene Incidents, eigene Domänen, offene Proposals) | Neu | 1 | 3–5 | UX-F1 |
| UX-N4 | SLA/SLO-Dashboard (Burn-down, Uptime %) auf `useContractSla` | Neu | 1 | 3–5 | — |
| UX-N5 | Run-Vergleich / Regressions-Diff (neu rot vs. erholt) | Neu | 2 | 3–5 | — |
| UX-N6 | Teilbarer Quality-Report / Data-Docs (read-only Link/PDF) auf `BadgeEmbed` | Neu | 2 | 3–5 | — |
| UX-N7 | Spaltenebene-Lineage + Impact-Analyse (betroffene Downstream-Consumer) | Neu | 2 | 5–8 | O3 (Parser) |
| UX-N8 | Check-/Expectation-Library-Browser auf `check_library.json` | Neu | 2 | 3–5 | — |
| UX-N9 | Schema-Drift-/Change-Screen (Breaking Changes vs. Contract) | Neu | 2 | 4–6 | — |
| UX-N10 | Status-Heatmap Objekt × Tag (At-a-glance-Verlässlichkeit) | Neu | 3 | 2–3 | UX-N1 |
| UX-N11 | Echte Charts mit Threshold-/Anomalie-Band + globaler Zeitraum-Picker (recharts) | Neu | 3 | 3–4 | UX-N1 |
| UX-N12 | Health-Gauge mit Trendrichtung statt statischem % | Neu | 3 | 1–2 | UX-N11 |
| UX-N13 | Diff-Viewer für Contract-Versionen und Proposals (Bedeutung, nicht nur zwei Spans) | Neu | 3 | 2–3 | — |
| UX-N14 | Profiling-/Sample-Row-View hinter `[PII-GATE]` | Neu | 3 | 3–5 | — |
| UX-N15 | Activity-/Audit-Feed (wer hat welchen Contract approved/Incident gelöst) | Neu | 3 | 2–3 | — |

**Brutto ≈ 72–106 PT.** Tier-1 (UX-F1, UX-F2, UX-N1–N4) ist der demonstrative Hebel: schließt
Konzeptschuld + die größte Markt-Lücke (Zeitreihen/Alerting). Tier 3 ist parallelisierbar und
großteils additiv.

> **Wenn nur drei Dinge zuerst:** (1) eine echte Zeitreihen-Oberfläche (UX-N1) — der Unterschied
> zwischen „Status-Board" und „Observability-Tool"; (2) Rollenmodell + Read-only (UX-F1) — überall
> versprochen, nirgends da; (3) die drei billigen „Wirkt-unfertig"-Fixes (UX-F2).

---

## Teil A — Befunde / Mängel

**UX-F1 Rollenmodell + Read-only-Zustände einlösen** *(Konzept §2; größte Konzept↔Impl-Drift)*
Heute: statischer `steward`-Pill hartkodiert (`Topbar.tsx:55`), kein Wechsel, keine Read-only-Banner,
keine `owned_by`-Lock-Icons. Das Konzept fordert Operator/Steward/Platform-Owner mit
rollenabhängigem Default-Landing, Nav-Reihenfolge, Dichte und Schreibrechten.
- Rollenkontext (Store) + Rollenwechsler oben links wie im Prototyp.
- Read-only nicht verstecken, sondern **markieren**: Banner „Nur-Lese-Ansicht", deaktivierte
  Primäraktionen mit Hinweis-Tooltip. Mentales Modell bleibt für alle Rollen identisch.
- `owned_by` (platform vs. product) pro Check als Lock-Icon/Ownership-Tag (Dual-Ownership).
*Acceptance:* Rollenwechsel ändert Default-Landing + Nav-Reihenfolge; als Operator sind Schreib-
Primäraktionen (Contract approve, Proposal accept) sichtbar aber deaktiviert mit Begründung; `[AUTHZ]`
bleibt serverautoritativ, FE spiegelt nur.

**UX-F2 Roh-Views/native Dialoge durch designte Oberflächen ersetzen** *(„wirkt unfertig")*
- `window.prompt()` für Incident-Notiz/Owner (`Incidents.tsx:40`) → Inline-Form/Textarea im Drawer.
- Contract-Tab `JSON.stringify(contract,…)` im `<pre>` (`ObjectDetail.tsx:165`) → strukturierte
  Contract-Ansicht (Garantien gruppiert, Severity-Pills, SLA).
- Lineage-Tab ist nur ein Link (`ObjectDetail.tsx:181`) → eingebettetes Mini-DAG (Fokusknoten +
  1 Hop), löst das „alles konvergiert am Objekt"-Versprechen ein.
- `sonner` ist Dependency, aber Mutations-Feedback ist nur inline — Toasts für Aktionsbestätigung nutzen.
*Acceptance:* kein `window.prompt`/`window.confirm` mehr im `apps/cockpit`-Quellbaum; Contract-Tab
rendert ohne `JSON.stringify`; Lineage-Tab zeigt ≥1 Knoten ohne Navigation; erfolgreiche Mutation → Toast.

**UX-F3 Incident-Drawer: echter Dialog oder klarer Inspector** *(`Incidents.tsx:48`)*
Heute `aria-modal="false"`, kein Focus-Trap, kein Focus-Move-in, kein ESC, kein Scrim — Inhalt
dahinter bleibt voll interaktiv, sieht aber wie ein Modal-Sheet aus.
- Entweder: getrappter Dialog mit Backdrop, Focus-in beim Öffnen, ESC + Backdrop-Klick schließt,
  Focus-Restore beim Schließen.
- Oder: bewusst nicht-blockierender Inspector — dann optisch als Panel (kein Sheet-Schatten), Layout
  schiebt statt überlagert.
*Acceptance:* Tastatur-Nutzer kann Drawer mit ESC schließen, Fokus landet zurück auf der Zeile; axe-Lauf
ohne Dialog-Verstoß.

**UX-F4 A11y-Härtung: Kontrast, Schriftgröße, Icon-Semantik**
- `--fg-3` (#5E6877) auf `--bg-1` (#13161C) bei 10–11px (9px in `Proposals.tsx:70`) liegt unter
  4.5:1 / unter komfortabler Mindestgröße. Sekundärtext-Token oder -Größe anheben.
- Nav-Glyphen (⬡ ⊞ ⟁ ⚑, `Sidebar.tsx`) rendern plattformabhängig inkonsistent und sind ohne
  aria-label; kollabierte Leiste zeigt nur diese ohne Tooltip. Echtes Icon-Set (lucide) + `title`/aria.
*Acceptance:* Kontrast-Audit aller `fg-3`-Textstellen ≥ AA (4.5:1 für <18px); jeder Nav-Eintrag hat
zugängliches Label auch kollabiert.

**UX-F5 Faceted Search/Filter im Objektkatalog** *(`ObjectCatalog.tsx:77`)*
Heute nur ein Space-`<select>` + Spaltensortierung. Ab ~50 Objekten unbrauchbar.
- Volltextsuche (Name/Space/Owner) + Filter-Chips für Familie/Status/Owner/Coverage; URL-synced.
*Acceptance:* Mehrfach-Facetten kombinierbar, in URL persistiert, leeres Ergebnis hat designten Empty-State.

**UX-F6 Token-Disziplin Spacing/Radius + geteilte Primitives** *(Wartbarkeit)*
Radius-Tokens (`--r/--r-md/--r-lg`) existieren, Code hardkodiert aber `borderRadius:5/8` und Paddings
16/20/24 in hunderten Inline-Styles. Single-Source gilt nur für Farbe.
- Kleines Primitive-Set (`Card`, `Button`, `Field`, `SectionHeader`), das Spacing/Radius/Shadow aus
  Tokens zieht; Inline-Style-Duplikate schrittweise migrieren.
*Acceptance:* neue Screens nutzen Primitives; Radius/Spacing kommt aus Tokens, nicht aus Erinnerung.

**UX-F7 Restpolitur**
- Breadcrumbs für tiefe Pfade (Objekt → Run → Lineage) statt nur Back-Button.
- Bulk-Aktionen für Incidents/Proposals (Mehrfach-Acknowledge/Assign/Accept).
- Governance ohne Loading/Error-States (`Governance.tsx`) — auf Peer-Niveau bringen.
- Drawer-Timeline zeigt rohes `ev.at`, Tabelle nutzt Relativzeit — vereinheitlichen.
- Responsiveness bewusst entscheiden (fixe max-widths, `repeat(4,1fr)`-KPIs, 420px-Drawer).

---

## Teil B — Neue Screens & Elemente

### Tier 1 — schließt die größten Wettbewerbslücken

**UX-N1 Freshness- & Volume-Zeitreihen** *(Monte Carlo/Soda-Kern; größte Observability-Lücke)*
Heute ist Historie auf eine 80px-Sparkline reduziert (`ObjectDetail.tsx` `HistorySpark`); `recharts`
liegt ungenutzt. Pro Objekt: Zeitreihe mit erwartetem Band, Anomalie-Marker, „last arrival", Row-Count-
Delta, Zeitraum-Picker. Macht aus dem Status-Board ein Monitoring-Tool.
*Acceptance:* Objektdetail zeigt Freshness- und Volume-Verlauf über wählbaren Zeitraum; Band aus
Baseline (`obs/baselines.py`), Anomalien markiert; „seit wann driftet das?" beantwortbar.

**UX-N2 Alerting & Notification-Routing** *(Soda/MC)*
Kein Weg, zu sagen *wer benachrichtigt wird*. Screen für Kanäle (Slack/E-Mail/PagerDuty),
Routing-Regeln, Zeitpläne, Mute-/Maintenance-Fenster, Eskalation.
*Acceptance:* Regel „Critical auf Space X → Kanal Y" anlegbar; Mute-Fenster unterdrückt Benachrichtigung
nachweislich; Routing serverseitig autoritativ.

**UX-N3 Rollen-Landing „My work"** *(Konzept §2; braucht UX-F1)*
Default-Home je Rolle: zugewiesene Incidents, Health der eigenen Domänen, offene Proposals.
*Acceptance:* Steward landet auf eigenen Produkten + offenen Proposals; Operator auf Health/Incidents.

**UX-N4 SLA/SLO-Dashboard** *(Daten bereits da: `useContractSla`)*
SLAs als SLOs mit Burn-down + Uptime %, nicht nur `maxAge`-Feld.
*Acceptance:* je Contract SLO-Erfüllung über Zeitraum + Restbudget sichtbar.

### Tier 2 — Tiefe für Power-User

**UX-N5 Run-Vergleich / Regressions-Diff** *(GX Data Docs, dbt)* — zwei Runs wählen, neu-rot vs.
erholt sehen. *Acceptance:* Diff zweier `run_id` listet Statuswechsel je Check.

**UX-N6 Teilbarer Quality-Report / Data-Docs** *(GX; `BadgeEmbed` existiert)* — read-only Run-Report
als Link/PDF für Nicht-Nutzer. *Acceptance:* öffentlich teilbarer, auth-gegateter Report-Snapshot.

**UX-N7 Spaltenebene-Lineage + Impact-Analyse** *(Datafold; Backend `_column_lineage`)* — UI ist
objektebene-only; aus Incident betroffene Downstream-Consumer + deren Owner zeigen. *Blockiert durch O3*
(`columnEdges`-Parser-Defekt, siehe `PLAN_Remediation_v2.md`). *Acceptance:* Spalten-DAG + Consumer-Liste
mit Ownership aus Incident heraus.

**UX-N8 Check-/Expectation-Library-Browser** *(GX-Gallery/Soda; `check_library.json`)* — durchsuchbarer
Katalog mit Beschreibung/Parametern, „zu Contract hinzufügen" statt nur Garantie-Authoring.
*Acceptance:* Library durchsuchbar; Auswahl erzeugt Garantie-Eintrag im Workbench.

**UX-N9 Schema-Drift-/Change-Screen** — Schema-Evolution verfolgen, Breaking Changes vs. Contract
flaggen. *Acceptance:* hinzugefügte/entfernte/typgeänderte Spalten je Objekt über Zeit, Contract-Bruch markiert.

### Tier 3 — grafische/logische Elemente

**UX-N10 Status-Heatmap Objekt × Tag** (GitHub-Contribution-Stil) auf Home/Objektdetail. *(braucht UX-N1)*
**UX-N11 Echte Charts mit Threshold-/Anomalie-Band + globaler Zeitraum-Picker** (recharts). *(braucht UX-N1)*
**UX-N12 Health-Gauge mit Trendrichtung** statt statischem % (`Cockpit.tsx:82` gibt kein `sparkData`). *(braucht UX-N11)*
**UX-N13 Diff-Viewer** für Contract-Versionen und Proposals — *Bedeutung* von `current_expect → proposed_expect`, nicht nur zwei Code-Spans (`Proposals.tsx`).
**UX-N14 Profiling-/Sample-Row-View** mit Spaltenstatistik/Verteilung/Beispielzeilen hinter `[PII-GATE]` (Default off, Allowlist).
**UX-N15 Activity-/Audit-Feed** — wer hat welchen Contract approved, wer welchen Incident gelöst.

---

*Quelle: UI/UX-Review 2026-06-12. Dateibezüge gegen Stand `b300565`. Reihenfolge ist Vorschlag, keine
gesetzte Sequenz — vor Einplanung mit R-Roadmap und Marktabgleich §7 abgleichen.*

# HANDOVER: UI-Konsistenz-Initiative (Stand 2026-07-02)

Branch `claude/tool-ui-design-review-8qsy67`. Ziel der Initiative: alle
Hauptseiten des Cockpits auf den Standard der optimierten Objekte-Seiten
heben. Dieses Dokument übergibt die restlichen Aufgaben.

## 1. Artefakte & bisheriger Stand

| Artefakt | Inhalt |
|---|---|
| `docs/REVIEW_UI_Konsistenz_Hauptseiten_2026-07.md` | Vollständiger Befund je Seite + Querschnittsthemen (§2) und Priorisierung (§5) — die fachliche Grundlage dieser Übergabe |
| `docs/workbench-redesign-proposal.html` | Freigegebenes Design-Proposal für die Contract-Workbench (selbstständiges HTML, offline lauffähig) |
| `docs/assets/workbench-redesign-proposal.png` | Screenshot des Proposals |

Bereits umgesetzt (Commits auf diesem Branch):

- `72aeee4` — **Objekt-Detail-Hero**: Fakten-Zeile statt raggedem Grid,
  Meta-Zeile mit Labeln (Space/Layer/Schema), Zurück-Button entfernt,
  Summary-Karten fluchten (Mono-Eyebrow, feste Wertzeile, Hinweis unten
  verankert), letzter Run als relative Zeit. Skeleton + Tests angepasst.
- `5dca09f` — **Cockpit/Meine Arbeit KPIs**: Delta auf eigener Zeile,
  neutrale Deltas grau, alle Kacheln als Deep-Links (`Kpi`-Prop `onClick`),
  deutsche Prozentformate, Status-Grid-Skeleton, responsives KPI-Grid.
- `84ae915` — **Objektliste**: `StatusPill` übersetzt zentral über
  `t.status`; Objektfamilien-Map `t.objects.family`; relative
  „Letzter Lauf“-Zeiten; Suchfeld breiter; Trefferzähler.
- `98b7ddf` — **Quick-Wins**: Proposals-i18n + Karten-Skeleton; Produkte-
  Suche mit URL-State; Compliance auf `Table`-Komponente + `dash-2col` +
  i18n-Banner; Incidents-Drawer als `?id=`-Deep-Link (Cockpit/Meine Arbeit
  öffnen den konkreten Incident); Workbench-Fehlertoast nach `de.ts`.

Verifiziert: `tsc --noEmit`, `eslint --max-warnings 0`, 194/194 vitest,
Live-Screenshots gegen den Dev-Server (siehe §4).

## 2. Offene Aufgaben (priorisiert)

### P1 — Gemeinsame Primitives (macht alles Weitere billig)

1. **`PageHeader`-Primitive** (`components/ui/`): Titel (`--fs-h2`,
   einheitliche Margin), optionaler Untertitel, rechter Slot für
   Suche/Aktionen. Danach auf allen Listenseiten einsetzen — Titel
   schwanken heute zwischen 18/20 px und Margin 10–20 px.
2. **`FilterChip`-Primitive**: Der identische `chipBtn`-Stil ist in
   `ObjectCatalog.tsx`, `CheckLibrary.tsx` und `Incidents.tsx` handkopiert
   (Proposals' `GroupByControl` ist eine vierte Variante). Eine Komponente
   mit `active`-Prop; `aria-pressed` mitgeben.
3. **Incidents-Drawer auf `SidePanel` portieren**: `SidePanel`
   (`components/ui/SidePanel.tsx`) hat die echte Fokus-Falle, der
   handgebaute `IncidentDrawer` nur Escape + Initialfokus. Dabei
   `drawerBtn` durch `ui/Button` ersetzen.
4. **Skeleton-Vereinheitlichung**: `CheckLibrary` (Karten-Grid) und
   `RunDetail` zeigen noch „Laden…“-Text.

### P2 — Meine Arbeit

- Attention-Band-artige Zusammenfassung oben (Muster
  `ObjectAttentionBand`) statt vier gleichwertiger Panels; das Wichtigste
  („2 kritische Incidents mir zugewiesen“) muss vor dem Scrollen sichtbar sein.
- Panel-Skeletons; fehlendes `ErrorBanner` für die Objects-Query;
  Panels über `gap` statt `marginTop`-Wrapper stapeln.
- Die Incident-Deep-Links (`?id=`) sind bereits verdrahtet.

### P3 — Proposals & Incidents Feinschliff

- Proposals: Status-Filter (offen/bewertet) als Chips; `groupBy` per
  `useSearchParamState` in die URL.
- Incidents: Zählwerte an den Status-Tabs. Achtung: `useIncidents(status)`
  lädt serverseitig nur den aktiven Status — Counts brauchen entweder
  einen Summary-Endpoint oder einen ungefilterten Fetch.
- Severity-Filter auf die Incident-Tabs ausweiten (existiert nur im
  Checks-Tab).

### P4 — RunDetail & Schedules

- RunDetail: Statistikzeile (Total/Passed/Failed/Warnings) auf das
  `ObjectSummaryCard`-Grid; „Nur Fehlschläge“-Filterchip bzw.
  Failures-first-Sortierung; `ui/Button` für CSV/Vergleich.
- Schedules: Filter + Suche per `useSearchParamState`; lokale `Tile` durch
  das Summary-Card-Muster ersetzen.

### P5 — Cockpit/Library Feinschliff

- Cockpit: SLA-Panel auf `Table`; Titel auf Token.
- CheckLibrary: `chipBtn` auf die gemeinsame Primitive (P1.2).

### P6 — Contract-Workbench-Umbau (eigener Pass, Design freigegeben)

Vorlage: `docs/workbench-redesign-proposal.html` (+ §4 des Reviews).

- Hero + Attention-Band nach Objekte-Muster (Titel, Kind/Lifecycle-Tags,
  Aktiv-vs-Entwurf-Versionsstreifen, Aktionen mit Ungespeichert-Indikator;
  Breaking-Change-Band mit G3-Hinweis).
- Zweistufige Navigation (`?tab=`): *Definition* (Garantien /
  Check-Builder / Metadaten & Ports), *Prüfung & Diff*, *Betrieb & SLA* —
  ersetzt die eine Scroll-Säule des `EditorPane`.
- Garantien als „Kanalzüge“: Toggle, Parameter, Severity + beobachtete
  Realität (letzter Messwert, Sparkline, PASS/FAIL) und Miner-Vorschlag
  inline („Übernehmen“).
- „Vertragsblatt“ als sticky rechte Spalte: Versionssprung, YAML-Diff,
  **Freigabepfad** (Speichern → G1 → Kompilieren/Dry-Run → G3 → Aktivieren)
  als Leiterbahn mit Pins; „Aktivieren“ sitzt am Ende des Pfads und ist
  bis zur G3-Bestätigung gesperrt.
- Technisch: `ContractWorkbench.tsx` (1 666 Zeilen) nach
  `components/workbench/` aufteilen — `GuaranteeEditor`, `CheckBuilder`,
  `CompilePanel`, `BreakingDiffPanel`, `ContractList` sind bereits sauber
  geschnitten und nur auszulagern. `btnStyle` → `ui/Button`, Skeletons,
  `minHeight: 600` durch flexible Höhe ersetzen.

## 3. Technische Hinweise & Stolpersteine

- **`setSearchParams`-Clobber**: Zwei `setSearchParams`-Aufrufe im selben
  Tick überschreiben sich (react-router komponiert funktionale Updater
  nicht). Kombinierte Übergänge in *einer* Navigation schreiben — siehe
  `selectTab` in `Incidents.tsx` und `showInFrame` in
  `ContractWorkbench.tsx`.
- **`StatusPill` übersetzt jetzt zentral** (`t.status`-Map, Fallback auf
  den Rohwert). Neue Status-Strings brauchen einen Eintrag in `t.status`;
  Tests dürfen keine rohen Status-Strings (`pass`, `fail`) mehr erwarten.
- **Entfernte i18n-Keys**: `objectDetail.hero.objectContext/healthLabel/
  familyLabel` existieren nicht mehr; neu: `hero.schemaLabel`,
  `objects.family`, `objects.resultCount(:All)`,
  `proposals.reviewInContract`, `lineage.promotionFailed`,
  `governance.noActiveContracts`, `products.searchPlaceholder`.
- **Seed-Nebenwirkung**: `scripts/seed.py` schreibt
  `contracts/DEMO_BUS_06.yaml` um (u. a. `mode: open → closed` — wäre ein
  G3-Breaking-Change!). Nach lokalem Seeden vor dem Commit
  `git checkout -- contracts/` bzw. den `git status` prüfen.
- **i18n-Regel**: Sämtliche Nutzertexte in `src/i18n/de.ts` — mit echten
  Umlauten; keine Inline-Strings in Komponenten.

## 4. Lokale Umgebung & Verifikation

```bash
make install                      # pip- und npm-Abhängigkeiten
SQLITE_DB=signal.db make seed     # Demo-Daten (siehe Seed-Hinweis oben!)
make dev-backend                  # FastAPI auf 127.0.0.1:8000
make dev-frontend                 # Vite auf localhost:5173

cd apps/cockpit
npm run typecheck && npm run lint && npm run test -- --run
```

Screenshots headless (Standard-Theme „signal“; `--virtual-time-budget`
ist nötig, sonst schießt Chromium vor dem Font-/Datenladen):

```bash
chromium --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1660,1100 \
  --virtual-time-budget=15000 --screenshot=out.png \
  "http://localhost:5173/objects/DEMO_BUS_01"
```

Reiche Demo-Objekte: `DEMO_BUS_01/02/06` (Contract, kritisch, 4 Checks),
`DEMO_HARM_01` (Quality, kritisch). Incidents: `/incidents?id=1` öffnet
den Drawer per Deep-Link.

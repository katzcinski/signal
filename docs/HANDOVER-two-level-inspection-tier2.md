# Handover — Zwei-Ebenen-Inspektion, Tier 2

Übergabe für die nächste Ausbaustufe der **Zwei-Ebenen-Inspektion** (Quick-Checks-
Popover + rechtes Betriebs-Panel). Tier 0/1 sind gebaut und gemerged; dieses
Dokument beschreibt, wie Tier 2 auf **denselben** wiederverwendbaren Hook
aufsetzt — ohne die UI zu überfrachten.

## Stand (was schon existiert)

| Fläche | Status | Datei |
| --- | --- | --- |
| Objekte-Seite (Katalog) | ✅ live | `apps/cockpit/src/pages/ObjectCatalog.tsx` |
| Cockpit-Status-Grid | ✅ live | `apps/cockpit/src/pages/Cockpit.tsx` |
| Cockpit-Hotspots (AttentionPanel) | ✅ Tier 1 | `apps/cockpit/src/components/AttentionPanel.tsx` |
| Status-Heatmap | ✅ Tier 1 | `apps/cockpit/src/components/StatusHeatmap.tsx` |
| **Compliance / Governance** | ⏳ **Tier 2a** | `apps/cockpit/src/pages/Compliance.tsx` |
| **Product-Detail (Ports + Interior)** | ⏳ **Tier 2b** | `apps/cockpit/src/pages/ProductDetail.tsx` |
| Lineage-Graphen | 🔮 Tier 3 (später) | `LineageMiniGraph`, `LegacyLineageMap`, `MiniLineageSection` |

Die beiden Ebenen-Komponenten sind unverändert wiederverwendbar:
`ObjectChecksPopover` (Ebene 1) und `ObjectPeek` (Ebene 2). **Nicht** kopieren —
immer über den Hook einbinden.

## Der Hook — die einzige Integrations-API

`apps/cockpit/src/hooks/useObjectInspection.tsx`

```ts
const { openChecks, openPeek, overlays } = useObjectInspection();
```

- `openChecks(objectId: string, event: MouseEvent<HTMLElement>)` → Quick-Checks-
  Popover am Klickpunkt. Ruft intern `event.stopPropagation()` — an einer
  Tabellenzelle also gefahrlos neben einem Zeilen-Klick nutzbar.
- `openPeek(objectId: string)` → rechtes Betriebs-Panel (`ObjectPeek`).
- `overlays: ReactNode` → rendert Popover **und** Panel. Genau **einmal** pro
  Aufrufer am Ende des JSX platzieren.

Das Popover bietet selbst „Betrieb öffnen" (→ Panel) und „Vollansicht öffnen"
(→ `/objects/:id`) an; das Panel bietet „Vollansicht öffnen". Die Verlinkung der
Ebenen ist damit erledigt — Integratoren müssen sie nicht nachbauen.

## Verbindliches Muster (aus Tier 0/1)

1. **Eine Hook-Instanz pro Seite.** Grid, Hotspots und Heatmap im Cockpit teilen
   sich *eine* Instanz, damit nie zwei Panels übereinander liegen. Für
   Product-Detail heißt das: **eine** Instanz auf Seitenebene, an *beide*
   Tabellen (Ports + Interior) durchgereicht — nicht je Tabelle eine eigene.
2. **Kind-Komponenten bekommen einen optionalen `onInspect`-Prop** mit
   Navigations-Fallback, damit sie eigenständig nutzbar bleiben:
   ```ts
   onInspect?: (objectId: string, event: MouseEvent<HTMLElement>) => void;
   // ...
   onClick={e => onInspect ? onInspect(id, e) : navigate(`/objects/${id}`)}
   ```
   Vorlage: `AttentionPanel.tsx` / `StatusHeatmap.tsx`.
3. **Trigger-Buttons in Tabellenzellen** brauchen `event.stopPropagation()` im
   `onClick` (macht der Hook) **und** ein `onKeyDown={e => e.stopPropagation()}`,
   sonst feuert der tastaturbedienbare Zeilen-Klick (`role="button"`,
   Enter/Space, siehe `Table.tsx:57`) doppelt. Vorlage: die Checks-Zelle in
   `Cockpit.tsx` / `ObjectCatalog.tsx`.
4. **Barrierefreiheit / i18n:** Trigger-Buttons kriegen ein `aria-label`.
   Bestehende Keys wiederverwenden: `t.peek.openChecksFor` (`'Checks für {name}
   anzeigen'`) und, wenn eine Checks-Zähler-Spalte sinnvoll ist,
   `t.objects.colChecks` (`'Checks'`). Neue Strings **nur** deutsch und
   zentral in `src/i18n/de.ts`.

## Tier 2a — Compliance / Governance

`apps/cockpit/src/pages/Compliance.tsx` (Zeile ~82 Spalten, ~178 `<Table>`).

Die Tabelle rendert `ObjectSummary`-Zeilen und **hat `check_count`** — d.h. sie
kann Cockpit **1:1** spiegeln:

- Import: `import { useObjectInspection } from '@/hooks/useObjectInspection';`
- Im Component: `const { openChecks, openPeek, overlays } = useObjectInspection();`
- Spalte `object` (aktuell `render: o => o.name`): Namen in einen Button wandeln,
  der `navigate('/objects/' + o.id)` aufruft (Weg zur Vollansicht bleibt), mit
  `e.stopPropagation()`.
- **Neue Spalte `checks`** mit `t.objects.colChecks`: Zähler-Button wie in
  `Cockpit.tsx` (`aria-label={t.peek.openChecksFor…}`, `onClick={e =>
  openChecks(o.id, e)}`, `onKeyDown` stoppt Propagation), Inhalt `o.check_count`.
- `<Table onRowClick={o => navigate(...)}>` → `onRowClick={o => openPeek(o.id)}`.
- Am Ende des `return`-JSX `{overlays}` rendern.
- Skeleton `TableSkeleton columns={3}` → `columns={4}` (neue Spalte).
- `navigate` bleibt importiert (für den Namens-Button).

**Hinweis zum Kontext:** Governance beantwortet primär *Contract-Abdeckung*.
Das Popover (schnelle Check-Triage) passt gut; das Betriebs-Panel ist etwas
tangential, schadet aber nicht — konsistent mit den anderen Objektlisten.

## Tier 2b — Product-Detail (Ports + Interior)

`apps/cockpit/src/pages/ProductDetail.tsx` (Ports-Spalten ~159, Interior ~186,
beide `<Table>` ~314–320).

**Wichtiger Unterschied zu 2a:** Diese Tabellen nutzen **Link-Zellen** und
**kein** `onRowClick`, und die Zeilentypen sind `ProductPort` (Schlüssel
`row.dataset`) bzw. `ProductInterior` (Schlüssel `row.id`) — **nicht**
`ObjectSummary`, also **kein `check_count`**. Deshalb:

- **Eine** Hook-Instanz auf Seitenebene anlegen, `{overlays}` einmal (z.B. am
  Ende der `product-shell`) rendern.
- Beiden Tabellen `onRowClick={row => openPeek(row.dataset /* bzw. row.id */)}`
  geben. Der bestehende `<Link>` in der ersten Spalte bleibt der direkte Weg zur
  Vollansicht.
- **Kein Zähler** verfügbar → statt einer Checks-Zähler-Spalte einen kompakten
  **Inspect-Icon-Button** pro Zeile (eigene schmale Spalte) einführen, der
  `openChecks(id, e)` aufruft. Vorschlag: bestehendes `IconBtn`-Primitive
  (siehe `Schedules.tsx`) mit `t.peek.openChecksFor` als Titel/Label.
  - Alternativ (leichter, weniger Chrome): den Objekt-`<Link>` belassen und den
    Icon-Button weglassen — dann bleibt Ebene 1 (Popover) auf dieser Seite aus
    und nur Ebene 2 (Zeilen-Klick → Panel) kommt hinzu. **Entscheidung dem
    Reviewer überlassen** (siehe offene Frage unten).
- `ProductPort`/`ProductInterior` liefern `compliance`/`coverage_flag`, aber der
  Popover lädt seine Check-Liste ohnehin selbst per `objectId` — es ist **kein**
  zusätzliches API-Feld nötig.

## Nicht anfassen (bewusst ausgelassen)

- **CommandPalette** — Tastatur-Launcher, ein maus-verankertes Popover bricht das
  Paradigma.
- **Cockpit „unvalidierte Objekte"-Liste** — diese Objekte haben per Definition
  keine Runs; das Popover wäre leer.
- **Lineage-Graphen** — echter Mehrwert, aber Canvas-/Zoom-Positionierung ist
  spürbar mehr Aufwand → Tier 3.

## Tests & Gates (lokal spiegeln, CI erzwingt)

Pro neuer Fläche eine `*Inspection.test.tsx` nach Vorlage von
`AttentionPanelInspection.test.tsx` / `StatusHeatmapInspection.test.tsx`:
- Trigger klickt → `onInspect`/`openChecks` wird mit korrekter Objekt-ID
  aufgerufen; ohne Prop Navigations-Fallback.
- Für Compliance zusätzlich (analog `CockpitInspection.test.tsx`): Checks-Zelle →
  Popover, Zeilen-Klick → Panel, beide Ebenen bleiben getrennt (Panel-Mock
  gegen Popover-Mock prüfen).

Vor dem Push (aus `apps/cockpit/`):

```bash
npm run typecheck   # tsc --noEmit, muss clean sein
npm run lint        # eslint --max-warnings 0
npm run test -- --run
npm run build
```

Alle vier sind gatend (Frontend-Job in `.github/workflows/ci.yml`); `lint`
toleriert **0** Warnungen. Nicht `npx tsc` benutzen — den gepinnten Compiler aus
`node_modules` verwenden.

## Offene Frage für den Reviewer

Product-Detail (2b): **volle** Zwei-Ebenen-Behandlung (Inspect-Icon-Spalte für
das Popover **plus** Zeilen-Klick fürs Panel) oder die **leichte** Variante (nur
Zeilen-Klick → Panel, kein Popover), um die ohnehin dichte Produktseite nicht zu
überfrachten? Empfehlung: leicht anfangen (nur Panel), Icon-Trigger nachrüsten,
falls die Popover-Triage dort gewünscht wird.

## Referenz-Commits

- Tier 0 (Cockpit-Grid): `feat(cockpit): Zwei-Ebenen-Inspektion im Status-Grid`
- Tier 1 (Hook + Hotspots + Heatmap): `feat(cockpit): Zwei-Ebenen-Inspektion auf
  Hotspots und Heatmap (Tier 1)` — führt `useObjectInspection` ein; bester
  Ausgangspunkt zum Nachlesen des Musters.

# Scope — OpenLineage Emitter

> **Zweck:** Konkrete Scoping-Grundlage für einen OpenLineage-Emitter, der Signals
> Lineage-Graph **und** DQ-Run-Ergebnisse als standardisierte OpenLineage-Events
> abgibt — als *einseitiges Derivat* (gleiches Muster wie ODCS/ORD). Ein Emitter,
> viele Konsumenten: Marquez, DataHub, OpenMetadata ingestieren OpenLineage nativ.
> **Status:** Scope/Plan — *keine* Implementierung. Offene Punkte markiert.
> **Datum:** 2026-06-23
> **Leitregel (unverändert):** YAML-Contract = Source of Truth; OpenLineage =
> einseitiges Derivat. „Signal erzwingt — der Katalog beschreibt.”

---

## 1 — Ziel & Nicht-Ziele

**Ziel.** Aus den zwei Artefakten, die Signal ohnehin schon erzeugt —
1. dem **Lineage-Graph** (`data/lineage.json`: nodes + edges), und
2. den **DQ-Run-Ergebnissen** (`RunSummary` / `CheckResult`, `engine/models.py`) —

OpenLineage-`RunEvent`s emittieren, sodass beliebige OL-fähige Kataloge
Dataset-Graph, Schema, Spalten-Lineage **und** Data-Quality-Assertions sehen,
ohne SAP/BDC-spezifisches Wissen.

**Nicht-Ziele (bewusste Grenzen).**
- **Kein Import.** OpenLineage ist reiner Ausgang (wie ODCS). Kein Round-Trip,
  kein zweiter Lineage-Speicher.
- **Kein Live-Status-Writeback.** Dieselbe Grenze wie beim ORD-Writeback: die
  schnell wechselnde Compliance-Ampel (`active/breached`) wird **nicht** als
  Katalog-Zustand gepflegt. OL-Events sind punkt-in-zeit (per Run) — das ist
  zulässig; eine *fortlaufend gepflegte* Status-Property im Katalog ist es nicht.
- **Kein Eingriff in die native Achse.** `dq_core` bleibt framework-frei (G7);
  der OL-Client ist eine externe Dependency und gehört nach `services/`.
- **Kein Executor-Bezug.** Berührt den HANA-Runner nicht.

---

## 1b — Wertbeitrag: Sales-/POC-Reibung sinkt

Neben dem fachlichen Wert (Signal als *uniquely-qualified* DQ-Signal-Produzent für
offene Kataloge) hat der Emitter einen **Go-to-Market-Wert**: er senkt die
Reibung im Demo-/POC-Prozess deutlich. Ausdrücklich ein **Pre-Sales-/Evaluierungs**-
Hebel, kein Laufzeit-Feature — ROI misst sich in kürzeren Sales-Zyklen und höherer
Demo-Conversion, nicht in Kunden-Tagesnutzung.

**Das heutige Problem — die Demo-Voraussetzungs-Wand.** Signals Kernstory ist
„wir *führen* Checks gegen dein lebendes HANA/Datasphere aus und zeigen erzwungene
Qualität + Lineage”. Um das *echt* zu zeigen, braucht es eine erreichbare
HANA-Fläche und — für die Lineage-/Katalog-Story — idealerweise einen BDC-Tenant.
Heißt: der Interessent sieht die überzeugende Version von Signal erst **nachdem**
Tenant-Zugang gewährt, OAuth-Client-Credentials (`DATASPHERE_CLIENT_ID/SECRET`)
eingerichtet und das Security-Review durch sind. Das sind Wochen Reibung **vor**
dem „Aha”. Viele Deals versanden genau in dieser Lücke.

**Was OpenLineage ändert.** Marquez (die OpenLineage-Referenz) läuft als einzelnes
`docker compose up`. Mit dem Emitter zeigt Signals geseedete Demo (bzw.
`MockConnection`) gegen ein lokales Marquez einen **eigenständigen Showcase**:
echter Lineage-Graph + ausgeführte DQ-Assertions im Zeitverlauf, in einer echten
Drittanbieter-Katalog-UI — **null** Kunden-Infrastruktur, **null** Tenant-Zugang,
**null** Security-Review. Der Interessent sieht den Zielzustand am Tag null.

**Vier konkrete Reibungs-Reduktionen:**

1. **Zero-Infra-Demo.** Kein HANA, kein BDC-Tenant, kein OAuth — `compose up`, und
   die Story steht auf dem Schirm. Verkürzt die erste belastbare Demo von Wochen
   auf Minuten.
2. **„Landet in *eurem* Katalog” wird *gezeigt*, nicht behauptet.** Statt „vertraut
   uns, das integriert sich” erscheint Signals SAP-DQ-Ergebnis live in
   DataHub/OpenMetadata — das mentale Modell des Interessenten rastet ein, weil er
   sein *eigenes* Tool aufleuchten sieht.
3. **Standard-Antwort auf den Lock-in-Einwand.** SAP-Buyer sind misstrauisch
   gegenüber „noch einer proprietären Fläche auf BDC”. „Signal emittiert
   OpenLineage — einen offenen Standard, den euer Katalog schon ingestiert” macht
   aus einem Procurement-Einwand ein Häkchen und positioniert Signal als *guten
   Plattform-Bürger* statt als Walled Garden.
4. **Entkoppelt den POC von der BDC-Reife.** Ein Interessent mitten in der
   BDC-Migration (2026 sehr häufig) kann einen belastbaren Signal-POC gegen das
   fahren, was er *hat* (Nicht-SAP-Quellen → lokaler Katalog), **bevor** der
   BDC-Tenant überhaupt provisioniert ist. Man verliert nicht mehr das Fenster, in
   dem evaluiert, aber noch nicht BDC-live gearbeitet wird.

**Ehrlicher Vorbehalt.** Dies ist ein Pre-Sales-/Evaluierungs-Beschleuniger, kein
Produktiv-Laufzeit-Feature. Als solcher zu labeln, damit er nicht mit einer
operativen Anforderung verwechselt wird. Der Showcase setzt P1 voraus
(HTTP-Transport gegen Marquez); mit P0 allein (`console`/`file`-Transport) gibt es
noch keine Katalog-UI zum Vorzeigen.

---

## 2 — Architektur-Platzierung (G7 ist hier bindend)

`dq_core` darf keine Tool-/Framework-Dependencies ziehen — `pyproject.toml`
listet nur `pyyaml` + `jsonschema`. Der OpenLineage-Python-Client ist eine
externe Dependency → der Emitter lebt **außerhalb** `dq_core`, in `services/`,
und **konsumiert** die eingefrorenen Dataclasses (`RunSummary`, `CheckResult`)
sowie `data/lineage.json`. Exakt die Stellung, die `datacontract-cli` schon hat:
seitlich, am Artefakt, nie in der Engine.

```
   dq_core (FROZEN, framework-frei)          services/  (FastAPI, darf Deps ziehen)
   ─────────────────────────────────         ────────────────────────────────────
   run_checks() ─▶ RunSummary ──────────────▶ openlineage_emitter.emit_run()
                   (dataclass)                       │  openlineage-python client
   data/lineage.json (nodes/edges) ─────────▶ openlineage_emitter.emit_graph()  │
                                                      ▼
                                              OL Transport (HTTP/file/console)
                                              → Marquez · DataHub · OpenMetadata
```

---

## 3 — Mapping: Signal → OpenLineage

OpenLineage kennt **Dataset**, **Job**, **Run** und **Facets**. Signals Daten
mappen sauber:

| OpenLineage-Objekt | Signal-Quelle | Anmerkung |
|---|---|---|
| **Dataset** | Lineage-node (`id`, `space`, `system`, `columns`) | `namespace = "sap-datasphere://<tenant>"`; `name = "<space>.<id>"` (z. B. `S_SP1.DEMO_SRC_01`) |
| **SchemaDatasetFacet** | `node.columns` (+ `columnCount`) | Typen unbekannt → `type: ""`/`unknown` bis CSN-Typen vorliegen (R3) |
| **ColumnLineageDatasetFacet** | `edges` (+ `lineage/_column_lineage.py`) | objekt-granular sofort; spalten-granular sobald der Column-Parser stabil ist (vgl. O3-Vorbehalt in `loader.py`) |
| **Job** | ein DQ-Lauf je Dataset | `namespace = "signal"`; `name = "dq.<dataset>"` |
| **Run** | `RunSummary.run_id` | **schon `uuid.uuid4()`** (`check_engine.py:139`) → OL-konform, **keine** Coercion nötig |
| Run START/COMPLETE/FAIL | `started_at` / `finished_at` / `overall_status` | MVP: nur terminales Event (COMPLETE/FAIL) zulässig |
| **DataQualityAssertionsDatasetFacet** | `RunSummary.results: list[CheckResult]` | je Check: `assertion = name`, `success = passed`, `column` aus Check-Metadaten wo vorhanden |
| **DataQualityMetricsInputDatasetFacet** | `CheckResult.actual_value` bei `type in {row_count, completeness_pct, missing}` | `rowCount` / `nullCount` / spalten-Metriken |
| Custom facet `signal_compliance` | `set_compliance()` / `overall_status` | *optional*, nur committet — siehe Nicht-Ziele (kein fortlaufender Writeback) |

**Hinweis Severity/State:** `CheckResult.state` (`executed | skipped_* | downgraded
| error`) und `severity` (`critical | fail | warn`) gehören in die Assertion als
Zusatzfelder bzw. ein kleines Custom-Facet — sonst geht Signals Gating-Sichtbarkeit
(G6) im Katalog verloren.

---

## 4 — Zwei Emit-Pfade

### Pfad A — DQ-Run-Events (der Wert-Kern)
Bei jedem abgeschlossenen Lauf ein `RunEvent` mit den DQ-Facets am Ziel-Dataset.

**Hook-Punkt (genau einer, im Service-Layer):** unmittelbar nach
`store.save_run(summary)` in `services/api/routers/objects.py:376`.
Das ist der einzige API-Pfad, der einen produktiven Run persistiert; der
Emit hängt sich dahinter (fire-and-forget, fail-open).

> Bewusst **nicht** in `check_engine.py:178` (`ResultStore(...).save_run`) — das
> ist der `dq_core`-interne Convenience-Pfad und würde G7 brechen. Der
> CLI-Runner (`cli/dq_check_runner.py`) bekommt denselben Emit-Aufruf als
> *eigene* Zeile (CLI darf Deps ziehen), falls Cron-Läufe auch publizieren sollen
> — **[offen, P2]**.

### Pfad B — Lineage-Graph (Dataset-Topologie + Spalten-Lineage)
Ein Batch-Emit aus `data/lineage.json`: pro node ein Dataset mit
Schema-Facet, pro edge ein ColumnLineage-/Lineage-Bezug. Sinnvoll als
**eigener, idempotenter Job** (kein DQ-Run), getriggert nach jeder Extraktion
(`services/api/routers/extract.py`) oder als Skript (`scripts/emit_openlineage.py`).

> OL trägt Lineage normalerweise über `inputs`/`outputs` eines Run-Events. Für
> einen reinen Graph-Snapshot ohne Lauf: ein synthetischer Job
> `lineage.snapshot` mit einem COMPLETE-Event, dessen `inputs`/`outputs` den
> Graphen aufspannen. **[offen, P1: Form gegen Marquez/DataHub verifizieren]**

---

## 5 — Modul-Layout (neue Dateien)

```
services/api/openlineage_emitter.py     # Adapter: RunSummary/lineage.json → OL-Events + Transport
services/api/settings.py                # + OPENLINEAGE_* Konfig (Bestand erweitern)
scripts/emit_openlineage.py             # CLI für Pfad B (Graph-Snapshot, CI/Cron)
tests/unit/test_openlineage_emitter.py  # Mapping-Tests gegen das OL-JSON-Schema
```

**Öffentliche Funktionen (Vorschlag):**
```python
def emit_run(summary: RunSummary, *, dataset_meta: dict | None = None) -> None
def emit_graph(lineage: dict, *, namespace: str) -> None
def _to_run_event(summary) -> dict      # rein, testbar, ohne I/O
def _to_dataset(node) -> dict           # rein, testbar
```
Mapping (`_to_*`) **rein** halten (keine I/O) → unit-testbar gegen das
OpenLineage-JSON-Schema, genau wie `to_odcs()` heute gegen das ODCS-Schema
getestet wird (`tests/unit/test_odcs_export.py`).

---

## 6 — Konfiguration (opt-in, fail-open)

Neue Settings (Muster wie bestehende `DATASPHERE_*`-Vars):

| Var | Default | Wirkung |
|---|---|---|
| `OPENLINEAGE_ENABLED` | `false` | Master-Schalter; aus = kein Code-Pfad aktiv |
| `OPENLINEAGE_URL` | — | Marquez/DataHub/OM-Endpoint; leer = `console`/`file`-Transport (Demo) |
| `OPENLINEAGE_NAMESPACE` | `sap-datasphere` | Dataset-Namespace-Prefix |
| `OPENLINEAGE_API_KEY` | — | optional, Bearer |

**Fail-open ist Pflicht:** ein nicht erreichbarer Katalog darf einen DQ-Run
**nie** scheitern lassen. Emit in `try/except` mit Logging (Muster wie
Notification-Routing). Bevorzugt asynchron/non-blocking, da der Hook im
Request-Pfad sitzt.

---

## 7 — Dependencies

- `openlineage-python` (Client + Facet-Helfer) → **nur** in `services/api/requirements.txt`
  und `scripts/`-Kontext, **nicht** in `dq_core/pyproject.toml`.
- `httpx` ist in `services/api` bereits vorhanden — falls man den OL-Client
  umgehen und Events direkt als JSON posten will (dünnere Dependency), ist das
  eine Option. **[Entscheidung: offizieller Client vs. handgerolltes JSON — P1]**

---

## 8 — Offene Punkte

- **OL1 [H]** — Graph-Snapshot-Form (Pfad B): synthetischer Job vs. echte
  Run-`inputs/outputs`. Gegen Marquez **und** DataHub-Ingestion verifizieren,
  bevor festgeklopft.
- **OL2 [H]** — Spalten-Typen im Schema-Facet. `lineage.json` trägt nur
  Spalten*namen*. Vollständige Typen kommen erst aus CSN (vgl. R3 im
  ORD-Doc). MVP: Schema ohne Typen; Ausbau bei CSN-Verfügbarkeit.
- **OL3 [M]** — Spalten-Lineage-Granularität. `_column_lineage.py` existiert,
  aber `loader.py` markiert Coverage noch objekt-granular (O3). Erst Objekt-,
  dann Spalten-Lineage emittieren.
- **OL4 [M]** — CLI-Pfad (`cli/dq_check_runner.py`): sollen Cron-Läufe auch
  publizieren? Wenn ja, eigener Emit-Aufruf dort.
- **OL5 [L]** — Dataset-`namespace`-Konvention final festlegen
  (`sap-datasphere://<tenant>` vs. system-basiert) — muss zu dem passen, was
  der Ziel-Katalog für SAP-Quellen erwartet.

---

## 9 — Phasen

| Phase | Inhalt | Aufwand (grob) |
|---|---|---|
| **P0 — MVP** | Pfad A: terminal-only `RunEvent` mit DataQualityAssertions-Facet; `console`/`file`-Transport; opt-in/fail-open; reine `_to_run_event`-Mapping-Tests | klein |
| **P1 — Katalog-Live** | HTTP-Transport gegen Marquez; Dataset-Schema-Facet aus `columns`; Smoke-Ingestion verifizieren (OL1) | klein–mittel |
| **P2 — Graph + Metriken** | Pfad B (Graph-Snapshot); DataQualityMetrics-Facet; objekt-granulare ColumnLineage; CI/Cron-Skript | mittel |
| **P3 — Tiefe** | Spalten-Lineage (OL3); Typen aus CSN (OL2); DataHub/OpenMetadata-Verifikation | abhängig von CSN/Parser |

---

## 10 — Testplan

- **Mapping-Tests** (rein, kein Netz): `_to_run_event` / `_to_dataset` Output
  gegen das **OpenLineage-JSON-Schema** validieren — Muster exakt wie
  `tests/unit/test_odcs_export.py` (dort gegen `odcs-json-schema-v3.1.0.json`).
- **Fail-open-Test:** Transport wirft → `emit_run` schluckt, `save_run`-Pfad
  bleibt grün, Run-Resultat unverändert.
- **Determinismus:** gleicher `RunSummary` → byte-stabiles Event (wie
  Compiler-/ODCS-Determinismus-Tests).
- **Opt-in-Test:** `OPENLINEAGE_ENABLED=false` → null Transport-Aufrufe.

---

## 11 — Anker-Referenzen

| Baustein | Datei / Stelle |
|---|---|
| Run-Ergebnis-Modell (Quelle der DQ-Facets) | `packages/dq_core/engine/models.py` → `RunSummary`, `CheckResult` |
| Run-Erzeugung (`run_id = uuid4`) | `packages/dq_core/engine/check_engine.py:139` |
| Emit-Hook Pfad A | `services/api/routers/objects.py:376` (nach `store.save_run`) |
| Lineage-Graph (Quelle Pfad B) | `data/lineage.json`; Loader `packages/dq_core/lineage/loader.py` |
| Spalten-Lineage | `packages/dq_core/lineage/_column_lineage.py` |
| Vorbild „einseitiges Derivat” | `packages/dq_core/contract/odcs_export.py` → `to_odcs()` |
| Schema-Test-Vorbild | `tests/unit/test_odcs_export.py` (+ `tests/fixtures/odcs-json-schema-v3.1.0.json`) |
| G7 (dq_core framework-frei) | `README.md` §Sicherheits-Leitplanken; `packages/dq_core/pyproject.toml` |
| Architektur-Leitregel | `docs/Zusatz_ContractLifecycle_ORDBDCIntegration.md` §5 |

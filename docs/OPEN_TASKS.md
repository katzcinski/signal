# OPEN TASKS — Konsolidierter Backlog (alle Bereiche) · Signal

> **Stand:** 2026-06-28 · **Zweck:** Ein einziger Einstiegspunkt über **alle**
> offenen Punkte, die heute über die `docs/`-Konzepte, Pläne, Reviews und
> Handovers verstreut sind. Diese Datei **ersetzt** die Quelldokumente nicht —
> sie verlinkt sie und hält den aggregierten Status. Detailtiefe (Acceptance,
> Dateipfade, Sequenz) bleibt im jeweiligen Quelldokument.
>
> Die UI/UX-spezifische Matrix lebt weiter in
> [`OPEN_TASKS_UIUX.md`](OPEN_TASKS_UIUX.md); die dort offenen Punkte sind hier
> unter **A** gespiegelt.

**Methode:** Status wurde gegen den Code verifiziert, nicht nur aus den Docs
übernommen — wo Doku und Code abwichen (z. B. O3, HANA WS D), gilt der Code-Stand
und ist vermerkt.

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| ◻ Offen | noch nicht begonnen / nur Konzept |
| ◑ Teilweise | Teile geliefert, Rest offen |
| 🔒 Blockiert | hängt an einer Vorbedingung / Entscheidung / Daten |
| 🧪 Verifikation | Code da, aber unbewiesen (reale HANA/Tenant nötig) |
| ✅ Done | erledigt (hier nur gelistet, wenn ein Quelldoc es noch als offen führt) |

Priorität: **[H]** hoch · **[M]** mittel · **[L]** später/optional.

---

## Übersicht

| ID | Thema | Status | Prio | Quelle |
|----|-------|--------|------|--------|
| **A1** | Teilbarer Quality-Report / Data-Docs-Snapshot (UX-N6) | ◻ Offen | M | `OPEN_TASKS_UIUX.md` |
| **A2** | Schema-Drift-/Change-Screen (UX-N9) | ◻ Offen | M | `OPEN_TASKS_UIUX.md` |
| **B**  | Spaltenebene-Lineage + Impact (UX-N7 / O3) | 🔒 Blockiert | H | `PLAN_UX-N7_Column_Lineage.md` |
| **C**  | `HanaResultStore` (O6) + HANA-Migrationen + Smoke | ◻ Offen | H | `Implementation_HANA_Connection_Progress.md` WS E/F |
| **D**  | Managed Service (Instanz-pro-Tenant) | ◻ Offen | H | `PLAN_Managed_Service_v1.md` |
| **E**  | Observability-Mehrwert (z-Score, Freshness, Impact) | ◑ Teilweise | M | `PLAN_Observability_Mehrwert_v1.md` |
| **F**  | Durchsetzungs-Achse `gate \| quarantine \| monitor` | ◻ Offen | M | `Konzept_Enforcement_Modi_*.md` |
| **G**  | OpenLineage-Emitter | ◻ Offen | L | `Scope_OpenLineage_Emitter.md` |
| **H**  | Multi-Plattform-Executor (BDC/Databricks) | ◻ Offen | L | `Konzept_MultiPlattform_Executor_BDC.md` |
| **I**  | Meridian-Port Restpunkte | ◑ Teilweise | M | `HANDOVER-meridian-port.md` |
| **J**  | Freshness als zweite Achse (Run-/Load-Info) | ◑ Teilweise | M | `Konzept_Runs_Freshness.md` |
| **K**  | HANDOVER-Spikes / offene Entscheidungen (O1–O7) | ◻ Offen | div. | `HANDOVER.md` §5 |
| **L**  | Verifikation & Nice-to-have (HANA-Smoke, en-Locale, Prometheus, E2E) | 🧪 | L | div. |

> **Bereits geschlossen, obwohl ein Quelldoc es noch offen führt:** Interne
> DQ-Checks-Library im Builder (`handover-iteration-1-internal-checks.md`) ist
> umgesetzt (Compiler-`checks:`-Pfad, `contracts.py`-Persistenz, `GateCheck`-Typ,
> Library v6) ✅. Data-Product-Aggregat (`CODEX_HANDOVER_TrackA_Phase1.md`) ist
> umgesetzt (`packages/dq_core/product/`, `routers/products.py`) ✅. HANA
> WS A/B/C/F5 + der Connections-/Test-Screen (als `pages/Environments.tsx` inkl.
> Test-Button, `secret_status`, `OperationProgress`) sind geliefert ✅ — siehe C.

---

## A — UI/UX (gespiegelt aus `OPEN_TASKS_UIUX.md`)

Von den 15 UX-N-Punkten sind 13 ausgeliefert; offen bleiben:

- **A1 · UX-N6 — Teilbarer Quality-Report / Data-Docs.** `[M]` ◻
  `BadgeEmbed` + `GET /api/badge/{p}` existieren als Tile; der vollständige,
  auth-gegatete **Report-Snapshot** (Link/PDF für Nicht-Nutzer, GX-Vorbild) fehlt.
  Kein `/report`-Route im Backend.
  *Acceptance:* öffentlich teilbarer, auth-gegateter Report-Snapshot.
- **A2 · UX-N9 — Schema-Drift-/Change-Screen.** `[M]` ◻
  Schema-Evolution je Objekt über Zeit (hinzugefügte/entfernte/typgeänderte
  Spalten, Contract-Bruch markieren). `diff.py` trägt Type-Narrowing erst mit
  Schema v2 (Batch 5 „Out of scope").
  *Acceptance:* Spaltenänderungen je Objekt über Zeit, Contract-Bruch markiert.

UX-N7 (Spalten-Lineage) ist hier bewusst **nicht** dupliziert → siehe **B**.

---

## B — Spaltenebene-Lineage + Impact-Analyse (UX-N7 / O3) 🔒 [H]

**Quelle:** [`PLAN_UX-N7_Column_Lineage.md`](PLAN_UX-N7_Column_Lineage.md);
querschnittlich auch in `OPEN_TASKS_UIUX.md` (UX-N7), `REVIEW_Tool_v2_Status.md`
(#1 Column-level coverage), `Scope_OpenLineage_Emitter.md` (OL3),
`Betriebsmodi_Lite_und_Full.md` (Spaltenebene in Coverage), `HANDOVER.md` (O3).

**Korrigierte Diagnose (2026-06-26):** O3 ist **kein Parser-Defekt**, sondern ein
**Datenproblem**. Der CQN-Walker (`_csn_reconstructor.py`,
`_column_lineage.build_column_lineage`) ist implementiert **und** unit-getestet
(`computed`-Kanten inkl. gerenderter Expression; SQL-Pfad via sqlglot). Die API
steht (`GET /api/lineage/columns`). Das FE-Binding (`fetchColumnLineage`) steht.

**Blocker / offen:**
- **Daten:** `data/inventory.json` (18 Objekte) trägt für **0** Objekte einen
  CSN-`query`-AST/`csnProjection`/`sql`; die `columnEdges` in `data/lineage.json`
  sind statische Seed-Platzhalter (alle `direct`). → echter Extract mit CSN-AST
  nötig (hängt am CLI-/REST-Pfad, vgl. **I**).
- **Frontend-View:** Spalten-DAG + Impact-Liste existieren noch nicht (UI ist
  objektebene-only, `SchematicLineage.tsx`).
- **Walker-Härtung:** reale Datasphere-Shapes (Assoziationen, verschachtelte
  `xpr`, Unions, Calculated Columns) ungetestet.

**Acceptance:** Spalten-DAG + betroffene Downstream-Consumer mit Ownership aus
einem Incident heraus. **Folgewirkung:** entsperrt Spalten-Coverage (REVIEW v2 #1)
und OL3.

---

## C — `HanaResultStore` + Full-Deployment (O6) ◻ [H]

**Quelle:** [`Implementation_HANA_Connection_Progress.md`](Implementation_HANA_Connection_Progress.md)
WS D–G; `HANDOVER.md` O6; `REVIEW_Tool_v2_Status.md` (Real-HANA-Pfad).

**Verifizierter Stand:** WS A (Connection-Test + `on_progress`), WS B
(Operation-/Progress-Kanal, Migration 008), WS C1–C4 (Run/Dry-Run/Profile async +
Test-Endpoint), WS F5 (`FileSecretResolver` + `PUT …/secret`) und WS D
(`OperationProgress`-Komponente, `useOperationStream`, Test-/Secret-UI als
`pages/Environments.tsx`) sind **geliefert**. Offen bleibt der HANA-Store selbst:

- **C1 · WS E1 — HANA-Dialekt-Migrationen** `store/migrations/hana/NNN_*.sql`.
  SQLite-Spezifika übersetzen (`AUTOINCREMENT`→Identity/Sequence, `TEXT`→
  `NVARCHAR`, partieller Unique-Index → HANA-Filtered-Index); `CREATE TABLE`
  qualifiziert aufs Open-SQL-Schema (`[SCHEMA-MAP]`, kein Literal).
- **C2 · WS E2 — `HanaStore`** `store/hana_store.py` ist noch **Stub** (17×
  `NotImplementedError`). Alle Protokoll-Methoden via `hdbcli` implementieren;
  reale Store-Fläche ist auf ~48 Methoden gewachsen (Incidents, Schedules,
  Notifications, SLA, Object-Status-Rollups), nicht nur die 17 des veralteten
  `ResultStoreProtocol`. **Deckungsgleich** zu `SqliteStore` (Managed-Entscheid).
- **C3 · WS E3 — `deps.get_store()`** baut bei `STORE_BACKEND=hana` den
  `HanaStore` statt zu werfen; `RESULTS_ENVIRONMENT` in `settings.py` ergänzen.
- **C4 · WS F1–F4 — Verifikation & Härtung:** Smoke-Harness
  (`tests/integration/test_hana_smoke.py` + `make hana-smoke`, env-gated
  `HANA_SMOKE=1`); DB-User-Härtung dokumentieren (`Tooldokumentation.md` §9/§10);
  `scripts/generate_environments.py` + `DatasphereClient.list_db_users()`.
- **C5 · WS G — Quarantäne/Reject-Store** (optional, nach E): zeilen-genaue
  Verstöße per `INSERT … SELECT` direkt in HANA (PK + Allowlist), Rohzeile berührt
  den App-Prozess nie (E6 strikt). Default-off je Garantie. **Überschneidet sich
  mit F (`quarantine`-Modus)** — gemeinsam entscheiden.

**Aufwand (Doc):** ≈ 7,5–10,5 PT (ohne WS G).
**Acceptance:** `STORE_BACKEND=hana` legt Tabellen im konfigurierten Open-SQL-
Schema an, Store-Suite läuft env-gated grün, Result-Tabellen aus dem Space lesbar.

---

## D — Managed Service (Instanz-pro-Tenant) ◻ [H]

**Quelle:** [`PLAN_Managed_Service_v1.md`](PLAN_Managed_Service_v1.md) (Status:
„noch kein Code"); konkretisiert `Konzept_Managed_Service_Provisioning.md` §5.
Scope: **Instanz-pro-Tenant**, `tenant_id`/Row-Level-Pooling bewusst de-scoped.

- **D1 · AP-A — Produktiver `HanaStore`.** **= C2/C1** (der eigentliche Blocker;
  ohne ihn läuft Managed nur auf SQLite-pro-Tenant). Migrationen dialekt-getrennt;
  Doppellauf-Guard via HANA Filtered Index; CI-Verifikation gegen echte HANA im
  nicht-blockierenden Optional-Job.
- **D2 · AP-B — Provisioning-Automation.** „Tenant anlegen" wiederholbar/
  fehlerarm.
- **D3 · AP-C — Pro-Tenant Konfig-/Secret-Härtung.** Saubere Isolation ohne
  App-Umbau (Isolation über Infrastruktur, nicht über Query-Filter).
- **D4 · Offene Entscheidungen** (Doc §„Offene Entscheidungen") vor dem Bau klären.

> **Hinweis:** D1 und C überlappen vollständig — ein `HanaStore` bedient beide
> Spuren. Bei der Umsetzung **nicht doppelt planen.**

---

## E — Observability-Mehrwert ◑ [M]

**Quelle:** [`PLAN_Observability_Mehrwert_v1.md`](PLAN_Observability_Mehrwert_v1.md)
(Status: „noch kein Code").

- **E1 · Robuster MAD-z-Score.** `[M]` ◑ — `obs/baselines.py` berechnet bereits
  `median`+`mad` und persistiert `mad`; der **Verdikt-Pfad** nutzt aber weiter
  `compute_bounds()` (`mean ± σ·stddev`). `robust_zscore = 0.6745·(x−median)/mad`
  ergänzen (Sonderfall `mad==0`), Schwellen `|z|>k`⇒FAIL / `|z|>0.7k`⇒WARN
  (k=3.5), `median` als Spalte in `dq_baselines` (**neue Migration 010**),
  `WARMUP_N` als Gate. `compute_bounds()` bleibt nur noch für Bound-Anzeige.
- **E2 · Freshness via Task-Log.** `[M]` ◻ — schließt „blinde" Objekte; setzt auf
  vorhandenem Scheduling/Task-Chain-Trigger auf. **Überschneidet sich mit J.**
- **E3 · Lineage-Impact am Alert.** `[M]` ◻ — höchste Sichtbarkeit, größter
  Eingriff; betroffene Downstream-Consumer am Breach zeigen. **Hängt an B**
  (Spalten-/Objekt-Lineage) für die feinkörnige Variante.

---

## F — Durchsetzungs-Achse `gate | quarantine | monitor` ◻ [M]

**Quelle:** [`Konzept_Enforcement_Modi_Gate_Quarantine_Monitor.md`](Konzept_Enforcement_Modi_Gate_Quarantine_Monitor.md)
(Status: Proposal, nicht implementiert; `enforcement_mode` existiert nicht im Code).

Dritte Zustands-Achse je Check — *welche Aktion* ein Breach auslöst —, orthogonal
zu `severity` und Lite/Full. Eigenes Feld `enforcement_mode`, **Default `monitor`**
(keine grüne Pipeline wird zum Überraschungs-Stopp). `quarantine` koppelt an den
Reject-Store aus **C5/WS G**. Signal bleibt read-only; Datasphere handelt.
*Vor Umsetzung:* Engine/Compiler/Store-Eingriffe + Default-Disziplin verproben.

---

## G — OpenLineage-Emitter ◻ [L]

**Quelle:** [`Scope_OpenLineage_Emitter.md`](Scope_OpenLineage_Emitter.md)
(Status: Scope/Plan, keine Implementierung). Phasen P0 (terminal-only RunEvent) →
P3 (Spalten-Lineage, Typen aus CSN). Offene Punkte:

- **OL1 [H]** Graph-Snapshot-Form gegen Marquez **und** DataHub verifizieren.
- **OL2 [H]** Spalten-Typen im Schema-Facet (kommen erst aus CSN, vgl. B/I).
- **OL3 [M]** Spalten-Lineage-Granularität — **hängt an B** (erst Objekt-, dann
  Spalten-Lineage emittieren).
- **OL4 [M]** CLI-Pfad (`cli/dq_check_runner.py`): publizieren Cron-Läufe?
- **OL5 [L]** Dataset-`namespace`-Konvention final festlegen.
- **[P1]** Offizieller OL-Client vs. handgerolltes JSON (Dependency-Entscheidung).

---

## H — Multi-Plattform-Executor (BDC / Databricks) ◻ [L]

**Quelle:** [`Konzept_MultiPlattform_Executor_BDC.md`](Konzept_MultiPlattform_Executor_BDC.md)
(Konzept-/Evaluierungsdoc, keine gesetzten Entscheidungen). Offene Punkte/Risiken:

- **[H]** HDLF-Route A (über HANA) vs. B (Databricks/Delta) je Dataset.
- **[H]** HANA-Engine in `datacontract-cli` existiert nur per Prämisse —
  Upstream-Beitrag (`hdbcli`-Engine) vs. Fork bewerten.
- **[M]** 3-teiliger Namespace im Compiler (`[SCHEMA-MAP]`→`[NAMESPACE-MAP]`,
  optionales `catalog`-Segment ohne G2 zu verwässern).
- **[M]** SAP- vs. native-Databricks-Auth/Unity-Catalog; Capability-Paritätstests
  je Dialekt.
- **[L]** Cross-Platform-Konsistenz-Check als neue Garantie-Familie (Folgekonzept).

---

## I — Meridian-Port Restpunkte ◑ [M]

**Quelle:** [`HANDOVER-meridian-port.md`](HANDOVER-meridian-port.md). Connector,
Extraction, Profiling, Column-Lineage-Chain sind portiert. Offen:

- **I1 · Reicheres Node-Schema im FE adoptieren.** `LineageMap.tsx` hartkodiert
  noch `layer:int` 0–2/`LAYERS[3]` und ignoriert `edge.type`, obwohl das Backend
  `layer:string`/`layerCode`/`role`/`confidence`/`columns[]` emittiert.
  *Offene Entscheidung:* sauberer Cutover vs. Back-Compat-Adapter.
- **I2 · Snapshot/Compare/Diff-Validator (counts-only).** Aus Meridian
  `datasphere_data_validator.py` portieren (`gather_stats`, Compare-Row-Ratio
  >1.05, Diff via SQL `EXCEPT`, Key-Cardinality) → `dq_core/validator/`
  (framework-frei) + API-Route. **PII-Gate:** nur Counts / nicht-sensible Spalten.
  Auch die Fan-out-/Cardinality-Guardrail als `check_library`-Template.
- **I3 · Live-Tenant-Validierung** (🧪): REST-Endpoints nur gegen `respx`-Mocks
  geprüft. `read_object_definition` (`$expand=definition`) liefert evtl. **kein**
  volles CSN → CLI-Pfad für Spalten-Lineage nötig (entsperrt **B**-Daten);
  **Pagination** (`@odata.nextLink`) **nicht** behandelt → große Spaces brechen
  nach Seite 1 ab; ggf. zusätzliche OAuth-Scopes.
- **I4 · Extraktion läuft synchron im Threadpool** — keine dauerhafte Job-Queue;
  bei großen Spaces ggf. langsam (revisit).

---

## J — Freshness als zweite Achse ◑ [M]

**Quelle:** [`Konzept_Runs_Freshness.md`](Konzept_Runs_Freshness.md). MVP
(Objekt-Detail-Freshness, Run-Sparkline, „unknown" ohne Connector) ist die
Richtung; offene Designentscheidungen vor dem Verdrahten ins Gating:

- **J1 [H]** `skipped` vs. `downgraded` bei Staleness — Empfehlung `downgraded`
  mit zitiertem Run; **größtes semantisches Risiko**, vor Gate-Integration klären.
- **J2 [M]** Statische Schwellen → Alert-Fatigue: erwartete Cadence pro Objekt aus
  Run-Historie + `schedules.py` lernen, Contract-Wert nur als Obergrenze.
- **J3 [M]** Propagation mit Root-Cause-Dedup (Root + Blast-Radius-Count), sonst
  färbt Downstream-Staleness halbe Landschaften rot.
- **J4 [M]** Partielle Task-Chain-Rollups pro Task modellieren, nicht Chain-Level.
- **J5 [M]** Skalierung: Bulk-Abruf/Caching statt Per-Objekt-Fan-out (N+1).
- **J6 [L]** Optionaler aggregierter Trust-Score (Freshness+Volume+Schema+Quality)
  für Coverage-/Exec-Views — Signals zwei explizite Achsen bleiben transparenter.

---

## K — HANDOVER-Spikes / offene Entscheidungen (O1–O7) ◻

**Quelle:** [`HANDOVER.md`](HANDOVER.md) §5 — vor dem jeweiligen WS klären:

| ID | Punkt | blockiert | Vorgehen |
|----|-------|-----------|----------|
| O1 | Breaking-Diff Stufe 2 (ODCS/`datacontract-cli`) | WS2-4 optional | Stufe 1 homegrown reicht für M2 |
| O2 | Zugriffspfad Katalog-/Lastmetadaten (`DWC_GLOBAL` nicht dok., HDLF-Gap) | WS5-1 | Spike 1–2 PT; Fallback `LOAD_TS` + Row-Count |
| O3 | `columnEdges` ohne echte Derivation | → **B** | Daten-, kein Parser-Problem (s. B) |
| O4 | OIDC beim Kunden (IdP, Claims→Rollen) | WS5/Deploy | Mapping pro Engagement |
| O5 | Parallel Execution | später | deferred; Tenant-Connection-Limit klären |
| O6 | Ergebnisheimat: `HanaResultStore` vs. SQLite-Sync | → **C/D** | Store folgt Deployment, kein Sync |
| O7 | Stats-Tuple-Erhebung: Batch-UNION vs. Profil-Lauf | WS5-2 | separater Profil-Lauf je Dataset; Spike |

---

## L — Verifikation & Nice-to-have 🧪 [L]

**Quelle:** `REVIEW_Tool_v2_Status.md` (Verification-only), querschnittlich.

- **L1 · Reale HANA-Ausführung** 🧪 — `MockConnection` lokal; der `hdbcli`-Pfad ist
  hier nicht ausführbar. Real-Smoke nötig (= **C4/WS F1**).
- **L2 · Multi-Locale** — nur `de.ts` (kein `en`/Switcher). OK, falls Deutsch-only
  gewollt; sonst flaggen.
- **L3 · Prometheus-Exporter** — In-Memory-Metriken + `/api/metrics/health`
  existieren; ein extern scrapebarer Exporter ist Nice-to-have.
- **L4 · Playwright-E2E-Smoke** — optionaler Browser-Ebene-Smoke obendrauf (kein
  Korrektheitsrisiko mehr, `PLAN_Remediation_v2.md`).
- **L5 · Visuelle QA am Datenvolumen** — Tabellendichte >500 Objekte, breite DAGs
  (dagre-Tuning) gegenprüfen (`Konzept_DQ_Cockpit_UIUX.md` §9).

---

## Querschnitt-Abhängigkeiten (worauf zuerst)

```
echter CSN-Extract (I3) ──► B (Spalten-Lineage) ──► A1-naher Impact / OL3 / E3
HanaStore (C2) ═ D1 ──────► C (Full-Deploy) + D (Managed) + F-quarantine/C5
E1 (z-Score)  ── eigenständig, kleinster Hebel, sofort machbar
J1 (skip/downgrade) ── Entscheidung vor Freshness-Gating (E2/J)
```

**Empfohlene Reihenfolge nach Hebel/Aufwand:** E1 (klein, sofort) → C2/D1
(`HanaStore`, entsperrt Full+Managed) → I3→B (Spalten-Lineage-Datenpfad) →
J1-Entscheidung → A1/A2. F, G, H bleiben Konzept, bis ein Kundenfall sie zieht.

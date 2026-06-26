# Implementation Plan — Realer HANA-Connection-Pfad + Connection-UI + Progress

**Adressat:** Entwicklung · **Stand:** 2026-06-22 · **Modus:** sequentiell wie HANDOVER, jeder Schritt mit Acceptance, kein Merge bei rotem Gate.
**Zweck:** Den hdbcli-Verbindungspfad **nachweisbar lauffähig** machen, eine **Connection-/Environment-Oberfläche mit Test-Funktion** bereitstellen und **überall, wo eine hdbcli-Connection geöffnet wird** (Run, Dry-Run/Preview, Profiling/Validation, Connection-Test) einen **Live-Progress** anzeigen.

> Verwandt: [`Tooldokumentation.md`](Tooldokumentation.md) §6/§10 (ENV, Deployment) · [`REVIEW_Tool_v2_Status.md`](REVIEW_Tool_v2_Status.md) (Verification-only: realer HANA-Pfad, O6) · [`HANDOVER.md`](HANDOVER.md) §5 (O6 HanaResultStore).

---

## 0 — Geltende Invarianten (NICHT verletzen)

- **G7 Framework-Isolation.** `dq_core` importiert nie FastAPI/sqlite-API-spezifisches aus dem Service. Progress wird in `dq_core` ausschließlich über den **vorhandenen `on_progress(line)`-Callback** emittiert; das Persistieren bleibt in `services/api` bzw. hinter dem Store-Protocol.
- **G2/[SCHEMA-MAP].** `{schema}` wird weiterhin nur zur Laufzeit gebunden (in den Öffnungsstellen), nie im Contract.
- **S-13 fail-closed.** Kein stiller Mock-Fallback; Treiber-/Auth-/Konfigfehler sichtbar als 502/503 mit sicherer Meldung (keine Interna).
- **S-1/Secrets.** Credentials kommen über `password_ref` → `secrets.get_secret`; die UI sieht **nie** ein Passwort, nur einen `secret_status` (bool) und den Referenz-Namen.
- **G4.** Jede API-Form-Änderung ⇒ `openapi-typescript` neu generieren, `git diff --exit-code`.

## 1 — Ist-Zustand (verifiziert)

| Stelle | Datei | Connection | Progress heute |
|---|---|---|---|
| Run | `services/api/routers/objects.py:350` (`_run_thread`) | `get_connection(...)` | ✅ `make_progress_callback` → `dq_run_progress`, SSE |
| Dry-Run / Preview | `services/api/routers/checks.py:87` | `get_connection(...)`, **synchron** | ❌ keiner |
| Profiling / Validation | `services/api/routers/profile.py:151` | `get_connection(...)`, **synchron** | ❌ keiner |
| Connection-Test | — | existiert nicht | — |

- **Connection-Helper:** `packages/dq_core/connect/db_connection.py` — fertig (Retry, `statementTimeout`, `encrypt`+`sslValidateCertificate`, fail-closed). Emittiert **keine** Progress-Zeilen; öffnet **vor** `run_checks`, daher ist „Verbinde…/Verbunden" unsichtbar.
- **Progress-Kanal:** `services/api/sse.py` — `make_progress_callback(run_id, store)` schreibt via rohem `sqlite3` in `dq_run_progress`; `sse_generator(db_path, run_id)` pollt `dq_run_progress` + `dq_runs.run_state`. **SQLite-hartverdrahtet** und **an `run_id`/`dq_runs` gekoppelt** — für Nicht-Run-Operationen kein Terminierungssignal, für HanaStore kein gültiger `db_path`.
- **Environments:** `deps.get_environment(name)` (host/port/schema + `password_ref`→`secrets.get_secret`); `GET /api/environments` liefert nur `name`+`schema` (nie Creds). **Kein** Test-/Status-Endpoint.
- **Result-Store HANA:** `packages/dq_core/store/hana_store.py` = Stub; `deps.get_store()` wirft bei `STORE_BACKEND=hana`.
- **Frontend:** `store/sseStore.ts` (EventSource auf `/api/stream`), `api/runs.ts::useRunStream`, `components/LiveRunPanel.tsx`, `RunTriggerDialog.tsx`, `ObjectProfilePanel.tsx`, `ContractWorkbench` DryRunPanel. Kein Connection-Screen, kein Progress in Dry-Run/Profile.

## 2 — Zielbild

1. **Ein generischer Operation-/Progress-Kanal** (`op_id`) über das **Store-Protocol** statt rohem sqlite3 — nutzbar von Run, Dry-Run, Profile, Connection-Test; HANA-tauglich.
2. **`get_connection` emittiert Phasen** über den `on_progress`-Callback: „Verbinde mit host:port…", „Verbunden (HANA <version>)", „transienter Fehler, Versuch n…".
3. **Connection-Test** als eigener Endpoint + UI mit Live-Progress und Status-Badge (ok / Latenz / Server-Version / Schema sichtbar / Fehler).
4. **Dry-Run & Profile asynchron** wie der Run (sofort `op_id`, Hintergrund-Thread, Live-Progress, Ergebnis am Ende des Streams + Poll-Endpoint).
5. **`HanaResultStore` (O6)** implementiert, damit der **Full-Deployment-Pfad** (HANA-Result-Store) lauffähig ist — inkl. Progress-Persistenz über das Protocol.
6. **Verifikations-Harness**, das den realen hdbcli-Pfad gegen eine echte HANA ausführt (env-gated), sodass er reproduzierbar nachgewiesen ist.

## 3 — Vorab zu treffende Entscheidungen

| # | Entscheidung | Empfehlung |
|---|---|---|
| D1 | Dry-Run/Profile **async** (op_id + Stream) **oder** sync mit unbestimmtem Spinner? | **Async** — nur so gibt es echten Progress „überall wo eine Connection öffnet". Kostet G4-Regen + FE-Umbau, ist aber die Anforderung. |
| D2 | Herkunft + Ziel der **Result-Store-Connection** bei `STORE_BACKEND=hana` | **Ins Open SQL Schema des Datasphere-DB-Users schreiben** (der User hat dort DDL/DML — die Migrationen legen die wenigen Result-Tabellen selbst an). Vorteil: die Ergebnisse sind danach **in Datasphere weiterverarbeitbar** (Loop geschlossen — Quality-KPIs als DSP-Quelle für SAC/Modelle). Schema-Name kommt aus dem Environment (kein hartkodiertes `dq_results_lt`). Optional kann **derselbe** Datasphere-DB-User auch lesen (Space-exponierte Prüf-Objekte via „Enable read access"), wodurch Lese- und Schreib-Connection zu **einem** User kollabieren — abhängig von den Grants im Space (S-4). |
| D3 | Environments **in der UI editierbar** oder read-only + Test? | **Read-only + Test** in v1 (Anlage via `environments.yml`/Secret-Store, Governance-Akt). UI-Editor (ohne Secret-Eingabe) als späteres Opt-in. |
| D4 | **HANA-Testumgebung** für Verifikation | Klären: HANA Cloud Trial / `hanaexpress`-Container / Kunden-Sandbox. Ohne sie bleibt WS F „skipped" (env-gated), aber der Code ist fertig. |

---

## WS A — Connection-Layer: Test + Progress (Voraussetzung)

**A1 `ConnectionProtocol` + `check_connection`** `dq_core/connect/db_connection.py`
- Typing-`Protocol` `DbConnection`/`DbCursor` (`cursor()`, `execute(sql, params=None)`, `fetchone/fetchmany/fetchall`, `description`, `close`) — dokumentiert, was Engine/Profiler erwarten; `MockConnection` und hdbcli erfüllen es.
- `check_connection(host, port, user, password, schema, *, on_progress=None) -> dict` — öffnet via `get_connection`, führt `SELECT 1 FROM DUMMY` + `SELECT VERSION FROM M_DATABASE` (oder `SELECT * FROM SYS.M_DATABASE`) aus, optional `SELECT TOP 0 * FROM "<schema>"."<probe>"` zur Schema-Sichtbarkeit; liefert `{ok, latency_ms, server_version, schema_visible, error}`. Fehler werden in eine **sichere** Meldung übersetzt (kein Stacktrace, S-14).

**A2 `get_connection` instrumentieren** *(additiv, optional)*
- Optionaler Parameter `on_progress: Callable[[str], None] | None = None`. Vor `dbapi.connect`: `on_progress("Verbinde mit {host}:{port} (Schema {schema})…")`; nach Erfolg `on_progress("Verbunden (HANA {server_version})")`; im Retry-Zweig `on_progress("Transienter Verbindungsfehler — Versuch {n}/{max}…")`. **Kein** Import aus `services/` (G7).

*Acceptance A:* Unit-Test mit einem hdbcli-Double (recorded cursor): `check_connection` liefert `ok=True`+`server_version`; bei simuliertem Auth-Fehler `ok=False`+sichere Message, **kein** Retry; bei transientem Marker Retry mit Backoff. `MockConnection`/Double erfüllen `DbConnection` (`isinstance` via `runtime_checkable`).

---

## WS B — Generischer Operation-/Progress-Kanal (store-getrieben)

**B1 Migration 008** `packages/dq_core/store/migrations/008_operations.sql`
```sql
CREATE TABLE IF NOT EXISTS dq_operations (
  op_id TEXT PRIMARY KEY, kind TEXT NOT NULL,           -- run | dry_run | profile | connection_test
  state TEXT NOT NULL DEFAULT 'running',                -- running | finished | error
  started_at TEXT, finished_at TEXT,
  result_json TEXT, error TEXT
);
-- dq_run_progress wird wiederverwendet: run_id trägt jetzt eine beliebige op_id (Log bleibt schemagleich).
```
Idempotent, SQLite + HANA-Dialektvariante (siehe WS E).

**B2 Store-Protocol erweitern** `dq_core/store/base.py` + `sqlite_store.py` (+ `hana_store.py` WS E)
- `append_progress(op_id, line)`, `get_progress(op_id, after_id)`, `begin_operation(op_id, kind)`, `finish_operation(op_id, state, result_json=None, error=None)`, `get_operation(op_id)`.
- **Damit verschwindet der rohe `sqlite3`-Zugriff aus `sse.py`** — Progress läuft über das Protocol und ist HANA-tauglich (G7 bleibt: Protocol lebt in `dq_core`, kein FastAPI-Import).

**B3 SSE generalisieren** `services/api/sse.py` + `routers/stream.py`
- `sse_generator(store, stream_id)` liest Progress über `store.get_progress`; den Terminalzustand aus `dq_runs` **oder** `dq_operations` (Helper `_stream_state(store, id)`). Terminal-Event trägt bei Operationen die `result_json`-Payload (`{"type":"finished", "result": …}`).
- `make_progress_callback(op_id, store)` ruft `store.append_progress` (statt rohem sqlite3).
- Endpoints: `/api/stream?run_id=` bleibt (Rückwärtskompat); zusätzlich `GET /api/operations/{op_id}/events` (SSE) + `GET /api/operations/{op_id}` (Poll-Fallback, inkl. Ergebnis).

*Acceptance B:* Eine Operation ohne `dq_runs`-Zeile streamt Progress und terminiert sauber mit `finished`+Payload; Polling liefert identischen Inhalt; zweiter Worker (zweite Store-Instanz, gleiche DB) sieht denselben Stream (F2).

---

## WS C — Öffnungsstellen instrumentieren (Run · Dry-Run · Profile · Test)

Gemeinsames Muster (wie der bestehende Run): Endpoint legt `op_id` an (`begin_operation`), startet Hintergrund-Thread, gibt sofort `202 {op_id}` zurück; der Thread bindet `{schema}`, öffnet die Connection **mit `on_progress=make_progress_callback(op_id, store)`**, führt aus, schreibt `finish_operation`.

**C1 Run** `objects.py:_run_thread` — Connection-Phasen ergänzen: `on_progress` an `get_connection` durchreichen (eine Zeile „Verbinde…/Verbunden" vor `run_checks`). Sonst unverändert.

**C2 Dry-Run / Preview** `routers/checks.py`
- `POST /checks/{dataset}/dry-run` → `202 {op_id}` (statt synchronem Ergebnis). Thread: validate (G1) → compile → `get_connection(on_progress=…)` → `run_checks(..., on_progress=callback, results_db=None)` → `finish_operation(op_id, "finished", result_json=<summary>)`. Der `compile_only`-Pfad (kein Environment) bleibt **synchron** (kein Connection-Open, kein Progress nötig).
- Per-Check-Progress kommt **gratis** aus dem vorhandenen `on_progress` von `run_checks`.

**C3 Profiling / Validation** `routers/profile.py`
- `POST /objects/{id}/profile` → `202 {op_id}`. Thread: `get_connection(on_progress=…)` → Progress je Phase: „Profiliere Spalten…", „PK-Kandidaten (composite)…", „Sample Rows [PII-GATE]…" → `finish_operation` mit dem Profil-Result. `profile_table`/`analyze_composite_candidates` bekommen einen optionalen `on_progress`-Parameter (additiv) für „Spalte k/n".

**C4 Connection-Test** `routers/extract.py` (oder neuer `routers/connections.py`)
- `POST /api/environments/{name}/test` → `202 {op_id}`. Thread: `get_environment(name)` → `check_connection(..., on_progress=…)` → `finish_operation` mit `{ok, latency_ms, server_version, schema_visible}`. `[AUTHZ]`: steward+.
- `GET /api/environments` zusätzlich `secret_status` (aus `secrets.secret_status(password_ref)`) + `host` maskiert (`***.example.com`) — nie Passwort.

*Acceptance C:* Jeder der vier Endpoints liefert `202 {op_id}`; der Stream zeigt mindestens „Verbinde…"→„Verbunden"→fachliche Schritte→Terminal; Dry-Run-/Profile-Ergebnis ist am Stream-Ende und über den Poll-Endpoint abrufbar; ohne Environment bleibt Dry-Run `compile_only` synchron.

---

## WS D — Frontend: Operation-Progress + Connections-Screen

**D1 Generischer Stream-Hook + Komponente** `apps/cockpit/src`
- `store/sseStore.ts` → generalisieren auf beliebige `op_id` (heute nur `/api/stream` global); neuer `useOperationStream(opId)` (EventSource `/api/operations/{opId}/events`, Polling-Fallback wie `useRunStream`).
- `components/OperationProgress.tsx` — schlanke **Progressbar/Stepper** (Phasenliste + Determinate-Balken, sobald „k/n" geparst wird; sonst indeterminate) + Live-Log-Auszug. Wiederverwendbar in Dialogen.

**D2 Connections-Screen** `pages/Connections.tsx` + Route `/connections` (oder Panel in `Governance`)
- Liste der Environments (`name`, `schema`, maskierter `host`, `secret_status`-Badge). Pro Zeile **„Verbindung testen"** → `POST …/test`, `OperationProgress`, danach Status-Badge: ✅ ok · Latenz `xx ms` · `HANA <version>` · Schema sichtbar — oder ❌ mit sicherer Fehlermeldung.
- i18n nach `i18n/de.ts`; Status-Encoding ≥3-von-4 (Farbe+Form+Label, Carbon). `[AUTHZ]`: Test sichtbar nur steward+.

**D3 Progress in die bestehenden Dialoge einhängen**
- `RunTriggerDialog`/`LiveRunPanel`: auf `useOperationStream` umstellen (Run ist eine Operation), Connection-Phasen erscheinen jetzt mit.
- `ContractWorkbench` DryRunPanel: `useDryRunChecks` liefert künftig `op_id` → `OperationProgress` während des Laufs, Ergebnis aus dem Terminal-Event.
- `ObjectProfilePanel`: `useProfileObject` → `op_id` → `OperationProgress` (Verbinden + Profiling-Phasen), Ergebnis am Ende.

**D4 G4** `npm run gen:api` (neue/aenderte Endpoints) + `git diff --exit-code`; TS strict grün.

*Acceptance D:* Ein Steward testet eine Verbindung und sieht live „Verbinde…→Verbunden (HANA …)→OK 42 ms"; Dry-Run und Profiling zeigen jeweils einen Fortschrittsbalken inkl. der Connection-Phase; Viewer sieht keine Test-/Run-Aktion.

---

## WS E — HanaResultStore (O6) → Open SQL Schema *(parallel; nötig für Full-Deployment)*

**Ziel (D2):** in das **Open SQL Schema des Datasphere-DB-Users** schreiben. Dort hat der User DDL/DML — die Migrationen legen die wenigen Result-Tabellen selbst an. Der Schema-Name wird zur Laufzeit aus dem Environment gebunden (`[SCHEMA-MAP]`, kein hartkodiertes `dq_results_lt`). Folge: die Ergebnis-Tabellen können als Quelle zurück in einen Datasphere-Space übernommen und dort weiterverarbeitet werden (geschlossener Loop — Quality-KPIs als DSP-Quelle für SAC/Modelle).

**E1 HANA-Dialekt-Migrationen** `store/migrations/hana/NNN_*.sql` (oder Dialekt-Schalter im Runner)
- SQLite-Spezifika übersetzen (`INTEGER PRIMARY KEY AUTOINCREMENT` → HANA-Identity/Sequence, `TEXT`→`NVARCHAR`, partieller Unique-Index für Run-Guard → HANA-Äquivalent).
- `CREATE TABLE` **qualifiziert auf das Open-SQL-Schema** (Name aus dem Environment, `currentSchema`); Idempotenz wie bei SQLite über den Migration-Runner (`schema_migrations` im selben Schema).

**E2 `HanaStore`** `store/hana_store.py` — alle `ResultStoreProtocol`-Methoden via hdbcli implementieren (inkl. `append_progress`/`get_progress`/`*_operation` aus WS B, `try_begin_run`/Run-Guard, `get_sla`, Heatmap/Trend/Series). Connection + Ziel-Schema aus dem Datasphere-DB-User-Environment (D2).

**E3 `deps.get_store()`** baut bei `STORE_BACKEND=hana` den `HanaStore` (Connection + Open-SQL-Schema auflösen) statt zu werfen.

**E4 Re-Consumption (Doku, kein Code):** Damit die Result-Tabellen in Datasphere konsumierbar sind, muss der Space das Open SQL Schema als Quelle hinzufügen / die Tabellen importieren — ein Deployment-/Konfig-Schritt. In `Tooldokumentation.md` §10 festhalten.

*Acceptance E:* `ResultStoreProtocol`-Konformitätstest (`runtime_checkable`, `isinstance`) für `HanaStore`; die bestehende Store-Test-Suite läuft env-gated (`HANA_SMOKE=1`) auch gegen das Open SQL Schema grün; `STORE_BACKEND=hana` legt die Tabellen im konfigurierten Schema an und startet ohne Fehler; die Result-Tabellen sind aus dem Space heraus lesbar (manuell verifiziert).

---

## WS F — Verifikation, DB-User-Härtung, Doku

**F1 Smoke-Harness** `tests/integration/test_hana_smoke.py` + `make hana-smoke`
- Mit `HANA_SMOKE=1` + Env-Vars: `check_connection` grün; ein Mini-Contract Compile→Dry-Run→Run gegen echte HANA; Multi-Worker-Run (2 uvicorn) gegen denselben (HANA-)Store. Ohne Flag: `pytest.skip` (CI bleibt grün).
- Reproduzierbares Ziel dokumentieren (HANA Cloud Trial / `hanaexpress`-Container).

**F2 DB-User-Härtung (S-4)** in `Tooldokumentation.md` §9/§10 festhalten: Lese-Zugriff nur `SELECT` auf die Space-exponierten Prüf-Objekte; Schreib-Zugriff der Result-Store-User **auf sein eigenes Open SQL Schema** (DDL/DML dort, sonst nichts); nie Space-Admin. Ob ein **einziger** Datasphere-DB-User beides abdeckt (lesen via „Enable read access", schreiben ins eigene Open-Schema) oder zwei getrennte User — abhängig von den Space-Grants; beide Varianten dokumentieren. TLS bereits `encrypt`+Cert (verifiziert).

**F3 Doku nachziehen:** `Tooldokumentation.md` §5 (neue Operation-/Test-Endpoints), §6 (ggf. `RESULTS_ENVIRONMENT`-ENV), §8 (Connections-Screen, Progress in Dry-Run/Profile); `REVIEW_Tool_v2_Status.md` (HANA-Pfad/O6 von „verification-only/open" auf „done" ziehen, sobald F1/E grün).

---

## WS G — Quarantäne / Reject-Store *(optional, nach E; durch In-HANA-Store erst sinnvoll)*

**Idee:** zeilen-genaue Verstöße in eine Quarantäne-Tabelle **im selben Open SQL Schema** schreiben — per `INSERT … SELECT` **direkt in HANA**, sodass die Rohzeilen den App-Prozess **nie** berühren (E6 strikt eingehalten, stärker als der heutige `dq_diagnostics`-Pfad). Die Tabelle ist aus dem Space zurück-konsumierbar → Reject-/Remediation-Dashboards in SAC.

- **Nur zeilen-identifizierbare Familien:** `not_null`, `completeness`, `keys`/Duplikate, `referential` (Orphans), `matches`/Regex, `cross_field`. **Nicht** `volume.min_rows`/`freshness`/`volume_anomaly` (keine Einzelzeilen).
- **Compiler erweitern** (`dq_core/contract/compiler.py`): neben dem Aggregat-Check optional einen **Quarantäne-`SELECT`** mit demselben Verletzungs-Prädikat emittieren, projiziert auf **PK + Allowlist-Spalten**, mit `LIMIT N`. Opt-in je Garantie: `quarantine: { enabled, columns[], limit }`, **default off**.
- **Tabelle** (Migration, HANA + SQLite): `dq_quarantine(id, run_id, dataset, check_name, captured_at, row_key, payload_json)` — `payload_json` nur Allowlist-Spalten. TTL-Cleanup wie `DIAGNOSTICS_TTL_DAYS`.
- **PII-Disziplin = `dq_diagnostics`:** default-off, Spalten-Allowlist, TTL, restriktiver Zugriff. Verhältnis zu `dq_diagnostics` entscheiden (ablösen vs. zweite Stufe).
- **Ausführung:** im Run-/Dry-Run-Thread nach einem fehlgeschlagenen, quarantäne-fähigen Check ein `INSERT … SELECT` ins Open-Schema absetzen (Progress-Zeile „Quarantäne: N Zeilen erfasst").

*Acceptance G:* fehlschlagender `not_null`-Check mit `quarantine.enabled` schreibt **nur** Key+Allowlist-Spalten per `INSERT … SELECT`; der App-Prozess sieht **keine** Rohzeile; `volume`/`freshness` erzeugen **keine** Quarantäne; TTL löscht abgelaufene Zeilen; ohne `enabled` bleibt die Tabelle leer.

*Aufwand:* 2–3 PT (Compiler-Paar-Query + Migration + Ausführungs-Hook + Tests).

---

## Sequenz & Aufwand

| WS | Inhalt | hängt ab von | Aufwand (PT) |
|----|--------|--------------|--------------|
| A | Connection-Test + `on_progress`-Instrumentierung | — | 1–1,5 |
| B | Operation-/Progress-Kanal (Migration 008, Store-Protocol, SSE generalisieren) | A | 2–3 |
| C | Run/Dry-Run/Profile/Test instrumentieren (async op-Muster) | B | 2–3 |
| D | FE: `useOperationStream`, `OperationProgress`, Connections-Screen, Dialoge | C | 3–4 |
| E | `HanaResultStore` (O6) + HANA-Migrationen | B (Protocol) | 4–6 |
| F | Smoke-Harness, DB-User-Härtung, Doku | A–E | 1,5–2 |
| G | Quarantäne/Reject-Store (optional) | E | 2–3 |

**Brutto ≈ 13,5–19,5 PT** (ohne WS G; mit Quarantäne +2–3 PT). A→B→C→D ist der kritische Pfad für „Connection-UI + Progress überall". E (Result-Store) ist für den **reinen Lese-/Dry-Run-Pfad** entkoppelt (SQLite-Result-Store genügt dort) und kann parallel laufen — wird aber für das **Full-Customer-Deployment** gebraucht.

## Definition of Done

- `check_connection` + Connection-Test-UI zeigen live Verbinden→Verbunden→Status; Fehlerfälle sicher (keine Interna).
- **Jede** hdbcli-Öffnungsstelle (Run, Dry-Run/Preview, Profiling/Validation, Test) streamt Progress über den **store-getriebenen** Kanal; SQLite **und** HANA-Store tauglich.
- Realer hdbcli-Pfad reproduzierbar nachgewiesen (`make hana-smoke`, env-gated), Multi-Worker grün.
- `STORE_BACKEND=hana` lauffähig (E) oder bewusst als Folge-Batch markiert.
- Gates G1/G2/G4/G6/G7/G8 grün; OpenAPI-Typen regeneriert.

## Bewusst NICHT in diesem Plan
- UI-Editor zum Anlegen von Environments inkl. Secret-Eingabe (Anlage bleibt `environments.yml`/Secret-Store, D3).
- Vault-Resolver (Interface steht in `secrets.py`, Implementierung später).
- Connection-Pooling/Persistente Sessions (jede Operation öffnet/schließt; Pooling erst bei Lastbedarf).
- Object-Store-/HDLF-Executor (E2-Carve-out, B3 des Reviews bleibt).

---
---

# AP A — HanaResultStore (Detailplan, O6)

**Adressat:** Entwicklung · **Stand:** 2026-06-26 · **Bezug:** detailliert WS E/F/G dieses Dokuments aus.
**Zweck:** Den `STORE_BACKEND=hana`-Pfad **lauffähig** machen — der Result-Store schreibt in das **Open SQL Schema des Datasphere-DB-Users** (D2), die Migrationen werden über einen **Dialekt-Schalter im Runner** aus der einen SQLite-Quelle abgeleitet, und der reale Pfad wird env-gated verifiziert. Zusätzlich ein optionaler **Quarantäne-/Reject-Store** (WS G), der Verstöße zeilen-genau per `INSERT … SELECT` direkt in HANA erfasst.

> Entscheidungen (bestätigt): **Umfang = E+F+G** · **Ziel = Open SQL Schema des DSP-Users** · **Migrationen = Dialekt-Schalter im Runner** · **Ablage = dieses Dokument erweitert**.

## A.0 — Geltende Invarianten (NICHT verletzen)

- **G7 Framework-Isolation.** `HanaStore` und der Dialekt-Schalter leben in `packages/dq_core/store/` und importieren **nie** FastAPI/Starlette/Flask. Nur `hdbcli` (lazy, optionales Extra) + Stdlib.
- **G2/[SCHEMA-MAP].** Das Ziel-Schema wird **zur Laufzeit** aus dem Environment gebunden (`currentSchema` / qualifiziertes DDL via `qualified(schema, table)`); **kein** Literal `CENTRAL`/`dq_results_lt` im Code. CI greppt auf `"CENTRAL"`.
- **G6 Gating-States.** Alle `CheckResult.state`-Werte (`executed | skipped_stale | skipped_dependency | downgraded | error`) werden vom HanaStore persistiert und gelesen — wie im SQLite-Store.
- **G8/[PII-GATE].** Diagnostik nur bei `_allow_diagnostics` + Spalten-Allowlist + TTL. WS G (Quarantäne) erbt dieselbe Disziplin: default-off, Allowlist, TTL, restriktiver Zugriff; Rohzeilen berühren den App-Prozess nie (`INSERT … SELECT` in-HANA).
- **S-13 fail-closed.** Kein stiller SQLite-Fallback bei `STORE_BACKEND=hana`; fehlender Treiber / fehlende Result-Env → harter, sicherer Startfehler (keine Interna, S-14).

## A.1 — Ist-Zustand (verifiziert)

| Baustein | Datei | Stand |
|---|---|---|
| Protocol | `store/base.py` | 15 Methoden (`save_run`, `get_run(s)`, `get_previous_actuals`, `get_check_history`, `get_metric_series`, `get_health_trend`, `get_status_heatmap`, `set_run_state`, `append_progress`, `get_progress`, `begin_operation`, `finish_operation`, `get_operation`, `get_compliance`, `set_compliance`, `get_diagnostics`). |
| SQLite-Referenz | `store/sqlite_store.py` | Vollständig **+** über das Protocol hinaus: `try_begin_run`, Compliance-Events, Schedules, Incidents, SLA, Familien-Status, Notification-Routing, `get_all_runs`, `get_object_status`, `get_latest_run`. |
| HANA-Stub | `store/hana_store.py` | Alle Protocol-Methoden `raise NotImplementedError`; `close()` schließt die Connection. Erfüllt das `runtime_checkable` Protocol bereits strukturell (Konformitätstest grün). |
| Wiring | `services/api/deps.py:get_store` | Wirft bei `STORE_BACKEND=hana` (L-8, kein stiller Fallback). |
| Migrationen | `store/migrations/00N_*.sql` | 9 Dateien, **SQLite-Dialekt** (`AUTOINCREMENT`, `INSERT OR REPLACE/IGNORE`, partieller Unique-Index, `datetime('now', ?)`/`date(...)`, `PRAGMA`). |
| Connection | `connect/db_connection.py` | `get_connection`/`check_connection` fertig, `DbConnection`/`DbCursor`-Protocols, Retry/Backoff, `statementTimeout`, TLS. `query_helpers.qualified/query/query_one` für dict-Rows. |
| Settings | `services/api/settings.py` | `store_backend`, `sqlite_db`, `allow_local_diagnostics`, `diagnostics_ttl_days` vorhanden. **Neu nötig:** `results_environment` (Name des Environments für die Result-Connection). |

**Kernrisiko / die eigentliche Arbeit:** `sqlite_store` ist nicht nur „andere Syntax". Es nutzt SQLite-Eigenheiten, die im HANA-Pfad ein bewusstes Äquivalent brauchen:

1. **`cur.lastrowid`** (Diagnostics-Verknüpfung `result_id`, Incident-/Channel-/Rule-IDs) → HANA-Identity zurücklesen.
2. **`INSERT OR REPLACE`** (`save_run`, `set_compliance`) → HANA `UPSERT … WITH PRIMARY KEY` / `MERGE`.
3. **`INSERT OR IGNORE`** (Progress-Migration) → UPSERT bzw. weglassen.
4. **Partieller Unique-Index** `… WHERE run_state='running'` (Doppellauf-Schutz F2) → HANA kennt **keine** partiellen Indizes. Eigene Strategie nötig (A.4).
5. **Datums-/Zeitfunktionen** `datetime('now', ?)`, `date('now', ?)`, `date(col)` (Heatmap, Diagnostics-TTL) → `ADD_DAYS`/`TO_DATE`/`CURRENT_UTCTIMESTAMP`.
6. **`PRAGMA`/`?`-Platzhalter** — `PRAGMA` entfällt; `?` ist in hdbcli identisch (gut).

## A.2 — Architekturentscheidung: ein Dialekt-Schalter, eine SQL-Quelle

Statt parallele `migrations/hana/*.sql` zu pflegen (Doppel-Pflege, Drift-Risiko), kapseln wir die Dialekt-Unterschiede in **einem** Modul und teilen die Migrations-Logik:

**`store/dialect.py` (neu, framework-free):**
- `class Dialect(Protocol)` mit den Punkten, an denen sich SQLite und HANA unterscheiden:
  - `translate_ddl(sql: str) -> str` — übersetzt eine `CREATE TABLE/INDEX`-Anweisung (Typen, Identity, Index-Filter).
  - `upsert(table, pk_cols, all_cols) -> str` — liefert `INSERT OR REPLACE` (SQLite) bzw. `UPSERT … WITH PRIMARY KEY` (HANA).
  - `now_minus_days(days) -> str` / `date_of(col) -> str` — Datums-Ausdrücke.
  - `last_identity(cursor) -> int` — Identity-Rücklesen (SQLite `lastrowid`; HANA `SELECT CURRENT_IDENTITY_VALUE() FROM DUMMY`).
  - `supports_partial_unique -> bool`.
- `SqliteDialect` und `HanaDialect` als Implementierungen.
- **Migrations-Runner gemeinsam:** ein `apply_migrations(conn, dialect, schema=None)` in `store/migrations/__init__.py`, das die vorhandenen `00N_*.sql` liest, jede Anweisung durch `dialect.translate_ddl` schickt und im jeweiligen `schema_migrations` (für HANA schema-qualifiziert) verbucht. `ResultStore._init_db`/`_run_migration` wird auf diesen gemeinsamen Runner umgestellt (verhaltensgleich für SQLite — Regressionsschutz durch die bestehende Suite).

**`translate_ddl` (HANA) konkret:**
| SQLite | HANA |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL PRIMARY KEY` |
| `TEXT` | `NVARCHAR(5000)` (kurze Felder) bzw. `NCLOB` (`sql_text`, `result_json`, `row_data`, `payload_json`, `line`) — Mapping per Spaltenheuristik/Annotation |
| `INTEGER` | `INTEGER` |
| `CREATE UNIQUE INDEX … WHERE run_state='running'` | **übersprungen** → durch Run-Guard-Tabelle ersetzt (A.4) |
| `CREATE INDEX IF NOT EXISTS` | `CREATE INDEX` idempotent über Katalog-Check (`SYS.INDEXES`) statt `IF NOT EXISTS` |
| `INSERT OR IGNORE … SELECT … FROM dq_run_progress` (Migration 008) | **übersprungen** (Legacy-Tabelle existiert in HANA nie; nichts zu migrieren) |

> Hinweis: NCLOB-vs-NVARCHAR-Zuordnung wird als kleine, explizite Spaltenliste im `HanaDialect` gepflegt (wenige Langtext-Spalten), nicht geraten. Das hält die DDL deterministisch und reviewbar.

## A.3 — `HanaStore` implementieren (E2)

`store/hana_store.py` bekommt dieselbe Methodenoberfläche wie `ResultStore`, gebaut auf `query`/`query_one` (dict-Rows) + `dialect`:

- **Konstruktor:** `HanaStore(connection, *, schema, allow_diagnostics=False, diagnostics_columns=None, diagnostics_ttl_days=0)`. `schema` ist das Open SQL Schema (currentSchema ist bereits gesetzt; qualifiziertes DDL nutzt `schema` zusätzlich für Migrations-Tracking). `_init_db()` läuft über den gemeinsamen Runner mit `HanaDialect`.
- **Transaktions-Helfer** analog `ResultStore._conn` (commit/rollback), aber auf der hdbcli-Connection (eine Connection pro Store-Instanz; `cursor()` je Operation, kein `PRAGMA`/`WAL`).
- **`save_run`:** `UPSERT` auf `dq_runs`; je Result `INSERT` in `dq_check_results`, dann `dialect.last_identity(cursor)` für `result_id`; Diagnostik wie SQLite hinter dem PII-Gate.
- **Lesemethoden** (`get_run(s)`, `get_previous_actuals`, `get_check_history`, `get_metric_series`, `get_health_trend`, `get_status_heatmap`, `get_object_status`, `get_compliance(_events)`, `get_diagnostics`, `get_operation`, `get_progress`): identisches SQL, nur Datums-Ausdrücke über den Dialekt und `ROW_NUMBER() OVER (…)` (HANA-nativ, unverändert).
- **Schreibmethoden** (`set_run_state`, `set_compliance` + Event-Log, `append_progress`/`begin/finish_operation`, `try_begin_run`, Incidents/Schedules/Notifications): UPSERT/Insert + Identity-Rücklesen über den Dialekt.
- **Über-Protocol-Methoden** (`try_begin_run`, Incidents, Schedules, SLA, Familien-Status, Notification-Routing, `get_all_runs`, `get_object_status`, `get_latest_run`): vollständig mit-implementieren — die API/Router nutzen sie real, nicht nur das schmale Protocol. (Ohne sie wäre `STORE_BACKEND=hana` nur scheinbar lauffähig.)

**Anti-Duplikations-Hinweis:** Lese-SQL und Status-Mappings (`status_map`, `_STATUS_SCORE`, `_METRIC_FAMILY`, `_OBS_TYPES`) sind heute Klassen-Member von `ResultStore`. Um Drift zwischen beiden Stores zu vermeiden, in ein gemeinsames `store/_common.py` (framework-free) ziehen oder als Modul-Konstanten teilen — beide Stores referenzieren dieselbe Quelle.

## A.4 — Doppellauf-Schutz ohne partiellen Index (F2 auf HANA)

SQLite garantiert „höchstens ein laufender Run je Dataset" über `CREATE UNIQUE INDEX … WHERE run_state='running'`. HANA kann das nicht direkt. Gewählte Lösung (deterministisch, ein Roundtrip):

- Eigene Tabelle **`dq_running_runs(dataset NVARCHAR PRIMARY KEY, run_id NVARCHAR, since TIMESTAMP)`** im Open SQL Schema (per Migration, nur HANA-Dialekt-Zweig).
- `try_begin_run`: `INSERT INTO dq_running_runs(dataset, …)` — schlägt der PK fehl (`IntegrityError`/Unique-Violation), läuft bereits ein Run → `return False`. Sonst zusätzlich der `INSERT` in `dq_runs` und `return True`.
- `set_run_state(state='finished'|'error')` **und** `save_run` mit terminalem `run_state`: `DELETE FROM dq_running_runs WHERE dataset=?` (Slot freigeben).
- Damit ist die Semantik des partiellen Index 1:1 abgebildet; der Konformitätstest `test_try_begin_run_blocks_second_running` wird env-gated auch gegen HANA grün.

## A.5 — Wiring: `deps.get_store()` + Settings (E3)

- **`settings.py`:** neues Feld `results_environment: str = ""` (Name des Environments, das die Result-Connection liefert — Host/Port/User/`password_ref`/`schema` = Open SQL Schema).
- **`deps.get_store()`** bei `store_backend == "hana"`:
  1. `env = get_environment(settings.results_environment)`; fehlt es / fehlt das Schema → **harter, sicherer Fehler** (S-13/S-14), kein SQLite-Fallback.
  2. `conn = get_connection(host, port, user, password, schema=env["schema"], …)` (TLS/Retry wie gehabt).
  3. `HanaStore(conn, schema=env["schema"], allow_diagnostics=settings.allow_local_diagnostics, diagnostics_ttl_days=settings.diagnostics_ttl_days)` — `_init_db()` legt die Result-Tabellen im Open SQL Schema an (idempotent).
- `StoreDep` bleibt unverändert (Typ ist das Protocol-konforme Store-Objekt). Single-Instance-Caching wie heute; bei Prozessende `close()`.

## A.6 — Verifikation & Härtung (WS F)

**A.6.1 Smoke-Harness** `tests/integration/test_hana_smoke.py` + `make hana-smoke`
- Nur aktiv mit `HANA_SMOKE=1` + Env-Vars (Host/Port/User/PW-Ref/Schema); ohne Flag `pytest.skip` → CI bleibt grün, `dq_core[hana]` muss nicht in der CI installiert sein.
- Inhalt: (a) `check_connection` grün; (b) `HanaStore._init_db` legt Tabellen an (zweiter Lauf idempotent); (c) **die bestehende Store-Suite** (`test_store_protocol_and_compliance.py`-Szenarien: Protocol-Konformität, Compliance-`since`/Events, Doppellauf-Schutz, Diagnostics-TTL) **parametrisiert gegen den HanaStore**; (d) Multi-Worker: zwei Store-Instanzen auf demselben Schema, `try_begin_run`-Race → genau einer gewinnt.
- Reproduzierbares Ziel dokumentieren: HANA Cloud Trial **oder** `hanaexpress`-Container (D4 bleibt zu klären, blockiert aber nur den env-gated Lauf, nicht den Code).

**A.6.2 DB-User-Härtung (S-4)** — in `Tooldokumentation.md` §9/§10:
- Schreib-User: DDL/DML **nur** im eigenen Open SQL Schema; nie Space-Admin. Lese-Zugriff (falls derselbe User die Prüf-Objekte liest): nur `SELECT` auf die Space-exponierten Objekte. Ein-User- vs. Zwei-User-Variante (abhängig von Space-Grants) beide festhalten. TLS `encrypt`+Cert bereits verifiziert.

**A.6.3 Doku-Nachzug:** `Tooldokumentation.md` §6 (`RESULTS_ENVIRONMENT`-ENV), §10 (Re-Consumption: Space fügt das Open SQL Schema als Quelle hinzu → Quality-KPIs als DSP-Quelle für SAC/Modelle, E4); `REVIEW_Tool_v2_Status.md` / `HANDOVER.md` §5 (O6 von „open" → „done", sobald A.6.1 grün).

## A.7 — Quarantäne-/Reject-Store (WS G, optional, nach A.3–A.5)

Zeilen-genaue Verstöße landen **per `INSERT … SELECT` direkt im Open SQL Schema** — Rohzeilen berühren den App-Prozess nie (E6 strikter als der heutige `dq_diagnostics`-Pfad), und die Tabelle ist aus dem Space zurück-konsumierbar (Reject-/Remediation-Dashboards in SAC).

- **Nur zeilen-identifizierbare Familien:** `not_null`, `completeness`, `keys`/Duplikate, `referential` (Orphans), `matches`/Regex, `cross_field`. **Nicht** `volume.min_rows`/`freshness`/`volume_anomaly`.
- **Compiler** (`contract/compiler.py`): neben dem Aggregat-Check optional einen **Quarantäne-`SELECT`** mit demselben Verletzungs-Prädikat, projiziert auf **PK + Allowlist-Spalten**, `LIMIT N`. Opt-in je Garantie: `quarantine: { enabled, columns[], limit }`, **default off** (G1 bleibt: kein SQL im Contract, nur semantisches Flag).
- **Tabelle** (Migration, beide Dialekte): `dq_quarantine(id IDENTITY, run_id, dataset, check_name, captured_at, row_key, payload_json)` — `payload_json` nur Allowlist-Spalten. TTL-Cleanup wie `diagnostics_ttl_days`.
- **PII-Disziplin = `dq_diagnostics`:** default-off, Allowlist, TTL, restriktiver Zugriff. Verhältnis zu `dq_diagnostics` entscheiden (zweite Stufe vs. Ablösung).
- **Ausführung:** im Run-/Dry-Run-Thread nach einem fehlgeschlagenen, quarantäne-fähigen Check ein `INSERT … SELECT` ins Open-Schema (Progress-Zeile „Quarantäne: N Zeilen erfasst").

## A.8 — Sequenz, Tests, Aufwand

| Schritt | Inhalt | hängt ab von | Aufwand (PT) |
|---|---|---|---|
| A-1 | `store/dialect.py` (Sqlite/Hana) + gemeinsamer Migrations-Runner; SQLite-Pfad verhaltensgleich umstellen | — | 1–1,5 |
| A-2 | `HanaStore` alle Protocol- **und** Über-Protocol-Methoden; geteilte Lese-SQL/Mappings | A-1 | 3–4 |
| A-3 | Run-Guard-Tabelle `dq_running_runs` + `try_begin_run`/Freigabe (A.4) | A-1 | 0,5 |
| A-4 | `settings.results_environment` + `deps.get_store()`-HANA-Zweig (A.5) | A-2 | 0,5–1 |
| A-5 | Smoke-Harness + Store-Suite gegen HANA parametrisiert (A.6.1) | A-2,3,4 | 1,5–2 |
| A-6 | DB-User-Härtung + Doku-Nachzug (A.6.2/3) | A-5 | 0,5–1 |
| A-7 | Quarantäne-Store (WS G) — Compiler-Paar-Query, Migration, Ausführungs-Hook, Tests | A-2 | 2–3 |

**Brutto ≈ 9,5–13 PT.** Kritischer Pfad A-1 → A-2 → A-4 macht `STORE_BACKEND=hana` lauffähig; A-5/A-6 weisen es nach; A-7 ist additiv.

## A.9 — Definition of Done (AP A)

- `ResultStoreProtocol`-Konformität für `HanaStore` (`runtime_checkable`, `isinstance`) bleibt grün; **kein** `NotImplementedError` mehr auf den Protocol-/Über-Protocol-Methoden.
- `STORE_BACKEND=hana` + `RESULTS_ENVIRONMENT=<env>` startet ohne Fehler, legt die Result-Tabellen idempotent im **Open SQL Schema** an (kein `CENTRAL`/`dq_results_lt`-Literal — G2).
- Die bestehende Store-Suite läuft **env-gated** (`HANA_SMOKE=1`) gegen das Open SQL Schema grün, inkl. Doppellauf-Schutz (A.4) und Multi-Worker.
- Result-Tabellen sind aus dem Datasphere-Space lesbar (manuell verifiziert, E4).
- WS G (falls gezogen): fehlschlagender `not_null`-Check mit `quarantine.enabled` schreibt **nur** Key+Allowlist-Spalten per `INSERT … SELECT`; `volume`/`freshness` erzeugen keine Quarantäne; TTL greift; ohne `enabled` bleibt die Tabelle leer.
- Gates G2/G6/G7/G8 grün; SQLite-Pfad durch den umgestellten gemeinsamen Runner **regressionsfrei** (bestehende `tests/unit`/`tests/api` grün).

## A.10 — Bewusst NICHT in AP A
- Connection-Pooling/persistente Sessions für den Result-Store (eine Connection je Store-Instanz genügt; Pooling erst bei Lastbedarf).
- Migration bestehender SQLite-Result-Daten nach HANA (greenfield je Deployment; kein Daten-Backfill).
- UI-Editor für `RESULTS_ENVIRONMENT` (Anlage bleibt `environments.yml`/Secret-Store, D3).
- Parallele `migrations/hana/*.sql`-Dateien (bewusst durch den Dialekt-Schalter ersetzt, A.2).

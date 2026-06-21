# Hypothese: voller Ersatz der Signal-Prüfkette durch datacontract-cli *mit* HANA-Engine

> Drittes Begleitdokument der `datacontract-cli_*`-Serie, nach
> [`datacontract-cli_Integration.md`](datacontract-cli_Integration.md)
> (Feature-Landkarte) und [`datacontract-cli_Bewertung.md`](datacontract-cli_Bewertung.md)
> (Entscheidungsgrundlage). Während die Bewertung in §6 die Frage *„lohnt voller
> Ersatz?"* **argumentativ** verneint, zeichnet dieses Dokument denselben Fall
> **konstruktiv durch**: Wie *sähe* die Architektur konkret aus, wenn
> (a) `datacontract test` einen echten **HANA-Executor** (`type: hana`) bekäme und
> (b) Signal seine native Prüfkette (`validator → compiler → check_engine`)
> **dadurch ersetzt**?
>
> Zweck: ein präzises Soll-Bild als Diskussions- und Schaubild-Grundlage — inkl.
> der Teile, die *nicht* verschwinden, sondern als **Shim** zurückkehren. Stand:
> Konzept, nicht-bindend. **Empfehlung am Ende bleibt: nicht voll ersetzen** —
> hier aber mit konkreter Architektur belegt statt nur behauptet.

---

## 0. Die Prämisse — was wir für dieses Gedankenexperiment annehmen

| # | Annahme | Realität heute |
|---|---|---|
| P1 | `datacontract test` besitzt einen **HANA-Connector** (`servers: type: hana`), gebaut auf `sqlalchemy-hana`/`hdbcli`, delegiert an Soda Core | existiert **nicht** (kein `type: hana`) |
| P2 | Quality wird **im Contract-YAML** geschrieben (`quality:`-Sektion, Ebene B) statt aus Garantien kompiliert | bei Signal verboten (Gate G1) |
| P3 | Wir akzeptieren das **datacontract.com-/ODCS-YAML-Format** als kanonische Quelle der Wahrheit statt unseres Schemas v1 | heute ist `contracts/*.yaml` (Schema v1) die Wahrheit, ODCS nur Einweg-Export |

Unter P1–P3 fällt die Existenzberechtigung dreier Kern-Bausteine — `validator.py`
(G1-Gate), `compiler.py` (einziger SQL-Erzeuger) und `check_engine.py` (HANA-Runner)
— weg. **Alles andere bleibt** und muss neu angedockt werden. Genau das ist der
Knackpunkt.

---

## 1. Ist-Architektur (heute, nativer Pfad)

Referenz: `README.md` (Repo-Layout), `packages/dq_core/`.

```
contracts/*.yaml      packages/dq_core/                                          services/        apps/
(Schema v1,           ─────────────────────────────────────────────────────     ─────────        ─────
 SQL-frei)
   │
   ▼  G1            ┌───────────┐  G1   ┌───────────┐  CheckDef  ┌──────────────┐   ┌──────────┐  ┌─────────┐
┌──────────┐ json   │validator  │──────▶│ compiler  │──────────▶│ check_engine │──▶│  store   │─▶│ Cockpit │
│ Contract │schema  │.py        │guaran-│.py        │ (SQL aus   │.py           │   │ sqlite/  │  │ React   │
│ YAML     │───────▶│           │ tees  │+library/  │ Templates) │ hdbcli,      │   │ hana     │  │ Grid/   │
└──────────┘        └───────────┘ →SQL  │check_lib  │            │ NUR LESEND   │   │+compli-  │  │ SLA/    │
                                         │.json      │            │ batch/gating │   │ ance.py  │  │ Cover.  │
                                         └───────────┘            │ PII-Gate(G8) │   └──────────┘  └─────────┘
                                                                  └──────────────┘        │  ▲
   obs/ (baselines, miner) ─ proposals ─▶ contracts             lineage/ (CSN)            │  │ compliance/
                                                                                          │  │ SLA-Events
   to_odcs() ──▶ *.odcs.yaml (Einweg, Interop)                  cli/dq_check_runner.py ───┘  │ (Store-only, A1)
```

**Eigenschaften, die wir später als Anforderungen wiederfinden:**

- **G1** — kein SQL im Contract; `compiler.py` ist der *einzige* SQL-Erzeuger,
  deterministisch aus `check_library.json` (~v4-Katalog inkl. SAP/HANA-Checks).
- **G2** — `{schema}`-Platzhalter, erst zur Laufzeit gebunden (`bind_schema`).
- **G6** — Gating sichtbar: günstige Frische-Gates entscheiden über teure
  Konsistenz-Checks; übersprungene Checks erscheinen als `skipped_stale`
  (`check_engine._run_with_gating`).
- **G7** — `dq_core` ist frameworkfrei (keine Tool-/Framework-Importe).
- **G8** — PII-Gate: Rohzeilen verlassen HANA nur mit explizitem
  `diagnostics.enabled` am Check (`check_engine._run_one_check`).
- **HANA-Native-SQL** — Batch via `UNION ALL ... FROM DUMMY`, `statementTimeout`,
  `APPROXIMATE_COUNT_DISTINCT`, `LIKE_REGEXPR`, `SYS`-Views, SAP-Input-Parameter.
- **A1** — Compliance/SLA leben **nur** im Store (`compliance.py`), nie im YAML.

---

## 2. Soll-Architektur unter der Hypothese (voller Ersatz)

Die CLI wird zum **Executor**. Drei native Bausteine entfallen, **vier Schichten
um die CLI herum bleiben** und ein neuer **Adapter/Harness** entsteht.

```
contracts/*.dcs.yaml    NEU: signal_harness/                       datacontract-cli      services/   apps/
(datacontract.com-      ────────────────────────────────────      (extern, mit          ─────────   ─────
 Format, MIT quality:)                                              HANA-Engine)
   │
   ▼                  ┌──────────────┐   subprocess   ┌─────────────────────────────┐
┌──────────┐          │ ro/PII-Shim  │───────────────▶│ datacontract test           │
│ Contract │          │ (Ex-G8/G7/   │   datacontract │  servers.type: hana         │
│ YAML mit │─────────▶│  read-only)  │   test --output│  → Soda Core → sqlalchemy-  │
│ quality: │ dc lint  │              │◀───────────────│    hana → HANA (LESEND?)    │
└──────────┘ (Ex-G1?) └──────┬───────┘   run.json     └─────────────────────────────┘
                             │  parse run.json (pass/fail je Check)
                             ▼
                      ┌──────────────┐   ┌──────────┐   ┌──────────┐  ┌─────────┐
                      │ result-mapper│──▶│  store   │──▶│   API    │─▶│ Cockpit │
                      │ run.json →   │   │ +compli- │   │ (FastAPI)│  │ (unver- │
                      │ RunSummary   │   │ ance.py  │   │          │  │  ändert)│
                      └──────────────┘   └──────────┘   └──────────┘  └─────────┘
                             ▲
   obs/ · lineage/ · lifecycle · Diff/Breaking  ── bleiben, docken an run.json/YAML an
```

### 2.1 Was **stirbt** (durch die CLI ersetzt)

| Baustein heute | Schicksal | Ersetzt durch |
|---|---|---|
| `contract/validator.py` (G1-Gate) | **entfällt** | `datacontract lint` (ODCS-Spec-Konformität) — semantisch **schwächer**, s. §4 |
| `contract/compiler.py` (Garantie→SQL) | **entfällt** | `datacontract test` generiert SQL/SodaCL intern |
| `library/check_library.json` (Template-Katalog) | **entfällt als Laufzeitpfad** | Soda-Core-Metriken + im YAML geschriebene `quality:`-Checks |
| `engine/check_engine.py` (HANA-Runner, Batch/Gating) | **entfällt** | `datacontract test` (Soda Core) |
| `engine/expectation.py` (Soll-Grammatik `= 0`, `>= 1000`) | **entfällt** | Soda/ODCS-Operatoren (`mustBe…`, `fail condition`) |

### 2.2 Was **bleibt** (CLI kann es konzeptionell nicht)

| Baustein | Warum es bleibt |
|---|---|
| `store/` + `contract/compliance.py` | CLI ist **zustandslos** (run→pass/fail). `compliant↔breached`-Transition, SLA-Fenster, Incident-Timeline gibt es nur hier (A1). |
| `apps/cockpit/` | Status-Grid, Coverage-Map, Workbench, Runs, Incidents, Proposals — kein CLI-Äquivalent. |
| `obs/` (baselines, miner) | Rolling-Baselines + datengetriebene Garantie-Vorschläge. ODCS modelliert keine Laufzeit-Historie. |
| `lineage/` (CSN) | Spalten-Lineage/CSN-Rekonstruktion. |
| Lifecycle/SemVer/Approval, `diff.py`/`gate_g3.py` | Git-als-Wahrheit, Breaking-Schutz (G3). `datacontract breaking` ist hier nur Zweitmeinung. |
| `services/api/` + Auth/OIDC | REST-Fläche, fail-closed OIDC, SSE — die CLI ist kein Server. |

### 2.3 Was **neu** gebaut werden muss (der Preis des Ersatzes)

| Neuer Baustein | Aufgabe | Ersetzt verlorene Garantie |
|---|---|---|
| **read-only/PII-Shim** | erzwingt read-only Technical User + unterdrückt Rohzeilen, *bevor* die CLI läuft | **G8** (PII) + Read-only — die CLI garantiert beides **nicht** |
| **result-mapper** | parst `datacontract test --output run.json` → `RunSummary`/`CheckResult` für den Store | die heute integrierte Engine→Store-Naht |
| **subprocess/runtime-isolation** | CLI als Fremdprozess kapseln, Timeouts, Fehlerklassifikation, Secrets-Handling | `statementTimeout`, `execution_mode`, Batch-Fallback aus `check_engine` |
| **YAML-Bridge** | unser Schema v1 ↔ datacontract.com-Format (oder Vollumstieg auf dc-Format) | Authoring-Pfad + `to_odcs()` |
| **Gating-Reimplementierung** | günstige Gates vor teure Checks; `skipped_stale` sichtbar | **G6** — Soda Core kennt unser Gating-Modell nicht |

> **Die unbequeme Symmetrie:** Drei Bausteine entfallen (2.1), aber fünf neue
> entstehen (2.3) — und vier davon existieren **nur**, um Garantien
> wiederherzustellen (G1, G6, G8, Read-only), die die native Engine *gratis*
> mitbringt. Der gelöschte Teil kehrt als Security-/Governance-Schicht zurück.

---

## 3. Datenfluss im Detail — ein Run unter der Hypothese

```
1. Trigger        services/api  POST /objects/{id}/run     (unverändert)
                       │
2. Resolve        Harness lädt contracts/<ds>.dcs.yaml + bindet Server/Schema
                       │                                   (Ex-G2: jetzt in der YAML
                       │                                    'servers:' statt {schema})
3. Guard          ro/PII-Shim:  ── read-only TU prüfen ── PII-Spalten maskieren ──┐
                       │                                                            │ Ex-G8/Read-only
4. Execute        subprocess:  datacontract test contracts/<ds>.dcs.yaml \         │ (NEU, war im
                                 --server hana_prod --output run.json              │  Engine gratis)
                       │            │                                              │
                       │            └─▶ Soda Core ─▶ sqlalchemy-hana ─▶ HANA ◀─────┘
                       │
5. Map            result-mapper:  run.json → RunSummary(run_id, results[], …)
                       │           (Verlust: kein 'state=skipped_stale', kein
                       │            HANA-Batch-UNION, kein Diagnostics-Gate-Feld)
                       │
6. Persist        store.save_run(summary)  +  compliance.compute_compliance()   (unverändert)
                       │
7. Surface        API → SSE → Cockpit (Grid/SLA/Incidents)                      (unverändert)
```

**Reibungspunkte gegenüber heute (Schritt 4–5):**

- **Gating (G6)** muss der Harness *außerhalb* der CLI nachbauen: erst die
  Frische-Checks als eigener `datacontract test`-Lauf, dann — nur bei frischen
  Daten — die teuren Checks. Das native `_run_with_gating` (ein Prozess, ein
  Batch) wird zu **mehreren CLI-Aufrufen** mit eigener Orchestrierung.
- **Batch-Effizienz** geht verloren: `check_engine._build_batch_sql` bündelt heute
  ~20 Checks in *ein* `UNION ALL ... FROM DUMMY`. Soda Core fährt pro Metrik/Query;
  Round-Trips gegen HANA steigen.
- **PII-Diagnostik (G8)** war ein *Feld am Check* (`diagnostics.enabled` +
  Spalten-Allowlist) mit Unterdrückung **an der Quelle**. Mit der CLI gibt es kein
  äquivalentes per-Check-Flag — die Unterdrückung muss vor- und nachgelagert um
  den Fremdprozess herum erzwungen werden (fehleranfälliger).

---

## 4. Der Authoring-/Governance-Bruch (P2/P3)

Heute (SQL-frei, Garantie-zentriert, `contracts/DS_SALES_ORDERS.yaml`):

```yaml
guarantees:
  keys:
    - columns: [ORDER_ID]
      unique: true
  freshness:
    column: ORDER_DATE
    max_age: PT26H
```

Unter der Hypothese (datacontract.com-Format, Quality **in** der YAML):

```yaml
models:
  sales_orders:
    fields:
      ORDER_ID: { type: string, unique: true, primaryKey: true }
      ORDER_DATE: { type: timestamp }
servers:
  hana_prod:
    type: hana            # ← die hypothetische neue Engine
    host: ...
    schema: SALES
quality:
  - type: sql             # ← Ebene B: SQL kehrt in den Contract zurück
    query: |
      SELECT SECONDS_BETWEEN(MAX(ORDER_DATE), CURRENT_TIMESTAMP) FROM sales_orders
    mustBeLessThan: 93600
```

**Was das kostet:**

1. **G1 fällt.** Die `quality:`-Sektion erlaubt `type: sql`/`custom` →
   Roh-SQL/SQL-Injection-Fläche im Vertrag, S2-Identifier-Schutz weg. `datacontract
   lint` prüft **Spec-Konformität**, nicht „kein SQL" — das müsste man als eigenen
   Lint-Regelsatz **neu** bauen (und widerspräche dann dem Sinn von Ebene B).
2. **Determinismus/Diffbarkeit** sinkt. Heute ist ein Check ein Bedeutungs-Diff
   (`unique: true`); künftig ein SQL-String-Diff — `diff.py`/`gate_g3.py` müssten
   auf SQL-Heuristik umgestellt werden.
3. **SAP/HANA-Semantik wandert in jeden Contract.** BSEG-Balance, BKPF-Orphan,
   Fiscal Completeness, `SYS`-Views, Input-Parameter haben in SodaCL kein
   deklaratives Äquivalent → landen als `type: sql custom`. Der ~v4-Katalog aus
   `check_library.json` wird von **einem zentralen, getesteten Template** zu
   **kopiertem SQL pro YAML**.
4. **G7 bröckelt.** Der Harness importiert/ruft ein Framework (CLI + Soda Core).
   `dq_core` bliebe nur frameworkfrei, wenn der CLI-Aufruf strikt in
   `services/`/`signal_harness/` gekapselt wird — `dq_core` verlöre dann aber
   seinen Zweck (Engine/Compiler sind ja weg).

---

## 5. Migrationspfad (falls man es *trotzdem* täte)

Ein verantwortbarer Umstieg wäre **nie** ein Big-Bang, sondern schrittweise mit
Doppelbetrieb:

| Stufe | Schritt | Sicherung |
|---|---|---|
| M0 | HANA-Connector zur CLI beisteuern/abwarten (`type: hana`), read-only ausgelegt | s. Bewertung §10, „Weg 2" |
| M1 | **Advisory-Doppellauf**: CLI parallel zur Engine, Ergebnisse vergleichen (analog `odcs-second-opinion`) | Engine bleibt Produktionspfad; Diskrepanz = Report |
| M2 | result-mapper + read-only/PII-Shim bauen, in den Store schreiben | G5 (Engine-Regression) als Vergleichsnetz |
| M3 | Gating + Diagnostics-Äquivalent im Harness; Cockpit liest CLI-Runs | G6/G8 nachweislich erhalten, sonst Stop |
| M4 | Contract-Format-Bridge (Schema v1 ↔ dc/ODCS); Authoring umstellen | `validate_contract` als Quality-Gate beibehalten, bis Bridge steht |
| M5 | Engine/Compiler/Validator deprecaten — **nur** wenn M1–M4 grün | Rückrollbar bis hier |

**Abbruchkriterien (jede ist allein ausreichend):** Read-only/PII nicht beweisbar
(G8) · Gating/`skipped_stale` nicht reproduzierbar (G6) · SAP-Checks nur als
Roh-SQL realisierbar (G1) · Performance-Regression durch Round-Trips · CLI kann
HANA-Native-SQL nicht ausdrücken.

---

## 6. Bewertung der Soll-Architektur — ehrliche Bilanz

**Was man gewinnt**

- Ein **Standard-Executor** statt Eigenbau-Engine; Ökosystem-Anschluss (Soda/GX,
  dbt-Export, breite Backends).
- `check_engine.py`/`compiler.py`/`library` als Wartungslast entfallen
  (~der „leichteste" 20–30 %-Layer, Bewertung §6).

**Was man verliert oder neu bezahlt**

- **Vier Garantien als Shim zurück**: G1, G6, G8, Read-only (2.3) — der eigentliche
  Aufwand, nicht das `COUNT(*)`-SQL.
- **HANA-Native-Performance** (Batch-UNION) und **SAP-Check-Bibliothek** als
  zentrale, getestete Templates.
- **Determinismus/Diffbarkeit** der Verträge (Bedeutung statt SQL-String).
- **Marketing-Differenzierer** „einzige mit HANA-Runner" (verschenkt an den Markt,
  Bewertung §10 „Commoditize your complement").

**Bleibt unangetastet** (≈70 % von Signal): Store/Compliance/SLA, Cockpit,
Observability, Lineage, Lifecycle, ORD/CSN, Auth. Genau deshalb ersetzt die CLI —
selbst *mit* HANA-Engine — **nicht das Produkt, nur einen Motor**.

---

## 6.5 Ein Executor oder zwei? — die Dual-Engine-Frage

Naheliegender Einwand zum empfohlenen Mittelweg: Wenn **Delta-Tabellen über die
CLI** und **HANA-Objekte über die eigene Engine** geprüft werden — sind das nicht
**zwei Runner**, also genau das in Integration.md §0 verbotene Anti-Pattern? Und
wäre die CLI als *single tool* für alle Ausführung dann nicht ein großer Mehrwert?

**Was der Leitsatz „niemals ein zweiter Check-Runner" wirklich verbietet:**
*dasselbe Objekt* durch zwei Engines laufen zu lassen und **zwei Wahrheiten** auf
identischen Daten zu erzeugen. Der Substrat-Split ist etwas anderes:

```
HANA-Objekt  ──▶ genau EINE Engine (Signal)     ┐
                                                 ├─▶ EIN Store · EIN compliance.py · EIN Cockpit
Delta-Objekt ──▶ genau EINE Engine (CLI)         ┘
```

Jedes Objekt hat **genau einen** maßgeblichen Runner; nichts wird doppelt geprüft.
Das ist „ein Runner *pro Substrat*", nicht „zwei Runner *auf einer Quelle*". Genau
deshalb sagt Bewertung §8, die CLI sei als Executor *nur* in der Databricks-Plane
tragfähig — dort gibt es kein HANA, mit dem sie kollidieren könnte.

**Die entscheidende Frage ist: *was* muss „single" sein?** Der Mehrwert eines
single tool ist **Konsistenz** — die zählt aber **nicht beim Executor**, sondern
eine Ebene höher:

| Schicht | muss einheitlich sein? | im Split? |
|---|---|---|
| Contract-Semantik (Garantien) | **ja** | ✅ eine Quelle |
| Result-/Compliance-Modell | **ja** | ✅ ein Store, ein `compliance.py` |
| Cockpit / Status / SLA | **ja** | ✅ eine Oberfläche |
| **Executor (Binary)** | **nein** | ❌ zwei — *und das ist ok* |

Solange Contract + Result-Modell + Cockpit **eins** sind, ist „zwei Executoren"
kein zweites Tool, sondern **zwei Adapter hinter einer Plattform** (dasselbe
Muster, mit dem Soda Core intern an Data-Source-Adapter dispatcht). Die CLI ist
dann ein **untergeordneter Executor unter Signals Result-Modell**, kein
gleichrangiges Tool — und diese Unterordnung löst die Anti-Pattern-Sorge auf.

**Warum „CLI als single tool" den Mehrwert nicht gratis bringt:** Damit die CLI
*alles* prüft, müsste sie auch HANA prüfen — also exakt das Hypothese-Szenario aus
§2.3. Der single-tool-Vorteil (eine Mental-Map, ein Skillset, ein Config-Modell)
wird erkauft mit **G1, G8, Read-only und Gating als Shim** zurück, SAP-/HANA-SQL in
jeden Contract kopiert und dem verschenkten Differenzierer. Man tauscht „zwei
saubere Adapter" gegen „ein Tool + vier Shims, die genau die gratis verlorenen
Garantien rekonstruieren".

**Die ehrlichen Kosten des Splits** (umsonst ist er nicht):

| Kosten | Reales Risiko | Gegenmittel |
|---|---|---|
| Zwei Codepfade (HANA-Engine + CLI-Harness + result-mapper) | Wartungs-/Testlast verdoppelt | gemeinsamer Result-Mapper-Vertrag; ein Schema für `RunSummary` |
| **Semantik-Drift** — `unique: true` (Compiler) ≠ Sodas Duplicate-Check? | faktisch doch *zwei Wahrheiten*, nur auf verschiedenen Objekten | **Autorität „Garantie → Check-Definition" bleibt in *einer* Spezifikation** (Library/Mapping); CLI führt nur aus, definiert nicht |
| Zwei Failure-Modes, zwei Config-Welten (hdbcli vs. databricks/duckdb) | Betriebskomplexität | klare Plane-Zuordnung pro Objekt im Inventar; eine Trigger-API |
| Zwei Performance-Profile (Batch-UNION vs. Soda-Round-Trips) | inkonsistente Laufzeiten | Erwartung pro Plane dokumentieren, nicht angleichen wollen |

**Wann single tool *doch* gewinnt:** Es ist eine **Portfolio-Frage**. Ist die
Flotte überwiegend Delta/BDC und HANA marginal, kann die operative Einfachheit
*eines* Executors den Verlust der HANA-Native-Kante überwiegen. Ist HANA der Kern
(heute der Fall), gewinnt der Split — weil der einzige Weg zum single tool über die
HANA-Shim-Steuer (§2.3) führt.

> **Merksatz:** Zwei Executoren hinter *einem* Contract-/Result-/Cockpit-Modell
> sind kein Anti-Pattern, sondern „richtiges Werkzeug pro Substrat". Das
> Anti-Pattern wäre erst zwei *Wahrheiten*. Der single-tool-Mehrwert ist real,
> kostet auf der HANA-Seite aber genau die Governance-Garantien, die Signals Pitch
> ausmachen.

---

## 7. Fazit

Unter P1–P3 ist der volle Ersatz **technisch konstruierbar** (§2–§3), aber er
tauscht *einen* gelöschten Baustein (die Engine) gegen *fünf* neue (§2.3), von
denen vier nur verlorene Sicherheits-/Governance-Garantien rekonstruieren. Die
Architektur wird **größer und schwächer**: mehr bewegliche Teile (Fremdprozess,
Mapper, Shims), weniger harte Garantien (G1 weg, G6/G8 nur noch „best effort").

→ Konsistent mit Bewertung §6/§10 lautet die Empfehlung: **nicht voll ersetzen.**
Falls der HANA-Connector je existiert, ist sein Platz der **Advisory-Executor**
(M1, Doppellauf) — nicht der Produktionspfad. Dieses Dokument liefert das Soll-Bild,
um genau diese Grenze im Schaubild sichtbar zu machen: *Motor austauschbar, Auto
nicht.*

---

## 8. Anker-Referenzen

| Baustein | Datei |
|---|---|
| Nativer Runner (entfiele) | `packages/dq_core/engine/check_engine.py` |
| Compiler / einziger SQL-Erzeuger (entfiele) | `packages/dq_core/contract/compiler.py` |
| Validator / G1-Gate (entfiele) | `packages/dq_core/contract/validator.py` |
| Check-Bibliothek (entfiele als Laufzeitpfad) | `packages/dq_core/library/check_library.json` |
| Compliance-Zustand (bliebe) | `packages/dq_core/contract/compliance.py` |
| ODCS-Export / Format-Brücke | `packages/dq_core/contract/odcs_export.py` |
| Breaking-Diff / G3 (bliebe) | `packages/dq_core/contract/diff.py` · `gate_g3.py` |
| Begründung „nicht ersetzen" | `docs/datacontract-cli_Bewertung.md` §6, §10 |
| Feature-Landkarte | `docs/datacontract-cli_Integration.md` |
</content>
</invoke>

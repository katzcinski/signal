# datacontract-cli vs. Signal — Bewertung & Entscheidungsgrundlage

> Begleitdokument zu [`datacontract-cli_Integration.md`](datacontract-cli_Integration.md)
> (Schaubild-/Feature-Landkarte). Dieses Dokument hält die **Bewertung** fest:
> Wo lohnt die CLI, wo nicht, und warum bleibt die Eigenentwicklung gerechtfertigt.
> Stand der Diskussion, nicht-bindend — als Argumentationsgrundlage.

---

## 0. Kernaussage (TL;DR)

- Die `datacontract-cli` ist für Signal eine **Beigabe in CI/Tooling auf dem
  ODCS-Export** — **kein** Ersatz für Engine, Store oder Cockpit.
- Ihr größter realer Nutzen ist die **Breaking-Change-Zweitmeinung** (läuft schon).
- Ihre „Check-Bibliothek" ist **nicht** das Kaufargument: sie hat keinen festen
  Check-Katalog und **kein SAP-HANA-Backend**.
- Signals Substanz liegt **nicht in der Engine**, sondern in **Governance (G1/G8),
  Runtime-Compliance/SLA, Cockpit, Observability, Lineage und SAP-Semantik** —
  alles Dinge, die ODCS/CLI konzeptionell gar nicht modellieren.

---

## 1. Welche „Checks" bringt die CLI überhaupt mit?

Wichtig: Die CLI hat **keinen festen Check-Katalog** wie Signals
`check_library.json`. Sie kennt zwei Ebenen:

- **Ebene A — Schema-Validierung „gratis"** aus der Feld-Definition:
  Typ · `required` · `unique` · `primaryKey` · `enum` · `pattern` · `format`
  · `minLength`/`maxLength` · `minimum`/`maximum`.
- **Ebene B — `quality:`-Sektion**, selbst geschrieben und an fremde Engines
  delegiert: `type: sodacl` (Soda Core) · `type: great-expectations` ·
  `type: sql`/`custom`. Backends: Snowflake · BigQuery · Postgres · Databricks ·
  Kafka · S3 · Files — **kein SAP HANA**.

→ „Komplette Bibliothek an Checks" = realistisch **Schema-Validierung + Wrapper
um Soda/GX**. Ersetzt Signals ~20 HANA-/SAP-Checks nicht und kann mangels
HANA-Backend nicht gegen eure Quelle laufen.

---

## 2. Signals Gegenstück: die eigene Check-Bibliothek

Quelle: `packages/dq_core/library/check_library.json` (~20 Checks, 5 Kategorien).

| Kategorie | Checks |
|---|---|
| Vollständigkeit | `row_count` · `missing` · `completeness_pct` |
| Konsistenz | `duplicate` · `duplicate_composite` · `duplicate_approx` · `invalid` · `value_range` · `allowed_values` · `pattern_match` · `string_length` · `reference_integrity` |
| Verteilung & Aggregate | `aggregate_range` |
| Aktualität & Sonstiges | `freshness` · `schema` · `custom_sql` |
| SAP / BDC | `sap_bseg_balance` · `sap_bkpf_orphan` · `sap_fiscal_completeness` · `sap_replication_lag` · `sap_key_plausibility` |

Die SAP/BDC- und HANA-Systemsicht-Checks (`SYS.TABLE_COLUMNS`,
`APPROXIMATE_COUNT_DISTINCT`, `LIKE_REGEXPR`, `SECONDS_BETWEEN`,
Input-Parameter `:<YEAR>`/`:<BUKRS>`) sind genau das, was die CLI **nicht** kann.

---

## 3. „SQL-freie Garantien" (Gate G1) — was das heißt

Im Contract steht **was** gelten soll, nie **wie** es abgefragt wird.

```yaml
guarantees:
  keys:
    - columns: [ORDER_ID]      # "ORDER_ID ist eindeutig"
      unique: true
  freshness:
    column: ORDER_DATE
    max_age: PT26H             # "nicht älter als 26 h"
```

Erst der **Compiler** (`compiler.py`) macht daraus deterministisch SQL — aus den
Templates der `check_library.json`. Es gibt **keinen Roh-SQL-Pfad** im Vertrag.

**Nutzen:** Sicherheit (keine SQL-Injection-Fläche im YAML, S2-Identifier-Schutz)
· fachliche Lesbarkeit · Portabilität (dieselbe Garantie → HANA-SQL *oder* ODCS)
· robuste Diffbarkeit (Bedeutungen statt SQL-Strings) · Governance.

---

## 4. Enthält ODCS SQL? — Ja, aber optional

Präzisierung: ODCS v3.1 **erlaubt** SQL, **erzwingt** es nicht.

| `quality.type` | Inhalt | SQL im Vertrag? |
|---|---|---|
| `library` | benannte Regel (rowCount, nullCount …) + Operator | nein (deklarativ) |
| `text` | Beschreibung | nein |
| `sql` | eingebettetes `query:` + Schwellwert | **ja** |
| `custom` | engine-spezifisch (Soda/GX) | **ja** |

Zusätzlich viele **deklarative** Felder auf Property-Ebene (`required`, `unique`,
`primaryKey`, `pattern`, `min`/`max`, `enum`, `format`).

**Signals Haltung:** beim Export (`to_odcs()`) wird **bewusst nur der
deklarative + library-Pfad** genutzt — **nie** `type: sql`. Damit ist G1
**strenger als ODCS**: ODCS lässt dir die Wahl, Signal nimmt dir die SQL-Option
per Gate weg. Folge: ein *fremder* ODCS-Vertrag kann `type: sql`/`custom`
enthalten — euer eigener Export erzeugt das nie.

---

## 5. Kann Signal ODCS-Verträge importieren?

**Heute: nein.** Es gibt nur `to_odcs()` (Einweg-Export); kein `from_odcs()` und
kein Import-Endpoint.

Machbar wäre ein Importer, aber **verlustbehaftet** (umgekehrt zum Export, weil
ODCS die größere Menge ist):

- Deklarativer Teil mappt sauber zurück (`schema.properties`→`schema`,
  `required`→`not_null`, `primaryKey`→`keys`, `quality[rowCount]`→`volume`,
  `nullValues`→`completeness`, `latency`→`freshness`, `relationships`→`referential`,
  `pattern`/`enum`/`min`/`max`→entspr. Checks).
- **`type: sql`/`custom` lässt sich NICHT importieren** (G1, kein Roh-SQL-Pfad) —
  muss als „nicht übernommen" gemeldet, nicht still verworfen werden.
- Jeder Import muss durch `validate_contract` **und** Compile, sonst kein gültiger
  Signal-Contract.

**Wege:** (1) homegrown `from_odcs()` in `dq_core/contract/`, ~150 LOC,
frameworkfrei (G7) — empfohlen, falls Import gebraucht wird. (2) `datacontract
import --format odcs` bringt nichts Zusätzliches (erzeugt datacontract.com-YAML,
nicht euer kanonisches Schema — Mapper braucht ihr trotzdem). Der nützliche
CLI-`import` ist der aus *technischen* Quellen (SQL-DDL, Avro, Glue, BigQuery)
für einen Erst-Entwurf.

---

## 6. Build vs. Buy — auch wenn die CLI eine HANA-Engine hätte

Hypothese: Selbst *mit* HANA-Engine würde die CLi nur **`compiler` + `engine` +
`library`** abdecken (~20–30 % von Signal). **Nicht** ersetzt würden:

- **Runtime-Compliance & SLA** (`store/`, `compliance.py`) — ODCS modelliert keine
  Laufzeit-Resultate; die CLI ist zustandslos (run→pass/fail), kein Result-Store,
  keine `compliant/breached`-Transition, keine Incident-Timeline.
- **Cockpit** — Status-Grid, Coverage-Map, Workbench, Runs, Incidents, Proposals.
- **Observability / Proposal-Miner** (`obs/`) · **Lineage / CSN** (`lineage/`).
- **Lifecycle-Zeremonie** (Lite/Full, SemVer, Approval, Git-als-Wahrheit).
- **SAP/BDC-Semantik & ORD/CSN-Publishing** (`sap-bdc-connect-sdk`).

**Wo es ehrlicherweise knapp würde:** Für den reinen Ausführungs-Layer könnte man
„wrappen statt bauen" — *aber nur*, wenn die HANA-Engine read-only, PII-sicher und
HANA-SQL-nativ wäre. Realistisch (Soda-/GX-basiert, generisch) ist sie das nicht:

1. Verlust der Kontrolle über HANA-Native-SQL (`APPROXIMATE_COUNT_DISTINCT`,
   `LIKE_REGEXPR`, `SYS`-Views, SAP-Input-Parameter).
2. **Kein PII-Gate (G8), keine Read-only-Garantie** — müsstet ihr um die CLI herum
   neu bauen und auditieren.
3. **G1 nicht durchsetzbar** — die CLI erlaubt `type: sql`/`custom`.
4. **G7** — Einbettung bräche „dq_core frameworkfrei".

→ Die Sicherheits-/Governance-Leitplanken baut ihr ohnehin selbst — und das ist
der eigentliche Aufwand, nicht das `COUNT(*)`-SQL.

**Fazit:** Voller Ersatz lohnt auch im Hypothese-Fall nicht. Die HANA-Engine ist
heute euer *Marketing*-Differenzierer („einzige mit HANA-Runner"), nicht euer
*substanzieller* — letzterer (Governance + Compliance + Cockpit + SAP-Kontext)
bliebe bestehen, selbst wenn die CLI HANA könnte. Ihr müsstet die *Erzählung*
anpassen, kaum die *Architektur*.

---

## 7. Empfehlung (Verdichtung)

| Einsatz der CLI | Urteil |
|---|---|
| `datacontract breaking` als CI-Zweitmeinung auf ODCS-Export | ✅ **nutzen** — läuft schon (`odcs-second-opinion`) |
| `datacontract lint` (ODCS-Spec-Konformität des Exports) | ◻️ sinnvoller Low-Cost-Ausbau |
| `export` (dbt/JSON-Schema/Avro/…) | ◻️ nur bei konkretem Konsumenten-Bedarf |
| `import` aus technischen Quellen (SQL/Avro/Glue) | ◻️ nützlich fürs Onboarding |
| `catalog` (statisches HTML) | ◻️ optional (Cockpit deckt internen Fall ab) |
| `test` als Check-Runner | ⛔ **nicht** — kein HANA, bricht G1/G8 |
| Engine/Store/Cockpit ersetzen | ⛔ **nicht** — Kern der Wertschöpfung |

---

## 8. Anker-Referenzen

| Thema | Datei |
|---|---|
| Feature-Landkarte / Schaubild | `docs/datacontract-cli_Integration.md` |
| Contract-Beispiel | `contracts/DS_SALES_ORDERS.yaml` |
| Compiler (einziger SQL-Erzeuger, G1/G2/S2) | `packages/dq_core/contract/compiler.py` |
| Check-Bibliothek | `packages/dq_core/library/check_library.json` |
| ODCS-Export (Einweg-Brücke) | `packages/dq_core/contract/odcs_export.py` |
| Homegrown Breaking-Diff | `packages/dq_core/contract/diff.py` · `gate_g3.py` |
| CLI-Zweitmeinung (aktiv) | `.github/workflows/ci.yml` → `odcs-second-opinion` |
| Voranalyse / Begründung | `docs/REVIEW_Tool_v1_Befunde.md` |

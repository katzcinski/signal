# ADR-0001 — Trennung interner Quality Gates von Contracts

**Adressat:** Beratung, Plattform-Team, Governance, Entwicklung · **Stand:** 2026-06-16
**Status:** *Vorschlag* (proposed) — noch nicht angenommen, noch nicht umgesetzt.
**Zweck:** Festhalten der Architektur-Entscheidung, ob und wie Signal **interne Data-Quality-Checks** von der **Contract-/Governance-Ebene** getrennt modelliert — als Reaktion auf das Konzeptpapier *„Data Contracts für ein Fact-View-Datenprodukt in SAP Datasphere / BDC"*.

> Verwandte Dokumente: `Betriebsmodi_Lite_und_Full.md` (Lite/Full auf einem Unterbau) · `Zusatz_ContractLifecycle_ORDBDCIntegration.md` (ORD/ODCS-Seam) · `HANDOVER.md` (Workstreams, Gates) · `Konzept_DQ_Observability_Cockpit.md` (fachliches Konzept).

---

## 0 — Kernaussage

Das Konzeptpapier formuliert eine harte Trennung: **„Checks gibt es überall, Contracts nur an den zwei Parteigrenzen."** Ein Contract ist ein Versprechen, dem eine **Gegenpartei zugestimmt** hat; er existiert nur dort, wo Verantwortung den Owner wechselt (Inbound: Source ↔ Raw, Outbound: Data Product ↔ Consumer). Ein interner DQ-Check im Integrated Core ist **kein** Contract, sondern ein **Quality Gate** — ihn als Contract zu benennen ist eine *Kategorienverwechslung* (Konzept §6).

Signal modelliert heute **alles als Contract**. Diese ADR schlägt vor, die beiden Kategorien semantisch zu trennen — **auf geteilter Enforcement-Substanz**, nicht durch zwei Engines oder zwei Stores. Leitsatz aus Konzept §5: **„Gleiche Regel, zwei Artefakte"** — Wohnort und Lifecycle unterscheiden sich, der Test nicht.

---

## 1 — Kontext: Was Signal heute tut

Das Datenmodell (`packages/dq_core/contract/model.py`) kennt:

```
Contract: product, dataset, owned_by, owners, version, lifecycle, guarantees
Guarantee: type, params, severity, owned_by
```

Es gibt **keine Dimension für Grenze/Gegenpartei**: kein `inbound`/`outbound`, kein `consumer`/`recipient`, keinen Port-Begriff (verifiziert per Suche über `packages/dq_core/contract/`). Folgen:

- Ein rein interner Sanity-Check auf einer Core-Tabelle wird als **Contract-YAML** geführt — mit `compliance`-Ampel und (im Full-Modus) SemVer/Approval/Breaking-Schutz. Das ist genau die vom Konzept gewarnte Kategorienverwechslung.
- Die **Compliance-Ampel** (`packages/dq_core/contract/compliance.py`) und die **Coverage-Map** vermischen konsumentensichtbare Versprechen mit internen Sanity-Gates. „Rot" kann beides heißen: gebrochene Kundenzusage **oder** intern angezogene Schraube.
- `Guarantee.owned_by` (`platform` vs. `product`) spürt die Spannung bereits — ist aber **Ownership**, nicht **Grenzklassifikation**.

Was bereits richtig ist: Engine, Expectation-Grammatik, Compiler und Result-Store sind framework-frei und kategorie-agnostisch (`[ENGINE-FROZEN]`, Gate G7). Sie führen *Tests* aus — und ein Test ist ein Test, egal ob er eine Vertragsklausel oder ein internes Gate erzwingt. **Diese Schicht bleibt unangetastet.**

---

## 2 — Entscheidung

**Wir trennen den Governance-Mantel, nicht die Enforcement-Substanz.**

Eingeführt wird ein **Klassifikations-Diskriminator** auf Check-Set-Ebene:

| `kind` | Bedeutung | Existiert wo |
|---|---|---|
| `internal_gate` | Internes Quality Gate — keine Gegenpartei | Integrated Core, überall im Pipeline-Verlauf |
| `inbound_contract` | Versprechen der Quelle (Source → Raw) | nur wenn Quelle eine echte Gegenpartei ist |
| `outbound_contract` | Versprechen an den Consumer (Product → Consumer) | an der Consumption-/Output-Grenze |

Daraus abgeleitet die kategorienspezifischen Regeln:

| Dimension | `internal_gate` | `*_contract` |
|---|---|---|
| Zustimmung | keine Gegenpartei | Consumer/Source hat zugestimmt |
| Lifecycle | frei änderbar, zeremonielos | SemVer, Approval, Breaking-Schutz (Gate G3) |
| Bei Verletzung | Engineering-Alert (Team-intern) | Consumer-SLA-Breach / Compliance-Ampel |
| Adressat | Plattform-/Produkt-Team | Consumer / Governance |
| Compliance-Ampel | **nicht** governance-relevant | governance-relevant |

**Bewusst NICHT getrennt** (würde „gleiche Regel, zwei Artefakte" verletzen und Drift erzeugen):

- die Engine (`packages/dq_core/engine/`) — `[ENGINE-FROZEN]`,
- die Expectation-Grammatik und der Compiler,
- der Result-Store (`packages/dq_core/store/`) — ein Lauf, ein Ergebnis-Schema,
- die Check-Bibliothek (`packages/dq_core/library/`).

> Anti-Pattern: Signal in „zwei Säulen" (z. B. eigenes Tool/Store für interne Gates) zu spalten. Das dupliziert Regeln, erzeugt Drift und widerspricht dem Konzept selbst.

---

## 3 — Konkreter Schema-Vorschlag

`kind` wird optionales Feld am Contract-/Set-File. Default = `internal_gate` (siehe §4, ehrlicher Default). `counterparty` ist nur bei `*_contract` zulässig und für die Grenz-Semantik erforderlich.

```yaml
product: DS_SALES_ORDERS
dataset: DS_SALES_ORDERS
kind: outbound_contract          # NEU: internal_gate | inbound_contract | outbound_contract
counterparty:                    # NEU: nur bei *_contract; verboten bei internal_gate
  party: "FIN-Reporting"         #   wer hat zugestimmt (Consumer bzw. Source)
  agreed_at: "2026-06-01"
owned_by: product
lifecycle: active
version: "1.0.0"
guarantees:
  schema: { columns: [...], mode: closed }
  freshness: { column: ORDER_DATE, max_age: PT26H, severity: warn }
```

Validator-Erweiterung (`packages/dq_core/contract/validator.py`):

- `kind` ∈ {`internal_gate`, `inbound_contract`, `outbound_contract`}; fehlt → `internal_gate`.
- `counterparty` **erforderlich** bei `*_contract`, **verboten** bei `internal_gate` (Konzept §2: kein Contract ohne Gegenpartei).
- SemVer-/Approval-/Breaking-Gates (G3) greifen **nur** bei `kind` ≠ `internal_gate`.
- Gates **G1/G2/G6/G7/G8 bleiben für alle `kind` unverändert scharf** (SQL-frei, Schema-Binding zur Laufzeit, sichtbares Gating, Frameworkfreiheit, PII-Gate).

Modell (`model.py`): zwei Felder ergänzen — `kind: str = "internal_gate"`, `counterparty: dict | None = None`. Reine additive Erweiterung der Dataclass.

---

## 4 — Migrationspfad (nicht-brechend)

1. **Default = `internal_gate`.** Alle bestehenden YAMLs ohne `kind` gelten automatisch als interne Gates. Das ist der *ehrliche* Default: Die heutigen „Contracts" sind faktisch überwiegend interne Sanity-Gates ohne zugestimmte Gegenpartei.
2. **Opt-in-Promotion.** Ein Set wird erst zum Contract, wenn jemand `kind: *_contract` **und** `counterparty` setzt — ein bewusster, auditierbarer Governance-Akt (siehe §6).
3. **Keine Datenmigration im Store.** Der Result-Store bleibt schemagleich; `kind` ist Contract-Metadatum (Git = Wahrheit). Optional: `kind` in `contract_index` spiegeln für Cockpit-Filter.
4. **Rückwärtskompatibel.** Bestehende Läufe, Ergebnisse und Tests bleiben gültig; `tests/unit/test_contract_validator.py::test_shipped_contracts_validate_green` muss weiter grün sein (die zwei Beispiel-Contracts bekommen explizit ein `kind`).

---

## 5 — Compliance- & Incident-Semantik (die größte Wirkung)

Heute landet jede Verletzung in **einer** `compliance`-Ampel. Künftig nach `kind` getrennt:

| Ereignis | Heute | Künftig |
|---|---|---|
| `outbound_contract` gebrochen | Ampel rot | **Consumer-SLA-Breach** → Routing an Consumer/Governance, governance-relevante Ampel, Incident |
| `internal_gate` gerissen | Ampel rot | **Engineering-Signal** → Routing an Produkt-/Plattform-Team, **nicht** in der governance-Ampel |

Andockpunkte sind bereits vorhanden — **Erweiterung, kein Rebuild**:

- `owned_by` + Notification-Routing (`services/api/routers/notifications.py`),
- Incident-Lifecycle (`services/api/routers/incidents.py`),
- Compliance-Transition (`packages/dq_core/contract/compliance.py`) — wird `kind`-aware: nur `*_contract` setzt den governance-relevanten `compliant/breached`-Zustand; `internal_gate` erzeugt ein Team-Incident ohne Ampel-Effekt.

Coverage-Map künftig **dreispurig** statt vermischt: „durch Consumer-Versprechen gedeckt" ≠ „intern abgesichert" ≠ „ungeprüft".

---

## 6 — Promotion als Governance-Akt

Eine interne Expectation, die eine **Parteigrenze überschreitet**, wird zur Vertragsklausel *befördert* — ein auditierbares Ereignis (Konzept §2: der Contract entsteht an der Grenze). Das passt nahtlos auf den vorhandenen **Proposal-Miner** (`packages/dq_core/obs/miner.py`):

- heute: schlägt engere Erwartungen aus der History vor;
- künftig: Vorschlagstyp `internal_gate` (Team zieht intern an) **vs.** `contract_clause` (Klausel an einer Grenze, erfordert Gegenpartei + Approval).

Die „Beförderung" `internal_gate → *_contract` ist damit der explizite Moment, in dem aus interner Kontrolle ein Versprechen wird.

---

## 7 — Konsequenzen

**Positiv**

- Konzeptionelle Korrektheit: keine Kategorienverwechslung mehr (Konzept §6).
- Ehrliche Compliance-Ampel: nur boundary-gebundene Zusagen sind governance-relevant.
- Saubere Lifecycle-Politik: SemVer/Approval-Zeremonie nur dort, wo es eine Gegenpartei gibt.
- Passgenaues Alert-Routing: Engineering-Signal ≠ Consumer-SLA-Breach.
- Klare Abbildung auf den ODCS-Seam (`Zusatz_ContractLifecycle_…`): nur `*_contract` werden nach ODCS/ORD exportiert; interne Gates nicht.
- Minimaler Eingriff: additive Metadaten + Policy, Engine/Store unangetastet.

**Negativ / Risiken**

- Im Lite-Berater-Modus ist die Grenze oft unscharf → die in/internal/out-Taxonomie darf nicht zur leeren Pflichtangabe verkommen. **Gegenmittel:** Default `internal_gate`; Grenzklassifikation nur verlangen, wo ein `owners`-/Party-Wechsel real vorliegt.
- Zwei neue Begriffe im UI (Gate vs. Contract) → Onboarding-/Doku-Aufwand; Betriebsmodi-Doku muss nachgezogen werden.
- Compliance-Auswertungen, die heute pauschal über alle Sets gehen, müssen `kind`-aware werden (sonst ändert sich die Ampel-Semantik unbemerkt).

**Neutral**

- Lite/Full (Betriebsmodi) bleibt orthogonal: Lite/Full beschreibt *Prozess-Zeremonie*, `kind` beschreibt *Grenz-Klassifikation*. Ein `outbound_contract` kann im Lite- wie im Full-Modus geführt werden.

---

## 8 — Status & nächste Schritte

Diese ADR ist ein **Vorschlag**. Vor Umsetzung zu klären:

1. Begriff im UI: „Quality Gate" vs. „Internal Check" vs. „Expectation Set" — Wording festlegen.
2. Soll `kind` am Contract-File (ganzes Set) oder feingranular je Garantie liegen? (Empfehlung: Set-Ebene; feingranular nur falls ein Dataset zugleich Boundary- und Internal-Garantien trägt.)
3. ODCS-Export-Policy (`odcs_export.py`): nur `*_contract` exportieren — bestätigen.
4. Reihenfolge ggü. den offenen Workstreams (O1 Breaking-Diff, O6 HanaStore) priorisieren.

> Faustregel (Konzept §8, übertragen auf Signal): **Checks überall, Contracts nur an den zwei Grenzen. Default ist intern; ein Contract entsteht erst durch Zustimmung einer Gegenpartei.**

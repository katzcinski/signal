# Signal — Data Quality & Observability Cockpit

Verbindliche **Data Contracts** und kontinuierliche **Daten-Qualitäts-/Observability-Überwachung** für **SAP Datasphere** — von einem schlanken Lite-Einstieg bis zum governten Data Product.

Aus semantischen Garantien (Schema, Schlüssel, Freshness, Volumen, Vollständigkeit …) kompiliert Signal deterministisch ausführbare Checks, fährt sie **lesend** gegen HANA/Datasphere und macht das Ergebnis als **Status-Cockpit, Compliance-Ampel und Coverage-Map** sichtbar — für Plattform-Teams **und** Konsumenten.

> **Kein SQL in Contracts.** Garantien sind rein semantisch; der Server validiert verbindlich (Gate G1). Rohzeilen verlassen HANA nie ohne explizite Freigabe (PII-Gate).

![Signal — Architekturdiagramm](docs/assets/architektur.svg)

---

## Auf einen Blick

- **Data Contracts** als SQL-freies YAML mit Garantie-Familien → Compiler → Checks.
- **Zwei Betriebsmodi** auf einem Unterbau: **Lite** (Verbindlichkeit ohne Versions-/Approval-Zeremonie) und **Full** (SemVer, Approval, Breaking-Schutz). Siehe [`docs/Betriebsmodi_Lite_und_Full.md`](docs/Betriebsmodi_Lite_und_Full.md).
- **Cockpit** (React 18 + TS): Status-Grid, Lineage-/Coverage-Map, Contract-Workbench, Runs, Incidents, Proposals.
- **Compliance & SLA**: automatische `compliant/breached`-Transition, SLA-Fenster, Incident-Timeline.
- **Observability**: Rolling-Baselines + datengetriebene Garantie-Vorschläge (Miner).
- **Deployment-Doppelziel** aus demselben Code: Berater-lokal (SQLite, NoAuth) **und** Kunde (OIDC, HANA-Store, Multi-Worker).

---

## Schnellstart (lokal)

Voraussetzungen: Python 3.11+, Node 18+.

```bash
# Backend- + Frontend-Abhängigkeiten
make install

# Demo-Daten in den Result-Store seeden (optional)
SQLITE_DB=signal.db make seed

# Backend (FastAPI, http://127.0.0.1:8000 · API-Docs unter /api/docs)
make dev-backend

# Frontend (Vite, http://localhost:5173)
make dev-frontend
```

Im lokalen Modus läuft die API fail-closed auf `127.0.0.1` mit NoAuth (fixer Admin-Principal). Ohne konfiguriertes Environment nutzen Läufe eine `MockConnection` (`ALLOW_MOCK_CONNECTION=true`).

### Tests

```bash
make test          # python -m pytest tests/ -v
cd apps/cockpit && npx vitest run && npx tsc --noEmit
```

---

## Repository-Layout

```
packages/dq_core/      # Framework-freie Engine (pip-installierbar)
  engine/              #   Check-Ausführung, Expectation-Grammatik, Dataclasses  [ENGINE-FROZEN]
  store/               #   Result-Store (SQLite/HANA) + nummerierte Migrationen
  connect/             #   HANA-Verbindung (hdbcli) + MockConnection
  contract/            #   Modell, Validator, Compiler, Diff, Seed, ODCS-Export
  library/             #   Check-Bibliothek (sql_template-Katalog)
  lineage/             #   Lineage-/CSN-Analyse
  obs/                 #   Baselines + Proposal-Miner
services/api/          # FastAPI — Router, Auth, Settings, SSE, Git-Writer
apps/cockpit/          # Vite + React 18 + TS (strict) Frontend
cli/                   # dq_check_runner.py — Engine ohne API (Cron/Task-Chain)
contracts/             # Contract-YAMLs (Git = Wahrheit)
data/                  # inventory.json / lineage.json (Extrakt-Snapshots)
docs/                  # Konzepte, Pläne, Reviews, Betriebsmodi, Tooldokumentation
tests/                 # pytest (unit + api)
```

---

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [`docs/Tooldokumentation.md`](docs/Tooldokumentation.md) | **Vollständige Referenz**: Architektur, Datenmodell, API, Konfiguration, Security, Deployment, Entwicklung |
| [`docs/Betriebsmodi_Lite_und_Full.md`](docs/Betriebsmodi_Lite_und_Full.md) | Lite vs. Full — Prozess, Personas, Tooling |
| [`docs/Kundendeck_DataProducts_Lite.md`](docs/Kundendeck_DataProducts_Lite.md) | Präsentations-Gerüst für den Kundenpitch |
| [`docs/Konzept_DQ_Observability_Cockpit.md`](docs/Konzept_DQ_Observability_Cockpit.md) | Fachliches Gesamtkonzept |
| [`docs/ADR-0001_Quality-Gates_vs_Contracts.md`](docs/ADR-0001_Quality-Gates_vs_Contracts.md) | ADR: Trennung interner Quality Gates von Contracts (umgesetzt) |
| [`docs/ADR-0002_Editor-Modus_aus_Kind.md`](docs/ADR-0002_Editor-Modus_aus_Kind.md) | ADR: Editor-Modus (Lite/Full) aus dem Artifact-`kind` ableiten (angenommen) |
| [`docs/ADR-0003_BDC-Datasphere-DataProductStudio.md`](docs/ADR-0003_BDC-Datasphere-DataProductStudio.md) | ADR: Signal in einem BDC/Datasphere-Setup mit Data-Product-Studio-Produkten (HDLF-Spaces vs. SQL-Output-Port) |
| [`docs/ADR-0004_DataProduct-als-Komposition.md`](docs/ADR-0004_DataProduct-als-Komposition.md) | ADR: Datenprodukt als Komposition über Lineage — Manifest + abgeleitetes Interieur (Vorschlag) |
| [`docs/Vortrag_Briefing_DataProducts_DataContracts_DSP_BDC.md`](docs/Vortrag_Briefing_DataProducts_DataContracts_DSP_BDC.md) | Briefing/Übergabe für einen Vortrag zu Datenprodukten & Data Contracts in DSP/BDC |
| [`docs/Scope_OpenLineage_Emitter.md`](docs/Scope_OpenLineage_Emitter.md) | Scope: OpenLineage-Emitter (Lineage + DQ-Run-Ergebnisse als Standard-Events) + Sales-/POC-Wert |
| [`docs/Zusatz_EntropyData_Integration_und_Defensibility.md`](docs/Zusatz_EntropyData_Integration_und_Defensibility.md) | Entropy Data: Integration/Abgrenzung als Marktplatz + Defensibility (HANA-Backend-Bedrohung) |
| [`docs/Uebergabemodelle_und_Lizenz.md`](docs/Uebergabemodelle_und_Lizenz.md) | Übergabemodelle Dienstleistung vs. Softwareüberlassung (inkl. Managed-Service-Variante A1) |
| [`docs/interactive/delivery-offering.html`](docs/interactive/delivery-offering.html) | **Interaktiv**: Delivery-Offering „Data Contract & DQ Foundation für BDC" — Phasenplan, Rollen, Betriebsmodelle, Preis |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | Technischer Implementierungsplan (Workstreams, Gates) |

---

## Sicherheits-Leitplanken (Auszug)

- **G1** kein SQL im Contract · **G2** Schema erst zur Laufzeit gebunden · **G6** Gating sichtbar · **G7** `dq_core` frameworkfrei · **G8** PII-Gate.
- HANA wird **nur lesend** angesprochen; geprüfte Daten und Ergebnisse liegen getrennt.
- Auth fail-closed: Bind auf `0.0.0.0` nur mit echtem Auth-Modus.

Vollständige Liste und Mechanik: [`docs/Tooldokumentation.md`](docs/Tooldokumentation.md) · [`docs/HANDOVER.md`](docs/HANDOVER.md).

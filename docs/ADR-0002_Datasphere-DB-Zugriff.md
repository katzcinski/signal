# ADR-0002 — Datasphere-DB-Zugriff: technischer Space-User statt Database Analysis User

**Adressat:** Beratung, Plattform-Team, Governance, Security, Entwicklung · **Stand:** 2026-06-18
**Status:** *Vorschlag* (proposed) — noch nicht angenommen.
**Zweck:** Festhalten, mit **welcher Datenbank-Identität** Signal lesend gegen SAP Datasphere / HANA Cloud verbindet — und warum der **Database Analysis User** dafür ausscheidet.

> Verwandte Dokumente: `Tooldokumentation.md` (Security, Deployment) · `REVIEW_Implementierungsplan.md` (S4 — DB-User-Härtung) · `HANDOVER.md` (drei getrennte Persistenz-Orte) · `Konzept_DQ_Observability_Cockpit.md` (nur-lesend, Ergebnis-Trennung).

---

## 0 — Kernaussage

Signal ist als **least-privilege, nur-lesend, ergebnis­getrennt, PII-gegated** designt (Gates G7/G8; S4). Die Verbindungs­identität muss diese Haltung tragen. Der **Database Analysis User** von SAP Datasphere ist eine **breit berechtigte, zeitlich befristete Diagnose-/Break-Glass-Identität** — als *stehender Service-Account* für Signal ist er **technisch riskant und zweckwidrig**.

**Entscheidung:** Signal verbindet über einen **dedizierten technischen Database User je Space** (Open-SQL-/Database-Access-Schema), strikt least-privilege. Der Database Analysis User ist **nur** für kurze, beaufsichtigte DBA-Diagnose zulässig, nie als Signal-Identität.

---

## 1 — Kontext

In SAP Datasphere gibt es zwei grundverschiedene DB-Identitäten:

| | **Database User** (Space) | **Database Analysis User** |
|---|---|---|
| Anlage | im Space, „Database Access" / Open-SQL-Schema | tenant-weit, System → Configuration → Database Access |
| Zweck | Konsumieren/Lesen von Consumption-Views durch externe Tools | Troubleshooting der HANA-Cloud-DB (Performance/Monitoring), oft SAP-Support |
| Privilegien | nur das, was man grantet (z. B. SELECT auf Views) | breit: Catalog-/Monitoring-Sichten, DB-weit, über Space-Grenzen |
| Lebensdauer | dauerhaft (rotierbar) | **befristet** (Ablaufdatum verpflichtend) |
| Charakter | Integrations-/Service-Identität | **Break-Glass / Diagnose** |

Signals Verbindungs­schicht (`packages/dq_core/connect/db_connection.py`, `[SCHEMA-MAP]`) bindet das Schema **zur Laufzeit** und spricht HANA **nur lesend** an; Ergebnisse liegen getrennt im Result-Store (`dq_results_lt` bzw. lokal SQLite). Der Implementierungsplan hält bereits fest (S4):

> *„Technischer User strikt: SELECT auf Prüf-Schemata + INSERT/UPDATE nur auf `dq_results_lt`-Schema; nie ein Space-Admin."*

---

## 2 — Entscheidung

Signal nutzt einen **technischen Database User je Space** mit minimalen Grants:

- **SELECT** ausschließlich auf die Consumption-Layer-Views/Schemata, die tatsächlich unter Contract/Check stehen — **kein** DB-weiter Katalog­zugriff, **kein** Space-Admin, **keine** Monitoring-/System­privilegien über das hinaus, was ein Check braucht (der `schema`-/`column_count`-Check liest gezielt `SYS.TABLE_COLUMNS` — das ist ausreichend und legitim).
- **Schreibrechte** nur auf das Ergebnis-Schema (`dq_results_lt`), getrennt von den Quelldaten.
- **TLS erzwungen**: `encrypt=true` **+ Zertifikatsvalidierung** (S4-Pflichtpunkt — in `db_connection.py` verifizieren/nachrüsten).
- **Secrets** aus Secret-Store/Mounted File; **Rotations­zuständigkeit** benannt.
- **Pro Space getrennte User** (empfohlen) → minimiert Blast Radius, schärft Audit- und Coverage-Linie.

---

## 3 — Begründung: warum der Database Analysis User ausscheidet

| Risiko | Wirkung auf Signal |
|---|---|
| **Over-privileged → Blast Radius** | Leakt der im Secret-Store hinterlegte Analysis-User, ist die **ganze Tenant-DB** lesbar (Monitoring, ggf. alle Spaces) — nicht nur die Datasets unter Contract. |
| **Bricht Space-Isolation** | Sicht über Space-Grenzen untergräbt die **contract-scoped Coverage-Aussage** und die PII-Gate-Logik (G8): Signal könnte Daten lesen, für die kein Contract existiert. |
| **Befristung** | Läuft per Design ab → automatisierter Dauerbetrieb (Cron/Task-Chains) **bricht unvorhersehbar** weg. |
| **Audit-/Intent-Mismatch** | Routine-SELECTs unter einer Diagnose-Identität **verschmutzen das Audit** und triggern typischerweise Security-Monitoring. |
| **Governance-Smell** | Anlage erfordert erhöhte Rechte; Zweckentfremdung als Integrations-User dürfte den eigenen Security-Review nicht bestehen. |

---

## 4 — Konsequenzen

**Positiv:** Verbindungs­identität deckt sich mit G7/G8 und S4; kleiner Blast Radius; klare Audit-Linie; kein Ablauf-Risiko im Betrieb; Coverage-/PII-Aussagen bleiben technisch gedeckt.

**Kosten/Aufgaben:** Pro Space ist ein technischer User + Grants einzurichten (Onboarding-Schritt, dokumentieren). TLS-Zertifikatsvalidierung in `db_connection.py` ist zu verifizieren/nachzurüsten. Grant-Pflege bei neuen Prüf-Objekten.

---

## 5 — Ausnahme (eng gefasst)

Der Database Analysis User ist **nur** für **kurze, beaufsichtigte DBA-Diagnose** vertretbar (z. B. einmalige Lock-/Performance-Analyse) — zeitlich befristet, nachvollziehbar, **getrennt** von der Signal-Service-Identität. Er wird **nie** in Signals Secret-Store/Settings hinterlegt.

---

## 6 — Offene Punkte

- **OP-1:** TLS in `db_connection.py` — ist `encrypt=true` + Zertifikatsvalidierung gesetzt? Falls nein: nachrüsten (Pflicht, S4).
- **OP-2:** Grant-Vorlage je Space als wiederverwendbares Snippet (SELECT-Liste + `dq_results_lt`-Write) in die `Tooldokumentation.md` aufnehmen.
- **OP-3:** Rotations- und Eigentümer­zuständigkeit für die technischen User benennen.

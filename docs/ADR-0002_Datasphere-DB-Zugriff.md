# ADR-0002 — Datasphere-DB-Zugriff: technischer Space-User statt Database Analysis User

**Adressat:** Beratung, Plattform-Team, Governance, Security, Entwicklung · **Stand:** 2026-06-18 · **Revision:** 2026-07-02 (§0, §7 — Hybrid mit gebundenem Schreib-Scope)
**Status:** *Vorschlag* (proposed) — Verbindungs-Identität (§2) offen; **Provisionierungs-Modell (§7) entschieden:** Hybrid mit gebundenem Schreib-Scope über den technischen OAuth-Client.
**Zweck:** Festhalten, mit **welcher Datenbank-Identität** Signal lesend gegen SAP Datasphere / HANA Cloud verbindet — und **welchen eng begrenzten Schreib-Scope** Signal bei der Monitoring-Provisionierung ausübt. Warum der **Database Analysis User** als Lese-Identität ausscheidet, bleibt der Kern.

> **Revisionsnotiz (2026-07-02):** Die ursprüngliche §7-Fassung sah vor, dass Signal **nichts** nach Datasphere schreibt und ein externes, privilegiertes Skript **alle** Reconcile-Schritte (Share + View + `Expose` + DB-User) übernimmt. Entschieden wurde stattdessen das **Hybrid-Modell mit gebundenem Schreib-Scope**: Signal schreibt über den **technischen OAuth-Client** einen eng umrissenen Metadaten-Scope (`objects update` für das Sharing, `objects … create` für die Projektions-View), **emittiert** aber den identitäts-/credential-schaffenden `dbusers`-Schritt nur als Kommando für einen privilegierten Operator (SAP lässt `dbusers` für technische Clients nicht zu). Die Lese-Identität (§2) und die Nur-Lese-Haltung gegenüber **Quelldaten** bleiben unverändert.

> Verwandte Dokumente: `Tooldokumentation.md` (Security, Deployment) · `REVIEW_Implementierungsplan.md` (S4 — DB-User-Härtung) · `HANDOVER.md` (drei getrennte Persistenz-Orte) · `Konzept_DQ_Observability_Cockpit.md` (nur-lesend, Ergebnis-Trennung).

---

## 0 — Kernaussage

Signal ist als **least-privilege, nur-lesend gegenüber Quelldaten, ergebnis­getrennt, PII-gegated** designt (Gates G7/G8; S4). Diese Haltung wird von **zwei getrennten Identitäten** getragen, die nicht vermischt werden:

1. **Lese-Identität (Laufzeit):** ein **dedizierter technischer Database User** (Open-SQL-/Database-Access-Schema), strikt least-privilege — nur `SELECT` auf die exponierten Views unter Contract. Er liest **Daten**. Der **Database Analysis User** von SAP Datasphere scheidet dafür aus (breit berechtigt, befristet, Break-Glass — technisch riskant und zweckwidrig).
2. **Provisionierungs-Identität (Setup):** der **technische OAuth-Client** der `datasphere`-CLI/REST-API. Er schreibt **keine Daten**, sondern einen **eng gebundenen Metadaten-Scope**: das `sharing` eines Objekts (`objects update`) und die dünne Projektions-View im Monitoring-Hub (`objects … create`, `Expose for Consumption`). SAP begrenzt diesen Client-Typ von sich aus auf `objects | spaces connections | tasks | marketplace | configuration certificates` — er **kann keine DB-User anlegen, keine Grants vergeben, keine Spaces löschen**.

**Entscheidung:** Die **credential-schaffenden** Schritte (`dbusers create` → Open-SQL-Schema-User samt Passwort) bleiben **menschlich gegatet** und laufen über den **interaktiven** OAuth-Client eines privilegierten Operators — nie über die technische Automatik. Der Database Analysis User ist **nur** für kurze, beaufsichtigte DBA-Diagnose zulässig, nie als Signal-Identität.

> Blast-Radius-Logik: Leakt der Provisionierungs-Secret, ist der Schaden **Metadaten-Autorenschaft in erlaubten Spaces** — keine Credential-Erzeugung, kein Datenabfluss über den bereits gescopten Lese-User hinaus. Die beiden Identitäten zu trennen ist genau das, was diese Grenze hält.

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

> Dieser User adressiert **Berechtigung**, nicht **Reichweite**: Objekte ohne HANA-relationale Repräsentation (HDLF/Data-Lake) bleiben außerhalb — siehe §6.

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

## 6 — Scope-Grenze: HDLF / Data-Lake-Objekte

Der technische Space-User löst **Berechtigung**, nicht **Repräsentation**. Der Open-SQL-Schema-User hängt am relationalen HANA-Cloud-Tenant; **HDLF-Objekte (HANA Data Lake Files — Delta/Parquet im Object Store) haben dort keine SQL-Oberfläche** und sind per `hdbcli`-`SELECT` nicht erreichbar — unabhängig von Grants. Das ist die bereits getroffene Entscheidung **B3/E2** (HANA-only-Executor, `REVIEW_Implementierungsplan.md`) samt **O2**-Risiko (HDLF-CLI-Gap, `HANDOVER.md`).

**Wichtig:** Das ist ein **Protokoll-/Repräsentations-Gap, kein Privilegien-Gap.** Mehr Rechte (bis zum Database Analysis User) **lösen es nicht** — auch der Analysis User gibt Data-Lake-Files keine SQL-Oberfläche, sondern vergrößert nur den Blast Radius. Daher: **nicht über-privilegieren**, um diesem Symptom hinterherzulaufen.

Wege, HDLF-Objekte prüfbar zu machen (SQL-only-Modell bleibt erhalten):

1. **Als HANA-relationale View exponieren (empfohlen):** View/Remote-/Virtual-Table auf das Data-Lake-Objekt modellieren, „Expose for Consumption", dem Space-User SELECT granten — Signal prüft die View.
2. **HDL Relational Engine (HDLRE):** separater SQL-Endpoint mit eigenem scoped User → zweites Verbindungsprofil (kein Ein-Connection-Modell mehr).
3. **Reine HDL-Files (HDLFS):** kein SQL → HDLFS-CLI/REST = bewusst gemiedener Engine-Fork (B3); Fallback `LOAD_TS`/Row-Count-Snapshots (O2).

Haken: Data-Lake-/Delta-Views haben oft **keinen Lade-Zeitstempel** → `freshness`/`recent_volume` brauchen eine nutzbare Timestamp-Spalte oder den Lastmetadaten-Pfad (O2); `row_count`/`volume_delta`/`column_count` laufen auf jeder relationalen View.

---

## 7 — Monitoring-Hub-Topologie & Provisionierung (Hybrid)

Statt eines technischen Users **je Space** sammeln wir alle zu überwachenden Objekte in **einem** dedizierten Monitoring-Hub-Space; Signals Lese-User braucht dann nur SELECT auf **ein** Schema (die exponierten Views des Hubs). Die geteilte Menge **ist** der auditierbare Monitoring-Scope.

**Kanonisches Artefakt = die Wrapper-View.** Sowohl HDLF-Objekte als auch HANA-Tabellen brauchen eine View obendrauf — die View ist also der Normalfall, nicht der Sonderfall. Pro überwachtem Objekt entsteht **eine dünne Projektions-View** (`Expose for Consumption`) im Hub; Signal prüft **immer** `<HUB>.<view>`, nie das Rohobjekt. Vorteile: HDLF und Tabelle sind derselbe Pfad, ein Grant-Schema, und der Namenspräfix `<SOURCESPACE>__<OBJECT>` erlaubt die Herkunfts-Auflösung im Cockpit (autoritativ ergänzt durchs Inventar).

**View-Form:** explizite Spaltenprojektion (aus dem CSN/Inventar), kein `SELECT *` — so wird Schema-Drift sichtbar (`schema`/`column_count`). Fallback `SELECT *` nur ohne bekannte Spalten.

**Provisionierung = Hybrid mit gebundenem Schreib-Scope.** Signal übernimmt die **mechanischen Metadaten-Schritte** selbst (über den technischen OAuth-Client, headless), gatet aber den **credential-schaffenden** Schritt an einen Menschen. Aufteilung strikt entlang der SAP-Client-Fähigkeiten:

| # | Schritt | Akteur / Identität | Mechanik | Status |
|---|---|---|---|---|
| 0 | Vormerken | Cockpit (Admin) | `POST /api/admin/monitoring/provision` → Soll-Zustand (Registry) | `requested` |
| 1 | Share ins Hub | **Signal · technischer OAuth-Client** | `datasphere objects <typ> update` mit `sharing.targetSpaces:[<HUB>]` | `sharing` |
| 2 | Projektions-View | **Signal · technischer OAuth-Client** | `datasphere objects views create` — dünne Spaltenprojektion, `Expose for Consumption` an | `exposed` |
| 3 | DB-User (Credential) | **Operator · interaktiver OAuth-Client** | Signal **emittiert** `datasphere dbusers create … --output creds.json` + read-only `consumption.spaceSchemaAccess`; Operator führt aus | `awaiting_dbuser` |
| 4 | Credential-Übernahme | Operator → Signal | `POST /api/admin/monitoring/register-credentials` (Upload `creds.json`) → Environment + `secret_ref`; Upload wird geschreddert | `provisioned` |
| — | Anzeige | Cockpit | `GET /api/admin/monitoring/shares` → Status je Objekt | — |

**Warum diese Trennlinie und keine andere:** Der technische Client **darf** `objects update`/`create` (Schritte 1–2) — das ist von SAP freigegeben und rein deklaratives Metadaten-Schreiben auf dem Hub. Er **darf `dbusers` nicht** — genau der Schritt, der eine neue DB-Identität samt Passwort erzeugt, ist damit zwangsläufig menschlich gegatet (Schritt 3). Signals Laufzeit-Lese-User (§2) entsteht so **außerhalb** der Automatik; Signal sieht das Passwort nur **einmal** beim Upload und legt es als `secret_ref` ab (nie Klartext, nie in API-Antworten — S-13).

**Der Loop schließt sich:** Schritt 4 erzeugt genau die `hanadb`-Credentials, die die Lese-Identität aus §2 verbraucht. Provisionierung und Prüf-Betrieb hängen an derselben, minimal berechtigten Open-SQL-Schema-Identität.

**Kanonisches Artefakt bleibt die Wrapper-View** (oben): explizite Spaltenprojektion aus dem CSN/Inventar, kein `SELECT *`; Namenspräfix `<SOURCESPACE>__<OBJECT>`. Verwaiste Views (nicht mehr vorgemerkt) werden in einem Reconcile-Lauf über denselben technischen Client gedroppt.

**Guardrails:**
- **HDLF/File-Spaces:** `dbusers` (Schritt 3) ist für Spaces mit Storage-Typ *SAP HANA Data Lake Files* nicht unterstützt; ebenso `spaces create/delete`. Der **Hub muss ein Standard-HANA-Space** sein. HDLF-Quellobjekte werden zuerst als HANA-relationale View exponiert (§6) und dann ins Hub geteilt — der View-Pfad ist ohnehin der Normalfall.
- **Emit-only-Option:** Für Shops, die Signal jeden Datasphere-Schreibzugriff verwehren wollen, sind auch Schritte 1–2 als reines Kommando-Bundle emittierbar (Rückfall auf das alte „Skript macht alles"-Modell) — dieselbe Emit-Mechanik wie Schritt 3.
- **Konfiguration:** `DATASPHERE_MONITORING_SPACE` (Hub-Name) plus `MONITORING_PROVISION_ENABLED` (Default `false`, Opt-in) sind die einzigen neuen Pflichtwerte.

---

## 8 — Offene Punkte

- **OP-1:** TLS in `db_connection.py` — ist `encrypt=true` + Zertifikatsvalidierung gesetzt? Falls nein: nachrüsten (Pflicht, S4).
- **OP-2:** Grant-Vorlage je Space als wiederverwendbares Snippet (SELECT-Liste + `dq_results_lt`-Write) in die `Tooldokumentation.md` aufnehmen.
- **OP-3:** Rotations- und Eigentümer­zuständigkeit für die technischen User benennen.
- **OP-4:** HDLF-Objekte unter Contract — Mapping „Data-Lake-Objekt → exponierte HANA-View" je Produkt festlegen; Timestamp-/Lastmetadaten-Pfad für Freshness/Volume klären (Anschluss an O2).
- **OP-5:** Schreib-Methoden im CLI-Wrapper (`datasphere_cli.py`) nachrüsten — `objects update` (Sharing), `objects views create` (Projektions-View), plus `dbusers_create_command()` als **Emit-only** (Kommando + read-only JSON, keine Ausführung). Client-Fähigkeitsmatrix hart erzwingen: `dbusers` nur mit interaktivem Client, sonst typisierter `CliCapabilityError`. Gegen die reale Datasphere-CLI verifizieren.
- **OP-6:** Orchestrator + Endpunkte (`monitoring_provision.py`, Router `require_roles("admin")`): Schritte 1–2 ausführen, Schritt 3 emittieren, `register-credentials` (Upload → Environment + `secret_ref`, Upload schreddern). Status-Maschine in `data/monitoring_shares.json` (`requested → sharing → exposed → awaiting_dbuser → provisioned | error`).
- **OP-7:** Wrapper-View-CSN **compiler-/codegeneriert** halten (nicht in `contracts/`), damit **G1** (kein SQL in Contracts) intakt bleibt; Reconcile-Lauf für verwaiste Views definieren.
- **OP-8:** Passwort-Handhabung aus `creds.json` — Einmal-Aufnahme, `secret_ref` in `secrets.local.yml`, Temp-Datei sicher löschen; nie loggen/zurückgeben (S-13, S-1).

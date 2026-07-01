# Tool Review v3 — Gesamtreview: Toter Code · Sicherheit · Persona-Workflows

**Stand:** 2026-07-01 · **Basis:** Branch `claude/tool-review-documentation-idbtfn`, Commit `c627a4a`
**Scope:** Vollständiger Quellstand (`packages/dq_core`, `services/api`, `apps/cockpit`, `cli`, `tests`)
**Vorgänger:** `REVIEW_Tool_v1_Befunde.md`, `REVIEW_Tool_v2_Status.md`, `WORKFLOW_AUDIT_2026-06-30.md`

> Dieses Dokument beschreibt Befunde und wendet **keine** Fixes an. Es beantwortet drei Fragen:
> (A) Wo liegt toter Code? (B) Wo gibt es Sicherheitsschwachstellen? (C) Wo hält der
> dokumentierte Workflow der vier Personas der technischen Umsetzung stand — und wo nicht?

---

## 0 — Verifikationslauf (Ground Truth)

Gegenüber dem Workflow-Audit vom 30.06. hat sich der Zustand deutlich verbessert — die dort
gemeldeten 6 Backend-Failures und der ESLint-Fehler sind behoben:

| Check | Ergebnis |
|---|---|
| `python -m pytest tests/` | **579 passed, 3 skipped, 5 errors** (nur Teardown-Artefakte, s. u.) |
| `npm run typecheck` (tsc strict) | ✅ sauber |
| `npm run lint` (`--max-warnings 0`) | ✅ sauber (der `LineageMiniGraph`-Hook-Fehler aus dem 30.06.-Audit ist gefixt) |
| `npm run test -- --run` (vitest) | ✅ 42 Dateien, 194 Tests grün |

Die 5 pytest-**Errors** sind kein Produktcode-Problem: Die Win32-Simulationstests in
`tests/unit/test_datasphere_cli.py` (monkeypatchen `os.name`/Pfadauflösung) lassen auf POSIX das
Teardown von `tests/conftest.py::isolate_runtime_config` mit `NotImplementedError: cannot
instantiate 'WindowsPath'` scheitern — die Tests selbst bestehen. Befund → **T-10** (Testhygiene).
Zusätzlich benötigt der Lauf `hdbcli` (ist nicht Teil von `make install`; ohne das Paket schlagen
8 Tests in `test_db_connection.py` fehl) — Befund → **T-11**.

---

## Teil A — Toter Code

Methodik: Referenz-Suche über alle Importpfade (Backend: `services`/`packages`/`cli`/`scripts`/`tests`;
Frontend: alle Nicht-Test-Importe pro Datei), plus Abgleich mit `pytest.ini` (`testpaths = tests`).

### A.1 Backend

| # | Fundstelle | Befund | Empfehlung |
|---|---|---|---|
| **T-1** | `packages/dq_core/tests/test_basics.py` | **Tote und kaputte Testdatei.** Wird nie eingesammelt (`pytest.ini` → `testpaths = tests`) und importiert Namen, die es nicht (mehr) gibt: `ContractValidator`, `Guarantees`, `SchemaGuarantee`, `KeyGuarantee`, `ContractDiff`, `ContractCompiler`, `seed_contract`. Bei Ausführung sofortiger `ImportError`. | Löschen (die Inhalte sind in `tests/unit/` längst moderner abgedeckt). |
| **T-2** | `packages/dq_core/lineage/analyzer_loader.py` | **Null Referenzen** im gesamten Repo (weder Produktion noch Tests). | Löschen oder — falls für einen geplanten Analyzer-Plugin-Pfad gedacht — per ADR/Kommentar als bewusste Vorleistung markieren. |
| **T-3** | `packages/dq_core/contract/model.py` (`Contract`, `Guarantee` Dataclasses) | Nur vom `contract/__init__.py`-Export und der toten Testdatei (T-1) referenziert. Der gesamte Produktionspfad (Validator, Compiler, Diff, Router) arbeitet auf **dicts**, nicht auf diesen Klassen. | Entfernen inkl. `__init__`-Export, oder als API-Fassade tatsächlich verwenden. Halbtote Modellklassen laden zu divergenter Weiterentwicklung ein. |
| **T-4** | `packages/dq_core/validator/` (`core.py`: `gather_stats`, `get_key_cardinality`, `compare_snapshots`, `diff_counts`) | **Fähigkeit ohne Abnehmer.** Nur `tests/unit/test_validator.py` ruft das Modul auf; kein API-Router, keine CLI, kein Engine-Pfad nutzt es (Meridian-Port, der nie angebunden wurde). | Entweder an einen Endpoint/CLI-Befehl anbinden (Snapshot-Vergleich wäre für Shift-Left/Data-Diff v1 nutzbar, vgl. `Konzept_ShiftLeft_DataDiff_v1.md`) oder entfernen. |
| **T-5** | `packages/dq_core/store/hana_store.py` | Reiner `NotImplementedError`-Stub. **Kein toter Code im engeren Sinn** — bewusst dokumentiert (O6), `deps.py` fail-closed (`STORE_BACKEND=hana` → RuntimeError). | So belassen; Status ist in `TECH_CONCEPT_C2_HanaStore.md` nachgehalten. |

### A.2 Frontend

| # | Fundstelle | Befund | Empfehlung |
|---|---|---|---|
| **T-6** | `apps/cockpit/src/store/sseStore.ts` | **Komplett unreferenziert** (auch von keinem Test). Der SSE-Konsum läuft heute über `useRunStream`/Query-Hooks. | Löschen. |
| **T-7** | `apps/cockpit/src/components/ui/HealthGauge.tsx` | Wird nur vom eigenen Test (`tests/HealthGauge.test.tsx`) importiert, von keiner Seite/Komponente. | Löschen inkl. Test, oder wieder in eine Seite einbauen. |
| **T-8** | `apps/cockpit/src/components/ui/CoverageIcon.tsx` | Nur vom eigenen Test importiert — und **dupliziert** eine gleichnamige `CoverageIcon`-Funktion, die in `coverageIcon.ts` (kleingeschrieben) lebt und tatsächlich genutzt wird. Zwei Quellen für dieselbe Ikonographie. | `CoverageIcon.tsx` löschen; `coverageIcon.ts` bleibt die eine Quelle. |
| **T-9** | `apps/cockpit/src/api/datasphere.ts` (`useDataLoads`, `useObjectDataLoads`) | Hooks werden **nirgends** importiert. Der zugehörige Backend-Router `data_loads.py` (`GET /api/datasphere/data-loads[...]`) ist registriert und getestet, hat aber **keinen UI-Abnehmer** — das Feature „Ladeläufe je Objekt" ist für keine Persona erreichbar. | Entscheiden: UI-Anbindung nachziehen (Objekt-Detail wäre der natürliche Ort) oder Hooks + Router als YAGNI zurückbauen. Siehe auch Befund W-5. |

### A.3 Test-/Infrastruktur-Hygiene

| # | Fundstelle | Befund | Empfehlung |
|---|---|---|---|
| **T-10** | `tests/unit/test_datasphere_cli.py` (5 Win32-Tests) × `tests/conftest.py::isolate_runtime_config` | Teardown crasht auf POSIX (`WindowsPath` nicht instanziierbar), CI meldet 5 Errors bei eigentlich grünen Tests. | Im Teardown die Pfad-Monkeypatches vor `init_resolver` zurückrollen oder die Win32-Tests mit einem eigenen, POSIX-sicheren Fixture isolieren. |
| **T-11** | `Makefile` → `install` | `hdbcli` fehlt in der Installationsliste; `tests/unit/test_db_connection.py` (10 Tests) setzt es voraus. Frische Umgebung ⇒ 8 rote Tests. | `hdbcli` in `make install` aufnehmen oder die Tests mit `pytest.importorskip("hdbcli")` selbst-skippend machen. |
| **T-12** | `apps/cockpit/src/store/role.ts:72` | Toter/irreführender Kommentar: über `canManageInventory` steht der Kommentar des Proposal-Gates („Accepting a proposal writes a guarantee…"). | Kommentar korrigieren (Inventar-Administration ist admin-only, gespiegelt an `require_admin` auf `POST /api/extract`). |

---

## Teil B — Sicherheitsreview

### B.0 Was nachweislich hält (Positivbefunde)

Die im `CLAUDE.md`/HANDOVER dokumentierten Gates sind im Code real und größtenteils sauber umgesetzt:

- **G1/S2 (SQL-Freiheit + Identifier-Verteidigung):** `contract/compiler.py` ist der einzige SQL-Erzeuger; dreistufige Verteidigung (Regex `^[A-Za-z_][A-Za-z0-9_]*$` → optionale Inventar-Existenzprüfung → Quote-Escaping), Literale werden typisiert gebunden, `expr`-Fragmente sind bewusst nicht bindbar.
- **Store:** alle SQLite-Zugriffe parametrisiert; die drei f-String-Stellen (`sqlite_store.py:452/775/1467`) interpolieren ausschließlich server-seitig fest definierte Spaltennamen/Filterklauseln, nie Nutzereingaben.
- **AuthZ auf Schreibpfaden:** Contracts (PUT/seed/promote/approve/deprecate/compile/certify) entscheiden per `can_write_contract_data` **gegen den Contract auf Platte** (S-2), nie gegen den Request-Body; Runs/Dry-Runs/Profiling/Schedules/Incidents verlangen steward+; Environments, Notifications, Connector, Extract sind admin-gated; `X-DQ-Role` wirkt ausschließlich in `noauth`.
- **OIDC (`auth/oidc.py`):** Signatur gegen JWKS, Issuer-/Audience-/Expiry-Prüfung, Algorithmus-Pinning (kein `none`/HS-Downgrade), Key-Rollover via `kid`-Refresh.
- **S5 fail-closed bind:** `assert_bind_policy` mit normalisierter Loopback-Prüfung (auch `::`, leere Strings, Hostnames).
- **PII-Gate (G8):** Diagnostik nur bei `diagnostics_enabled` + Allowlist; Store-Insert hinter `_allow_diagnostics`; Rohzeilen-Sicht zusätzlich steward+ (`/runs/{id}/diagnostics`); Profil-Samples hinter `allow_profile_samples` + Spalten-Allowlist.
- **Secrets (`secrets.py`):** referenzbasiert (`env:`/Datei), Werte verlassen das Modul nur an den unmittelbaren Consumer, Status-Endpoints liefern nur Booleans, `plain:`-Refs werden in Admin-Views unterdrückt.
- **SSRF-Guard (`webhook.py`):** https-only, Regex-Allowlist, Private-IP-Block, keine Redirects, Timeout; `notify.py` schickt **jedes** Routing-Ziel durch diesen Guard.
- **Fehlerdisziplin:** RFC-7807 überall, Interna nur ins Log (S-14); Git-Writer committet mit `--only` genau die Contract-Datei und macht Push-Rejects als 409 sichtbar.

### B.1 Befunde (nach Schweregrad)

#### S-1 · **HOCH** — Kein globales Auth-Enforcement: Read-Endpoints sind im OIDC-Modus anonym

Auth wird ausschließlich über die explizite `PrincipalDep`-Dependency pro Route erzwungen. Jede
Route **ohne** diese Dependency führt `get_principal` nie aus — d. h. selbst mit `AUTH_MODE=oidc`
und öffentlichem Bind sind sie **ohne Token** erreichbar. Das betrifft praktisch die gesamte
Lesefläche: `GET /api/objects[...]`, `/api/runs` (inkl. `results`, `segments`, `events`),
`/api/contracts[...]` (inkl. `sla`, `drift`, `version-diff`), `/api/incidents[...]` (inkl. RCA),
`/api/lineage[...]`, `/api/metrics/*`, `/api/coverage/*`, `/api/activity`, `/api/products[...]`,
`/api/library`, `/api/datasphere/data-loads`, `/api/stream` (SSE) — und darüber hinaus **auch die
Schreib-Endpoints des Monitoring-Routers** (S-2). Für den Lokalmodus ist das folgenlos (S5
erzwingt Loopback bei `noauth`), aber genau im Kundendeployment-Szenario (OIDC, nicht-Loopback)
liegen dann Datenqualitätsstatus, Contract-Inhalte, Incident-Historie und Lineage offen.

**Empfehlung:** Globale Dependency im `create_app()` (`dependencies=[Depends(get_principal)]`)
bzw. per Router, mit expliziter Public-Allowlist (`/api/health`, ggf. `/api/badge/{product}` als
bewusst öffentliches Badge). Das dreht das Modell von „vergessene Dependency = offen" auf
fail-closed. Die Doku-Aussage in `notifications.py` („reads are available to any authenticated
principal") beschreibt den Zielzustand — er gilt heute nur dort, wo `PrincipalDep` explizit steht.

#### S-2 · **HOCH** — Monitoring-Router: Schreiboperationen komplett ohne AuthN/AuthZ

`services/api/routers/monitoring.py` hat als einziger Router mit Schreiboperationen **weder**
`PrincipalDep` noch `require_roles`:

- `POST /api/monitoring/shares/{object_id}` — jeder kann Objekte in den Soll-Zustand des Monitoring-Hubs eintragen,
- `DELETE /api/monitoring/shares/{object_id}` — jeder kann Einträge entfernen; das Reconcile-Skript **droppt daraufhin die Projektions-View** im Hub-Space (destruktiver Downstream-Effekt),
- `PUT /api/monitoring/shares/{object_id}/status` — der Provisioning-Callback ist spoofbar (beliebiges `provisioned`/`error` inkl. frei wählbarem `error`-Text und `view`-Namen),
- `GET /api/monitoring/manifest` — liefert Spaltenlisten + generiertes Projektions-SQL aller vorgemerkten Objekte.

**Empfehlung:** `POST`/`DELETE` auf steward+ (analog Run-Trigger), `GET /manifest` und
`PUT /status` für das externe Skript über ein dediziertes Service-Token (Header-Check), Rest wie
S-1 hinter die globale Auth-Dependency.

#### S-3 · **MITTEL** — DNS-Rebinding-TOCTOU im SSRF-Guard

`webhook.py::fire_webhook` prüft die Ziel-IP via `socket.getaddrinfo` (`_is_private_host`) und
öffnet die Verbindung danach mit `urllib` — das ist eine **zweite, unabhängige DNS-Auflösung**.
Ein Angreifer-DNS mit TTL 0 kann beim ersten Lookup eine öffentliche, beim zweiten eine private
IP liefern (klassisches Rebinding). Voraussetzung ist ein Admin, der einen Angreifer-Host in die
Allowlist einträgt bzw. ein zu breites Allowlist-Pattern — Defense-in-depth-Lücke, kein direkt
erreichbarer Exploit.

**Empfehlung:** Aufgelöste IP pinnen (Verbindung zur geprüften IP mit `Host`-Header) oder nach
dem Connect die Peer-IP erneut gegen die Private-Ranges prüfen.

#### S-4 · **MITTEL** — Path-Traversal-Restrisiko in `POST /api/checks/{dataset}/revert`

`checks.py::revert_checks` baut `Path(settings.checks_dir) / dataset / "checks.yml"` **ohne**
Validierung des Pfadsegments (`contracts.py` hat dafür `_SAFE_PRODUCT`, hier fehlt das Pendant).
Ein `dataset` wie `../foo` erlaubt steward+-Rollen, git-Revert-Operationen auf beliebige
`checks.yml`-Dateien **außerhalb** von `checks/` im selben Repo auszuführen (durch das
angehängte `checks.yml` und den `relative_to(repo.working_tree_dir)`-Check auf Repo-Dateien
dieses Namens begrenzt). Gleiches Muster, kleiner: der `dry-run`-Pfad nutzt `dataset` nur als
Vergleichswert (unkritisch).

**Empfehlung:** Dieselbe Regex-Validierung wie `_validate_product` auf alle `{dataset}`-Pfadparameter.

#### S-5 · **MITTEL** — SSE-Stream und Events-Polling ungeschützt

`GET /api/stream?run_id=…` (und der Polling-Fallback `GET /api/runs/{id}/events`) sind Teil von
S-1, verdienen aber eine eigene Entscheidung: `EventSource` kann keine Authorization-Header
setzen. Wenn S-1 geschlossen wird, braucht SSE einen bewussten Mechanismus (Cookie-Session,
kurzlebiges Query-Token) statt einer stillen Ausnahme. `run_id`/`op_id` sind UUIDv4 —
Guessing-resistent, aber „Kenntnis der ID = Vollzugriff auf Progress" ist keine AuthZ.

#### S-6 · **NIEDRIG** — Notification-Channel-URLs werden beim Anlegen nicht gegen die Allowlist geprüft

`notifications.py::_validate_url` prüft nur `https` + Hostname. Die Allowlist greift erst beim
Versand (`notify.py` → `fire_webhook`, nicht-gelistete Ziele werden still verworfen). Ein Admin
kann also Channels anlegen, die nie feuern — funktional verwirrend, sicherheitlich abgefangen.

**Empfehlung:** Beim Create/Patch zusätzlich gegen `webhook_allowlist` validieren und 422 mit
Klartext-Hinweis liefern (bessere UX, ein Prüfort weniger, der „zufällig" schützt).

#### S-7 · **NIEDRIG** — CLI-Login legt das Client-Secret auf die Kommandozeile

`datasphere_cli.py::open_login_cmd` startet ein sichtbares CMD-Fenster mit
`--client-secret <wert>` in der Befehlszeile (per Design „Meridian-Operator-Flow"). Auf
Multi-User-Maschinen ist die Prozess-Kommandozeile für andere lokale Nutzer einsehbar; zudem
steht das Secret im CMD-Fenstertitel/-Verlauf. Der übrige CLI-Wrapper ist vorbildlich
(`shell=False`, Array-Form, `stdin=DEVNULL`, Secrets nie geloggt).

**Empfehlung:** Secret über die `--secrets-file`-Route oder Env-Variable an den Login-Prozess geben.

#### S-8 · **INFO** — Stilles Verschlucken von Fehlern an Konsistenz-kritischen Stellen

- `contracts.py::_update_index` fängt `except Exception: pass` — ein dauerhaft kaputter
  `contract_index` (z. B. Schema-Drift der SQLite-Datei) bliebe unsichtbar; die Liste `/api/contracts`
  würde leer/veraltet, während Einzelabrufe funktionieren.
- `incidents.py`/`objects.py`: Notification-Fehler sind bewusst best-effort (ok), aber ohne
  jedes Log-Statement im `except` — mindestens `logger.warning` wäre angemessen.
- Legacy-Unterstützung für **inline `password`** in `environments.yml` (Klartext auf Platte)
  besteht fort; `_public_view` maskiert sie korrekt, aber der Schreibpfad `_entry_from_input`
  räumt sie nur bei neuer `password_ref` auf. Ein Deprecation-Log beim Laden würde die Migration treiben.

### B.2 Bewertungskontext

Die beiden HOCH-Befunde teilen eine Ursache: Das Projekt erzwingt AuthN **opt-in pro Route**
statt **opt-out global**. Alle dokumentierten Einzel-Gates (S-2, S-6, G8, …) sind da und halten —
was fehlt, ist der äußere Zaun für den OIDC-Betriebsfall. Solange Signal ausschließlich im
dokumentierten Lokalmodus (`noauth` + Loopback) läuft, ist keiner der beiden Befunde exponiert.

---

## Teil C — Persona-Workflows vs. technische Umsetzung

Referenz: `Betriebsmodi_Lite_und_Full.md` (Personas §1, Lite L1–L6, Full F1–F9),
`Konzept_DQ_Cockpit_UIUX.md` (Rollenmodell), Code: `auth/provider.py`, Router-Guards,
`apps/cockpit/src/store/role.ts`, `Sidebar.tsx`.

### C.1 Was deckungsgleich ist (und gut umgesetzt)

- **Server-autoritatives Rollenmodell, FE als Spiegel.** `role.ts` dokumentiert explizit
  „a disabled button is a hint, not a gate"; jede FE-Berechtigungsfunktion verweist auf den
  serverseitigen Guard, den sie spiegelt. Der `X-DQ-Role`-Header wirkt nur im noauth-Dev-Modus.
  Das ist genau das dokumentierte Modell und konsistent implementiert.
- **Rollenbasierte Navigation & Landing (UX-N3).** Steward/Owner landen auf `/my` (MyWork),
  Viewer/Admin auf `/`; Admin bekommt Inventar-Admin + Settings, Viewer sieht keine
  Schedules-Navigation. Deckt die „drei Sitzpositionen" aus dem UI/UX-Konzept ab.
- **Lite-Flow L2–L6** stimmt Schritt für Schritt: Seed (`POST …/seed`, Schreibrecht + Draft-Schutz),
  Lite-Zertifizierung (`POST …/certify` mit G1, Zero-Checks-Ablehnung und G3-Sicherheitsnetz für
  bereits zertifizierte Produkte — exakt wie in §3 dokumentiert), Run-Trigger steward+ mit
  fail-closed Environment-Auflösung (S-13), Compliance-Ampel ab erstem Run, Viewer-Lesefläche.
- **Full-Flow F1–F9** stimmt: PUT erzwingt immer Draft (Amendment-Semantik), Diff/version-diff
  liefern die G3-Vorschau, Approve validiert G3 **serverseitig blockierend** und erzeugt genau
  einen Commit mit Principal als Author (Push-Reject → 409 mit Rebase-Hinweis, Commit-Fehler →
  sichtbarer 502 statt stillem Erfolg), Compile nur auf `active`, Dry-Run persistiert nichts,
  Deprecate/Revert vorhanden und rollen-gated.
- **Ownership-Matrix** (`Rolle × owned_by × owners` inkl. `grp:`-Gruppen fail-closed) ist im Code
  (`Principal.can_write_contract`) identisch zur Doku-Tabelle §1.1.

### C.2 Abweichungen (Workflow-Befunde)

| # | Persona/Schritt | Doku sagt | Code macht | Bewertung |
|---|---|---|---|---|
| **W-1** | Lite **L1** „Inventar/Lineage extrahieren" | Persona: **Plattform-`steward`** (`Betriebsmodi` §3, Tabelle L1) | `POST /api/extract` verlangt **admin** (`extract.py:228`, `require_admin`); auch der `can_trigger`-Spiegel im Status ist admin-basiert | Der dokumentierte Lite-Einstieg funktioniert für die Steward-Persona nicht — sie braucht für Schritt 1 einen Admin. Entweder Gate auf steward+ senken (Extract ist read-only gegenüber Datasphere) oder die Doku/Persona-Tabelle korrigieren. |
| **W-2** | Steward „Monitoring anfordern" (Workflow-Audit-Map) | Steward-Fläche | Serverseitig **gar keine** Rolle (siehe S-2) — im strengen Rollenmodell die einzige völlig ungeschützte Schreibfläche | Inkonsistent zum sonst strikten Modell; zusammen mit S-2 beheben. |
| **W-3** | Owner/Steward „Proposal-Inbox" (Full-Zusatzwerkzeug) | Accept/Reject/Snooze als tägliche Arbeitsfläche | **Alt-Befund P1 aus dem Workflow-Audit 30.06. besteht fort:** `miner.py:89` vergibt bei jedem Mining-Durchlauf frische `uuid4()`-IDs; `_find_proposal` re-mined beim Accept/Reject. Ändert sich zwischen Listing und Klick die Basis (neuer Run, Baseline-Update), läuft die Aktion auf 404 | Kern-Workflow der Steward-/Owner-Persona bleibt fragil. Deterministische Proposal-IDs (Hash aus `product×check×proposed_expect`) wären die minimale Korrektur. |
| **W-4** | Konsument/Viewer: „liest Compliance-Ampel/SLA" | Viewer sieht Status, Coverage, SLA | Stimmt — aber der **Schedule-Status** eines Objekts (governed by internal/external schedule, `last_run`-Intent laut `schedules.py`-Docstring „the cockpit still shows…") ist auch **lesend** steward+ (`GET /api/schedules`, `GET /api/objects/{id}/schedule` → `_require_steward`) | Viewer können nicht sehen, ob ein Objekt automatisiert überwacht wird — für die Konsumenten-Frage „wird das hier regelmäßig geprüft?" relevant. Lese-Zugriff für Viewer erwägen. |
| **W-5** | Steward „Ladeläufe beobachten" (Runs & Freshness-Konzept) | Data-Load-Sichtbarkeit je Objekt | Backend-Endpoint existiert (`/api/datasphere/data-loads`), **kein UI-Abnehmer** (T-9) | Persona-Funktion ist implementiert, aber nicht erreichbar — Feature-Torso. |
| **W-6** | Rollen-Doku §1.1: `steward` Full-Approve „✅ bei `platform`" | — | Stimmt exakt (`can_write_contract`), aber die Doku-Tabelle erwähnt nicht, dass **Reindex** (`POST /api/contracts/reindex`), **Dry-Run**, **Revert**, **Connection-Test**, **Profiling** ebenfalls steward+ sind — die faktische Steward-Fläche ist größer als §1.1 suggeriert | Doku-Lücke, kein Code-Problem. Tabelle §1.1 um die operativen Rechte ergänzen. |

### C.3 Gesamtbild Workflows

Das dreistufige Persona-Versprechen (Viewer liest → Steward/Plattform operiert → Owner governt →
Admin konfiguriert) ist im Backend über konsistente Guards und im Frontend über Nav/Landing/
Affordance-Spiegel weitgehend sauber realisiert. Die Lücken liegen an den **Rändern des
Lite-Flows** (W-1: Einstieg braucht Admin; W-2: Monitoring ungeschützt) und in **einem fragilen
Kernwerkzeug** (W-3 Proposals). Der Lite→Full-Übergang (Ownership-Shift `platform → product`,
Editor-Default aus `kind`, G3-Schutz ab Zertifizierung) ist wie in ADR-0001/0002 beschrieben
implementiert und serverseitig durchgesetzt.

---

## Teil D — Priorisierte Maßnahmen

| Prio | Befund | Maßnahme | Aufwand (grob) |
|---|---|---|---|
| 1 | S-1 | Globale Auth-Dependency + Public-Allowlist (`/api/health`, Badge) | S — zentral in `create_app()` + Testanpassungen |
| 2 | S-2 / W-2 | Monitoring-Writes steward+, Skript-Endpoints per Service-Token | S |
| 3 | W-3 | Deterministische Proposal-IDs im Miner | S |
| 4 | S-4 | `{dataset}`-Pfadparameter validieren (Regex wie `_SAFE_PRODUCT`) | XS |
| 5 | W-1 | Extract-Gate vs. Doku angleichen (Empfehlung: steward+) | XS |
| 6 | T-1, T-2, T-6, T-7, T-8 | Toten Code löschen (eine Aufräum-PR) | XS |
| 7 | T-9 / W-5 | Entscheid Data-Loads: UI anbinden oder zurückbauen | M (bei Anbindung) |
| 8 | S-3 | IP-Pinning im Webhook-Guard | S |
| 9 | T-10, T-11 | Testhygiene (Win32-Teardown, `hdbcli` in `make install`) | XS |
| 10 | S-5, S-6, S-7, S-8, T-3, T-4, T-12, W-4, W-6 | Sammelposten: SSE-Auth-Konzept, Channel-Allowlist-Validierung beim Anlegen, CLI-Secret von der Kommandozeile, Logging in Best-Effort-Excepts, Modell-/Validator-Entscheid, Doku-Korrekturen | S–M |

---

## Anhang — Abgleich mit den Vorgänger-Reviews

- **v1-Kritikpunkte** (JWT-Validierung, Body-basierte AuthZ, SSRF, PII): alle als behoben
  re-verifiziert (deckt sich mit `REVIEW_Tool_v2_Status.md`); dieses Review fand **keine**
  Regression an diesen Stellen.
- **Workflow-Audit 30.06.:** Die dort roten Checks (6 BE-Tests, ESLint) sind grün. **Offen
  geblieben:** P1 Proposal-IDs (hier W-3). Die OpenAPI-Drift (G4) ist weiterhin advisory.
- **Neu in v3:** das fehlende globale Auth-Enforcement (S-1), der ungeschützte
  Monitoring-Router (S-2), das Traversal-Restrisiko im Revert (S-4) sowie die konsolidierte
  Tote-Code-Liste (T-1…T-9).

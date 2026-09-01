# Konzept — MVP-Pilot & Deployment (DQ-only) beim Kunden

**Stand:** 2026-09-01 · **Status:** Konzept / Entscheidungsgrundlage
**Zweck:** Wie Signal in einem **ersten Piloten** beim Kunden platziert wird — mit
bewusst reduziertem Funktionsumfang (**DQ-only**, ohne Contract-Governance/
Compliance) und einem tragfähigen **Übergabeweg** (Container in der Kundenzone).
**Adressat:** Beratung (Delivery + Vertrieb), Plattform-Team des Kunden.

> Baut auf und verweist auf: [`Betriebsmodi_Lite_und_Full.md`](Betriebsmodi_Lite_und_Full.md)
> (Lite = Verbindlichkeit ohne Zeremonie) · [`Uebergabemodelle_und_Lizenz.md`](Uebergabemodelle_und_Lizenz.md)
> (Modelle A/B/C, A1) · [`Konzept_Managed_Service_Provisioning.md`](Konzept_Managed_Service_Provisioning.md)
> (Instanz-pro-Tenant, Persistenz, Security) · [`Tooldokumentation.md`](Tooldokumentation.md)
> §6/§10 (Konfiguration, Deployment-Profile).

---

## 0 — Kernaussagen (Management Summary)

1. **Scope MVP = DQ-only.** Nur der Datenqualitäts-Kern (Checks fahren, Status/Trend
   sehen, Alarm bei Fehler). **Ohne** Contract-Governance, Compliance-Ampel,
   Versionierung/Approval, Data Products, Proposals, Enforcement/Quarantäne/Healing.
2. **„Ohne Contracts" heißt ohne Contract-*Zeremonie*, nicht ohne YAML.** Checks
   entstehen weiterhin aus SQL-freien YAML-Artefakten (`internal_gate`, Git =
   Wahrheit), die der Compiler zu Checks übersetzt. Im MVP heißen sie **„Check-Set"**
   statt „Contract"; Versionierung/Approval/Compliance sind ausgeblendet. Es wird
   **kein zweiter Authoring-Pfad gebaut.**
3. **Datenquelle: HANA/Datasphere-only** — ohnehin der einzige implementierte
   Executor (read-only, `hdbcli`). Multi-Plattform ist Konzept, nicht Code.
4. **Result-Store: SQLite auf Volume** — der voll ausgebaute, erprobte Pfad. Der
   HANA-Result-Store (`HanaStore`) ist **teil-implementiert/Stub** (pending O6) und
   **nicht** MVP-Weg. Ausbaustufe mit klarem Auslöser (§7.1).
5. **Übergabeweg: Container in der Kundenzone** (Docker/Compose), Kunde betreibt
   technisch. HANA-Zugriff bleibt kundenintern → schnellste Security-Freigabe,
   Datenresidenz automatisch erfüllt. VM/OVA als Fallback (§5).
6. **Externes/Managed-Hosting (A1) ist Stufe 2**, nicht der Pilot — es maximiert die
   Security-/Datenschutz-/Vertragsdiskussion genau dann, wenn schnell Wert gezeigt
   werden soll (§7.2, Risiko-Checkliste).

**Zu bauender Rest ist klein** (§8): Container-Artefakte (existieren noch nicht) +
eine DQ-only-Navigationsvariante im Frontend. Kein Engine-Umbau, **kein**
HanaStore-Fertigbau nötig.

---

## 1 — MVP-Scope: was rein, was raus

Signal ist ein Code mit vielen Fähigkeiten. Der MVP schaltet fachlich auf den
DQ-Kern zurück — technisch bleibt alles im selben Build, es wird nur **weniger
sichtbar gemacht**.

### 1.1 Funktions-Matrix

| Bereich | Route(n) | MVP | Begründung |
|---|---|---|---|
| **Status-Cockpit** (Grid, Health-Trend, Brennpunkte) | `/` | ✅ Kern | Der DQ-Mehrwert auf einen Blick |
| **Objekt-Katalog & -Detail** (Checks, Sparkline, Run-Trigger) | `/objects`, `/objects/:id` | ✅ Kern | Wo Checks leben und ausgelöst werden |
| **Läufe** (Detail, Live-Log, Vergleich) | `/runs/:id`, `/runs/compare` | ✅ Kern | Nachvollziehbarkeit der Ergebnisse |
| **Check-Set-Editor** (= Lite-Workbench, `internal_gate`) | `/contracts` → **umbenannt „Check-Sets"** | ✅ Kern (reduziert) | Geführtes, SQL-freies Check-Authoring — **ohne** Approval/SemVer/Promotion |
| **Check-Library** (Katalog wiederverwendbarer Checks) | `/library` | ✅ Kern | Beschleunigt Authoring |
| **Environments** (HANA-Verbindungen + Test) | `/environments` | ✅ Kern | Ohne HANA-Env kein echter Lauf |
| **Scheduling** (pro-Objekt-Kadenz) | `/schedules` | ✅ Kern | Dauerbetrieb statt Einmal-Lauf |
| **Alarme** (Check-Fehler → Webhook Slack/Teams) | `/notifications` | ✅ Kern | Push statt Hinsehen; im MVP „Check-Fehler", nicht „Breach" |
| **Settings/Admin** | `/settings` | ✅ Kern | Betrieb |
| Schema-Drift | `/schema-drift` | ◑ optional | DQ-nah, aber nicht Kern; kann Phase 2 des Piloten |
| Lineage/Coverage-Map | `/lineage`, `/coverage` | ◑ optional | Nur sinnvoll mit Lineage-Extrakt; „Coverage" = hat Objekt ein Check-Set |
| Rollen-Landing „Meine Arbeit" | `/my` | ◑ optional | Vereinfachen oder ausblenden |
| **Contract-Governance** (Compile-Zeremonie, Breaking-Diff, Approval, Promotion) | Teile von `/contracts` | ❌ aus | Genau das, was der Kunde im MVP *nicht* will |
| **Compliance-Ampel / SLA / Governance** | `/compliance` | ❌ aus | Contract-Konzept |
| **Data Products** | `/products` | ❌ aus | Governance-Aufbaustufe (ADR-0004) |
| **Proposals** (Miner-Vorschläge) | `/proposals` | ❌ aus (Phase 2) | Nett, aber nicht MVP |
| **Incidents** | `/incidents` | ❌ aus / ersetzt | Fehler-Historie zeigen Runs + Objekt-Detail |
| **Quarantäne / Healing / Enforcement** | `/quarantine`, `/healing`, `/enforcement` | ❌ aus | Fortgeschrittene Enforcement-Kette |

### 1.2 Der ehrliche Punkt zu „ohne Contracts"

Checks **müssen** definiert werden — heute geschieht das ausschließlich über den
Compiler-Pfad: ein SQL-freies YAML (`guarantees:`) → `dq_core.contract.compiler` →
`checks/<name>/checks.yml`. Es gibt **keinen** parallelen Check-Authoring-Weg im
Cockpit.

Die saubere MVP-Lösung nutzt das vorhandene **`internal_gate` + Lite** (siehe
`Betriebsmodi_Lite_und_Full.md` §3): geführte Checkliste (Garantie an/aus + eine
Severity je Familie), Ein-Klick „Speichern & aktivieren", **keine** SemVer-/
Approval-/Compliance-Mechanik. Fachlich ist ein `internal_gate` bereits definiert als
„Quality Gate ohne Gegenpartei — Fehler = Engineering-Signal, keine Governance-Ampel"
(Tooldokumentation §12).

> **Konsequenz:** „Ohne Contracts" = wir **verstecken** die Governance-Schicht und
> **benennen** das Artefakt im UI als „Check-Set". Das YAML bleibt bestehen (Git =
> Wahrheit) — das ist Feature, nicht Kompromiss: Der Kunde bekommt versionierbare,
> reviewbare, SQL-freie Check-Definitionen, ohne die Zeremonie sehen zu müssen. Ein
> späterer Wechsel in den Full-Modus ist dann **kein Rebuild**, nur mehr Zeremonie
> (`Betriebsmodi` §5).

Gates bleiben in **beiden** Fällen scharf: G1 (kein SQL im Artefakt), G2
(Schema-Bind zur Laufzeit), G6 (Gating sichtbar), G7 (Engine frameworkfrei), G8
(PII-Gate). Der MVP schwächt **keine** Sicherheits-Invariante ab.

---

## 2 — Zielarchitektur des Piloten (Kundenzone)

```
   ┌──────────────────────── KUNDEN-NETZ (Kundenzone) ─────────────────────────┐
   │                                                                            │
   │   Nutzer (Browser)                                                         │
   │        │  HTTPS                                                            │
   │        ▼                                                                    │
   │  ┌───────────────┐        ┌────────────────────────────┐    ┌───────────┐ │
   │  │  web           │  /api  │  api + engine (uvicorn)    │    │  Volume   │ │
   │  │  nginx/Caddy   │───────▶│  services.api.main:app     │───▶│ signal.db │ │
   │  │  · TLS         │        │  · store=sqlite            │    │ (SQLite)  │ │
   │  │  · statisches  │        │  · auth=oidc | proxy       │    │ contracts/│ │
   │  │    Vite-Bundle │        │  · interner Poller (opt)   │    │ checks/   │ │
   │  └───────────────┘        │  · allow_mock=false        │    │ data/     │ │
   │                            └──────────────┬─────────────┘    └───────────┘ │
   │                                           │ hdbcli (read-only, G8 PII-Gate)│
   │                                           ▼                                 │
   │                            ┌────────────────────────────┐                  │
   │                            │  Produktive HANA/Datasphere │  (Kunden-Eigen-  │
   │                            │  NUR LESEND · Space-User     │   tum, nie durch │
   │                            └────────────────────────────┘   Signal beschr.)│
   │                                                                            │
   │  Git-Repo (contracts/, checks/) — Eigentum Kunde ····· ggf. Cron statt Poller│
   └────────────────────────────────────────────────────────────────────────────┘
       Egress nur: OIDC-IdP (falls extern) · optional Breach-Webhook (Allowlist)
```

**Warum Kundenzone:** HANA-Zugriff bleibt komplett kundenintern (kein
Security-Veto von außen), die SQLite-Datei liegt auf einem Volume **im Kunden-Netz**
(Datenresidenz automatisch erfüllt), Egress ist minimal. Das ist der schnellste
freigabefähige Aufbau.

**Persistenz — drei getrennte Orte** (wie `Konzept_Managed_Service_Provisioning.md`
§4, hier alle in der Kundenzone):

| Ort | Inhalt | MVP-Backing |
|---|---|---|
| Git | `contracts/*.yaml` (Check-Sets), `checks/*/checks.yml` | Kunden-Repo oder lokales Volume |
| Result-Store | Läufe, Check-Ergebnisse, Baselines | **SQLite** auf persistentem Volume |
| Kunden-HANA | die geprüften Produktivdaten | **nur lesend** (`hdbcli`), nie Eigentum von Signal |

Der Result-Store hält wegen G8 **nur Aggregat-Metriken + Verdikte**, keine Rohzeilen
(Diagnostics nur mit explizitem Opt-in + Spalten-Allowlist + TTL).

---

## 3 — Konfigurationsprofil „Pilot / Kunde"

Der Umschalter Lokal→Kunde ist **reine Konfiguration** (`services/api/settings.py`),
kein Code-Zweig. Für den Piloten:

| Setting | Wert Pilot | Warum |
|---|---|---|
| `STORE_BACKEND` | `sqlite` | erprobt; HanaStore ist Stub (§7.1) |
| `SQLITE_DB` | `/data/signal.db` | auf persistentem Volume |
| `AUTH_MODE` | `oidc` (empfohlen) / `noauth`+Proxy (Fallback) | S5 (§6) |
| `BIND_HOST` | `0.0.0.0` bei OIDC · `127.0.0.1` bei Proxy-im-Container | S5 fail-closed (`main.py:assert_bind_policy`) |
| `ALLOW_MOCK_CONNECTION` | **`false`** | kein stiller Fail-Open ohne HANA (S-13) |
| `ENVIRONMENTS_FILE` | `environments.yml` (mit `secret_ref`) | HANA-Verbindung, Secret als Referenz |
| `SCHEDULER_ENABLED` | `true` (Pilot-Vereinfachung) | interner Poller statt separatem Cron-Container (ADR-0005) |
| `CORS_ORIGINS` | Pilot-Host | nur das echte Frontend |
| `WEBHOOK_URL` / `WEBHOOK_ALLOWLIST` | optional | Check-Fehler-Alarm, SSRF-Allowlist (S6) |
| `ALLOW_LOCAL_DIAGNOSTICS` | `false` (Default) | PII-Gate scharf; nur bei Bedarf + Allowlist opt-in |

`environments.yml` bindet das `{schema}` zur Laufzeit (G2) — die Check-Sets bleiben
environment-frei und damit portabel.

---

## 4 — Übergabeweg: Docker vs. VM

### 4.1 Bewertung

| Kriterium | Docker/Compose | VM / OVA-Appliance |
|---|---|---|
| Aufsetzgeschwindigkeit | hoch (ein `compose up`) | mittel (Image bauen/importieren) |
| Reproduzierbarkeit | hoch (deklarativ) | mittel |
| Kunden-Voraussetzung | Container-Runtime erlaubt | Hypervisor / VM-Slot |
| Update-Pfad | Image-Tag tauschen | Patch in der VM |
| `hdbcli`-Beschaffung (§4.3) | Build-Arg/Volume beim Kunden | in der VM installieren |
| Isolation | Container-Namespace | vollständige VM |

**Empfehlung:** **Docker/Compose als Standard.** Es passt exakt zum bestehenden
Deployment-Bild (Tooldokumentation §10: „ein Code, zwei Profile", API+Engine als
uvicorn, Frontend als statisches Bundle). **VM/OVA nur als Fallback**, wenn die
Kunden-Policy keine Container-Runtime erlaubt — dann dieselben Prozesse in einer VM
(systemd-Units statt Compose-Services).

### 4.2 Einordnung ins Übergabemodell (rechtlich/kommerziell)

Ein Container-Bundle, das der Kunde **autonom** betreibt, ist laut
`Uebergabemodelle_und_Lizenz.md` **Modell B** (Graubereich) bis **C**
(Softwareüberlassung) — nicht mehr reine Dienstleistung. Für einen **zeitlich
befristeten Piloten** ist das beherrschbar, wenn er als **Dienstleistung mit
Pilot-/Evaluierungsvereinbarung** eingekleidet wird:

- klar befristet, kein Dauer-Nutzungsrecht,
- „as-is / keine Eignungszusage" + Haftungs-Cap (die grüne Ampel ist kein Freibrief),
- `hdbcli` **nicht** im Bundle (§4.3),
- Support/Wartung im Pilot explizit geregelt (bezahlt zugesagt **oder**
  ausgeschlossen).

Die §4-Checkliste des Übergabe-Dokuments ist **vor** der Übergabe zu paperen. Wer die
Softwareüberlassungs-Schwelle im Pilot vermeiden will, wählt stattdessen den
**Cockpit-gehostet/Runner-in-Kundenzone**-Zwischenweg (§7.2).

### 4.3 Der `hdbcli`-Stolperstein (wichtig)

`hdbcli` ist der **proprietäre SAP-HANA-Client** und darf **nicht redistribuiert**
werden (Übergabe-Doku §4.2). Deshalb:

- **Nicht** in ein von uns verteiltes Image backen.
- Sauber: Der Kunde (als Datasphere-Kunde SAP-lizenziert) stellt das `hdbcli`-Wheel
  bereit; das Image wird **in der Kunden-Registry** gebaut und zieht den Treiber dort
  aus der Kunden-Quelle (Build-Arg/lokaler Wheel-Pfad).
- Ohne `hdbcli` läuft nur die `MockConnection` — für den Piloten mit echter HANA also
  Pflicht, aber über den Kunden-Kanal.

---

## 5 — Deployment-Vorlagen (Konzept-Skeleton)

> Diese Vorlagen sind **Teil des Konzepts**, nicht committete Build-Artefakte. Sie
> werden im Umsetzungsschritt (§8) ins Repo gelegt und getestet.

### 5.1 `Dockerfile` (API + Engine)

```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app

# System-Deps minimal halten (hdbcli braucht keine Compiler)
RUN pip install --no-cache-dir --upgrade pip

# App-Requirements OHNE hdbcli (proprietär, §4.3)
COPY services/api/requirements.txt /app/req-api.txt
COPY packages/dq_core/pyproject.toml /app/dq_core-pyproject.toml
RUN pip install --no-cache-dir -r /app/req-api.txt

# hdbcli wird beim Kunden aus SEINER Quelle installiert (nicht im Basis-Layer):
#   docker build --build-arg HDBCLI_WHL=hdbcli-<ver>.whl ...
ARG HDBCLI_WHL=""
COPY ${HDBCLI_WHL:-/dev/null} /tmp/hdbcli.whl
RUN if [ -s /tmp/hdbcli.whl ]; then pip install --no-cache-dir /tmp/hdbcli.whl; fi

COPY packages/ /app/packages/
COPY services/ /app/services/
COPY cli/       /app/cli/

ENV PYTHONPATH=/app:/app/packages
EXPOSE 8000
# Bind/Worker kommen aus der Compose-Umgebung; ≥2 Worker sind multi-worker-safe (F2)
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 5.2 `docker-compose.yml` (OIDC-Variante, getrennte Container)

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        HDBCLI_WHL: ${HDBCLI_WHL}      # Kunde stellt Pfad bereit
    env_file: [ .env ]                  # Profil „Kunde" (§3)
    environment:
      BIND_HOST: 0.0.0.0                # zulässig, weil AUTH_MODE=oidc (S5)
    volumes:
      - signal-data:/data               # SQLite-Store + Extrakte, persistent
      - ./contracts:/app/contracts
      - ./checks:/app/checks
    restart: unless-stopped

  web:
    image: nginx:1.27-alpine
    volumes:
      - ./apps/cockpit/dist:/usr/share/nginx/html:ro
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports: [ "443:443" ]                # TLS terminiert hier
    depends_on: [ api ]
    restart: unless-stopped

volumes:
  signal-data:
```

### 5.3 `nginx.conf` (statisches Bundle + Reverse-Proxy)

```nginx
server {
  listen 443 ssl;
  ssl_certificate     /etc/nginx/tls/fullchain.pem;
  ssl_certificate_key /etc/nginx/tls/privkey.pem;

  root /usr/share/nginx/html;
  location / { try_files $uri /index.html; }     # SPA-Routing
  location /api/ {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;  # OIDC-Bearer durchreichen
  }
}
```

### 5.4 `.env`-Vorlage (Profil Kunde)

```dotenv
STORE_BACKEND=sqlite
SQLITE_DB=/data/signal.db
AUTH_MODE=oidc
OIDC_ISSUER=https://<kunden-idp>/
OIDC_AUDIENCE=<client-id>
OIDC_ROLE_CLAIM=roles
OIDC_ROLE_MAPPING={"dq-admin":"admin","dq-steward":"steward","dq-viewer":"viewer"}
ALLOW_MOCK_CONNECTION=false
ENVIRONMENTS_FILE=/data/environments.yml
SECRETS_FILE=/data/secrets.local.yml
SCHEDULER_ENABLED=true
CORS_ORIGINS=["https://<pilot-host>"]
# WEBHOOK_URL / WEBHOOK_ALLOWLIST optional für Check-Fehler-Alarm
```

### 5.5 Fallback ohne IdP: noauth hinter Proxy

Wenn die IdP-Anbindung den Piloten verzögert, ist ein Reverse-Proxy mit
TLS + HTTP-Basic/mTLS ein Zwischenschritt. **Wegen S5 muss die API dann auf
`127.0.0.1` gebunden bleiben** — d. h. `api` und Proxy im **selben** Container
(z. B. Caddy + uvicorn via supervisor), Proxy → `127.0.0.1:8000`. In getrennten
Containern lauscht die API auf der Container-IP → `noauth` würde beim Start
fail-closed abbrechen (`assert_bind_policy`). Das ist Absicht, kein Bug.

---

## 6 — Security & Konnektivität

- **Auth (S5 fail-closed):** `noauth` bindet nur auf Loopback. Für einen extern
  erreichbaren Pilot ⇒ entweder **OIDC** (bind `0.0.0.0` erlaubt) oder Proxy +
  loopback-gebundene API im selben Container (§5.5). Datasphere-Kunden haben i. d. R.
  einen IdP (BTP/XSUAA oder Azure AD) — OIDC ist der saubere Weg.
- **HANA read-only:** ausschließlich lesend über `hdbcli`; Schreiben nur ins
  Signal-eigene Schema und nur in Ausbaustufen (ADR-0002-Amendment) — im DQ-only-MVP
  gar nicht.
- **PII-Gate (G8):** ohne `ALLOW_LOCAL_DIAGNOSTICS` verlässt keine Rohzeile die HANA;
  Ergebnisse sind Aggregat-Metriken. Starkes Argument gegenüber der Kunden-Security.
- **Kein Fail-Open:** `ALLOW_MOCK_CONNECTION=false` erzwingt echte HANA-Verbindung je
  Lauf (S-13).
- **Egress minimal:** nur IdP (falls extern) und optionaler Breach-Webhook
  (https-only, Host-Allowlist, Private-IP-Block, keine Redirects — S6).

---

## 7 — Ausbaustufen (nach erfolgreichem Pilot)

### 7.1 HANA-Result-Store (Auslöser-gebunden)

Heute ist `packages/dq_core/store/hana_store.py` **teil-implementiert**: der
Kern-Round-Trip ist per `make hana-smoke` gegen einen echten Tenant testbar, aber
Teile sind getrackte `NotImplementedError`-Stubs (pending **O6**). `sqlite_store.py`
ist voll ausgebaut.

**Auslöser für den HANA-Store (mind. einer):**

- Externes/gehostetes Betriebsmodell **und** Kunden-Governance verlangt
  Ergebnis-Residenz im eigenen Tenant, oder
- Full-Regelbetrieb mit ≥2 Workern und mehreren Tenants auf einer Plattform.

Solange der Pilot in der Kundenzone läuft, ist keiner der Auslöser gegeben — SQLite
bleibt korrekt. Vor Aktivierung: O6 abschließen (Stub-Methoden portieren) +
`hana-smoke` grün gegen den Ziel-Tenant.

### 7.2 Externes/Managed-Hosting (A1) — Stufe 2, nicht Pilot

Attraktiv für Regelbetrieb (wiederkehrendes Entgelt, bleibt Dienstleistung), aber mit
realen Risiken **für uns**, die vor dem Hosting geregelt sein müssen:

| Gefahr | Kern | Gegenmittel |
|---|---|---|
| **Security-Veto HANA-Zugriff** | externes Signal muss produktive Kunden-HANA lesen | VPN/Private Link — oder **Hybrid-Executor** (`cli/dq_check_runner.py` in Kundenzone, nur Ergebnisse zu uns) |
| Credentials zu Produktivdaten bei uns | Angriffs-/Haftungsfläche | Secret-Mgmt, Hybrid vermeidet es |
| Betreiberpflichten (laufend) | Verfügbarkeit, Patches, Backups, IdP | Managed-Entgelt + definierter Support |
| Datenschutz-Rolle | typ. Auftragsverarbeitung → **AVV/DPA (Art. 28)**, TOMs, Sub-Prozessoren *(kein Rechtsrat)* | EU-Hosting, Residenz klären, ggf. Store per Hybrid in Kundenzone |
| Multi-Tenant-Leak | Signal ist Single-Tenant-pro-Instanz (kein `tenant_id`) | Isolation strikt infrastrukturell: getrennte Container/Stores/OIDC-Audiences |
| Reputations-/Vertrauenshaftung | Kunde vertraut grüner Ampel | Haftungs-Cap + „as-is" |

**Zwischenweg (empfohlen für Stufe 2):** **Cockpit gehostet, Runner in der
Kundenzone.** HANA-Zugriff und ggf. Store bleiben beim Kunden, wir betreiben nur die
UI — nimmt A1 die schärfsten Zähne (Security-Veto, Residenz) und bleibt sauber
Dienstleistung.

### 7.3 Full-Modus / Governance

Wenn der Fachbereich Ownership übernimmt: `internal_gate → consumer/provider_contract`
promoten, Compliance/SLA/Versionierung zuschalten. **Kein Rebuild** — nur mehr
Zeremonie und ein `owned_by`-Shift (`Betriebsmodi_Lite_und_Full.md` §5). Die im MVP
versteckten Screens werden schlicht wieder eingeblendet.

---

## 8 — Umsetzungsaufwand für den MVP (was noch zu bauen ist)

Ehrliche Trennung „ist im Code" vs. „muss gebaut werden":

| Baustein | Status | Aufwand |
|---|---|---|
| Engine, Compiler, SQLite-Store, CLI-Runner, API, Cockpit | **vorhanden** | — |
| `internal_gate` + Lite-Authoring | **vorhanden** | — |
| **Container-Artefakte** (Dockerfile, compose, nginx, .env) | **fehlt** (§5 als Vorlage) | klein–mittel |
| **DQ-only-Navigation** im Frontend (Governance-Screens ausblenden, „Contract"→„Check-Set") | **fehlt** | klein: `Sidebar.tsx` (`navForRole`, `DQ_BLOCK`/`GOVERN_BLOCK`), Routen in `App.tsx`, Strings in `i18n/de.ts` — am besten Build-Flag `VITE_MVP_DQ_ONLY` |
| `hdbcli`-Beschaffung über Kunden-Kanal | Prozess | Abstimmung Kunde |
| SQLite-Volume-Backup | Ops | klein |
| OIDC-Client beim Kunden-IdP + Claim→Rollen-Mapping | Abstimmung | klein–mittel |
| **HanaStore fertigstellen** | **nicht nötig** für MVP | — (Stufe 2) |

Kein Engine-Umbau, keine Migrationen, keine Gate-Änderung. Der MVP ist überwiegend
**Verpackung + Sichtbarkeits-Reduktion**, nicht Neubau.

---

## 9 — Pilot-Fahrplan

| Phase | Inhalt | Verantwortung |
|---|---|---|
| **P0 Vorbereitung** | Pilot-/Evaluierungsvereinbarung (befristet, as-is, Haftungs-Cap); Scope 3–5 Konsum-Objekte; Security-Freigabe für read-only Space-User; `hdbcli`-Bezug klären | Beratung + Kunde-Security |
| **P1 Bereitstellung** | Container in Kundenzone (§5), `environments.yml` mit HANA-Read-User, Auth (OIDC/Proxy), `ALLOW_MOCK_CONNECTION=false`, Smoke-Test Verbindung | Beratung (R) + Kunde-Plattform (C) |
| **P2 Onboarding** | Inventar-Extrakt; für 3–5 Objekte Check-Sets seeden + Lite-Garantien setzen (Fokus `freshness`, `not_null`, `keys`, `schema closed`); erste Läufe | Beratung (R) |
| **P3 Betrieb** | Scheduling (interner Poller); Cockpit im Alltag; Check-Fehler-Alarm; Kunde nutzt Status-Grid | Kunde (R) + Beratung (Support) |
| **P4 Auswertung** | Erfolgskriterien prüfen; Entscheidung Verstetigung/Skalierung (Stufe 2) | Beratung + Kunde |

**Erfolgskriterien (Beispiele, mit Kunde schärfen):** ≥3 Objekte unter
kontinuierlicher Prüfung; ≥1 real gefundenes Datenqualitätsproblem sichtbar gemacht,
bevor ein Konsument es meldet; Time-to-Setup < 1 Tag; Security-Freigabe erteilt ohne
Sonderausnahme.

**Exit-/Abbau-Kriterien:** Pilot befristet; bei Nicht-Verstetigung Container +
Volume + HANA-Read-User rückstandsfrei entfernen; Check-Sets (Git) verbleiben als
Dienstleistungs-Output beim Kunden.

---

## 10 — Offene Entscheidungen (vor P0 zu klären)

| # | Entscheidung | Optionen | Default-Empfehlung |
|---|---|---|---|
| E1 | Kommerz-/Rechtsmodell des Piloten | B (Kunde betreibt, befristet) · A1-Zwischenweg (Cockpit gehostet, Runner beim Kunden) | **B befristet als Dienstleistung** |
| E2 | Auth im Pilot | OIDC gegen Kunden-IdP · Proxy+noauth (single-container) | **OIDC**, Proxy nur wenn IdP verzögert |
| E3 | Übergabe-Verpackung | Docker/Compose · VM/OVA | **Docker/Compose**, VM als Fallback |
| E4 | Scheduling | interner Poller · externer Cron/Task-Chain | **interner Poller** (Pilot-Vereinfachung) |
| E5 | Diagnostics (Rohzeilen) | aus · opt-in mit Allowlist | **aus** (G8 scharf), opt-in nur auf Bedarf |
| E6 | Lineage/Coverage im MVP | rein · Phase 2 | **Phase 2**, wenn Lineage-Extrakt gepflegt |

---

## 11 — Anker-Referenzen

| Baustein | Datei / Stelle |
|---|---|
| Modi-Umschalter (Konfiguration) | `services/api/settings.py` |
| Bind-Policy S5 (fail-closed) | `services/api/main.py` → `assert_bind_policy` |
| Store: voll ausgebaut / Stub | `packages/dq_core/store/sqlite_store.py` · `hana_store.py` (O6-Stubs) |
| Store-Aufbau + `RESULTS_ENVIRONMENT` | `services/api/deps.py` (`_build_hana_store`) |
| Hybrid-Executor / CLI | `cli/dq_check_runner.py` (Exit-Code = Gate-Verdict) |
| DQ-only-Navigation (FE) | `apps/cockpit/src/components/layout/Sidebar.tsx` (`navForRole`, `DQ_BLOCK`/`GOVERN_BLOCK`) · `apps/cockpit/src/App.tsx` · `apps/cockpit/src/i18n/de.ts` |
| `internal_gate` / Lite | `contracts/DEMO_SRC_01.yaml` · `Betriebsmodi_Lite_und_Full.md` §3 |
| `hdbcli` proprietär | `packages/dq_core/pyproject.toml` (optional-dependency `hana`) · `Uebergabemodelle_und_Lizenz.md` §4.2 |
| Deployment-Profile | `Tooldokumentation.md` §6 (ENV), §10 (Deployment) |
| Übergabemodelle / Managed / A1 | `Uebergabemodelle_und_Lizenz.md` · `Konzept_Managed_Service_Provisioning.md` |

# Konzept — MVP-Pilot & Deployment (DQ-only) beim Kunden

**Stand:** 2026-09-01 · **Status:** Konzept / Entscheidungsgrundlage
**Zweck:** Wie Signal in einem **ersten Piloten** beim Kunden platziert wird — mit
bewusst reduziertem Funktionsumfang (**DQ-only**, ohne Contract-Governance/
Compliance), einem tragfähigen **Übergabeweg** (Container in der Kundenzone) und
einem klaren **Wert- und Reifegrad-Pfad**, der Kundennutzen und Folgeumsatz koppelt.
**Adressat:** Beratung (Delivery + Vertrieb), Plattform-Team des Kunden.

> Baut auf: [`Betriebsmodi_Lite_und_Full.md`](Betriebsmodi_Lite_und_Full.md) ·
> [`Uebergabemodelle_und_Lizenz.md`](Uebergabemodelle_und_Lizenz.md) (Modelle A/B/C,
> A1) · [`Konzept_Managed_Service_Provisioning.md`](Konzept_Managed_Service_Provisioning.md) ·
> [`Investment_Case_Signal.md`](Investment_Case_Signal.md) (Marktlücke, Erlöshebel,
> Defensibility) · [`Kundendeck_DataProducts_Lite.md`](Kundendeck_DataProducts_Lite.md) ·
> [`Tooldokumentation.md`](Tooldokumentation.md) §6/§10.

---

## 0 — Kernaussagen (Management Summary)

1. **Scope MVP = DQ-only.** Nur der Datenqualitäts-Kern (Checks fahren, Status/Trend
   sehen, Alarm bei Fehler). **Ohne** Contract-Governance, Compliance-Ampel,
   Versionierung/Approval, Data Products, Proposals, Enforcement/Quarantäne/Healing.
2. **„Ohne Contracts" = ohne Zeremonie, nicht ohne YAML.** Checks entstehen weiter
   aus SQL-freien `internal_gate`-Artefakten (Git = Wahrheit), im MVP „Check-Set"
   genannt. **Kein zweiter Authoring-Pfad**, keine Gate-Abschwächung (G1/G2/G6/G7/G8
   bleiben scharf).
3. **Datenquelle HANA/Datasphere-only**, Result-Store **SQLite auf Volume** (erprobt;
   HanaStore ist Stub/O6 → Ausbaustufe, §9.1).
4. **Übergabeweg = Container in der Kundenzone** (Docker/Compose), Kunde betreibt
   technisch. Drei benannte Deployment-Szenarien (§4.2): **(1) Kundenzone** (Default),
   **(2) externes/Managed-Hosting A1** (Stufe 2), **(3) Hybrid** — Cockpit gehostet,
   Runner in der Kundenzone (pragmatischer Zwischenweg gegen das Security-Veto).
5. **Der Pilot ist ein Einfallstor mit Reifegrad-Pfad.** Phase 1 (interne Checks,
   `owned_by: platform`) liefert sofort Kundenwert und öffnet über Ownership-Shift
   und Contracts größere Folge-Engagements — **Kunden- und Beratungswert wachsen
   gekoppelt** (§2).
6. **Zu bauender Rest ist klein** (§8): Container-Artefakte + eine
   DQ-only-Navigationsvariante im Frontend. Kein Engine-Umbau, **kein**
   HanaStore-Fertigbau nötig.

---

## 1 — Wertversprechen Phase 1 (Pain → Abhilfe → messbarer Mehrwert)

### 1.1 Der Pain bei Datasphere-Kunden

Belegt in `Investment_Case_Signal.md` §1 und `Kundendeck_DataProducts_Lite.md` §2–3:

- **SAP hat keinen deklarativen Ort für Data Quality in Datasphere.** Schema,
  Katalog, Sharing, Access haben je einen Ankerpunkt — **Quality/SLA ist die einzige
  Schicht ohne**. Wer DQ will, baut sie heute **pro Projekt handgestrickt in Views**
  (`DQ_STATUS`-Muster, Task Chains). Kein Contract-Objekt, keine Rules-Engine, keine
  Compliance-Sicht.
- **Die DQ-/Observability-Marktführer erreichen HANA/Datasphere nicht** (Monte Carlo,
  Anomalo, Soda, GX … verkaufen über Warehouse-Connectors — SAP ist für sie Nische).
- **Konsumenten (SAC-Reports, Downstream-Modelle) hängen an den Daten, ohne zu
  wissen, ob sie halten, was sie versprechen.** Probleme fallen erst auf, wenn ein
  Report falsch ist — reaktiv statt proaktiv. Der emotionalste Hebel ist
  **Freshness**: „sind die Daten von heute?"
- **Henne-Ei-Blockade:** Verbindlichkeit braucht Ownership, Ownership braucht erst
  einen sichtbaren Grund. Der klassische Weg (erst Governance/Org-Change) kostet
  Monate ohne sichtbaren Wert.

### 1.2 Wie Phase 1 (DQ-only) Abhilfe schafft

- **Messbare Checks in Tagen, ohne Org-Change** — die Plattform/Beratung setzt die
  ersten Zusagen (`owned_by: platform`), der Fachbereich muss nicht warten.
- **Read-only + PII-Gate (G8)** — Aggregat-Metriken statt Rohzeilen; im SAP-Haus ist
  „externe Engine fragt produktive HANA ab" ein Security-Thema, und Signals gegatete
  Posture ist selbst das Argument, das Deals durch die Security bringt.
- **Kontinuierlich statt Momentaufnahme** — ein lebendes Cockpit (Trend, Ampel,
  Historie), keine einmalige CI-Prüfung.
- **SQL-freie, kategorisierte Check-Bibliothek** — Vollständigkeit, Konsistenz,
  Verteilung, Schema, Aktualität (`packages/dq_core/library/check_library.json`) +
  `custom_sql` für Sonderfälle. Deterministisch und auditierbar, German-first.

> **Ehrlicher Hinweis (nicht überversprechen):** Eine **SAP-fachspezifische**
> Check-Bibliothek (z. B. BSEG/BKPF-Balance, Replikations-Lag, Fiscal-Completeness)
> wird im `Investment_Case` als Differenzierung genannt, ist im **aktuellen Code
> aber nicht als vorgefertigte Checks** enthalten — die Library ist heute generisch.
> Solche Checks entstehen im Pilot per `custom_sql`/Beratungs-IP und sind ein
> **Ausbaupotenzial** (Library-Erweiterung), kein Ist-Mehrwert. In der Demo nur
> zeigen, was real vorhanden ist.

### 1.3 Konkrete, möglichst messbare Mehrwerte

Zwei Klassen — **tool-nativ** (das Cockpit erhebt sie selbst, sofort belastbar) und
**abgeleitet** (Business-Wirkung, mit dem Kunden zu baselinen):

| Kennzahl | Aussage | Quelle | Belastbar ab |
|---|---|---|---|
| **Coverage-Quote** (% Konsum-Objekte mit aktivem Check-Set) | wie viel kritische Fläche überwacht ist | Cockpit/Coverage | Tag 1 nach Onboarding |
| **Aktive Checks · Läufe/Tag** | Überwachungsdichte | Result-Store | sofort |
| **Freshness-Verletzungen erkannt** | „Daten von heute?" objektiv | freshness-Checks | sofort |
| **Proaktiv erkannte DQ-Fehler** (vor Konsumenten-Meldung) | Frühwarn-Wirkung | Run-Historie | ab Betrieb (P3) |
| **Health-Trend** (Anteil grün/gelb/rot über Zeit) | Qualitätsentwicklung | Health-Trend | ab 2–3 Läufen |
| **MTTD** — Zeit Datenfehler → Erkennung | Reaktionsgeschwindigkeit | Run-Timestamps vs. Ladezeit | mit Baseline |
| *Eingesparte manuelle Prüf-Views/-Aufwand* | Effizienz *(Annahme)* | Vorher/Nachher-Baseline | mit Kunde zu baselinen |
| *Vermiedene Fehlentscheidungen auf falschen Daten* | Risiko *(Annahme)* | Incident-Fälle | qualitativ |

> **Consultant-Handwerk:** Damit „Verbesserung" *messbar* statt behauptet ist, in
> **P0/P2 eine Baseline** erheben (wie viele DQ-Probleme meldeten Konsumenten im
> letzten Quartal? Zeit bis Erkennung? Anzahl handgebauter Prüf-Views?). Ohne
> Vorher-Wert bleiben die abgeleiteten Kennzahlen Anekdote.

---

## 2 — Reifegrad-Pfad & Geschäftslogik (zwei Perspektiven)

Der Pilot ist bewusst der **niedrigschwellige Einstieg (Land)** mit eingebautem
**Ausbaupfad (Expand)**. Der Clou: Der Übergang wird **vom Tool selbst getriggert** —
die Coverage-Map/Ampel erzeugt den Pull („dieses Objekt, von dem euer Report lebt,
trägt heute null Garantien"). Der Kunde entwickelt sich weiter, **weil er den Wert
sieht**, nicht weil wir ihn drängen. Jede Stufe ist echter Kundenwert **und** ein
größeres Engagement — die beiden wachsen gekoppelt, nicht auf Kosten des anderen.

```
 Phase 1 ─────────────▶ Phase 2 ──────────────▶ Phase 3
 interne Checks         Ownership-Shift          Contracts / Full
 internal_gate, Lite    owned_by: platform       SemVer, Approval,
 owned_by: platform     → owned_by: product      Compliance, SLA, BDC/ODCS
 (= DQ-only-MVP)        (Fachbereich übernimmt)  (governte Datenprodukte)
        │                       │                        │
   Ampel/Coverage          Fachbereich sieht         verbindliche Zusage
   erzeugt Pull            Wert, will besitzen        an der Parteigrenze
```

**Technisch ist der Pfad kein Rebuild** — gleicher Unterbau, nur mehr Zeremonie und
ein `owned_by`-Shift (`Betriebsmodi_Lite_und_Full.md` §5). Die im MVP versteckten
Screens werden wieder eingeblendet.

### 2.1 Perspektive Kunde — was jede Stufe bringt

| Stufe | Kundenwert |
|---|---|
| **P1 interne Checks** | Sichtbarkeit + Frühwarnung in Tagen; kein Org-Change; Security-freigabefähig (read-only) |
| **P2 Ownership** | Der Fachbereich besitzt seine eigenen Zusagen; Datenkultur/Verantwortung wächst; Ampel hält den Druck |
| **P3 Contracts/Full** | Verbindliche, versionierte Datenprodukte; Konsumentenschutz (Breaking-Gate, SLA); BDC/ODCS-Katalog-Interop |

### 2.2 Perspektive Beratung — was jede Stufe an Umsatz öffnet

Aus `Investment_Case_Signal.md` §6 (drei Erlöshebel):

| Stufe | Beratungswert / Umsatzhebel |
|---|---|
| **P1 interne Checks** | **Land.** Niedrigschwelliger Pilot-Einstieg; zugleich **Delivery-Beschleuniger** — DQ-Arbeit kommt aus dem Werkzeugkasten statt handgebaut → höhere Marge, differenzierendes Ausschreibungsangebot |
| **P2 Ownership** | **Expand.** Governance-/Enablement-Engagement, Rollout auf mehr Objekte/Domänen, Change-Begleitung des Fachbereichs |
| **P3 Contracts/Full** | **Expand + Recurring.** Managed Service (A1/Hybrid, wiederkehrendes Betriebs-Entgelt), Contract-Rollout, BDC-Positionierung als Enforcement-Schicht, Thought Leadership |

> **Strategische Einordnung:** Signal ist als **Beratungs-Delivery-Tool** konzipiert,
> nicht als Lizenzprodukt (`Uebergabemodelle_und_Lizenz.md`). Der Reifegrad-Pfad ist
> das „Einfallstor mit Entwicklungs-Potenzial": ein kleiner, sauber abgegrenzter
> Pilot, der — wenn er Wert zeigt — organisch in Governance-, Rollout- und
> Betriebs-Engagements wächst. Das BDC-Zeitfenster (SAP beschreibt Datenprodukte,
> erzwingt sie aber nicht) macht Phase 3 zusätzlich zeitkritisch attraktiv
> (`Investment_Case` §3).

---

## 3 — MVP-Scope: was rein, was raus

### 3.1 Funktions-Matrix

| Bereich | Route(n) | MVP | Begründung |
|---|---|---|---|
| **Status-Cockpit** (Grid, Health-Trend, Brennpunkte) | `/` | ✅ Kern | DQ-Mehrwert auf einen Blick |
| **Objekt-Katalog & -Detail** | `/objects`, `/objects/:id` | ✅ Kern | Wo Checks leben und ausgelöst werden |
| **Läufe** (Detail, Live-Log, Vergleich) | `/runs/:id`, `/runs/compare` | ✅ Kern | Nachvollziehbarkeit |
| **Check-Set-Editor** (Lite, `internal_gate`) | `/contracts` → **„Check-Sets"** | ✅ Kern (reduziert) | SQL-freies Authoring **ohne** Approval/SemVer/Promotion |
| **Check-Library** | `/library` | ✅ Kern | beschleunigt Authoring |
| **Environments** (HANA-Verbindungen + Test) | `/environments` | ✅ Kern | ohne HANA-Env kein echter Lauf |
| **Scheduling** | `/schedules` | ✅ Kern | Dauerbetrieb statt Einmal-Lauf |
| **Alarme** (Check-Fehler → Webhook) | `/notifications` | ✅ Kern | Push; im MVP „Check-Fehler", nicht „Breach" |
| **Settings/Admin** | `/settings` | ✅ Kern | Betrieb |
| Schema-Drift | `/schema-drift` | ◑ optional | DQ-nah, Phase-2-Kandidat |
| Lineage/Coverage-Map | `/lineage`, `/coverage` | ◑ optional | braucht Lineage-Extrakt; „Coverage" = hat Objekt ein Check-Set |
| Rollen-Landing „Meine Arbeit" | `/my` | ◑ optional | vereinfachen oder ausblenden |
| **Contract-Governance** (Approval, Breaking-Diff, Promotion) | Teile von `/contracts` | ❌ aus | genau das, was im MVP *nicht* gewollt ist |
| **Compliance / SLA / Governance** | `/compliance` | ❌ aus | Contract-Konzept |
| **Data Products** | `/products` | ❌ aus | Governance-Aufbaustufe |
| **Proposals** (Miner) | `/proposals` | ❌ aus (Phase 2) | nett, nicht MVP |
| **Incidents** | `/incidents` | ❌ aus / ersetzt | Fehler-Historie zeigen Runs + Objekt-Detail |
| **Quarantäne / Healing / Enforcement** | `/quarantine`, `/healing`, `/enforcement` | ❌ aus | fortgeschrittene Enforcement-Kette |

### 3.2 Der ehrliche Punkt zu „ohne Contracts"

Checks **müssen** definiert werden — heute ausschließlich über den Compiler-Pfad
(SQL-freies YAML → `dq_core.contract.compiler` → `checks/<name>/checks.yml`). Es gibt
**keinen** parallelen Authoring-Weg. Die saubere MVP-Lösung nutzt das vorhandene
**`internal_gate` + Lite**: geführte Checkliste (Garantie an/aus + Severity),
Ein-Klick „Speichern & aktivieren", **keine** SemVer-/Approval-/Compliance-Mechanik.
Fachlich ist ein `internal_gate` bereits „Quality Gate ohne Gegenpartei — Fehler =
Engineering-Signal, keine Governance-Ampel" (Tooldokumentation §12).

> „Ohne Contracts" = wir **verstecken** die Governance-Schicht und **benennen** das
> Artefakt als „Check-Set". Das YAML bleibt (Git = Wahrheit) — das ist Feature: der
> Kunde bekommt versionierbare, reviewbare, SQL-freie Check-Definitionen ohne
> Zeremonie, und der spätere Full-Wechsel ist kein Rebuild.

---

## 4 — Zielarchitektur & Deployment-Szenarien

### 4.1 Topologie MVP (Kundenzone)

```
   ┌──────────────────────── KUNDEN-NETZ (Kundenzone) ─────────────────────────┐
   │  Nutzer (Browser)                                                          │
   │        │  HTTPS                                                            │
   │        ▼                                                                    │
   │  ┌───────────────┐        ┌────────────────────────────┐    ┌───────────┐ │
   │  │  web           │  /api  │  api + engine (uvicorn)    │    │  Volume   │ │
   │  │  nginx/Caddy   │───────▶│  services.api.main:app     │───▶│ signal.db │ │
   │  │  · TLS         │        │  · store=sqlite            │    │ (SQLite)  │ │
   │  │  · Vite-Bundle │        │  · auth=oidc | proxy       │    │ contracts/│ │
   │  └───────────────┘        │  · interner Poller (opt)   │    │ checks/   │ │
   │                            │  · allow_mock=false        │    └───────────┘ │
   │                            └──────────────┬─────────────┘                  │
   │                                           │ hdbcli (read-only, G8)         │
   │                                           ▼                                 │
   │                            ┌────────────────────────────┐                  │
   │                            │  Produktive HANA/Datasphere │  NUR LESEND      │
   │                            └────────────────────────────┘                  │
   └────────────────────────────────────────────────────────────────────────────┘
       Egress nur: OIDC-IdP (falls extern) · optional Breach-Webhook (Allowlist)
```

HANA-Zugriff bleibt kundenintern (kein Security-Veto von außen), die SQLite-Datei
liegt auf einem Volume **im Kunden-Netz** (Datenresidenz automatisch erfüllt). Der
Result-Store hält wegen G8 **nur Aggregat-Metriken + Verdikte**, keine Rohzeilen.

### 4.2 Drei Deployment-Szenarien (Wer betreibt was, wo läuft der HANA-Zugriff)

| # | Szenario | Cockpit + Store | Runner (HANA-Zugriff) | Betrieb | Wann |
|---|---|---|---|---|---|
| **1** | **Kundenzone** *(MVP-Default)* | Kundenzone | Kundenzone | Kunde technisch | Pilot; schnellste Security-Freigabe |
| **2** | **Extern/Managed (A1)** | bei uns | bei uns (via VPN/Private Link) | Beratung | Regelbetrieb, **wenn** Security HANA-Zugriff von außen erlaubt |
| **3** | **Hybrid** | bei uns | **Kundenzone** | Split | Managed gewünscht, aber HANA-Zugriff von außen unter Security-Veto |

**Szenario 3 (Hybrid) — der pragmatische Zwischenweg (wichtig):**
Der **framework-freie Runner** (`cli/dq_check_runner.py`) läuft **im Kunden-Netz nahe
der HANA**; nur die **Ergebnisse** (Aggregat-Metriken/Verdikte) fließen ins gehostete
Cockpit. Das ist die Standard-Antwort auf den Show-Stopper „externes System darf
produktive HANA nicht von außen lesen" (`Uebergabemodelle_und_Lizenz.md` §3a,
`Konzept_Managed_Service_Provisioning.md` §3c) und nimmt dem Managed-Modell (A1) die
schärfsten Zähne: **HANA-Zugriff bleibt kundenintern, wir liefern Recurring-Wert über
das gehostete Cockpit.** Zwei Abstufungen je nach Datenresidenz-Anspruch:

- **3a — Cockpit + Store bei uns:** Ergebnisse (Aggregat) verlassen die Kundenzone →
  Result-Residenz bei der Beratung. Einfachster Hybrid.
- **3b — Cockpit bei uns, Store in Kundenzone:** verlangt die Governance
  Ergebnis-Verbleib im Kunden-Tenant, wandert auch der Store (bzw. der ganze Runner)
  in die Kundenzone; wir betreiben nur die UI. Maximale Residenz-Konformität.

Der Runner schreibt **nichts** in Datasphere (read-only); Egress = nur der
Ergebnis-Push ans Cockpit (https, Allowlist).

**Persistenz — drei getrennte Orte** (`Konzept_Managed_Service_Provisioning.md` §4):

| Ort | Inhalt | MVP-Backing |
|---|---|---|
| Git | `contracts/*.yaml` (Check-Sets), `checks/*/checks.yml` | Kunden-Repo oder Volume |
| Result-Store | Läufe, Ergebnisse, Baselines | **SQLite** auf persistentem Volume |
| Kunden-HANA | die geprüften Produktivdaten | **nur lesend**, nie Eigentum von Signal |

---

## 5 — Konfigurationsprofil „Pilot / Kunde"

Der Umschalter Lokal→Kunde ist **reine Konfiguration** (`services/api/settings.py`),
kein Code-Zweig.

| Setting | Wert Pilot | Warum |
|---|---|---|
| `STORE_BACKEND` | `sqlite` | erprobt; HanaStore ist Stub (§9.1) |
| `SQLITE_DB` | `/data/signal.db` | persistentes Volume |
| `AUTH_MODE` | `oidc` (empfohlen) / `noauth`+Proxy (Fallback) | S5 (§7) |
| `BIND_HOST` | `0.0.0.0` bei OIDC · `127.0.0.1` bei Proxy-im-Container | S5 fail-closed |
| `ALLOW_MOCK_CONNECTION` | **`false`** | kein stiller Fail-Open (S-13) |
| `ENVIRONMENTS_FILE` | `environments.yml` (mit `secret_ref`) | HANA-Verbindung, Secret als Referenz |
| `SCHEDULER_ENABLED` | `true` (Pilot-Vereinfachung) | interner Poller statt Cron-Container (ADR-0005) |
| `CORS_ORIGINS` | Pilot-Host | nur das echte Frontend |
| `WEBHOOK_URL` / `WEBHOOK_ALLOWLIST` | optional | Check-Fehler-Alarm, SSRF-Allowlist (S6) |
| `ALLOW_LOCAL_DIAGNOSTICS` | `false` | PII-Gate scharf; opt-in nur bei Bedarf + Allowlist |

`environments.yml` bindet das `{schema}` zur Laufzeit (G2) — Check-Sets bleiben
environment-frei und portabel.

---

## 6 — Übergabeweg: Docker vs. VM

### 6.1 Bewertung

| Kriterium | Docker/Compose | VM / OVA-Appliance |
|---|---|---|
| Aufsetzgeschwindigkeit | hoch (`compose up`) | mittel |
| Reproduzierbarkeit | hoch (deklarativ) | mittel |
| Kunden-Voraussetzung | Container-Runtime | Hypervisor/VM-Slot |
| Update-Pfad | Image-Tag tauschen | Patch in der VM |
| `hdbcli`-Beschaffung (§6.3) | Build-Arg/Volume beim Kunden | in der VM installieren |

**Empfehlung: Docker/Compose als Standard**, VM/OVA nur als Fallback, wenn die
Kunden-Policy keine Container erlaubt (dann dieselben Prozesse als systemd-Units).

### 6.2 Einordnung ins Übergabemodell

Ein Container-Bundle, das der Kunde **autonom** betreibt, ist **Modell B/C**
(Graubereich → Softwareüberlassung), nicht reine Dienstleistung. Für einen
**befristeten Piloten** beherrschbar, wenn als **Pilot-/Evaluierungsvereinbarung**
eingekleidet: befristet, „as-is / keine Eignungszusage" + Haftungs-Cap, `hdbcli`
nicht im Bundle (§6.3), Support explizit geregelt. Wer die
Softwareüberlassungs-Schwelle vermeiden will, wählt **Szenario 3 (Hybrid)** — dann
bleibt es Dienstleistung.

### 6.3 Der `hdbcli`-Stolperstein

`hdbcli` ist der **proprietäre SAP-HANA-Client** und darf **nicht redistribuiert**
werden. Deshalb **nicht** ins verteilte Image backen — der Kunde (SAP-lizenziert)
stellt das Wheel bereit, das Image wird **in der Kunden-Registry** gebaut und zieht
den Treiber dort. Ohne `hdbcli` läuft nur die `MockConnection`.

---

## 7 — Deployment-Vorlagen (Konzept-Skeleton)

> Vorlagen, **nicht** committete Build-Artefakte — werden im Umsetzungsschritt (§8)
> ins Repo gelegt und getestet.

### 7.1 `Dockerfile` (API + Engine)

```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app
RUN pip install --no-cache-dir --upgrade pip
COPY services/api/requirements.txt /app/req-api.txt
RUN pip install --no-cache-dir -r /app/req-api.txt

# hdbcli aus KUNDEN-Quelle, nicht im verteilten Basis-Layer (§6.3):
#   docker build --build-arg HDBCLI_WHL=hdbcli-<ver>.whl ...
ARG HDBCLI_WHL=""
COPY ${HDBCLI_WHL:-/dev/null} /tmp/hdbcli.whl
RUN if [ -s /tmp/hdbcli.whl ]; then pip install --no-cache-dir /tmp/hdbcli.whl; fi

COPY packages/ /app/packages/
COPY services/ /app/services/
COPY cli/       /app/cli/
ENV PYTHONPATH=/app:/app/packages
EXPOSE 8000
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 7.2 `docker-compose.yml` (OIDC-Variante, getrennte Container)

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      args: { HDBCLI_WHL: ${HDBCLI_WHL} }   # Kunde stellt Pfad bereit
    env_file: [ .env ]
    environment: { BIND_HOST: 0.0.0.0 }     # zulässig, weil AUTH_MODE=oidc (S5)
    volumes:
      - signal-data:/data
      - ./contracts:/app/contracts
      - ./checks:/app/checks
    restart: unless-stopped
  web:
    image: nginx:1.27-alpine
    volumes:
      - ./apps/cockpit/dist:/usr/share/nginx/html:ro
      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports: [ "443:443" ]
    depends_on: [ api ]
    restart: unless-stopped
volumes: { signal-data: {} }
```

### 7.3 `nginx.conf` (statisches Bundle + Reverse-Proxy)

```nginx
server {
  listen 443 ssl;
  ssl_certificate     /etc/nginx/tls/fullchain.pem;
  ssl_certificate_key /etc/nginx/tls/privkey.pem;
  root /usr/share/nginx/html;
  location / { try_files $uri /index.html; }            # SPA-Routing
  location /api/ {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;  # OIDC-Bearer durchreichen
  }
}
```

### 7.4 `.env`-Vorlage (Profil Kunde)

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
```

### 7.5 Hybrid (Szenario 3): Runner in der Kundenzone

Der Runner braucht **kein** Cockpit — nur `dq_core` + `hdbcli` + die kompilierten
`checks.yml`. Als Cron/Task-Chain im Kunden-Netz:

```bash
python cli/dq_check_runner.py \
  --schema CORE_DWH \
  --checks checks/DS_SALES_ORDERS/checks.yml \
  --host <hana-host> --port 443 --user <read-user> \
  --output json            # Ergebnis-JSON → Push ans gehostete Cockpit
# Exit-Code = gate_verdict (0 proceed / 1 block / 3 quarantine) für die Task-Chain
```

Der Ergebnis-Push ans gehostete Cockpit ist ein dünner, allowlist-geschützter
HTTPS-Aufruf; HANA-Credentials verlassen die Kundenzone nie.

### 7.6 Fallback ohne IdP: noauth hinter Proxy

Wegen S5 muss die API bei `noauth` auf `127.0.0.1` gebunden bleiben → `api` und Proxy
im **selben** Container (z. B. Caddy + uvicorn via supervisor), Proxy →
`127.0.0.1:8000`. In getrennten Containern lauscht die API auf der Container-IP →
`noauth` bricht beim Start fail-closed ab (`assert_bind_policy`) — Absicht, kein Bug.

---

## 8 — Security & Konnektivität

- **Auth (S5 fail-closed):** `noauth` nur auf Loopback. Extern erreichbar ⇒ **OIDC**
  (bind `0.0.0.0`) oder Proxy + loopback-API im selben Container (§7.6).
  Datasphere-Kunden haben i. d. R. einen IdP (BTP/XSUAA, Azure AD).
- **HANA read-only** über `hdbcli`; im DQ-only-MVP kein Schreiben, auch nicht ins
  Signal-Schema.
- **PII-Gate (G8):** ohne `ALLOW_LOCAL_DIAGNOSTICS` keine Rohzeile; Ergebnisse sind
  Aggregat-Metriken.
- **Kein Fail-Open:** `ALLOW_MOCK_CONNECTION=false` erzwingt echte HANA je Lauf (S-13).
- **Egress minimal:** IdP (falls extern), optional Breach-Webhook (https, Allowlist,
  Private-IP-Block, keine Redirects — S6); im Hybrid zusätzlich der Ergebnis-Push.

---

## 9 — Ausbaustufen (nach erfolgreichem Pilot)

### 9.1 HANA-Result-Store (Auslöser-gebunden)

`packages/dq_core/store/hana_store.py` ist **teil-implementiert**: Kern-Round-Trip per
`make hana-smoke` testbar, aber Teile sind getrackte `NotImplementedError`-Stubs
(pending **O6**); `sqlite_store.py` ist voll ausgebaut. **Auslöser** (mind. einer):
externes Hosting **und** Ergebnis-Residenz im Kunden-Tenant gefordert, **oder**
Full-Regelbetrieb (≥2 Worker, mehrere Tenants). Im Pilot (Kundenzone) ist keiner
gegeben → SQLite bleibt korrekt. Vor Aktivierung: O6 abschließen + `hana-smoke` grün.

### 9.2 Externes/Managed-Hosting (A1) & Hybrid — Stufe 2

Attraktiv für Recurring Revenue, bleibt Dienstleistung — aber mit realen Risiken
**für uns**, die vor dem Hosting geregelt sein müssen:

| Gefahr | Kern | Gegenmittel |
|---|---|---|
| **Security-Veto HANA-Zugriff** | externes Signal muss produktive Kunden-HANA lesen | VPN/Private Link — oder **Szenario 3 (Hybrid)** |
| Credentials zu Produktivdaten bei uns | Angriffs-/Haftungsfläche | Secret-Mgmt; Hybrid vermeidet es (HANA bleibt intern) |
| Betreiberpflichten (laufend) | Verfügbarkeit, Patches, Backups, IdP | Managed-Entgelt + definierter Support |
| Datenschutz-Rolle | typ. Auftragsverarbeitung → **AVV/DPA (Art. 28)**, TOMs, Sub-Prozessoren *(kein Rechtsrat)* | EU-Hosting; Residenz klären; **Hybrid 3b** (Store in Kundenzone) |
| Multi-Tenant-Leak | Signal ist Single-Tenant-pro-Instanz (kein `tenant_id`) | strikt infrastrukturelle Isolation je Kunde |
| Reputations-/Vertrauenshaftung | Kunde vertraut grüner Ampel | Haftungs-Cap + „as-is" |

> **Empfehlung Stufe 2:** **Szenario 3 (Hybrid)** ist meist der beste Kompromiss —
> Recurring-Wert über das gehostete Cockpit, HANA-Zugriff und (bei 3b) der Store
> bleiben beim Kunden. Nimmt A1 die schärfsten Zähne (Security-Veto, Residenz) und
> bleibt sauber Dienstleistung.

### 9.3 Full-Modus / Governance (Phase 3)

`internal_gate → consumer/provider_contract` promoten; Compliance/SLA/Versionierung/
BDC-ODCS-Export zuschalten. **Kein Rebuild** — nur mehr Zeremonie + `owned_by`-Shift.

---

## 10 — Umsetzungsaufwand für den MVP

| Baustein | Status | Aufwand |
|---|---|---|
| Engine, Compiler, SQLite-Store, CLI-Runner, API, Cockpit | **vorhanden** | — |
| `internal_gate` + Lite-Authoring | **vorhanden** | — |
| **Container-Artefakte** (Dockerfile, compose, nginx, .env) | **fehlt** (§7 als Vorlage) | klein–mittel |
| **DQ-only-Navigation** (Governance-Screens aus, „Contract"→„Check-Set") | **fehlt** | klein: `Sidebar.tsx` (`navForRole`, `DQ_BLOCK`/`GOVERN_BLOCK`), `App.tsx`, `i18n/de.ts` — Build-Flag `VITE_MVP_DQ_ONLY` |
| `hdbcli`-Beschaffung über Kunden-Kanal | Prozess | Abstimmung Kunde |
| SQLite-Volume-Backup | Ops | klein |
| OIDC-Client + Claim→Rollen-Mapping | Abstimmung | klein–mittel |
| **HanaStore fertigstellen** | **nicht nötig** für MVP | — (Stufe 2) |

Kein Engine-Umbau, keine Migrationen, keine Gate-Änderung — überwiegend **Verpackung +
Sichtbarkeits-Reduktion**.

---

## 11 — Pilot-Fahrplan

| Phase | Inhalt | Verantwortung |
|---|---|---|
| **P0 Vorbereitung** | Pilot-/Evaluierungsvereinbarung (befristet, as-is, Haftungs-Cap); Scope 3–5 Konsum-Objekte; Security-Freigabe read-only Space-User; `hdbcli`-Bezug klären; **Baseline erheben** (§1.3) | Beratung + Kunde-Security |
| **P1 Bereitstellung** | Container in Kundenzone (§4/§7); `environments.yml` mit HANA-Read-User; Auth; `ALLOW_MOCK_CONNECTION=false`; Verbindungs-Smoke-Test | Beratung (R) + Kunde-Plattform (C) |
| **P2 Onboarding** | Inventar-Extrakt; für 3–5 Objekte Check-Sets seeden + Lite-Garantien (Fokus `freshness`, `not_null`, `keys`, `schema closed`); erste Läufe | Beratung (R) |
| **P3 Betrieb** | Scheduling (Poller); Cockpit im Alltag; Check-Fehler-Alarm; Kunde nutzt Status-Grid; **KPIs sammeln** (§1.3) | Kunde (R) + Beratung (Support) |
| **P4 Auswertung** | Erfolgskriterien prüfen; **Ownership-Gespräch mit Fachbereich** (Coverage-Map als Hebel → Phase 2); Entscheidung Verstetigung/Skalierung | Beratung + Kunde |

**Erfolgskriterien (mit Kunde schärfen):** ≥3 Objekte kontinuierlich geprüft; ≥1 real
gefundenes DQ-Problem sichtbar gemacht, bevor ein Konsument es meldet; Time-to-Setup
< 1 Tag; Security-Freigabe ohne Sonderausnahme; **mind. 1 Fachbereich zeigt
Ownership-Interesse** (Phase-2-Trigger).

**Exit-/Abbau:** Pilot befristet; bei Nicht-Verstetigung Container + Volume +
HANA-Read-User rückstandsfrei entfernen; Check-Sets (Git) verbleiben als
Dienstleistungs-Output beim Kunden.

---

## 12 — Offene Entscheidungen (vor P0)

| # | Entscheidung | Optionen | Default-Empfehlung |
|---|---|---|---|
| E1 | Deployment-Szenario (§4.2) | 1 Kundenzone · 2 Extern/Managed · 3 Hybrid | **1 Kundenzone** für Pilot; **3 Hybrid** für Stufe 2 |
| E2 | Kommerz-/Rechtsmodell | B befristet · A1/Hybrid als Dienstleistung | **B befristet** im Pilot |
| E3 | Auth | OIDC gegen Kunden-IdP · Proxy+noauth (single-container) | **OIDC** |
| E4 | Übergabe-Verpackung | Docker/Compose · VM/OVA | **Docker/Compose** |
| E5 | Scheduling | interner Poller · externer Cron/Task-Chain | **interner Poller** |
| E6 | Diagnostics (Rohzeilen) | aus · opt-in mit Allowlist | **aus** (G8 scharf) |
| E7 | Lineage/Coverage im MVP | rein · Phase 2 | **Phase 2**, wenn Lineage-Extrakt gepflegt |

---

## 13 — Anker-Referenzen

| Baustein | Datei / Stelle |
|---|---|
| Modi-Umschalter (Konfiguration) | `services/api/settings.py` |
| Bind-Policy S5 | `services/api/main.py` → `assert_bind_policy` |
| Store: voll ausgebaut / Stub | `packages/dq_core/store/sqlite_store.py` · `hana_store.py` (O6-Stubs) |
| Store-Aufbau + `RESULTS_ENVIRONMENT` | `services/api/deps.py` (`_build_hana_store`) |
| **Hybrid-Runner** | `cli/dq_check_runner.py` (Exit-Code = Gate-Verdict) |
| DQ-only-Navigation (FE) | `apps/cockpit/src/components/layout/Sidebar.tsx` (`navForRole`, `DQ_BLOCK`/`GOVERN_BLOCK`) · `App.tsx` · `i18n/de.ts` |
| Check-Bibliothek (generisch) | `packages/dq_core/library/check_library.json` |
| `internal_gate` / Lite | `contracts/DEMO_SRC_01.yaml` · `Betriebsmodi_Lite_und_Full.md` §3 |
| `hdbcli` proprietär | `packages/dq_core/pyproject.toml` · `Uebergabemodelle_und_Lizenz.md` §4.2 |
| Pain / Marktlücke / Erlöshebel | `Investment_Case_Signal.md` · `Kundendeck_DataProducts_Lite.md` |
| Deployment-Profile | `Tooldokumentation.md` §6 (ENV), §10 (Deployment) |
| Übergabemodelle / Managed / A1 / Hybrid | `Uebergabemodelle_und_Lizenz.md` · `Konzept_Managed_Service_Provisioning.md` |

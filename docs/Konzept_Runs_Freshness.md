# Konzept: Run-/Load-Informationen als Freshness-Dimension

## Ziel

Signal stellt Informationen ueber ausgefuehrte Datasphere-Runs (Replication
Flows, Transformation Flows, persistierte Views, Task Chains) dar — aber nicht
als eigenes Job-Monitoring, sondern als **Freshness-Dimension**, die jede
Qualitaetsaussage ergaenzt und absichert.

## Leitidee

Datasphere hat bereits einen Task-Monitor. Signal baut den nicht nach. In Signal
beantwortet ein Run genau eine Frage — **"ist dieser Datenstand aktuell?"** — und
das ist die fehlende zweite Achse neben **"ist dieser Datenstand korrekt?"** (den
Checks).

Ein gruenes `PASS` auf Daten, die seit 5 Tagen nicht geladen wurden, ist
irrefuehrend. Runs sind die Evidenz, mit der Signal genau das erkennt. Deshalb
werden Run-Informationen als **Zeit-/Aktualitaetsachse in die bestehenden
Oberflaechen eingewoben** — nicht als separate "Jobs"-Seite.

Diese Idee nutzt ein bereits vorhandenes Primitiv wieder: den Gating-State
`skipped_stale` (G6). Runs liefern die Evidenz, die diesen State steuert.

### Ehrlichkeits-Regel

Fehlt eine Run-Quelle (kein technischer User / kein REST-Connector konfiguriert),
gilt **"unbekannt", nicht "frisch"**. Das ist dieselbe Disziplin wie beim
Extrakt-No-Op: niemals einen unbekannten Zustand als gruen darstellen.

## Connectivity (Kurzentscheidung)

Run-Historie wird ueber die **REST-API mit technischem User**
(OAuth2 Client-Credentials, `services/api/datasphere.py`) bezogen — headless,
monitoring-tauglich, bereits implementiert (R7: `get_task_chain_runs`,
`get_replication_flow_runs`, `get_data_loads` hinter `GET /api/datasphere/data-loads`).
Die CLI bleibt dem vorbehalten, was REST nicht zuverlaessig liefert (volles CSN
fuer Lineage). Begruendung siehe ADR-0002 (Datasphere-DB-Zugriff) bzw.
`datasphere.py`.

## Das Atom: Freshness pro Objekt

Jeder Run bildet auf ein Dataset ab, daher ist die Praesentationseinheit die
**Freshness eines Objekts**, abgeleitet aus seinem letzten Run:

- **Letzter erfolgreicher Load** — absolut + relativ ("vor 3 h") und der Load-Typ
  (replication / transformation / persist view / task chain).
- **Aktueller Zustand** — `success · running · failed · late/overdue · never-run ·
  unknown`.
- **Freshness-Verdikt** gegen ein SLA-Fenster: `fresh · aging · stale · failed ·
  unknown` — eine Freshness-Ampel analog zur Qualitaets-Ampel.
- **Run-History-Sparkline** — die letzten N Runs als farbige Ticks (Outcome /
  Latenz). Ein Blick = "ist dieser Load verlaesslich?".

## Wo es sichtbar wird (an bestehende Surfaces andocken, kein Silo)

1. **Objekt-Detail** — primaere Heimat. Freshness-Header + Run-History-Sparkline +
   Last-Load-Fakten. Hook vorhanden: `useObjectDataLoads`.
2. **Status-Grid** — **Freshness-Indikator neben der Qualitaets-Ampel**. Jede Zeile
   zeigt beide Achsen: *korrekt?* (Checks) und *aktuell?* (Loads). Ein gruener
   Check auf veralteten Daten wird sichtbar abgewertet.
3. **Gate-Integration (der Signal-spezifische Hebel)** — ist der letzte Load aelter
   als das Freshness-Fenster des Contracts, downgraden Checks auf `skipped_stale`
   und **zitieren den Run** als Grund. Das ist die Verbindung, die nur Signal
   herstellen kann (Load-Lineage → Quality-Gating), und sie ist dank G6 fast
   geschenkt.
4. **Lineage-/Coverage-Map** — Nodes nach Freshness einfaerben und propagieren:
   eine "frische" View, gespeist von einer veralteten Remote-Table, ist
   **effektiv veraltet**. Load-Edges = die Datenbewegungs-Realitaet hinter den
   Lineage-Edges.
5. **Incidents** — ein fehlgeschlagener Run oder chronische Verspaetung wird zum
   Incident auf **derselben** Oberflaeche wie Qualitaetsfehler (ein Posteingang,
   nicht zwei). Timeliness steht neben Correctness.
6. **Contracts** — eine **Freshness-/Timeliness-Guarantee-Familie** ("geladen
   innerhalb 24 h", "taeglich bis 06:00"). Runs sind die Evidenz, die das
   beweist/verletzt — bleibt SQL-frei/semantisch (G1), und die Run-Historie wird
   zum erstklassigen SLA statt nur Status-Anzeige.

## Modell-Nuancen (vorab entscheiden)

- **Task Chains sind Run-*Gruppen*** — ein Chain-Run beruehrt viele Objekte. Den
  Chain-Run als Gruppe darstellen, die auf die Freshness jedes Mitglieds-Objekts
  herunterbricht, nicht als eine opake Zeile.
- **Typ → Objekt-Mapping**: Replication-Flow-Run → Ziel-Table; Transformation-
  Flow-Run → Output-Objekt; Persist-Task → die persistierte View; Task-Chain →
  Fan-out auf alle beruehrten Objekte.
- **Freshness-SLA-Quelle**: zuerst Contract (falls Timeliness-Guarantee
  vorhanden), sonst ein globaler Default pro Environment, sonst "unknown".

## States & visuelle Sprache

- Run-States: `success · running · failed · late · never · unknown`.
- Freshness-Ampel: `fresh · aging · stale · failed · unknown`.
- Zeit: relative Angabe ("vor 3 h") mit absolutem Zeitstempel im Tooltip.
- Konsistenz: dieselbe Ampel-/Badge-Sprache wie bei Qualitaet, damit beide Achsen
  visuell vergleichbar sind.

## Abgrenzung (was Signal NICHT tut)

- Kein Nachbau des Datasphere-Task-Monitors; tiefe Job-Logs werden verlinkt, nicht
  gespiegelt.
- Keine Run-Steuerung (Start/Stop/Retry) — Signal bleibt read-only.
- Keine eigene "Jobs"-Seite als Silo; Run-Info lebt in Objekt/Grid/Lineage/
  Incidents/Contracts.

## Phasen

- **MVP**: Objekt-Detail-Freshness + Run-Sparkline + Status-Grid-Freshness-
  Indikator (read-only, "unknown" ohne Connector).
- **High-Value Next**: Freshness in `skipped_stale`-Gating verdrahten, mit
  zitiertem Run.
- **Spaeter**: Lineage-Propagation, Timeliness-Incidents, Freshness-Guarantee-
  Familie.

## Bezug zu bestehenden Invarianten

- **G6** (Gating-States nie still weglassen): `skipped_stale` ist der vorhandene
  Andockpunkt; Runs liefern dessen Evidenz.
- **G1** (keine SQL in Contracts): Timeliness als semantische Guarantee-Familie,
  nie als SQL.
- **Ehrlichkeit bei fehlender Quelle**: "unknown" statt "fresh" — analog zum
  Extrakt-`skipped`-Verhalten.

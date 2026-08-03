# Konzept — Manuelle Healing-Mechanismen (Datenkorrektur & Wiedereinspeisung)

**Stand:** 2026-08-03 · **Status:** **H1 + H3 umgesetzt** (Healing-Workbench
`/healing`, API `/api/healing`, Migrationen store-019 / remote-003);
H2/H4/H5 zu evaluieren → [`OPEN_TASKS.md`](OPEN_TASKS.md) Abschnitt **R** ·
**Kontext:** [`Konzept_Datasphere_Integration_Gating_Quarantaene.md`](Konzept_Datasphere_Integration_Gating_Quarantaene.md)
(Slices ④–⑦), ADR-0002 (+ Schreib-Amendment), `OPEN_TASKS.md` F/C5.

---

## 0 / Frage & Kurzantwort

**„Haben wir manuelles Healing schon?"** — Auf **Prozess- und Regel-Ebene ja,
auf Daten-Ebene nein.**

Heute vorhanden:

| Ebene | Mechanismus | Beleg |
|---|---|---|
| Prozess | Quarantäne-Episoden-Lifecycle `open → reconciled → released → resolved` mit Audit-Events (`steward+`) | `/api/quarantine`, Migration 016 |
| Prozess | Incident-Lifecycle (`acknowledged/investigating/resolved` + Note/Owner), Auto-Resolve bei grünem Folgelauf | `/api/incidents` |
| Prozess | Re-Run/Re-Extract (Run-Trigger, Schedules, `on_load`) | `/api/runs`, ADR-0005 |
| Regel | Proposals (Accept → Draft-Amendment) + **Backtesting** („hätte N× gefeuert") | `/api/proposals`, `/api/contracts/{p}/backtest` |
| Zeilen-Infrastruktur | `DQ_Q_<OBJ>` (episodisches Zeilen-Parken, **Signal-Schema**), `V_DQ_RELEASED_<OBJ>`, `DQ_CLEAN_<OBJ>`, `DQ_EPISODES` — als Plan/Apply-Artefakte, doppelt gegated | `enforce/split.py`, `/api/enforcement/plan|apply` |

Was **fehlt**: das Korrigieren einzelner Werte einer geparkten/fehlerhaften
Zeile und deren kontrollierte Wiedereinspeisung — Daten-Healing.

**Zur vorgeschlagenen Möglichkeit** (manuelles Ändern von Quarantäne-Datensätzen
über die HANA-Tabelle): Ja, das ist **genau anschlussfähig** — die geparkten
Zeilen liegen in `DQ_Q_<OBJ>` im **Signal-Schema**, wo Signal laut
ADR-0002-Amendment schreiben darf; die Quelle bleibt unberührt. Als **H1** unten
bewertet. Wichtigste Einschränkung: nicht als freies `UPDATE`, sondern über eine
definierte Korrektur-Tür mit Audit und Re-Validierung (§3.1).

---

## 1 / Begriffsrahmen — drei Healing-Achsen

1. **Daten-Healing** — der Wert ist falsch; jemand korrigiert ihn
   (Gegenstand dieses Konzepts: H1, H3, H4).
2. **Prozess-Healing** — die Daten kommen erneut/nachträglich richtig; es geht
   um Wiederanlauf und Freigabe (existiert: Episoden-Lifecycle, Re-Run).
3. **Regel-Healing** — die Daten waren richtig, die Erwartung falsch
   (existiert: Proposals + Backtest; §3.5 macht es zum expliziten Triage-Ausgang).

Eine Incident-Triage sollte immer benennen können, **welche** Achse heilt —
sonst wird an Daten „geflickt", was eigentlich ein Regel- oder Quellproblem ist.

---

## 2 / Leitplanken (nicht verhandelbar)

- **Quelle bleibt read-only** (ADR-0002). Kein Healing-Mechanismus schreibt in
  Space-/Quell-Tabellen; Schreibfläche ist ausschließlich das Signal-Schema.
- **Heal → Re-Check → Release.** Jede Korrektur läuft vor der Freigabe erneut
  durch die **kompilierten Checks derselben Contract-Version** (deterministisch,
  G1). Es gibt keinen Pfad, der korrigierte Zeilen am Gate vorbei freigibt.
- **G8 bleibt scharf.** Rohzeilen verlassen HANA nicht ohne Opt-in. Ein
  Zeilen-Editor im Cockpit stünde hinter demselben Gate wie Diagnostics/Profile
  (per-Objekt Opt-in + Spalten-Allowlist); Default ist: Korrektur **in** HANA,
  Cockpit zeigt nur Episode/Audit/Aggregate.
- **Lückenlose Audit-Spur.** Wer, wann, was (Vorher→Nachher), warum — als
  Systemspalten/Events, nicht als Konvention. Bei `consumer/provider_contract`
  zusätzlich Vier-Augen (Korrigierender ≠ Freigebender).
- **Episoden-/Generationsbindung.** Korrekturen hängen an Episode × Generation
  (`manifest_hash`-Disziplin); ein neuer Lauf ersetzt (`superseded`) — keine
  Korrektur „überlebt" unkontrolliert in eine neue Episode.

---

## 3 / Optionen

### H1 — Korrektur in der Quarantäne-Parkbucht (`DQ_Q_<OBJ>`) · **empfohlene erste Stufe**

Der Nutzer-Vorschlag. Geparkte Bad-Rows werden **in der Signal-Schema-Tabelle**
korrigiert und über den bestehenden Episoden-Lifecycle wieder freigegeben.

- **Mechanik:** Korrektur ausschließlich über eine DEFINER-Prozedur
  `P_DQ_CORRECT_ROW` (analog zur SQL-Bridge in `enforce/bridge.py`) statt
  Direkt-Grant auf die Tabelle: sie schreibt den neuen Wert, sichert den
  Vorher-Zustand (JSON-Schattenspalte `_DQ_ORIGINAL`), stempelt
  `_DQ_CORRECTED_BY/_AT/_REASON` und ein Event in den Episoden-Spiegel.
- **Re-Validierung:** „Episode-Re-Check" — die zeilenfähigen Prädikate der
  Episode (aus `split.py`) laufen gegen die korrigierten Zeilen; nur bestehende
  Zeilen sind release-fähig (`V_DQ_RELEASED_<OBJ>` bzw. Reprocess H4). Der
  bestehende `release`-Übergang bekommt eine Vorbedingung statt neuer Semantik.
- **Stärken:** nutzt vorhandene Infrastruktur (Slices ④–⑤); PII bleibt in HANA
  (Korrektur per DB-Tooling/SAP-Frontend, G8-neutral); Schreib-Amendment
  gedeckt.
- **Grenzen/Risiken:** Korrektur gilt **nur für diese Episode** — bei
  replizierenden Loads bringt der nächste Extract den Fehler wieder (dann H3
  oder Fix-at-Source). Freies `UPDATE` durch DB-User wäre un-auditiert —
  deshalb Prozedur-Tür verpflichtend, kein Tabellen-Grant.
- **Aufwand:** ~3–4 PT (Prozedur-DDL im Plan/Apply, Re-Check, Cockpit-Anzeige
  der Korrektur-Historie im Quarantäne-Drawer).

### H2 — Fix-at-Source-Workflow · **Default-Haltung**

Der fachlich sauberste Weg: der Fehler wird **im Quellsystem** behoben,
Signal orchestriert nur — Incident → Owner (existiert) → Korrektur-Checkliste/
Deep-Link → Re-Extract/Re-Run als Verifikation → Auto-Resolve (existiert).
Kein neuer Schreibpfad, volle Data-Mesh-Konformität. Fehlt nur als **geführter
Flow** (Incident-Aktion „An Quelle beheben" mit Verifikations-Run und
Status-Rückmeldung). Aufwand ~1–2 PT, reine Workflow-/UI-Schicht.

### H3 — Korrektur-Overlay / Patch-Tabelle (`DQ_PATCH_<OBJ>`) · **Ausbaustufe**

Steward-Overrides, die **Reloads überleben**: Patch-Tabelle im Signal-Schema
(PK + korrigierte Spalten + Gültigkeit + Audit), Konsumenten lesen
`V_DQ_HEALED_<OBJ>` = Quelle `LEFT JOIN` Patch (`COALESCE` je Spalte).
Quelle unberührt, Korrektur reversibel und pro Feld auditierbar; dieselbe
View-Adoptions-Frage wie `DQ_CLEAN` (Variante A) — Konsumenten müssen auf die
View zeigen. Richtig für **wiederkehrende, bekannte Quellfehler**, deren
Behebung an der Quelle dauert. Aufwand ~4–6 PT (DDL-Generator, Patch-API
`owner+`, Kollisionsregel Patch × neue Lieferung, TTL/Review-Pflicht).

### H4 — Geführter Reprocess (Wiedereinspeisung) · **nachgelagert**

Korrigierte Zeilen aus H1 per `INSERT … SELECT` in den Ziel-Flow zurückführen
(Task-Chain-Vorlage, Slice ⑦), Episode → `resolved (reprocessed)` — der bereits
vorhandene `confirm-reprocess`-Übergang bekommt damit seinen technischen
Unterbau. Hängt an Task-Chain-Vorlagen + Live-Verifikation (Spikes O5/O6).

### H5 — Regel-Healing als expliziter Triage-Ausgang · **kein Neubau**

Proposals + Backtest existieren. Fehlend ist nur die Verdrahtung: im
Incident-Drawer der Ausgang „False Positive → Schwelle prüfen" (Deep-Link in
Workbench/Backtest, Resolve-Kategorie `false_positive`). Liefert nebenbei die
False-Positive-Quote je Garantie als Kalibrier-Feedback. Aufwand <1 PT.

---

## 4 / Bewertung

| Option | Quelle bleibt wahr? | Überlebt Reload | Audit | G8-Belastung | Abhängigkeiten | Aufwand |
|---|---|---|---|---|---|---|
| H1 Parkbucht-Korrektur | ja (Signal-Schema) | ✗ (episodisch) | über Prozedur erzwungen | keine (Korrektur in HANA) | Slices ④–⑤ ✅, Live-Spikes 🧪 | ~3–4 PT |
| H2 Fix-at-Source | ja (Quelle wird korrigiert) | ✓ | Quellsystem + Incident-Events | keine | — | ~1–2 PT |
| H3 Patch-Overlay | ja (Overlay) | ✓ | Patch-Tabelle, pro Feld | keine | View-Adoption | ~4–6 PT |
| H4 Reprocess | ja | ✓ (nach Einspeisung) | Episode-Events | keine | Slice ⑦, O5/O6 | mit ⑦ |
| H5 Regel-Ausgang | ja | ✓ | Incident/Proposal | keine | Backtest ✅ | <1 PT |

---

## 4b / Umsetzungsstand (2026-08)

**H1 und H3 sind gebaut** — die Empfehlung aus §5 ist damit für die ersten
beiden Stufen eingelöst:

| Baustein | Umsetzung |
|---|---|
| H1 Korrektur | `dq_core/enforce/healing.py` (`correction_statement`, Schattenspalte `_DQ_ORIGINAL`, Stempel `_DQ_CORRECTED_*`), Prozedur-Tür `P_DQ_CORRECT_ROW` im Soll-Zustand, Audit `DQ_HEAL_LOG` (remote-003) |
| H1 Re-Check | `recheck_statement` gegen dasselbe Bad-Prädikat; `GET/POST /api/healing/episodes/{id}/recheck` |
| Heal→Re-Check→Release | Freigabe-Guard in `routers/quarantine.py`: offene Verstöße blocken die Freigabe (409), **sobald** an der Episode korrigiert wurde |
| Vier-Augen | Contract-Kinds: Korrigierender ≠ Freigebender (409), `internal_gate` bleibt frei |
| H3 Overlay | `PatchSpec`, `patch_table_ddl`, `healed_view_ddl` (LEFT JOIN + `COALESCE` je Spalte, Gültigkeitsfenster), Patch-CRUD im Store (store-019) |
| Oberfläche | Healing-Workbench `/healing` (Episoden-Tab H1, Patch-Tab H3), rollen-gespiegelt (Korrektur steward+, Patch owner+) |

**Bewusst so umgesetzt:** Der Result-Store ist die Wahrheit, die
HANA-Materialisierung ist opt-in (`ENFORCEMENT_MATERIALIZE_ENABLED`) und wird je
Eintrag über `applied` ausgewiesen — ein nicht projizierter Eintrag ist sichtbar,
nicht stillschweigend verschwunden (G6). G8 bleibt unangetastet: die Workbench
zeigt **keine** Rohzeilen, der Nutzer benennt Zeilenschlüssel und Zielwert.

**Verifikation offen (🧪):** Der `hdbcli`-Pfad ist hier nicht ausführbar —
`P_DQ_CORRECT_ROW`, Re-Check und Healed-View gehören in dieselben Live-Spikes
wie die übrige Materialisierung (O5/O6), siehe `OPEN_TASKS` **R4**.

---

## 5 / Empfehlung & Ausbaupfad

1. **Haltung:** H2 ist der Default — manuelles Daten-Healing ist die begründete
   Ausnahme, nie der Normalweg. H5 sofort verdrahten (billigster Baustein,
   verhindert Daten-Flickerei bei Regelfehlern).
2. **Erste gebaute Stufe: H1** — weil `DQ_Q_<OBJ>` schon existiert und der
   Vorschlag des Nutzers damit ohne neue Architektur umsetzbar ist. Verbindlich:
   Prozedur-Tür statt Tabellen-Grant, Episode-Re-Check vor Release, Vier-Augen
   bei Contract-Kinds, Korrektur-Historie im Quarantäne-Drawer.
3. **H3 als Ausbaustufe**, sobald ein realer Tenant wiederkehrende Quellfehler
   zeigt, deren Behebung an der Quelle dauert.
4. **H4 mit Slice ⑦** (Task-Chain-Vorlagen), nicht früher.

## 6 / Offene Entscheidungen

- **Rollen:** Korrigieren `owner+` oder `steward+`? Vorschlag: `steward+`
  korrigiert, `owner+` gibt frei (Vier-Augen implizit bei Contract-Kinds).
- **Cockpit-Zeilen-Editor** (hinter G8-Gate) vs. DB-only-Korrektur mit
  Cockpit-Anzeige — Vorschlag: zunächst DB-only, Editor erst bei Kundenbedarf.
- **Vorher-Werte:** JSON-Schattenspalte (`_DQ_ORIGINAL`) vs. History-Tabelle —
  Vorschlag: JSON in der Zeile (einfach), History-Tabelle erst mit H3.
- **Patch-Verfall (H3):** TTL/Review-Pflicht, Kollisionsregel bei neuer
  Quell-Lieferung (Patch gewinnt? Lieferung gewinnt + Re-Open?).
- **Live-Verifikation:** `P_DQ_CORRECT_ROW`/Re-Check gegen echten Tenant gehört
  in dieselben Spikes wie die übrige Materialisierung (O5/O6).

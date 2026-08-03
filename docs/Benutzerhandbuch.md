# Signal — Benutzerhandbuch

**Stand:** 2026-08-03 · **Status:** Gliederung (Kapitelinhalte folgen) · **Komponente:** Data Quality & Observability Cockpit für SAP Datasphere

Dieses Handbuch beschreibt Signal **aus Anwendersicht**: was die Screens zeigen,
welche Entscheidung hinter jedem Zustand steht und wie die wiederkehrenden
Arbeitsabläufe funktionieren. Es ist aufgabenorientiert, nicht komponentenorientiert.

**Abgrenzung:** Die technische Referenz (Architektur, API, ENV, Store-Schema,
Gates, Deployment) bleibt [`Tooldokumentation.md`](Tooldokumentation.md). Wo dieses
Handbuch technische Tiefe braucht, verweist es dorthin, statt sie zu duplizieren.
Bei Widersprüchen gilt die Leseregel aus [`README.md`](README.md): der Code gewinnt.

---

## Zielgruppen & Lesepfade

| Wenn Sie … | Lesen Sie |
|---|---|
| **Konsument** sind (SAC-Report, Downstream-Modell) und wissen wollen, ob Sie den Daten trauen können | 1 → 3 → 5 → 9 → 20 |
| **Data Steward / Plattformteam** sind und Objekte onboarden und Garantien aufsetzen | 1 → 4 → 6 → 8 → 18 → 23 → 24 |
| **Data Product Owner** sind und eine versionierte Zusage verantworten | 3 → 10 → 18 → 19 → 25 → 26 |
| **Governance / Daten-Office** sind und Abdeckung und Policy steuern | 3 → 11 → 19 → 20 → 30 |
| **Betrieb** machen (Läufe, Zeitpläne, Störungen) | 12 → 13 → 14 → 15 → 17 → 28 → 33 |

---

## Inhaltsverzeichnis

### Teil A — Verstehen

**1. Was Signal ist — in fünf Minuten**
  1.1 Das Versprechen: aus Zusagen werden messbare Checks
  1.2 Was Signal *nicht* ist (kein ETL, kein Schreibzugriff auf Fachdaten, kein Katalog-Ersatz)
  1.3 Der Weg eines Datenobjekts durch das Tool (Überblicksgrafik)

**2. Grundbegriffe**
  2.1 Objekt, Produkt, Contract, Check, Run
  2.2 Garantie statt SQL — warum Contracts keine Abfragen enthalten
  2.3 Quality Gate vs. Contract (`kind`) — „Checks überall, Contracts nur an den Parteigrenzen"
  2.4 Severity: `warn | fail | critical`

**3. Die vier Zustands-Achsen**
  3.1 Lifecycle — `draft | active | deprecated`
  3.2 Compliance — `compliant | breached | unknown`
  3.3 Coverage — `covered | partial | gap | out_of_scope`
  3.4 Enforcement — `gate | quarantine | monitor`
  3.5 Warum die Achsen getrennt sind (typische Verwechslungen)

**4. Lite und Full — zwei Reifegrade**
  4.1 Wann Lite genügt, wann Full nötig ist
  4.2 Unterschiede im Alltag (Erstellung, Versionierung, Freigabe)
  4.3 Der Übergang Lite → Full: Ownership-Wechsel

**5. Rollen und Berechtigungen**
  5.1 `viewer | steward | owner | admin` — was jede Rolle darf
  5.2 Ownership (`owned_by`) und Owner-ACLs
  5.3 Warum Aktionen sichtbar, aber deaktiviert sind
  5.4 Rollenumschalter in der lokalen Entwicklungsumgebung

### Teil B — Bedienung: die Screens

**6. Orientierung im Cockpit**
  6.1 Navigationsleiste, Gruppen, rollenabhängige Einträge
  6.2 Kopfzeile: Environment, Rolle, Theme
  6.3 Wiederkehrende Bedienmuster (Filter, Tabellen, Panels, Tooltips)
  6.4 Tastatur und Barrierefreiheit

**7. Health — die Startseite**
  7.1 Was die Kennzahlen sagen
  7.2 Status-Grid: von der Kachel zum Objekt
  7.3 Erste Reaktion auf ein rotes Feld

**8. Meine Arbeit**
  8.1 Was Ihnen zugewiesen ist
  8.2 Die vier Aufmerksamkeits-Kacheln
  8.3 Contract-Breaches vs. Engineering-Signale

**9. Objekte — Katalog**
  9.1 Suchen, filtern, Spalten lesen
  9.2 Coverage- und Compliance-Badges in der Liste
  9.3 Massenaktionen und Sprünge in die Detailsicht

**10. Objekt-Detail**
  10.1 Kopfbereich: Identität, Owner, Zustand
  10.2 Gruppe *Qualität* — Checks
  10.3 Gruppe *Struktur & Schnittstelle* — Contract, Lineage
  10.4 Gruppe *Historie & Betrieb* — Runs, Zeitreihe, Zeitplan, Diff
  10.5 Aktionen: Lauf starten, Contract öffnen, Incident anlegen

**11. Produkte**
  11.1 Produktliste und Produkt-Status
  11.2 Produkt-Detail: Komposition, Ports, beteiligte Objekte
  11.3 Wie sich der Produktstatus aus den Objekten ergibt

**12. Lineage & Coverage**
  12.1 Die Karte lesen: Knoten, Kanten, Richtung
  12.2 Coverage-Sicht: Lücken finden
  12.3 Spalten-Lineage
  12.4 Navigation, Kamera, Inspektion

**13. Runs**
  13.1 Run-Detail: Ergebnisse je Check
  13.2 Gating-Zustände verstehen (`executed`, `skipped_stale`, `skipped_dependency`, `downgraded`, `error`)
  13.3 Run-Vergleich: was sich zwischen zwei Läufen geändert hat
  13.4 Diagnostics — wann Beispielzeilen sichtbar sind und wann nicht

**14. Incidents**
  14.1 Wie ein Incident entsteht
  14.2 Filter nach Status und `kind`
  14.3 Bearbeiten: zuweisen, kommentieren, schließen
  14.4 Automatische Wiederherstellung bei grünem Folgelauf

**15. Quarantäne**
  15.1 Was Quarantäne bedeutet — und was mit den Daten passiert
  15.2 Quarantäne-Sätze prüfen
  15.3 Healing: Freigabe, Verwerfen, erneute Prüfung

**16. Enforcement**
  16.1 Die drei Modi: `gate`, `quarantine`, `monitor`
  16.2 Plan → Probe → Apply
  16.3 Was in Datasphere tatsächlich materialisiert wird
  16.4 Rollenanforderungen und Sicherheitsnetze

**17. Zeitpläne**
  17.1 Läufe planen
  17.2 Externe Steuerung (Task-Chain, Cron) vs. interner Poller
  17.3 Überfällige und fehlgeschlagene Läufe erkennen

**18. Vorschläge**
  18.1 Woher datengetriebene Vorschläge kommen (Baselines, Mining)
  18.2 Vorschlag prüfen und übernehmen oder ablehnen
  18.3 Warum ein Vorschlag kein automatischer Contract ist

**19. Bibliothek**
  19.1 Der Check-Katalog
  19.2 Contract-Garantien vs. interne Checks
  19.3 Versionierung des Katalogs

**20. Checks — die Contract Workbench**
  20.1 Aufbau des Editors
  20.2 Lite-Modus: Garantien an/aus
  20.3 Full-Modus: feingranulare Regeln mit Inventar-Picker
  20.4 Validierung und Fehlermeldungen beim Speichern
  20.5 Zertifizieren (Lite) und Freigeben (Full)
  20.6 Breaking Changes und SemVer-Pflicht
  20.7 Was beim Speichern in Git passiert

**21. Compliance**
  21.1 Die Ampel und ihre Herleitung
  21.2 Coverage-Auswertung
  21.3 SLA-Fenster und Versionshistorie
  21.4 Export für externe Konsumenten (ODCS)

**22. Alerting**
  22.1 Kanäle einrichten
  22.2 Regeln: worauf Signal benachrichtigt
  22.3 Rauschen vermeiden

**23. Verbindungen**
  23.1 Environments anlegen und prüfen
  23.2 Schemabindung zur Laufzeit
  23.3 Verbindungstest und Fortschrittsanzeige
  23.4 Mock-Betrieb: wofür er gedacht ist

**24. Inventory (Administration)**
  24.1 Objekte extrahieren und aktualisieren
  24.2 Inventar- und Lineage-Snapshots
  24.3 Wann ein Extrakt nötig ist

**25. Einstellungen**
  25.1 Plattform-Einstellungen
  25.2 Betriebsmodus und Defaults
  25.3 Darstellung

### Teil C — Arbeitsabläufe von Anfang bis Ende

**26. Ein Objekt onboarden**
  Extrakt → Profiling ansehen → erste Garantien → erster Lauf → Coverage grün

**27. Die erste Zusage in Lite geben**
  Checkliste ausfüllen, Severity wählen, speichern und aktivieren

**28. Einen versionierten Contract in Full führen**
  Entwurf → Review → Freigabe → Veröffentlichung → Deprecation

**29. Eine Contract-Änderung durchbringen, die bricht**
  Diff verstehen, Major-Bump setzen, Konsumenten informieren

**30. Auf einen Breach reagieren**
  Incident triagieren → Ursache im Run finden → beheben → Recovery bestätigen

**31. Quarantäne betreiben**
  Modus setzen, Sätze sichten, heilen, Pipeline wieder öffnen

**32. Coverage-Lücken systematisch schließen**
  Lineage-Karte als Arbeitsvorrat, Priorisierung, Fortschritt messen

**33. Signal ohne Cockpit betreiben**
  `cli/dq_check_runner.py` in Task-Chain und Cron; Ergebnisse landen im selben Store

### Teil D — Referenz

**34. Garantie-Familien im Detail**
  Bedeutung, Parameter, resultierender Check und Standard-Severity je Familie
  (`schema`, `keys`, `referential`, `not_null`, `completeness`, `freshness`, `volume`)

**35. Zustands- und Badge-Referenz**
  Jeder Zustand, jede Farbe, jedes Symbol — mit der Frage, die es beantwortet

**36. Berechtigungsmatrix**
  Rolle × Ownership × Aktion, inklusive der serverseitig erzwungenen Regeln

**37. Meldungen und Fehlerdialoge**
  Was die häufigen Fehlermeldungen bedeuten und was zu tun ist

**38. Grenzen und bewusste Nicht-Ziele**
  Was Signal nicht prüft, was Diagnostics nie preisgeben, wo andere Werkzeuge zuständig sind

**39. Häufige Fragen**

**40. Glossar**
  Deutsch/Englisch, mit Verweis auf [`TOOLTIP_CATALOG.md`](TOOLTIP_CATALOG.md)

---

## Konventionen in diesem Handbuch

- **Fett** kennzeichnet Elemente der Oberfläche, `Monospace` technische Werte,
  Dateinamen und Zustände.
- Schritt-für-Schritt-Anleitungen sind nummeriert; jede beginnt mit der
  Voraussetzung (Rolle, Zustand des Objekts).
- Kästen mit **Rollenhinweis** nennen die nötige Berechtigung, bevor Sie eine
  Aktion versuchen.
- Kästen mit **Warum so?** erklären eine Design-Entscheidung, wenn die
  Oberfläche sonst willkürlich wirkt.

## Verwandte Dokumente

| Dokument | Wofür |
|---|---|
| [`Tooldokumentation.md`](Tooldokumentation.md) | Technische Vollreferenz (Architektur, API, ENV, CLI, Gates) |
| [`Betriebsmodi_Lite_und_Full.md`](Betriebsmodi_Lite_und_Full.md) | Prozess, Personas und Tooling der beiden Modi |
| [`Checks_Statuses_Flows.md`](Checks_Statuses_Flows.md) | Wie Signal über Objekte urteilt — Statusachsen und Flows |
| [`TOOLTIP_CATALOG.md`](TOOLTIP_CATALOG.md) | Begriffs- und Tooltipkatalog des Cockpits |
| [`README.md`](README.md) | Index aller Dokumente mit Status |

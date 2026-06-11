-- R4-1: Incident-Lifecycle. Ein Incident je product+breach-Episode (nicht je
-- Check-Fail — Sifflet-Gruppierungs-Lektion). Erzeugung beim Uebergang nach
-- breached, Aufloesung bei Auto-Recovery (compliant). Hinweis: keine Semikola
-- in Kommentaren (der Migration-Runner splittet naiv auf Semikolon).
CREATE TABLE IF NOT EXISTS dq_incidents (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  run_id TEXT DEFAULT '',
  check_name TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'fail',     -- warn | fail | critical
  status TEXT NOT NULL DEFAULT 'open',        -- open | acknowledged | investigating | resolved
  owner TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  opened_at TEXT NOT NULL,
  resolved_at TEXT DEFAULT ''
);

-- Höchstens ein offener (nicht-resolved) Incident je Produkt → Episode-Gruppierung.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dq_incidents_one_open
  ON dq_incidents(product) WHERE status != 'resolved';

-- Timeline: wer, was, wann (ISO-8601).
CREATE TABLE IF NOT EXISTS dq_incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- opened | acknowledged | investigating | resolved | assigned | comment
  actor TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dq_incident_events_incident
  ON dq_incident_events(incident_id);

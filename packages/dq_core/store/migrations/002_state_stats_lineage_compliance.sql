CREATE TABLE IF NOT EXISTS dq_check_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  n INTEGER,
  min_v REAL,
  max_v REAL,
  p01 REAL,
  p99 REAL,
  mean_v REAL,
  stddev_v REAL
);

CREATE TABLE IF NOT EXISTS dq_baselines (
  dataset TEXT NOT NULL,
  metric TEXT NOT NULL,
  n INTEGER,
  mean_v REAL,
  stddev_v REAL,
  p01 REAL,
  p99 REAL,
  mad REAL,
  updated_at TEXT,
  warmup_remaining INTEGER DEFAULT 0,
  PRIMARY KEY (dataset, metric)
);

CREATE TABLE IF NOT EXISTS dq_proposals (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  guarantee_patch TEXT NOT NULL,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS dq_compliance (
  product TEXT PRIMARY KEY,
  contract_version TEXT,
  compliance TEXT NOT NULL DEFAULT 'unknown',
  since TEXT,
  last_run_id TEXT
);

CREATE TABLE IF NOT EXISTS contract_index (
  product TEXT PRIMARY KEY,
  lifecycle TEXT,
  owned_by TEXT,
  version TEXT,
  head_hash TEXT,
  updated_at TEXT
);

-- Note: the migration runner in Python handles SQLite's lack of IF NOT EXISTS
-- for ALTER TABLE by catching sqlite3.OperationalError with "duplicate column name".
ALTER TABLE dq_runs ADD COLUMN contract_version TEXT DEFAULT '';
ALTER TABLE dq_runs ADD COLUMN contract_hash TEXT DEFAULT '';
ALTER TABLE dq_runs ADD COLUMN actor TEXT DEFAULT '';
ALTER TABLE dq_runs ADD COLUMN run_state TEXT NOT NULL DEFAULT 'finished';
ALTER TABLE dq_check_results ADD COLUMN state TEXT NOT NULL DEFAULT 'executed';

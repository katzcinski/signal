CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dq_runs (
  run_id TEXT PRIMARY KEY,
  dataset TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  overall_status TEXT,
  total_checks INTEGER DEFAULT 0,
  passed_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  warning_checks INTEGER DEFAULT 0,
  triggered_by TEXT DEFAULT '',
  contract_version TEXT DEFAULT '',
  contract_hash TEXT DEFAULT '',
  actor TEXT DEFAULT '',
  run_state TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS dq_check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  sql_text TEXT,
  expect_expr TEXT,
  severity TEXT,
  passed INTEGER,
  actual_value TEXT,
  error_message TEXT,
  duration_ms REAL,
  state TEXT NOT NULL DEFAULT 'executed',
  FOREIGN KEY (run_id) REFERENCES dq_runs(run_id)
);

CREATE TABLE IF NOT EXISTS dq_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  row_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dq_run_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  line TEXT NOT NULL
);

export type Family = 'observability' | 'quality' | 'contract';
export type Lifecycle = 'draft' | 'active' | 'deprecated';
export type Severity = 'critical' | 'fail' | 'warn';
export type OverallStatus = 'pass' | 'fail' | 'warn' | 'critical' | 'unknown';
export type RunState = 'running' | 'finished' | 'failed';
export type CovFlag = 'covered' | 'partial' | 'gap' | 'out_of_scope';

// ---- Inventory ----
export interface InventoryObject {
  id: string;
  name: string;
  display_name: string;
  space: string;
  schema: string;
  layer: 'source' | 'transformation' | 'consumption';
  family: Family;
  lifecycle: Lifecycle;
  owned_by: 'platform' | 'product';
  owners: string[];
  description?: string;
}

// ---- Objects (API enriched) ----
export interface ObjectSummary extends InventoryObject {
  overall_status?: OverallStatus;
  cov_flag?: CovFlag;
  check_count?: number;
  last_run_at?: string;
  last_run_id?: string;
  contract_version?: string;
  has_contract?: boolean;
}

// ---- Check Library ----
export interface CheckDef {
  id: string;
  name: string;
  description: string;
  category: string;
  family: Family;
  template_sql?: string;
  parameters?: Record<string, unknown>;
}

export interface CheckLibrary {
  checks: CheckDef[];
  categories: string[];
}

// ---- Runs ----
export interface CheckResult {
  name: string;
  sql: string;
  expect: string;
  severity: Severity;
  passed: boolean;
  actual_value?: string;
  error?: string;
  duration_ms: number;
  state: string;
}

export interface RunSummary {
  run_id: string;
  dataset: string;
  schema_name: string;
  started_at: string;
  finished_at: string;
  overall_status: OverallStatus;
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  triggered_by: string;
  contract_version: string;
  actor: string;
  run_state: RunState;
  results: CheckResult[];
}

export interface RunListItem {
  run_id: string;
  dataset: string;
  started_at: string;
  finished_at: string;
  overall_status: OverallStatus;
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  run_state: RunState;
  triggered_by: string;
}

// ---- Contracts ----
export interface ContractGuarantees {
  keys?: Array<{ columns: string[]; unique?: boolean }>;
  not_null?: Array<{ columns: string[] }>;
  row_count?: { min?: number; max?: number };
  freshness?: { column: string; max_age_hours: number };
  schema_columns?: { expected: string[] };
  [key: string]: unknown;
}

export interface Contract {
  product: string;
  dataset: string;
  schema?: string;
  owned_by: string;
  lifecycle: Lifecycle;
  version: string;
  description?: string;
  guarantees?: ContractGuarantees;
}

// ---- Lineage ----
export interface LineageNode {
  id: string;
  label: string;
  layer: number;
  family: Family;
  space: string;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

// ---- Incidents ----
export interface Incident {
  id: string;
  dataset: string;
  check_name: string;
  severity: Severity;
  actual_value?: string;
  expected: string;
  started_at: string;
  run_id: string;
}

// ---- Proposals ----
export interface ProposalStats {
  n: number;
  min: number;
  max: number;
  mean: number;
  p01: number;
  p99: number;
  stddev: number;
}

export interface Proposal {
  id: string;
  product: string;
  check_name: string;
  current_expect: string;
  proposed_expect: string;
  rationale: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected' | 'snoozed';
  stats?: ProposalStats;
}

// ---- SSE Events ----
export type SSEEvent =
  | { type: 'run_started'; run_id: string; dataset: string }
  | { type: 'check_result'; run_id: string; result: CheckResult }
  | { type: 'run_finished'; run_id: string; summary: RunSummary };

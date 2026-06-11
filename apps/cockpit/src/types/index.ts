export type Family = 'observability' | 'quality' | 'contract';
export type Lifecycle = 'draft' | 'active' | 'deprecated';
export type Severity = 'critical' | 'fail' | 'warn';
export type OverallStatus = 'pass' | 'fail' | 'warn' | 'critical' | 'unknown';
export type RunState = 'running' | 'finished' | 'error';
export type CovFlag = 'covered' | 'partial' | 'gap' | 'out_of_scope';
// G6 gating states: anything other than 'executed' must NOT render as pass/fail.
export type CheckState = 'executed' | 'skipped_stale' | 'skipped_dependency' | 'downgraded' | 'error';

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

// ---- Objects (API enriched) — mirrors backend ObjectOut ----
export interface FamilyStatus {
  status: OverallStatus;
  passed: number;
  total: number;
}

export interface ObjectSummary {
  id: string;
  name: string;
  schema_name: string;
  family: Family;
  layer: string;
  status: OverallStatus;
  contract_status: string;        // '' | draft | active | deprecated
  cov_flag: CovFlag;              // covered | partial | gap | out_of_scope
  check_count: number;
  owned_by: string;
  last_run?: string | null;
  last_run_id?: string | null;
  space: string;
  // R3-2: per-family status map (family is an attribute of checks).
  families?: Partial<Record<Family, FamilyStatus>>;
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
  state: CheckState;
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

// ---- Contracts (guarantee families, §1.5) ----
export interface SchemaGuarantee { columns: string[]; mode: 'open' | 'closed' }
export interface KeyGuarantee { columns: string[]; unique: boolean; severity: Severity }
export interface RefGuarantee { fk: string[]; parent: string; parent_key: string[]; severity: Severity }
export interface FreshnessGuarantee { column: string; max_age: string; severity: Severity }
export interface VolumeGuarantee { min_rows?: number; baseline?: string; bounds?: string; severity: Severity }
export interface CompletenessGuarantee { column: string; min_pct: number; severity: Severity }
export interface NotNullGuarantee { columns: string[]; severity: Severity }

export interface ContractGuarantees {
  schema?: SchemaGuarantee;
  keys?: KeyGuarantee[];
  referential?: RefGuarantee[];
  freshness?: FreshnessGuarantee;
  volume?: VolumeGuarantee;
  completeness?: CompletenessGuarantee[];
  not_null?: NotNullGuarantee[];
  [key: string]: unknown;
}

export interface Contract {
  product: string;
  dataset: string;
  schema?: string;
  owned_by: string;
  owners?: string[];
  lifecycle: Lifecycle;
  version: string;
  description?: string;
  guarantees?: ContractGuarantees;
}

export interface ContractOut extends Contract {
  compliance?: string | null;
  updated_at?: string;
}

// ---- Lineage ----
export interface LineageNode {
  id: string;
  label: string;
  layer: number;
  family: Family;
  space: string;
  // Coverage annotation fields (from /api/lineage)
  coverage_flag?: '●' | '◐' | '▲' | '○';
  dq_status?: string;
  has_contract?: boolean;
  last_run?: string;
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
  extract_age?: string;
}

// ---- Incidents (R4-1 lifecycle) ----
export type IncidentStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved';

export interface Incident {
  id: string;
  product: string;
  run_id: string;
  check_name: string;
  severity: Severity;
  status: IncidentStatus;
  owner: string;
  summary: string;
  opened_at: string;
  resolved_at: string;
}

export interface IncidentEvent {
  kind: string;          // opened | acknowledged | investigating | resolved | assigned | comment
  actor: string;
  detail: string;
  at: string;
}

export interface IncidentDetail extends Incident {
  events: IncidentEvent[];
}

// ---- Coverage (R4-4) ----
export interface CoverageSummary {
  total_objects: number;
  objects_with_contract: number;
  objects_with_checks: number;
  pct_with_contract: number;
  pct_with_checks: number;
  stale_objects: string[];
  stale_threshold_days: number;
  unvalidated: Array<{ object: string; layer: string; space: string }>;
}

// ---- SLA over time (R4-3) ----
export interface SlaSummary {
  product: string;
  window_days: number;
  uptime_pct: number;
  breached_seconds: number;
  current_state: string;
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
  status: 'open' | 'accepted' | 'rejected' | 'snoozed';
  stats?: ProposalStats;
}

// ---- Run progress events (polled via /api/runs/{id}/events) ----
export interface RunEvent {
  ts: string;
  line: string;
}

// ---- SSE Events ----
export type SSEEvent =
  | { type: 'connected' }
  | { type: 'run_started'; run_id: string; dataset: string }
  | { type: 'progress'; run_id: string; ts: string; line: string }
  | { type: 'run_finished'; run_id: string; overall_status: OverallStatus }
  | { type: 'run_error'; run_id: string; error: string };

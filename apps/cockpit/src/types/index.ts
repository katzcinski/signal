export type Family = 'observability' | 'quality' | 'contract';

// ---- Datasphere data loads ----
export interface DataLoad {
  object_id: string;
  load_type: 'task_chain' | 'replication_flow' | string;
  run_id: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  triggered_by: string | null;
  raw: Record<string, unknown>;
}
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

// ---- Inventory picker source (GET /api/inventory) ----
export interface InventoryColumn {
  name: string;
  [key: string]: unknown;
}

export interface InventoryDataset {
  id?: string;
  technicalName?: string;
  name?: string;
  schema?: string;
  columns?: InventoryColumn[];
  [key: string]: unknown;
}

export interface InventoryResponse {
  datasets: InventoryDataset[];
}

// ---- Environments (GET /api/environments) ----
export interface Environment {
  name: string;
  schema: string;
}

export interface EnvironmentsResponse {
  environments: Environment[];
}

// ---- Per-family status rollup ----
export interface FamilyStatus {
  observability: string; // pass|warn|fail|critical|error|unknown
  quality: string;       // pass|warn|fail|critical|error|unknown
}

// ---- Objects (API enriched) — mirrors backend ObjectOut ----
export interface ObjectSummary {
  id: string;
  name: string;
  schema_name: string;
  family: Family;
  layer: string;
  status: OverallStatus;
  family_status?: FamilyStatus;
  contract_status: string;        // '' | draft | active | deprecated
  cov_flag: CovFlag;              // covered | partial | gap | out_of_scope
  check_count: number;
  owned_by: string;
  last_run?: string | null;
  last_run_id?: string | null;
  space: string;
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

// ---- Check history (GET /api/objects/{id}/checks/{name}/history) ----
export interface CheckHistoryPoint {
  actual_value: string | null;
  passed: 0 | 1;
  state: string;
  started_at: string;
  run_id: string;
}

// ---- Contracts: canonical guarantee schema (§1.5) ----
export interface GuaranteeSchema {
  columns: string[];
  mode: 'closed' | 'open';
  severity?: Severity;
}

export interface GuaranteeKey {
  columns: string[];
  unique: boolean;
  severity?: Severity;
  proposed?: boolean;
}

export interface GuaranteeReferential {
  fk: string[];          // single-column in v1
  parent: string;
  parent_key: string[];  // single-column in v1
  severity?: Severity;
}

export interface GuaranteeFreshness {
  column: string;
  max_age: string; // ISO-8601 duration, e.g. PT24H
  severity?: Severity;
}

export interface GuaranteeVolume {
  min_rows?: number;
  baseline?: 'rolling';
  bounds?: 'auto';
  severity?: Severity;
}

export interface GuaranteeCompleteness {
  column: string;
  min_pct: number;
  severity?: Severity;
}

export interface GuaranteeNotNull {
  columns: string[];
  severity?: Severity;
}

export interface ContractGuarantees {
  schema?: GuaranteeSchema;
  keys?: GuaranteeKey[];
  referential?: GuaranteeReferential[];
  freshness?: GuaranteeFreshness;
  volume?: GuaranteeVolume;
  completeness?: GuaranteeCompleteness[];
  not_null?: GuaranteeNotNull[];
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

// PUT body has NO lifecycle field (server forces draft).
export interface ContractPutBody {
  product: string;
  dataset: string;
  owned_by: string;
  owners?: string[];
  version: string;
  description?: string;
  guarantees?: ContractGuarantees;
}

// ---- Breaking-diff (POST /api/contracts/{product}/diff) ----
export interface DiffEntry {
  kind: string;
  path: string;
  old?: unknown;
  new?: unknown;
  breaking?: boolean;
}

export interface DiffReport {
  breaking?: boolean;
  entries?: DiffEntry[];
  active_version?: string;
  [key: string]: unknown;
}

// ---- SLA (GET /api/contracts/{product}/sla) ----
export interface SlaResponse {
  product: string;
  current: string;
  windows: { '7d': number | null; '30d': number | null; '90d': number | null };
}

// ---- Coverage (GET /api/coverage/summary) ----
export interface CoverageSummary {
  objects_total: number;
  with_active_contract: number;
  with_checks: number;
  contract_coverage_pct: number;
  unvalidated_30d: string[];
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
  extract_age?: number | null;
  extracted_at?: string | null;
  stale?: boolean;
}

// ---- Incidents: persistent lifecycle objects ----
export type IncidentStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved';

export interface Incident {
  id: number;
  product: string;
  run_id: string;
  severity: string;
  status: IncidentStatus;
  owner: string;
  title: string;
  failed_checks: string[];
  opened_at: string;
  resolved_at: string | null;
  contract_version: string;
}

export interface IncidentEvent {
  id: number;
  at: string;
  actor: string;
  action: string;
  note: string;
}

export interface IncidentDetail extends Incident {
  events: IncidentEvent[];
}

export interface IncidentTransitionBody {
  status: string;
  owner?: string;
  note?: string;
}

// ---- Derived failing-checks view (GET /api/incidents/checks) ----
export interface FailedCheck {
  id: string;                    // "<run_id>:<check_name>" (backend-provided)
  check_name: string;
  dataset: string;
  severity: Severity;
  expect_expr: string;
  actual_value?: string;
  error_message?: string;
  state: CheckState;
  run_id: string;
  started_at: string;
  schema_name: string;
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

// ---- Run progress events (streamed via SSE, polled as fallback) ----
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

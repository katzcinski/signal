export type Family = 'observability' | 'quality' | 'contract';
export type ArtifactKind = 'internal_gate' | 'consumer_contract' | 'provider_contract';

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
// Param binding type — drives both the builder input and the compiler's
// escaping. 'expr' params are raw SQL fragments with no GUI path (deferred §5).
export type CheckParamType = 'identifier' | 'number' | 'string' | 'regex' | 'value_list' | 'expr';

export interface CheckTemplateParam {
  token: string;
  type?: CheckParamType;
  label: string;
  hint?: string;
}

// Functional axis: which family a check's result rolls up into (obs/quality).
export type CheckFamily = 'observability' | 'quality';
// Execution axis: role in the gating chain (cheap gates gate expensive checks).
export type CheckGating = 'gate' | 'expensive' | 'standard';

export interface CheckDef {
  id: string;
  label: string;
  short: string;
  help: string;
  example?: string;
  category: string;
  family: CheckFamily;
  gating: CheckGating;
  sql_template: string;
  params: CheckTemplateParam[];
  default_expect: string;
  default_severity: Severity;
  unit: string;
}

export interface CheckLibrary {
  checks: CheckDef[];
  categories: string[];
  families: CheckFamily[];
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

// ---- Run comparison / regression diff (GET /api/runs/compare) — UX-N5 ----
export type CheckCompareStatus = 'pass' | 'fail' | 'warn' | 'error' | 'skipped';
export type CheckTransition =
  | 'regressed' | 'recovered' | 'unchanged' | 'changed' | 'added' | 'removed';

export interface RunCompareHeader {
  run_id: string;
  dataset: string;
  started_at: string;
  finished_at: string;
  overall_status: OverallStatus;
  total: number;
  passed: number;
  failed: number;
  warnings: number;
}

export interface CheckChange {
  check_name: string;
  base_status: CheckCompareStatus | null;
  head_status: CheckCompareStatus | null;
  transition: CheckTransition;
}

export interface RunCompare {
  base: RunCompareHeader;
  head: RunCompareHeader;
  summary: Record<CheckTransition, number>;
  changes: CheckChange[];
}

// ---- Contract version diff (GET /api/contracts/{product}/version-diff) — UX-N13 ----
export interface VersionDiffEntry {
  kind: string;
  path: string;
  old?: unknown;
  new?: unknown;
  breaking: boolean;
}

export interface ContractVersionDiff {
  available: boolean;
  kind?: ArtifactKind;
  ceremony_required?: boolean;
  from_version: string | null;
  to_version: string;
  lifecycle?: Lifecycle;
  breaking: boolean;
  blocking?: boolean;
  entries: VersionDiffEntry[];
}

// ---- Activity / audit feed (GET /api/activity) — UX-N15 ----
export interface ActivityItem {
  kind: 'incident' | 'proposal' | 'contract';
  action: string;
  actor: string;
  at: string;
  product: string;
  summary: string;
  ref: string;
}

// ---- Check history (GET /api/objects/{id}/checks/{name}/history) ----
export interface CheckHistoryPoint {
  actual_value: string | null;
  passed: 0 | 1;
  state: string;
  started_at: string;
  run_id: string;
}

// ---- Metric time-series (GET /api/objects/{id}/timeseries) — UX-N1 ----
export interface MetricPoint {
  at: string;
  value: number | null;
  raw: string | null;
  passed: boolean;
  state: string;
  run_id: string;
  anomaly: boolean;
}

export interface MetricBaseline {
  mean: number;
  lower: number;
  upper: number;
  p01: number | null;
  p99: number | null;
}

export type MetricFamily = 'freshness' | 'volume' | 'observability';

export interface MetricSeries {
  check_name: string;
  check_type: string;
  metric: MetricFamily;
  baseline: MetricBaseline | null;
  points: MetricPoint[];
}

export interface ObjectTimeseries {
  dataset: string;
  series: MetricSeries[];
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

// A library-instantiated check on an internal gate (HANDOVER Iteration 1).
// params values are strings for scalar types, string[] for value_list.
export interface GateCheck {
  id: string;
  params: Record<string, string | string[]>;
  expect: string;
  severity: Severity;
}

export interface Contract {
  product: string;
  kind: ArtifactKind;
  dataset: string;
  schema?: string;
  owned_by: string;
  owners?: string[];
  lifecycle: Lifecycle;
  version: string;
  description?: string;
  guarantees?: ContractGuarantees;
  checks?: GateCheck[];
}

export interface ContractOut extends Contract {
  compliance?: string | null;
  certified?: boolean;
  updated_at?: string;
}

// PUT body has NO lifecycle field (server forces draft).
export interface ContractPutBody {
  product: string;
  kind: ArtifactKind;
  dataset: string;
  owned_by: string;
  owners?: string[];
  version: string;
  description?: string;
  guarantees?: ContractGuarantees;
  checks?: GateCheck[];
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
  kind?: ArtifactKind;
  ceremony_required?: boolean;
  breaking?: boolean;
  blocking?: boolean;
  entries?: DiffEntry[];
  active_version?: string;
  [key: string]: unknown;
}

// ---- SLA (GET /api/contracts/{product}/sla) ----
export interface SlaResponse {
  product: string;
  kind: ArtifactKind;
  current: string;
  windows: { '7d': number | null; '30d': number | null; '90d': number | null };
}

// ---- Coverage (GET /api/coverage/summary) ----
export interface CoverageSummary {
  objects_total: number;
  with_active_contract: number;
  with_internal_gate: number;
  with_contract_checks: number;
  contracts_breached: number;
  gates_failing: number;
  with_checks: number;
  contract_coverage_pct: number;
  unvalidated_30d: string[];
}

// ---- Health trend (GET /api/coverage/health) — UX-N12 ----
export interface HealthTrend {
  current_pct: number | null;
  previous_pct: number | null;
  datasets: number;
}

// ---- Status heatmap (GET /api/coverage/heatmap) — UX-N10 ----
export interface StatusHeatmap {
  days: string[];
  datasets: string[];
  matrix: Record<string, Record<string, string>>; // dataset → (day → status)
}

// ---- Notification routing (UX-N2) ----
export type ChannelType = 'slack' | 'teams' | 'webhook';

export interface NotificationChannel {
  id: number;
  name: string;
  type: ChannelType | string;
  url: string;
  enabled: boolean;
  created_at: string;
  created_by: string;
}

export interface NotificationRule {
  id: number;
  name: string;
  channel_id: number;
  match_severity: string;   // '' | critical | fail | warn
  match_space: string;
  match_product: string;
  match_owned_by: string;   // '' | platform | product
  match_owner: string;
  match_kind: string;
  enabled: boolean;
  created_at: string;
  created_by: string;
}

export interface NotificationMute {
  id: number;
  reason: string;
  match_space: string;
  match_product: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  created_by: string;
}

export interface NotificationConfig {
  channels: NotificationChannel[];
  rules: NotificationRule[];
  mutes: NotificationMute[];
  can_edit: boolean;
}

// ---- Lineage ----
export interface LineageColumn {
  name?: string;
  label?: string;
  data_type?: string;
  type?: string;
  [key: string]: unknown;
}

export interface LineageNode {
  id: string;
  label?: string;
  layer: string;
  layerCode?: string;
  role?: string;
  confidence?: number;
  columns?: LineageColumn[];
  family?: Family | string;
  space?: string;
  // Coverage annotation fields (from /api/lineage)
  coverage_flag?: '●' | '◐' | '▲' | '○';
  dq_status?: string;
  has_contract?: boolean;
  has_internal_gate?: boolean;
  has_boundary_contract?: boolean;
  kind?: ArtifactKind | '';
  last_run?: string;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  edgeType?: string;
  confidence?: number;
  expression?: string;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  extract_age?: number | null;
  extracted_at?: string | null;
  stale?: boolean;
}

export type ColumnEdgeType = 'direct' | 'computed' | 'passthrough' | string;

export interface ColumnLineageStep {
  object: string;
  column: string;
  edgeType: ColumnEdgeType;
  expression?: string;
}

export interface ColumnLineageEntry {
  upstream: ColumnLineageStep[];
  downstream: ColumnLineageStep[];
}

export interface ColumnLineageObjectResponse {
  object: string;
  columns: Record<string, ColumnLineageEntry>;
}

export interface ColumnLineageColumnResponse {
  object: string;
  column: string;
  lineage: ColumnLineageEntry;
}

export type ColumnLineageResponse = ColumnLineageObjectResponse | ColumnLineageColumnResponse;

// ---- Object profiling (POST /api/objects/{id}/profile) ----
export interface ObjectProfileColumn {
  column: string;
  data_type: string;
  total: number;
  nulls: number;
  null_pct: number;
  distinct: number;
  uniqueness_pct: number;
  pk_candidate: boolean;
  text_like?: boolean;
  numeric_like?: boolean;
  decimal_like?: boolean;
  empty_count?: number | null;
  empty_pct?: number | null;
  min?: number | string | null;
  max?: number | string | null;
  avg?: number | string | null;
  median?: number | string | null;
}

export interface ProfileSingleCandidate {
  column: string;
  data_type?: string;
  exact?: boolean;
  nulls?: number;
  null_pct?: number;
  empty_count?: number | null;
  empty_pct?: number | null;
  distinct?: number;
  uniqueness_pct?: number;
  rank_reason?: string;
  technical_score?: number;
  business_score?: number;
  final_score?: number;
  reasons?: string[];
}

export interface ProfileCompositeCandidate {
  columns: string[];
  width?: number;
  exact?: boolean;
  distinct?: number;
  uniqueness_pct?: number;
  rank_reason?: string;
  technical_score?: number;
  business_score?: number;
  final_score?: number;
  reasons?: string[];
}

export interface ProfileSearchMeta {
  max_width?: number;
  eligible_columns?: number;
  eligible_column_names?: string[];
  full_search_skipped?: boolean;
  skip_reason?: string;
  heuristic_combo_count?: number;
}

export interface ProfileKeyCandidates {
  single?: string[];
  composite?: string[][];
  ranked_single?: ProfileSingleCandidate[];
  ranked_composite?: ProfileCompositeCandidate[];
  search_meta?: ProfileSearchMeta;
}

export interface ProfileScores {
  overall_key_confidence?: number;
  uniqueness?: number;
  completeness?: number;
  business_fit?: number;
  compound_viability?: number;
  weights?: Record<string, number>;
}

export interface ProfileIssue {
  column: string;
  type: string;
  detail: string;
}

export interface ProfileDerivedStats {
  empty_string_columns?: { column: string; empty_count: number; empty_pct: number }[];
  numeric_stats?: { column: string; min?: unknown; max?: unknown; avg?: unknown; median?: unknown }[];
}

export interface ObjectProfileResult {
  schema: string;
  table: string;
  view?: string;
  row_count: number;
  column_count: number;
  columns: ObjectProfileColumn[];
  pk_candidates: ProfileKeyCandidates;
  profiling?: ProfileDerivedStats;
  issues?: ProfileIssue[];
  scores?: ProfileScores;
  heuristics?: Record<string, unknown>;
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
  kind: ArtifactKind;
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
  kind: ArtifactKind;
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

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const api = {
  getObjects: () => request<ObjectStatus[]>('/objects'),
  getObject: (name: string) => request<RunDetail>(`/objects/${encodeURIComponent(name)}`),
  getCheckHistory: (name: string, check: string, limit = 30) =>
    request<HistoryPoint[]>(`/objects/${encodeURIComponent(name)}/checks/${encodeURIComponent(check)}/history?limit=${limit}`),

  listRuns: (limit = 50) => request<Run[]>(`/runs?limit=${limit}`),
  getRun: (id: string) => request<RunDetail>(`/runs/${id}`),
  triggerRun: (body: TriggerRunRequest) =>
    request<TriggerRunResponse>('/runs', { method: 'POST', body: JSON.stringify(body) }),

  getLibrary: () => request<Library>('/library'),

  listContracts: () => request<ContractIndex[]>('/contracts'),
  getContract: (product: string) => request<Record<string, unknown>>(`/contracts/${product}`),
  updateContract: (product: string, body: unknown) =>
    request(`/contracts/${product}`, { method: 'PUT', body: JSON.stringify(body) }),
  seedContract: (product: string, dataset: string) =>
    request(`/contracts/${product}/seed`, { method: 'POST', body: JSON.stringify({ dataset }) }),
  diffContract: (product: string, newContract: unknown) =>
    request<DiffResult>(`/contracts/${product}/diff`, { method: 'POST', body: JSON.stringify({ new_contract: newContract }) }),
  approveContract: (product: string) =>
    request(`/contracts/${product}/approve`, { method: 'POST' }),
  deprecateContract: (product: string) =>
    request(`/contracts/${product}/deprecate`, { method: 'POST' }),
  compileContract: (product: string, dryRun = true) =>
    request<CompileResult>(`/contracts/${product}/compile?dry_run=${dryRun}`, { method: 'POST' }),

  getInventory: () => request<{ datasets: InventoryDataset[] }>('/inventory'),
  getLineageGraph: () => request<LineageGraph>('/lineage/graph'),

  listProposals: (status = 'open') => request<Proposal[]>(`/proposals?status=${status}`),
  acceptProposal: (id: string) => request(`/proposals/${id}/accept`, { method: 'POST' }),
  rejectProposal: (id: string) => request(`/proposals/${id}/reject`, { method: 'POST' }),
}

// Types
export interface ObjectStatus {
  object_name: string
  last_run_id?: string
  last_run_at?: string
  overall_status?: string
  total_checks: number
  passed_checks: number
  failed_checks: number
  warning_checks: number
  compliance: string
  contract_version: string
}

export interface CheckResult {
  check_name: string
  sql_text?: string
  expect_expr?: string
  severity?: string
  passed?: boolean
  actual_value?: string
  error_message?: string
  duration_ms?: number
  state: string
}

export interface Run {
  run_id: string
  dataset: string
  schema_name: string
  started_at: string
  finished_at?: string
  overall_status?: string
  total_checks: number
  passed_checks: number
  failed_checks: number
  warning_checks: number
  triggered_by: string
  contract_version: string
  run_state: string
}

export interface RunDetail extends Run {
  checks: CheckResult[]
}

export interface HistoryPoint {
  actual_value?: string
  started_at: string
}

export interface TriggerRunRequest {
  dataset: string
  environment: string
  execution_mode: string
}

export interface TriggerRunResponse {
  run_id: string
  status: string
}

export interface Library {
  version: string
  checks: LibraryCheck[]
}

export interface LibraryCheck {
  id: string
  name: string
  type: string
  sql_template: string
  params: string[]
  description: string
}

export interface ContractIndex {
  product: string
  lifecycle: string
  owned_by: string
  version: string
  head_hash: string
  updated_at?: string
  compliance: string
}

export interface DiffResult {
  is_breaking: boolean
  requires_major_bump: boolean
  breaking_changes: string[]
  non_breaking_changes: string[]
}

export interface CompileResult {
  checks_yaml: string
  header_hash: string
  conflicts: string[]
}

export interface InventoryDataset {
  dataset?: string
  name?: string
  columns?: Array<{ name: string; type: string; nullable: boolean }>
}

export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
  extract_age_seconds?: number
}

export interface LineageNode {
  id: string
  technicalName?: string
  layer?: string
  coverage: string
  has_contract: boolean
}

export interface LineageEdge {
  source: string
  target: string
  type?: string
}

export interface Proposal {
  id: string
  product: string
  guarantee_patch: Record<string, unknown>
  evidence: Record<string, unknown>
  status: string
  created_at?: string
}

import axios, { type AxiosInstance } from 'axios';

// ---- Exported types used by components ----

export interface ObjectStatus {
  id: string;
  name: string;
  status: string;
  coverage_flag: string;
  check_count: number;
  last_run?: string | null;
  last_run_id?: string | null;
  contract_status?: string;
  family?: string;
  layer?: string;
  space?: string;
  owned_by?: string;
}

export interface HistoryPoint {
  started_at: string;
  actual_value: string | null;
}

export interface CheckResult {
  check_name: string;
  severity: string;
  state: string;
  passed: boolean;
  actual_value?: string;
  expect_expr?: string;
  duration_ms?: number;
}

// ---- Typed API extension ----

interface TypedApi extends AxiosInstance {
  getRun(runId: string): Promise<{ run_id: string; run_state: string; [key: string]: unknown }>;
  triggerRun(payload: { dataset: string; environment: string; execution_mode: string }): Promise<{ run_id: string }>;
  getContract(product: string): Promise<Record<string, unknown>>;
  approveContract(product: string): Promise<Record<string, unknown>>;
  deprecateContract(product: string): Promise<Record<string, unknown>>;
  compileContract(product: string, dryRun: boolean): Promise<{ checks_yaml: string; conflicts: string[] }>;
}

const _http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

const api = _http as TypedApi;
api.getRun = (runId) => _http.get(`/runs/${runId}`).then(r => r.data);
api.triggerRun = (payload) => _http.post('/runs', payload).then(r => r.data);
api.getContract = (product) => _http.get(`/contracts/${product}`).then(r => r.data);
api.approveContract = (product) => _http.post(`/contracts/${product}/approve`).then(r => r.data);
api.deprecateContract = (product) => _http.post(`/contracts/${product}/deprecate`).then(r => r.data);
api.compileContract = (product, dryRun) =>
  _http.post(`/contracts/${product}/compile?dry_run=${dryRun}`).then(r => r.data);

export { api };

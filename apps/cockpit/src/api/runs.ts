import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { RunSummary, RunListItem, RunEvent } from '@/types';

export const useRuns = () =>
  useQuery<RunListItem[]>({
    queryKey: ['runs'],
    queryFn: () => api.get('/runs').then(r => r.data),
  });

export const useRun = (id: string) =>
  useQuery<RunSummary>({
    queryKey: ['runs', id],
    queryFn: () => api.get(`/runs/${id}`).then(r => r.data),
    enabled: !!id,
    // Poll while the run is still executing so a triggered run (202) shows up.
    refetchInterval: (query) => query.state.data?.run_state === 'running' ? 2000 : false,
  });

// Live progress lines for a run; polled every 2s while the run is in-flight.
export const useRunEvents = (id: string, active: boolean) =>
  useQuery<RunEvent[]>({
    queryKey: ['runs', id, 'events'],
    queryFn: () => api.get(`/runs/${id}/events`).then(r => r.data),
    enabled: !!id && active,
    refetchInterval: active ? 2000 : false,
  });

// R1-3/R2-6: diagnostic rows for a check in a run (allowlist-projected at the
// source — no raw column leaks). Only fetched on demand (drawer open).
export const useRunDiagnostics = (runId: string, checkName: string, enabled: boolean) =>
  useQuery<{ check_name: string; row: Record<string, unknown> }[]>({
    queryKey: ['runs', runId, 'diagnostics', checkName],
    queryFn: () =>
      api.get(`/runs/${runId}/diagnostics`, { params: { check_name: checkName } }).then(r => r.data),
    enabled: enabled && !!runId && !!checkName,
  });

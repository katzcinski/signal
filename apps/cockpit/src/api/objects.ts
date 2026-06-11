import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ObjectSummary, RunListItem } from '@/types';

export const useObjects = () =>
  useQuery<ObjectSummary[]>({
    queryKey: ['objects'],
    queryFn: () => api.get('/objects').then(r => r.data),
  });

export const useObject = (id: string) =>
  useQuery<ObjectSummary>({
    queryKey: ['objects', id],
    queryFn: () => api.get(`/objects/${id}`).then(r => r.data),
    enabled: !!id,
  });

export const useObjectRuns = (id: string) =>
  useQuery<RunListItem[]>({
    queryKey: ['objects', id, 'runs'],
    queryFn: () => api.get(`/objects/${id}/runs`).then(r => r.data),
    enabled: !!id,
    // Poll while the latest run is in-flight so the list/status updates live.
    refetchInterval: (query) => query.state.data?.[0]?.run_state === 'running' ? 2000 : false,
  });

export interface RunTriggerBody { environment?: string; execution_mode?: string }

export const useTriggerRun = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RunTriggerBody = {}) => api.post(`/objects/${id}/run`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objects', id, 'runs'] });
      qc.invalidateQueries({ queryKey: ['objects', id] });
    },
  });
};

export interface CheckHistoryPoint {
  actual_value: string | null; passed: boolean; state: string; started_at: string; run_id: string;
}

export const useCheckHistory = (objectId: string, checkName: string, enabled = true) =>
  useQuery<CheckHistoryPoint[]>({
    queryKey: ['objects', objectId, 'history', checkName],
    queryFn: () => api.get(`/objects/${objectId}/checks/${encodeURIComponent(checkName)}/history`).then(r => r.data),
    enabled: enabled && !!objectId && !!checkName,
  });

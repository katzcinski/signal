import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Incident, IncidentDetail, IncidentTransitionBody, FailedCheck } from '@/types';

// Persistent lifecycle incidents (GET /api/incidents?status=&severity=)
export const useIncidents = (status?: string, severity?: string) =>
  useQuery<Incident[]>({
    queryKey: ['incidents', { status: status ?? '', severity: severity ?? '' }],
    queryFn: () => api.get('/incidents', {
      params: {
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
      },
    }).then(r => r.data),
    refetchInterval: 60_000,
  });

export const useIncident = (id: number | null) =>
  useQuery<IncidentDetail>({
    queryKey: ['incidents', 'detail', id],
    queryFn: () => api.get(`/incidents/${id}`).then(r => r.data),
    enabled: id != null,
  });

export const useIncidentTransition = (id: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IncidentTransitionBody) =>
      api.post(`/incidents/${id}/transition`, body).then(r => r.data as Incident),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
};

// Derived failing-checks view (moved to GET /api/incidents/checks)
export const useFailedChecks = (severity?: string, dataset?: string) =>
  useQuery<FailedCheck[]>({
    queryKey: ['incidents', 'checks', { severity: severity ?? '', dataset: dataset ?? '' }],
    queryFn: () => api.get('/incidents/checks', {
      params: {
        ...(severity ? { severity } : {}),
        ...(dataset ? { dataset } : {}),
      },
    }).then(r => r.data),
    refetchInterval: 60_000,
  });

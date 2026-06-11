import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Incident, IncidentDetail, IncidentStatus } from '@/types';

export const useIncidents = (status?: string, severity?: string) =>
  useQuery<Incident[]>({
    queryKey: ['incidents', status ?? '', severity ?? ''],
    queryFn: () =>
      api
        .get('/incidents', { params: { status: status || undefined, severity: severity || undefined } })
        .then(r => r.data),
    refetchInterval: 60_000,
  });

export const useIncident = (id: string | null) =>
  useQuery<IncidentDetail>({
    queryKey: ['incident', id],
    queryFn: () => api.get(`/incidents/${id}`).then(r => r.data),
    enabled: !!id,
  });

export const useTransitionIncident = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: IncidentStatus; note?: string }) =>
      api.post(`/incidents/${id}/transition`, { status, note: note ?? '' }).then(r => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['incident', vars.id] });
    },
  });
};

export const useAssignIncident = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, owner }: { id: string; owner: string }) =>
      api.post(`/incidents/${id}/assign`, { owner }).then(r => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['incident', vars.id] });
    },
  });
};

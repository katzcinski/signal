import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// GET /api/environments — environment names for the run dialog (no secrets).
export const useEnvironments = () =>
  useQuery<string[]>({
    queryKey: ['environments'],
    queryFn: () => api.get('/environments').then(r => r.data.environments ?? []),
  });

// POST /api/extract — reload inventory/lineage snapshots (analyzer placeholder).
export const useExtract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (environment: string) =>
      api.post('/extract', null, { params: { environment } }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objects'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

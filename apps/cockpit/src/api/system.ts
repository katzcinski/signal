import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

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

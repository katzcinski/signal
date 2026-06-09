import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { LineageGraph } from '@/types';

export const useLineage = () =>
  useQuery<LineageGraph>({
    queryKey: ['lineage'],
    queryFn: () => api.get('/lineage').then(r => r.data),
  });

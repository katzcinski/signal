import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Incident } from '@/types';

export const useIncidents = () =>
  useQuery<Incident[]>({
    queryKey: ['incidents'],
    queryFn: () => api.get('/incidents').then(r => r.data),
    refetchInterval: 60_000,
  });

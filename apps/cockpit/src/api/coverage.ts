import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { CoverageSummary, SlaSummary } from '@/types';

export const useCoverageSummary = () =>
  useQuery<CoverageSummary>({
    queryKey: ['coverage', 'summary'],
    queryFn: () => api.get('/coverage/summary').then(r => r.data),
  });

export const useSla = (product: string | null, windowDays = 30) =>
  useQuery<SlaSummary>({
    queryKey: ['sla', product, windowDays],
    queryFn: () =>
      api.get(`/contracts/${product}/sla`, { params: { window_days: windowDays } }).then(r => r.data),
    enabled: !!product,
  });

import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { CoverageSummary } from '@/types';

export const useCoverageSummary = () =>
  useQuery<CoverageSummary>({
    queryKey: ['coverage', 'summary'],
    queryFn: () => api.get('/coverage/summary').then(r => r.data),
  });

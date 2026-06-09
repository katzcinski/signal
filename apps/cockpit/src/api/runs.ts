import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { RunSummary, RunListItem } from '@/types';

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
  });

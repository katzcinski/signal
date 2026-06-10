import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Contract } from '@/types';

export const useContract = (id: string) =>
  useQuery<Contract>({
    queryKey: ['contracts', id],
    queryFn: () => api.get(`/contracts/${id}`).then(r => r.data),
    enabled: !!id,
    retry: false,
  });

export const usePutContract = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Contract) => api.put(`/contracts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts', id] }),
  });
};

export const useCompileContract = (id: string) =>
  useMutation({
    mutationFn: () => api.post(`/contracts/${id}/compile`).then(r => r.data),
  });

export const useCompileContractDryRun = (id: string) =>
  useMutation({
    mutationFn: () => api.post(`/contracts/${id}/compile?dry_run=true`).then(r => r.data),
  });

export const useDryRunChecks = (dataset: string) =>
  useMutation({
    mutationFn: (body: { environment?: string } = {}) =>
      api.post(`/checks/${dataset}/dry-run`, body).then(r => r.data),
  });

export const useRevertChecks = (dataset: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/checks/${dataset}/revert`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  });
};

export const useExportBdc = (product: string) =>
  useMutation({
    mutationFn: () => api.post(`/contracts/${product}/export/bdc`).then(r => r.data),
  });

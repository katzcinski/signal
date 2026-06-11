import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Contract, ContractOut } from '@/types';

export interface DiffEntry { kind: string; path: string; old: unknown; new: unknown }
export interface DiffResult { breaking: boolean; entries: DiffEntry[]; message?: string }

export const useContracts = (lifecycle?: string) =>
  useQuery<ContractOut[]>({
    queryKey: ['contracts', 'list', lifecycle ?? ''],
    queryFn: () =>
      api.get('/contracts', { params: { lifecycle: lifecycle || undefined } }).then(r => r.data),
  });

export const useContract = (id: string) =>
  useQuery<ContractOut>({
    queryKey: ['contracts', id],
    queryFn: () => api.get(`/contracts/${id}`).then(r => r.data),
    enabled: !!id,
    retry: false,
  });

export const useDiffContract = (id: string) =>
  useMutation({
    mutationFn: (data: Contract) => api.post(`/contracts/${id}/diff`, data).then(r => r.data as DiffResult),
  });

export const useSeedContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (product: string) => api.post(`/contracts/${product}/seed`).then(r => r.data as ContractOut),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts', 'list'] }),
  });
};

export const usePutContract = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Contract) => api.put(`/contracts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts', id] }),
  });
};

export const useApproveContract = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/contracts/${id}/approve`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts', id] });
      qc.invalidateQueries({ queryKey: ['objects'] });
    },
  });
};

export const useDeprecateContract = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/contracts/${id}/deprecate`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts', id] });
      qc.invalidateQueries({ queryKey: ['objects'] });
    },
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

export const useExportOdcs = (product: string) =>
  useMutation({
    mutationFn: () => api.get(`/contracts/${product}/export/odcs`).then(r => r.data),
  });

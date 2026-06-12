import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './client';
import { t } from '@/i18n/de';
import type {
  Contract, ContractOut, ContractPutBody, DiffReport, InventoryResponse, SlaResponse,
} from '@/types';

// List items may carry EMPTY guarantees (served from the index) — always
// fetch the single contract for the full document.
export const useContracts = () =>
  useQuery<ContractOut[]>({
    queryKey: ['contracts'],
    queryFn: () => api.get('/contracts').then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.contracts ?? []);
    }),
  });

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
    mutationFn: (data: ContractPutBody) => api.put(`/contracts/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts', id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(t.toast.contractSaved);
    },
    onError: () => toast.error(t.toast.contractSaveError),
  });
};

export const useSeedContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/contracts/${id}/seed`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  });
};

export const useDiffContract = (id: string) =>
  useMutation({
    mutationFn: (draft: ContractPutBody) =>
      api.post(`/contracts/${id}/diff`, draft).then(r => r.data as DiffReport),
  });

export const useContractSla = (product: string, enabled = true) =>
  useQuery<SlaResponse>({
    queryKey: ['contracts', product, 'sla'],
    queryFn: () => api.get(`/contracts/${product}/sla`).then(r => r.data),
    enabled: !!product && enabled,
  });

export const useInventory = () =>
  useQuery<InventoryResponse>({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then(r => r.data),
    staleTime: 5 * 60_000,
  });

export const useApproveContract = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/contracts/${id}/approve`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
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
      qc.invalidateQueries({ queryKey: ['contracts'] });
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Proposal } from '@/types';

export const useProposals = () =>
  useQuery<Proposal[]>({
    queryKey: ['proposals'],
    queryFn: () => api.get('/proposals').then(r => r.data),
  });

const proposalAction = (id: string, action: 'accept' | 'reject' | 'snooze') =>
  api.post(`/proposals/${id}/${action}`).then(r => r.data);

export const useProposalAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' | 'snooze' }) =>
      proposalAction(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proposals'] }),
  });
};

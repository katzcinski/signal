import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { InventoryObject } from '@/types';

// U2: object/column picker source for the ContractEditor comboboxes.
export const useInventory = () =>
  useQuery<InventoryObject[]>({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then(r => r.data.datasets ?? []),
  });

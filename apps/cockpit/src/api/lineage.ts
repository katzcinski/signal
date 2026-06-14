import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type {
  ColumnLineageColumnResponse,
  ColumnLineageObjectResponse,
  LineageGraph,
} from '@/types';

export const useLineage = () =>
  useQuery<LineageGraph>({
    queryKey: ['lineage'],
    queryFn: () => api.get('/lineage').then(r => r.data),
  });

export function fetchColumnLineage(objectId: string): Promise<ColumnLineageObjectResponse>;
export function fetchColumnLineage(objectId: string, column: string): Promise<ColumnLineageColumnResponse>;
export function fetchColumnLineage(objectId: string, column?: string) {
  return api.get('/lineage/columns', {
    params: column ? { object: objectId, column } : { object: objectId },
  }).then(r => r.data);
}

export const useColumnLineage = (objectId: string, column?: string) =>
  useQuery<ColumnLineageObjectResponse | ColumnLineageColumnResponse>({
    queryKey: ['lineage', 'columns', objectId, column ?? 'all'],
    queryFn: () => fetchColumnLineage(objectId, column as string),
    enabled: !!objectId,
  });

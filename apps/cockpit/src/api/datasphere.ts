import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { DataLoad } from '@/types';

// Nur die objektbezogene Ansicht hat einen UI-Abnehmer (DataLoadsPanel im
// Objekt-Detail, W-5). Die list-all-Variante wurde als YAGNI entfernt — der
// Backend-Endpunkt /api/datasphere/data-loads bleibt für Skript-/Zukunftsnutzung.
export const useObjectDataLoads = (objectId: string, space?: string, top = 20) =>
  useQuery<DataLoad[]>({
    queryKey: ['datasphere', 'data-loads', objectId, space],
    queryFn: () =>
      api
        .get(`/datasphere/data-loads/${encodeURIComponent(objectId)}`, {
          params: { space, top },
        })
        .then(r => r.data),
    enabled: !!objectId,
    staleTime: 60_000,
    retry: false,
  });

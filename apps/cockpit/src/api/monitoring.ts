import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import { api } from './client';
import { t } from '@/i18n/de';

// „Für Monitoring verfügbar machen" (Schmalspur, ADR-0002): teilt ein
// Inventar-Objekt in den Monitoring-Hub-Space. Schreibzugriff ist serverseitig
// per Default AUS — useMonitoringConfig().enabled steuert die Sichtbarkeit.

export interface MonitoringConfig {
  enabled: boolean;
  monitoring_space: string;
}

export const useMonitoringConfig = () =>
  useQuery<MonitoringConfig>({
    queryKey: ['monitoring', 'config'],
    queryFn: () => api.get('/monitoring/config').then(r => r.data),
    staleTime: 60_000,
  });

export const useMonitoringShares = () =>
  useQuery<string[]>({
    queryKey: ['monitoring', 'shares'],
    queryFn: () => api.get('/monitoring/shares').then(r => r.data.object_ids ?? []),
    staleTime: 30_000,
  });

export const useShareForMonitoring = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (objectId: string) =>
      api.post(`/monitoring/shares/${objectId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitoring', 'shares'] });
      toast.success(t.monitoring.shared);
    },
    onError: (err: AxiosError<{ detail?: string }>) => {
      toast.error(err.response?.data?.detail ?? t.monitoring.shareError);
    },
  });
};

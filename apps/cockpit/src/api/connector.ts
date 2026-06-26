import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EXTRACT_STATUS_KEY } from './extract';

export interface ConnectorStatus {
  space_id: string;
  use_cli: boolean;
  cli_available: boolean;
  cli_logged_in: boolean;
  cli_host: string | null;
  catalog_configured: boolean;
  source_mode: 'cli' | 'catalog' | 'none';
  config_file: string;
  file_space_id: string;
  file_use_cli: boolean;
  env_space_id: string;
  env_use_cli: boolean;
}

export function useConnectorStatus() {
  return useQuery<ConnectorStatus>({
    queryKey: ['connector-status'],
    queryFn: async () => {
      const resp = await fetch('/api/admin/connector');
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json();
    },
    staleTime: 30_000,
  });
}

export function useSaveConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { space_id: string; use_cli: boolean }) => {
      const resp = await fetch('/api/admin/connector', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json() as Promise<ConnectorStatus>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connector-status'] });
      qc.invalidateQueries({ queryKey: EXTRACT_STATUS_KEY });
    },
  });
}

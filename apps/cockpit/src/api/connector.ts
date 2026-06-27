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
  base_url: string;
  client_id: string;
  token_url: string;
  secret_configured: boolean;
  file_space_id: string;
  file_use_cli: boolean;
  file_cli_host: string;
  file_base_url: string;
  file_client_id: string;
  file_token_url: string;
  env_space_id: string;
  env_use_cli: boolean;
  env_base_url: string;
  env_client_id: string;
}

export interface ConnectorSave {
  space_id: string;
  use_cli: boolean;
  cli_host?: string;
  base_url?: string;
  client_id?: string;
  token_url?: string;
  client_secret?: string;
  clear_secret?: boolean;
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
    mutationFn: async (body: ConnectorSave) => {
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

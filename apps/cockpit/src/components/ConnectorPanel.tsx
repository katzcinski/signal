import { useState, type CSSProperties } from 'react';
import { useConnectorStatus, useSaveConnector } from '@/api/connector';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { t } from '@/i18n/de';

const muted: CSSProperties = { color: 'var(--fg-3)', fontSize: 12 };
const valueText: CSSProperties = { color: 'var(--fg)', fontSize: 13, fontWeight: 600 };

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', minHeight: 28 }}>
      <span style={{
        width: 8, height: 8, borderRadius: 'var(--r-full)',
        background: ok ? 'var(--status-pass)' : 'var(--status-warn)',
      }} />
      <span style={valueText}>{label}</span>
      {detail && <span style={muted}>{detail}</span>}
    </div>
  );
}

/** Datasphere connector config (space, CLI, REST/OAuth) — shared by the Inventory
 *  Admin page and Settings. Self-contained: owns its own status/save queries. */
export function ConnectorPanel({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useConnectorStatus();
  const save = useSaveConnector();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [useCli, setUseCli] = useState<boolean | null>(null);
  const [cliHost, setCliHost] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const effectiveSpace = spaceId ?? (data?.file_space_id ?? '');
  const effectiveUseCli = useCli ?? (data?.file_use_cli ?? false);
  const effectiveCliHost = cliHost ?? (data?.file_cli_host ?? '');
  const effectiveBaseUrl = baseUrl ?? (data?.file_base_url ?? '');
  const effectiveClientId = clientId ?? (data?.file_client_id ?? '');
  const effectiveTokenUrl = tokenUrl ?? (data?.file_token_url ?? '');
  // Env vars take precedence over the file → those fields are read-only.
  const envOverride = Boolean(data?.env_space_id || data?.env_use_cli || data?.env_base_url || data?.env_client_id);

  const handleSave = () => {
    save.mutate(
      {
        space_id: effectiveSpace,
        use_cli: effectiveUseCli,
        cli_host: effectiveCliHost,
        base_url: effectiveBaseUrl,
        client_id: effectiveClientId,
        token_url: effectiveTokenUrl,
        client_secret: clientSecret || undefined,
      },
      {
        onSuccess: () => {
          setSavedMsg(t.connector.saved);
          setSpaceId(null); setUseCli(null); setCliHost(null);
          setBaseUrl(null); setClientId(null); setTokenUrl(null); setClientSecret('');
        },
        onError: () => setSavedMsg(t.connector.saveError),
      },
    );
  };

  const sourceDot = (mode: string | undefined) => {
    if (mode === 'cli' || mode === 'catalog') return 'var(--status-pass)';
    return 'var(--status-warn)';
  };

  return (
    <Panel title={t.connector.title} family="observability">
      {isLoading && <p style={muted}>{t.common.loading}</p>}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 'var(--r-full)', background: sourceDot(data.source_mode), flexShrink: 0 }} />
            <span style={valueText}>
              {data.source_mode === 'cli' ? t.connector.sourceCli
                : data.source_mode === 'catalog' ? t.connector.sourceCatalog
                : t.connector.sourceNone}
            </span>
          </div>

          {/* CLI login is detected whenever the CLI is installed, regardless of the use_cli toggle. */}
          {data.cli_available && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
              <StatusLine ok={data.cli_available} label={t.connector.cliAvailable} />
              <StatusLine ok={data.cli_logged_in} label={data.cli_logged_in ? t.connector.cliLoggedIn : t.connector.cliNotLoggedIn}
                detail={data.cli_host ?? undefined} />
              {!data.cli_logged_in && (
                <p style={{ ...muted, fontSize: 11 }}>{t.connector.loginHint}</p>
              )}
            </div>
          )}
          {!data.cli_available && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
              <StatusLine ok={false} label={t.connector.cliMissing} />
              <pre style={{ ...muted, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>{t.connector.installHint}</pre>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s3)', display: 'grid', gap: 'var(--s3)' }}>
            {envOverride && <p style={{ ...muted, fontSize: 11 }}>{t.connector.envOverride}</p>}
            <Field label={t.connector.spaceId} hint={t.connector.spaceIdHint}>
              <Input
                value={effectiveSpace}
                disabled={!canEdit || Boolean(data.env_space_id)}
                onChange={e => setSpaceId(e.target.value)}
                style={{ width: '100%' }}
              />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', fontSize: 12, color: 'var(--fg-2)' }}>
              <input
                type="checkbox"
                checked={effectiveUseCli}
                disabled={!canEdit || data.env_use_cli}
                onChange={e => setUseCli(e.target.checked)}
              />
              {t.connector.useCli}
            </label>
            <Field label={t.connector.cliHost} hint={t.connector.cliHostHint}>
              <Input
                value={effectiveCliHost}
                disabled={!canEdit}
                onChange={e => setCliHost(e.target.value)}
                placeholder="my-tenant.eu10.hcs.cloud.sap"
                style={{ width: '100%' }}
              />
            </Field>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s3)', display: 'grid', gap: 'var(--s3)' }}>
              <p style={{ ...valueText, fontSize: 12 }}>{t.connector.restTitle}</p>
              <p style={{ ...muted, fontSize: 11, margin: 0 }}>{t.connector.restHint}</p>
              <Field label={t.connector.baseUrl}>
                <Input
                  value={effectiveBaseUrl}
                  disabled={!canEdit || Boolean(data.env_base_url)}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://my-tenant.eu10.hcs.cloud.sap"
                  style={{ width: '100%' }}
                />
              </Field>
              <Field label={t.connector.clientId}>
                <Input
                  value={effectiveClientId}
                  disabled={!canEdit || Boolean(data.env_client_id)}
                  onChange={e => setClientId(e.target.value)}
                  autoComplete="off"
                  style={{ width: '100%' }}
                />
              </Field>
              <Field label={t.connector.tokenUrl} hint={t.connector.tokenUrlHint}>
                <Input
                  value={effectiveTokenUrl}
                  disabled={!canEdit}
                  onChange={e => setTokenUrl(e.target.value)}
                  placeholder="https://my-tenant.authentication.eu10.hana.ondemand.com/oauth/token"
                  style={{ width: '100%' }}
                />
              </Field>
              <Field
                label={t.connector.clientSecret}
                hint={data.secret_configured ? t.connector.secretKeepHint : t.connector.secretHint}
              >
                <Input
                  type="password"
                  value={clientSecret}
                  disabled={!canEdit}
                  onChange={e => setClientSecret(e.target.value)}
                  autoComplete="new-password"
                  placeholder={data.secret_configured ? '••••••••' : ''}
                  style={{ width: '100%' }}
                />
              </Field>
              <StatusLine ok={data.secret_configured} label={data.secret_configured ? t.connector.secretSet : t.connector.secretMissing} />
            </div>

            {canEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                <Button variant="primary" disabled={save.isPending} onClick={handleSave}>{t.connector.save}</Button>
                {savedMsg && <span style={{ fontSize: 12, color: save.isError ? 'var(--status-fail)' : 'var(--fg-3)' }}>{savedMsg}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

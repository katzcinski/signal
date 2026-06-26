import { useMemo, useState, type CSSProperties } from 'react';
import { useExtractStatus, useStartExtract, type ExtractCounts } from '@/api/extract';
import { useConnectorStatus, useSaveConnector } from '@/api/connector';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Field, Input } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { t } from '@/i18n/de';
import { canManageInventory, useRoleStore } from '@/store/role';

const muted: CSSProperties = { color: 'var(--fg-3)', fontSize: 12 };
const valueText: CSSProperties = { color: 'var(--fg)', fontSize: 13, fontWeight: 600 };
const monoText: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--s3)' };
const LOCAL_SOURCE_WARNING = 'No live extraction source configured; nothing was extracted.';

function ConnectorPanel({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useConnectorStatus();
  const save = useSaveConnector();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [useCli, setUseCli] = useState<boolean | null>(null);
  const [savedMsg, setSavedMsg] = useState('');

  const effectiveSpace = spaceId ?? (data?.file_space_id ?? '');
  const effectiveUseCli = useCli ?? (data?.file_use_cli ?? false);
  const envOverride = Boolean(data?.env_space_id || data?.env_use_cli);

  const handleSave = () => {
    save.mutate(
      { space_id: effectiveSpace, use_cli: effectiveUseCli },
      {
        onSuccess: () => { setSavedMsg(t.connector.saved); setSpaceId(null); setUseCli(null); },
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

          {data.use_cli && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
              <StatusLine ok={data.cli_available} label={data.cli_available ? t.connector.cliAvailable : t.connector.cliMissing} />
              {!data.cli_available && (
                <pre style={{ ...muted, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>{t.connector.installHint}</pre>
              )}
              {data.cli_available && (
                <StatusLine ok={data.cli_logged_in} label={data.cli_logged_in ? t.connector.cliLoggedIn : t.connector.cliNotLoggedIn}
                  detail={data.cli_host ?? undefined} />
              )}
              {data.cli_available && !data.cli_logged_in && (
                <p style={{ ...muted, fontSize: 11 }}>{t.connector.loginHint}</p>
              )}
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
            {canEdit && !envOverride && (
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

function fmt(value?: string | null): string {
  if (!value) return t.inventoryAdmin.noValue;
  return new Date(value).toLocaleString();
}

function splitSpaces(value: string): string[] {
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

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

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s2)' }}>
      <div style={muted}>{label}</div>
      <div style={{ ...valueText, fontSize: 18 }}>{value ?? 0}</div>
    </div>
  );
}

function Counts({ counts }: { counts?: ExtractCounts }) {
  return (
    <div style={grid}>
      <Metric label={t.inventoryAdmin.inventoryItems} value={counts?.inventory_items} />
      <Metric label={t.inventoryAdmin.lineageNodes} value={counts?.lineage_nodes} />
      <Metric label={t.inventoryAdmin.lineageEdges} value={counts?.lineage_edges} />
      <Metric label={t.inventoryAdmin.columnEdges} value={counts?.column_edges} />
    </div>
  );
}

export default function InventoryAdmin() {
  const role = useRoleStore(s => s.role);
  const canTrigger = canManageInventory(role);
  const canEdit = canTrigger;
  const { data, isLoading, isError, refetch } = useExtractStatus();
  const startExtract = useStartExtract();
  const [environment, setEnvironment] = useState('default');
  const [profile, setProfile] = useState('default');
  const [spaces, setSpaces] = useState('');
  const [includeSql, setIncludeSql] = useState(true);
  const [force, setForce] = useState(false);

  const backendReady = !isError && !isLoading;
  const snapshotReady = Boolean(data?.published_snapshot_timestamp);
  const effectiveCanTrigger = canTrigger && Boolean(data?.can_trigger);
  const warnings = useMemo(
    () => (data?.warnings ?? []).map(item => item === LOCAL_SOURCE_WARNING ? t.inventoryAdmin.localWarning : item),
    [data?.warnings],
  );

  const trigger = () => {
    startExtract.mutate({
      environment: environment.trim() || 'default',
      profile: profile.trim() || undefined,
      spaces: splitSpaces(spaces),
      include_sql: includeSql,
      force,
    });
  };

  return (
    <div className="page-full">
      <div style={{ marginBottom: 'var(--s5)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{t.inventoryAdmin.title}</h1>
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 'var(--s1)' }}>{t.inventoryAdmin.subtitle}</p>
      </div>

      {!canTrigger && <ReadOnlyBanner hint={t.inventoryAdmin.readOnlyHint} />}
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {isLoading && <p style={muted}>{t.common.loading}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--s4)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          <Panel title={t.inventoryAdmin.readiness} family="observability">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              <StatusLine ok={canTrigger} label={canTrigger ? t.inventoryAdmin.roleReady : t.inventoryAdmin.roleBlocked} detail={role} />
              <StatusLine ok={backendReady} label={t.inventoryAdmin.apiReady} detail={data?.current_step} />
              <StatusLine ok={snapshotReady} label={snapshotReady ? t.inventoryAdmin.snapshotReady : t.inventoryAdmin.snapshotMissing} detail={fmt(data?.published_snapshot_timestamp)} />
            </div>
          </Panel>

          <Panel title={t.inventoryAdmin.scope} family="contract">
            <div style={{ display: 'grid', gap: 'var(--s3)' }}>
              <Field label={t.inventoryAdmin.environment}>
                <Input value={environment} disabled={!effectiveCanTrigger} onChange={e => setEnvironment(e.target.value)} style={{ width: '100%' }} />
              </Field>
              <Field label={t.inventoryAdmin.profile}>
                <Input value={profile} disabled={!effectiveCanTrigger} onChange={e => setProfile(e.target.value)} style={{ width: '100%' }} />
              </Field>
              <Field label={t.inventoryAdmin.spaces} hint={t.inventoryAdmin.spacesHint}>
                <Input value={spaces} disabled={!effectiveCanTrigger} onChange={e => setSpaces(e.target.value)} style={{ width: '100%' }} />
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', fontSize: 12, color: 'var(--fg-2)' }}>
                <input type="checkbox" checked={includeSql} disabled={!effectiveCanTrigger} onChange={e => setIncludeSql(e.target.checked)} />
                {t.inventoryAdmin.includeSql}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', fontSize: 12, color: 'var(--fg-2)' }}>
                <input type="checkbox" checked={force} disabled={!effectiveCanTrigger} onChange={e => setForce(e.target.checked)} />
                {t.inventoryAdmin.force}
              </label>
              <Button variant="primary" disabled={!effectiveCanTrigger || startExtract.isPending} onClick={trigger}>
                {startExtract.isPending ? t.liveRun : t.inventoryAdmin.startExtract}
              </Button>
            </div>
          </Panel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          <Panel title={t.inventoryAdmin.progress} family="quality">
            <div style={{ ...grid, marginBottom: 'var(--s4)' }}>
              <div><div style={muted}>{t.inventoryAdmin.status}</div><div style={valueText}>{data?.status ?? t.inventoryAdmin.noValue}</div></div>
              <div><div style={muted}>{t.inventoryAdmin.step}</div><div style={valueText}>{data?.current_step ?? t.inventoryAdmin.noValue}</div></div>
              <div><div style={muted}>{t.inventoryAdmin.source}</div><div style={valueText}>{data?.source ?? t.inventoryAdmin.noValue}</div></div>
              <div><div style={muted}>{t.inventoryAdmin.jobId}</div><div style={monoText}>{data?.job_id ?? t.inventoryAdmin.noValue}</div></div>
              <div><div style={muted}>{t.inventoryAdmin.started}</div><div style={valueText}>{fmt(data?.started_at)}</div></div>
              <div><div style={muted}>{t.inventoryAdmin.updated}</div><div style={valueText}>{fmt(data?.updated_at)}</div></div>
              <div><div style={muted}>{t.inventoryAdmin.finished}</div><div style={valueText}>{fmt(data?.finished_at)}</div></div>
            </div>
            <Counts counts={data?.counts} />
            {warnings.length > 0 && (
              <div style={{ marginTop: 'var(--s4)', color: 'var(--status-warn)', fontSize: 12 }}>
                {t.inventoryAdmin.warning}: {warnings.join(' ')}
              </div>
            )}
            {data?.error && <div style={{ marginTop: 'var(--s4)', color: 'var(--status-fail)', fontSize: 12 }}>{data.error}</div>}
          </Panel>

          <Panel title={t.inventoryAdmin.snapshot} family="observability">
            <div style={{ marginBottom: 'var(--s3)' }}>
              <div style={muted}>{t.inventoryAdmin.publishedAt}</div>
              <div style={valueText}>{fmt(data?.published_snapshot_timestamp)}</div>
            </div>
            <div style={{ display: 'grid', gap: 'var(--s2)' }}>
              {Object.entries(data?.runtime_artifact_paths ?? {}).map(([key, value]) => (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr)', gap: 'var(--s2)' }}>
                  <span style={muted}>{key}</span>
                  <span style={{ ...monoText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
            </div>
          </Panel>

          <ConnectorPanel canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}

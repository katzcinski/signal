import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidents, useIncident, useIncidentTransition, useFailedChecks } from '@/api/incidents';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusDot } from '@/components/ui/StatusDot';
import { StatusPill } from '@/components/ui/StatusPill';
import { StatePill } from '@/components/ui/StatePill';
import { IncidentSla } from '@/components/ui/IncidentSla';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type { FailedCheck, Incident, IncidentStatus } from '@/types';

const TABS = ['open', 'acknowledged', 'investigating', 'resolved', 'checks'] as const;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

const drawerBtn = (variant: 'primary' | 'ghost' = 'primary'): React.CSSProperties => ({
  background: variant === 'primary' ? 'var(--cont)' : 'var(--bg-2)',
  color: variant === 'primary' ? '#fff' : 'var(--fg)',
  border: variant === 'primary' ? 'none' : '1px solid var(--line-2)',
  borderRadius: 5, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
});

function IncidentDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: incident, isLoading } = useIncident(id);
  const transition = useIncidentTransition(id);
  const navigate = useNavigate();
  const [ownerInput, setOwnerInput] = useState('');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const requestAct = (status: string) => {
    setPendingStatus(status);
    setNoteInput('');
  };

  const confirmAct = () => {
    if (!pendingStatus) return;
    transition.mutate({ status: pendingStatus, note: noteInput.trim() || undefined });
    setPendingStatus(null);
    setNoteInput('');
  };

  const cancelAct = () => {
    setPendingStatus(null);
    setNoteInput('');
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={incident?.title ?? t.incidents.title}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 100,
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
        padding: 20, overflowY: 'auto', boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          {incident && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <StatusPill status={incident.severity} size="sm" />
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.incidents.statusLabel[incident.status] ?? incident.status}</span>
                <IncidentSla incident={incident} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{incident.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)', marginTop: 4 }}>{incident.product}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
                {t.incidents.colOpened}: {new Date(incident.opened_at).toLocaleString()} · {t.incidents.contractVersion}: {incident.contract_version || '—'}
              </div>
            </>
          )}
          {isLoading && <div style={{ color: 'var(--fg-3)' }}>{t.common.loading}</div>}
        </div>
        <button onClick={onClose} aria-label={t.common.close} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>

      {incident && (
        <>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: pendingStatus ? 8 : 16 }}>
            {incident.status === 'open' && (
              <button style={drawerBtn(pendingStatus === 'acknowledged' ? 'primary' : 'ghost')}
                      disabled={transition.isPending} onClick={() => requestAct('acknowledged')}>
                {t.incidents.acknowledge}
              </button>
            )}
            {(incident.status === 'open' || incident.status === 'acknowledged') && (
              <button style={drawerBtn(pendingStatus === 'investigating' ? 'primary' : 'ghost')}
                      disabled={transition.isPending} onClick={() => requestAct('investigating')}>
                {t.incidents.investigate}
              </button>
            )}
            {incident.status !== 'resolved' && (
              <button style={drawerBtn(pendingStatus === 'resolved' ? 'primary' : 'ghost')}
                      disabled={transition.isPending} onClick={() => requestAct('resolved')}>
                {t.incidents.resolve}
              </button>
            )}
            <button style={drawerBtn('ghost')} onClick={() => navigate(`/runs/${incident.run_id}`)}>
              {t.incidents.openRun}
            </button>
            <button style={drawerBtn('ghost')} onClick={() => navigate(`/lineage?focus=${encodeURIComponent(incident.product)}`)}>
              {t.incidents.rootCause}
            </button>
          </div>

          {/* Inline note form — replaces window.prompt */}
          {pendingStatus && (
            <div style={{
              background: 'var(--bg-2)', border: '1px solid var(--line-2)',
              borderRadius: 6, padding: 12, marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6 }}>
                {t.incidents.notePrompt}
              </div>
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmAct(); }}
                placeholder={t.incidents.notePlaceholder}
                autoFocus
                rows={2}
                style={{
                  width: '100%', background: 'var(--bg-1)', border: '1px solid var(--line-2)',
                  color: 'var(--fg)', borderRadius: 4, padding: '6px 8px', fontSize: 12,
                  resize: 'vertical', boxSizing: 'border-box', display: 'block',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={drawerBtn()} onClick={confirmAct} disabled={transition.isPending}>
                  {t.common.confirm}
                </button>
                <button style={drawerBtn('ghost')} onClick={cancelAct}>
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}

          {/* Owner assign */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {t.incidents.assignOwner}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 6 }}>
              {t.incidents.colOwner}: {incident.owner || t.incidents.noOwner}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={ownerInput}
                onChange={e => setOwnerInput(e.target.value)}
                placeholder={t.incidents.colOwner}
                aria-label={t.incidents.assignOwner}
                style={{
                  flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line-2)',
                  color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
                }}
              />
              <button
                style={drawerBtn()}
                disabled={!ownerInput.trim() || transition.isPending}
                onClick={() => {
                  transition.mutate({ status: incident.status, owner: ownerInput.trim() });
                  setOwnerInput('');
                }}
              >
                {t.incidents.assign}
              </button>
            </div>
          </div>

          {/* Failed checks */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {t.incidents.failedChecks}
            </div>
            {incident.failed_checks.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>—</div>
            ) : incident.failed_checks.map(c => (
              <div key={c} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)', padding: '2px 0' }}>• {c}</div>
            ))}
          </div>

          {/* Event timeline */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {t.incidents.timeline}
            </div>
            {(incident.events ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>—</div>
            ) : (incident.events ?? []).map(ev => (
              <div key={ev.id} style={{ borderLeft: '2px solid var(--line-2)', paddingLeft: 10, marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{ev.at}</div>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--fg)' }}>{ev.actor}</span>
                  {' — '}
                  <span style={{ color: 'var(--fg-2)' }}>{ev.action}</span>
                </div>
                {ev.note && <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{ev.note}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FailedChecksTab() {
  const [severity, setSeverity] = useState('');
  const { data: checks = [], isLoading, isError, refetch } = useFailedChecks(severity || undefined);
  const navigate = useNavigate();

  const columns: ColDef<FailedCheck>[] = [
    { key: 'sev', header: '', render: c => <StatusDot status={c.severity} size={10} />, width: 32 },
    { key: 'check', header: t.incidents.colCheck, mono: true, render: c => c.check_name },
    { key: 'dataset', header: t.incidents.colDataset, mono: true, render: c => c.dataset },
    {
      key: 'state', header: t.incidents.colState,
      render: c => c.state && c.state !== 'executed' ? <StatePill state={c.state} size="sm" /> : null,
    },
    { key: 'actual', header: t.incidents.colActual, mono: true, render: c => c.actual_value ?? '—' },
    { key: 'expected', header: t.incidents.colExpected, mono: true, render: c => c.expect_expr },
    { key: 'when', header: t.incidents.colWhen, mono: true, render: c => new Date(c.started_at).toLocaleString() },
    {
      key: 'actions', header: '',
      render: c => (
        <button
          onClick={e => { e.stopPropagation(); navigate(`/runs/${c.run_id}`); }}
          style={{ background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          {t.incidents.run}
        </button>
      ),
    },
  ];

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;
  if (isError) return <ErrorBanner onRetry={() => refetch()} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          aria-label={t.common.severity}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
          }}
        >
          <option value="">{t.incidents.allSeverities}</option>
          <option value="critical">{t.status.critical}</option>
          <option value="fail">{t.status.fail}</option>
          <option value="warn">{t.status.warn}</option>
        </select>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <Table
          columns={columns}
          rows={checks}
          rowKey={c => c.id}
          onRowClick={c => navigate(`/objects/${c.dataset}`)}
          empty={t.incidents.emptyChecks}
        />
      </div>
    </div>
  );
}

export default function Incidents() {
  const [status, setStatus] = useSearchParamState('status', 'open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isChecksTab = status === 'checks';

  const { data: incidents = [], isLoading, isError, refetch } =
    useIncidents(isChecksTab ? undefined : status);

  const columns: ColDef<Incident>[] = [
    {
      key: 'sev', header: t.common.severity, width: 110,
      render: i => <StatusPill status={i.severity} size="sm" />,
    },
    { key: 'title', header: t.incidents.colTitle, render: i => i.title },
    { key: 'product', header: t.incidents.colProduct, mono: true, render: i => i.product },
    {
      key: 'owner', header: t.incidents.colOwner,
      render: i => <span style={{ color: i.owner ? 'var(--fg-2)' : 'var(--fg-3)', fontSize: 12 }}>{i.owner || t.incidents.noOwner}</span>,
    },
    {
      key: 'opened', header: t.incidents.colOpened,
      render: i => <span style={{ color: 'var(--fg-3)', fontSize: 12 }} title={new Date(i.opened_at).toLocaleString()}>{relativeTime(i.opened_at)}</span>,
    },
    {
      key: 'sla', header: t.incidents.colSla, width: 120,
      render: i => <IncidentSla incident={i} />,
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.incidents.title}</h1>

      {/* Status tabs (URL-synced via ?status=) */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {TABS.map(tabKey => (
          <button
            key={tabKey}
            onClick={() => { setStatus(tabKey); setSelectedId(null); }}
            style={{
              padding: '8px 16px', border: 'none', background: 'none',
              color: status === tabKey ? 'var(--fg)' : 'var(--fg-3)',
              borderBottom: status === tabKey ? '2px solid var(--cont)' : '2px solid transparent',
              cursor: 'pointer', fontSize: 13,
              marginLeft: tabKey === 'checks' ? 'auto' : undefined,
            }}
          >
            {t.incidents.tabs[tabKey] ?? tabKey}
          </button>
        ))}
      </div>

      {isChecksTab ? (
        <FailedChecksTab />
      ) : (
        <>
          {isError && <ErrorBanner onRetry={() => refetch()} />}
          {isLoading && <TableSkeleton columns={6} />}
          {!isError && !isLoading && (
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
              <Table
                columns={columns}
                rows={incidents.filter(i => i.status === (status as IncidentStatus))}
                rowKey={i => String(i.id)}
                onRowClick={i => setSelectedId(i.id)}
                empty={t.incidents.empty}
              />
            </div>
          )}
        </>
      )}

      {selectedId != null && (
        <IncidentDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

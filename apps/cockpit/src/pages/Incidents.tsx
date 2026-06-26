import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidents, useIncident, useIncidentTransition, useFailedChecks } from '@/api/incidents';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusDot } from '@/components/ui/StatusDot';
import { StatusPill } from '@/components/ui/StatusPill';
import { StatePill } from '@/components/ui/StatePill';
import { IncidentSla } from '@/components/ui/IncidentSla';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { relativeTime, absoluteTime } from '@/lib/time';
import { t } from '@/i18n/de';
import { useRoleStore, canActOnIncidents } from '@/store/role';
import type { FailedCheck, Incident, IncidentStatus } from '@/types';

const TABS = ['open', 'acknowledged', 'investigating', 'resolved', 'checks'] as const;

const drawerBtn = (variant: 'primary' | 'ghost' = 'primary'): React.CSSProperties => ({
  background: variant === 'primary' ? 'var(--cont)' : 'var(--bg-2)',
  color: variant === 'primary' ? '#fff' : 'var(--fg)',
  border: variant === 'primary' ? 'none' : '1px solid var(--line-2)',
  borderRadius: 'var(--r-md)', padding: '6px 12px', fontSize: 12, cursor: 'pointer',
});

function IncidentKindBadge({ kind }: { kind?: Incident['kind'] }) {
  const isGate = kind === 'internal_gate';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 var(--s2)',
      borderRadius: 'var(--r-full)', border: `1px solid ${isGate ? 'var(--qual)' : 'var(--cont)'}`,
      color: isGate ? 'var(--qual)' : 'var(--cont)', fontSize: 11, fontWeight: 650,
      whiteSpace: 'nowrap',
    }}>
      {isGate ? t.incidents.kindGate : t.incidents.kindContract}
    </span>
  );
}

function IncidentDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: incident, isLoading } = useIncident(id);
  const transition = useIncidentTransition(id);
  const navigate = useNavigate();
  const role = useRoleStore(s => s.role);
  const canAct = canActOnIncidents(role); // server re-checks (incidents.py:124)
  const [ownerInput, setOwnerInput] = useState('');
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

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
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.4)' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={incident?.title ?? t.incidents.title}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 100,
          background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
          padding: 'var(--s5)', overflowY: 'auto', boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
        }}
      >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          {incident && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 6 }}>
                <StatusPill status={incident.severity} size="sm" />
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.incidents.statusLabel[incident.status] ?? incident.status}</span>
                <IncidentKindBadge kind={incident.kind} />
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
        <button ref={closeRef} onClick={onClose} aria-label={t.common.close} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>

      {incident && (
        <>
          {/* Read-only roles keep the same layout — actions are marked, not hidden. */}
          {!canAct && <ReadOnlyBanner />}
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap', marginBottom: pendingStatus ? 8 : 16 }}
               title={canAct ? undefined : t.role.noWriteAction}>
            {incident.status === 'open' && (
              <button style={drawerBtn(pendingStatus === 'acknowledged' ? 'primary' : 'ghost')}
                      disabled={!canAct || transition.isPending} onClick={() => requestAct('acknowledged')}>
                {t.incidents.acknowledge}
              </button>
            )}
            {(incident.status === 'open' || incident.status === 'acknowledged') && (
              <button style={drawerBtn(pendingStatus === 'investigating' ? 'primary' : 'ghost')}
                      disabled={!canAct || transition.isPending} onClick={() => requestAct('investigating')}>
                {t.incidents.investigate}
              </button>
            )}
            {incident.status !== 'resolved' && (
              <button style={drawerBtn(pendingStatus === 'resolved' ? 'primary' : 'ghost')}
                      disabled={!canAct || transition.isPending} onClick={() => requestAct('resolved')}>
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
              borderRadius: 'var(--r-md)', padding: 'var(--s3)', marginBottom: 16,
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
                  color: 'var(--fg)', borderRadius: 'var(--r)', padding: '6px 8px', fontSize: 12,
                  resize: 'vertical', boxSizing: 'border-box', display: 'block',
                }}
              />
              <div style={{ display: 'flex', gap: 'var(--s2)', marginTop: 8 }}>
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
            <div style={{ display: 'flex', gap: 'var(--s2)' }}>
              <input
                value={ownerInput}
                onChange={e => setOwnerInput(e.target.value)}
                placeholder={t.incidents.colOwner}
                aria-label={t.incidents.assignOwner}
                style={{
                  flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line-2)',
                  color: 'var(--fg)', borderRadius: 'var(--r-md)', padding: '5px 10px', fontSize: 12,
                }}
              />
              <button
                style={drawerBtn()}
                disabled={!canAct || !ownerInput.trim() || transition.isPending}
                title={canAct ? undefined : t.role.noWriteAction}
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }} title={absoluteTime(ev.at)}>{relativeTime(ev.at)}</div>
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
    </>
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
          style={{ background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 'var(--r)', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          {t.incidents.run}
        </button>
      ),
    },
  ];

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 'var(--s6)' }}>{t.common.loading}</div>;
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
            color: 'var(--fg)', borderRadius: 'var(--r-md)', padding: '5px 10px', fontSize: 12,
          }}
        >
          <option value="">{t.incidents.allSeverities}</option>
          <option value="critical">{t.status.critical}</option>
          <option value="fail">{t.status.fail}</option>
          <option value="warn">{t.status.warn}</option>
        </select>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
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
  const [kindFilter, setKindFilter] = useSearchParamState('kind', 'all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isChecksTab = status === 'checks';
  const serverKind = kindFilter === 'internal_gate' ? 'internal_gate' : undefined;

  const { data: incidents = [], isLoading, isError, refetch } =
    useIncidents(isChecksTab ? undefined : status, undefined, serverKind);

  const filteredIncidents = incidents
    .filter(i => i.status === (status as IncidentStatus))
    .filter(i => {
      if (kindFilter === 'internal_gate') return i.kind === 'internal_gate';
      if (kindFilter === 'contract') return i.kind !== 'internal_gate';
      return true;
    });

  const columns: ColDef<Incident>[] = [
    {
      key: 'sev', header: t.common.severity, width: 110,
      render: i => <StatusPill status={i.severity} size="sm" />,
    },
    {
      key: 'kind', header: t.incidents.filterKind, width: 120,
      render: i => <IncidentKindBadge kind={i.kind} />,
    },
    { key: 'title', header: t.incidents.colTitle, render: i => i.title },
    { key: 'product', header: t.incidents.colProduct, mono: true, render: i => i.product },
    {
      key: 'owner', header: t.incidents.colOwner,
      render: i => <span style={{ color: i.owner ? 'var(--fg-2)' : 'var(--fg-3)', fontSize: 12 }}>{i.owner || t.incidents.noOwner}</span>,
    },
    {
      key: 'opened', header: t.incidents.colOpened,
      render: i => <span style={{ color: 'var(--fg-3)', fontSize: 12 }} title={absoluteTime(i.opened_at)}>{relativeTime(i.opened_at)}</span>,
    },
    {
      key: 'sla', header: t.incidents.colSla, width: 120,
      render: i => <IncidentSla incident={i} />,
    },
  ];

  return (
    <div className="page-full">
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.incidents.title}</h1>

      {/* Status tabs (URL-synced via ?status=) */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
        {TABS.map(tabKey => (
          <button
            key={tabKey}
            onClick={() => { setStatus(tabKey); setSelectedId(null); }}
            style={{
              padding: 'var(--s2) var(--s4)', border: 'none', background: 'none',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t.incidents.filterKind}
            </span>
            {[
              ['all', t.incidents.filterAll],
              ['contract', t.incidents.kindContract],
              ['internal_gate', t.incidents.kindGate],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setKindFilter(value)}
                style={{
                  border: '1px solid var(--line-2)', borderRadius: 'var(--r-full)',
                  padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                  background: kindFilter === value ? 'var(--cont)' : 'var(--bg-2)',
                  color: kindFilter === value ? '#fff' : 'var(--fg-2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {isError && <ErrorBanner onRetry={() => refetch()} />}
          {isLoading && <TableSkeleton columns={7} />}
          {!isError && !isLoading && (
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              <Table
                columns={columns}
                rows={filteredIncidents}
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

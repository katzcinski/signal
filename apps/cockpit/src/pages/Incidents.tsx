import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import {
  useIncidents,
  useIncident,
  useTransitionIncident,
  useAssignIncident,
} from '@/api/incidents';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Incident, IncidentStatus } from '@/types';

const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  resolved: 'Resolved',
};

const STATUS_COLOR: Record<IncidentStatus, string> = {
  open: 'var(--status-crit)',
  acknowledged: 'var(--status-warn)',
  investigating: 'var(--status-warn)',
  resolved: 'var(--status-ok)',
};

function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      border: `1px solid ${STATUS_COLOR[status]}`, color: STATUS_COLOR[status],
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const btn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-2)',
  borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
};

function IncidentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: incident, isLoading } = useIncident(id);
  const transition = useTransitionIncident();
  const assign = useAssignIncident();
  const navigate = useNavigate();
  const [owner, setOwner] = useState('');

  return (
    <div
      role="dialog"
      aria-label="Incident detail"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 50,
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.3)', padding: 20, overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Incident</h2>
        <button onClick={onClose} aria-label="Close" style={btn}>✕</button>
      </div>

      {isLoading || !incident ? (
        <div style={{ color: 'var(--fg-3)' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <StatusDot status={incident.severity} size={10} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{incident.product}</span>
            <StatusBadge status={incident.status} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 8 }}>{incident.summary}</p>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 16 }}>
            Opened {new Date(incident.opened_at).toLocaleString()}
            {incident.owner && <> · owner <strong>{incident.owner}</strong></>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {incident.status !== 'resolved' && (
              <>
                {incident.status === 'open' && (
                  <button style={btn} onClick={() => transition.mutate({ id, status: 'acknowledged' })}>
                    Acknowledge
                  </button>
                )}
                {incident.status !== 'investigating' && (
                  <button style={btn} onClick={() => transition.mutate({ id, status: 'investigating' })}>
                    Investigate
                  </button>
                )}
                <button
                  style={{ ...btn, borderColor: 'var(--status-ok)', color: 'var(--status-ok)' }}
                  onClick={() => transition.mutate({ id, status: 'resolved' })}
                >
                  Resolve
                </button>
              </>
            )}
            <button style={btn} onClick={() => navigate(`/runs/${incident.run_id}`)}>
              Root cause →
            </button>
          </div>

          {/* Assign */}
          {incident.status !== 'resolved' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input
                value={owner}
                onChange={e => setOwner(e.target.value)}
                placeholder="Assign owner…"
                style={{
                  flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line-2)',
                  color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
                }}
              />
              <button
                style={btn}
                disabled={!owner}
                onClick={() => { assign.mutate({ id, owner }); setOwner(''); }}
              >
                Assign
              </button>
            </div>
          )}

          {/* Timeline */}
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 8 }}>
            Timeline
          </h3>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {incident.events.map((e, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11, color: 'var(--fg-3)', minWidth: 130 }}>
                  {new Date(e.at).toLocaleString()}
                </span>
                <span style={{ fontSize: 12 }}>
                  <strong>{e.kind}</strong>
                  {e.actor && <span style={{ color: 'var(--fg-3)' }}> · {e.actor}</span>}
                  {e.detail && <div style={{ color: 'var(--fg-2)' }}>{e.detail}</div>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export default function Incidents() {
  const [statusFilter, setStatusFilter] = useSearchParamState('status');
  const [severityFilter, setSeverityFilter] = useSearchParamState('severity');
  const { data: incidents = [], isLoading, isError, refetch } = useIncidents(statusFilter, severityFilter);
  const [selected, setSelected] = useState<string | null>(null);

  const columns: ColDef<Incident>[] = [
    { key: 'sev', header: '', render: i => <StatusDot status={i.severity} size={10} />, width: 32 },
    { key: 'product', header: 'Product', mono: true, render: i => i.product },
    { key: 'summary', header: 'Summary', render: i => i.summary },
    { key: 'status', header: 'Status', render: i => <StatusBadge status={i.status} /> },
    { key: 'owner', header: 'Owner', render: i => i.owner || '—' },
    { key: 'opened', header: 'Opened', mono: true, render: i => new Date(i.opened_at).toLocaleString() },
  ];

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;

  const select = (
    <select
      value={statusFilter}
      onChange={e => setStatusFilter(e.target.value)}
      style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12 }}
    >
      <option value="">All statuses</option>
      <option value="open">Open</option>
      <option value="acknowledged">Acknowledged</option>
      <option value="investigating">Investigating</option>
      <option value="resolved">Resolved</option>
    </select>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Incidents</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {select}
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12 }}
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="fail">Fail</option>
            <option value="warn">Warn</option>
          </select>
        </div>
      </div>
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {!isError && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <Table
            columns={columns}
            rows={incidents}
            rowKey={i => i.id}
            onRowClick={i => setSelected(i.id)}
            empty={
              <EmptyState
                icon="✓"
                title="No incidents"
                hint={statusFilter || severityFilter
                  ? 'No incidents match the current filters.'
                  : 'All contracts are currently compliant. Incidents open automatically when a contract is breached.'}
              />
            }
          />
        </div>
      )}
      {selected && <IncidentDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

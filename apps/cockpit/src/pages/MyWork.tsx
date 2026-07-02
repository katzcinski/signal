import { useNavigate } from 'react-router-dom';
import { Kpi } from '@/components/ui/Kpi';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { StatusPill } from '@/components/ui/StatusPill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { IncidentSla } from '@/components/ui/IncidentSla';
import { useObjects } from '@/api/objects';
import { useIncidents } from '@/api/incidents';
import { useProposals } from '@/api/proposals';
import { relativeTime, absoluteTime } from '@/lib/time';
import { t } from '@/i18n/de';
import { useRoleStore, ROLE_META } from '@/store/role';
import type { Incident, Proposal } from '@/types';

// UX-N3: role landing "My work". A focused starting point — what's assigned to
// me, what's open in my domains, and the health of those domains — instead of
// the global cockpit grid. Server identity is fuzzy in noauth dev mode, so
// "assigned" keys on the incident owner field; the rest is the open work queue.
const SEVERITY_ORDER: Record<string, number> = { critical: 0, fail: 1, warn: 2 };

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s3)', width: '100%', textAlign: 'left',
        padding: '7px 0', background: 'none', border: 'none',
        borderBottom: '1px solid var(--line)', borderRadius: 0,
        color: 'var(--fg)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function IncidentKindBadge({ incident }: { incident: Incident }) {
  const isGate = incident.kind === 'internal_gate';
  return (
    <span style={{
      border: `1px solid ${isGate ? 'var(--qual)' : 'var(--cont)'}`,
      borderRadius: 'var(--r-full)', color: isGate ? 'var(--qual)' : 'var(--cont)',
      fontSize: 11, fontWeight: 650, padding: '2px 7px', whiteSpace: 'nowrap',
    }}>
      {isGate ? t.incidents.kindGate : t.incidents.kindContract}
    </span>
  );
}

export default function MyWork() {
  const role = useRoleStore(s => s.role);
  const navigate = useNavigate();

  const objectsQuery = useObjects();
  const incidentsQuery = useIncidents();
  const proposalsQuery = useProposals();

  const objects = objectsQuery.data ?? [];
  const incidents = incidentsQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];

  const openIncidents = incidents
    .filter(i => i.status !== 'resolved')
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  const contractBreaches = openIncidents.filter(i => i.kind !== 'internal_gate');
  const engineeringSignals = openIncidents.filter(i => i.kind === 'internal_gate');
  const assigned = openIncidents.filter(i => i.owner);
  const openProposals = proposals.filter(p => p.status === 'open');

  const totalObjects = objects.length;
  const healthy = objects.filter(o => o.status === 'pass').length;
  const healthPct = totalObjects > 0 ? Math.round((healthy / totalObjects) * 100) : 0;

  const subtitle = role === 'viewer'
    ? t.myWork.subtitleViewer
    : t.myWork.subtitleSteward;

  const isLoading = objectsQuery.isLoading || incidentsQuery.isLoading || proposalsQuery.isLoading;

  return (
    <div className="page-full">
      <PageHeader title={t.myWork.title} subtitle={`${ROLE_META[role].label} · ${subtitle}`} />

      {(incidentsQuery.isError || proposalsQuery.isError) && (
        <ErrorBanner onRetry={() => { incidentsQuery.refetch(); proposalsQuery.refetch(); }} />
      )}

      {isLoading ? <KpiSkeleton count={3} /> : (
        <div className="dash-kpis" style={{ marginBottom: 24 }}>
          <Kpi label={t.myWork.openIncidents} value={openIncidents.length} accent="var(--cont)" />
          <Kpi label={t.myWork.openProposals} value={openProposals.length} accent="var(--cont)" />
          <Kpi label={t.cockpit.kpiHealth} value={`${healthPct}%`} accent="var(--qual)" />
        </div>
      )}

      <Panel title={t.myWork.assignedIncidents}>
        {assigned.length === 0 ? (
          <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.myWork.noAssigned}</p>
        ) : assigned.map((i: Incident) => (
          <RowButton key={i.id} onClick={() => navigate(`/incidents?status=${i.status}&kind=${i.kind === 'internal_gate' ? 'internal_gate' : 'contract'}`)}>
            <StatusDot status={i.severity} />
            <IncidentKindBadge incident={i} />
            <span style={{ fontSize: 12, flex: 1 }}>{i.title}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 11 }}>{i.owner}</span>
            <IncidentSla incident={i} />
          </RowButton>
        ))}
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel title={t.myWork.contractBreaches}>
          {contractBreaches.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.myWork.noOpenIncidents}</p>
          ) : contractBreaches.slice(0, 8).map((i: Incident) => (
            <RowButton key={i.id} onClick={() => navigate(`/incidents?status=${i.status}&kind=contract`)}>
              <StatusPill status={i.severity} size="sm" />
              <span style={{ fontSize: 12, flex: 1 }}>{i.title}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 11 }}>{i.product}</span>
              <span style={{ color: 'var(--fg-3)', fontSize: 11 }} title={absoluteTime(i.opened_at)}>{relativeTime(i.opened_at)}</span>
            </RowButton>
          ))}
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title={t.myWork.engineeringSignals}>
          {engineeringSignals.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.myWork.noOpenIncidents}</p>
          ) : engineeringSignals.slice(0, 8).map((i: Incident) => (
            <RowButton key={i.id} onClick={() => navigate(`/incidents?status=${i.status}&kind=internal_gate`)}>
              <StatusPill status={i.severity} size="sm" />
              <span style={{ fontSize: 12, flex: 1 }}>{i.title}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 11 }}>{i.product}</span>
              <span style={{ color: 'var(--fg-3)', fontSize: 11 }} title={absoluteTime(i.opened_at)}>{relativeTime(i.opened_at)}</span>
            </RowButton>
          ))}
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title={t.myWork.openProposals}>
          {openProposals.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.myWork.noProposals}</p>
          ) : openProposals.slice(0, 8).map((p: Proposal) => (
            <RowButton key={p.id} onClick={() => navigate('/proposals')}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1 }}>{p.check_name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 11 }}>{p.product}</span>
              <span style={{ color: 'var(--cont)', fontSize: 11 }}>{t.myWork.review}</span>
            </RowButton>
          ))}
        </Panel>
      </div>
    </div>
  );
}

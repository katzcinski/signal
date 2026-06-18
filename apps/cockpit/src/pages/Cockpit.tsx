import { useNavigate } from 'react-router-dom';
import { Kpi } from '@/components/ui/Kpi';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import { Panel } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Table, type ColDef } from '@/components/ui/Table';
import { OnboardingPanel } from '@/components/OnboardingPanel';
import { StatusHeatmap } from '@/components/StatusHeatmap';
import { DqHealthTrend } from '@/components/DqHealthTrend';
import { FamilyHealthCards } from '@/components/FamilyHealthCards';
import { AttentionPanel } from '@/components/AttentionPanel';
import { useObjects } from '@/api/objects';
import { useIncidents } from '@/api/incidents';
import { useActivity } from '@/api/activity';
import { useCoverageSummary } from '@/api/coverage';
import { useContracts, useContractSla } from '@/api/contracts';
import { relativeTime, absoluteTime } from '@/lib/time';
import { t } from '@/i18n/de';
import type { ActivityItem, Incident, ObjectSummary } from '@/types';

const ACTIVITY_KIND_COLOR: Record<string, string> = {
  incident: 'var(--status-fail)',
  proposal: 'var(--status-warn)',
  contract: 'var(--status-ok)',
};

// UX-N15: recent audit feed — who approved / resolved / decided what.
function ActivityFeed() {
  const { data: items = [], isSuccess } = useActivity(12);
  if (items.length === 0) {
    return <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{isSuccess ? t.activity.empty : '—'}</p>;
  }
  return (
    <div>
      {items.map((it: ActivityItem, i) => {
        const color = ACTIVITY_KIND_COLOR[it.kind] ?? 'var(--fg-3)';
        return (
          <div key={`${it.kind}-${it.ref}-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 0', borderBottom: '1px solid var(--line)',
          }}>
            <span style={{
              fontSize: 10, borderRadius: 4, padding: '2px 6px', minWidth: 64, textAlign: 'center',
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color, border: `1px solid ${color}`,
            }}>
              {t.activity.kind[it.kind] ?? it.kind}
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg)' }}>{it.actor}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.activity.action[it.action] ?? it.action}</span>
            {it.product && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{it.product}</span>}
            <span style={{ flex: 1, fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.summary}
            </span>
            <span title={absoluteTime(it.at)} style={{ fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
              {relativeTime(it.at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, fail: 1, warn: 2 };

function SlaBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>—</span>;
  const color = pct >= 99 ? 'var(--qual)' : pct >= 90 ? 'var(--status-warn)' : 'var(--status-crit)';
  return (
    <div title={`${pct}%`} style={{ display: 'flex', alignItems: 'center', gap: 4, width: 84 }}>
      <div style={{ width: 52, height: 5, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{pct}%</span>
    </div>
  );
}

function SlaRow({ product }: { product: string }) {
  const { data: sla } = useContractSla(product);
  const w = sla?.windows;
  const cur = sla?.current ?? 'unknown';
  const curColor = cur === 'compliant' ? 'var(--qual)' : cur === 'breached' ? 'var(--status-crit)' : 'var(--fg-3)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product}</span>
      <span style={{ fontSize: 11, color: curColor, minWidth: 64 }}>{t.compliance[cur] ?? cur}</span>
      <SlaBar pct={w?.['7d'] ?? null} />
      <SlaBar pct={w?.['30d'] ?? null} />
      <SlaBar pct={w?.['90d'] ?? null} />
    </div>
  );
}

// Status cell: dot + text label — never color-only (U1).
function FamilyStatusCell({ status }: { status: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <StatusDot status={status} />
      <span>{t.status[status] ?? status}</span>
    </span>
  );
}

export default function Cockpit() {
  const objectsQuery = useObjects();
  const incidentsQuery = useIncidents();
  const coverageQuery = useCoverageSummary();
  const contractsQuery = useContracts();
  const { data: objects = [] } = objectsQuery;
  const { data: incidents = [] } = incidentsQuery;
  const { data: contracts = [] } = contractsQuery;
  const activeContracts = contracts.filter(c =>
    c.lifecycle === 'active' && c.kind !== 'internal_gate',
  );
  const coverage = coverageQuery.data;
  const navigate = useNavigate();

  const totalObjects = objects.length;
  const unvalidated = coverage?.unvalidated_30d ?? [];

  const openIncidents = incidents.filter(i => i.status !== 'resolved');
  const criticalIncidents = openIncidents.filter(i => i.severity === 'critical').length;
  const topIncidents = [...openIncidents]
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, 5);

  // U4: empty tenant → guided onboarding instead of the grid.
  if (objectsQuery.isSuccess && !objectsQuery.isError && objects.length === 0) {
    return <OnboardingPanel />;
  }

  // Objekt × Familie matrix — both family statuses per row (WS1-3 StatusGrid).
  const gridColumns: ColDef<ObjectSummary>[] = [
    { key: 'name', header: t.cockpit.colObject, mono: true, render: o => o.name },
    { key: 'space', header: t.cockpit.colSpace, render: o => <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{o.space}</span> },
    { key: 'layer', header: t.cockpit.colLayer, render: o => <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{o.layer}</span> },
    {
      key: 'obs', header: t.cockpit.colObservability,
      render: o => <FamilyStatusCell status={o.family_status?.observability ?? 'unknown'} />,
    },
    {
      key: 'qual', header: t.cockpit.colQuality,
      render: o => <FamilyStatusCell status={o.family_status?.quality ?? 'unknown'} />,
    },
  ];

  return (
    <div className="page-full" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{t.cockpit.title}</h1>
          <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>{t.cockpit.subtitle}</p>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--fg-2)', padding: '4px 12px', borderRadius: 999,
          border: '1px solid var(--line-2)', background: 'var(--bg-1)',
          display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--qual)' }} />
          {t.cockpit.dqFirst}
        </span>
      </div>

      {objectsQuery.isError && <ErrorBanner onRetry={() => objectsQuery.refetch()} />}
      {incidentsQuery.isError && <ErrorBanner onRetry={() => incidentsQuery.refetch()} />}

      {/* Hero: DQ-health trend (left) + per-family rollup & hotspots (right). */}
      <div className="dash-hero">
        <DqHealthTrend />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FamilyHealthCards objects={objects} />
          <AttentionPanel objects={objects} />
        </div>
      </div>

      {/* KPI strip — the at-a-glance numbers. */}
      {objectsQuery.isLoading ? <KpiSkeleton count={5} /> : (
      <div className="dash-kpis">
        <Kpi label={t.cockpit.kpiObjects} value={totalObjects} accent="var(--cont)" />
        <Kpi
          label={t.cockpit.kpiCoverage}
          value={`${coverage?.contract_coverage_pct ?? 0}%`}
          delta={coverage ? `${coverage.with_active_contract}/${coverage.objects_total} ${t.cockpit.coverageOf}` : undefined}
          accent="var(--qual)"
        />
        <Kpi
          label={t.cockpit.kpiOpenIncidents}
          value={openIncidents.length}
          delta={criticalIncidents > 0 ? `${criticalIncidents} ${t.cockpit.critical}` : undefined}
          deltaPositive={false}
          accent={openIncidents.length > 0 ? 'var(--status-fail)' : 'var(--qual)'}
        />
        <Kpi
          label={t.cockpit.kpiGateSignals}
          value={coverage?.gates_failing ?? 0}
          accent={(coverage?.gates_failing ?? 0) > 0 ? 'var(--status-warn)' : 'var(--qual)'}
        />
        <Kpi
          label={t.cockpit.kpiUnvalidated}
          value={unvalidated.length}
          accent={unvalidated.length > 0 ? 'var(--status-warn)' : 'var(--qual)'}
        />
      </div>
      )}

      {/* Primary drill-down: object × family status grid → object detail. */}
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t.cockpit.statusGrid}
        </div>
        <Table
          columns={gridColumns}
          rows={objects}
          rowKey={o => o.id}
          onRowClick={o => navigate(`/objects/${o.id}`)}
          empty={t.cockpit.noObjects}
        />
      </div>

      <StatusHeatmap />

      {/* Operational pair: open incidents + SLA compliance. */}
      <div className="dash-2col">
        <Panel title={t.cockpit.openIncidents}>
          {topIncidents.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {incidentsQuery.isSuccess ? t.cockpit.noIncidents : '—'}
            </p>
          ) : topIncidents.map((i: Incident) => (
            <button
              key={i.id}
              onClick={() => navigate(`/incidents?status=${i.status}&kind=${i.kind === 'internal_gate' ? 'internal_gate' : 'contract'}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '6px 0', background: 'none', border: 'none',
                borderBottom: '1px solid var(--line)', borderRadius: 0,
                color: 'var(--fg)', cursor: 'pointer',
              }}
            >
              <StatusDot status={i.severity} />
              <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 11 }}>{i.product}</span>
              <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{t.incidents.statusLabel[i.status] ?? i.status}</span>
            </button>
          ))}
        </Panel>

        {activeContracts.length > 0 ? (
          <Panel title={t.cockpit.slaTitle}>
            <div style={{ display: 'flex', gap: 16, padding: '0 0 6px 0', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', flex: 1 }}>{t.cockpit.slaProduct}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', minWidth: 64 }}>{t.cockpit.slaCurrent}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', width: 84 }}>{t.cockpit.sla7d}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', width: 84 }}>{t.cockpit.sla30d}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', width: 84 }}>{t.cockpit.sla90d}</span>
            </div>
            {activeContracts.map(c => <SlaRow key={c.product} product={c.product} />)}
          </Panel>
        ) : (
          <Panel title={t.cockpit.slaTitle}>
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.cockpit.slaEmpty}</p>
          </Panel>
        )}
      </div>

      {/* Audit + neglected objects. */}
      <div className="dash-2col">
        <Panel title={t.activity.title}>
          <ActivityFeed />
        </Panel>

        <Panel title={`${t.cockpit.unvalidatedTitle}${unvalidated.length ? ` (${unvalidated.length})` : ''}`}>
          {unvalidated.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {coverageQuery.isSuccess ? t.cockpit.unvalidatedEmpty : '—'}
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--fg-3)', fontSize: 11, marginBottom: 8 }}>{t.cockpit.unvalidatedHint}</p>
              {unvalidated.map(objId => (
                <button
                  key={objId}
                  onClick={() => navigate(`/objects/${objId}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '6px 0', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--line)', borderRadius: 0,
                    color: 'var(--fg)', cursor: 'pointer',
                  }}
                >
                  <StatusDot status="unknown" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{objId}</span>
                  <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{t.common.open} →</span>
                </button>
              ))}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

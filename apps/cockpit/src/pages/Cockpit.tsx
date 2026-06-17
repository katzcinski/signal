import { useNavigate } from 'react-router-dom';
import { Kpi } from '@/components/ui/Kpi';
import { HealthGauge } from '@/components/ui/HealthGauge';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import { Panel } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Table, type ColDef } from '@/components/ui/Table';
import { OnboardingPanel } from '@/components/OnboardingPanel';
import { StatusHeatmap } from '@/components/StatusHeatmap';
import { useObjects } from '@/api/objects';
import { useIncidents } from '@/api/incidents';
import { useActivity } from '@/api/activity';
import { useCoverageSummary, useHealthTrend } from '@/api/coverage';
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
  const { data: healthTrend } = useHealthTrend();
  const { data: objects = [] } = objectsQuery;
  const { data: incidents = [] } = incidentsQuery;
  const coverage = coverageQuery.data;
  const navigate = useNavigate();

  const totalObjects = objects.length;
  const healthyObjects = objects.filter(o => o.status === 'pass').length;
  const healthPct = totalObjects > 0 ? Math.round((healthyObjects / totalObjects) * 100) : 0;
  // UX-N12: run-over-run direction for the gauge (data health latest vs. prior run).
  const healthDelta = healthTrend && healthTrend.current_pct != null && healthTrend.previous_pct != null
    ? healthTrend.current_pct - healthTrend.previous_pct
    : null;
  const healthPrevPct = healthDelta == null ? null : healthPct - healthDelta;
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
    <div className="page-full">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{t.cockpit.title}</h1>
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>{t.cockpit.subtitle}</p>
      </div>

      {objectsQuery.isError && <ErrorBanner onRetry={() => objectsQuery.refetch()} />}
      {incidentsQuery.isError && <ErrorBanner onRetry={() => incidentsQuery.refetch()} />}

      {objectsQuery.isLoading ? <KpiSkeleton count={4} /> : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Kpi label={t.cockpit.kpiObjects} value={totalObjects} accent="var(--cont)" />
        <div style={{
          background: 'var(--bg-1)', border: '1px solid var(--line)',
          borderRadius: 8, borderLeft: '3px solid var(--qual)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px',
        }}>
          <HealthGauge pct={healthPct} prevPct={healthPrevPct} size={96} />
        </div>
        <Kpi
          label={t.cockpit.kpiCoverage}
          value={coverage ? `${Math.round((coverage.with_checks / Math.max(coverage.objects_total, 1)) * 100)}%` : '0%'}
          delta={coverage ? `${coverage.with_checks}/${coverage.objects_total} ${t.cockpit.coverageOf}` : undefined}
          accent="var(--cont)"
        />
        <Kpi
          label={t.cockpit.kpiOpenIncidents}
          value={openIncidents.length}
          delta={criticalIncidents > 0 ? `${criticalIncidents} ${t.cockpit.critical}` : undefined}
          deltaPositive={false}
          accent="var(--cont)"
        />
      </div>
      )}

      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
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

      <Panel title={t.cockpit.openIncidents}>
        {topIncidents.length === 0 ? (
          <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
            {incidentsQuery.isSuccess ? t.cockpit.noIncidents : '—'}
          </p>
        ) : topIncidents.map((i: Incident) => (
          <button
            key={i.id}
            onClick={() => navigate(`/incidents?status=${i.status}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
              padding: '6px 0', background: 'none', border: 'none',
              borderBottom: '1px solid var(--line)', borderRadius: 0,
              color: 'var(--fg)', cursor: 'pointer',
            }}
          >
            <StatusDot status={i.severity} />
            <span style={{ fontSize: 12, flex: 1 }}>{i.title}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: 11 }}>{i.product}</span>
            <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{t.incidents.statusLabel[i.status] ?? i.status}</span>
          </button>
        ))}
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel title={t.activity.title}>
          <ActivityFeed />
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
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
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1 }}>{objId}</span>
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

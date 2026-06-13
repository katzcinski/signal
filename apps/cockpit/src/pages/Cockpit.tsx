import { useNavigate } from 'react-router-dom';
import { Kpi } from '@/components/ui/Kpi';
import { KpiSkeleton } from '@/components/ui/Skeleton';
import { Panel } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Table, type ColDef } from '@/components/ui/Table';
import { OnboardingPanel } from '@/components/OnboardingPanel';
import { useObjects } from '@/api/objects';
import { useIncidents } from '@/api/incidents';
import { useCoverageSummary } from '@/api/coverage';
import { useContracts, useContractSla } from '@/api/contracts';
import { t } from '@/i18n/de';
import type { Incident, ObjectSummary } from '@/types';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, fail: 1, warn: 2 };

function SlaBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>—</span>;
  const color = pct >= 99 ? 'var(--qual)' : pct >= 90 ? '#e6b000' : '#c44';
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
  const curColor = cur === 'compliant' ? 'var(--qual)' : cur === 'breached' ? '#c44' : 'var(--fg-3)';
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
  const activeContracts = contracts.filter(c => c.lifecycle === 'active');
  const coverage = coverageQuery.data;
  const navigate = useNavigate();

  const totalObjects = objects.length;
  const healthyObjects = objects.filter(o => o.status === 'pass').length;
  const healthPct = totalObjects > 0 ? Math.round((healthyObjects / totalObjects) * 100) : 0;
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
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{t.cockpit.title}</h1>
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>{t.cockpit.subtitle}</p>
      </div>

      {objectsQuery.isError && <ErrorBanner onRetry={() => objectsQuery.refetch()} />}
      {incidentsQuery.isError && <ErrorBanner onRetry={() => incidentsQuery.refetch()} />}

      {objectsQuery.isLoading ? <KpiSkeleton count={4} /> : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Kpi label={t.cockpit.kpiObjects} value={totalObjects} accent="var(--cont)" />
        <Kpi label={t.cockpit.kpiHealth} value={`${healthPct}%`} accent="var(--qual)" />
        <Kpi
          label={t.cockpit.kpiCoverage}
          value={`${coverage?.contract_coverage_pct ?? 0}%`}
          delta={coverage ? `${coverage.with_active_contract}/${coverage.objects_total} ${t.cockpit.coverageOf}` : undefined}
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

      {activeContracts.length > 0 && (
        <div style={{ marginTop: 16 }}>
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
        </div>
      )}

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

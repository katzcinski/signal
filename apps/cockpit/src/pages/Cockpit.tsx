import { Kpi } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useObjects } from '@/api/objects';
import { useIncidents } from '@/api/incidents';
import { useNavigate } from 'react-router-dom';

export default function Cockpit() {
  const objectsQuery = useObjects();
  const incidentsQuery = useIncidents();
  const { data: objects = [] } = objectsQuery;
  const { data: incidents = [] } = incidentsQuery;
  const navigate = useNavigate();

  const totalObjects = objects.length;
  const healthyObjects = objects.filter(o => o.status === 'pass').length;
  const healthPct = totalObjects > 0 ? Math.round((healthyObjects / totalObjects) * 100) : 0;
  const activeContracts = objects.filter(o => o.contract_status === 'active').length;
  const criticalIncidents = incidents.filter(i => i.severity === 'critical').length;

  const obsFamilyObjects = objects.filter(o => o.family === 'observability');
  const qualFamilyObjects = objects.filter(o => o.family === 'quality');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>DQ Cockpit</h1>
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>SAP Datasphere — Data Quality & Observability</p>
      </div>

      {objectsQuery.isError && <ErrorBanner onRetry={() => objectsQuery.refetch()} />}
      {incidentsQuery.isError && <ErrorBanner onRetry={() => incidentsQuery.refetch()} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Kpi label="Objects" value={totalObjects} accent="var(--cont)" />
        <Kpi label="Health %" value={`${healthPct}%`} accent="var(--qual)" />
        <Kpi label="Active Contracts" value={activeContracts} accent="var(--cont)" />
        <Kpi
          label="Open Incidents"
          value={incidents.length}
          delta={criticalIncidents > 0 ? `${criticalIncidents} critical` : undefined}
          deltaPositive={false}
          accent="var(--cont)"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Panel title="Observability Objects" family="observability">
          {obsFamilyObjects.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {objectsQuery.isSuccess ? 'No observability objects' : '—'}
            </p>
          ) : obsFamilyObjects.map(o => (
            <div
              key={o.id}
              onClick={() => navigate(`/objects/${o.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.name}</span>
              <StatusDot status={o.status ?? "unknown"} />
            </div>
          ))}
        </Panel>
        <Panel title="Quality Objects" family="quality">
          {qualFamilyObjects.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
              {objectsQuery.isSuccess ? 'No quality objects' : '—'}
            </p>
          ) : qualFamilyObjects.map(o => (
            <div
              key={o.id}
              onClick={() => navigate(`/objects/${o.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.name}</span>
              <StatusDot status={o.status ?? "unknown"} />
            </div>
          ))}
        </Panel>
      </div>

      <Panel title="Recent Incidents">
        {incidents.length === 0 ? (
          <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
            {incidentsQuery.isSuccess ? 'No open incidents' : '—'}
          </p>
        ) : incidents.slice(0, 5).map(i => (
          <div
            key={i.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '6px 0', borderBottom: '1px solid var(--line)',
            }}
          >
            <StatusDot status={i.severity} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1 }}>{i.check_name}</span>
            <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{i.dataset}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

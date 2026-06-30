import { lazy, Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProduct } from '@/api/products';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Panel } from '@/components/ui/Panel';
import { StatusPill } from '@/components/ui/StatusPill';
import { Table, type ColDef } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type {
  ProductFinding,
  ProductInterior,
  ProductPort,
  ProductUpstreamRiskEntry,
} from '@/types';

const LineageMiniGraph = lazy(() =>
  import('@/components/LineageMiniGraph').then(module => ({ default: module.LineageMiniGraph })),
);

function OwnerChips({ owners }: { owners: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {owners.map(owner => (
        <span
          key={owner}
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r)',
            color: 'var(--fg-2)',
            fontSize: 11,
            padding: '2px 7px',
          }}
        >
          {owner}
        </span>
      ))}
    </div>
  );
}

function groupFindings(findings: ProductFinding[]) {
  return findings.reduce<Record<string, ProductFinding[]>>((groups, finding) => {
    const next = groups;
    const key = finding.finding_type;
    next[key] = [...(next[key] ?? []), finding];
    return next;
  }, {});
}

export default function ProductDetail() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useProduct(name);

  if (isLoading) {
    return (
      <div className="page-full">
        <TableSkeleton columns={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-full">
        <ErrorBanner onRetry={() => refetch()} />
      </div>
    );
  }

  if (!data) {
    return <div style={{ color: 'var(--fg-3)', padding: 'var(--s6)' }}>{t.common.notFound}</div>;
  }

  const portColumns: ColDef<ProductPort>[] = [
    {
      key: 'dataset',
      header: t.products.colDataset,
      mono: true,
      sortable: true,
      sortValue: row => row.dataset,
      render: row => <Link to={`/objects/${encodeURIComponent(row.dataset)}`} style={{ color: 'var(--cont)' }}>{row.dataset}</Link>,
    },
    { key: 'kind', header: t.products.colKind, render: row => row.kind ?? '-' },
    { key: 'compliance', header: t.products.colCompliance, render: row => row.compliance ? <StatusPill status={row.compliance} size="sm" /> : '-' },
    { key: 'version', header: t.common.version, mono: true, render: row => row.version ?? '-' },
    { key: 'lifecycle', header: t.products.colLifecycle, render: row => row.lifecycle ? (t.lifecycle[row.lifecycle] ?? row.lifecycle) : '-' },
  ];

  const interiorColumns: ColDef<ProductInterior>[] = [
    {
      key: 'id',
      header: t.products.colObject,
      mono: true,
      sortable: true,
      sortValue: row => row.id,
      render: row => <Link to={`/objects/${encodeURIComponent(row.id)}`} style={{ color: 'var(--cont)' }}>{row.id}</Link>,
    },
    { key: 'layer', header: t.products.colLayer, render: row => row.layer ?? '-' },
    { key: 'role', header: t.products.colRole, render: row => row.role ?? '-' },
    { key: 'coverage', header: t.products.colCoverage, render: row => row.coverage_flag ?? '-' },
  ];

  const riskColumns: ColDef<ProductUpstreamRiskEntry>[] = [
    { key: 'product', header: t.products.colProduct, mono: true, render: row => row.product },
    { key: 'pinned', header: t.products.colPinned, mono: true, render: row => row.pinned_version },
    { key: 'current', header: t.products.colCurrent, mono: true, render: row => row.current_version ?? '-' },
    { key: 'compliance', header: t.products.colCompliance, render: row => row.compliance ? <StatusPill status={row.compliance} size="sm" /> : '-' },
    { key: 'breach', header: t.products.colBreach, render: row => row.upstream_breach ? t.products.yes : t.products.no },
    { key: 'drift', header: t.products.colDrift, render: row => row.version_drift ? t.products.yes : t.products.no },
  ];

  const findingGroups = groupFindings(data.findings);

  return (
    <div className="page-full">
      <Breadcrumbs items={[
        { label: t.breadcrumb.home, to: '/' },
        { label: t.products.title, to: '/products' },
        { label: data.product },
      ]} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/products')} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}>
          {t.common.back}
        </button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}>{data.product}</span>
            <StatusPill status={data.own_health} size="sm" />
            <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.lifecycle[data.lifecycle] ?? data.lifecycle}</span>
          </div>
          <div style={{ marginTop: 6 }}><OwnerChips owners={data.owners} /></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--s4)' }}>
        {data.upstream_risk.length > 0 && (
          <Panel title={t.products.upstreamRiskTitle} family="contract">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 10, color: 'var(--fg-3)', fontSize: 12 }}>
              <span style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '1px 6px' }}>
                {t.products.nonContagious}
              </span>
            </div>
            <Table columns={riskColumns} rows={data.upstream_risk} rowKey={row => row.product} />
          </Panel>
        )}

        {data.findings.length > 0 && (
          <Panel title={t.products.findingsTitle} family="quality">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(findingGroups).map(([type, findings]) => (
                <div key={type}>
                  <div style={{ color: 'var(--fg-3)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase' }}>
                    {t.products.findingTypes[type] ?? type}
                  </div>
                  {findings.map(finding => (
                    <div key={`${finding.finding_type}-${finding.scope ?? 'none'}-${finding.object_id}`} style={{
                      borderLeft: '3px solid var(--status-warn)',
                      background: 'var(--bg-2)',
                      borderRadius: 'var(--r-md)',
                      color: 'var(--fg-2)',
                      fontSize: 12,
                      marginBottom: 6,
                      padding: '7px 10px',
                    }}>
                      <code>{finding.object_id}</code>
                      <span style={{ color: 'var(--fg-3)' }}> · {finding.detail}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title={t.products.portsTitle} family="contract">
          <Table columns={portColumns} rows={data.ports} rowKey={row => row.dataset} empty={t.products.noPorts} />
        </Panel>

        <Panel title={t.products.interiorTitle} family="quality">
          <Table columns={interiorColumns} rows={data.interior} rowKey={row => row.id} empty={t.products.noInterior} />
        </Panel>

        <Panel title={t.products.lineageTitle} family="observability">
          <Suspense fallback={<div style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.common.loading}</div>}>
            <LineageMiniGraph subgraph={data.subgraph} />
          </Suspense>
        </Panel>
      </div>
    </div>
  );
}

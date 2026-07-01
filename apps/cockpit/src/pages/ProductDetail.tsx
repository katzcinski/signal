import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProduct } from '@/api/products';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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

function SectionCount({ value }: { value: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 26,
        padding: '1px 8px',
        borderRadius: 'var(--r-full)',
        border: '1px solid var(--line-2)',
        background: 'var(--bg-2)',
        color: 'var(--fg-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}
    >
      {value}
    </span>
  );
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ProfileFact({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      }}
    >
      <span className="mono-label">{label}</span>
      <div style={{ color: 'var(--fg)', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{value}</div>
      {hint ? <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{hint}</span> : null}
    </div>
  );
}

function RiskFlags({ entry }: { entry: ProductUpstreamRiskEntry }) {
  const flags: Array<{ label: string; color: string }> = [];
  if (entry.upstream_breach) flags.push({ label: 'Breach', color: 'var(--status-fail)' });
  if (entry.version_drift) flags.push({ label: 'Version drift', color: 'var(--status-warn)' });
  if (flags.length === 0 && entry.compliance) flags.push({ label: entry.compliance, color: 'var(--fg-2)' });

  return (
    <div style={{ display: 'flex', gap: 'var(--s1)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {flags.map(flag => (
        <span
          key={flag.label}
          style={{
            borderRadius: 'var(--r-full)',
            border: `1px solid color-mix(in srgb, ${flag.color} 45%, var(--line-2))`,
            background: `color-mix(in srgb, ${flag.color} 12%, var(--bg-2))`,
            color: flag.color,
            fontSize: 10,
            padding: '1px 7px',
            whiteSpace: 'nowrap',
          }}
        >
          {flag.label}
        </span>
      ))}
    </div>
  );
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
      render: row => (
        <Link to={`/objects/${encodeURIComponent(row.dataset)}`} style={{ color: 'var(--cont)' }}>
          {row.dataset}
        </Link>
      ),
    },
    { key: 'kind', header: t.products.colKind, render: row => row.kind ?? '-' },
    {
      key: 'compliance',
      header: t.products.colCompliance,
      render: row => row.compliance ? <StatusPill status={row.compliance} size="sm" /> : '-',
    },
    { key: 'version', header: t.common.version, mono: true, render: row => row.version ?? '-' },
    {
      key: 'lifecycle',
      header: t.products.colLifecycle,
      render: row => row.lifecycle ? (t.lifecycle[row.lifecycle] ?? row.lifecycle) : '-',
    },
  ];

  const interiorColumns: ColDef<ProductInterior>[] = [
    {
      key: 'id',
      header: t.products.colObject,
      mono: true,
      sortable: true,
      sortValue: row => row.id,
      render: row => (
        <Link to={`/objects/${encodeURIComponent(row.id)}`} style={{ color: 'var(--cont)' }}>
          {row.id}
        </Link>
      ),
    },
    { key: 'layer', header: t.products.colLayer, render: row => row.layer ?? '-' },
    { key: 'role', header: t.products.colRole, render: row => row.role ?? '-' },
    { key: 'coverage', header: t.products.colCoverage, render: row => row.coverage_flag ?? '-' },
  ];

  const findingGroups = groupFindings(data.findings);
  const lifecycleLabel = t.lifecycle[data.lifecycle] ?? data.lifecycle;
  const activePorts = data.ports.filter(port => port.lifecycle === 'active').length;
  const mappedLayers = new Set(data.interior.map(item => item.layer).filter(Boolean)).size;
  const sourceCount = data.inbound_sources.length;
  const actionableRisk = data.upstream_risk.filter(item => item.upstream_breach || item.version_drift).length;
  const sparseLineage = data.subgraph.nodes.length <= 1 || data.subgraph.edges.length === 0;
  const productSummary = [
    `${pluralize(data.ports.length, 'published port')}`,
    sourceCount > 0 ? `${pluralize(sourceCount, 'inbound source')} in the current extract` : 'no inbound sources in the current extract',
    data.interior.length > 0 ? `${pluralize(data.interior.length, 'mapped interior object')}` : 'no mapped interior yet',
  ].join(' • ');

  return (
    <div className="page-full">
      <Breadcrumbs items={[
        { label: t.breadcrumb.home, to: '/' },
        { label: t.products.title, to: '/products' },
        { label: data.product },
      ]}
      />

      <div className="product-shell">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)', flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
            {t.common.back}
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexWrap: 'wrap' }}>
            <StatusPill status={data.own_health} size="sm" />
            <span
              style={{
                borderRadius: 'var(--r-full)',
                border: '1px solid var(--line-2)',
                background: 'var(--bg-2)',
                color: 'var(--fg-2)',
                fontSize: 11,
                padding: '1px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              {lifecycleLabel}
            </span>
          </div>
        </div>

        <div className="product-hero">
          <Card accent="var(--cont)" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              <span className="mono-label">Product profile</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, lineHeight: 1.05 }}>
                {data.product}
              </span>
              <p style={{ color: 'var(--fg-2)', fontSize: 13, lineHeight: 1.6, maxWidth: 680 }}>
                {productSummary}
              </p>
            </div>

            <div className="product-profile-grid">
              <div className="product-profile-section">
                <ProfileFact label="Owners" value={<OwnerChips owners={data.owners} />} />
                <ProfileFact label="Lifecycle" value={lifecycleLabel} />
                <ProfileFact label="Health" value={<StatusPill status={data.own_health} size="sm" />} />
              </div>

              <div className="product-profile-section">
                <ProfileFact label="Ports" value={data.ports.length} hint={`${activePorts} active contracts`} />
                <ProfileFact
                  label="Structure"
                  value={`${data.interior.length} interior / ${sourceCount} sources`}
                  hint={mappedLayers > 0 ? `${mappedLayers} mapped layers` : 'structure not mapped yet'}
                />
                <ProfileFact
                  label="Current signal"
                  value={actionableRisk > 0 ? `${actionableRisk} upstream mismatch${actionableRisk === 1 ? '' : 'es'}` : 'No upstream mismatches'}
                  hint={data.findings.length > 0 ? `${data.findings.length} findings still open` : 'No active findings'}
                />
              </div>
            </div>

          </Card>

          <Card
            className="product-lineage-card"
            accent="var(--obs)"
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
              <span className="mono-label">Lineage</span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s3)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>
                  {sparseLineage ? 'Mapped object' : 'Upstream lineage'}
                </span>
                <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>
                  {data.subgraph.nodes.length} nodes / {data.subgraph.edges.length} edges
                </span>
              </div>
              <p style={{ color: 'var(--fg-3)', fontSize: 12, lineHeight: 1.5 }}>
                {sparseLineage
                  ? 'No mapped upstream objects were found for this product in the current extract.'
                  : 'Open any node to inspect the upstream object detail.'}
              </p>
            </div>
            <Suspense fallback={<div style={{ color: 'var(--fg-3)', fontSize: 12, minHeight: 280 }}>{t.common.loading}</div>}>
              <LineageMiniGraph subgraph={data.subgraph} />
            </Suspense>
          </Card>
        </div>

        <div className="product-body-grid">
          <div className="product-body-column">
            <Panel title={t.products.portsTitle} family="contract" actions={<SectionCount value={data.ports.length} />}>
              <Table columns={portColumns} rows={data.ports} rowKey={row => row.dataset} empty={t.products.noPorts} />
            </Panel>

            <Panel title={t.products.interiorTitle} family="quality" actions={<SectionCount value={data.interior.length} />}>
              <Table columns={interiorColumns} rows={data.interior} rowKey={row => row.id} empty={t.products.noInterior} />
            </Panel>
          </div>

          <div className="product-body-column">
            <Card
              pad="md"
              accent={data.findings.length > 0 ? 'var(--status-warn)' : 'var(--qual)'}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{t.products.findingsTitle}</span>
                <SectionCount value={data.findings.length} />
              </div>
              {data.findings.length === 0 ? (
                <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
                  No active findings across ports or interior objects.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                  {Object.entries(findingGroups).map(([type, findings]) => (
                    <div key={type}>
                      <div style={{ color: 'var(--fg-3)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase' }}>
                        {t.products.findingTypes[type] ?? type}
                      </div>
                      {findings.map(finding => (
                        <div
                          key={`${finding.finding_type}-${finding.scope ?? 'none'}-${finding.object_id}`}
                          style={{
                            borderLeft: '3px solid var(--status-warn)',
                            background: 'var(--bg-2)',
                            borderRadius: 'var(--r-md)',
                            color: 'var(--fg-2)',
                            fontSize: 12,
                            marginBottom: 6,
                            padding: '7px 10px',
                          }}
                        >
                          <code>{finding.object_id}</code>
                          <span style={{ color: 'var(--fg-3)' }}> - {finding.detail}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              pad="md"
              accent={actionableRisk > 0 ? 'var(--status-fail)' : 'var(--qual)'}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{t.products.upstreamRiskTitle}</span>
                <SectionCount value={data.upstream_risk.length} />
              </div>
              {data.upstream_risk.length === 0 ? (
                <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>
                  No pinned-version drift or upstream breach signals detected.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                  {data.upstream_risk.slice(0, 4).map(entry => (
                    <Link
                      key={entry.product}
                      to={`/products/${encodeURIComponent(entry.product)}`}
                      className="product-summary-link"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--s3)',
                        padding: 'var(--s3)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--r-md)',
                        background: 'var(--bg-2)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexWrap: 'wrap' }}>
                          <span className="mono-label">Upstream product</span>
                          <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>Open detail</span>
                        </div>
                        <div style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                          {entry.product}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap', marginTop: 6 }}>
                          <span style={{
                            borderRadius: 'var(--r-full)',
                            border: '1px solid var(--line-2)',
                            background: 'var(--bg-1)',
                            color: 'var(--fg-2)',
                            fontSize: 10,
                            padding: '1px 7px',
                          }}
                          >
                            pinned {entry.pinned_version}
                          </span>
                          <span style={{
                            borderRadius: 'var(--r-full)',
                            border: '1px solid var(--line-2)',
                            background: 'var(--bg-1)',
                            color: 'var(--fg-2)',
                            fontSize: 10,
                            padding: '1px 7px',
                          }}
                          >
                            current {entry.current_version ?? '-'}
                          </span>
                        </div>
                      </div>
                      <RiskFlags entry={entry} />
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

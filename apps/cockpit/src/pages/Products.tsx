import { useNavigate } from 'react-router-dom';
import { useProducts } from '@/api/products';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { OwnershipTag } from '@/components/ui/OwnershipTag';
import { StatusPill } from '@/components/ui/StatusPill';
import { Table, type ColDef } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type { ProductListItem } from '@/types';

function OwnerList({ owners }: { owners: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <OwnershipTag ownedBy="product" />
      {owners.map(owner => (
        <span key={owner} style={{ color: 'var(--fg-2)', fontSize: 12 }}>{owner}</span>
      ))}
    </div>
  );
}

function LifecycleTag({ lifecycle }: { lifecycle: string }) {
  const color = lifecycle === 'active'
    ? 'var(--status-ok)'
    : lifecycle === 'deprecated'
      ? 'var(--status-stale)'
      : 'var(--fg-3)';
  return (
    <span style={{
      background: `${color}1A`,
      border: `1px solid ${color}55`,
      borderRadius: 'var(--r)',
      color,
      display: 'inline-flex',
      fontSize: 10,
      padding: '1px 6px',
      whiteSpace: 'nowrap',
    }}>
      {t.lifecycle[lifecycle] ?? lifecycle}
    </span>
  );
}

export default function Products() {
  const { data: products = [], isLoading, isError, refetch } = useProducts();
  const navigate = useNavigate();

  const columns: ColDef<ProductListItem>[] = [
    {
      key: 'product',
      header: t.products.colProduct,
      mono: true,
      sortable: true,
      sortValue: row => row.product,
      render: row => row.product,
    },
    {
      key: 'owners',
      header: t.products.colOwners,
      sortable: true,
      sortValue: row => row.owners.join(','),
      render: row => <OwnerList owners={row.owners} />,
    },
    {
      key: 'health',
      header: t.products.colHealth,
      sortable: true,
      sortValue: row => row.own_health,
      render: row => <StatusPill status={row.own_health} size="sm" />,
    },
    {
      key: 'ports',
      header: t.products.colPorts,
      sortable: true,
      sortValue: row => row.port_count,
      render: row => <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{row.port_count}</span>,
    },
    {
      key: 'findings',
      header: t.products.colFindings,
      sortable: true,
      sortValue: row => row.finding_count,
      render: row => (
        <span style={{ color: row.finding_count > 0 ? 'var(--status-warn)' : 'var(--fg-3)', fontSize: 12 }}>
          {row.finding_count}
        </span>
      ),
    },
    {
      key: 'risk',
      header: t.products.colUpstreamRisk,
      sortable: true,
      sortValue: row => row.upstream_risk_count,
      render: row => (
        <span style={{ color: row.upstream_risk_count > 0 ? 'var(--status-warn)' : 'var(--fg-3)', fontSize: 12 }}>
          {row.upstream_risk_count}
        </span>
      ),
    },
    {
      key: 'lifecycle',
      header: t.products.colLifecycle,
      sortable: true,
      sortValue: row => row.lifecycle,
      render: row => <LifecycleTag lifecycle={row.lifecycle} />,
    },
  ];

  if (isLoading) {
    return (
      <div className="page-full">
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.products.title}</h1>
        <TableSkeleton columns={7} />
      </div>
    );
  }

  return (
    <div className="page-full">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.products.title}</h1>
      </div>
      {isError ? (
        <ErrorBanner onRetry={() => refetch()} />
      ) : (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <Table
            columns={columns}
            rows={products}
            rowKey={row => row.product}
            onRowClick={row => navigate(`/products/${encodeURIComponent(row.product)}`)}
            empty={t.products.empty}
          />
        </div>
      )}
    </div>
  );
}

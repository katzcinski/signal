import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';
import { useContracts } from '@/api/contracts';
import { useCoverageSummary } from '@/api/coverage';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { Panel } from '@/components/ui/Panel';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Table, type ColDef } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type { Lifecycle, ObjectSummary } from '@/types';

export default function Governance() {
  const { data: objects = [], isLoading, isError, refetch } = useObjects();
  const contractsQuery = useContracts();
  const coverageQuery = useCoverageSummary();
  const navigate = useNavigate();
  const boundaryContracts = (contractsQuery.data ?? []).filter(c => c.kind !== 'internal_gate');
  const contractByProduct = new Map(boundaryContracts.map(c => [c.product, c]));
  const activeContracts = boundaryContracts.filter(c => c.lifecycle === 'active');
  const loading = isLoading || contractsQuery.isLoading;
  const error = isError || contractsQuery.isError;

  const statusColumns: ColDef<ObjectSummary>[] = [
    { key: 'object', header: t.governance.colObject, mono: true, sortable: true, sortValue: o => o.name, render: o => o.name },
    { key: 'space', header: t.governance.colSpace, sortable: true, sortValue: o => o.space, render: o => <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{o.space}</span> },
    {
      key: 'lifecycle', header: t.governance.colLifecycle,
      render: o => <LifecycleStepper current={(contractByProduct.get(o.id)?.lifecycle || 'draft') as Lifecycle} />,
    },
    {
      key: 'hasContract', header: t.governance.colHasContract, sortable: true,
      sortValue: o => (contractByProduct.has(o.id) ? 1 : 0),
      render: o => (
        <span style={{ fontSize: 12, color: contractByProduct.has(o.id) ? 'var(--status-ok)' : 'var(--status-fail)' }}>
          {contractByProduct.has(o.id) ? t.governance.yes : t.governance.no}
        </span>
      ),
    },
  ];

  return (
    <div className="page-full">
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{t.governance.title}</h1>

      <div className="dash-2col" style={{ marginBottom: 24 }}>
        <Panel title={t.governance.g1Title} family="contract">
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {t.governance.g1Policy.map((p, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 6, lineHeight: 1.6 }}>{p}</li>
            ))}
          </ul>
        </Panel>
        <Panel title={t.governance.lifecycleTitle} family="contract">
          <p style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 12 }}>
            {t.governance.lifecycleDesc1}<strong>{t.governance.lifecycleDescActive}</strong>{t.governance.lifecycleDesc2}
          </p>
          <LifecycleStepper current="active" />
        </Panel>
      </div>

      <div style={{ display: 'flex', gap: 'var(--s3)', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 'var(--s2) var(--s3)', fontSize: 12, color: 'var(--fg-2)' }}>
          {t.cockpit.slaTitle}: <strong style={{ color: 'var(--fg)' }}>{activeContracts.length}</strong>
        </span>
        <span style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 'var(--s2) var(--s3)', fontSize: 12, color: 'var(--fg-2)' }}>
          {t.governance.contractsBreached}: <strong style={{ color: 'var(--fg)' }}>{coverageQuery.data?.contracts_breached ?? 0}</strong>
        </span>
      </div>

      {!loading && activeContracts.length === 0 && (
        <div style={{
          background: 'color-mix(in srgb, var(--cont) 8%, transparent)',
          border: '1px solid var(--cont)',
          borderRadius: 'var(--r-lg)', padding: 'var(--s3) var(--s4)', marginBottom: 16,
          fontSize: 12, color: 'var(--fg-2)',
        }}>
          {t.governance.noActiveContracts}
        </div>
      )}

      <Panel title={t.governance.objectStatusTitle}>
        {error ? (
          <ErrorBanner onRetry={() => { refetch(); contractsQuery.refetch(); }} />
        ) : loading ? (
          <TableSkeleton columns={4} />
        ) : (
          <Table
            columns={statusColumns}
            rows={objects}
            rowKey={o => o.id}
            onRowClick={o => navigate(`/objects/${o.id}`)}
            empty={t.governance.noObjects}
          />
        )}
      </Panel>
    </div>
  );
}

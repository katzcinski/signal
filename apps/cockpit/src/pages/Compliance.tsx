import { useObjects } from '@/api/objects';
import { useContracts } from '@/api/contracts';
import { useCoverageSummary } from '@/api/coverage';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { Panel } from '@/components/ui/Panel';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type { Lifecycle } from '@/types';

export default function Governance() {
  const { data: objects = [], isLoading, isError, refetch } = useObjects();
  const contractsQuery = useContracts();
  const coverageQuery = useCoverageSummary();
  const boundaryContracts = (contractsQuery.data ?? []).filter(c => c.kind !== 'internal_gate');
  const contractByProduct = new Map(boundaryContracts.map(c => [c.product, c]));
  const activeContracts = boundaryContracts.filter(c => c.lifecycle === 'active');
  const loading = isLoading || contractsQuery.isLoading;
  const error = isError || contractsQuery.isError;

  return (
    <div className="page-full">
      <PageHeader title={t.governance.title} />

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
          {t.governance.noActiveContractsPre}
          <strong>{t.governance.noActiveContractsArea}</strong>
          {t.governance.noActiveContractsPost}
        </div>
      )}

      <Panel title={t.governance.objectStatusTitle}>
        {error ? (
          <ErrorBanner onRetry={() => { refetch(); contractsQuery.refetch(); }} />
        ) : loading ? (
          <TableSkeleton columns={4} />
        ) : objects.length === 0 ? (
          <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.governance.noObjects}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[t.governance.colObject, t.governance.colSpace, t.governance.colLifecycle, t.governance.colHasContract].map(h => (
                    <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {objects.map(o => {
                  const contract = contractByProduct.get(o.id);
                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: 'var(--s2) var(--s3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.name}</td>
                      <td style={{ padding: 'var(--s2) var(--s3)', color: 'var(--fg-3)', fontSize: 12 }}>{o.space}</td>
                      <td style={{ padding: 'var(--s2) var(--s3)' }}>
                        <LifecycleStepper current={(contract?.lifecycle || 'draft') as Lifecycle} />
                      </td>
                      <td style={{ padding: 'var(--s2) var(--s3)', fontSize: 12, color: contract ? 'var(--status-ok)' : 'var(--status-fail)' }}>
                        {contract ? t.governance.yes : t.governance.no}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

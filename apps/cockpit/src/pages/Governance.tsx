import { useObjects } from '@/api/objects';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { Panel } from '@/components/ui/Panel';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type { Lifecycle } from '@/types';

export default function Governance() {
  const { data: objects = [], isLoading, isError, refetch } = useObjects();

  return (
    <div className="page-full">
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{t.governance.title}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
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

      <Panel title={t.governance.objectStatusTitle}>
        {isError ? (
          <ErrorBanner onRetry={() => refetch()} />
        ) : isLoading ? (
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
                {objects.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--fg-3)', fontSize: 12 }}>{o.space}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <LifecycleStepper current={(o.contract_status || 'draft') as Lifecycle} />
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: o.contract_status ? 'var(--status-ok)' : 'var(--status-fail)' }}>
                      {o.contract_status ? t.governance.yes : t.governance.no}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

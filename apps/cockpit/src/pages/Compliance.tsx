import { useObjects } from '@/api/objects';
import { useContracts, useContractSla } from '@/api/contracts';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { Panel } from '@/components/ui/Panel';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { t } from '@/i18n/de';
import type { Lifecycle } from '@/types';

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

export default function Compliance() {
  const { data: objects = [], isLoading, isError, refetch } = useObjects();
  const { data: contracts = [] } = useContracts();
  const activeContracts = contracts.filter(c => c.lifecycle === 'active');

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

      {activeContracts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Panel title={t.governance.slaTitle}>
            <div style={{ display: 'flex', gap: 16, padding: '0 0 6px 0', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', flex: 1 }}>{t.governance.slaProduct}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', minWidth: 64 }}>{t.governance.slaCurrent}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', width: 84 }}>{t.governance.sla7d}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', width: 84 }}>{t.governance.sla30d}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-3)', width: 84 }}>{t.governance.sla90d}</span>
            </div>
            {activeContracts.map(c => <SlaRow key={c.product} product={c.product} />)}
          </Panel>
        </div>
      )}

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

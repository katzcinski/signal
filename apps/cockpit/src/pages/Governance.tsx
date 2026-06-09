import { useObjects } from '@/api/objects';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { Panel } from '@/components/ui/Panel';
import type { Lifecycle } from '@/types';

const G1_POLICY = [
  'Contract guarantees must not contain SQL keywords (SELECT, INSERT, UPDATE, DELETE, DROP, EXEC).',
  'All string values in the guarantees block are scanned at PUT time.',
  'Violations are rejected with HTTP 422 and error code G1.',
];

export default function Governance() {
  const { data: objects = [] } = useObjects();
  const withContract = objects.filter(o => o.has_contract);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Governance</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Panel title="Gate G1 — SQL-free Contracts" family="contract">
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {G1_POLICY.map((p, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 6, lineHeight: 1.6 }}>{p}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Contract Lifecycle Policy" family="contract">
          <p style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 12 }}>
            Contracts progress through three states. Compiled checks are only generated from <strong>active</strong> contracts.
          </p>
          <LifecycleStepper current="active" />
        </Panel>
      </div>

      <Panel title="Object Lifecycle Status">
        {objects.length === 0 ? (
          <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>No objects</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Object', 'Space', 'Contract Lifecycle', 'Has Contract'].map(h => (
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
                      <LifecycleStepper current={(o.lifecycle ?? 'draft') as Lifecycle} />
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: o.has_contract ? 'var(--status-ok)' : 'var(--status-fail)' }}>
                      {o.has_contract ? '✓ Yes' : '○ No'}
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

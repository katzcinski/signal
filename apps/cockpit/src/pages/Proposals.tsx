import { useProposals, useProposalAction } from '@/api/proposals';
import type { Proposal } from '@/types';

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'var(--status-ok)' : pct >= 50 ? 'var(--status-warn)' : 'var(--status-fail)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--fg-2)', width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const action = useProposalAction();
  const act = (a: 'accept' | 'reject' | 'snooze') => action.mutate({ id: proposal.id, action: a });

  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>
            {proposal.check_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{proposal.product}</div>
        </div>
        <span style={{
          background: 'var(--bg-3)', border: '1px solid var(--line-2)',
          borderRadius: 4, padding: '2px 8px', fontSize: 10, color: 'var(--fg-3)',
        }}>
          {proposal.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>Current</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
            {proposal.current_expect || '—'}
          </code>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>Proposed</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--qual)' }}>
            {proposal.proposed_expect}
          </code>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 6 }}>Confidence</div>
        <ConfidenceBar value={proposal.confidence} />
      </div>

      {proposal.stats && (
        <div style={{
          background: 'var(--bg-2)', borderRadius: 5, padding: '8px 12px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        }}>
          {(['n', 'min', 'max', 'mean'] as const).map(k => (
            <div key={k}>
              <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
                {typeof proposal.stats![k] === 'number' ? (proposal.stats![k] as number).toFixed(k === 'n' ? 0 : 1) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--fg-3)', fontStyle: 'italic' }}>{proposal.rationale}</div>

      {proposal.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => act('accept')} style={{ flex: 1, background: 'var(--qual)22', border: '1px solid var(--qual)', color: 'var(--qual)', borderRadius: 5, padding: '6px 0', fontSize: 12, cursor: 'pointer' }}>
            Accept
          </button>
          <button onClick={() => act('snooze')} style={{ flex: 1, background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 5, padding: '6px 0', fontSize: 12, cursor: 'pointer' }}>
            Snooze
          </button>
          <button onClick={() => act('reject')} style={{ flex: 1, background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', color: 'var(--status-fail)', borderRadius: 5, padding: '6px 0', fontSize: 12, cursor: 'pointer' }}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function Proposals() {
  const { data: proposals = [], isLoading } = useProposals();
  const pending = proposals.filter(p => p.status === 'pending');
  const others  = proposals.filter(p => p.status !== 'pending');

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Proposals</h1>
      {proposals.length === 0 && (
        <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>
          No proposals yet — run checks on enough datasets to generate suggestions.
        </div>
      )}
      {pending.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Pending ({pending.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
            {pending.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
      {others.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Reviewed ({others.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {others.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

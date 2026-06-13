import { useProposals, useProposalAction } from '@/api/proposals';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { t } from '@/i18n/de';
import { useRoleStore, canAcceptProposal } from '@/store/role';
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
  const role = useRoleStore(s => s.role);
  // FE mirror only — the server re-checks role × ownership on accept (S-2).
  const canWrite = canAcceptProposal(role);
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
          {t.proposals.statusLabel[proposal.status] ?? proposal.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.proposals.current}</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
            {proposal.current_expect || '—'}
          </code>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.proposals.proposed}</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-ok)' }}>
            {proposal.proposed_expect}
          </code>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 6 }}>{t.proposals.confidence}</div>
        <ConfidenceBar value={proposal.confidence} />
      </div>

      {proposal.stats && (
        <div style={{
          background: 'var(--bg-2)', borderRadius: 5, padding: '8px 12px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        }}>
          {(['n', 'min', 'max', 'mean'] as const).map(k => (
            <div key={k}>
              <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
                {typeof proposal.stats![k] === 'number' ? (proposal.stats![k] as number).toFixed(k === 'n' ? 0 : 1) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--fg-3)', fontStyle: 'italic' }}>{proposal.rationale}</div>

      {proposal.status === 'open' && (
        <div style={{ display: 'flex', gap: 8 }} title={canWrite ? undefined : t.role.noWriteAction}>
          <button onClick={() => act('accept')} disabled={!canWrite} style={{ flex: 1, background: 'var(--status-ok)22', border: '1px solid var(--status-ok)', color: 'var(--status-ok)', borderRadius: 5, padding: '6px 0', fontSize: 12, cursor: canWrite ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.45 }}>
            {t.proposals.accept}
          </button>
          <button onClick={() => act('snooze')} disabled={!canWrite} style={{ flex: 1, background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 5, padding: '6px 0', fontSize: 12, cursor: canWrite ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.45 }}>
            {t.proposals.snooze}
          </button>
          <button onClick={() => act('reject')} disabled={!canWrite} style={{ flex: 1, background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', color: 'var(--status-fail)', borderRadius: 5, padding: '6px 0', fontSize: 12, cursor: canWrite ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.45 }}>
            {t.proposals.reject}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Proposals() {
  const { data: proposals = [], isLoading, isError, refetch } = useProposals();
  const role = useRoleStore(s => s.role);
  const pending = proposals.filter(p => p.status === 'open');
  const others  = proposals.filter(p => p.status !== 'open');

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.proposals.title}</h1>
      {!canAcceptProposal(role) && <ReadOnlyBanner />}
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {!isError && proposals.length === 0 && (
        <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>
          {t.proposals.empty}
        </div>
      )}
      {pending.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{t.proposals.pending} ({pending.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
            {pending.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
      {others.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{t.proposals.reviewed} ({others.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {others.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

import { useProposals, useProposalAction } from '@/api/proposals';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n/de';
import { diffExpect, OP_SYMBOL } from '@/lib/diff';
import { useRoleStore, canAcceptProposal } from '@/store/role';
import type { Proposal } from '@/types';
import { useNavigate } from 'react-router-dom';

// UX-N13: explain the *meaning* of current → proposed (loosened/tightened + Δ),
// then keep the raw spans below for power users.
function ExpectDiff({ current, proposed }: { current: string; proposed: string }) {
  const d = diffExpect(current, proposed);
  const directionLabel = t.diff[d.direction];
  const dirColor =
    d.direction === 'loosened' ? 'var(--status-warn)'
    : d.direction === 'tightened' ? 'var(--status-fail)'
    : 'var(--fg-3)';

  const opSym = (op: string) => OP_SYMBOL[op] ?? op;
  const bound = d.proposedVal !== null
    ? `${opSym(d.currentOp)} ${d.currentVal} → ${opSym(d.proposedOp)} ${d.proposedVal}`
    : null;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.diff.meaning}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, borderRadius: 'var(--r)', padding: '2px 8px',
          background: `color-mix(in srgb, ${dirColor} 15%, transparent)`,
          color: dirColor, border: `1px solid ${dirColor}`,
        }}>
          {directionLabel}
        </span>
        {bound && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{bound}</span>
        )}
        {d.deltaPct !== null && d.deltaPct !== 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
            ({d.deltaPct > 0 ? '+' : ''}{d.deltaPct}%)
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s2)', marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.proposals.current}</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{current || '—'}</code>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.proposals.proposed}</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--status-ok)' }}>{proposed}</code>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'var(--status-ok)' : pct >= 50 ? 'var(--status-warn)' : 'var(--status-fail)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
      <div style={{ flex: 1, height: 4, background: 'var(--line-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--fg-2)', width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const action = useProposalAction();
  const navigate = useNavigate();
  const role = useRoleStore(s => s.role);
  // FE mirror only — the server re-checks role × ownership on accept (S-2).
  const canWrite = canAcceptProposal(role);
  const act = (a: 'accept' | 'reject' | 'snooze') => action.mutate({ id: proposal.id, action: a });

  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)', padding: 'var(--s4)', display: 'flex', flexDirection: 'column', gap: 'var(--s3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>
            {proposal.check_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
            {proposal.product}
            <span style={{
              fontSize: 9, borderRadius: 3, padding: '1px 5px', marginLeft: 4,
              background: proposal.kind === 'internal_gate'
                ? 'color-mix(in srgb, var(--qual) 14%, transparent)'
                : 'color-mix(in srgb, var(--cont) 14%, transparent)',
              color: proposal.kind === 'internal_gate' ? 'var(--qual)' : 'var(--cont)',
              border: `1px solid ${proposal.kind === 'internal_gate' ? 'var(--qual)' : 'var(--cont)'}`,
            }}>
              {proposal.kind === 'internal_gate' ? 'Gate' : 'Contract'}
            </span>
          </div>
        </div>
        <span style={{
          background: 'var(--bg-3)', border: '1px solid var(--line-2)',
          borderRadius: 'var(--r)', padding: '2px 8px', fontSize: 10, color: 'var(--fg-3)',
        }}>
          {t.proposals.statusLabel[proposal.status] ?? proposal.status}
        </span>
      </div>

      <ExpectDiff current={proposal.current_expect} proposed={proposal.proposed_expect} />

      <div>
        <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 6 }}>{t.proposals.confidence}</div>
        <ConfidenceBar value={proposal.confidence} />
      </div>

      {proposal.stats && (
        <div style={{
          background: 'var(--bg-2)', borderRadius: 'var(--r-md)', padding: 'var(--s2) var(--s3)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s2)',
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
        <Tooltip content={proposal.kind === 'internal_gate' && !canWrite ? t.role.noWriteAction : undefined} focusable={!canWrite} className="tooltip-full">
          <span style={{ display: 'flex', gap: 'var(--s2)' }}>
            {proposal.kind !== 'internal_gate' ? (
              <button onClick={() => navigate(`/contracts?product=${encodeURIComponent(proposal.product)}`)} style={{ flex: 1, background: 'var(--cont)22', border: '1px solid var(--cont)', color: 'var(--cont)', borderRadius: 'var(--r-md)', padding: '6px 0', fontSize: 12, cursor: 'pointer' }}>
                Im Contract pruefen {'->'}
              </button>
            ) : (
              <button onClick={() => act('accept')} disabled={!canWrite} style={{ flex: 1, background: 'var(--status-ok)22', border: '1px solid var(--status-ok)', color: 'var(--status-ok)', borderRadius: 'var(--r-md)', padding: '6px 0', fontSize: 12, cursor: canWrite ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.45 }}>
                {t.proposals.accept}
              </button>
            )}
            <button onClick={() => act('snooze')} disabled={!canWrite} style={{ flex: 1, background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 'var(--r-md)', padding: '6px 0', fontSize: 12, cursor: canWrite ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.45 }}>
              {t.proposals.snooze}
            </button>
            <button onClick={() => act('reject')} disabled={!canWrite} style={{ flex: 1, background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', color: 'var(--status-fail)', borderRadius: 'var(--r-md)', padding: '6px 0', fontSize: 12, cursor: canWrite ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.45 }}>
              {t.proposals.reject}
            </button>
          </span>
        </Tooltip>
      )}
    </div>
  );
}

export default function Proposals() {
  const { data: proposals = [], isLoading, isError, refetch } = useProposals();
  const role = useRoleStore(s => s.role);
  const pending = proposals.filter(p => p.status === 'open');
  const others  = proposals.filter(p => p.status !== 'open');

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 'var(--s6)' }}>{t.common.loading}</div>;

  return (
    <div className="page-full">
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--s4)', marginBottom: 24 }}>
            {pending.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
      {others.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{t.proposals.reviewed} ({others.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--s4)' }}>
            {others.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

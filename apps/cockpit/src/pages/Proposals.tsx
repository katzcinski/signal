import { useState } from 'react';
import { useProposals, useProposalAction } from '@/api/proposals';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n/de';
import { diffExpect, OP_SYMBOL } from '@/lib/diff';
import { clusterProposals, type ClusterDimension, type ProposalCluster } from '@/lib/proposalClusters';
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

const CARD_GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--s4)',
};

const SECTION_HEADING: React.CSSProperties = {
  fontSize: 13, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
};

const GROUP_OPTIONS: ClusterDimension[] = ['product', 'kind', 'confidence', 'status', 'direction', 'none'];

// Resolve the German header label for a cluster key along the active dimension.
function clusterLabel(dim: ClusterDimension, key: string): string {
  switch (dim) {
    case 'product': return key;
    case 'kind': return t.proposals.kindLabel[key] ?? key;
    case 'confidence': return t.proposals.confidenceLabel[key] ?? key;
    case 'status': return t.proposals.statusLabel[key] ?? key;
    case 'direction': return t.proposals.directionLabel[key] ?? key;
    case 'none': return '';
  }
}

// UX: a steward scanning many proposals wants to attack them by object (or
// another property) rather than one flat wall. This segmented control drives
// clustering; default groups by object ("nach Objekt").
function GroupByControl({ value, onChange }: { value: ClusterDimension; onChange: (d: ClusterDimension) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.proposals.groupByLabel}</span>
      <div style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 2 }}>
        {GROUP_OPTIONS.map(opt => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              aria-pressed={active}
              style={{
                background: active ? 'var(--bg-1)' : 'transparent',
                border: active ? '1px solid var(--line-2)' : '1px solid transparent',
                color: active ? 'var(--fg)' : 'var(--fg-3)',
                borderRadius: 'var(--r)', padding: '4px 10px', fontSize: 11,
                cursor: 'pointer', fontWeight: active ? 500 : 400,
              }}
            >
              {t.proposals.groupBy[opt]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClusterMeta({ cluster }: { cluster: ProposalCluster }) {
  const parts = [
    cluster.openCount > 0 ? t.proposals.clusterMeta.open.replace('{n}', String(cluster.openCount)) : null,
    t.proposals.clusterMeta.total.replace('{n}', String(cluster.count)),
    t.proposals.clusterMeta.avgConfidence.replace('{n}', String(Math.round(cluster.avgConfidence * 100))),
  ].filter(Boolean) as string[];
  return (
    <span style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center', flexWrap: 'wrap' }}>
      {parts.map((p, i) => (
        <span key={i} style={{
          fontSize: 10, color: 'var(--fg-3)', background: 'var(--bg-3)',
          border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: '1px 7px',
        }}>{p}</span>
      ))}
    </span>
  );
}

function ClusterSection({ dim, cluster }: { dim: ClusterDimension; cluster: ProposalCluster }) {
  return (
    <details open style={{ marginBottom: 'var(--s4)' }}>
      <summary style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)',
        cursor: 'pointer', listStyle: 'none', padding: 'var(--s2) 0', marginBottom: 12,
        borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
          {clusterLabel(dim, cluster.key)}
        </span>
        <ClusterMeta cluster={cluster} />
      </summary>
      <div style={CARD_GRID}>
        {cluster.proposals.map(p => <ProposalCard key={p.id} proposal={p} />)}
      </div>
    </details>
  );
}

export default function Proposals() {
  const { data: proposals = [], isLoading, isError, refetch } = useProposals();
  const role = useRoleStore(s => s.role);
  const [groupBy, setGroupBy] = useState<ClusterDimension>('product');

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 'var(--s6)' }}>{t.common.loading}</div>;

  const pending = proposals.filter(p => p.status === 'open');
  const others  = proposals.filter(p => p.status !== 'open');
  const clusters = groupBy === 'none' ? [] : clusterProposals(proposals, groupBy);

  return (
    <div className="page-full">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s3)', flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.proposals.title}</h1>
        {proposals.length > 0 && <GroupByControl value={groupBy} onChange={setGroupBy} />}
      </div>
      {!canAcceptProposal(role) && <ReadOnlyBanner />}
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {!isError && proposals.length === 0 && (
        <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>
          {t.proposals.empty}
        </div>
      )}

      {/* Clustered view: group by object (default) or another property. */}
      {groupBy !== 'none' && clusters.map(c => (
        <ClusterSection key={c.key || 'all'} dim={groupBy} cluster={c} />
      ))}

      {/* Flat view ("Keine"): keep the classic open/reviewed split. */}
      {groupBy === 'none' && pending.length > 0 && (
        <>
          <h2 style={SECTION_HEADING}>{t.proposals.pending} ({pending.length})</h2>
          <div style={{ ...CARD_GRID, marginBottom: 24 }}>
            {pending.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
      {groupBy === 'none' && others.length > 0 && (
        <>
          <h2 style={SECTION_HEADING}>{t.proposals.reviewed} ({others.length})</h2>
          <div style={CARD_GRID}>
            {others.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

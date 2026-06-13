import { useNavigate } from 'react-router-dom';
import { useProposals } from '@/api/proposals';
import { t } from '@/i18n/de';

// Empty-state nudge (WS5-2 / NN-g): when an object has no guarantees yet, the
// deterministic miner's open suggestions are the most useful call to action —
// "here are N mined suggestions" beats a blank panel. Renders nothing when the
// object has no open proposals, so callers can drop it into any empty state.
export function MinedProposalsCallout({ productId }: { productId: string }) {
  const { data: proposals = [] } = useProposals();
  const navigate = useNavigate();
  const open = proposals.filter(p => p.product === productId && p.status === 'open');
  if (open.length === 0) return null;

  const top = open.slice(0, 3);

  return (
    <div style={{
      marginBottom: 16, padding: 16, borderRadius: 8,
      background: 'var(--bg-1)', border: '1px solid var(--cont)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {t.mined.title} ({open.length})
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/proposals')}
          style={{
            background: 'var(--cont)', color: '#fff', border: 'none',
            borderRadius: 5, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
          }}
        >
          {t.mined.review} →
        </button>
      </div>
      <p style={{ color: 'var(--fg-3)', fontSize: 12, margin: '4px 0 12px' }}>{t.mined.hint}</p>
      {top.map(p => (
        <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{p.check_name}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--fg-3)', fontSize: 11 }}>
              {t.mined.confidence} {Math.round(p.confidence * 100)}%
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cont)', marginTop: 2 }}>{p.proposed_expect}</div>
          {p.rationale && <div style={{ color: 'var(--fg-3)', marginTop: 2 }}>{p.rationale}</div>}
        </div>
      ))}
    </div>
  );
}

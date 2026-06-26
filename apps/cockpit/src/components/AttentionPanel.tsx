import { useNavigate } from 'react-router-dom';
import { StatusDot } from '@/components/ui/StatusDot';
import { relativeTime } from '@/lib/time';
import { t } from '@/i18n/de';
import type { ObjectSummary } from '@/types';

// Replaces the (redundant) overall health gauge: the trend already shows the
// current pass-rate, so this slot answers the question the trend can't —
// *which* objects need attention right now. Ranked worst-first, each row drills
// straight into the object detail. DQ-first and actionable.

const SEVERITY_RANK: Record<string, number> = { critical: 0, fail: 1, warn: 2 };

// Tiny per-family marker (O / Q) so the dominant problem dimension reads at a
// glance without a second status column.
function FamilyMark({ letter, status }: { letter: string; status: string }) {
  const color =
    status === 'pass' ? 'var(--status-ok)'
    : status === 'warn' ? 'var(--status-warn)'
    : status === 'fail' ? 'var(--status-fail)'
    : status === 'critical' ? 'var(--status-crit)'
    : 'var(--status-unknown)';
  return (
    <span
      title={`${letter}: ${t.status[status] ?? status}`}
      style={{
        width: 16, height: 16, borderRadius: 'var(--r)', fontSize: 9, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color, border: `1px solid ${color}`,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      {letter}
    </span>
  );
}

export function AttentionPanel({ objects }: { objects: ObjectSummary[] }) {
  const navigate = useNavigate();
  const ranked = objects
    .filter(o => o.status in SEVERITY_RANK)
    .sort((a, b) => (SEVERITY_RANK[a.status] ?? 9) - (SEVERITY_RANK[b.status] ?? 9))
    .slice(0, 6);

  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderLeft: `3px solid ${ranked.length ? 'var(--status-fail)' : 'var(--qual)'}`,
      borderRadius: 'var(--r-lg)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t.cockpit.attentionTitle}
        </span>
        {ranked.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{ranked.length}</span>
        )}
      </div>

      <div style={{ padding: '4px 14px 8px', flex: 1 }}>
        {ranked.length === 0 ? (
          <p style={{ color: 'var(--fg-3)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
            {t.cockpit.attentionEmpty}
          </p>
        ) : ranked.map(o => (
          <button
            key={o.id}
            onClick={() => navigate(`/objects/${o.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              padding: '7px 0', background: 'none', border: 'none',
              borderBottom: '1px solid var(--line)', borderRadius: 0,
              color: 'var(--fg)', cursor: 'pointer',
            }}
          >
            <StatusDot status={o.status} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o.name}
            </span>
            <FamilyMark letter="O" status={o.family_status?.observability ?? 'unknown'} />
            <FamilyMark letter="Q" status={o.family_status?.quality ?? 'unknown'} />
            {o.last_run && (
              <span style={{ fontSize: 10, color: 'var(--fg-3)', minWidth: 48, textAlign: 'right' }}>
                {relativeTime(o.last_run)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

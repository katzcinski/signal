import { useNavigate } from 'react-router-dom';
import type { ObjectSummary } from '@/types';
import { t } from '@/i18n/de';

// DQ-first framing: the two guarantee families — Observability and Quality —
// promoted to first-class tiles. Each tile rolls up every object's per-family
// status into a single "X von Y bestanden" headline plus a proportional
// distribution bar, and drills into the catalog pre-filtered to that family.

type Status = 'pass' | 'warn' | 'fail' | 'critical' | 'error' | 'unknown';
const ORDER: Status[] = ['pass', 'warn', 'fail', 'critical', 'error', 'unknown'];
const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  fail: 'var(--status-fail)',
  critical: 'var(--status-crit)',
  error: 'var(--status-stale)',
  unknown: 'var(--status-unknown)',
};

const FAMILIES = [
  { key: 'observability' as const, label: t.cockpit.colObservability, accent: 'var(--obs)' },
  { key: 'quality' as const, label: t.cockpit.colQuality, accent: 'var(--qual)' },
];

function tally(objects: ObjectSummary[], family: 'observability' | 'quality'): Record<Status, number> {
  const counts = { pass: 0, warn: 0, fail: 0, critical: 0, error: 0, unknown: 0 } as Record<Status, number>;
  for (const o of objects) {
    const s = (o.family_status?.[family] ?? 'unknown') as Status;
    counts[s in counts ? s : 'unknown'] += 1;
  }
  return counts;
}

function FamilyCard({ objects, family }: {
  objects: ObjectSummary[];
  family: typeof FAMILIES[number];
}) {
  const navigate = useNavigate();
  const counts = tally(objects, family.key);
  const total = objects.length;
  const passing = counts.pass;
  const attention = counts.fail + counts.critical;
  const pct = total > 0 ? Math.round((passing / total) * 100) : 0;

  return (
    <button
      onClick={() => navigate(`/objects?family=${family.key}`)}
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer',
        background: 'var(--bg-1)', border: '1px solid var(--line)',
        borderLeft: `3px solid ${family.accent}`, borderRadius: 8,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'var(--t)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: family.accent }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {family.label}
        </span>
        <span style={{ flex: 1 }} />
        {attention > 0 && (
          <span style={{ fontSize: 10, color: 'var(--status-fail)' }}>{attention} {t.cockpit.familyAttention}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{passing}/{total} {t.cockpit.familyPassing}</span>
      </div>

      {/* Proportional distribution bar — never colour-only, counts on hover. */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-3)' }}>
        {ORDER.map(s => {
          const n = counts[s];
          if (n === 0) return null;
          return (
            <span
              key={s}
              title={`${t.status[s] ?? s}: ${n}`}
              style={{ width: `${(n / Math.max(total, 1)) * 100}%`, background: STATUS_COLOR[s] }}
            />
          );
        })}
      </div>
    </button>
  );
}

export function FamilyHealthCards({ objects }: { objects: ObjectSummary[] }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {FAMILIES.map(f => <FamilyCard key={f.key} objects={objects} family={f} />)}
    </div>
  );
}

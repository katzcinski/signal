import { t } from '@/i18n/de';

// UX-N12: health gauge with trend direction instead of a static %. The arc
// encodes the current health; the trend arrow + delta encode where it is going
// (previous vs. current health), so a recovering vs. degrading system reads at
// a glance — not just a number.

interface Props {
  pct: number;          // current health 0..100
  prevPct?: number | null;  // prior-period health for the trend arrow
  size?: number;
}

function color(pct: number) {
  if (pct >= 95) return 'var(--status-ok)';
  if (pct >= 80) return 'var(--status-warn)';
  return 'var(--status-fail)';
}

export function HealthGauge({ pct, prevPct = null, size = 120 }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // 270° arc (gauge), starting bottom-left, sweeping clockwise.
  const circ = 2 * Math.PI * r;
  const arcFraction = 0.75; // 270 of 360 degrees
  const arcLen = circ * arcFraction;
  const dash = (clamped / 100) * arcLen;

  const delta = prevPct == null ? null : Math.round((clamped - prevPct) * 10) / 10;
  const trend = delta == null ? 'flat' : delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
  const trendColor = trend === 'up' ? 'var(--status-ok)' : trend === 'down' ? 'var(--status-fail)' : 'var(--fg-3)';
  const trendGlyph = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '▬';

  return (
    <div
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s1)' }}
      role="img"
      aria-label={`${t.cockpit.kpiHealth}: ${clamped}%${delta != null ? `, ${trend === 'up' ? '+' : ''}${delta}` : ''}`}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke="var(--bg-3)" strokeWidth={stroke}
            strokeDasharray={`${arcLen} ${circ}`} strokeLinecap="round"
          />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color(clamped)} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray var(--t)' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: size * 0.26, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{clamped}%</span>
          {delta != null && (
            <span style={{ fontSize: 11, color: trendColor, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <span aria-hidden>{trendGlyph}</span>
              {delta > 0 ? '+' : ''}{delta}
            </span>
          )}
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.cockpit.kpiHealth}</span>
    </div>
  );
}

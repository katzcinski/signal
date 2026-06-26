import { Spark } from './Spark';

interface Props {
  label: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  accent?: string;
}

export function Kpi({ label, value, delta, deltaPositive, sparkData, sparkColor, accent = 'var(--qual)' }: Props) {
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)', padding: 'var(--s4) var(--s5)',
      borderBottom: `2px solid ${accent}`,
      display: 'flex', flexDirection: 'column', gap: 'var(--s2)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 28, fontWeight: 600, color: 'var(--fg)', lineHeight: 1 }}>{value}</span>
          {delta && (
            <span style={{
              marginLeft: 8, fontSize: 12,
              color: deltaPositive ? 'var(--status-ok)' : 'var(--status-fail)',
            }}>
              {delta}
            </span>
          )}
        </div>
        {sparkData && <Spark data={sparkData} color={sparkColor ?? accent} />}
      </div>
    </div>
  );
}

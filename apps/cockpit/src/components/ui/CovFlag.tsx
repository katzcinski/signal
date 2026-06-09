import type { CovFlag } from '@/types';

const SYMBOLS: Record<CovFlag, string> = {
  covered:      '●',
  partial:      '◐',
  gap:          '▲',
  out_of_scope: '○',
};
const COLORS: Record<CovFlag, string> = {
  covered:      'var(--status-ok)',
  partial:      'var(--status-warn)',
  gap:          'var(--status-fail)',
  out_of_scope: 'var(--fg-3)',
};

interface Props { flag: CovFlag; showLabel?: boolean }

export function CovFlag({ flag, showLabel = false }: Props) {
  return (
    <span style={{ color: COLORS[flag], fontFamily: 'inherit', whiteSpace: 'nowrap' }} title={flag}>
      {SYMBOLS[flag]}{showLabel && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--fg-2)' }}>{flag.replace('_', ' ')}</span>}
    </span>
  );
}

import type { Family } from '@/types';

const FAMILY_COLOR: Record<Family, string> = {
  observability: 'var(--obs)',
  quality:       'var(--qual)',
  contract:      'var(--cont)',
};

const FAMILY_LABEL: Record<Family, string> = {
  observability: 'obs',
  quality:       'qual',
  contract:      'cont',
};

interface Props { family: Family }

export function FamilyTag({ family }: Props) {
  const color = FAMILY_COLOR[family];
  return (
    <span style={{
      display: 'inline-block',
      background: `${color}22`, border: `1px solid ${color}55`,
      color, borderRadius: 3, padding: '1px 5px',
      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {FAMILY_LABEL[family]}
    </span>
  );
}

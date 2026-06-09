import type { Family } from '@/types';
import type { ReactNode } from 'react';

const FAMILY_COLOR: Record<Family, string> = {
  observability: 'var(--obs)',
  quality:       'var(--qual)',
  contract:      'var(--cont)',
};

interface Props {
  title: string;
  family?: Family;
  actions?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, family, actions, children }: Props) {
  const accent = family ? FAMILY_COLOR[family] : 'var(--line-2)';
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        {actions && <div>{actions}</div>}
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  );
}

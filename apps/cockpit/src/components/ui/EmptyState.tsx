import type { ReactNode } from 'react';

// R3-4 (NN/g): empty ≠ broken. Every empty list states what it is, why it's
// empty, and the next action — never a bare blank or a misleading "all good".
interface Props {
  icon?: string;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}

export function EmptyState({ icon = '◌', title, hint, action, children }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '32px 16px', textAlign: 'center', color: 'var(--fg-3)',
    }}>
      <div style={{ fontSize: 26 }} aria-hidden>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-2)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, maxWidth: 360 }}>{hint}</div>}
      {action && (
        <button
          onClick={action.onClick}
          style={{ marginTop: 6, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--fg)', borderRadius: 5, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}

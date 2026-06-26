import { useEffect, type ReactNode } from 'react';

// R6-1: reusable right-side peek panel (Polaris/Linear pattern). Used for
// drilldowns where a full page would be too heavy. Esc + overlay close; the
// panel is a dialog for assistive tech.
interface Props {
  title: ReactNode;
  onClose: () => void;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export function SidePanel({ title, onClose, width = 460, footer, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width, maxWidth: '92vw',
          background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-2)', borderRadius: 'var(--r-md)', padding: '3px 9px', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>{children}</div>
        {footer && <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px' }}>{footer}</div>}
      </div>
    </div>
  );
}

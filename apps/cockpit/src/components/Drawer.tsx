import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, width = 480, children }: Props) {
  return (
    <>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90 }}
          onClick={onClose}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width,
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
        transform: open ? 'translateX(0)' : `translateX(${width}px)`,
        transition: 'transform 200ms ease',
        zIndex: 100, display: 'flex', flexDirection: 'column',
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--line)',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 18 }}>✕</button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
      </div>
    </>
  );
}

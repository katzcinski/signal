import { t } from '@/i18n/de';

interface Props {
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
}

export function Topbar({ onToggleSidebar, onOpenPalette }: Props) {
  return (
    <header style={{
      height: 44, background: 'var(--bg-1)', borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      flexShrink: 0,
    }}>
      <button
        onClick={onToggleSidebar}
        style={{ background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 16, padding: 4 }}
        title="Toggle sidebar"
      >
        ☰
      </button>
      <button
        onClick={onOpenPalette}
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          color: 'var(--fg-3)', borderRadius: 5, padding: '4px 12px',
          fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span>{t.palette.placeholder}</span>
        <kbd style={{
          background: 'var(--bg-3)', border: '1px solid var(--line-2)',
          borderRadius: 3, padding: '1px 5px', fontSize: 10,
        }}>⌘K</kbd>
      </button>
      <div style={{ flex: 1 }} />
      <span style={{
        background: 'var(--cont)22', border: '1px solid var(--cont)55',
        color: 'var(--cont)', borderRadius: 4, padding: '2px 8px', fontSize: 11,
      }}>
        steward
      </span>
    </header>
  );
}

import { useNavigate } from 'react-router-dom';
import { t } from '@/i18n/de';
import { Tooltip } from '@/components/ui/Tooltip';
import { useUIStore, THEMES, type Theme } from '@/store/ui';
import { useRoleStore, ROLES, ROLE_META, type Role } from '@/store/role';

interface Props {
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
}

// Theme switcher. Each theme is a token set applied via data-theme on <html>
// (see store/ui.ts + Shell + index.css). The dot previews the active accent.
function ThemeSwitcher() {
  const theme = useUIStore(s => s.theme);
  const setTheme = useUIStore(s => s.setTheme);
  return (
    <label
      title={t.theme.toggle}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: 'var(--signal)',
        boxShadow: theme === 'classic' ? undefined : '0 0 0 3px var(--signal-dim)',
      }} />
      <select
        value={theme}
        onChange={e => setTheme(e.target.value as Theme)}
        aria-label={t.theme.label}
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg-2)',
          borderRadius: 'var(--r-md)', padding: '4px 8px', fontSize: 12, cursor: 'pointer',
        }}
      >
        {THEMES.map(th => (
          <option key={th} value={th} style={{ background: 'var(--bg-2)', color: 'var(--fg)' }}>
            {t.theme[th]}
          </option>
        ))}
      </select>
    </label>
  );
}

// UX-F1: role switcher. Changing role updates the X-DQ-Role header (api/client.ts)
// and lands the user on that role's default home (UX-N3). The server stays
// authoritative; this only changes which write affordances the UI offers.
function RoleSwitcher() {
  const role = useRoleStore(s => s.role);
  const setRole = useRoleStore(s => s.setRole);
  const navigate = useNavigate();

  const onChange = (next: Role) => {
    setRole(next);
    navigate(ROLE_META[next].home);
  };

  return (
    <Tooltip content={t.role.tooltips[role] ?? ROLE_META[role].hint}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t.role.switchLabel}
        </span>
        <select
          value={role}
          onChange={e => onChange(e.target.value as Role)}
          aria-label={t.role.switchLabel}
          style={{
            background: 'var(--cont)22', border: '1px solid var(--cont)55', color: 'var(--cont)',
            borderRadius: 'var(--r)', padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
          }}
        >
          {ROLES.map(r => (
            <option key={r} value={r} style={{ background: 'var(--bg-2)', color: 'var(--fg)' }}>
              {ROLE_META[r].label}
            </option>
          ))}
        </select>
      </label>
    </Tooltip>
  );
}

export function Topbar({ onToggleSidebar, onOpenPalette }: Props) {
  const density = useUIStore(s => s.density);
  const toggleDensity = useUIStore(s => s.toggleDensity);
  return (
    <header style={{
      height: 44, background: 'var(--bg-1)', borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      flexShrink: 0,
    }}>
      <button
        onClick={onToggleSidebar}
        style={{
          background: 'none', border: 'none', color: 'var(--fg-2)',
          padding: 4, display: 'inline-flex', alignItems: 'center',
        }}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden focusable="false">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        onClick={onOpenPalette}
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line)',
          color: 'var(--fg-2)', borderRadius: 'var(--r-md)', padding: '4px 8px 4px 12px',
          fontSize: 12, display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span>{t.palette.placeholder}</span>
        <kbd style={{
          background: 'var(--bg-0)', border: '1px solid var(--line-2)',
          borderRadius: 3, padding: '1px 5px', fontSize: 10,
          fontFamily: 'var(--font-mono)', color: 'var(--fg-3)',
        }}>⌘K</kbd>
      </button>
      <div style={{ flex: 1 }} />
      <ThemeSwitcher />
      <button
        onClick={toggleDensity}
        title={t.density.toggle}
        aria-label={t.density.toggle}
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg-2)',
          borderRadius: 'var(--r-md)', padding: '4px 10px', fontSize: 12, cursor: 'pointer',
        }}
      >
        ↕ {density === 'compact' ? t.density.compact : t.density.comfortable}
      </button>
      <RoleSwitcher />
    </header>
  );
}

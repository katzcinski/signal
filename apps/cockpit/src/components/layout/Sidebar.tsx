import { NavLink } from 'react-router-dom';
import { t } from '@/i18n/de';
import { useRoleStore, type Role } from '@/store/role';

// UX-F4: real, self-drawn SVG glyphs instead of platform-dependent Unicode
// symbols (⬡ ⊞ ⟁ …) that rendered inconsistently and carried no label. Each is
// a 16px stroke icon; semantics come from the adjacent aria-label/title, so the
// collapsed rail stays navigable for keyboard and screen-reader users.
type IconKey = 'my' | 'cockpit' | 'objects' | 'contracts' | 'lineage' | 'incidents' | 'proposals' | 'governance' | 'library' | 'notifications';

function Icon({ name }: { name: IconKey }) {
  const common = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false,
  };
  switch (name) {
    case 'my':         return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
    case 'cockpit':    return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>;
    case 'objects':    return <svg {...common}><path d="M12 3 4 7l8 4 8-4-8-4Z" /><path d="M4 12l8 4 8-4" /><path d="M4 17l8 4 8-4" /></svg>;
    case 'contracts':  return <svg {...common}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 13h6M10 17h6" /></svg>;
    case 'lineage':    return <svg {...common}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="12" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.2 7.3 15.8 11M8.2 16.7 15.8 13" /></svg>;
    case 'incidents':  return <svg {...common}><path d="M5 21V4l13 .5L14 8l4 3.5L5 12" /></svg>;
    case 'proposals':  return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>;
    case 'governance': return <svg {...common}><path d="M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6Z" /></svg>;
    case 'library':    return <svg {...common}><rect x="4" y="4" width="4" height="16" rx="1" /><rect x="10" y="4" width="4" height="16" rx="1" /><path d="M17 5l3 .8-3 14-2-.5" /></svg>;
    case 'notifications': return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
  }
}

interface NavItem { to: string; label: string; icon: IconKey; }

const MY_WORK: NavItem = { to: '/my', label: t.nav.myWork, icon: 'my' };

const BASE: NavItem[] = [
  { to: '/',           label: t.nav.cockpit,    icon: 'cockpit' },
  { to: '/objects',    label: t.nav.objects,    icon: 'objects' },
  { to: '/contracts',  label: t.nav.contracts,  icon: 'contracts' },
  { to: '/lineage',    label: t.nav.lineage,    icon: 'lineage' },
  { to: '/incidents',  label: t.nav.incidents,  icon: 'incidents' },
  { to: '/proposals',  label: t.nav.proposals,  icon: 'proposals' },
  { to: '/governance', label: t.nav.governance, icon: 'governance' },
  { to: '/library',    label: t.nav.library,    icon: 'library' },
  { to: '/notifications', label: t.nav.notifications, icon: 'notifications' },
];

// UX-N3 / UX-F1: nav order follows the role. Stewards/owners lead with "My work"
// (their default landing); viewers/admins lead with the global cockpit.
function navForRole(role: Role): NavItem[] {
  if (role === 'steward' || role === 'owner') return [MY_WORK, ...BASE];
  return BASE;
}

interface Props { collapsed: boolean }

export function Sidebar({ collapsed }: Props) {
  const role = useRoleStore(s => s.role);
  const nav = navForRole(role);

  return (
    <aside style={{
      width: collapsed ? 48 : 200,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column',
      transition: 'width var(--t)',
      flexShrink: 0, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 12px', borderBottom: '1px solid var(--line)', overflow: 'hidden' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
          {collapsed ? 'S' : 'Signal'}
        </span>
      </div>
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            title={label}
            aria-label={label}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', margin: '1px 6px', borderRadius: 5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: isActive ? 'var(--fg)' : 'var(--fg-2)',
              background: isActive ? 'var(--bg-2)' : 'transparent',
              fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden',
              transition: 'color var(--t), background var(--t)',
            })}
          >
            <span style={{ display: 'inline-flex', flexShrink: 0 }}><Icon name={icon} /></span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

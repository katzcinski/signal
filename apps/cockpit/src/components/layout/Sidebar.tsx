import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/',           label: 'Cockpit',    icon: '⬡' },
  { to: '/objects',    label: 'Objects',    icon: '⊞' },
  { to: '/contracts',  label: 'Contracts',  icon: '⊟' },
  { to: '/lineage',    label: 'Lineage',    icon: '⟁' },
  { to: '/incidents',  label: 'Incidents',  icon: '⚑' },
  { to: '/proposals',  label: 'Proposals',  icon: '✦' },
  { to: '/governance', label: 'Governance', icon: '⊕' },
];

interface Props { collapsed: boolean }

export function Sidebar({ collapsed }: Props) {
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
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', margin: '1px 6px', borderRadius: 5,
              color: isActive ? 'var(--fg)' : 'var(--fg-3)',
              background: isActive ? 'var(--bg-2)' : 'transparent',
              fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden',
              transition: 'color var(--t), background var(--t)',
            })}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

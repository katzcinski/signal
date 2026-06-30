import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '../CommandPalette';
import { useUIStore, type Theme } from '@/store/ui';
import { useObjects } from '@/api/objects';

const THEME_COLOR: Record<Theme, string> = {
  classic: '#090B0F',
  signal: '#0A0C0F',
  blueprint: '#071726',
  daylight: '#E9E4DA',
  amber: '#0A0805',
};

function SystemHealthStrip() {
  const { data: objects = [] } = useObjects();
  const total = objects.length;
  if (total === 0) {
    return <div style={{ height: 3, background: 'var(--line)', flexShrink: 0 }} />;
  }
  const pass = objects.filter(o => o.status === 'pass').length;
  const warn = objects.filter(o => o.status === 'warn').length;
  const fail = objects.filter(o => o.status === 'fail' || o.status === 'critical').length;
  return (
    <div style={{ height: 3, display: 'flex', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ width: `${(pass / total) * 100}%`, background: 'var(--status-ok)', transition: 'width 600ms ease' }} />
      <div style={{ width: `${(warn / total) * 100}%`, background: 'var(--status-warn)', transition: 'width 600ms ease' }} />
      <div style={{ width: `${(fail / total) * 100}%`, background: 'var(--status-crit)', transition: 'width 600ms ease' }} />
      <div style={{ flex: 1, background: 'var(--status-unknown)' }} />
    </div>
  );
}

interface Props { children: ReactNode }

export function Shell({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const shellContentRef = useRef<HTMLDivElement>(null);
  const density = useUIStore(s => s.density);
  const theme = useUIStore(s => s.theme);

  // R6-7: drive density tokens off a root data attribute.
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);

  // Drive the theme token set off a root data attribute and keep browser chrome in sync.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    themeMeta?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);

  useEffect(() => {
    const node = shellContentRef.current;
    if (!node) return;
    if (paletteOpen) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
    return () => node.removeAttribute('inert');
  }, [paletteOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="shell-root" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}>
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <div ref={shellContentRef} aria-hidden={paletteOpen}>
        <SystemHealthStrip />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Sidebar collapsed={collapsed} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Topbar
              onToggleSidebar={() => setCollapsed(c => !c)}
              onOpenPalette={() => setPaletteOpen(true)}
              paletteOpen={paletteOpen}
            />
            <main id="main-content" tabIndex={-1} style={{ flex: 1, overflow: 'auto', padding: 'var(--page-pad)' }}>
              {children}
            </main>
          </div>
        </div>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

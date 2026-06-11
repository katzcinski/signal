import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';

const ROUTES = [
  { label: 'Cockpit', path: '/' },
  { label: 'Objects', path: '/objects' },
  { label: 'Contracts', path: '/contracts' },
  { label: 'Coverage', path: '/coverage' },
  { label: 'Incidents', path: '/incidents' },
  { label: 'Proposals', path: '/proposals' },
  { label: 'Governance', path: '/governance' },
];

interface Props { onClose: () => void }

interface Item { id: string; label: string; hint?: string; group: string; path: string }

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: objects } = useObjects();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items: Item[] = useMemo(() => {
    const q = query.toLowerCase();
    const routes = ROUTES.filter(r => r.label.toLowerCase().includes(q))
      .map(r => ({ id: `route:${r.path}`, label: r.label, group: 'Pages', path: r.path }));
    const objs = (objects ?? [])
      .filter(o => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
      .slice(0, 6)
      .map(o => ({ id: `obj:${o.id}`, label: o.name, hint: o.space, group: 'Objects', path: `/objects/${o.id}` }));
    return [...routes, ...objs];
  }, [query, objects]);

  // Keep the active index in range as the result list changes.
  useEffect(() => { setActive(0); }, [query]);

  const go = (path: string) => { navigate(path); onClose(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) go(items[active].path); }
  };

  let lastGroup = '';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          borderRadius: 10, width: 560, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-activedescendant={items[active]?.id}
          placeholder="Search objects, contracts, pages…"
          style={{
            width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
            padding: '14px 16px', fontSize: 14, color: 'var(--fg)', outline: 'none',
          }}
        />
        <div id="cmdk-list" role="listbox" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && (
                  <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {header}
                  </div>
                )}
                <button
                  id={it.id}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => go(it.path)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: i === active ? 'var(--bg-3, var(--bg-1))' : 'none', border: 'none', color: 'var(--fg)',
                    padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  <span style={{ fontFamily: it.group === 'Objects' ? 'var(--font-mono)' : undefined, fontSize: it.group === 'Objects' ? 12 : 13, color: it.group === 'Objects' ? 'var(--fg-2)' : 'var(--fg)' }}>{it.label}</span>
                  {it.hint && <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{it.hint}</span>}
                </button>
              </div>
            );
          })}
          {items.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-3)' }}>No results</div>
          )}
        </div>
      </div>
    </div>
  );
}

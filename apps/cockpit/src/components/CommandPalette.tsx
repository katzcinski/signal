import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';

const ROUTES = [
  { label: 'Cockpit', path: '/' },
  { label: 'Objects', path: '/objects' },
  { label: 'Contracts', path: '/contracts' },
  { label: 'Lineage', path: '/lineage' },
  { label: 'Incidents', path: '/incidents' },
  { label: 'Proposals', path: '/proposals' },
  { label: 'Governance', path: '/governance' },
];

interface Props { onClose: () => void }

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: objects } = useObjects();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.toLowerCase();
  const routeHits = ROUTES.filter(r => r.label.toLowerCase().includes(q));
  const objectHits = (objects ?? []).filter(o =>
    o.name.toLowerCase().includes(q) || o.display_name.toLowerCase().includes(q)
  ).slice(0, 6);

  const go = (path: string) => { navigate(path); onClose(); };

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
          placeholder="Search objects, contracts, pages…"
          style={{
            width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
            padding: '14px 16px', fontSize: 14, color: 'var(--fg)', outline: 'none',
          }}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {routeHits.length > 0 && (
            <div>
              <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pages
              </div>
              {routeHits.map(r => (
                <button
                  key={r.path}
                  onClick={() => go(r.path)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', color: 'var(--fg)',
                    padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {objectHits.length > 0 && (
            <div>
              <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Objects
              </div>
              {objectHits.map(o => (
                <button
                  key={o.id}
                  onClick={() => go(`/objects/${o.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', color: 'var(--fg)',
                    padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)' }}>{o.name}</span>
                  <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{o.space}</span>
                </button>
              ))}
            </div>
          )}
          {routeHits.length === 0 && objectHits.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-3)' }}>No results</div>
          )}
        </div>
      </div>
    </div>
  );
}

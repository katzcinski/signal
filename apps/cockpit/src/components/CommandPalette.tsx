import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useObjects } from '@/api/objects';
import { api } from '@/api/client';
import { useUIStore } from '@/store/ui';
import { t } from '@/i18n/de';

const ROUTES = [
  { label: t.nav.cockpit, path: '/' },
  { label: t.nav.objects, path: '/objects' },
  { label: t.nav.contracts, path: '/contracts' },
  { label: t.nav.lineage, path: '/lineage' },
  { label: t.nav.incidents, path: '/incidents' },
  { label: t.nav.proposals, path: '/proposals' },
  { label: t.nav.governance, path: '/governance' },
];

interface Props { onClose: () => void }

type Group = 'recent' | 'pages' | 'objects' | 'actions';

interface Hit {
  key: string;
  group: Group;
  primary: string;
  secondary?: string;
  path?: string;          // navigation target
  action?: () => void;    // R6-5: run-checks (or other) command
}

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: objects } = useObjects();
  const recents = useUIStore(s => s.recents);
  const pushRecent = useUIStore(s => s.pushRecent);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.toLowerCase();

  const runChecks = (id: string) => {
    onClose();
    toast.promise(api.post(`/objects/${id}/run`, {}).then(r => r.data), {
      loading: `${t.toast.runStarting} ${id}…`,
      success: `${t.toast.runStarted} ${id}.`,
      error: `${t.toast.runError} ${id}.`,
    });
  };

  // Recent group only when the query is empty (most-recent commands).
  const recentHits: Hit[] = query ? [] : recents
    .map(r => { const [path, label] = r.split('|'); return { path, label: label || path }; })
    .filter(r => ROUTES.some(x => x.path === r.path) || (objects ?? []).some(o => `/objects/${o.id}` === r.path))
    .map(r => ({ key: `recent-${r.path}`, group: 'recent' as Group, primary: r.label, path: r.path }));

  const routeHits: Hit[] = ROUTES
    .filter(r => r.label.toLowerCase().includes(q))
    .map(r => ({ key: `route-${r.path}`, path: r.path, group: 'pages', primary: r.label }));

  const objectHits: Hit[] = (objects ?? [])
    .filter(o => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
    .slice(0, 6)
    .map(o => ({
      key: `obj-${o.id}`, path: `/objects/${o.id}`, group: 'objects',
      primary: o.name, secondary: o.space,
    }));

  // R6-5: "run checks on X" actions — surfaced when the query matches a run verb
  // or the object name.
  const wantsRun = ['run', 'check', 'ausführen', 'ausfuhren'].some(w => q.includes(w));
  const actionHits: Hit[] = (objects ?? [])
    .filter(o => wantsRun || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
    .slice(0, 6)
    .map(o => ({
      key: `run-${o.id}`, group: 'actions', primary: `▶ ${t.palette.runChecks} ${o.name}`,
      action: () => runChecks(o.id),
    }));

  const hits = [...recentHits, ...routeHits, ...objectHits, ...actionHits];
  const clampedIndex = Math.min(activeIndex, Math.max(hits.length - 1, 0));

  const select = (hit: Hit) => {
    if (hit.action) { hit.action(); return; }
    if (hit.path) { pushRecent(`${hit.path}|${hit.primary}`); navigate(hit.path); onClose(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[clampedIndex];
      if (hit) select(hit);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const renderGroup = (group: Group, label: string) => {
    const groupHits = hits.filter(h => h.group === group);
    if (groupHits.length === 0) return null;
    return (
      <div>
        <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        {groupHits.map(hit => {
          const idx = hits.indexOf(hit);
          const active = idx === clampedIndex;
          return (
            <button
              key={hit.key}
              onClick={() => select(hit)}
              onMouseEnter={() => setActiveIndex(idx)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                background: active ? 'var(--bg-3)' : 'none', border: 'none', color: 'var(--fg)',
                padding: '8px 16px', fontSize: 13, cursor: 'pointer',
              }}
            >
              {hit.group === 'objects' ? (
                <>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)' }}>{hit.primary}</span>
                  {hit.secondary && <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{hit.secondary}</span>}
                </>
              ) : hit.primary}
            </button>
          );
        })}
      </div>
    );
  };

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
        aria-label={t.palette.placeholder}
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          borderRadius: 10, width: 560, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
          placeholder={t.palette.placeholder}
          style={{
            width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
            padding: '14px 16px', fontSize: 14, color: 'var(--fg)', outline: 'none',
          }}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto', paddingBottom: 6 }}>
          {renderGroup('recent', t.palette.recent)}
          {renderGroup('pages', t.palette.pages)}
          {renderGroup('objects', t.palette.objects)}
          {renderGroup('actions', t.palette.actions)}
          {hits.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-3)' }}>{t.palette.noResults}</div>
          )}
        </div>
      </div>
    </div>
  );
}

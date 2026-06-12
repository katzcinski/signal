import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { toast } from 'sonner';
import { useObjects } from '@/api/objects';
import { useContracts } from '@/api/contracts';
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

// R6-5: cmdk-based palette — pages, object/contract open (deep-link), run
// actions, and a persisted Recent group.
export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { data: objects = [] } = useObjects();
  const { data: contracts = [] } = useContracts();
  const recents = useUIStore(s => s.recents);
  const pushRecent = useUIStore(s => s.pushRecent);

  const go = (path: string, label: string) => { pushRecent(`${path}|${label}`); navigate(path); onClose(); };

  const runChecks = (id: string) => {
    onClose();
    toast.promise(api.post(`/objects/${id}/run`, {}).then(r => r.data), {
      loading: `${t.toast.runStarting} ${id}…`,
      success: `${t.toast.runStarted} ${id}.`,
      error: `${t.toast.runError} ${id}.`,
    });
  };

  const recentItems = recents
    .map(r => { const [path, label] = r.split('|'); return { path, label: label || path }; })
    .filter(r => ROUTES.some(x => x.path === r.path)
      || objects.some(o => `/objects/${o.id}` === r.path)
      || contracts.some(c => `/contracts?product=${c.product}` === r.path));

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 10, width: 560, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}
      >
        <Command label={t.palette.placeholder} shouldFilter>
          <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder={t.palette.placeholder} />
          <Command.List>
            <Command.Empty>{t.palette.noResults}</Command.Empty>

            {!query && recentItems.length > 0 && (
              <Command.Group heading={t.palette.recent}>
                {recentItems.map(r => (
                  <Command.Item key={`recent:${r.path}`} value={`recent ${r.label}`} onSelect={() => go(r.path, r.label)}>
                    <span style={{ color: 'var(--fg-3)' }}>↩</span> {r.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={t.palette.pages}>
              {ROUTES.map(r => (
                <Command.Item key={r.path} value={`page ${r.label}`} onSelect={() => go(r.path, r.label)}>
                  {r.label}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading={t.palette.objects}>
              {objects.slice(0, 50).map(o => (
                <Command.Item key={`open:${o.id}`} value={`object ${o.name} ${o.id}`} onSelect={() => go(`/objects/${o.id}`, o.name)}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)' }}>{o.name}</span>
                  <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{o.space}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading={t.palette.actions}>
              {objects.slice(0, 50).map(o => (
                <Command.Item key={`run:${o.id}`} value={`run checks ausführen ${o.name} ${o.id}`} onSelect={() => runChecks(o.id)}>
                  <span style={{ color: 'var(--cont)' }}>▶</span> {t.palette.runChecks} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.name}</span>
                </Command.Item>
              ))}
              {contracts.slice(0, 50).map(c => (
                <Command.Item key={`contract:${c.product}`} value={`contract ${c.product} öffnen`} onSelect={() => go(`/contracts?product=${c.product}`, c.product)}>
                  <span style={{ color: 'var(--fg-3)' }}>⊟</span> {t.palette.openContract} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.product}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

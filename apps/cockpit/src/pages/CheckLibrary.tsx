import { useState, type CSSProperties } from 'react';
import { useLibrary } from '@/api/library';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { t } from '@/i18n/de';
import type { CheckDef } from '@/types';

const chipBtn = (active: boolean): CSSProperties => ({
  padding: '4px 10px', borderRadius: 20,
  border: active ? '1px solid var(--cont)' : '1px solid var(--line-2)',
  background: active ? 'var(--cont)' : 'var(--bg-2)',
  color: active ? '#fff' : 'var(--fg-3)',
  fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
});

function CheckCard({ check }: { check: CheckDef }) {
  const params = check.parameters ? Object.entries(check.parameters) : [];
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{check.name}</div>
          {check.description && (
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 4 }}>{check.description}</div>
          )}
        </div>
        <FamilyTag family={check.family} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 4,
          background: 'var(--bg-2)', color: 'var(--fg-3)', border: '1px solid var(--line-2)',
        }}>{check.category}</span>
      </div>
      {check.template_sql && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.library.templateSql}</div>
          <pre style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 4,
            padding: '6px 8px', fontSize: 11, overflowX: 'auto', margin: 0, color: 'var(--fg-2)',
          }}>{check.template_sql}</pre>
        </div>
      )}
      {params.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.library.params}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {params.map(([k, v]) => (
              <span key={k} style={{
                fontSize: 11, fontFamily: 'var(--font-mono)',
                background: 'var(--bg-2)', padding: '2px 6px', borderRadius: 3,
                color: 'var(--fg-2)', border: '1px solid var(--line-2)',
              }}>{k}: {String(v)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckLibrary() {
  const { data: library, isLoading } = useLibrary();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const q = search.toLowerCase();
  const checks = (library?.checks ?? []).filter(c => {
    if (category && c.category !== category) return false;
    if (q && !c.name.toLowerCase().includes(q) && !(c.description ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.library.title}</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.library.searchPlaceholder}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 5, padding: '6px 10px', fontSize: 12, minWidth: 220,
          }}
        />
        <button style={chipBtn(category === '')} onClick={() => setCategory('')}>
          {t.library.allCategories}
        </button>
        {(library?.categories ?? []).map(cat => (
          <button
            key={cat}
            style={chipBtn(category === cat)}
            onClick={() => setCategory(category === cat ? '' : cat)}
          >{cat}</button>
        ))}
      </div>

      {isLoading && <div style={{ color: 'var(--fg-3)' }}>{t.common.loading}</div>}

      {!isLoading && checks.length === 0 && (
        <div style={{ color: 'var(--fg-3)', fontSize: 14 }}>{t.library.noResults}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {checks.map(c => <CheckCard key={c.id} check={c} />)}
      </div>
    </div>
  );
}

import { useState, type CSSProperties } from 'react';
import { useLibrary } from '@/api/library';
import { t } from '@/i18n/de';
import { FamilyTag } from '@/components/ui/FamilyTag';
import type { CheckDef, CheckFamily } from '@/types';

const chipBtn = (active: boolean): CSSProperties => ({
  padding: '4px 10px', borderRadius: 20,
  border: active ? '1px solid var(--cont)' : '1px solid var(--line-2)',
  background: active ? 'var(--cont)' : 'var(--bg-2)',
  color: active ? '#fff' : 'var(--fg-3)',
  fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
});

function CheckCard({ check }: { check: CheckDef }) {
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{check.label}</div>
          {check.short && (
            <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 4, lineHeight: 1.4 }}>{check.short}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <FamilyTag family={check.family} />
          <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: 'var(--bg-2)', color: 'var(--fg-3)', border: '1px solid var(--line-2)',
          }}>{check.category}</span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>
        {t.library.gating.label}: <span style={{ color: 'var(--fg-2)' }}>{t.library.gating[check.gating]}</span>
      </div>
      {check.help && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.45 }}>{check.help}</div>
      )}
      {check.sql_template && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.library.templateSql}</div>
          <pre style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 4,
            padding: '6px 8px', fontSize: 11, overflowX: 'auto', margin: 0, color: 'var(--fg-2)',
            whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%',
          }}>{check.sql_template}</pre>
        </div>
      )}
      {check.params.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', marginBottom: 4 }}>{t.library.params}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {check.params.map(param => (
              <span key={param.token} title={param.hint} style={{
                fontSize: 11, fontFamily: 'var(--font-mono)',
                background: 'var(--bg-2)', padding: '2px 6px', borderRadius: 3,
                color: 'var(--fg-2)', border: '1px solid var(--line-2)', maxWidth: '100%',
                overflowWrap: 'anywhere',
              }}>{param.token}: {param.label}</span>
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
  const [family, setFamily] = useState<CheckFamily | ''>('');

  const q = search.toLowerCase();
  const checks = (library?.checks ?? []).filter(c => {
    if (category && c.category !== category) return false;
    if (family && c.family !== family) return false;
    const haystack = [c.id, c.label, c.short, c.help, c.example].join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return false;
    return true;
  });

  return (
    <div className="page-full">
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={chipBtn(family === '')} onClick={() => setFamily('')}>
          {t.library.allFamilies}
        </button>
        {(library?.families ?? []).map(fam => (
          <button
            key={fam}
            style={chipBtn(family === fam)}
            onClick={() => setFamily(family === fam ? '' : fam)}
          >{t.library.family[fam]}</button>
        ))}
      </div>

      {isLoading && <div style={{ color: 'var(--fg-3)' }}>{t.common.loading}</div>}

      {!isLoading && checks.length === 0 && (
        <div style={{ color: 'var(--fg-3)', fontSize: 14 }}>{t.library.noResults}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
        {checks.map(c => <CheckCard key={c.id} check={c} />)}
      </div>
    </div>
  );
}

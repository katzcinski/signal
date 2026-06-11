import type {
  ContractGuarantees, Severity,
  KeyGuarantee, RefGuarantee, CompletenessGuarantee, NotNullGuarantee,
} from '@/types';
import { t } from '@/i18n/strings';

// R3-3: card-per-guarantee-family editor. Fields are comboboxes against the
// contract's own schema columns / the inventory (no free-text for columns or
// parents — the schema column list is the single editable source). The server
// stays authoritative for G1, so there is NO client-side SQL regex here.

const SEVERITIES: Severity[] = ['warn', 'fail', 'critical'];

const card: React.CSSProperties = {
  background: 'var(--bg-1)', border: '1px solid var(--line)',
  borderRadius: 8, padding: 16,
};
const label: React.CSSProperties = { fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const input: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)',
  borderRadius: 5, padding: '4px 8px', fontSize: 12,
};
const chipBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-2)',
  border: '1px solid var(--line-2)', color: 'var(--fg-2)', borderRadius: 4,
  padding: '2px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
};
const ghost: React.CSSProperties = {
  background: 'none', border: '1px dashed var(--line-2)', color: 'var(--fg-3)',
  borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
};

function Toggle({ on, onChange, label: lbl }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <span
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        style={{
          width: 34, height: 18, borderRadius: 9, padding: 2, transition: 'background .15s',
          background: on ? 'var(--status-ok)' : 'var(--line-2)', display: 'inline-flex',
          justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{lbl}</span>
    </label>
  );
}

function SeveritySelect({ value, onChange }: { value: Severity; onChange: (v: Severity) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as Severity)} style={input} aria-label="Severity">
      {SEVERITIES.map(s => <option key={s} value={s}>{t.status[s]}</option>)}
    </select>
  );
}

function ColumnSelect({ value, columns, onChange, placeholder = 'column…' }: {
  value: string; columns: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={input} aria-label="Column">
      <option value="">{placeholder}</option>
      {columns.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

// Multi-select chips drawn from a fixed option list (no free text).
function ChipMulti({ values, options, onChange }: {
  values: string[]; options: string[]; onChange: (v: string[]) => void;
}) {
  const remaining = options.filter(o => !values.includes(o));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {values.map(v => (
        <span key={v} style={chipBtn}>
          {v}
          <button
            onClick={() => onChange(values.filter(x => x !== v))}
            aria-label={`Remove ${v}`}
            style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', padding: 0 }}
          >×</button>
        </span>
      ))}
      {remaining.length > 0 && (
        <select
          value=""
          onChange={e => e.target.value && onChange([...values, e.target.value])}
          style={{ ...input, padding: '2px 6px' }}
          aria-label="Add column"
        >
          <option value="">+ add</option>
          {remaining.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </div>
  );
}

function FamilyCard({ title, on, onToggle, children }: {
  title: string; on: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Toggle on={on} onChange={onToggle} label={title} />
      </div>
      {on && children && <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  );
}

interface Props {
  value: ContractGuarantees;
  onChange: (g: ContractGuarantees) => void;
  datasets: string[];
  lite: boolean;
}

export function GuaranteeCards({ value, onChange, datasets, lite }: Props) {
  const g = value;
  const set = (patch: Partial<ContractGuarantees>) => onChange({ ...g, ...patch });
  const del = (key: keyof ContractGuarantees) => {
    const next = { ...g };
    delete next[key];
    onChange(next);
  };
  const columns = g.schema?.columns ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Schema */}
      <FamilyCard title="Schema" on={!!g.schema}
        onToggle={v => v ? set({ schema: { columns: [], mode: 'closed' } }) : del('schema')}>
        {g.schema && (
          <>
            <div>
              <div style={label}>Columns (source of truth)</div>
              <div style={{ marginTop: 6 }}>
                <ChipMulti
                  values={g.schema.columns}
                  options={[...new Set([...g.schema.columns])]}
                  onChange={cols => set({ schema: { ...g.schema!, columns: cols } })}
                />
                {!lite && <ColumnAdder onAdd={c => set({ schema: { ...g.schema!, columns: [...g.schema!.columns, c] } })} existing={g.schema.columns} />}
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={g.schema.mode === 'closed'}
                onChange={e => set({ schema: { ...g.schema!, mode: e.target.checked ? 'closed' : 'open' } })} />
              Closed schema (reject unexpected columns)
            </label>
          </>
        )}
      </FamilyCard>

      {/* Keys */}
      <ListCard<KeyGuarantee>
        title="Keys (uniqueness)" entries={g.keys} lite={lite}
        onToggle={v => v ? set({ keys: [{ columns: [], unique: true, severity: 'critical' }] }) : del('keys')}
        onChange={ks => set({ keys: ks })}
        blank={() => ({ columns: [], unique: true, severity: 'critical' })}
        renderEntry={(e, upd) => (
          <>
            <ChipMulti values={e.columns} options={columns} onChange={c => upd({ ...e, columns: c })} />
            <SeveritySelect value={e.severity} onChange={s => upd({ ...e, severity: s })} />
          </>
        )}
        liteSeverity={(e, s) => ({ ...e, severity: s })}
      />

      {/* Referential */}
      <ListCard<RefGuarantee>
        title="Referential integrity" entries={g.referential} lite={lite}
        onToggle={v => v ? set({ referential: [{ fk: [], parent: '', parent_key: [], severity: 'fail' }] }) : del('referential')}
        onChange={rs => set({ referential: rs })}
        blank={() => ({ fk: [], parent: '', parent_key: [], severity: 'fail' })}
        renderEntry={(e, upd) => (
          <>
            <div><div style={label}>FK column(s)</div><ChipMulti values={e.fk} options={columns} onChange={fk => upd({ ...e, fk })} /></div>
            <div><div style={label}>Parent</div>
              <ColumnSelect value={e.parent} columns={datasets} onChange={p => upd({ ...e, parent: p })} placeholder="parent dataset…" />
            </div>
            <SeveritySelect value={e.severity} onChange={s => upd({ ...e, severity: s })} />
          </>
        )}
        liteSeverity={(e, s) => ({ ...e, severity: s })}
      />

      {/* Freshness */}
      <FamilyCard title="Freshness" on={!!g.freshness}
        onToggle={v => v ? set({ freshness: { column: '', max_age: 'PT24H', severity: 'warn' } }) : del('freshness')}>
        {g.freshness && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <ColumnSelect value={g.freshness.column} columns={columns} onChange={c => set({ freshness: { ...g.freshness!, column: c } })} placeholder="timestamp column…" />
            {!lite && (
              <label style={{ fontSize: 12, color: 'var(--fg-3)' }}>max age
                <input value={g.freshness.max_age} onChange={e => set({ freshness: { ...g.freshness!, max_age: e.target.value } })}
                  placeholder="PT24H" style={{ ...input, marginLeft: 6, width: 90 }} />
              </label>
            )}
            <SeveritySelect value={g.freshness.severity} onChange={s => set({ freshness: { ...g.freshness!, severity: s } })} />
          </div>
        )}
      </FamilyCard>

      {/* Volume */}
      <FamilyCard title="Volume" on={!!g.volume}
        onToggle={v => v ? set({ volume: { min_rows: 0, severity: 'warn' } }) : del('volume')}>
        {g.volume && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {!lite && (
              <label style={{ fontSize: 12, color: 'var(--fg-3)' }}>min rows
                <input type="number" value={g.volume.min_rows ?? 0}
                  onChange={e => set({ volume: { ...g.volume!, min_rows: Number(e.target.value) } })}
                  style={{ ...input, marginLeft: 6, width: 100 }} />
              </label>
            )}
            <SeveritySelect value={g.volume.severity} onChange={s => set({ volume: { ...g.volume!, severity: s } })} />
          </div>
        )}
      </FamilyCard>

      {/* Completeness */}
      <ListCard<CompletenessGuarantee>
        title="Completeness" entries={g.completeness} lite={lite}
        onToggle={v => v ? set({ completeness: [{ column: '', min_pct: 99, severity: 'warn' }] }) : del('completeness')}
        onChange={cs => set({ completeness: cs })}
        blank={() => ({ column: '', min_pct: 99, severity: 'warn' })}
        renderEntry={(e, upd) => (
          <>
            <ColumnSelect value={e.column} columns={columns} onChange={c => upd({ ...e, column: c })} />
            <label style={{ fontSize: 12, color: 'var(--fg-3)' }}>min %
              <input type="number" value={e.min_pct} onChange={ev => upd({ ...e, min_pct: Number(ev.target.value) })}
                style={{ ...input, marginLeft: 6, width: 70 }} />
            </label>
            <SeveritySelect value={e.severity} onChange={s => upd({ ...e, severity: s })} />
          </>
        )}
        liteSeverity={(e, s) => ({ ...e, severity: s })}
      />

      {/* Not null */}
      <ListCard<NotNullGuarantee>
        title="Not null" entries={g.not_null} lite={lite}
        onToggle={v => v ? set({ not_null: [{ columns: [], severity: 'fail' }] }) : del('not_null')}
        onChange={ns => set({ not_null: ns })}
        blank={() => ({ columns: [], severity: 'fail' })}
        renderEntry={(e, upd) => (
          <>
            <ChipMulti values={e.columns} options={columns} onChange={c => upd({ ...e, columns: c })} />
            <SeveritySelect value={e.severity} onChange={s => upd({ ...e, severity: s })} />
          </>
        )}
        liteSeverity={(e, s) => ({ ...e, severity: s })}
      />
    </div>
  );
}

// Free-text column adder — only used in the Schema card (the column source).
function ColumnAdder({ onAdd, existing }: { onAdd: (c: string) => void; existing: string[] }) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const v = String(data.get('col') || '').trim();
        if (v && !existing.includes(v)) onAdd(v);
        e.currentTarget.reset();
      }}
      style={{ display: 'flex', gap: 6, marginTop: 8 }}
    >
      <input name="col" placeholder="add column name…" style={{ ...input, flex: 1 }} />
      <button type="submit" style={ghost}>Add</button>
    </form>
  );
}

// Generic list-of-entries card (keys / referential / completeness / not_null).
function ListCard<T>({ title, entries, lite, onToggle, onChange, blank, renderEntry, liteSeverity }: {
  title: string;
  entries: T[] | undefined;
  lite: boolean;
  onToggle: (v: boolean) => void;
  onChange: (entries: T[]) => void;
  blank: () => T;
  renderEntry: (entry: T, update: (e: T) => void) => React.ReactNode;
  liteSeverity: (entry: T, sev: Severity) => T;
}) {
  const on = Array.isArray(entries) && entries.length > 0;
  const list = entries ?? [];
  const updateAt = (i: number, e: T) => onChange(list.map((x, j) => (j === i ? e : x)));

  return (
    <FamilyCard title={title} on={on} onToggle={onToggle}>
      {on && (
        <>
          {list.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 8, borderBottom: i < list.length - 1 ? '1px solid var(--line)' : 'none' }}>
              {lite
                ? <SeveritySelectInline entry={entry} liteSeverity={liteSeverity} onChange={e => updateAt(i, e)} />
                : renderEntry(entry, e => updateAt(i, e))}
              {!lite && (
                <button onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove entry"
                  style={{ ...ghost, borderStyle: 'solid', color: 'var(--status-fail)', borderColor: 'var(--status-fail)' }}>Remove</button>
              )}
            </div>
          ))}
          {!lite && <button onClick={() => onChange([...list, blank()])} style={ghost}>+ Add entry</button>}
        </>
      )}
    </FamilyCard>
  );
}

function SeveritySelectInline<T>({ entry, liteSeverity, onChange }: {
  entry: T; liteSeverity: (e: T, s: Severity) => T; onChange: (e: T) => void;
}) {
  const sev = (entry as unknown as { severity?: Severity }).severity ?? 'warn';
  return <SeveritySelect value={sev} onChange={s => onChange(liteSeverity(entry, s))} />;
}

import { useEffect, useMemo, useState } from 'react';
import { dump } from 'js-yaml';
import type { AxiosError } from 'axios';
import {
  useContracts, useContract, usePutContract, useApproveContract, useDeprecateContract,
  useCompileContractDryRun, useDryRunChecks, useRevertChecks, useExportBdc,
  useSeedContract, useDiffContract, useContractSla, useInventory,
} from '@/api/contracts';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { StatePill } from '@/components/ui/StatePill';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import { OwnershipTag } from '@/components/ui/OwnershipTag';
import { Combobox } from '@/components/ui/Combobox';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { t } from '@/i18n/de';
import { useRoleStore, canWriteContract } from '@/store/role';
import type {
  Contract, ContractGuarantees, ContractOut, ContractPutBody, CheckState, DiffEntry,
  GuaranteeCompleteness, GuaranteeKey, GuaranteeNotNull, GuaranteeReferential,
  InventoryDataset, Severity,
} from '@/types';

// ─── Shared style tokens ─────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-1)', border: '1px solid var(--line)',
  borderRadius: 8, padding: 16,
};
const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 12,
};
const btnStyle = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  border: variant === 'ghost' ? '1px solid var(--line-2)' : 'none',
  borderRadius: 5, padding: '7px 14px', fontSize: 13,
  cursor: 'pointer',
  background: variant === 'primary' ? 'var(--cont)'
    : variant === 'danger' ? 'var(--status-fail)'
    : 'var(--bg-2)',
  color: variant === 'ghost' ? 'var(--fg)' : '#fff',
});
const selectStyle: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--line-2)',
  color: 'var(--fg)', borderRadius: 5, padding: '4px 8px', fontSize: 12,
};
const fieldLabel: React.CSSProperties = { fontSize: 11, color: 'var(--fg-3)' };

const SEVERITIES: Severity[] = ['warn', 'fail', 'critical'];

// ─── Pure helpers ────────────────────────────────────────────────────────────

const datasetName = (d: InventoryDataset): string =>
  String(d.technicalName ?? d.name ?? d.id ?? '');

const majorOf = (version: string | undefined): number => {
  const n = parseInt(String(version ?? '0').replace(/^v/i, '').split('.')[0], 10);
  return Number.isFinite(n) ? n : 0;
};

const maxAgeToHours = (maxAge: string | undefined): number => {
  if (!maxAge) return 24;
  const h = /^PT(\d+(?:\.\d+)?)H$/i.exec(maxAge);
  if (h) return Number(h[1]);
  const d = /^P(\d+)D$/i.exec(maxAge);
  if (d) return Number(d[1]) * 24;
  return 24;
};

const hoursToMaxAge = (hours: number): string => `PT${Math.max(1, Math.round(hours))}H`;

// PUT body has NO lifecycle field — the server forces draft.
const toPutBody = (c: Contract | ContractPutBody): ContractPutBody => ({
  product: c.product,
  dataset: c.dataset,
  owned_by: c.owned_by,
  owners: c.owners,
  version: c.version,
  description: c.description,
  guarantees: c.guarantees ?? {},
});

// RFC-7807: detail.errors list (defensive against shape variants).
function extractValidationErrors(e: unknown): string[] {
  const data = (e as AxiosError<Record<string, unknown>>)?.response?.data;
  if (!data) return [];
  const detail = data.detail ?? data;
  const raw = Array.isArray(detail) ? detail
    : (detail && typeof detail === 'object' && 'errors' in detail) ? (detail as { errors: unknown }).errors
    : typeof detail === 'string' ? [detail]
    : [];
  if (!Array.isArray(raw)) return [String(raw)];
  return raw.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const loc = Array.isArray(o.loc) ? o.loc.join('.') : o.path ?? '';
      const msg = o.msg ?? o.message ?? JSON.stringify(item);
      return loc ? `${loc}: ${msg}` : String(msg);
    }
    return String(item);
  });
}

// ─── Small form atoms ────────────────────────────────────────────────────────

function SeveritySelect({ value, onChange }: { value: Severity | undefined; onChange: (s: Severity) => void }) {
  return (
    <select
      value={value ?? 'warn'}
      onChange={e => onChange(e.target.value as Severity)}
      aria-label={t.common.severity}
      style={selectStyle}
    >
      {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// Multi-column picker: chips + combobox (NO free text — picker only).
function ColumnsPicker({ value, onChange, options }: {
  value: string[];
  onChange: (cols: string[]) => void;
  options: string[];
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {value.map(col => (
        <span key={col} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 4,
          padding: '2px 6px', ...monoStyle, fontSize: 11,
        }}>
          {col}
          <button
            onClick={() => onChange(value.filter(c => c !== col))}
            aria-label={`${t.common.remove}: ${col}`}
            style={{ background: 'none', border: 'none', color: 'var(--fg-3)', padding: 0, fontSize: 12, cursor: 'pointer' }}
          >
            ×
          </button>
        </span>
      ))}
      <Combobox
        options={options.filter(o => !value.includes(o))}
        value=""
        onChange={c => onChange([...value, c])}
        placeholder={t.workbench.fields.pickColumn}
        width={170}
      />
    </div>
  );
}

function GuaranteeCard({ familyKey, enabled, onToggle, headerExtra, children }: {
  familyKey: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: enabled && children ? '1px solid var(--line)' : 'none',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => onToggle(e.target.checked)}
            aria-label={`${t.workbench.families[familyKey]} ${t.workbench.enabled}`}
          />
          {t.workbench.families[familyKey] ?? familyKey}
        </label>
        <div style={{ flex: 1 }} />
        {enabled && headerExtra}
      </div>
      {enabled && children && <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  );
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={t.common.remove}
      style={{ background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
    >
      ×
    </button>
  );
}

function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...btnStyle('ghost'), padding: '4px 10px', fontSize: 12, alignSelf: 'flex-start' }}>
      + {t.workbench.fields.addEntry}
    </button>
  );
}

// ─── Guarantee editor (one card per family, canonical §1.5 schema) ──────────

interface GuaranteeEditorProps {
  guarantees: ContractGuarantees;
  onChange: (g: ContractGuarantees) => void;
  columnOptions: string[];
  datasetOptions: string[];
  columnsOfDataset: (name: string) => string[];
  lite: boolean;
}

function GuaranteeEditor({ guarantees, onChange, columnOptions, datasetOptions, columnsOfDataset, lite }: GuaranteeEditorProps) {
  const g = guarantees;
  const set = (patch: Partial<ContractGuarantees>) => onChange({ ...g, ...patch });
  const unset = (key: keyof ContractGuarantees) => {
    const next = { ...g };
    delete next[key];
    onChange(next);
  };

  // Lite mode: one severity select per family (applies to all entries).
  const listSeverity = (rows: { severity?: Severity }[] | undefined): Severity =>
    rows?.[0]?.severity ?? 'warn';
  const setListSeverity = <T extends { severity?: Severity }>(rows: T[], sev: Severity): T[] =>
    rows.map(r => ({ ...r, severity: sev }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* schema */}
      <GuaranteeCard
        familyKey="schema"
        enabled={!!g.schema}
        onToggle={on => on ? set({ schema: { columns: [], mode: 'closed', severity: 'fail' } }) : unset('schema')}
        headerExtra={g.schema && <SeveritySelect value={g.schema.severity} onChange={s => set({ schema: { ...g.schema!, severity: s } })} />}
      >
        {!lite && g.schema && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={fieldLabel}>{t.workbench.fields.mode}</span>
              <select
                value={g.schema.mode}
                onChange={e => set({ schema: { ...g.schema!, mode: e.target.value as 'closed' | 'open' } })}
                aria-label={t.workbench.fields.mode}
                style={selectStyle}
              >
                <option value="closed">closed</option>
                <option value="open">open</option>
              </select>
            </div>
            <div>
              <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.columns}</div>
              <ColumnsPicker
                value={g.schema.columns}
                onChange={cols => set({ schema: { ...g.schema!, columns: cols } })}
                options={columnOptions}
              />
            </div>
          </>
        )}
      </GuaranteeCard>

      {/* keys */}
      <GuaranteeCard
        familyKey="keys"
        enabled={!!g.keys}
        onToggle={on => on ? set({ keys: [{ columns: [], unique: true, severity: 'critical' }] }) : unset('keys')}
        headerExtra={lite && g.keys ? <SeveritySelect value={listSeverity(g.keys)} onChange={s => set({ keys: setListSeverity(g.keys!, s) })} /> : undefined}
      >
        {!lite && g.keys && (
          <>
            {g.keys.map((key: GuaranteeKey, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', borderBottom: i < g.keys!.length - 1 ? '1px solid var(--line)' : 'none', paddingBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ ...fieldLabel, marginBottom: 4 }}>
                    {t.workbench.fields.columns}
                    {key.proposed && (
                      <span style={{
                        marginLeft: 8, background: 'var(--cont)22', border: '1px solid var(--cont)55',
                        color: 'var(--cont)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 600,
                      }}>
                        {t.workbench.proposalChip}
                      </span>
                    )}
                  </div>
                  <ColumnsPicker
                    value={key.columns}
                    onChange={cols => set({ keys: g.keys!.map((k, j) => j === i ? { ...k, columns: cols } : k) })}
                    options={columnOptions}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 18 }}>
                  <input
                    type="checkbox"
                    checked={key.unique}
                    onChange={e => set({ keys: g.keys!.map((k, j) => j === i ? { ...k, unique: e.target.checked } : k) })}
                  />
                  {t.workbench.fields.unique}
                </label>
                <div style={{ marginTop: 14 }}>
                  <SeveritySelect value={key.severity} onChange={s => set({ keys: g.keys!.map((k, j) => j === i ? { ...k, severity: s } : k) })} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <RemoveRowButton onClick={() => {
                    const next = g.keys!.filter((_, j) => j !== i);
                    next.length ? set({ keys: next }) : unset('keys');
                  }} />
                </div>
              </div>
            ))}
            <AddRowButton onClick={() => set({ keys: [...g.keys!, { columns: [], unique: true, severity: 'critical' }] })} />
          </>
        )}
      </GuaranteeCard>

      {/* referential */}
      <GuaranteeCard
        familyKey="referential"
        enabled={!!g.referential}
        onToggle={on => on ? set({ referential: [{ fk: [], parent: '', parent_key: [], severity: 'fail' }] }) : unset('referential')}
        headerExtra={lite && g.referential ? <SeveritySelect value={listSeverity(g.referential)} onChange={s => set({ referential: setListSeverity(g.referential!, s) })} /> : undefined}
      >
        {!lite && g.referential && (
          <>
            {g.referential.map((ref: GuaranteeReferential, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', borderBottom: i < g.referential!.length - 1 ? '1px solid var(--line)' : 'none', paddingBottom: 8 }}>
                <div>
                  <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.fk}</div>
                  <Combobox
                    options={columnOptions}
                    value={ref.fk[0] ?? ''}
                    onChange={c => set({ referential: g.referential!.map((r, j) => j === i ? { ...r, fk: [c] } : r) })}
                    placeholder={t.workbench.fields.pickColumn}
                    width={160}
                  />
                </div>
                <div>
                  <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.parent}</div>
                  <Combobox
                    options={datasetOptions}
                    value={ref.parent}
                    onChange={p => set({ referential: g.referential!.map((r, j) => j === i ? { ...r, parent: p, parent_key: [] } : r) })}
                    placeholder={t.workbench.fields.pickDataset}
                    width={180}
                  />
                </div>
                <div>
                  <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.parentKey}</div>
                  <Combobox
                    options={columnsOfDataset(ref.parent)}
                    value={ref.parent_key[0] ?? ''}
                    onChange={c => set({ referential: g.referential!.map((r, j) => j === i ? { ...r, parent_key: [c] } : r) })}
                    placeholder={t.workbench.fields.pickColumn}
                    width={160}
                  />
                </div>
                <SeveritySelect value={ref.severity} onChange={s => set({ referential: g.referential!.map((r, j) => j === i ? { ...r, severity: s } : r) })} />
                <RemoveRowButton onClick={() => {
                  const next = g.referential!.filter((_, j) => j !== i);
                  next.length ? set({ referential: next }) : unset('referential');
                }} />
              </div>
            ))}
            <AddRowButton onClick={() => set({ referential: [...g.referential!, { fk: [], parent: '', parent_key: [], severity: 'fail' }] })} />
          </>
        )}
      </GuaranteeCard>

      {/* freshness */}
      <GuaranteeCard
        familyKey="freshness"
        enabled={!!g.freshness}
        onToggle={on => on ? set({ freshness: { column: '', max_age: 'PT24H', severity: 'warn' } }) : unset('freshness')}
        headerExtra={g.freshness && <SeveritySelect value={g.freshness.severity} onChange={s => set({ freshness: { ...g.freshness!, severity: s } })} />}
      >
        {!lite && g.freshness && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.column}</div>
              <Combobox
                options={columnOptions}
                value={g.freshness.column}
                onChange={c => set({ freshness: { ...g.freshness!, column: c } })}
                placeholder={t.workbench.fields.pickColumn}
                width={180}
              />
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--fg-3)' }}>
              {t.workbench.fields.maxAgeHours}
              <input
                type="number"
                min={1}
                value={maxAgeToHours(g.freshness.max_age)}
                onChange={e => set({ freshness: { ...g.freshness!, max_age: hoursToMaxAge(Number(e.target.value)) } })}
                style={{ ...selectStyle, width: 90 }}
              />
            </label>
            <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)' }}>{g.freshness.max_age}</span>
          </div>
        )}
      </GuaranteeCard>

      {/* volume */}
      <GuaranteeCard
        familyKey="volume"
        enabled={!!g.volume}
        onToggle={on => on ? set({ volume: { min_rows: 1, severity: 'warn' } }) : unset('volume')}
        headerExtra={g.volume && <SeveritySelect value={g.volume.severity} onChange={s => set({ volume: { ...g.volume!, severity: s } })} />}
      >
        {!lite && g.volume && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--fg-3)' }}>
              {t.workbench.fields.minRows}
              <input
                type="number"
                min={0}
                value={g.volume.min_rows ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  const next = { ...g.volume! };
                  if (v === '') delete next.min_rows; else next.min_rows = Number(v);
                  set({ volume: next });
                }}
                style={{ ...selectStyle, width: 100 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={g.volume.baseline === 'rolling'}
                onChange={e => {
                  const next = { ...g.volume! };
                  if (e.target.checked) next.baseline = 'rolling'; else delete next.baseline;
                  set({ volume: next });
                }}
              />
              {t.workbench.fields.baseline}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={g.volume.bounds === 'auto'}
                onChange={e => {
                  const next = { ...g.volume! };
                  if (e.target.checked) next.bounds = 'auto'; else delete next.bounds;
                  set({ volume: next });
                }}
              />
              {t.workbench.fields.bounds}
            </label>
          </div>
        )}
      </GuaranteeCard>

      {/* completeness */}
      <GuaranteeCard
        familyKey="completeness"
        enabled={!!g.completeness}
        onToggle={on => on ? set({ completeness: [{ column: '', min_pct: 95, severity: 'warn' }] }) : unset('completeness')}
        headerExtra={lite && g.completeness ? <SeveritySelect value={listSeverity(g.completeness)} onChange={s => set({ completeness: setListSeverity(g.completeness!, s) })} /> : undefined}
      >
        {!lite && g.completeness && (
          <>
            {g.completeness.map((row: GuaranteeCompleteness, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.column}</div>
                  <Combobox
                    options={columnOptions}
                    value={row.column}
                    onChange={c => set({ completeness: g.completeness!.map((r, j) => j === i ? { ...r, column: c } : r) })}
                    placeholder={t.workbench.fields.pickColumn}
                    width={180}
                  />
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--fg-3)' }}>
                  {t.workbench.fields.minPct}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.min_pct}
                    onChange={e => set({ completeness: g.completeness!.map((r, j) => j === i ? { ...r, min_pct: Number(e.target.value) } : r) })}
                    style={{ ...selectStyle, width: 80 }}
                  />
                </label>
                <SeveritySelect value={row.severity} onChange={s => set({ completeness: g.completeness!.map((r, j) => j === i ? { ...r, severity: s } : r) })} />
                <RemoveRowButton onClick={() => {
                  const next = g.completeness!.filter((_, j) => j !== i);
                  next.length ? set({ completeness: next }) : unset('completeness');
                }} />
              </div>
            ))}
            <AddRowButton onClick={() => set({ completeness: [...g.completeness!, { column: '', min_pct: 95, severity: 'warn' }] })} />
          </>
        )}
      </GuaranteeCard>

      {/* not_null */}
      <GuaranteeCard
        familyKey="not_null"
        enabled={!!g.not_null}
        onToggle={on => on ? set({ not_null: [{ columns: [], severity: 'fail' }] }) : unset('not_null')}
        headerExtra={lite && g.not_null ? <SeveritySelect value={listSeverity(g.not_null)} onChange={s => set({ not_null: setListSeverity(g.not_null!, s) })} /> : undefined}
      >
        {!lite && g.not_null && (
          <>
            {g.not_null.map((row: GuaranteeNotNull, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ ...fieldLabel, marginBottom: 4 }}>{t.workbench.fields.columns}</div>
                  <ColumnsPicker
                    value={row.columns}
                    onChange={cols => set({ not_null: g.not_null!.map((r, j) => j === i ? { ...r, columns: cols } : r) })}
                    options={columnOptions}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <SeveritySelect value={row.severity} onChange={s => set({ not_null: g.not_null!.map((r, j) => j === i ? { ...r, severity: s } : r) })} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <RemoveRowButton onClick={() => {
                    const next = g.not_null!.filter((_, j) => j !== i);
                    next.length ? set({ not_null: next }) : unset('not_null');
                  }} />
                </div>
              </div>
            ))}
            <AddRowButton onClick={() => set({ not_null: [...g.not_null!, { columns: [], severity: 'fail' }] })} />
          </>
        )}
      </GuaranteeCard>
    </div>
  );
}

// ─── BreakingDiffPanel ───────────────────────────────────────────────────────

function BreakingDiffPanel({ entries, pending, isError, blocking }: {
  entries: DiffEntry[];
  pending: boolean;
  isError: boolean;
  blocking: boolean;
}) {
  const isBreaking = (e: DiffEntry) => e.breaking === true || /breaking/i.test(e.kind);
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t.workbench.diffTitle}</div>
      {pending && <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.workbench.diffPending}</div>}
      {isError && <div style={{ fontSize: 12, color: 'var(--status-fail)' }}>{t.workbench.diffError}</div>}
      {!pending && !isError && entries.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.workbench.diffEmpty}</div>
      )}
      {entries.map((e, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0',
          borderBottom: '1px solid var(--line)', fontSize: 12, flexWrap: 'wrap',
        }}>
          <span style={{
            color: isBreaking(e) ? 'var(--status-crit)' : 'var(--fg-2)',
            fontWeight: isBreaking(e) ? 700 : 400, minWidth: 110,
          }}>
            {isBreaking(e) && '⛔ '}{e.kind}
          </span>
          <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)' }}>{e.path}</span>
          {(e.old !== undefined || e.new !== undefined) && (
            <span style={{ ...monoStyle, fontSize: 11 }}>
              <span style={{ color: 'var(--status-fail)' }}>{e.old !== undefined ? JSON.stringify(e.old) : '∅'}</span>
              {' → '}
              <span style={{ color: 'var(--status-ok)' }}>{e.new !== undefined ? JSON.stringify(e.new) : '∅'}</span>
            </span>
          )}
        </div>
      ))}
      {blocking && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 5,
          background: 'var(--status-crit)22', border: '1px solid var(--status-crit)',
          color: 'var(--status-crit)', fontSize: 12, fontWeight: 600,
        }}>
          {t.workbench.breakingHint}
        </div>
      )}
    </div>
  );
}

// ─── SLA uptime bars (visible when lifecycle = active) ──────────────────────

function SlaBars({ product }: { product: string }) {
  const { data } = useContractSla(product);
  if (!data) return null;
  const windows: ['7d' | '30d' | '90d', number | null][] = [
    ['7d', data.windows['7d']], ['30d', data.windows['30d']], ['90d', data.windows['90d']],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.workbench.slaTitle}</div>
      {windows.map(([label, pct]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...monoStyle, fontSize: 10, width: 28, color: 'var(--fg-3)' }}>{label}</span>
          <div style={{ flex: 1, height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
            {pct != null && (
              <div style={{
                width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%',
                background: pct >= 99 ? 'var(--status-ok)' : pct >= 95 ? 'var(--status-warn)' : 'var(--status-fail)',
              }} />
            )}
          </div>
          <span style={{ ...monoStyle, fontSize: 10, width: 64, textAlign: 'right', color: 'var(--fg-2)' }}>
            {pct != null ? `${pct.toFixed(1)} %` : t.workbench.slaNoData}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Compile / dry-run / revert panel (kept from WS3) ───────────────────────

function ConflictList({ conflicts }: { conflicts: string[] }) {
  if (!conflicts.length) return null;
  return (
    <div style={{ background: 'var(--status-warn)22', border: '1px solid var(--status-warn)', borderRadius: 6, padding: '10px 14px', marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--status-warn)', marginBottom: 4 }}>
        {conflicts.length} {t.workbench.compile.conflicts}
      </div>
      {conflicts.map(name => (
        <div key={name} style={{ ...monoStyle, color: 'var(--fg-2)', fontSize: 11 }}>• {name}</div>
      ))}
    </div>
  );
}

function CompilePanel({ objectId, dataset }: { objectId: string; dataset: string }) {
  const compile = useCompileContractDryRun(objectId);
  const dryRun = useDryRunChecks(dataset);
  const revert = useRevertChecks(dataset);
  const exportBdc = useExportBdc(objectId);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'dryrun' | 'export'>('preview');

  const compileData = compile.data as {
    yaml_preview?: string; conflicts?: string[]; determinism_hash?: string;
    checks?: { name: string; type: string; expect: string; severity: string }[];
  } | undefined;
  const dryRunData = dryRun.data as {
    mode?: string; overall_status?: string; total?: number; passed?: number; failed?: number;
    results?: { name: string; passed: boolean; actual_value: unknown; expect: string; state: CheckState }[];
    message?: string; checks_yaml?: string;
  } | undefined;

  const tabStyle = (tabKey: string): React.CSSProperties => ({
    padding: '5px 14px', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none',
    borderBottom: activeTab === tabKey ? '2px solid var(--cont)' : '2px solid transparent',
    color: activeTab === tabKey ? 'var(--fg)' : 'var(--fg-3)',
  });

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.workbench.compile.title}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnStyle()} onClick={() => { compile.mutate(); setActiveTab('preview'); }}>
            {compile.isPending ? t.workbench.compile.compiling : t.workbench.compile.compileDry}
          </button>
          <button style={btnStyle('ghost')} onClick={() => { dryRun.mutate({}); setActiveTab('dryrun'); }}>
            {dryRun.isPending ? t.workbench.compile.running : t.workbench.compile.runChecks}
          </button>
          <button style={btnStyle('ghost')} onClick={() => { exportBdc.mutate(); setActiveTab('export'); }}>{t.workbench.compile.bdcExport}</button>
          <button style={btnStyle('danger')} onClick={() => setShowRevertConfirm(true)}>{t.workbench.compile.revert}</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <button style={tabStyle('preview')} onClick={() => setActiveTab('preview')}>{t.workbench.compile.preview}</button>
        <button style={tabStyle('dryrun')} onClick={() => setActiveTab('dryrun')}>{t.workbench.compile.dryRun}</button>
        <button style={tabStyle('export')} onClick={() => setActiveTab('export')}>{t.workbench.compile.bdcExport}</button>
      </div>

      {activeTab === 'preview' && compileData && (
        <div>
          {compileData.determinism_hash && (
            <div style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)', marginBottom: 8 }}>
              {t.workbench.compile.hash}: {compileData.determinism_hash}
            </div>
          )}
          <ConflictList conflicts={compileData.conflicts ?? []} />
          {compileData.checks && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>{t.workbench.compile.check}</th>
                  <th style={{ padding: '4px 8px' }}>{t.workbench.compile.type}</th>
                  <th style={{ padding: '4px 8px' }}>{t.workbench.compile.expect}</th>
                  <th style={{ padding: '4px 8px' }}>{t.common.severity}</th>
                </tr>
              </thead>
              <tbody>
                {compileData.checks.map(c => (
                  <tr key={c.name} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '4px 8px', ...monoStyle }}>{c.name}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--fg-3)' }}>{c.type}</td>
                    <td style={{ padding: '4px 8px', ...monoStyle }}>{c.expect}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--fg-2)' }}>{c.severity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {compileData.yaml_preview && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--fg-3)' }}>{t.workbench.compile.yamlPreview}</summary>
              <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, marginTop: 6, overflow: 'auto', maxHeight: 300, fontSize: 11 }}>
                {compileData.yaml_preview}
              </pre>
            </details>
          )}
        </div>
      )}

      {activeTab === 'dryrun' && dryRunData && (
        <div>
          {dryRunData.mode === 'compile_only' ? (
            <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>{dryRunData.message}</div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <span style={{ fontSize: 13 }}>{t.workbench.compile.statusLabel} <strong style={{ color: dryRunData.overall_status === 'pass' ? 'var(--status-ok)' : 'var(--status-fail)' }}>{dryRunData.overall_status}</strong></span>
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{dryRunData.passed}/{dryRunData.total} {t.workbench.compile.passedOf}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>{t.workbench.compile.check}</th>
                    <th style={{ padding: '4px 8px' }}>{t.workbench.compile.actual}</th>
                    <th style={{ padding: '4px 8px' }}>{t.workbench.compile.expect}</th>
                    <th style={{ padding: '4px 8px' }}>{t.workbench.compile.state}</th>
                  </tr>
                </thead>
                <tbody>
                  {(dryRunData.results ?? []).map((r) => (
                    <tr key={r.name} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '4px 8px', ...monoStyle }}>{r.name}</td>
                      <td style={{ padding: '4px 8px', ...monoStyle }}>{String(r.actual_value ?? '—')}</td>
                      <td style={{ padding: '4px 8px', ...monoStyle }}>{r.expect}</td>
                      <td style={{ padding: '4px 8px' }}>
                        {r.state && r.state !== 'executed' ? (
                          <StatePill state={r.state} size="sm" />
                        ) : (
                          <span style={{ color: r.passed ? 'var(--status-ok)' : 'var(--status-fail)' }}>
                            {r.passed ? 'pass' : 'fail'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'export' && exportBdc.data && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>{t.workbench.compile.csn}</div>
          <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 200, fontSize: 11 }}>
            {JSON.stringify((exportBdc.data as { csn_fragment: unknown }).csn_fragment, null, 2)}
          </pre>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, marginTop: 12 }}>{t.workbench.compile.ord}</div>
          <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 200, fontSize: 11 }}>
            {JSON.stringify((exportBdc.data as { ord_fragment: unknown }).ord_fragment, null, 2)}
          </pre>
        </div>
      )}

      {compile.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>{t.workbench.compile.compileFailed}</div>}
      {dryRun.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>{t.workbench.compile.dryRunFailed}</div>}

      {/* Revert confirmation */}
      {showRevertConfirm && (
        <div style={{ marginTop: 12, background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>{t.workbench.compile.revertConfirm} <strong style={monoStyle}>checks/{dataset}/checks.yml</strong></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle('danger')} onClick={() => { revert.mutate(); setShowRevertConfirm(false); }}>
              {revert.isPending ? t.workbench.compile.reverting : t.workbench.compile.revertConfirmBtn}
            </button>
            <button style={btnStyle('ghost')} onClick={() => setShowRevertConfirm(false)}>{t.common.cancel}</button>
          </div>
          {revert.isSuccess && (
            <div style={{ color: 'var(--status-ok)', fontSize: 12, marginTop: 8 }}>
              {t.workbench.compile.revertedTo} {(revert.data as { reverted_to_commit?: string })?.reverted_to_commit?.slice(0, 8)}
            </div>
          )}
          {revert.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>{t.workbench.compile.revertFailed}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Left list: contracts + "Neu aus Inventar" ──────────────────────────────

const complianceStatus = (c: ContractOut): string =>
  c.compliance === 'compliant' ? 'pass' : c.compliance === 'breached' ? 'fail' : 'unknown';

function ContractList({ contracts, inventory, selected, onSelect }: {
  contracts: ContractOut[];
  inventory: InventoryDataset[];
  selected: string;
  onSelect: (product: string) => void;
}) {
  const [search, setSearch] = useState('');
  const seed = useSeedContract();
  const [seedingId, setSeedingId] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q
    ? contracts.filter(c => c.product.toLowerCase().includes(q) || c.dataset.toLowerCase().includes(q))
    : contracts;

  const contractKeys = new Set(contracts.flatMap(c => [c.product, c.dataset]));
  const uncovered = inventory.filter(d => {
    const id = String(d.id ?? datasetName(d));
    return id && !contractKeys.has(id) && !contractKeys.has(datasetName(d));
  });

  return (
    <div style={{ width: 280, borderRight: '1px solid var(--line)', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.workbench.searchContracts}
          aria-label={t.workbench.searchContracts}
          style={{
            width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12, outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 14, fontSize: 12, color: 'var(--fg-3)' }}>{t.workbench.noContracts}</div>
      )}
      {filtered.map(c => (
        <button
          key={c.product}
          onClick={() => onSelect(c.product)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '10px 14px', cursor: 'pointer',
            background: selected === c.product ? 'var(--bg-2)' : 'transparent',
            border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--fg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...monoStyle, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.product}</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: 'var(--bg-3)', border: '1px solid var(--line-2)', color: 'var(--fg-2)',
            }}>
              {t.lifecycle[c.lifecycle] ?? c.lifecycle}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ ...monoStyle, fontSize: 10, color: 'var(--fg-3)' }}>v{String(c.version).replace(/^v/i, '')}</span>
            <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>{c.owned_by}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)' }}>
              <StatusDot status={complianceStatus(c)} size={6} />
              {t.compliance[c.compliance ?? 'unknown'] ?? t.compliance.unknown}
            </span>
          </div>
        </button>
      ))}

      {/* Neu aus Inventar */}
      {uncovered.length > 0 && (
        <div>
          <div style={{ padding: '10px 14px 4px', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t.workbench.newFromInventory}
          </div>
          {uncovered.map(d => {
            const id = String(d.id ?? datasetName(d));
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {datasetName(d)}
                </span>
                <button
                  style={{ ...btnStyle('ghost'), padding: '3px 10px', fontSize: 11 }}
                  disabled={seed.isPending && seedingId === id}
                  onClick={() => {
                    setSeedingId(id);
                    seed.mutate(id, { onSuccess: () => onSelect(id) });
                  }}
                >
                  {seed.isPending && seedingId === id ? t.workbench.seeding : t.workbench.seed}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Editor pane ─────────────────────────────────────────────────────────────

function EditorPane({ product, lite, onToggleLite }: {
  product: string;
  lite: boolean;
  onToggleLite: () => void;
}) {
  const { data: contract, isLoading, isError, refetch } = useContract(product);
  const put = usePutContract(product);
  const approve = useApproveContract(product);
  const deprecate = useDeprecateContract(product);
  const diff = useDiffContract(product);
  const inventory = useInventory();
  const role = useRoleStore(s => s.role);

  const [draft, setDraft] = useState<ContractPutBody | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  // Initialize the draft from the (full) contract; re-key on product change.
  useEffect(() => {
    if (contract && (!draft || draft.product !== contract.product)) {
      setDraft(toPutBody(contract));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, product]);

  const draftJson = useMemo(() => draft ? JSON.stringify(draft) : '', [draft]);

  // BreakingDiffPanel: re-diff on every draft change, debounced (full mode only).
  const diffMutate = diff.mutate;
  useEffect(() => {
    if (!draft || lite) return;
    const timer = setTimeout(() => diffMutate(JSON.parse(draftJson) as ContractPutBody), 600);
    return () => clearTimeout(timer);
  }, [draftJson, lite, diffMutate, draft]);

  // Inventory-backed picker sources.
  const datasets = useMemo(() => inventory.data?.datasets ?? [], [inventory.data]);
  const datasetOptions = useMemo(
    () => [...new Set(datasets.map(datasetName).filter(Boolean))].sort(),
    [datasets],
  );
  const columnsOfDataset = useMemo(() => (name: string): string[] => {
    if (!name) return [];
    const ds = datasets.find(d =>
      datasetName(d) === name || String(d.id ?? '') === name || String(d.name ?? '') === name);
    return (ds?.columns ?? []).map(c => c.name).filter(Boolean);
  }, [datasets]);
  const columnOptions = useMemo(() => {
    const own = columnsOfDataset(draft?.dataset ?? '') ;
    if (own.length > 0) return own;
    // Fallback: union of all known columns so the picker is never a dead end.
    return [...new Set(datasets.flatMap(d => (d.columns ?? []).map(c => c.name)))].sort();
  }, [columnsOfDataset, draft?.dataset, datasets]);

  if (isLoading || !draft) {
    return <div style={{ padding: 24, color: 'var(--fg-3)' }}>{t.common.loading}</div>;
  }
  if (isError) {
    return <div style={{ flex: 1, padding: 24 }}><ErrorBanner onRetry={() => refetch()} /></div>;
  }

  const lifecycle = contract?.lifecycle ?? 'draft';
  // [AUTHZ] FE mirror of can_write_contract_data — server stays authoritative on PUT.
  const canWrite = canWriteContract(role, contract?.owned_by);
  const writeTitle = canWrite ? undefined : t.role.noWriteContract;

  // Breaking gate (G3): breaking diff + draft major ≤ active major ⇒ block approve.
  const report = diff.data;
  const entries: DiffEntry[] = Array.isArray(report)
    ? report as unknown as DiffEntry[]
    : (report?.entries ?? []);
  const hasBreaking = entries.some(e => e.breaking === true || /breaking/i.test(e.kind))
    || (!!report && !Array.isArray(report) && report.breaking === true);
  const activeVersion = (report && !Array.isArray(report) && report.active_version) || contract?.version;
  const breakingBlocked = hasBreaking && majorOf(draft.version) <= majorOf(String(activeVersion));

  const validationErrors = put.isError ? extractValidationErrors(put.error) : [];

  const yamlPreview = (() => {
    try {
      return dump(JSON.parse(draftJson), { lineWidth: 100, noRefs: true });
    } catch {
      return '';
    }
  })();

  const handleApprove = () => {
    setConfirmApprove(false);
    approve.mutate();
  };

  const guaranteeEditor = (
    <GuaranteeEditor
      guarantees={draft.guarantees ?? {}}
      onChange={g => setDraft({ ...draft, guarantees: g })}
      columnOptions={columnOptions}
      datasetOptions={datasetOptions}
      columnsOfDataset={columnsOfDataset}
      lite={lite}
    />
  );

  const saveButton = (
    <button
      onClick={() => put.mutate(JSON.parse(draftJson) as ContractPutBody)}
      disabled={!canWrite || put.isPending}
      title={writeTitle}
      style={{ ...btnStyle(), opacity: canWrite ? 1 : 0.5, cursor: canWrite ? 'pointer' : 'not-allowed' }}
    >
      {put.isPending ? t.workbench.saving : lite ? t.common.save : t.workbench.saveDraft}
    </button>
  );

  const errorsBlock = validationErrors.length > 0 && (
    <div style={{ background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', borderRadius: 5, padding: '8px 12px' }}>
      <div style={{ color: 'var(--status-fail)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t.workbench.validationErrors}</div>
      {validationErrors.map((e, i) => <div key={i} style={{ color: 'var(--status-fail)', fontSize: 12 }}>• {e}</div>)}
    </div>
  );

  // ── Lite-Modus: toggles + severity + one save button, nothing else ──
  if (lite) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...monoStyle, fontSize: 15, fontWeight: 700 }}>{draft.product}</span>
          <OwnershipTag ownedBy={contract?.owned_by} />
          <div style={{ flex: 1 }} />
          <button onClick={onToggleLite} style={{ ...btnStyle('ghost'), fontSize: 12 }}>{t.workbench.fullMode}</button>
        </div>
        {!canWrite && <ReadOnlyBanner hint={t.role.noWriteContract} />}
        <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.workbench.noSql}</div>
        {guaranteeEditor}
        {errorsBlock}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saveButton}
          {put.isSuccess && <span style={{ color: 'var(--status-ok)', fontSize: 12 }}>{t.workbench.saved}</span>}
          {put.isError && validationErrors.length === 0 && <span style={{ color: 'var(--status-fail)', fontSize: 12 }}>{t.workbench.saveError}</span>}
        </div>
      </div>
    );
  }

  // ── Voll-Modus ──
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 14, overflowY: 'auto', minWidth: 0 }}>
      {!canWrite && <ReadOnlyBanner hint={t.role.noWriteContract} />}
      {/* ApprovalBar: visible state machine + actions */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <LifecycleStepper current={lifecycle} />
        <OwnershipTag ownedBy={contract?.owned_by} />
        <div style={{ flex: 1 }} />
        {lifecycle === 'active' && <SlaBars product={product} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onToggleLite} style={{ ...btnStyle('ghost'), fontSize: 12 }}>{t.workbench.liteMode}</button>
          {saveButton}
          {lifecycle === 'draft' && (
            <button
              style={{ ...btnStyle(), opacity: !canWrite || breakingBlocked || approve.isPending ? 0.5 : 1, cursor: canWrite ? 'pointer' : 'not-allowed' }}
              disabled={!canWrite || breakingBlocked || approve.isPending}
              title={!canWrite ? writeTitle : breakingBlocked ? t.workbench.breakingHint : undefined}
              onClick={() => setConfirmApprove(true)}
            >
              {approve.isPending ? t.workbench.approving : t.workbench.approve}
            </button>
          )}
          {lifecycle === 'active' && (
            <button
              style={{ ...btnStyle('danger'), opacity: canWrite ? 1 : 0.5, cursor: canWrite ? 'pointer' : 'not-allowed' }}
              disabled={!canWrite || deprecate.isPending}
              title={writeTitle}
              onClick={() => deprecate.mutate()}
            >
              {deprecate.isPending ? t.workbench.deprecating : t.workbench.deprecate}
            </button>
          )}
        </div>
        {put.isSuccess && <span style={{ color: 'var(--status-ok)', fontSize: 12 }}>{t.workbench.saved}</span>}
        {put.isError && validationErrors.length === 0 && <span style={{ color: 'var(--status-fail)', fontSize: 12 }}>{t.workbench.saveError}</span>}
        {approve.isError && <span style={{ color: 'var(--status-fail)', fontSize: 12 }}>{extractValidationErrors(approve.error).join(' · ') || t.common.error}</span>}
      </div>

      {/* Approve confirm dialog — approving is a deliberate action */}
      {confirmApprove && (
        <div style={{ ...cardStyle, border: '1px solid var(--cont)' }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>{t.workbench.approveConfirm}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle()} onClick={handleApprove}>{t.common.confirm}</button>
            <button style={btnStyle('ghost')} onClick={() => setConfirmApprove(false)}>{t.common.cancel}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 14, alignItems: 'start' }}>
        {/* Left: guarantee editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t.workbench.editorTitle}</span>
            <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)' }}>{draft.dataset}</span>
            <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)' }}>v{String(draft.version).replace(/^v/i, '')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.workbench.noSql}</div>
          {guaranteeEditor}
          {errorsBlock}
        </div>

        {/* Right: YAML preview + BreakingDiffPanel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600, color: 'var(--fg-2)' }}>
              {t.workbench.yamlPreview}
            </div>
            <pre style={{
              ...monoStyle, fontSize: 11, color: 'var(--fg-2)', padding: 14,
              margin: 0, overflow: 'auto', maxHeight: 360, whiteSpace: 'pre',
            }}>
              {yamlPreview}
            </pre>
          </div>
          <BreakingDiffPanel
            entries={entries}
            pending={diff.isPending}
            isError={diff.isError}
            blocking={breakingBlocked}
          />
        </div>
      </div>

      {/* Compile / dry-run / revert panel (WS3, kept) */}
      <CompilePanel objectId={product} dataset={draft.dataset || product} />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ContractWorkbench() {
  const contractsQuery = useContracts();
  const inventory = useInventory();
  const [productParam, setProduct] = useSearchParamState('product');
  const [compileParam] = useSearchParamState('compile');
  const [liteParam, setLite] = useSearchParamState('lite');

  // Honor the legacy /contracts?compile={id} deep link.
  const product = productParam || compileParam;
  const lite = liteParam === '1';

  const contracts = contractsQuery.data ?? [];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.workbench.title}</h1>
      {contractsQuery.isError && <ErrorBanner onRetry={() => contractsQuery.refetch()} />}
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--line)',
        borderRadius: 8, overflow: 'hidden', display: 'flex', minHeight: 600,
      }}>
        <ContractList
          contracts={contracts}
          inventory={inventory.data?.datasets ?? []}
          selected={product}
          onSelect={setProduct}
        />
        {product ? (
          <EditorPane
            key={product}
            product={product}
            lite={lite}
            onToggleLite={() => setLite(lite ? '' : '1')}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)' }}>
            {t.workbench.selectPrompt}
          </div>
        )}
      </div>
    </div>
  );
}

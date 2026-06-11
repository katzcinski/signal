import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { useInventory } from '@/api/inventory';
import {
  useContracts, useContract, usePutContract, useApproveContract, useDeprecateContract,
  useDiffContract, useSeedContract, useCompileContractDryRun, useDryRunChecks,
  useRevertChecks, useExportBdc, useExportOdcs, type DiffResult,
} from '@/api/contracts';
import { useSla } from '@/api/coverage';
import { GuaranteeCards } from '@/components/contract/GuaranteeCards';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { StatePill } from '@/components/ui/StatePill';
import { StatusPill } from '@/components/ui/StatusPill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { toYaml } from '@/lib/yaml';
import { t } from '@/i18n/strings';
import type { Contract, ContractGuarantees, CheckState } from '@/types';

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 20, marginTop: 16,
};
const monoStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12 };
const btnStyle = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
  background: variant === 'primary' ? 'var(--cont)' : variant === 'danger' ? 'var(--status-fail)' : 'var(--bg-2)',
  color: variant === 'ghost' ? 'var(--fg)' : '#fff',
});

const errOf = (e: unknown): string => {
  const detail = (e as AxiosError<{ detail?: unknown }>)?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
  return 'Request failed';
};

// ─── Contract list (left rail) ───────────────────────────────────────────────
function ContractList({ selected, onSelect }: { selected: string; onSelect: (p: string) => void }) {
  const { data: contracts = [] } = useContracts();
  const { data: inventory = [] } = useInventory();
  const seed = useSeedContract();

  const contracted = new Set(contracts.map(c => c.product));
  const seedable = inventory.map(o => o.id).filter(id => !contracted.has(id));

  return (
    <div style={{ width: 240, borderRight: '1px solid var(--line)', overflowY: 'auto', flexShrink: 0 }}>
      {contracts.map(c => (
        <button
          key={c.product}
          onClick={() => onSelect(c.product)}
          style={{
            width: '100%', textAlign: 'left', padding: '10px 14px', cursor: 'pointer',
            background: selected === c.product ? 'var(--bg-2)' : 'transparent',
            border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--fg)',
          }}
        >
          <div style={{ ...monoStyle }}>{c.product}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', display: 'flex', gap: 8, marginTop: 2 }}>
            <span>{t.lifecycle[c.lifecycle] ?? c.lifecycle}</span>
            <span>·</span>
            <span>{c.owned_by}</span>
          </div>
        </button>
      ))}
      {seedable.length > 0 && (
        <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6 }}>New contract from object</div>
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) seed.mutate(e.target.value, { onSuccess: () => onSelect(e.target.value) }); }}
            style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}
          >
            <option value="">{seed.isPending ? 'Seeding…' : 'Select object…'}</option>
            {seedable.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Breaking-diff panel (gates Approve — friction ∝ risk) ────────────────────
function BreakingDiffPanel({ diff }: { diff: DiffResult }) {
  if (diff.message) return <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{diff.message}</div>;
  if (diff.entries.length === 0) return <div style={{ fontSize: 12, color: 'var(--status-ok)' }}>No changes vs. current version.</div>;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: diff.breaking ? 'var(--status-fail)' : 'var(--fg-2)', marginBottom: 6 }}>
        {diff.breaking ? '⚠ Breaking changes — requires a major version bump' : `${diff.entries.length} non-breaking change(s)`}
      </div>
      {diff.entries.map((e, i) => (
        <div key={i} style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-2)', padding: '2px 0' }}>
          <span style={{ color: e.kind.includes('break') || diff.breaking ? 'var(--status-fail)' : 'var(--fg-3)' }}>{e.kind}</span>{' '}
          {e.path}: {JSON.stringify(e.old)} → {JSON.stringify(e.new)}
        </div>
      ))}
    </div>
  );
}

// ─── Compile / dry-run / export panel ────────────────────────────────────────
function CompilePanel({ objectId, dataset }: { objectId: string; dataset: string }) {
  const compile = useCompileContractDryRun(objectId);
  const dryRun = useDryRunChecks(dataset);
  const revert = useRevertChecks(dataset);
  const exportBdc = useExportBdc(objectId);
  const exportOdcs = useExportOdcs(objectId);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [tab, setTab] = useState<'preview' | 'dryrun' | 'export' | 'odcs'>('preview');

  const compileData = compile.data as { yaml_preview?: string; conflicts?: string[]; determinism_hash?: string;
    checks?: { name: string; type: string; expect: string; severity: string }[] } | undefined;
  const dryRunData = dryRun.data as { mode?: string; overall_status?: string; total?: number; passed?: number;
    results?: { name: string; passed: boolean; actual_value: unknown; expect: string; state: CheckState }[];
    message?: string } | undefined;

  const tabStyle = (x: string): React.CSSProperties => ({
    padding: '5px 14px', fontSize: 12, cursor: 'pointer',
    borderBottom: tab === x ? '2px solid var(--cont)' : '2px solid transparent',
    color: tab === x ? 'var(--fg)' : 'var(--fg-3)',
  });

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Compile &amp; Test</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnStyle()} onClick={() => { compile.mutate(); setTab('preview'); }}>{compile.isPending ? 'Compiling…' : t.actions.compile}</button>
          <button style={btnStyle('ghost')} onClick={() => { dryRun.mutate({}); setTab('dryrun'); }}>{dryRun.isPending ? 'Running…' : t.actions.triggerRun}</button>
          <button style={btnStyle('ghost')} onClick={() => { exportBdc.mutate(); setTab('export'); }}>BDC export</button>
          <button style={btnStyle('ghost')} onClick={() => { exportOdcs.mutate(); setTab('odcs'); }}>ODCS export</button>
          <button style={btnStyle('danger')} onClick={() => setShowRevertConfirm(true)}>Revert</button>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={tabStyle('preview')} onClick={() => setTab('preview')}>Compiled checks</div>
        <div style={tabStyle('dryrun')} onClick={() => setTab('dryrun')}>Dry run</div>
        <div style={tabStyle('export')} onClick={() => setTab('export')}>BDC</div>
        <div style={tabStyle('odcs')} onClick={() => setTab('odcs')}>ODCS</div>
      </div>

      {tab === 'preview' && compileData && (
        <div>
          {compileData.determinism_hash && <div style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)', marginBottom: 8 }}>Hash: {compileData.determinism_hash}</div>}
          {(compileData.conflicts ?? []).length > 0 && (
            <div style={{ background: 'var(--status-warn)22', border: '1px solid var(--status-warn)', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 11 }}>
              {compileData.conflicts!.length} existing-wins conflict(s) preserved: {compileData.conflicts!.join(', ')}
            </div>
          )}
          {compileData.checks && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Check</th><th style={{ padding: '4px 8px' }}>Type</th>
                <th style={{ padding: '4px 8px' }}>Expect</th><th style={{ padding: '4px 8px' }}>Severity</th>
              </tr></thead>
              <tbody>{compileData.checks.map(c => (
                <tr key={c.name} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '4px 8px', ...monoStyle }}>{c.name}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--fg-3)' }}>{c.type}</td>
                  <td style={{ padding: '4px 8px', ...monoStyle }}>{c.expect}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--fg-2)' }}>{c.severity}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'dryrun' && dryRunData && (
        dryRunData.mode === 'compile_only'
          ? <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>{dryRunData.message}</div>
          : (
            <div>
              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <span style={{ fontSize: 13 }}>Status: <strong style={{ color: dryRunData.overall_status === 'pass' ? 'var(--status-ok)' : 'var(--status-fail)' }}>{dryRunData.overall_status}</strong></span>
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{dryRunData.passed}/{dryRunData.total} passed</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>Check</th><th style={{ padding: '4px 8px' }}>Actual</th>
                  <th style={{ padding: '4px 8px' }}>Expect</th><th style={{ padding: '4px 8px' }}>State</th>
                </tr></thead>
                <tbody>{(dryRunData.results ?? []).map(r => (
                  <tr key={r.name} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '4px 8px', ...monoStyle }}>{r.name}</td>
                    <td style={{ padding: '4px 8px', ...monoStyle }}>{String(r.actual_value ?? '—')}</td>
                    <td style={{ padding: '4px 8px', ...monoStyle }}>{r.expect}</td>
                    <td style={{ padding: '4px 8px' }}>
                      {r.state && r.state !== 'executed' ? <StatePill state={r.state} size="sm" /> : <StatusPill status={r.passed ? 'pass' : 'fail'} size="sm" />}
                    </td>
                  </tr>))}</tbody>
              </table>
            </div>
          )
      )}

      {tab === 'export' && exportBdc.data && (
        <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 360, fontSize: 11 }}>
          {JSON.stringify(exportBdc.data, null, 2)}
        </pre>
      )}
      {tab === 'odcs' && exportOdcs.data && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>ODCS 3.1 (interop export — compliance excluded)</div>
          <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 420, fontSize: 11 }}>
            {JSON.stringify(exportOdcs.data, null, 2)}
          </pre>
        </div>
      )}

      {compile.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>{errOf(compile.error)}</div>}
      {dryRun.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>Dry run failed</div>}

      {showRevertConfirm && (
        <div style={{ marginTop: 12, background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Revert <strong>checks/{dataset}/checks.yml</strong> to the previous git version?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle('danger')} onClick={() => { revert.mutate(); setShowRevertConfirm(false); }}>{revert.isPending ? 'Reverting…' : 'Confirm revert'}</button>
            <button style={btnStyle('ghost')} onClick={() => setShowRevertConfirm(false)}>{t.common.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SLA bar ─────────────────────────────────────────────────────────────────
function SlaBar({ product }: { product: string }) {
  const { data: sla } = useSla(product, 30);
  if (!sla) return null;
  const pct = sla.uptime_pct;
  const color = pct >= 99 ? 'var(--status-ok)' : pct >= 95 ? 'var(--status-warn)' : 'var(--status-fail)';
  return (
    <div style={{ ...cardStyle, marginTop: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>
        <span>SLA compliance · last {sla.window_days} days</span>
        <span style={{ color, fontWeight: 600 }}>{pct}% uptime</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────
function Editor({ product }: { product: string }) {
  const { data: contract, isLoading, isError, refetch } = useContract(product);
  const { data: inventory = [] } = useInventory();
  const put = usePutContract(product);
  const approve = useApproveContract(product);
  const deprecate = useDeprecateContract(product);
  const diff = useDiffContract(product);

  const [draft, setDraft] = useState<Contract | null>(null);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    if (contract) setDraft(JSON.parse(JSON.stringify(contract)));
    diff.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, product]);

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-3)' }}>{t.common.loading}</div>;
  if (isError) return <div style={{ flex: 1, padding: 24 }}><ErrorBanner onRetry={() => refetch()} /></div>;
  if (!draft) return null;

  const lifecycle = draft.lifecycle ?? 'draft';
  const dataset = draft.dataset || product;
  const datasets = inventory.map(o => o.id);
  const guarantees = draft.guarantees ?? {};

  const update = (patch: Partial<Contract>) => { setDraft({ ...draft, ...patch }); diff.reset(); };
  const setGuarantees = (g: ContractGuarantees) => update({ guarantees: g });

  const previewDoc = {
    product: draft.product, dataset: draft.dataset, owned_by: draft.owned_by,
    owners: draft.owners ?? [], version: draft.version,
    ...(draft.description ? { description: draft.description } : {}),
    guarantees,
  };

  const canApprove = lifecycle === 'draft' && diff.isSuccess && !diff.data?.breaking;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <LifecycleStepper current={lifecycle} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)' }}>
          <input type="checkbox" checked={lite} onChange={e => setLite(e.target.checked)} /> Lite mode
        </label>
      </div>

      {/* Approval state machine (diff-gated) */}
      <div style={{ ...cardStyle, marginTop: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>Lifecycle: <strong style={{ color: 'var(--fg)' }}>{t.lifecycle[lifecycle] ?? lifecycle}</strong></div>
        <div style={{ flex: 1 }} />
        {lifecycle === 'draft' && (
          <>
            <button style={btnStyle('ghost')} disabled={diff.isPending} onClick={() => diff.mutate(draft)}>
              {diff.isPending ? 'Checking…' : t.actions.diff}
            </button>
            <button style={{ ...btnStyle(), opacity: canApprove ? 1 : 0.5, cursor: canApprove ? 'pointer' : 'not-allowed' }}
              disabled={!canApprove || approve.isPending} onClick={() => approve.mutate()}
              title={canApprove ? '' : 'Run the breaking-change check first (and resolve breaking changes)'}>
              {approve.isPending ? 'Approving…' : `${t.actions.approve} → ${t.lifecycle.active}`}
            </button>
          </>
        )}
        {lifecycle === 'active' && (
          <button style={btnStyle('danger')} disabled={deprecate.isPending} onClick={() => deprecate.mutate()}>
            {deprecate.isPending ? 'Deprecating…' : t.actions.deprecate}
          </button>
        )}
        {approve.isError && <span style={{ color: 'var(--status-fail)', fontSize: 12 }}>{errOf(approve.error)}</span>}
        {deprecate.isError && <span style={{ color: 'var(--status-fail)', fontSize: 12 }}>{errOf(deprecate.error)}</span>}
      </div>

      {lifecycle === 'active' && <SlaBar product={draft.product} />}

      {/* Two-pane: cards (left) + YAML preview / diff (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Metadata */}
          <div style={{ ...cardStyle, marginTop: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--fg-3)' }}>Version
              <input value={draft.version} onChange={e => update({ version: e.target.value })}
                style={{ display: 'block', marginTop: 4, width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)', borderRadius: 5, padding: '5px 8px', fontSize: 12, ...monoStyle }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--fg-3)' }}>Owned by
              <select value={draft.owned_by} onChange={e => update({ owned_by: e.target.value })}
                style={{ display: 'block', marginTop: 4, width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>
                <option value="platform">platform</option>
                <option value="product">product</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: 'var(--fg-3)', gridColumn: '1 / 3' }}>Description
              <input value={draft.description ?? ''} onChange={e => update({ description: e.target.value })}
                style={{ display: 'block', marginTop: 4, width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg)', borderRadius: 5, padding: '5px 8px', fontSize: 12 }} />
            </label>
          </div>

          <GuaranteeCards value={guarantees} onChange={setGuarantees} datasets={datasets} lite={lite} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => put.mutate(draft)} disabled={put.isPending} style={btnStyle()}>
              {put.isPending ? 'Saving…' : t.common.save}
            </button>
            {put.isSuccess && <span style={{ color: 'var(--status-ok)', fontSize: 12 }}>Saved ✓</span>}
            {put.isError && <span style={{ color: 'var(--status-fail)', fontSize: 12 }}>{errOf(put.error)}</span>}
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>PUT always writes a draft — promote via Approve.</span>
          </div>
        </div>

        {/* Right: read-only YAML preview + breaking diff */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 }}>
          <div style={{ ...cardStyle, marginTop: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Contract YAML (read-only)</div>
            <pre style={{ ...monoStyle, fontSize: 11, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 420, margin: 0 }}>
              {toYaml(previewDoc)}
            </pre>
          </div>
          {diff.isSuccess && diff.data && (
            <div style={{ ...cardStyle, marginTop: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Breaking-change check</div>
              <BreakingDiffPanel diff={diff.data} />
            </div>
          )}
        </div>
      </div>

      <CompilePanel objectId={product} dataset={dataset} />
    </div>
  );
}

export default function ContractWorkbench() {
  const [selected, setSelected] = useState('');
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Contract Workbench</h1>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', display: 'flex', minHeight: 600 }}>
        <ContractList selected={selected} onSelect={setSelected} />
        {selected
          ? <Editor product={selected} />
          : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)' }}>Select a contract to edit, or seed one from an object</div>}
      </div>
    </div>
  );
}

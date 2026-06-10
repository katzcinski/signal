import { useState } from 'react';
import { useObjects } from '@/api/objects';
import {
  useContract, usePutContract,
  useCompileContractDryRun, useDryRunChecks, useRevertChecks, useExportBdc,
} from '@/api/contracts';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import type { Contract } from '@/types';

const SQL_PATTERNS = [/\bSELECT\b/i, /\bINSERT\b/i, /\bDROP\b/i, /\bDELETE\b/i, /\bUPDATE\b/i, /\bEXEC\b/i];
function hasSQL(text: string): boolean {
  return SQL_PATTERNS.some(p => p.test(text));
}

// ─── Shared style tokens ─────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-1)', border: '1px solid var(--line)',
  borderRadius: 8, padding: 20, marginTop: 16,
};
const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 12,
};
const btnStyle = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13,
  cursor: 'pointer',
  background: variant === 'primary' ? 'var(--cont)'
    : variant === 'danger' ? 'var(--status-fail)'
    : 'var(--bg-2)',
  color: variant === 'ghost' ? 'var(--fg)' : '#fff',
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function ObjectPanel({ objects, selected, onSelect }: {
  objects: { id: string; name: string; space: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ width: 220, borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
      {objects.map(o => (
        <div
          key={o.id}
          onClick={() => onSelect(o.id)}
          style={{
            padding: '10px 14px', cursor: 'pointer',
            background: selected === o.id ? 'var(--bg-2)' : 'transparent',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ ...monoStyle, color: 'var(--fg)' }}>{o.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{o.space}</div>
        </div>
      ))}
    </div>
  );
}

function ConflictList({ conflicts }: { conflicts: string[] }) {
  if (!conflicts.length) return null;
  return (
    <div style={{ background: 'var(--status-warn)22', border: '1px solid var(--status-warn)', borderRadius: 6, padding: '10px 14px', marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--status-warn)', marginBottom: 4 }}>
        {conflicts.length} existing-wins conflict{conflicts.length > 1 ? 's' : ''} — handwritten checks preserved:
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
    results?: { name: string; passed: boolean; actual_value: unknown; expect: string; state: string }[];
    message?: string; checks_yaml?: string;
  } | undefined;

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '5px 14px', fontSize: 12, cursor: 'pointer',
    borderBottom: activeTab === t ? '2px solid var(--cont)' : '2px solid transparent',
    color: activeTab === t ? 'var(--fg)' : 'var(--fg-3)',
  });

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Compile & Test</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnStyle()} onClick={() => { compile.mutate(); setActiveTab('preview'); }}>
            {compile.isPending ? 'Compiling…' : 'Compile (dry run)'}
          </button>
          <button style={btnStyle('ghost')} onClick={() => { dryRun.mutate({}); setActiveTab('dryrun'); }}>
            {dryRun.isPending ? 'Running…' : 'Run checks'}
          </button>
          <button style={btnStyle('ghost')} onClick={() => { exportBdc.mutate(); setActiveTab('export'); }}>BDC export</button>
          <button style={btnStyle('danger')} onClick={() => setShowRevertConfirm(true)}>Revert</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={tabStyle('preview')} onClick={() => setActiveTab('preview')}>Preview</div>
        <div style={tabStyle('dryrun')} onClick={() => setActiveTab('dryrun')}>Dry Run</div>
        <div style={tabStyle('export')} onClick={() => setActiveTab('export')}>BDC Export</div>
      </div>

      {activeTab === 'preview' && compileData && (
        <div>
          {compileData.determinism_hash && (
            <div style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-3)', marginBottom: 8 }}>
              Hash: {compileData.determinism_hash}
            </div>
          )}
          <ConflictList conflicts={compileData.conflicts ?? []} />
          {compileData.checks && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>Check</th>
                  <th style={{ padding: '4px 8px' }}>Type</th>
                  <th style={{ padding: '4px 8px' }}>Expect</th>
                  <th style={{ padding: '4px 8px' }}>Severity</th>
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
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--fg-3)' }}>YAML preview</summary>
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
                <span style={{ fontSize: 13 }}>Status: <strong style={{ color: dryRunData.overall_status === 'pass' ? 'var(--status-ok)' : 'var(--status-fail)' }}>{dryRunData.overall_status}</strong></span>
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{dryRunData.passed}/{dryRunData.total} passed</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>Check</th>
                    <th style={{ padding: '4px 8px' }}>Actual</th>
                    <th style={{ padding: '4px 8px' }}>Expect</th>
                    <th style={{ padding: '4px 8px' }}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {(dryRunData.results ?? []).map((r) => (
                    <tr key={r.name} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '4px 8px', ...monoStyle }}>{r.name}</td>
                      <td style={{ padding: '4px 8px', ...monoStyle }}>{String(r.actual_value ?? '—')}</td>
                      <td style={{ padding: '4px 8px', ...monoStyle }}>{r.expect}</td>
                      <td style={{ padding: '4px 8px', color: r.passed ? 'var(--status-ok)' : 'var(--status-fail)' }}>{r.state}</td>
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
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>CSN fragment</div>
          <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 200, fontSize: 11 }}>
            {JSON.stringify((exportBdc.data as { csn_fragment: unknown }).csn_fragment, null, 2)}
          </pre>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, marginTop: 12 }}>ORD fragment</div>
          <pre style={{ ...monoStyle, background: 'var(--bg-2)', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 200, fontSize: 11 }}>
            {JSON.stringify((exportBdc.data as { ord_fragment: unknown }).ord_fragment, null, 2)}
          </pre>
        </div>
      )}

      {compile.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>Compile failed</div>}
      {dryRun.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>Dry run failed</div>}

      {/* Revert confirmation */}
      {showRevertConfirm && (
        <div style={{ marginTop: 12, background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Revert <strong>checks/{dataset}/checks.yml</strong> to the previous git version?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnStyle('danger')} onClick={() => { revert.mutate(); setShowRevertConfirm(false); }}>
              {revert.isPending ? 'Reverting…' : 'Confirm revert'}
            </button>
            <button style={btnStyle('ghost')} onClick={() => setShowRevertConfirm(false)}>Cancel</button>
          </div>
          {revert.isSuccess && (
            <div style={{ color: 'var(--status-ok)', fontSize: 12, marginTop: 8 }}>
              Reverted to {(revert.data as { reverted_to_commit?: string })?.reverted_to_commit?.slice(0, 8)}
            </div>
          )}
          {revert.isError && <div style={{ color: 'var(--status-fail)', fontSize: 12, marginTop: 8 }}>Revert failed</div>}
        </div>
      )}
    </div>
  );
}

function Editor({ objectId }: { objectId: string }) {
  const { data: contract, isLoading } = useContract(objectId);
  const put = usePutContract(objectId);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const currentText = text || (contract ? JSON.stringify(contract, null, 2) : '');
  const dataset = (contract as Contract & { dataset?: string })?.dataset ?? objectId;

  const handleSave = () => {
    const errs: string[] = [];
    if (hasSQL(currentText)) errs.push('G1: SQL keyword detected in contract — not allowed');
    setErrors(errs);
    if (errs.length > 0) return;
    try {
      const data: Contract = JSON.parse(currentText);
      put.mutate(data);
    } catch {
      setErrors(['Invalid JSON']);
    }
  };

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-3)' }}>Loading…</div>;

  const lifecycle = contract?.lifecycle ?? 'draft';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 16, overflowY: 'auto' }}>
      <LifecycleStepper current={lifecycle} />

      {/* Contract JSON editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={currentText}
          onChange={e => { setText(e.target.value); setErrors([]); }}
          spellCheck={false}
          style={{
            minHeight: 320, background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', ...monoStyle, fontSize: 12,
            padding: 14, borderRadius: 6, resize: 'vertical', outline: 'none',
          }}
          placeholder="Paste or type contract JSON…"
        />
        {errors.length > 0 && (
          <div style={{ background: 'var(--status-fail)22', border: '1px solid var(--status-fail)', borderRadius: 5, padding: '8px 12px' }}>
            {errors.map((e, i) => <div key={i} style={{ color: 'var(--status-fail)', fontSize: 12 }}>{e}</div>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={put.isPending} style={btnStyle()}>
            {put.isPending ? 'Saving…' : 'Save Contract'}
          </button>
          {put.isSuccess && <span style={{ color: 'var(--status-ok)', fontSize: 12, alignSelf: 'center' }}>Saved ✓</span>}
          {put.isError && <span style={{ color: 'var(--status-fail)', fontSize: 12, alignSelf: 'center' }}>Error saving</span>}
        </div>
      </div>

      {/* Compile / dry-run / revert panel */}
      <CompilePanel objectId={objectId} dataset={dataset} />
    </div>
  );
}

export default function ContractWorkbench() {
  const { data: objects = [] } = useObjects();
  const [selectedId, setSelectedId] = useState('');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Contract Workbench</h1>
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--line)',
        borderRadius: 8, overflow: 'hidden', display: 'flex', minHeight: 600,
      }}>
        <ObjectPanel objects={objects} selected={selectedId} onSelect={setSelectedId} />
        {selectedId ? (
          <Editor objectId={selectedId} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)' }}>
            Select an object to edit its contract
          </div>
        )}
      </div>
    </div>
  );
}

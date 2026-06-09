import { useState } from 'react';
import { useObjects } from '@/api/objects';
import { useContract, usePutContract } from '@/api/contracts';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import type { Contract } from '@/types';

// Minimal G1 client-side validator (mirrors backend)
const SQL_PATTERNS = [/\bSELECT\b/i, /\bINSERT\b/i, /\bDROP\b/i, /\bDELETE\b/i, /\bUPDATE\b/i, /\bEXEC\b/i];
function hasSQL(text: string): boolean {
  return SQL_PATTERNS.some(p => p.test(text));
}

function validateYaml(text: string): string[] {
  if (hasSQL(text)) return ['G1: SQL keyword detected in contract — not allowed'];
  return [];
}

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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{o.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{o.space}</div>
        </div>
      ))}
    </div>
  );
}

function Editor({ objectId }: { objectId: string }) {
  const { data: contract, isLoading } = useContract(objectId);
  const put = usePutContract(objectId);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const currentText = text || (contract ? JSON.stringify(contract, null, 2) : '');

  const handleSave = () => {
    const errs = validateYaml(currentText);
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 16 }}>
      <LifecycleStepper current={lifecycle} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={currentText}
          onChange={e => { setText(e.target.value); setErrors([]); }}
          spellCheck={false}
          style={{
            flex: 1, minHeight: 400, background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12,
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
          <button
            onClick={handleSave}
            disabled={put.isPending}
            style={{
              background: 'var(--cont)', color: '#fff', border: 'none',
              borderRadius: 5, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
            }}
          >
            {put.isPending ? 'Saving…' : 'Save Contract'}
          </button>
          {put.isSuccess && <span style={{ color: 'var(--status-ok)', fontSize: 12, alignSelf: 'center' }}>Saved ✓</span>}
          {put.isError && <span style={{ color: 'var(--status-fail)', fontSize: 12, alignSelf: 'center' }}>Error saving</span>}
        </div>
      </div>
    </div>
  );
}

export default function ContractWorkbench() {
  const { data: objects = [] } = useObjects();
  const [selectedId, setSelectedId] = useState('');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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

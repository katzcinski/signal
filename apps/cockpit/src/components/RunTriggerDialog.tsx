import { useState } from 'react';
import { useEnvironments } from '@/api/system';
import type { RunTriggerBody } from '@/api/objects';

// R3-5: explicit run trigger — dataset (fixed), environment, execution mode.
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const select: React.CSSProperties = {
  width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)',
  color: 'var(--fg)', borderRadius: 5, padding: '6px 10px', fontSize: 13, marginTop: 4,
};
const btn = (primary = false): React.CSSProperties => ({
  border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
  background: primary ? 'var(--cont)' : 'var(--bg-2)', color: primary ? '#fff' : 'var(--fg)',
});

interface Props {
  dataset: string;
  onClose: () => void;
  onRun: (body: RunTriggerBody) => void;
  pending?: boolean;
}

export function RunTriggerDialog({ dataset, onClose, onRun, pending }: Props) {
  const { data: environments = [] } = useEnvironments();
  const [environment, setEnvironment] = useState('');
  const [mode, setMode] = useState('auto');

  return (
    <div style={overlay} role="dialog" aria-label="Trigger run" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Run checks</h2>

        <label style={{ fontSize: 12, color: 'var(--fg-3)', display: 'block', marginBottom: 12 }}>
          Dataset
          <input value={dataset} disabled style={{ ...select, fontFamily: 'var(--font-mono)', opacity: 0.7 }} />
        </label>

        <label style={{ fontSize: 12, color: 'var(--fg-3)', display: 'block', marginBottom: 12 }}>
          Environment
          <select value={environment} onChange={e => setEnvironment(e.target.value)} style={select}>
            <option value="">{environments.length ? 'Default (mock if local)' : 'Local (mock connection)'}</option>
            {environments.map(env => <option key={env} value={env}>{env}</option>)}
          </select>
        </label>

        <label style={{ fontSize: 12, color: 'var(--fg-3)', display: 'block', marginBottom: 20 }}>
          Execution mode
          <select value={mode} onChange={e => setMode(e.target.value)} style={select}>
            <option value="auto">Auto (gating applies)</option>
            <option value="all">All checks</option>
          </select>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btn()} onClick={onClose}>Cancel</button>
          <button style={btn(true)} disabled={pending}
            onClick={() => onRun({ environment: environment || undefined, execution_mode: mode })}>
            {pending ? 'Starting…' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

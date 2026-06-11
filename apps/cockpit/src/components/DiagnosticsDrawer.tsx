import { useRunDiagnostics } from '@/api/runs';

// R1-3/R3-5: diagnostics are off by default and allowlist-projected at the
// source, so this drawer only ever shows permitted columns — or a clear note
// that diagnostics are disabled / produced no rows.
const drawer: React.CSSProperties = {
  position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, zIndex: 55,
  background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
  boxShadow: '-8px 0 24px rgba(0,0,0,0.3)', padding: 20, overflowY: 'auto',
};

export function DiagnosticsDrawer({ runId, checkName, onClose }: {
  runId: string; checkName: string; onClose: () => void;
}) {
  const { data: rows = [], isLoading } = useRunDiagnostics(runId, checkName, true);
  const columns = rows.length ? Object.keys(rows[0].row) : [];

  return (
    <div style={drawer} role="dialog" aria-label="Diagnostics">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>Diagnostics</h2>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-2)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)', marginBottom: 12 }}>{checkName}</div>

      {isLoading ? (
        <div style={{ color: 'var(--fg-3)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
          No diagnostic rows. Diagnostics are disabled by default and only capture
          allowlisted columns when explicitly enabled on the check.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr style={{ color: 'var(--fg-3)', textAlign: 'left' }}>
            {columns.map(c => <th key={c} style={{ padding: '4px 8px' }}>{c}</th>)}
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
              {columns.map(c => (
                <td key={c} style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>
                  {String(r.row[c] ?? '—')}
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

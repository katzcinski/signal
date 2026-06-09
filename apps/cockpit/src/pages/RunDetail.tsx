import { useParams, useNavigate } from 'react-router-dom';
import { useRun } from '@/api/runs';
import { StatusPill } from '@/components/ui/StatusPill';
import { Table, type ColDef } from '@/components/ui/Table';
import type { CheckResult } from '@/types';

export default function RunDetail() {
  const { id = '' } = useParams();
  const { data: run, isLoading } = useRun(id);
  const navigate = useNavigate();

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;
  if (!run) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Run not found</div>;

  const durationMs = run.started_at && run.finished_at
    ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
    : null;

  const columns: ColDef<CheckResult>[] = [
    { key: 'name', header: 'Check', mono: true, render: c => c.name },
    { key: 'status', header: 'Status', render: c => <StatusPill status={c.passed ? 'pass' : c.severity} size="sm" /> },
    { key: 'expect', header: 'Expect', mono: true, render: c => c.expect },
    { key: 'actual', header: 'Actual', mono: true, render: c => c.actual_value ?? '—' },
    { key: 'error', header: 'Error', render: c => c.error ? <span style={{ color: 'var(--status-fail)', fontSize: 11 }}>{c.error}</span> : null },
    { key: 'ms', header: 'ms', mono: true, render: c => String(c.duration_ms) },
  ];

  const downloadCSV = () => {
    const header = 'name,passed,expect,actual_value,severity,duration_ms,error\n';
    const rows = run.results.map(r =>
      `"${r.name}",${r.passed},"${r.expect}","${r.actual_value ?? ''}","${r.severity}",${r.duration_ms},"${r.error ?? ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `run_${run.run_id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', marginBottom: 12 }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-2)' }}>{run.run_id}</span>
          <StatusPill status={run.overall_status} />
          <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>Dataset: {run.dataset}</span>
          <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>Triggered by: {run.triggered_by}</span>
          {durationMs !== null && <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{durationMs}ms</span>}
          <div style={{ flex: 1 }} />
          <button
            onClick={downloadCSV}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg-2)', borderRadius: 5, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
          >
            Download CSV
          </button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 20 }}>
          {[
            { label: 'Total', value: run.total },
            { label: 'Passed', value: run.passed, color: 'var(--status-ok)' },
            { label: 'Failed', value: run.failed, color: 'var(--status-fail)' },
            { label: 'Warnings', value: run.warnings, color: 'var(--status-warn)' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--fg)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <Table columns={columns} rows={run.results} rowKey={c => c.name} empty="No check results" />
      </div>
    </div>
  );
}

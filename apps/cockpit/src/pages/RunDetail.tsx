import { useParams, useNavigate, Link } from 'react-router-dom';
import { useRun } from '@/api/runs';
import { StatusPill } from '@/components/ui/StatusPill';
import { CheckStatusCell } from '@/components/ui/StatePill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Table, type ColDef } from '@/components/ui/Table';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { t } from '@/i18n/de';
import type { CheckResult } from '@/types';

// CSV field escaping: double inner quotes, wrap in quotes, and neutralize
// formula injection by prefixing =, +, -, @ with a single quote.
function csvField(value: unknown): string {
  let s = String(value ?? '').replace(/"/g, '""');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s}"`;
}

export default function RunDetail() {
  const { id = '' } = useParams();
  const { data: run, isLoading, isError, refetch } = useRun(id);
  const navigate = useNavigate();

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;
  if (isError) return <div style={{ maxWidth: 1100, margin: '0 auto' }}><ErrorBanner onRetry={() => refetch()} /></div>;
  if (!run) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.runDetail.notFound}</div>;

  const durationMs = run.started_at && run.finished_at
    ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
    : null;

  const columns: ColDef<CheckResult>[] = [
    { key: 'name', header: t.runDetail.colCheck, mono: true, render: c => c.name },
    { key: 'status', header: t.runDetail.colStatus, render: c => <CheckStatusCell state={c.state} passed={c.passed} severity={c.severity} /> },
    { key: 'expect', header: t.runDetail.colExpect, mono: true, render: c => c.expect },
    { key: 'actual', header: t.runDetail.colActual, mono: true, render: c => c.actual_value ?? '—' },
    { key: 'error', header: t.runDetail.colError, render: c => c.error ? <span style={{ color: 'var(--status-fail)', fontSize: 11 }}>{c.error}</span> : null },
    { key: 'ms', header: t.runDetail.colMs, mono: true, render: c => String(c.duration_ms) },
  ];

  const downloadCSV = () => {
    const header = 'name,state,passed,expect,actual_value,severity,duration_ms,error\n';
    const rows = run.results.map(r =>
      [r.name, r.state, r.passed, r.expect, r.actual_value ?? '', r.severity, r.duration_ms, r.error ?? '']
        .map(csvField)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `run_${run.run_id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Breadcrumbs items={[
        { label: t.breadcrumb.home, to: '/' },
        { label: t.breadcrumb.objects, to: '/objects' },
        { label: run.dataset, to: `/objects/${run.dataset}` },
        { label: `${t.breadcrumb.runs} ${run.run_id.slice(0, 12)}…` },
      ]} />
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', marginBottom: 12 }}>{t.runDetail.back}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-2)' }}>{run.run_id}</span>
          <StatusPill status={run.overall_status} />
          <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.runDetail.dataset}: {run.dataset}</span>
          <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.runDetail.triggeredBy}: {run.triggered_by}</span>
          {durationMs !== null && <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{durationMs}ms</span>}
          <div style={{ flex: 1 }} />
          <Link
            to={`/runs/compare?head=${encodeURIComponent(run.run_id)}`}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg-2)', borderRadius: 5, padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}
          >
            {t.compare.compareTo}
          </Link>
          <button
            onClick={downloadCSV}
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--fg-2)', borderRadius: 5, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
          >
            {t.runDetail.downloadCsv}
          </button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 20 }}>
          {[
            { label: t.runDetail.total, value: run.total },
            { label: t.runDetail.passed, value: run.passed, color: 'var(--status-ok)' },
            { label: t.runDetail.failed, value: run.failed, color: 'var(--status-fail)' },
            { label: t.runDetail.warnings, value: run.warnings, color: 'var(--status-warn)' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--fg)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <Table columns={columns} rows={run.results} rowKey={c => c.name} empty={t.runDetail.noResults} />
      </div>
    </div>
  );
}

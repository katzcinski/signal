import { useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useObject, useObjectRuns, useTriggerRun } from '@/api/objects';
import { useRun } from '@/api/runs';
import { useContract } from '@/api/contracts';
import { StatusPill } from '@/components/ui/StatusPill';
import { CheckStatusCell } from '@/components/ui/StatePill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { LiveRunPanel } from '@/components/LiveRunPanel';
import { Table, type ColDef } from '@/components/ui/Table';
import type { CheckResult, RunListItem } from '@/types';

type Tab = 'checks' | 'runs' | 'contract' | 'lineage';

export default function ObjectDetail() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'checks') as Tab;
  const setTab = (t: Tab) => setSp({ tab: t });
  const navigate = useNavigate();
  const qc = useQueryClient();

  // All hooks run unconditionally — no early return may come before them.
  const { data: obj, isLoading, isError, refetch } = useObject(id);
  const { data: runs = [] } = useObjectRuns(id);
  const { data: contract } = useContract(id);
  const trigger = useTriggerRun(id);

  const latestRun: RunListItem | undefined = runs[0];
  const { data: latestRunDetail } = useRun(latestRun?.run_id ?? '');
  const results: CheckResult[] = latestRunDetail?.results ?? [];

  const isRunning = latestRun?.run_state === 'running' || latestRunDetail?.run_state === 'running';

  // When the in-flight run completes, refresh object status + run list.
  const runState = latestRunDetail?.run_state;
  const prevRunState = useRef(runState);
  useEffect(() => {
    if (prevRunState.current === 'running' && runState && runState !== 'running') {
      qc.invalidateQueries({ queryKey: ['objects', id] });
      qc.invalidateQueries({ queryKey: ['objects', id, 'runs'] });
    }
    prevRunState.current = runState;
  }, [runState, id, qc]);

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;
  if (isError) return <div style={{ maxWidth: 1100, margin: '0 auto' }}><ErrorBanner onRetry={() => refetch()} /></div>;
  if (!obj) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Object not found</div>;

  const TAB_STYLE = (t: Tab) => ({
    padding: '8px 16px', border: 'none', background: 'none',
    color: tab === t ? 'var(--fg)' : 'var(--fg-3)',
    borderBottom: tab === t ? '2px solid var(--cont)' : '2px solid transparent',
    cursor: 'pointer', fontSize: 13,
  });

  const runColumns: ColDef<RunListItem>[] = [
    { key: 'run_id', header: 'Run ID', mono: true, render: r => (
      <Link to={`/runs/${r.run_id}`} style={{ color: 'var(--cont)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {r.run_id.slice(0, 12)}…
      </Link>
    )},
    { key: 'status', header: 'Status', render: r => <StatusPill status={r.overall_status} size="sm" /> },
    { key: 'total', header: 'Checks', render: r => `${r.passed}/${r.total}` },
    { key: 'started_at', header: 'Started', mono: true, render: r => new Date(r.started_at).toLocaleString() },
    { key: 'triggered_by', header: 'Trigger', render: r => <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{r.triggered_by}</span> },
  ];

  const checkColumns: ColDef<CheckResult>[] = [
    { key: 'name', header: 'Check', mono: true, render: c => c.name },
    { key: 'status', header: 'Status', render: c => <CheckStatusCell state={c.state} passed={c.passed} severity={c.severity} /> },
    { key: 'expect', header: 'Expect', mono: true, render: c => c.expect },
    { key: 'actual', header: 'Actual', mono: true, render: c => c.actual_value ?? '—' },
    { key: 'ms', header: 'ms', mono: true, render: c => String(c.duration_ms) },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/objects')} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}>← Objects</button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}>{obj.name}</span>
            <FamilyTag family={obj.family} />
            <StatusPill status={obj.status ?? 'unknown'} size="sm" />
          </div>
          <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>{obj.space} · {obj.layer}</p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending || isRunning}
          style={{
            background: 'var(--cont)', color: '#fff', border: 'none',
            borderRadius: 5, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >
          {trigger.isPending || isRunning ? 'Running…' : 'Run Now'}
        </button>
      </div>

      <div style={{ borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {(['checks', 'runs', 'contract', 'lineage'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'checks' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <Table columns={checkColumns} rows={results} rowKey={c => c.name} empty="No results — trigger a run first" />
        </div>
      )}

      {tab === 'runs' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <Table columns={runColumns} rows={runs} rowKey={r => r.run_id} empty="No runs yet" />
        </div>
      )}

      {tab === 'contract' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 20 }}>
          {contract ? (
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(contract, null, 2)}
            </pre>
          ) : (
            <p style={{ color: 'var(--fg-3)' }}>No contract — go to <Link to="/contracts" style={{ color: 'var(--cont)' }}>Contracts</Link> to create one.</p>
          )}
        </div>
      )}

      {tab === 'lineage' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--fg-3)' }}>
            See full lineage on the <Link to="/lineage" style={{ color: 'var(--cont)' }}>Lineage Map</Link>.
          </p>
        </div>
      )}

      {latestRun && (
        <LiveRunPanel runId={latestRun.run_id} dataset={latestRun.dataset} running={isRunning} />
      )}
    </div>
  );
}

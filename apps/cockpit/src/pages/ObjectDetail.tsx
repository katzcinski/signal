import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useObject, useObjectRuns, useTriggerRun, useCheckHistory } from '@/api/objects';
import { useRun } from '@/api/runs';
import { useContract } from '@/api/contracts';
import { StatusPill } from '@/components/ui/StatusPill';
import { CheckStatusCell } from '@/components/ui/StatePill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { LiveRunPanel } from '@/components/LiveRunPanel';
import { RunTriggerDialog } from '@/components/RunTriggerDialog';
import { BadgeEmbed } from '@/components/BadgeEmbed';
import { MinedProposalsCallout } from '@/components/MinedProposalsCallout';
import { Spark } from '@/components/ui/Spark';
import { Table, type ColDef } from '@/components/ui/Table';
import { t } from '@/i18n/de';
import type { CheckResult, RunListItem } from '@/types';

type Tab = 'checks' | 'runs' | 'contract' | 'lineage';

// Sparkline over the numeric actual_value history of one check (newest-first
// API order is reversed into chronological order). Non-numeric series → dash.
function HistorySpark({ objectId, checkName, enabled }: {
  objectId: string;
  checkName: string;
  enabled: boolean;
}) {
  const { data } = useCheckHistory(objectId, checkName, enabled);
  if (!data) return <span style={{ color: 'var(--fg-3)' }}>—</span>;
  const values = [...data]
    .reverse()
    .map(p => Number(p.actual_value))
    .filter(v => Number.isFinite(v));
  if (values.length < 2) return <span style={{ color: 'var(--fg-3)' }}>—</span>;
  return <Spark data={values} color="var(--cont)" />;
}

export default function ObjectDetail() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'checks') as Tab;
  const setTab = (next: Tab) => setSp({ tab: next });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

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

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;
  if (isError) return <div style={{ maxWidth: 1100, margin: '0 auto' }}><ErrorBanner onRetry={() => refetch()} /></div>;
  if (!obj) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.objectDetail.notFound}</div>;

  const TAB_STYLE = (tabKey: Tab) => ({
    padding: '8px 16px', border: 'none', background: 'none',
    color: tab === tabKey ? 'var(--fg)' : 'var(--fg-3)',
    borderBottom: tab === tabKey ? '2px solid var(--cont)' : '2px solid transparent',
    cursor: 'pointer', fontSize: 13,
  });

  const runColumns: ColDef<RunListItem>[] = [
    { key: 'run_id', header: t.objectDetail.colRunId, mono: true, render: r => (
      <Link to={`/runs/${r.run_id}`} style={{ color: 'var(--cont)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {r.run_id.slice(0, 12)}…
      </Link>
    )},
    { key: 'status', header: t.objectDetail.colStatus, render: r => <StatusPill status={r.overall_status} size="sm" /> },
    { key: 'total', header: t.objectDetail.colChecks, render: r => `${r.passed}/${r.total}` },
    { key: 'started_at', header: t.objectDetail.colStarted, mono: true, render: r => new Date(r.started_at).toLocaleString() },
    { key: 'triggered_by', header: t.objectDetail.colTrigger, render: r => <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{r.triggered_by}</span> },
  ];

  // E: trend sparkline — fetch history for the first ~20 checks of the latest run.
  const sparkBudget = new Set(results.slice(0, 20).map(c => c.name));

  const checkColumns: ColDef<CheckResult>[] = [
    { key: 'name', header: t.objectDetail.colCheck, mono: true, render: c => c.name },
    { key: 'status', header: t.objectDetail.colStatus, render: c => <CheckStatusCell state={c.state} passed={c.passed} severity={c.severity} /> },
    { key: 'expect', header: t.objectDetail.colExpect, mono: true, render: c => c.expect },
    { key: 'actual', header: t.objectDetail.colActual, mono: true, render: c => c.actual_value ?? '—' },
    {
      key: 'trend', header: t.objectDetail.colTrend, width: 80,
      render: c => <HistorySpark objectId={id} checkName={c.name} enabled={sparkBudget.has(c.name)} />,
    },
    { key: 'ms', header: t.objectDetail.colMs, mono: true, render: c => String(c.duration_ms) },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/objects')} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}>{t.objectDetail.back}</button>
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
          onClick={() => setDialogOpen(true)}
          disabled={trigger.isPending || isRunning}
          style={{
            background: 'var(--cont)', color: '#fff', border: 'none',
            borderRadius: 5, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
          }}
        >
          {trigger.isPending || isRunning ? t.objectDetail.running : t.objectDetail.run}
        </button>
      </div>

      {dialogOpen && (
        <RunTriggerDialog
          pending={trigger.isPending}
          onClose={() => setDialogOpen(false)}
          onStart={body => trigger.mutate(body, { onSettled: () => setDialogOpen(false) })}
        />
      )}

      <div style={{ borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {(['checks', 'runs', 'contract', 'lineage'] as Tab[]).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} style={TAB_STYLE(tabKey)}>
            {t.objectDetail.tabs[tabKey] ?? tabKey}
          </button>
        ))}
      </div>

      {tab === 'checks' && (
        <>
          {results.length === 0 && <MinedProposalsCallout productId={obj.id} />}
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <Table columns={checkColumns} rows={results} rowKey={c => c.name} empty={t.objectDetail.noResults} />
          </div>
        </>
      )}

      {tab === 'runs' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <Table columns={runColumns} rows={runs} rowKey={r => r.run_id} empty={t.objectDetail.noRuns} />
        </div>
      )}

      {tab === 'contract' && (
        <>
          {!contract && <MinedProposalsCallout productId={obj.id} />}
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 20 }}>
            {contract ? (
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(contract, null, 2)}
              </pre>
            ) : (
              <p style={{ color: 'var(--fg-3)' }}>
                {t.objectDetail.noContractPrefix}{' '}
                <Link to="/contracts" style={{ color: 'var(--cont)' }}>{t.objectDetail.noContractLink}</Link>{' '}
                {t.objectDetail.noContractSuffix}
              </p>
            )}
          </div>
          <BadgeEmbed product={obj.id} />
        </>
      )}

      {tab === 'lineage' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--fg-3)' }}>
            {t.objectDetail.lineageHint}{' '}
            <Link to={`/lineage?focus=${encodeURIComponent(obj.id)}`} style={{ color: 'var(--cont)' }}>{t.objectDetail.lineageLink}</Link>.
          </p>
        </div>
      )}

      {latestRun && (
        <LiveRunPanel runId={latestRun.run_id} dataset={latestRun.dataset} running={isRunning} />
      )}
    </div>
  );
}

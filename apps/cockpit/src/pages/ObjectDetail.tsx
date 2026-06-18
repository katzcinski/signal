import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useObject, useObjectRuns, useTriggerRun, useCheckHistory } from '@/api/objects';
import { useRun } from '@/api/runs';
import { useContract, useContractVersionDiff } from '@/api/contracts';
import { useLineage } from '@/api/lineage';
import { StatusPill } from '@/components/ui/StatusPill';
import { CheckStatusCell } from '@/components/ui/StatePill';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { LiveRunPanel } from '@/components/LiveRunPanel';
import { RunTriggerDialog } from '@/components/RunTriggerDialog';
import { BadgeEmbed } from '@/components/BadgeEmbed';
import { MinedProposalsCallout } from '@/components/MinedProposalsCallout';
import { ObservabilityTimeseries } from '@/components/ObservabilityTimeseries';
import { ObjectProfilePanel } from '@/components/ObjectProfilePanel';
import { Spark } from '@/components/ui/Spark';
import { Table, type ColDef } from '@/components/ui/Table';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { useRoleStore, canProfileObject } from '@/store/role';
import { t } from '@/i18n/de';
import type { CheckResult, ContractOut, RunListItem } from '@/types';

type Tab = 'checks' | 'runs' | 'timeseries' | 'contract' | 'lineage';
type KindFilter = 'internal' | 'contract' | 'all';

// ---------------------------------------------------------------------------
// Structured contract view — replaces raw JSON.stringify
// ---------------------------------------------------------------------------
function ContractView({ contract }: { contract: ContractOut }) {
  const guaranteeEntries = Object.entries(contract.guarantees ?? {}).filter(([, v]) => {
    if (!v) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  });

  const lifecycleColor = contract.lifecycle === 'active'
    ? { bg: 'rgba(45,164,78,0.15)', fg: '#2da44e' }
    : { bg: 'var(--bg-2)', fg: 'var(--fg-3)' };

  return (
    <div>
      {/* Metadata row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
          v{contract.version}
        </span>
        <span style={{
          fontSize: 11, borderRadius: 4, padding: '2px 8px',
          background: lifecycleColor.bg, color: lifecycleColor.fg,
          border: `1px solid ${lifecycleColor.fg}`,
        }}>
          {t.lifecycle[contract.lifecycle] ?? contract.lifecycle}
        </span>
        <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{contract.owned_by}</span>
        {contract.owners && contract.owners.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            {contract.owners.join(', ')}
          </span>
        )}
        {contract.compliance && (
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            · {t.compliance[contract.compliance] ?? contract.compliance}
          </span>
        )}
      </div>

      {/* Description */}
      {contract.description && (
        <p style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 16, lineHeight: 1.6 }}>
          {contract.description}
        </p>
      )}

      {/* Guarantee families */}
      {guaranteeEntries.length === 0 ? (
        <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>Keine Garantien definiert.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {guaranteeEntries.map(([family, value]) => (
            <div key={family}>
              <div style={{
                fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 4,
              }}>
                {t.workbench.families[family] ?? family}
              </div>
              <div style={{ background: 'var(--bg-2)', borderRadius: 6, padding: '8px 12px' }}>
                <pre style={{
                  margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--fg-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UX-N13: semantic version diff — working contract vs. certified version.
// Explains the *meaning* of each change (kind + old→new), not just a YAML dump.
// ---------------------------------------------------------------------------
function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function ContractVersionDiffView({ product, enabled }: { product: string; enabled: boolean }) {
  const { data: diff, isLoading } = useContractVersionDiff(product, enabled);
  if (isLoading || !diff) return null;

  return (
    <div style={{ marginTop: 16, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t.diff.versionTitle}
        </span>
        {diff.available && diff.from_version && (
          <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            {t.diff.fromTo.replace('{from}', `v${diff.from_version}`).replace('{to}', `v${diff.to_version}`)}
          </span>
        )}
        {diff.available && diff.entries.length > 0 && (
          <span style={{
            fontSize: 10, borderRadius: 4, padding: '2px 8px',
            background: diff.breaking ? 'rgba(196,68,68,0.15)' : 'rgba(45,164,78,0.15)',
            color: diff.breaking ? 'var(--status-fail)' : 'var(--status-ok)',
            border: `1px solid ${diff.breaking ? 'var(--status-fail)' : 'var(--status-ok)'}`,
          }}>
            {diff.breaking ? t.diff.breaking : t.diff.nonBreaking}
          </span>
        )}
      </div>

      {!diff.available ? (
        <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.diff.noBaseline}</p>
      ) : diff.entries.length === 0 ? (
        <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.diff.noChanges}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {diff.entries.map((e, i) => (
            <div key={`${e.path}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              borderLeft: `3px solid ${e.breaking ? 'var(--status-fail)' : 'var(--status-warn)'}`,
              background: 'var(--bg-2)', borderRadius: 5, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>
                {t.diff.kinds[e.kind] ?? e.kind}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{e.path}</span>
              <div style={{ flex: 1 }} />
              <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{fmtVal(e.old)}</code>
              <span style={{ color: 'var(--fg-3)' }}>→</span>
              <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: e.breaking ? 'var(--status-fail)' : 'var(--fg-2)' }}>{fmtVal(e.new)}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini-DAG — SVG 1-hop neighbourhood (simple SVG, no Cytoscape)
// ---------------------------------------------------------------------------
const _BOX_W = 144;
const _BOX_H = 34;
const _H_GAP = 56;
const _V_GAP = 10;

function _colH(count: number): number {
  return Math.max(1, count) * (_BOX_H + _V_GAP) - _V_GAP;
}

function _boxY(svgH: number, idx: number, total: number): number {
  const totalH = _colH(total);
  return (svgH - totalH) / 2 + idx * (_BOX_H + _V_GAP);
}

function _truncate(s: string, max = 17): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function MiniLineageDag({ focusId }: { focusId: string }) {
  const { data: graph, isLoading } = useLineage();
  const navigate = useNavigate();

  if (isLoading) {
    return <div style={{ color: 'var(--fg-3)', fontSize: 12, padding: 12 }}>{t.common.loading}</div>;
  }
  if (!graph || graph.nodes.length === 0) return null;

  const { nodes, edges } = graph;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const MAX = 5;

  const predIds = [...new Set(edges.filter(e => e.target === focusId).map(e => e.source))].slice(0, MAX);
  const succIds = [...new Set(edges.filter(e => e.source === focusId).map(e => e.target))].slice(0, MAX);
  const focusNode = nodeMap.get(focusId);

  const hasPreds = predIds.length > 0;
  const hasSuccs = succIds.length > 0;

  const SVG_H = Math.max(_colH(predIds.length), _BOX_H, _colH(succIds.length)) + 20;
  const FOCUS_X = hasPreds ? _BOX_W + _H_GAP : 0;
  const SUCC_X = FOCUS_X + _BOX_W + _H_GAP;
  const SVG_W = hasSuccs ? SUCC_X + _BOX_W : FOCUS_X + _BOX_W;
  const FOCUS_Y = (SVG_H - _BOX_H) / 2;

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  };

  return (
    <div>
      <svg
        width={SVG_W} height={SVG_H}
        style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
        aria-label={`Lineage: ${focusId}`}
      >
        <defs>
          <marker id="dag-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="var(--fg-3)" opacity={0.5} />
          </marker>
        </defs>

        {/* Predecessor → focus edges */}
        {predIds.map((pid, i) => (
          <path key={pid}
            d={curve(_BOX_W, _boxY(SVG_H, i, predIds.length) + _BOX_H / 2,
                     FOCUS_X, FOCUS_Y + _BOX_H / 2)}
            stroke="var(--line-2)" strokeWidth={1.5} fill="none" markerEnd="url(#dag-arr)"
          />
        ))}

        {/* Focus → successor edges */}
        {succIds.map((sid, i) => (
          <path key={sid}
            d={curve(FOCUS_X + _BOX_W, FOCUS_Y + _BOX_H / 2,
                     SUCC_X, _boxY(SVG_H, i, succIds.length) + _BOX_H / 2)}
            stroke="var(--line-2)" strokeWidth={1.5} fill="none" markerEnd="url(#dag-arr)"
          />
        ))}

        {/* Predecessor boxes */}
        {predIds.map((pid, i) => {
          const y = _boxY(SVG_H, i, predIds.length);
          const nd = nodeMap.get(pid);
          return (
            <g key={pid} transform={`translate(0,${y})`}
               style={{ cursor: 'pointer' }} onClick={() => navigate(`/objects/${pid}`)}>
              <rect width={_BOX_W} height={_BOX_H} rx={4}
                    fill="var(--bg-2)" stroke="var(--line)" strokeWidth={1} />
              <text x={_BOX_W / 2} y={_BOX_H / 2 + 4} textAnchor="middle"
                    fontSize={10} fontFamily="var(--font-mono)" fill="var(--fg-2)">
                {_truncate(nd?.label ?? pid)}
              </text>
            </g>
          );
        })}

        {/* Focus box */}
        <g transform={`translate(${FOCUS_X},${FOCUS_Y})`}>
          <rect width={_BOX_W} height={_BOX_H} rx={4} fill="var(--cont)" />
          <text x={_BOX_W / 2} y={_BOX_H / 2 + 4} textAnchor="middle"
                fontSize={10} fontFamily="var(--font-mono)" fill="#fff" fontWeight="bold">
            {_truncate(focusNode?.label ?? focusId)}
          </text>
        </g>

        {/* Successor boxes */}
        {succIds.map((sid, i) => {
          const y = _boxY(SVG_H, i, succIds.length);
          const nd = nodeMap.get(sid);
          return (
            <g key={sid} transform={`translate(${SUCC_X},${y})`}
               style={{ cursor: 'pointer' }} onClick={() => navigate(`/objects/${sid}`)}>
              <rect width={_BOX_W} height={_BOX_H} rx={4}
                    fill="var(--bg-2)" stroke="var(--line)" strokeWidth={1} />
              <text x={_BOX_W / 2} y={_BOX_H / 2 + 4} textAnchor="middle"
                    fontSize={10} fontFamily="var(--font-mono)" fill="var(--fg-2)">
                {_truncate(nd?.label ?? sid)}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <Link to={`/lineage?focus=${encodeURIComponent(focusId)}`}
              style={{ color: 'var(--cont)', fontSize: 11 }}>
          {t.objectDetail.lineageLink} →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline over the numeric actual_value history of one check (newest-first
// API order is reversed into chronological order). Non-numeric series → dash.
// ---------------------------------------------------------------------------
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

function SegmentControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div style={{
      display: 'inline-flex', gap: 0,
      background: 'var(--bg-2)', borderRadius: 6,
      border: '1px solid var(--line)', padding: 2,
    }}>
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: '4px 12px', fontSize: 11, borderRadius: 4,
            border: 'none', cursor: 'pointer',
            background: value === o.key ? 'var(--cont)' : 'transparent',
            color: value === o.key ? '#fff' : 'var(--fg-3)',
            fontWeight: value === o.key ? 600 : 400,
            transition: 'all var(--t)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ObjectDetail() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'checks') as Tab;
  const setTab = (next: Tab) => setSp({ tab: next });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const role = useRoleStore(s => s.role);

  // All hooks run unconditionally — no early return may come before them.
  const { data: obj, isLoading, isError, refetch } = useObject(id);
  const { data: runs = [] } = useObjectRuns(id);
  const { data: contract } = useContract(id);
  const trigger = useTriggerRun(id);

  const latestRun: RunListItem | undefined = runs[0];
  const { data: latestRunDetail } = useRun(latestRun?.run_id ?? '');
  const results: CheckResult[] = latestRunDetail?.results ?? [];

  const isRunning = latestRun?.run_state === 'running' || latestRunDetail?.run_state === 'running';
  const canProfile = canProfileObject(role);

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
  if (isError) return <div className="page-full"><ErrorBanner onRetry={() => refetch()} /></div>;
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
  const kindOptions = [
    { key: 'all' as const, label: t.cockpit.segmentControl.all },
    { key: 'internal' as const, label: t.cockpit.segmentControl.internal },
    { key: 'contract' as const, label: t.cockpit.segmentControl.contract },
  ];
  const filteredResults = results.filter(r => {
    if (kindFilter === 'all') return true;
    if (kindFilter === 'internal') return r.kind === 'internal_gate';
    return r.kind === 'consumer_contract' || r.kind === 'provider_contract';
  });

  const checkColumns: ColDef<CheckResult>[] = [
    { key: 'name', header: t.objectDetail.colCheck, mono: true, render: c => c.name },
    { key: 'status', header: t.objectDetail.colStatus, render: c => <CheckStatusCell state={c.state} passed={c.passed} severity={c.severity} /> },
    { key: 'expect', header: t.objectDetail.colExpect, mono: true, render: c => c.expect },
    { key: 'actual', header: t.objectDetail.colActual, mono: true, render: c => c.actual_value ?? '—' },
    {
      key: 'trend', header: t.objectDetail.colTrend, width: 80,
      render: c => <HistorySpark objectId={id} checkName={c.name} enabled={sparkBudget.has(c.name)} />,
    },
    {
      key: 'kind',
      header: 'Typ',
      render: c => {
        const isInternal = c.kind === 'internal_gate';
        const color = isInternal ? 'var(--qual)' : 'var(--cont)';
        return (
          <span style={{
            fontSize: 10, borderRadius: 3, padding: '1px 6px',
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
            border: `1px solid ${color}`,
          }}>
            {isInternal ? t.cockpit.kind.internal_gate : t.cockpit.kind.consumer_contract}
          </span>
        );
      },
    },
    { key: 'ms', header: t.objectDetail.colMs, mono: true, render: c => String(c.duration_ms) },
  ];

  return (
    <div className="page-full">
      <Breadcrumbs items={[
        { label: t.breadcrumb.home, to: '/' },
        { label: t.breadcrumb.objects, to: '/objects' },
        { label: obj.name },
      ]} />
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
          onClick={() => setProfileOpen(true)}
          disabled={!canProfile}
          title={canProfile ? undefined : 'Profiling requires steward role or higher.'}
          style={{
            background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)',
            borderRadius: 5, padding: '7px 16px', fontSize: 13,
            cursor: canProfile ? 'pointer' : 'not-allowed',
            opacity: canProfile ? 1 : 0.45,
          }}
        >
          Profiling
        </button>
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

      {profileOpen && (
        <ObjectProfilePanel objectId={obj.id} onClose={() => setProfileOpen(false)} />
      )}

      <div style={{ borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {(['checks', 'runs', 'timeseries', 'contract', 'lineage'] as Tab[]).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} style={TAB_STYLE(tabKey)}>
            {t.objectDetail.tabs[tabKey] ?? tabKey}
          </button>
        ))}
      </div>

      {tab === 'checks' && (
        <>
          {results.length === 0 && <MinedProposalsCallout productId={obj.id} />}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <SegmentControl value={kindFilter} onChange={setKindFilter} options={kindOptions} />
          </div>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <Table columns={checkColumns} rows={filteredResults} rowKey={c => c.name} empty={t.objectDetail.noResults} />
          </div>
        </>
      )}

      {tab === 'runs' && (
        <>
          {runs.length >= 2 && (
            <div style={{ marginBottom: 12, textAlign: 'right' }}>
              <Link
                to={`/runs/compare?base=${encodeURIComponent(runs[1].run_id)}&head=${encodeURIComponent(runs[0].run_id)}`}
                style={{ color: 'var(--cont)', fontSize: 12 }}
              >
                {t.compare.compareLatest} →
              </Link>
            </div>
          )}
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <Table columns={runColumns} rows={runs} rowKey={r => r.run_id} empty={t.objectDetail.noRuns} />
          </div>
        </>
      )}

      {tab === 'timeseries' && (
        <ObservabilityTimeseries objectId={obj.id} enabled={tab === 'timeseries'} />
      )}

      {tab === 'contract' && (
        <>
          {!contract && <MinedProposalsCallout productId={obj.id} />}
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 20 }}>
            {contract ? (
              <ContractView contract={contract as ContractOut} />
            ) : (
              <p style={{ color: 'var(--fg-3)' }}>
                {t.objectDetail.noContractPrefix}{' '}
                <Link to="/contracts" style={{ color: 'var(--cont)' }}>{t.objectDetail.noContractLink}</Link>{' '}
                {t.objectDetail.noContractSuffix}
              </p>
            )}
          </div>
          {contract && <ContractVersionDiffView product={obj.id} enabled={tab === 'contract'} />}
          <BadgeEmbed product={obj.id} />
        </>
      )}

      {tab === 'lineage' && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 24 }}>
          <MiniLineageDag focusId={obj.id} />
          <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 16 }}>
            {t.objectDetail.lineageHint}{' '}
            <Link to={`/lineage?focus=${encodeURIComponent(obj.id)}`} style={{ color: 'var(--cont)' }}>
              {t.objectDetail.lineageLink}
            </Link>.
          </p>
        </div>
      )}

      {latestRun && (
        <LiveRunPanel runId={latestRun.run_id} dataset={latestRun.dataset} running={isRunning} />
      )}
    </div>
  );
}

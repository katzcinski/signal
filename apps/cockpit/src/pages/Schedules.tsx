import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchedules, useRunObjectNow, useUpdateScheduleRow } from '@/api/schedules';
import { useObjects } from '@/api/objects';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusDot } from '@/components/ui/StatusDot';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { relativeTime, absoluteTime } from '@/lib/time';
import { cadenceLabel, nextRunInfo } from '@/lib/schedule';
import { t } from '@/i18n/de';
import type { Schedule, ObjectSummary } from '@/types';

type Filter = 'all' | 'internal' | 'external' | 'overdue';

const NEXT_COLOR: Record<string, string> = {
  ok: 'var(--fg)', overdue: 'var(--status-fail)',
  external: 'var(--fg-3)', paused: 'var(--status-stale)',
};

function lastStatusDot(s: Schedule) {
  const v = s.last_status ?? '';
  if (v === 'started') return 'pass';
  if (v.startsWith('error')) return 'fail';
  return 'unknown';
}

function ModeBadge({ mode }: { mode: Schedule['mode'] }) {
  const internal = mode === 'internal';
  const c = internal ? 'var(--qual)' : 'var(--obs)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px',
      borderRadius: 999, fontSize: 11, fontWeight: 650, color: c, whiteSpace: 'nowrap',
      background: internal ? 'color-mix(in srgb, var(--qual) 15%, transparent)' : 'transparent',
      border: internal ? '1px solid transparent' : `1px solid color-mix(in srgb, var(--obs) 55%, var(--line))`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {internal ? t.schedules.modeInternal : t.schedules.modeExternal}
    </span>
  );
}

function EnvBadge({ env }: { env: string }) {
  if (!env) return <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.schedules.localMock}</span>;
  const prod = /prod/i.test(env);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px',
      borderRadius: 6, background: 'var(--bg-3)', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-2)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: prod ? 'var(--qual)' : 'var(--obs)' }} />
      {env}
    </span>
  );
}

function Tile({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10,
      padding: '14px 18px', borderBottom: `2px solid ${accent}`, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function SplitBar({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-3)' }}>
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

export default function Schedules() {
  const { data: schedules = [], isLoading, isError, refetch } = useSchedules();
  const { data: objects = [] } = useObjects();
  const runNow = useRunObjectNow();
  const updateRow = useUpdateScheduleRow();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const objMap = useMemo(() => {
    const m = new Map<string, ObjectSummary>();
    for (const o of objects) m.set(o.id, o);
    return m;
  }, [objects]);

  const now = Date.now();
  const stats = useMemo(() => {
    let internal = 0, external = 0, overdue = 0, ok = 0, failed = 0, none = 0;
    for (const s of schedules) {
      if (s.mode === 'internal') internal++; else external++;
      if (nextRunInfo(s, now).kind === 'overdue') overdue++;
      const v = s.last_status ?? '';
      if (v === 'started') ok++; else if (v.startsWith('error')) failed++; else none++;
    }
    return { internal, external, overdue, ok, failed, none };
  }, [schedules, now]);

  const overdueOldest = useMemo(() => {
    let worst: { id: string; ago: string } | null = null;
    let worstMs = 0;
    for (const s of schedules) {
      if (nextRunInfo(s, now).kind !== 'overdue') continue;
      const ms = now - new Date(s.next_due_at).getTime();
      if (ms > worstMs) { worstMs = ms; worst = { id: s.object_id, ago: relativeTime(s.next_due_at) }; }
    }
    return worst;
  }, [schedules, now]);

  const filtered = useMemo(() => schedules.filter(s => {
    if (search && !s.object_id.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'internal') return s.mode === 'internal';
    if (filter === 'external') return s.mode === 'external';
    if (filter === 'overdue') return nextRunInfo(s, now).kind === 'overdue';
    return true;
  }), [schedules, filter, search, now]);

  const togglePause = (s: Schedule) => updateRow.mutate({
    id: s.object_id,
    body: {
      mode: s.mode, interval_seconds: s.interval_seconds,
      environment: s.environment || undefined, execution_mode: s.execution_mode,
      enabled: !s.enabled,
    },
  });

  const columns: ColDef<Schedule>[] = [
    {
      key: 'dot', header: '', width: 28,
      render: s => <StatusDot status={lastStatusDot(s)} size={9} />,
    },
    {
      key: 'object', header: t.schedules.colObject, sortable: true, sortValue: s => s.object_id,
      render: s => {
        const o = objMap.get(s.object_id);
        return (
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 650, color: 'var(--fg)' }}>{s.object_id}</div>
            {o && <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{o.space} · {o.layer}</div>}
          </div>
        );
      },
    },
    { key: 'mode', header: t.schedules.colMode, width: 110, sortable: true, sortValue: s => s.mode, render: s => <ModeBadge mode={s.mode} /> },
    { key: 'env', header: t.schedules.colEnv, width: 150, render: s => <EnvBadge env={s.environment} /> },
    {
      key: 'cadence', header: t.schedules.colCadence, width: 130,
      render: s => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: s.mode === 'external' ? 'var(--fg-3)' : 'var(--fg)' }}>{s.mode === 'external' ? '—' : cadenceLabel(s.interval_seconds)}</span>,
    },
    {
      key: 'last', header: t.schedules.colLast, width: 130,
      render: s => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)' }} title={s.last_run_at ? absoluteTime(s.last_run_at) : undefined}>{s.last_run_at ? relativeTime(s.last_run_at) : '—'}</span>,
    },
    {
      key: 'next', header: t.schedules.colNext, width: 140, sortable: true,
      sortValue: s => new Date(s.next_due_at).getTime() || 0,
      render: s => {
        const n = nextRunInfo(s, now);
        return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: n.kind === 'overdue' ? 700 : 400, color: NEXT_COLOR[n.kind] }}>{n.label}</span>;
      },
    },
    {
      key: 'actions', header: t.schedules.colActions, width: 130,
      render: s => (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <IconBtn title={t.schedules.runNow} onClick={() => runNow.mutate(s.object_id)} disabled={runNow.isPending}>
            <svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" fill="var(--qual)" /></svg>
          </IconBtn>
          {s.mode === 'internal' && (
            <IconBtn title={s.enabled ? t.schedules.pause : t.schedules.resume} onClick={() => togglePause(s)} disabled={updateRow.isPending}>
              {s.enabled ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--fg-2)"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z" fill="var(--fg-2)" /></svg>
              )}
            </IconBtn>
          )}
          <IconBtn title={t.objects.title} onClick={() => navigate(`/objects/${encodeURIComponent(s.object_id)}?tab=schedule`)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </IconBtn>
        </div>
      ),
    },
  ];

  const chips: [Filter, string, number, string][] = [
    ['all', t.schedules.filterAll, schedules.length, 'var(--cont)'],
    ['internal', t.schedules.filterInternal, stats.internal, 'var(--qual)'],
    ['external', t.schedules.filterExternal, stats.external, 'var(--obs)'],
    ['overdue', t.schedules.filterOverdue, stats.overdue, 'var(--status-fail)'],
  ];

  return (
    <div className="page-full">
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t.schedules.title}</h1>
          <p style={{ color: 'var(--fg-2)', fontSize: 13, marginTop: 4 }}>
            {t.schedules.subtitle}
            {stats.overdue > 0 && <span style={{ color: 'var(--status-fail)', fontWeight: 600 }}>{`  ·  ${stats.overdue} ${t.schedules.filterOverdue.toLowerCase()}`}</span>}
          </p>
        </div>
        <button
          onClick={() => navigate('/objects')}
          style={{ background: 'var(--cont)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + {t.schedules.panelTitle}
        </button>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 22 }}>
        <Tile label={t.schedules.kpiScheduled} accent="var(--cont)">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{schedules.length}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.schedules.kpiScheduledSub.replace('{total}', String(objects.length || '—'))}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <SplitBar segments={[{ value: schedules.length, color: 'var(--cont)' }, { value: Math.max(0, objects.length - schedules.length), color: 'var(--bg-3)' }]} />
          </div>
        </Tile>

        <Tile label={t.schedules.kpiSplit} accent="var(--qual)">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span><span style={{ fontSize: 30, fontWeight: 700, color: 'var(--fg)' }}>{stats.internal}</span> <span style={{ fontSize: 12, color: 'var(--qual)' }}>{t.schedules.modeInternal}</span></span>
            <span><span style={{ fontSize: 30, fontWeight: 700, color: 'var(--fg)' }}>{stats.external}</span> <span style={{ fontSize: 12, color: 'var(--obs)' }}>{t.schedules.modeExternal}</span></span>
          </div>
          <div style={{ marginTop: 12 }}>
            <SplitBar segments={[{ value: stats.internal, color: 'var(--qual)' }, { value: stats.external, color: 'var(--obs)' }]} />
          </div>
        </Tile>

        <Tile label={t.schedules.kpiOverdue} accent="var(--status-fail)">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: stats.overdue ? 'var(--status-fail)' : 'var(--fg)', lineHeight: 1 }}>{stats.overdue}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{t.schedules.kpiOverdueSub}</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {overdueOldest ? `${t.schedules.kpiOverdueOldest}: ${overdueOldest.id}` : '—'}
          </div>
        </Tile>

        <Tile label={t.schedules.kpiSuccess} accent="var(--status-ok)">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>
              {stats.ok + stats.failed > 0 ? `${Math.round((stats.ok / (stats.ok + stats.failed)) * 100)}%` : '—'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{stats.ok}✓ {stats.failed}✕</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <SplitBar segments={[{ value: stats.ok, color: 'var(--status-ok)' }, { value: stats.failed, color: 'var(--status-fail)' }, { value: stats.none, color: 'var(--bg-3)' }]} />
          </div>
        </Tile>
      </div>

      {/* toolbar: filter chips + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {chips.map(([key, label, n, color]) => {
            const active = filter === key;
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
                background: active ? 'color-mix(in srgb, var(--cont) 16%, transparent)' : 'var(--bg-2)',
                border: `1px solid ${active ? 'var(--cont)' : 'var(--line)'}`,
                color: active ? 'var(--fg)' : 'var(--fg-2)', fontWeight: active ? 650 : 400,
              }}>
                {label}
                <span style={{
                  minWidth: 20, height: 16, padding: '0 5px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10.5, fontWeight: 700,
                  background: active ? color : 'var(--bg-3)', color: active ? '#0B0D12' : color,
                }}>{n}</span>
              </button>
            );
          })}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder={t.schedules.search}
          aria-label={t.schedules.search}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, width: 248 }}
        />
      </div>

      {/* table */}
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {isLoading && <TableSkeleton columns={8} />}
      {!isError && !isLoading && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <Table
            columns={columns}
            rows={filtered}
            rowKey={s => s.schedule_id}
            onRowClick={s => navigate(`/objects/${encodeURIComponent(s.object_id)}?tab=schedule`)}
            empty={t.schedules.empty}
          />
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      title={title} aria-label={title} onClick={onClick} disabled={disabled}
      style={{
        width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

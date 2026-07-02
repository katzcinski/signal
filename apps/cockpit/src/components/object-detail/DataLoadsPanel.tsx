import { AxiosError } from 'axios';
import { useObjectDataLoads } from '@/api/datasphere';
import { StatusDot } from '@/components/ui/StatusDot';
import { Table, type ColDef } from '@/components/ui/Table';
import { relativeTime, absoluteTime } from '@/lib/time';
import { t } from '@/i18n/de';
import type { DataLoad } from '@/types';

// W-5/R7: macht die Ladelauf-Historie je Objekt erreichbar (bisher Feature-Torso —
// Backend `/api/datasphere/data-loads/{id}` + Hook existierten ohne UI-Abnehmer).

function statusKind(status: string | null): string {
  const s = (status || '').toUpperCase();
  if (/(COMPLETED|SUCCESS|FINISHED|DONE|OK)/.test(s)) return 'pass';
  if (/(FAIL|ERROR|ABORT|CANCEL)/.test(s)) return 'fail';
  if (/(RUNNING|ACTIVE|PENDING|PROGRESS)/.test(s)) return 'warn';
  return 'unknown';
}

function durationLabel(ms: number | null): string {
  if (ms === null || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function typeLabel(loadType: string): string {
  if (loadType === 'task_chain') return t.dataLoads.typeTaskChain;
  if (loadType === 'replication_flow') return t.dataLoads.typeReplicationFlow;
  return loadType;
}

const muted: React.CSSProperties = { color: 'var(--fg-3)', fontSize: 13, padding: 'var(--s4)' };

export function DataLoadsPanel({ objectId, enabled }: { objectId: string; enabled: boolean }) {
  const { data, isLoading, isError, error } = useObjectDataLoads(objectId, undefined, 20);

  if (!enabled) return null;
  if (isLoading) return <div style={muted}>{t.dataLoads.loading}</div>;

  if (isError) {
    // 503 = Connector nicht konfiguriert → sachlicher Hinweis statt Fehlerbanner.
    const status = (error as AxiosError | null)?.response?.status;
    return <div style={muted}>{status === 503 ? t.dataLoads.notConfigured : t.dataLoads.error}</div>;
  }

  const rows = data ?? [];

  const columns: ColDef<DataLoad>[] = [
    { key: 'type', header: t.dataLoads.colType, render: r => typeLabel(r.load_type) },
    {
      key: 'status', header: t.dataLoads.colStatus,
      render: r => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={statusKind(r.status)} size={9} />
          <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{r.status ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'started_at', header: t.dataLoads.colStarted, mono: true,
      render: r => (
        <span title={r.started_at ? absoluteTime(r.started_at) : undefined}>
          {r.started_at ? relativeTime(r.started_at) : '—'}
        </span>
      ),
    },
    { key: 'duration', header: t.dataLoads.colDuration, mono: true, render: r => durationLabel(r.duration_ms) },
    {
      key: 'triggered_by', header: t.dataLoads.colTrigger,
      render: r => <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{r.triggered_by ?? '—'}</span>,
    },
  ];

  return (
    <div>
      <p style={{ color: 'var(--fg-3)', fontSize: 12.5, margin: '0 0 12px' }}>{t.dataLoads.intro}</p>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <Table
          columns={columns}
          rows={rows}
          rowKey={r => `${r.load_type}:${r.run_id ?? r.started_at ?? Math.random()}`}
          empty={t.dataLoads.empty}
        />
      </div>
    </div>
  );
}

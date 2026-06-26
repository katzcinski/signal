import { Link } from 'react-router-dom';
import { useObject, useObjectRuns, useTriggerRun, useCheckHistory } from '@/api/objects';
import { useRun } from '@/api/runs';
import { SidePanel } from '@/components/ui/SidePanel';
import { StatusPill } from '@/components/ui/StatusPill';
import { CheckStatusCell } from '@/components/ui/StatePill';
import { SparkCell } from '@/components/ui/SparkCell';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { t } from '@/i18n/de';
import type { CheckResult } from '@/types';

function CheckRow({ objectId, check }: { objectId: string; check: CheckResult }) {
  const { data: history = [] } = useCheckHistory(objectId, check.name);
  // API order is newest-first; reverse into chronological order for the spark.
  const series = [...history]
    .reverse()
    .map(h => Number(h.actual_value))
    .filter(n => Number.isFinite(n));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--s2) 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{check.name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{check.expect}</div>
      </div>
      <SparkCell series={series} />
      <CheckStatusCell state={check.state} passed={check.passed} severity={check.severity} />
    </div>
  );
}

export function ObjectPeek({ objectId, onClose }: { objectId: string; onClose: () => void }) {
  const { data: obj } = useObject(objectId);
  const { data: runs = [] } = useObjectRuns(objectId);
  const latest = runs[0];
  const { data: runDetail } = useRun(latest?.run_id ?? '');
  const trigger = useTriggerRun(objectId);
  const results = runDetail?.results ?? [];
  const isRunning = latest?.run_state === 'running' || runDetail?.run_state === 'running';

  return (
    <SidePanel
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{obj?.name ?? objectId}</span>
          {obj && <FamilyTag family={obj.family} />}
          {obj && <StatusPill status={obj.status ?? 'unknown'} size="sm" />}
        </span>
      }
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => trigger.mutate({})}
            disabled={trigger.isPending || isRunning}
            style={{ background: 'var(--cont)', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
          >
            {trigger.isPending || isRunning ? t.peek.running : t.peek.runChecks}
          </button>
          <Link to={`/objects/${objectId}`} onClick={onClose} style={{ color: 'var(--cont)', fontSize: 13 }}>{t.peek.openFull}</Link>
        </div>
      }
    >
      {obj && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 14 }}>
          {obj.space} · {obj.layer} · {t.peek.contract} {obj.contract_status || '—'}
        </div>
      )}
      {results.length === 0 ? (
        <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>{t.peek.noChecks}</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {t.peek.checksLatestRun}
          </div>
          {results.map(c => <CheckRow key={c.name} objectId={objectId} check={c} />)}
        </>
      )}
    </SidePanel>
  );
}

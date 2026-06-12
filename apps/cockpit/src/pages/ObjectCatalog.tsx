import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { CovFlag } from '@/components/ui/CovFlag';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ObjectPeek } from '@/components/ObjectPeek';
import { t } from '@/i18n/de';
import type { ObjectSummary } from '@/types';

export default function ObjectCatalog() {
  const { data: objects = [], isLoading, isError, refetch } = useObjects();
  const [spaceFilter, setSpaceFilter] = useSearchParamState('space');
  const [peekId, setPeekId] = useState<string | null>(null);
  const navigate = useNavigate();

  const spaces = [...new Set(objects.map(o => o.space))].sort();
  const rows = spaceFilter ? objects.filter(o => o.space === spaceFilter) : objects;

  const columns: ColDef<ObjectSummary>[] = [
    {
      key: 'name', header: t.objects.colName, mono: true, sortable: true, sortValue: o => o.name,
      render: o => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 3, height: 16, borderRadius: 2, flexShrink: 0,
            background: o.family === 'observability' ? 'var(--obs)'
              : o.family === 'quality' ? 'var(--qual)' : 'var(--cont)',
          }} />
          {/* R6-1: the name navigates to the full page; the rest of the row peeks. */}
          <button
            onClick={e => { e.stopPropagation(); navigate(`/objects/${o.id}`); }}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--fg)', cursor: 'pointer', font: 'inherit' }}
          >
            {o.name}
          </button>
        </div>
      ),
    },
    { key: 'family', header: t.objects.colFamily, sortable: true, sortValue: o => o.family, render: o => <FamilyTag family={o.family} /> },
    { key: 'layer', header: t.objects.colLayer, sortable: true, sortValue: o => o.layer, render: o => <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{o.layer}</span> },
    { key: 'space', header: t.objects.colSpace, mono: true, sortable: true, sortValue: o => o.space, render: o => o.space },
    {
      key: 'status', header: t.objects.colStatus,
      render: o => <StatusPill status={o.status ?? 'unknown'} size="sm" />,
    },
    {
      key: 'coverage', header: t.objects.colCov,
      render: o => <CovFlag flag={o.cov_flag ?? 'gap'} />,
    },
    {
      key: 'checks', header: t.objects.colChecks, sortable: true, sortValue: o => o.check_count ?? 0,
      render: o => <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{o.check_count ?? '—'}</span>,
    },
    { key: 'owned_by', header: t.objects.colOwner, sortable: true, sortValue: o => o.owned_by, render: o => <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{o.owned_by}</span> },
    {
      key: 'last_run', header: t.objects.colLastRun, mono: true, sortable: true, sortValue: o => o.last_run ?? '',
      render: o => <span style={{ fontSize: 11 }}>{o.last_run ? new Date(o.last_run).toLocaleString() : '—'}</span>,
    },
  ];

  if (isLoading) return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t.objects.title}</h1>
      <TableSkeleton columns={9} />
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.objects.title}</h1>
        <select
          value={spaceFilter}
          onChange={e => setSpaceFilter(e.target.value)}
          aria-label={t.objects.colSpace}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
          }}
        >
          <option value="">{t.objects.allSpaces}</option>
          {spaces.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {!isError && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <Table
            columns={columns}
            rows={rows}
            rowKey={o => o.id}
            onRowClick={o => setPeekId(o.id)}
            empty={t.objects.empty}
          />
        </div>
      )}
      {peekId && <ObjectPeek objectId={peekId} onClose={() => setPeekId(null)} />}
    </div>
  );
}

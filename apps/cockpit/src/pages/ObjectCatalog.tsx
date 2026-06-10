import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { FamilyTag } from '@/components/ui/FamilyTag';
import { CovFlag } from '@/components/ui/CovFlag';
import type { ObjectSummary } from '@/types';

export default function ObjectCatalog() {
  const { data: objects = [], isLoading } = useObjects();
  const [spaceFilter, setSpaceFilter] = useState('');
  const navigate = useNavigate();

  const spaces = [...new Set(objects.map(o => o.space))].sort();
  const rows = spaceFilter ? objects.filter(o => o.space === spaceFilter) : objects;

  const columns: ColDef<ObjectSummary>[] = [
    {
      key: 'name', header: 'Name', mono: true,
      render: o => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 3, height: 16, borderRadius: 2, flexShrink: 0,
            background: o.family === 'observability' ? 'var(--obs)'
              : o.family === 'quality' ? 'var(--qual)' : 'var(--cont)',
          }} />
          {o.name}
        </div>
      ),
    },
    { key: 'family', header: 'Family', render: o => <FamilyTag family={o.family} /> },
    { key: 'layer', header: 'Layer', render: o => <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{o.layer}</span> },
    { key: 'space', header: 'Space', mono: true, render: o => o.space },
    {
      key: 'status', header: 'Status',
      render: o => <StatusPill status={o.status ?? 'unknown'} size="sm" />,
    },
    {
      key: 'coverage', header: 'Cov',
      render: o => <CovFlag flag={o.cov_flag ?? 'gap'} />,
    },
    {
      key: 'checks', header: 'Checks',
      render: o => <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{o.check_count ?? '—'}</span>,
    },
    { key: 'owned_by', header: 'Owner', render: o => <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{o.owned_by}</span> },
    {
      key: 'last_run', header: 'Last Run', mono: true,
      render: o => <span style={{ fontSize: 11 }}>{o.last_run ? new Date(o.last_run).toLocaleString() : '—'}</span>,
    },
  ];

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Objects</h1>
        <select
          value={spaceFilter}
          onChange={e => setSpaceFilter(e.target.value)}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
          }}
        >
          <option value="">All spaces</option>
          {spaces.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <Table
          columns={columns}
          rows={rows}
          rowKey={o => o.id}
          onRowClick={o => navigate(`/objects/${o.id}`)}
          empty="No objects found"
        />
      </div>
    </div>
  );
}

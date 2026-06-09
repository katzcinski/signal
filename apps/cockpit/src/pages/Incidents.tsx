import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidents } from '@/api/incidents';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusDot } from '@/components/ui/StatusDot';
import type { Incident } from '@/types';

export default function Incidents() {
  const { data: incidents = [], isLoading } = useIncidents();
  const [severityFilter, setSeverityFilter] = useState('');
  const navigate = useNavigate();

  const rows = severityFilter ? incidents.filter(i => i.severity === severityFilter) : incidents;

  const columns: ColDef<Incident>[] = [
    { key: 'sev', header: '', render: i => <StatusDot status={i.severity} size={10} />, width: 32 },
    { key: 'check', header: 'Check', mono: true, render: i => i.check_name },
    { key: 'dataset', header: 'Dataset', mono: true, render: i => i.dataset },
    { key: 'actual', header: 'Actual', mono: true, render: i => i.actual_value ?? '—' },
    { key: 'expected', header: 'Expected', mono: true, render: i => i.expected },
    { key: 'when', header: 'When', mono: true, render: i => new Date(i.started_at).toLocaleString() },
    {
      key: 'actions', header: '',
      render: i => (
        <button
          onClick={e => { e.stopPropagation(); navigate(`/runs/${i.run_id}`); }}
          style={{ background: 'none', border: '1px solid var(--line-2)', color: 'var(--fg-3)', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
        >
          Run
        </button>
      ),
    },
  ];

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Incidents</h1>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
          }}
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="fail">Fail</option>
          <option value="warn">Warn</option>
        </select>
      </div>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <Table
          columns={columns}
          rows={rows}
          rowKey={i => i.id}
          onRowClick={i => navigate(`/objects/${i.dataset}`)}
          empty="No incidents — all checks passing"
        />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';
import { Table, type ColDef } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { CovFlag } from '@/components/ui/CovFlag';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { t } from '@/i18n/strings';
import type { Family, ObjectSummary } from '@/types';

// R3-2: the grid is Object × Family. Family is an attribute of checks, so each
// cell shows the rolled-up status of that family for the object — never a single
// object-level family/colour.
const GRID_FAMILIES: Family[] = ['observability', 'quality'];

const SEVERITY_RANK: Record<string, number> = {
  pass: 0, unknown: 0, error: 1, warn: 2, fail: 3, critical: 4,
};

function FamilyCell({ obj, family, onClick }: {
  obj: ObjectSummary;
  family: Family;
  onClick: () => void;
}) {
  const fs = obj.families?.[family];
  if (!fs || fs.total === 0) {
    // No checks of this family — neutral, not a pass.
    return <span style={{ color: 'var(--fg-3)', fontSize: 12 }} title={`No ${t.family[family].toLowerCase()} checks`}>—</span>;
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={`${fs.passed}/${fs.total} ${t.family[family].toLowerCase()} checks passing`}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <StatusPill status={fs.status} size="sm" />
    </button>
  );
}

export default function ObjectCatalog() {
  const { data: objects = [], isLoading, isError, refetch } = useObjects();
  const [space, setSpace] = useState('');
  const [layer, setLayer] = useState('');
  const [family, setFamily] = useState('');
  const [severity, setSeverity] = useState('');
  const navigate = useNavigate();

  const spaces = [...new Set(objects.map(o => o.space))].filter(Boolean).sort();
  const layers = [...new Set(objects.map(o => o.layer))].filter(Boolean).sort();

  const rows = objects.filter(o => {
    if (space && o.space !== space) return false;
    if (layer && o.layer !== layer) return false;
    if (family && !(o.families?.[family as Family]?.total)) return false;
    if (severity) {
      const min = SEVERITY_RANK[severity] ?? 0;
      const worst = GRID_FAMILIES.reduce((acc, f) => {
        const s = o.families?.[f]?.status;
        return Math.max(acc, s ? (SEVERITY_RANK[s] ?? 0) : 0);
      }, 0);
      if (worst < min) return false;
    }
    return true;
  });

  const columns: ColDef<ObjectSummary>[] = [
    {
      key: 'name', header: 'Object', mono: true,
      render: o => (
        <button
          onClick={e => { e.stopPropagation(); navigate(`/objects/${o.id}`); }}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--fg)', cursor: 'pointer', font: 'inherit' }}
        >
          {o.name}
        </button>
      ),
    },
    {
      key: 'observability', header: t.family.observability,
      render: o => <FamilyCell obj={o} family="observability" onClick={() => navigate(`/objects/${o.id}`)} />,
    },
    {
      key: 'quality', header: t.family.quality,
      render: o => <FamilyCell obj={o} family="quality" onClick={() => navigate(`/objects/${o.id}`)} />,
    },
    { key: 'layer', header: 'Layer', render: o => <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>{o.layer}</span> },
    { key: 'space', header: 'Space', mono: true, render: o => o.space },
    { key: 'coverage', header: 'Cov', render: o => <CovFlag flag={o.cov_flag ?? 'gap'} /> },
    {
      key: 'last_run', header: 'Last Run', mono: true,
      render: o => <span style={{ fontSize: 11 }}>{o.last_run ? new Date(o.last_run).toLocaleString() : '—'}</span>,
    },
  ];

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-2)', border: '1px solid var(--line-2)',
    color: 'var(--fg)', borderRadius: 5, padding: '5px 10px', fontSize: 12,
  };

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.nav.objects}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={space} onChange={e => setSpace(e.target.value)} style={selectStyle}>
            <option value="">{t.common.all} spaces</option>
            {spaces.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={layer} onChange={e => setLayer(e.target.value)} style={selectStyle}>
            <option value="">{t.common.all} layers</option>
            {layers.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={family} onChange={e => setFamily(e.target.value)} style={selectStyle}>
            <option value="">{t.common.all} families</option>
            <option value="observability">{t.family.observability}</option>
            <option value="quality">{t.family.quality}</option>
          </select>
          <select value={severity} onChange={e => setSeverity(e.target.value)} style={selectStyle}>
            <option value="">{t.common.all} severities</option>
            <option value="warn">{t.status.warn}+</option>
            <option value="fail">{t.status.fail}+</option>
            <option value="critical">{t.status.critical}</option>
          </select>
        </div>
      </div>
      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {!isError && (
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <Table
            columns={columns}
            rows={rows}
            rowKey={o => o.id}
            onRowClick={o => navigate(`/objects/${o.id}`)}
            empty="No objects match these filters"
          />
        </div>
      )}
    </div>
  );
}

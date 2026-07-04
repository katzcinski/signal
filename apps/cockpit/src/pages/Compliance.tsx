import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObjects } from '@/api/objects';
import { useContracts } from '@/api/contracts';
import { useCoverageSummary } from '@/api/coverage';
import { LifecycleStepper } from '@/components/LifecycleStepper';
import { Panel } from '@/components/ui/Panel';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FilterChip } from '@/components/ui/FilterChip';
import { Kpi } from '@/components/ui/Kpi';
import { KpiSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { LifecycleTag } from '@/components/ui/LifecycleTag';
import { Table, type ColDef } from '@/components/ui/Table';
import { t } from '@/i18n/de';
import type { Contract, Lifecycle, ObjectSummary } from '@/types';

// Governance-Reife als eine Achse: ungebunden (0) < Entwurf < aktiv < veraltet.
const BINDING_ORDER: Record<Lifecycle, number> = { draft: 1, active: 2, deprecated: 3 };

// Contract-Bindung eines Objekts: Lifecycle-Chip + Version, oder ein bewusst
// leiser „leerer Platz"-Chip (gestrichelt, neutral) für ungebundene Objekte —
// Abwesenheit ist kein Breach; den Alarm tragen KPI und Filter, nicht 15 rote
// Chips in der Tabelle.
function ContractCell({ contract }: { contract?: Contract }) {
  if (!contract) {
    return (
      <span style={{
        border: '1px dashed var(--line-2)',
        borderRadius: 'var(--r)', color: 'var(--fg-3)',
        display: 'inline-flex', fontSize: 10, padding: '1px 6px', whiteSpace: 'nowrap',
      }}>
        {t.governance.noContract}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s2)' }}>
      <LifecycleTag lifecycle={contract.lifecycle} />
      {contract.version && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
          v{contract.version}
        </span>
      )}
    </span>
  );
}

export default function Governance() {
  const navigate = useNavigate();
  const { data: objects = [], isLoading, isError, refetch } = useObjects();
  const contractsQuery = useContracts();
  const coverageQuery = useCoverageSummary();
  const [search, setSearch] = useState('');
  const [onlyUncovered, setOnlyUncovered] = useState(false);

  const contracts = contractsQuery.data;
  const { boundaryContracts, contractByProduct } = useMemo(() => {
    const boundary = (contracts ?? []).filter(c => c.kind !== 'internal_gate');
    return {
      boundaryContracts: boundary,
      contractByProduct: new Map(boundary.map(c => [c.product, c])),
    };
  }, [contracts]);
  const activeContracts = boundaryContracts.filter(c => c.lifecycle === 'active');
  const uncovered = objects.filter(o => !contractByProduct.has(o.id)).length;
  const coverage = coverageQuery.data;
  const breached = coverage?.contracts_breached ?? 0;
  const loading = isLoading || contractsQuery.isLoading;
  const error = isError || contractsQuery.isError;
  const filtered = !!(search || onlyUncovered);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return objects.filter(o => {
      if (onlyUncovered && contractByProduct.has(o.id)) return false;
      if (!needle) return true;
      return o.name.toLowerCase().includes(needle) || o.space.toLowerCase().includes(needle);
    });
  }, [objects, contractByProduct, search, onlyUncovered]);

  const columns: ColDef<ObjectSummary>[] = [
    {
      key: 'object',
      header: t.governance.colObject,
      mono: true,
      sortable: true,
      sortValue: o => o.name,
      render: o => o.name,
    },
    {
      key: 'space',
      header: t.governance.colSpace,
      sortable: true,
      sortValue: o => o.space,
      render: o => <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{o.space}</span>,
    },
    {
      key: 'contract',
      header: t.governance.colContract,
      sortable: true,
      sortValue: o => {
        const contract = contractByProduct.get(o.id);
        return contract ? BINDING_ORDER[contract.lifecycle] ?? 1 : 0;
      },
      render: o => <ContractCell contract={contractByProduct.get(o.id)} />,
    },
  ];

  const tableActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', flexWrap: 'wrap' }}>
      <FilterChip active={onlyUncovered} onClick={() => setOnlyUncovered(v => !v)}>
        {t.governance.onlyUncovered}
      </FilterChip>
      <input
        type="search"
        name="governance-search"
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t.governance.searchPlaceholder}
        aria-label={t.governance.searchPlaceholder}
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)',
          color: 'var(--fg)', borderRadius: 'var(--r-md)', padding: '5px 10px', fontSize: 12, minWidth: 180,
        }}
      />
    </div>
  );

  return (
    <div className="page-full">
      <PageHeader title={t.governance.title} subtitle={t.governance.subtitle} />

      {/* Antwort zuerst: Wie weit ist der Bestand unter Contract-Governance? */}
      {loading ? <KpiSkeleton count={4} /> : (
        <div className="dash-kpis" style={{ marginBottom: 'var(--s4)' }}>
          <Kpi
            label={t.governance.kpiCoverage}
            value={`${coverage?.contract_coverage_pct ?? 0}%`}
            delta={coverage ? `${coverage.with_active_contract}/${coverage.objects_total} ${t.governance.coverageOf}` : undefined}
            deltaPositive
            accent="var(--cont)"
          />
          <Kpi label={t.governance.kpiActive} value={activeContracts.length} accent="var(--cont)" />
          <Kpi
            label={t.governance.kpiUncovered}
            value={uncovered}
            accent={uncovered > 0 ? 'var(--status-warn)' : 'var(--qual)'}
          />
          <Kpi
            label={t.governance.contractsBreached}
            value={breached}
            accent={breached > 0 ? 'var(--status-fail)' : 'var(--qual)'}
          />
        </div>
      )}

      {!loading && activeContracts.length === 0 && (
        <div style={{
          background: 'color-mix(in srgb, var(--cont) 8%, transparent)',
          border: '1px solid var(--cont)',
          borderRadius: 'var(--r-lg)', padding: 'var(--s3) var(--s4)', marginBottom: 16,
          fontSize: 12, color: 'var(--fg-2)',
        }}>
          {t.governance.noActiveContractsPre}
          <strong>{t.governance.noActiveContractsArea}</strong>
          {t.governance.noActiveContractsPost}
        </div>
      )}

      <Panel title={t.governance.objectStatusTitle} family="contract" actions={tableActions}>
        {error ? (
          <ErrorBanner onRetry={() => { refetch(); contractsQuery.refetch(); }} />
        ) : loading ? (
          <TableSkeleton columns={3} />
        ) : (
          <Table
            columns={columns}
            rows={rows}
            rowKey={o => o.id}
            onRowClick={o => navigate(`/objects/${o.id}`)}
            empty={filtered ? t.governance.noMatches : t.governance.noObjects}
          />
        )}
      </Panel>

      {/* Referenz statt Hero: die Policy erklärt die Chips oben, führt aber nicht mehr die Seite an. */}
      <div className="dash-2col" style={{ marginTop: 'var(--s4)' }}>
        <Panel title={t.governance.g1Title} family="contract">
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {t.governance.g1Policy.map((p, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 6, lineHeight: 1.6 }}>{p}</li>
            ))}
          </ul>
        </Panel>
        <Panel title={t.governance.lifecycleTitle} family="contract">
          <p style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 12 }}>
            {t.governance.lifecycleDesc1}<strong>{t.governance.lifecycleDescActive}</strong>{t.governance.lifecycleDesc2}
          </p>
          <LifecycleStepper current="active" />
        </Panel>
      </div>
    </div>
  );
}

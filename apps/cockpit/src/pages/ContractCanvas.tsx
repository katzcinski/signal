import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContracts, useContractDocuments } from '@/api/contracts';
import { ContractErdCanvas } from '@/components/erd/ContractErdCanvas';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { SidePanel } from '@/components/ui/SidePanel';
import { buildErdModel, type ErdNode } from '@/lib/erd';
import { t } from '@/i18n/de';
import type { ContractOut } from '@/types';

function Legend() {
  const items = [
    ['PK', t.canvas.legendPk],
    ['•', t.canvas.legendNotNull],
    ['◷', t.canvas.legendFresh],
    ['≥N%', t.canvas.legendCompleteness],
    ['┄', t.canvas.legendExternal],
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s3)', fontSize: 11, color: 'var(--fg-3)' }}>
      {items.map(([sym, label]) => (
        <span key={label}>
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>{sym}</code> {label}
        </span>
      ))}
    </div>
  );
}

function GuaranteeSummary({ contract }: { contract: ContractOut }) {
  const g = contract.guarantees ?? {};
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--s3)', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>{value}</span>
    </div>
  );
  return (
    <div>
      {row(t.canvas.kind, contract.kind)}
      {row(t.canvas.version, `v${contract.version}`)}
      {g.schema && row(t.canvas.schema, `${g.schema.columns.length} · ${g.schema.mode}`)}
      {g.keys?.length ? row(t.canvas.keys, g.keys.map(k => k.columns.join('+')).join(', ')) : null}
      {g.not_null?.length ? row(t.canvas.notNull, g.not_null.flatMap(n => n.columns).join(', ')) : null}
      {g.referential?.length
        ? row(t.canvas.referential, g.referential.map(r => `${r.fk.join(',')}→${r.parent}`).join('; '))
        : null}
      {g.freshness && row(t.canvas.freshness, `${g.freshness.column} · ${g.freshness.max_age}`)}
      {g.volume && row(t.canvas.volume, typeof g.volume.min_rows === 'number' ? `≥${g.volume.min_rows}` : (g.volume.baseline ?? '—'))}
    </div>
  );
}

export default function ContractCanvas() {
  const navigate = useNavigate();
  const list = useContracts();
  const ids = useMemo(() => (list.data ?? []).map(c => c.product), [list.data]);
  const docs = useContractDocuments(ids);
  const [selected, setSelected] = useState<ErdNode | null>(null);

  const contracts = useMemo(
    () => docs.map(d => d.data).filter((c): c is ContractOut => !!c),
    [docs],
  );
  const model = useMemo(() => buildErdModel(contracts), [contracts]);

  const selectedContract = selected && !selected.external
    ? contracts.find(c => c.product === selected.product) ?? null
    : null;

  const loading = list.isLoading || (ids.length > 0 && docs.some(d => d.isLoading));
  const edgeCount = model.edges.length;

  return (
    <div className="page-full" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{t.canvas.title}</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: '0 0 10px' }}>{t.canvas.subtitle}</p>
        <Legend />
      </div>

      {list.isError && <ErrorBanner message={t.canvas.loadError} onRetry={() => list.refetch()} />}

      {loading && (
        <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>{t.common.loading}</div>
      )}

      {!loading && model.nodes.length === 0 && (
        <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>{t.canvas.empty}</div>
      )}

      {!loading && model.nodes.length > 0 && (
        <>
          {edgeCount === 0 && (
            <div style={{
              fontSize: 12, color: 'var(--fg-3)', background: 'var(--bg-2)',
              border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
              padding: '8px 12px', marginBottom: 10,
            }}>
              {t.canvas.noEdges}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 420 }}>
            <ContractErdCanvas model={model} onSelect={setSelected} />
          </div>
        </>
      )}

      {selected && (
        <SidePanel
          title={selected.dataset}
          onClose={() => setSelected(null)}
          footer={selectedContract && (
            <button
              onClick={() => navigate('/contracts')}
              style={{
                background: 'var(--cont)', color: '#fff', border: 'none',
                borderRadius: 'var(--r-md)', padding: '7px 14px', cursor: 'pointer', fontSize: 13,
              }}
            >
              {t.canvas.openWorkbench}
            </button>
          )}
        >
          {selected.external ? (
            <p style={{ fontSize: 13, color: 'var(--fg-3)' }}>{t.canvas.externalHint}</p>
          ) : selectedContract ? (
            <GuaranteeSummary contract={selectedContract} />
          ) : null}
        </SidePanel>
      )}
    </div>
  );
}

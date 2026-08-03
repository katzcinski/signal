// Linke Liste: Contracts + „Neu aus Inventar" (seedet ein internes Gate).
import { useState } from 'react';
import { useSeedContract } from '@/api/contracts';
import { StatusDot } from '@/components/ui/StatusDot';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n/de';
import {
  monoStyle, datasetName, sectionOfKind, complianceStatus, type Section,
} from './shared';
import type { ContractOut, InventoryDataset } from '@/types';

// Rahmenwechsel als Segmented Control (Design-Proposal): ein Schalter mit zwei
// Stellungen, klar unterscheidbar von der Tab-Navigation im Editor.
function SectionTabs({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  const tab = (key: Section, label: string) => (
    <button
      aria-pressed={section === key}
      onClick={() => onChange(key)}
      style={{
        flex: 1, padding: '4px 0', fontSize: 11.5, cursor: 'pointer', borderRadius: 'var(--r)',
        background: section === key ? 'var(--bg-1)' : 'transparent',
        border: `1px solid ${section === key ? 'var(--line-2)' : 'transparent'}`,
        color: section === key ? 'var(--fg)' : 'var(--fg-3)', fontWeight: section === key ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
      <div style={{
        display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)',
        border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
      }}>
        {tab('internal', t.workbench.tabInternal)}
        {tab('contract', t.workbench.tabContract)}
      </div>
    </div>
  );
}

// Gruppenkopf „Consumer · 3" (nur im Contract-Rahmen sinnvoll gruppierbar).
function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      ...monoStyle, display: 'flex', gap: 'var(--s2)', padding: '10px 14px 4px', fontSize: 10,
      color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      <span>{label}</span>
      <span aria-hidden>·</span>
      <span>{count}</span>
    </div>
  );
}

export function ContractList({ contracts, inventory, selected, onSelect, section, onSectionChange }: {
  contracts: ContractOut[];
  inventory: InventoryDataset[];
  selected: string;
  onSelect: (product: string) => void;
  section: Section;
  onSectionChange: (s: Section) => void;
}) {
  const [search, setSearch] = useState('');
  const seed = useSeedContract();
  const [seedingId, setSeedingId] = useState('');

  const inSection = contracts.filter(c => sectionOfKind(c.kind) === section);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? inSection.filter(c => c.product.toLowerCase().includes(q) || c.dataset.toLowerCase().includes(q))
    : inSection;

  // "Neu aus Inventar" seeds an internal gate (the seed default kind), so it only
  // belongs in the internal frame; the contract frame is reached via promotion.
  const contractKeys = new Set(contracts.flatMap(c => [c.product, c.dataset]));
  const uncovered = section === 'internal'
    ? inventory.filter(d => {
        const id = String(d.id ?? datasetName(d));
        return id && !contractKeys.has(id) && !contractKeys.has(datasetName(d));
      })
    : [];

  // Gruppierung nach Rolle: im Contract-Rahmen Consumer/Provider getrennt, im
  // internen Rahmen eine Gruppe. Leere Gruppen fallen weg.
  const groups: { key: string; label: string; items: ContractOut[] }[] = (section === 'contract'
    ? [
        { key: 'consumer', label: t.workbench.groupConsumer, items: filtered.filter(c => c.kind === 'consumer_contract') },
        { key: 'provider', label: t.workbench.groupProvider, items: filtered.filter(c => c.kind === 'provider_contract') },
      ]
    : [{ key: 'internal', label: t.workbench.groupInternal, items: filtered }]
  ).filter(g => g.items.length > 0);

  const item = (c: ContractOut) => (
    <button
      key={c.product}
      onClick={() => onSelect(c.product)}
      aria-current={selected === c.product ? 'true' : undefined}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 14px', cursor: 'pointer',
        background: selected === c.product ? 'var(--bg-2)' : 'transparent',
        border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--fg)',
        boxShadow: selected === c.product ? 'inset 2px 0 0 var(--cont)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <StatusDot status={complianceStatus(c)} size={7} />
        <span style={{ ...monoStyle, color: 'var(--fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.product}</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 3,
          background: 'var(--bg-3)', border: '1px solid var(--line-2)', color: 'var(--fg-2)',
        }}>
          {t.lifecycle[c.lifecycle] ?? c.lifecycle}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginTop: 4, paddingLeft: 15 }}>
        <span style={{ ...monoStyle, fontSize: 10, color: 'var(--fg-3)' }}>v{String(c.version).replace(/^v/i, '')}</span>
        <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>{c.owned_by}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)' }}>
          {t.compliance[c.compliance ?? 'unknown'] ?? t.compliance.unknown}
        </span>
      </div>
    </button>
  );

  return (
    <div style={{ width: 280, borderRight: '1px solid var(--line)', overflowY: 'auto', flexShrink: 0 }}>
      <SectionTabs section={section} onChange={onSectionChange} />
      <div style={{ padding: '0 10px 10px', borderBottom: '1px solid var(--line)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.workbench.searchContracts}
          aria-label={t.workbench.searchContracts}
          style={{
            width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)',
            color: 'var(--fg)', borderRadius: 'var(--r-md)', padding: '5px 10px', fontSize: 12, outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: 14, fontSize: 12, color: 'var(--fg-3)' }}>
          {section === 'internal' ? t.workbench.emptyInternal : t.workbench.emptyContract}
        </div>
      )}
      {groups.map(g => (
        <div key={g.key}>
          <GroupHeader label={g.label} count={g.items.length} />
          {g.items.map(item)}
        </div>
      ))}

      {/* Neu aus Inventar */}
      {uncovered.length > 0 && (
        <div>
          <div style={{ padding: '10px 14px 4px', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t.workbench.newFromInventory}
          </div>
          {uncovered.map(d => {
            const id = String(d.id ?? datasetName(d));
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', padding: '6px 14px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {datasetName(d)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  pending={seed.isPending && seedingId === id}
                  pendingLabel={t.workbench.seeding}
                  onClick={() => {
                    setSeedingId(id);
                    seed.mutate(id, { onSuccess: () => onSelect(id) });
                  }}
                >
                  {t.workbench.seed}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

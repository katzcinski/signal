// Inline-Miner-Vorschläge (P6): datengetriebene Garantie-Vorschläge für diesen
// Contract. „Übernehmen" trägt den vorgeschlagenen Schwellwert in den Entwurf ein
// (client-seitig); gespeichert wird anschließend über den normalen Freigabepfad
// (G1 → Kompilieren → G3). Kein Server-Write hier.
//
// Vorschläge, die sich einer eingeschalteten Garantie-Familie zuordnen lassen,
// erscheinen als Hinweis direkt im betroffenen Kanalzug (Design-Proposal:
// „Man autort gegen echte Daten statt in ein blindes Formular"); der Rest bleibt
// als Sammelblock über dem Editor.
import { toast } from 'sonner';
import { useProposals } from '@/api/proposals';
import { Button } from '@/components/ui/Button';
import { t } from '@/i18n/de';
import { cardStyle, monoStyle } from './shared';
import type { ContractGuarantees, Proposal } from '@/types';

// Übersetzt den vorgeschlagenen Erwartungswert in den passenden Garantie-Parameter.
// Nur die numerischen Miner-Ausgaben (Volume/Completeness/Freshness) sind
// automatisch übernehmbar; sonst null (→ Hinweis „manuell anpassen").
// Volumen-Metrik: `row_count` ist der kompilierte Check-Name, `volume_min_rows`
// der Resolver-Fallback, `volume_adaptive_rows` der Baseline-Check — alle drei
// tragen dieselbe Untergrenzen-Semantik und landen auf `volume.min_rows`.
const VOLUME_CHECKS = new Set(['row_count', 'volume_min_rows', 'volume_adaptive_rows']);
const isFreshnessCheck = (name: string): boolean => name === 'freshness' || name.startsWith('freshness_');

export function applyProposalToGuarantees(g: ContractGuarantees, p: Proposal): ContractGuarantees | null {
  const num = parseFloat((p.proposed_expect.match(/-?\d[\d.]*/) ?? [''])[0]);
  if (Number.isNaN(num)) return null;

  if (VOLUME_CHECKS.has(p.check_name)) {
    return { ...g, volume: { ...(g.volume ?? {}), min_rows: Math.round(num), severity: g.volume?.severity ?? 'warn' } };
  }
  if (isFreshnessCheck(p.check_name)) {
    if (!g.freshness) return null;
    const hours = Math.max(1, Math.round(num / 3600));
    return { ...g, freshness: { ...g.freshness, max_age: `PT${hours}H` } };
  }
  if (p.check_name.startsWith('completeness_')) {
    const col = p.check_name.slice('completeness_'.length);
    if (!g.completeness?.some(r => r.column === col)) return null;
    const minPct = Math.max(0, Math.min(100, 100 - num));  // expect ist „<= max_null_pct"
    return { ...g, completeness: g.completeness.map(r => r.column === col ? { ...r, min_pct: minPct } : r) };
  }
  return null;
}

// Garantie-Familie, in deren Kanalzug der Vorschlag gehört (null = kein Bezug).
// Nur Familien, deren Parameter der Vorschlag auch setzen kann — Vorschläge ohne
// eindeutige Zuordnung (z. B. `duplicate_*`, `null_*`) bleiben im Sammelblock,
// statt inline ein „Übernehmen" anzubieten, das nichts setzt.
export function familyOfProposal(p: Proposal): string | null {
  if (VOLUME_CHECKS.has(p.check_name)) return 'volume';
  if (isFreshnessCheck(p.check_name)) return 'freshness';
  if (p.check_name.startsWith('completeness_')) return 'completeness';
  return null;
}

/**
 * Teilt die offenen Vorschläge dieses Contracts in „inline am Kanalzug" (Familie
 * ist im Entwurf eingeschaltet) und „Sammelblock" (alles andere).
 */
export function useMinerHints(product: string, guarantees: ContractGuarantees) {
  const { data: proposals = [] } = useProposals();
  const relevant = proposals.filter(p => p.product === product && p.status === 'open');
  const byFamily: Record<string, Proposal> = {};
  const rest: Proposal[] = [];
  for (const p of relevant) {
    const family = familyOfProposal(p);
    const active = family ? !!(guarantees as Record<string, unknown>)[family] : false;
    if (family && active && !byFamily[family]) byFamily[family] = p;
    else rest.push(p);
  }
  return { byFamily, rest };
}

const confidencePct = (confidence: number): number =>
  confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);

function ApplyButton({ proposal, guarantees, onApply }: {
  proposal: Proposal;
  guarantees: ContractGuarantees;
  onApply: (g: ContractGuarantees) => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        const next = applyProposalToGuarantees(guarantees, proposal);
        if (next) {
          onApply(next);
          toast.success(t.workbench.miner.applied);
        } else {
          toast(t.workbench.miner.notMappable);
        }
      }}
    >
      {t.workbench.miner.apply}
    </Button>
  );
}

// Ein Vorschlag als Zeile im Kanalzug: Baseline-Herkunft, Zielwert, Konfidenz.
export function MinerHint({ proposal, guarantees, onApply }: {
  proposal: Proposal;
  guarantees: ContractGuarantees;
  onApply: (g: ContractGuarantees) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s3)', flexWrap: 'wrap',
      border: '1px solid color-mix(in srgb, var(--signal) 32%, transparent)',
      background: 'color-mix(in srgb, var(--signal) 10%, transparent)',
      borderRadius: 'var(--r-md)', padding: 'var(--s1) var(--s3)',
    }}>
      <span aria-hidden style={{ color: 'var(--signal)' }}>⚡</span>
      <span style={{ fontSize: 11.5, color: 'var(--fg-2)' }}>
        {t.workbench.miner.inlineTitle}{' '}
        <span style={{ ...monoStyle, fontSize: 11, color: 'var(--signal-bright, var(--signal))' }}>{proposal.proposed_expect}</span>
        {' · '}{t.workbench.miner.confidence} {confidencePct(proposal.confidence)}%
      </span>
      <div style={{ flex: 1 }} />
      <ApplyButton proposal={proposal} guarantees={guarantees} onApply={onApply} />
    </div>
  );
}

export function MinerSuggestions({ proposals, guarantees, onApply }: {
  proposals: Proposal[];
  guarantees: ContractGuarantees;
  onApply: (g: ContractGuarantees) => void;
}) {
  if (proposals.length === 0) return null;

  return (
    <div style={{ ...cardStyle, borderLeft: '3px solid var(--cont)', display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <span aria-hidden>⚡</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{t.workbench.miner.title}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>({proposals.length})</span>
      </div>
      {/* Der Index gehört in den Key: die API kann denselben Vorschlag doppelt
          liefern (identische ID — OPEN_TASKS M1), sonst kollidieren die Keys. */}
      {proposals.map((p, i) => (
        <div key={`${p.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', flexWrap: 'wrap', padding: 'var(--s1) 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ ...monoStyle, fontSize: 11, color: 'var(--fg-2)' }}>{p.check_name}</span>
          <span style={{ ...monoStyle, fontSize: 11 }}>
            <span style={{ color: 'var(--fg-3)' }}>{p.current_expect || '∅'}</span>
            {' → '}
            <span style={{ color: 'var(--status-ok)' }}>{p.proposed_expect}</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.workbench.miner.confidence} {confidencePct(p.confidence)}%</span>
          <div style={{ flex: 1 }} />
          <ApplyButton proposal={p} guarantees={guarantees} onApply={onApply} />
        </div>
      ))}
    </div>
  );
}

// ERD-Modell für die Contract-Canvas (Schritt 1: read-only).
//
// Reine, framework-freie Ableitung des Entity-Relationship-Modells aus
// Contract-Dokumenten. Knoten = ein Contract (bzw. ein referenzierter, aber
// nicht-kontraktierter "externer" Datensatz), Kanten = `referential`-Garantien
// (FK → parent_key). Keine React-/Cytoscape-Abhängigkeit, damit die Logik per
// vitest testbar bleibt und die Darstellung (Canvas) reines Mapping ist.

import type { ArtifactKind, ContractOut, Severity } from '@/types';

export interface ErdColumn {
  name: string;
  pk: boolean;          // Teil eines unique-Keys
  notNull: boolean;     // in einer not_null-Garantie
  freshness: boolean;   // Freshness-Spalte des Contracts
  completenessPct?: number;
}

export interface ErdNode {
  id: string;           // = product (eindeutig) bzw. "ext:<dataset>" für externe
  dataset: string;
  product: string;
  kind: ArtifactKind | 'external';
  version?: string;
  external: boolean;    // referenziert, aber kein eigener Contract vorhanden
  columns: ErdColumn[];
  schemaMode?: 'closed' | 'open';
  badges: string[];     // verdichtete Garantie-Badges für den Knoten-Header
}

export interface ErdEdge {
  id: string;
  source: string;       // Knoten-id des FK-haltenden Contracts
  target: string;       // Knoten-id des Parent-Datensatzes
  label: string;        // "FK_COL → PARENT_KEY"
  severity?: Severity;
}

export interface ErdModel {
  nodes: ErdNode[];
  edges: ErdEdge[];
}

const KIND_LABEL: Record<string, string> = {
  consumer_contract: 'consumer',
  provider_contract: 'provider',
  internal_gate: 'gate',
};

function columnsOf(c: ContractOut): ErdColumn[] {
  const g = c.guarantees ?? {};
  const cols = g.schema?.columns ?? [];

  const pkCols = new Set<string>();
  for (const k of g.keys ?? []) {
    if (k.unique) k.columns.forEach(col => pkCols.add(col));
  }
  const notNullCols = new Set<string>();
  for (const nn of g.not_null ?? []) {
    nn.columns.forEach(col => notNullCols.add(col));
  }
  const completeness = new Map<string, number>();
  for (const comp of g.completeness ?? []) {
    completeness.set(comp.column, comp.min_pct);
  }
  const freshCol = g.freshness?.column;

  return cols.map(name => ({
    name,
    pk: pkCols.has(name),
    notNull: notNullCols.has(name),
    freshness: name === freshCol,
    completenessPct: completeness.get(name),
  }));
}

function badgesOf(c: ContractOut): string[] {
  const g = c.guarantees ?? {};
  const out: string[] = [];
  if (g.schema?.mode) out.push(`schema: ${g.schema.mode}`);
  if (g.volume) {
    if (typeof g.volume.min_rows === 'number') out.push(`≥${g.volume.min_rows} rows`);
    else if (g.volume.baseline === 'rolling') out.push('volume: rolling');
  }
  if (g.freshness?.max_age) out.push(`◷ ${g.freshness.max_age}`);
  return out;
}

/**
 * Leitet das ERD-Modell aus den (vollständigen) Contract-Dokumenten ab.
 * Referenzierte Parent-Datensätze ohne eigenen Contract werden als externe
 * Geister-Knoten ergänzt, damit FK-Kanten nie ins Leere zeigen.
 */
export function buildErdModel(contracts: ContractOut[]): ErdModel {
  // dataset → Knoten-id (= product). Bei Mehrdeutigkeit gewinnt der erste.
  const datasetToId = new Map<string, string>();
  for (const c of contracts) {
    if (!datasetToId.has(c.dataset)) datasetToId.set(c.dataset, c.product);
  }

  const nodes: ErdNode[] = contracts.map(c => ({
    id: c.product,
    dataset: c.dataset,
    product: c.product,
    kind: c.kind,
    version: c.version,
    external: false,
    columns: columnsOf(c),
    schemaMode: c.guarantees?.schema?.mode,
    badges: badgesOf(c),
  }));

  const externalNodes = new Map<string, ErdNode>();
  const edges: ErdEdge[] = [];

  for (const c of contracts) {
    const refs = c.guarantees?.referential ?? [];
    refs.forEach((r, i) => {
      let targetId = datasetToId.get(r.parent);
      if (!targetId) {
        targetId = `ext:${r.parent}`;
        if (!externalNodes.has(targetId)) {
          externalNodes.set(targetId, {
            id: targetId,
            dataset: r.parent,
            product: r.parent,
            kind: 'external',
            external: true,
            columns: r.parent_key.map(name => ({
              name, pk: true, notNull: false, freshness: false,
            })),
            badges: [],
          });
        }
      }
      edges.push({
        id: `${c.product}:ref:${i}`,
        source: c.product,
        target: targetId,
        label: `${r.fk.join(', ')} → ${r.parent_key.join(', ')}`,
        severity: r.severity,
      });
    });
  }

  return { nodes: [...nodes, ...externalNodes.values()], edges };
}

const NN = ' •';
const FRESH = ' ◷';

/** Mehrzeiliges, monospace-orientiertes Label für einen Cytoscape-Knoten. */
export function formatNodeLabel(node: ErdNode): string {
  const head: string[] = [node.dataset];
  if (node.external) {
    head.push('extern · referenziert');
  } else {
    head.push(`${KIND_LABEL[node.kind] ?? node.kind} · v${node.version ?? '—'}`);
    if (node.badges.length) head.push(node.badges.join(' · '));
  }

  const rule = '─'.repeat(Math.min(28, Math.max(...head.map(h => h.length), 10)));

  const cols = node.columns.map(col => {
    const prefix = col.pk ? 'PK ' : '   ';
    let suffix = '';
    if (col.notNull) suffix += NN;
    if (col.freshness) suffix += FRESH;
    if (typeof col.completenessPct === 'number') suffix += ` ≥${col.completenessPct}%`;
    return `${prefix}${col.name}${suffix}`;
  });

  return [...head, rule, ...(cols.length ? cols : ['   (keine Spalten)'])].join('\n');
}

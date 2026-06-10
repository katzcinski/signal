import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cytoscape from 'cytoscape';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import dagre from 'cytoscape-dagre';
import { useLineage } from '@/api/lineage';
import type { LineageNode } from '@/types';

Cytoscape.use(dagre as Parameters<typeof Cytoscape.use>[0]);

// Coverage flag → status-ampel color (U1: status colors only, NOT family colors)
const COVERAGE_COLOR: Record<string, string> = {
  '●': 'var(--status-ok)',    // green — active contract + passing
  '◐': 'var(--status-warn)',  // yellow — partial / some checks failing
  '▲': 'var(--status-fail)',  // red — no contract or key gap
  '○': 'var(--fg-3)',         // grey — out of scope / external
};

const COVERAGE_LABEL: Record<string, string> = {
  '●': 'Covered',
  '◐': 'Partial',
  '▲': 'Gap',
  '○': 'Out of scope',
};

const LAYERS = ['Landing', 'Harmonization', 'Product'];

// Positions cache key based on node count
function cacheKey(nodes: LineageNode[]) {
  return `lineage-pos-n${nodes.length}`;
}

interface SidePanelProps {
  node: LineageNode;
  onClose: () => void;
}

function SidePanel({ node, onClose }: SidePanelProps) {
  const navigate = useNavigate();
  const flag = node.coverage_flag ?? '○';
  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: 280, height: '100%',
      background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
      padding: 20, overflowY: 'auto', zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>{node.label ?? node.id}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 18 }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
        Layer: {LAYERS[node.layer ?? 0] ?? `Layer ${node.layer}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18, color: COVERAGE_COLOR[flag] }}>{flag}</span>
        <span style={{ fontSize: 12 }}>{COVERAGE_LABEL[flag]}</span>
      </div>
      {node.dq_status && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
          DQ status: <strong style={{ color: 'var(--fg)' }}>{node.dq_status}</strong>
        </div>
      )}
      {node.last_run && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 16 }}>
          Last run: {new Date(node.last_run).toLocaleString()}
        </div>
      )}
      {node.has_contract && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>
          Family: <span style={{ color: 'var(--fg)' }}>{node.family ?? '—'}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <button
          onClick={() => navigate(`/contracts/${node.id}`)}
          style={{ background: 'var(--cont)', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          Contract öffnen →
        </button>
        <button
          onClick={() => navigate(`/contracts?compile=${node.id}`)}
          style={{ background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          Compile
        </button>
      </div>
    </div>
  );
}

export default function LineageMap() {
  const { data, isLoading } = useLineage();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<unknown>(null);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [layerFilter, setLayerFilter] = useState<string>('');
  const [flagFilter, setFlagFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Desktop-only guard (U3)
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 900;

  const applyFilters = useCallback(() => {
    const cy = cyInstance.current as Cytoscape.Core | null;
    if (!cy) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cy.nodes() as any).show();
    if (layerFilter !== '') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cy.nodes().filter(n => String(n.data('layer')) !== layerFilter) as any).hide();
    }
    if (flagFilter) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cy.nodes().filter(n => n.data('coverage_flag') !== flagFilter) as any).hide();
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cy.nodes().filter(n =>
        !String(n.data('label')).toLowerCase().includes(q) &&
        !String(n.data('id')).toLowerCase().includes(q)
      ) as any).hide();
    }
  }, [layerFilter, flagFilter, search]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    if (!data || !cyRef.current || isNarrow) return;

    let cy: Cytoscape.Core;

    {
      const nodes: LineageNode[] = data.nodes ?? [];
      const edges: { id: string; source: string; target: string }[] = data.edges ?? [];

      // Try restoring cached positions
      let restoredElements: unknown = null;
      try {
        const cached = sessionStorage.getItem(cacheKey(nodes));
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.nodes?.length === nodes.length) {
            restoredElements = parsed;
          }
        }
      } catch {
        // ignore
      }

      cy = Cytoscape({
        container: cyRef.current,
        elements: {
          nodes: nodes.map(n => ({
            data: {
              id: n.id,
              label: n.label ?? n.id,
              layer: n.layer ?? 0,
              family: n.family ?? '',
              coverage_flag: n.coverage_flag ?? '○',
              dq_status: n.dq_status ?? 'unknown',
              has_contract: n.has_contract ?? false,
              last_run: n.last_run ?? '',
            },
          })),
          edges: edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target } })),
        },
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'var(--bg-2)' as string,
              'border-width': 2,
              'border-color': (el: Cytoscape.NodeSingular) =>
                COVERAGE_COLOR[el.data('coverage_flag') as string] ?? 'var(--fg-3)',
              'label': 'data(label)',
              'font-size': 10,
              'font-family': 'var(--font-mono)',
              'color': 'var(--fg)' as string,
              'text-valign': 'center',
              'text-halign': 'right',
              'text-margin-x': 6,
              'width': 120,
              'height': 30,
              'shape': 'roundrectangle',
            } as Record<string, unknown>,
          },
          {
            selector: 'edge',
            style: {
              'width': 1.5,
              'line-color': 'var(--line-2)' as string,
              'target-arrow-color': 'var(--line-2)' as string,
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            } as Record<string, unknown>,
          },
          {
            selector: 'node:selected',
            style: { 'border-width': 3 } as Record<string, unknown>,
          },
        ],
        layout: restoredElements
          ? { name: 'preset' }
          : { name: 'dagre', rankDir: 'LR', nodeSep: 60, rankSep: 120, padding: 40 } as unknown as { name: string },
        userZoomingEnabled: true,
        userPanningEnabled: true,
      });

      if (restoredElements) {
        cy.json({ elements: restoredElements as Cytoscape.ElementsDefinition });
      }

      // Hide labels at low zoom
      cy.on('zoom', () => {
        const z = cy.zoom();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cy.nodes() as any).style('label', z < 0.5 ? '' : 'data(label)');
      });

      // Save positions after layout
      cy.on('layoutstop', () => {
        try {
          const elements = cy.json().elements;
          sessionStorage.setItem(cacheKey(nodes), JSON.stringify(elements));
        } catch {
          // ignore quota errors
        }
      });

      // Node click → side panel
      cy.on('tap', 'node', (evt: unknown) => {
        const nodeEl = (evt as { target: { data: (k: string) => unknown } }).target;
        const nodeData = nodes.find(n => n.id === nodeEl.data('id'));
        if (nodeData) setSelectedNode(nodeData);
      });

      // Double-click → navigate to object detail
      cy.on('dbltap', 'node', (evt: unknown) => {
        const nodeEl = (evt as { target: { data: (k: string) => string } }).target;
        navigate(`/objects/${nodeEl.data('id')}`);
      });

      cyInstance.current = cy;
    }

    return () => {
      if (cyInstance.current) {
        (cyInstance.current as Cytoscape.Core).destroy();
        cyInstance.current = null;
      }
    };
  }, [data, isNarrow, navigate]);

  if (isNarrow) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-3)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🖥</div>
        <div style={{ fontWeight: 600 }}>Desktop only</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>
          The Lineage Coverage Map requires a wider screen. Open this page on a desktop or tablet.
        </div>
      </div>
    );
  }

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading lineage data…</div>;

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Lineage Coverage Map</h1>
        {data?.extract_age && (
          <div style={{ fontSize: 12, color: 'var(--status-warn)' }}>
            Extract age: {data.extract_age}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={layerFilter}
          onChange={e => setLayerFilter(e.target.value)}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12 }}
        >
          <option value=''>All layers</option>
          <option value='0'>Landing</option>
          <option value='1'>Harmonization</option>
          <option value='2'>Product</option>
        </select>
        <select
          value={flagFilter}
          onChange={e => setFlagFilter(e.target.value)}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12 }}
        >
          <option value=''>All coverage</option>
          <option value='●'>● Covered</option>
          <option value='◐'>◐ Partial</option>
          <option value='▲'>▲ Gap</option>
          <option value='○'>○ Out of scope</option>
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5,
            padding: '5px 10px', color: 'var(--fg)', fontSize: 12, minWidth: 180,
          }}
        />
        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 'auto' }}>
          {Object.entries(COVERAGE_LABEL).map(([flag, label]) => (
            <span key={flag} style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              <span style={{ color: COVERAGE_COLOR[flag] }}>{flag}</span> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Graph container */}
      <div style={{ position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', height: 560 }}>
        <div ref={cyRef} style={{ width: '100%', height: '100%' }} />
        {selectedNode && (
          <SidePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  );
}

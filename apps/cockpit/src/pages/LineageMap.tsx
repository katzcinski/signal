import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cytoscape from 'cytoscape';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import dagre from 'cytoscape-dagre';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useLineage } from '@/api/lineage';
import { useCoverageSummary } from '@/api/coverage';
import { Kpi } from '@/components/ui/Kpi';
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

// Cytoscape's canvas renderer cannot resolve `var(--x)` — resolve the CSS
// variables to concrete values once and feed hex colors into the stylesheet.
interface ResolvedTheme {
  bg2: string; fg: string; fg3: string; line2: string; fontMono: string;
  coverage: Record<string, string>;
}
let resolvedTheme: ResolvedTheme | null = null;
function resolveTheme(): ResolvedTheme {
  if (resolvedTheme) return resolvedTheme;
  const styles = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  resolvedTheme = {
    bg2: cssVar('--bg-2', '#1A1F27'),
    fg: cssVar('--fg', '#E7EBF2'),
    fg3: cssVar('--fg-3', '#5E6877'),
    line2: cssVar('--line-2', '#313945'),
    fontMono: cssVar('--font-mono', "'JetBrains Mono', monospace"),
    coverage: {
      '●': cssVar('--status-ok', '#3FB07A'),
      '◐': cssVar('--status-warn', '#E0B23E'),
      '▲': cssVar('--status-fail', '#E2783C'),
      '○': cssVar('--fg-3', '#5E6877'),
    },
  };
  return resolvedTheme;
}

// Position cache: keyed by a stable hash of the sorted node IDs so a graph
// with the same nodes restores positions, while any membership change misses.
function cacheKey(nodes: LineageNode[]) {
  const ids = nodes.map(n => n.id).sort().join('|');
  let h = 0;
  for (let i = 0; i < ids.length; i++) h = (h * 31 + ids.charCodeAt(i)) | 0;
  return `lineage-pos-${(h >>> 0).toString(36)}`;
}

type PositionMap = Record<string, { x: number; y: number }>;

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
  const { data: coverage } = useCoverageSummary();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<unknown>(null);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [layerFilter, setLayerFilter] = useSearchParamState('layer');
  const [flagFilter, setFlagFilter] = useSearchParamState('flag');
  const [search, setSearch] = useSearchParamState('q');
  const navigate = useNavigate();

  // Desktop-only guard (U3)
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 900;

  const applyFilters = useCallback(() => {
    const cy = cyInstance.current as Cytoscape.Core | null;
    if (!cy) return;
    cy.nodes().style('display', 'element');
    if (layerFilter !== '') {
      cy.nodes().filter(n => String(n.data('layer')) !== layerFilter).style('display', 'none');
    }
    if (flagFilter) {
      cy.nodes().filter(n => n.data('coverage_flag') !== flagFilter).style('display', 'none');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      cy.nodes().filter(n =>
        !String(n.data('label')).toLowerCase().includes(q) &&
        !String(n.data('id')).toLowerCase().includes(q)
      ).style('display', 'none');
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
      const theme = resolveTheme();
      const key = cacheKey(nodes);

      // Try restoring cached positions (positions ONLY — element data always
      // comes fresh from the API so coverage flags can never go stale).
      let restoredPositions: PositionMap | null = null;
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached) as PositionMap;
          if (parsed && nodes.every(n => parsed[n.id])) {
            restoredPositions = parsed;
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
              'background-color': theme.bg2,
              'border-width': 2,
              'border-color': (el: Cytoscape.NodeSingular) =>
                theme.coverage[el.data('coverage_flag') as string] ?? theme.fg3,
              'label': 'data(label)',
              'font-size': 10,
              'font-family': theme.fontMono,
              'color': theme.fg,
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
              'line-color': theme.line2,
              'target-arrow-color': theme.line2,
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            } as Record<string, unknown>,
          },
          {
            selector: 'node:selected',
            style: { 'border-width': 3 } as Record<string, unknown>,
          },
        ],
        layout: restoredPositions
          ? { name: 'preset' }
          : { name: 'dagre', rankDir: 'LR', nodeSep: 60, rankSep: 120, padding: 40 } as unknown as { name: string },
        userZoomingEnabled: true,
        userPanningEnabled: true,
      });

      if (restoredPositions) {
        // Apply cached positions only — never replace element data.
        for (const [nodeId, pos] of Object.entries(restoredPositions)) {
          cy.getElementById(nodeId).position(pos);
        }
        cy.fit(undefined, 40);
      }

      const savePositions = () => {
        try {
          const positions: PositionMap = {};
          cy.nodes().forEach(n => { positions[n.id()] = { ...n.position() }; });
          sessionStorage.setItem(key, JSON.stringify(positions));
        } catch {
          // ignore quota errors
        }
      };

      // Hide labels at low zoom
      cy.on('zoom', () => {
        const z = cy.zoom();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cy.nodes() as any).style('label', z < 0.5 ? '' : 'data(label)');
      });

      // Save positions after layout and after manual node drags
      cy.on('layoutstop', savePositions);
      cy.on('dragfree', 'node', savePositions);

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

      {/* R4-4: coverage KPIs above the map */}
      {coverage && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Kpi label="Objects" value={coverage.total_objects} accent="var(--obs)" />
          <Kpi
            label="With contract"
            value={`${coverage.pct_with_contract}%`}
            delta={`${coverage.objects_with_contract}/${coverage.total_objects}`}
            accent="var(--status-ok)"
          />
          <Kpi
            label="With checks"
            value={`${coverage.pct_with_checks}%`}
            delta={`${coverage.objects_with_checks}/${coverage.total_objects}`}
            accent="var(--qual)"
          />
          <Kpi
            label={`Unvalidated`}
            value={coverage.unvalidated.length}
            accent={coverage.unvalidated.length > 0 ? 'var(--status-fail)' : 'var(--status-ok)'}
          />
        </div>
      )}

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

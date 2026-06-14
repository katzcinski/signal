import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cytoscape from 'cytoscape';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import dagre from 'cytoscape-dagre';
import { useLineage } from '@/api/lineage';
import { useCoverageSummary } from '@/api/coverage';
import { CoverageIcon } from '@/components/ui/CoverageIcon';
import { coverageColor, coverageIconDataUri } from '@/components/ui/coverageIcon';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { t } from '@/i18n/de';
import type { LineageNode } from '@/types';

Cytoscape.use(dagre as Parameters<typeof Cytoscape.use>[0]);

const COVERAGE_LABEL: Record<string, string> = {
  '●': t.lineage.covered,
  '◐': t.lineage.partial,
  '▲': t.lineage.gap,
  '○': t.lineage.outOfScope,
};

const LAYERS = ['Landing', 'Harmonization', 'Product'];

// Cytoscape's canvas renderer cannot resolve `var(--x)` — resolve the CSS
// variables to concrete values once and feed hex colors into the stylesheet.
interface ResolvedTheme {
  bg2: string; fg: string; fg3: string; line2: string; cont: string; fontMono: string;
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
    cont: cssVar('--cont', '#5E83E6'),
    fontMono: cssVar('--font-mono', "'JetBrains Mono', monospace"),
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

// Root-cause highlight (K): emphasise the focused node + all its ancestors,
// dim the rest. Empty focus resets.
function applyRootCause(cy: Cytoscape.Core, focusId: string) {
  cy.elements().removeClass('rc-dim rc-path');
  if (!focusId) return;
  const node = cy.getElementById(focusId);
  if (node.empty()) return;
  const path = node.predecessors().union(node);
  cy.elements().not(path).addClass('rc-dim');
  path.addClass('rc-path');
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
        <button onClick={onClose} aria-label={t.common.close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 18 }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
        {t.lineage.layerLabel}: {LAYERS[node.layer ?? 0] ?? `Layer ${node.layer}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <CoverageIcon flag={flag} size={16} label={COVERAGE_LABEL[flag]} />
        <span style={{ fontSize: 12 }}>{COVERAGE_LABEL[flag]}</span>
      </div>
      {node.dq_status && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
          {t.lineage.dqStatus}: <strong style={{ color: 'var(--fg)' }}>{node.dq_status}</strong>
        </div>
      )}
      {node.last_run && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 16 }}>
          {t.lineage.lastRun}: {new Date(node.last_run).toLocaleString()}
        </div>
      )}
      {node.has_contract && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>
          {t.lineage.family}: <span style={{ color: 'var(--fg)' }}>{node.family ?? '—'}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <button
          onClick={() => navigate(`/contracts?product=${encodeURIComponent(node.id)}`)}
          style={{ background: 'var(--cont)', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          {t.lineage.openContract}
        </button>
        <button
          onClick={() => navigate(`/contracts?compile=${encodeURIComponent(node.id)}`)}
          style={{ background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          {t.lineage.compile}
        </button>
      </div>
    </div>
  );
}

// G: Coverage KPI chips above the canvas.
function CoverageKpis() {
  const { data } = useCoverageSummary();
  const [listOpen, setListOpen] = useState(false);
  if (!data) return null;
  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, color: 'var(--fg-2)',
  };
  const num: React.CSSProperties = { fontWeight: 700, color: 'var(--fg)', fontSize: 13 };
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={chip}><span style={num}>{data.objects_total}</span> {t.lineage.kpiObjects}</span>
      <span style={chip}><span style={num}>{data.with_active_contract}</span> {t.lineage.kpiWithContract}</span>
      <span style={chip}><span style={num}>{data.with_checks}</span> {t.lineage.kpiWithChecks}</span>
      <span style={chip}><span style={num}>{Math.round(data.contract_coverage_pct)}%</span> {t.lineage.kpiCoverage}</span>
      <button
        onClick={() => setListOpen(o => !o)}
        title={data.unvalidated_30d.join('\n') || '—'}
        style={{ ...chip, cursor: 'pointer', color: data.unvalidated_30d.length > 0 ? 'var(--status-warn)' : 'var(--fg-2)' }}
      >
        <span style={{ ...num, color: 'inherit' }}>{data.unvalidated_30d.length}</span> {t.lineage.kpiUnvalidated}
      </button>
      {listOpen && data.unvalidated_30d.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 60, marginTop: 4,
          background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 6,
          padding: 12, maxHeight: 240, overflowY: 'auto', minWidth: 240,
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {t.lineage.unvalidatedTitle}
          </div>
          {data.unvalidated_30d.map(n => (
            <div key={n} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)', padding: '2px 0' }}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LineageMap() {
  const { data, isLoading } = useLineage();
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Cytoscape.Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [layerFilter, setLayerFilter] = useSearchParamState('layer');
  const [flagFilter, setFlagFilter] = useSearchParamState('status');
  const [search, setSearch] = useSearchParamState('search');
  const [focus, setFocus] = useSearchParamState('focus');
  const [graphReady, setGraphReady] = useState(0);
  const navigate = useNavigate();

  // Desktop-only guard (U3)
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 900;

  const applyFilters = useCallback(() => {
    const cy = cyInstance.current;
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
  }, [applyFilters, graphReady]);

  // ?focus={id}: select + center node and apply the root-cause highlight (G/K).
  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy) return;
    applyRootCause(cy, focus);
    if (focus) {
      const node = cy.getElementById(focus);
      if (!node.empty()) {
        cy.nodes().unselect();
        node.select();
        cy.center(node);
        const nodeData = (data?.nodes ?? []).find(n => n.id === focus);
        if (nodeData) setSelectedNode(nodeData);
      }
    }
  }, [focus, graphReady, data]);

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
          nodes: [
            // R6-8: one compound parent per layer → swimlanes.
            ...[...new Set(nodes.map(n => n.layer ?? 0))].sort().map(layer => ({
              data: { id: `lane-${layer}`, label: LAYERS[layer] ?? `Layer ${layer}`, isLane: true },
              selectable: false, grabbable: false,
            })),
            ...nodes.map(n => ({
              data: {
                id: n.id,
                label: n.label ?? n.id,
                layer: n.layer ?? 0,
                parent: `lane-${n.layer ?? 0}`,
                family: n.family ?? '',
                coverage_flag: n.coverage_flag ?? '○',
                dq_status: n.dq_status ?? 'unknown',
                has_contract: n.has_contract ?? false,
                last_run: n.last_run ?? '',
              },
            })),
          ],
          edges: edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target } })),
        },
        style: [
          {
            // Uniform icon-chip node: a status icon (background-image) carries
            // the coverage state, with the border colour as a second channel and
            // the label as the third (Carbon ≥3-of-4, never colour alone).
            selector: 'node',
            style: {
              'background-color': theme.bg2,
              'background-image': (el: Cytoscape.NodeSingular) =>
                coverageIconDataUri(String(el.data('coverage_flag'))),
              'background-fit': 'none',
              'background-width': '18px',
              'background-height': '18px',
              'background-position-x': '50%',
              'background-position-y': '50%',
              'border-width': 2,
              'border-color': (el: Cytoscape.NodeSingular) =>
                coverageColor(String(el.data('coverage_flag'))),
              'label': 'data(label)',
              'font-size': 10,
              'font-family': theme.fontMono,
              'color': theme.fg,
              'text-valign': 'center',
              'text-halign': 'right',
              'text-margin-x': 8,
              'width': 28,
              'height': 28,
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
          // R6-8 swimlane parents.
          {
            selector: 'node[?isLane]',
            style: {
              'background-color': theme.bg2,
              'background-opacity': 0.35,
              'background-image': 'none',
              'border-width': 1,
              'border-color': theme.line2,
              'border-style': 'dashed',
              'shape': 'roundrectangle',
              'label': 'data(label)',
              'text-valign': 'top',
              'text-halign': 'center',
              'text-margin-y': -6,
              'text-margin-x': 0,
              'font-size': 11,
              'font-family': theme.fontMono,
              'color': theme.fg3,
              'padding': 24,
            } as Record<string, unknown>,
          },
          {
            selector: 'node:selected',
            style: { 'border-width': 3 } as Record<string, unknown>,
          },
          {
            // Root-cause path: emphasised
            selector: '.rc-path',
            style: { 'opacity': 1, 'border-width': 3 } as Record<string, unknown>,
          },
          {
            selector: 'edge.rc-path',
            style: { 'line-color': theme.cont, 'target-arrow-color': theme.cont, 'width': 2.5 } as Record<string, unknown>,
          },
          {
            // Everything off the root-cause path: dimmed
            selector: '.rc-dim',
            style: { 'opacity': 0.18 } as Record<string, unknown>,
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

      // Node click → side panel + root-cause highlight (URL-synced focus)
      cy.on('tap', 'node', (evt: unknown) => {
        const nodeEl = (evt as { target: { data: (k: string) => unknown } }).target;
        const nodeId = String(nodeEl.data('id'));
        const nodeData = nodes.find(n => n.id === nodeId);
        if (nodeData) {
          setSelectedNode(nodeData);
          setFocus(nodeId);
          applyRootCause(cy, nodeId);
        }
      });

      // Background click → reset highlight + close panel
      cy.on('tap', (evt: Cytoscape.EventObject) => {
        if (evt.target === cy) {
          applyRootCause(cy, '');
          setSelectedNode(null);
          setFocus('');
        }
      });

      // Double-click → navigate to object detail
      cy.on('dbltap', 'node', (evt: unknown) => {
        const nodeEl = (evt as { target: { data: (k: string) => string } }).target;
        navigate(`/objects/${nodeEl.data('id')}`);
      });

      cyInstance.current = cy;
      setGraphReady(g => g + 1);
    }

    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
        cyInstance.current = null;
      }
    };
  }, [data, isNarrow, navigate, setFocus]);

  if (isNarrow) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-3)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🖥</div>
        <div style={{ fontWeight: 600 }}>{t.lineage.desktopOnly}</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>
          {t.lineage.desktopOnlyHint}
        </div>
      </div>
    );
  }

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;

  return (
    <div style={{ maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.lineage.title}</h1>
        {data?.extract_age != null && (
          <div style={{ fontSize: 12, color: data.stale ? 'var(--status-warn)' : 'var(--fg-3)' }}
               title={data.stale ? t.lineage.staleWarning : undefined}>
            {t.lineage.extractAge}: {data.extract_age}{data.stale ? ' ⚠' : ''}
          </div>
        )}
      </div>

      <CoverageKpis />

      {/* Filter bar (URL-synced) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={layerFilter}
          onChange={e => setLayerFilter(e.target.value)}
          aria-label={t.lineage.layerLabel}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12 }}
        >
          <option value=''>{t.lineage.allLayers}</option>
          <option value='0'>Landing</option>
          <option value='1'>Harmonization</option>
          <option value='2'>Product</option>
        </select>
        <select
          value={flagFilter}
          onChange={e => setFlagFilter(e.target.value)}
          aria-label={t.lineage.allCoverage}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12 }}
        >
          <option value=''>{t.lineage.allCoverage}</option>
          <option value='●'>✓ {t.lineage.covered}</option>
          <option value='◐'>◐ {t.lineage.partial}</option>
          <option value='▲'>⚠ {t.lineage.gap}</option>
          <option value='○'>○ {t.lineage.outOfScope}</option>
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.lineage.searchPlaceholder}
          aria-label={t.lineage.searchPlaceholder}
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5,
            padding: '5px 10px', color: 'var(--fg)', fontSize: 12, minWidth: 180,
          }}
        />
        {/* Legend: the same icons used on the canvas nodes (colour + shape + text) */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {Object.entries(COVERAGE_LABEL).map(([flag, label]) => (
            <span key={flag} style={{ fontSize: 11, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CoverageIcon flag={flag} size={14} /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Graph container — fills remaining viewport height, min 200px for tiny screens */}
      <div style={{ position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', flex: 1, minHeight: 200 }}>
        <div ref={cyRef} style={{ width: '100%', height: '100%' }} />
        {selectedNode && (
          <SidePanel node={selectedNode} onClose={() => { setSelectedNode(null); setFocus(''); const cy = cyInstance.current; if (cy) applyRootCause(cy, ''); }} />
        )}
      </div>
    </div>
  );
}

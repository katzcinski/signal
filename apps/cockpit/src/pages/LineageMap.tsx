import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import Cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { fetchColumnLineage, useColumnLineage, useLineage } from '@/api/lineage';
import { useCoverageSummary } from '@/api/coverage';
import { ObjectProfilePanel } from '@/components/ObjectProfilePanel';
import { coverageColor, coverageIconDataUri } from '@/components/ui/coverageIcon';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { t } from '@/i18n/de';
import { useRoleStore, canProfileObject } from '@/store/role';
import {
  buildColumnGraphElements,
  deriveLane,
  edgeTypeColor,
  lineageNodeLabel,
  splitColumnId,
  traceColumnLineage,
  type ColumnGraphEdgeData,
  type ColumnGraphElements,
  type ColumnIndexByObject,
  type ColumnObjectMetaById,
  type LaneInfo,
} from '@/lib/lineage';
import type { ColumnLineageEntry, LineageEdge, LineageGraph, LineageNode } from '@/types';

Cytoscape.use(dagre as Parameters<typeof Cytoscape.use>[0]);

const FLAG_COVERED = '\u25cf';
const FLAG_PARTIAL = '\u25d0';
const FLAG_GAP = '\u25b2';
const FLAG_OUT = '\u25cb';

const COVERAGE_LABEL: Record<string, string> = {
  [FLAG_COVERED]: t.lineage.covered,
  [FLAG_PARTIAL]: t.lineage.partial,
  [FLAG_GAP]: t.lineage.gap,
  [FLAG_OUT]: t.lineage.outOfScope,
};

const COVERAGE_TOOLTIP: Record<string, string> = {
  [FLAG_COVERED]: t.lineage.tooltips.covered,
  [FLAG_PARTIAL]: t.lineage.tooltips.partial,
  [FLAG_GAP]: t.lineage.tooltips.gap,
  [FLAG_OUT]: t.lineage.tooltips.outOfScope,
};

const legendItemStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--fg-3)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
};

const OBJECT_EDGE_FALLBACK = '#8b949e';

interface ResolvedTheme {
  bg1: string;
  bg2: string;
  fg: string;
  fg2: string;
  fg3: string;
  line: string;
  line2: string;
  cont: string;
  fontMono: string;
}

let resolvedTheme: ResolvedTheme | null = null;
function resolveTheme(): ResolvedTheme {
  if (resolvedTheme) return resolvedTheme;
  const styles = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  resolvedTheme = {
    bg1: cssVar('--bg-1', '#11151B'),
    bg2: cssVar('--bg-2', '#1A1F27'),
    fg: cssVar('--fg', '#E7EBF2'),
    fg2: cssVar('--fg-2', '#AAB3C2'),
    fg3: cssVar('--fg-3', '#5E6877'),
    line: cssVar('--line', '#27303A'),
    line2: cssVar('--line-2', '#313945'),
    cont: cssVar('--cont', '#5E83E6'),
    fontMono: cssVar('--font-mono', "'JetBrains Mono', monospace"),
  };
  return resolvedTheme;
}

function cacheKey(nodes: LineageNode[]) {
  const ids = nodes.map(n => n.id).sort().join('|');
  let h = 0;
  for (let i = 0; i < ids.length; i++) h = (h * 31 + ids.charCodeAt(i)) | 0;
  return `lineage-pos-${(h >>> 0).toString(36)}`;
}

type PositionMap = Record<string, { x: number; y: number }>;
type CoverageDimension = 'all' | 'internal' | 'contract';

function SegmentControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div style={{
      display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 6,
      overflow: 'hidden', background: 'var(--bg-2)',
    }}>
      {options.map(option => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            style={{
              border: 'none', borderRight: option.key === options[options.length - 1].key ? 'none' : '1px solid var(--line)',
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              background: active ? 'var(--cont)' : 'transparent',
              color: active ? '#fff' : 'var(--fg-2)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function applyRootCause(cy: Cytoscape.Core, focusId: string) {
  cy.elements().removeClass('rc-dim rc-path');
  if (!focusId) return;
  const node = cy.getElementById(focusId);
  if (node.empty()) return;
  const path = node.predecessors().union(node);
  cy.elements().not(path).addClass('rc-dim');
  path.addClass('rc-path');
}

function edgeKind(edge: Pick<LineageEdge, 'type' | 'edgeType'>): string {
  return edge.type || edge.edgeType || 'lineage';
}

function objectEdgeColor(kind: string): string {
  const columnColor = edgeTypeColor(kind);
  return columnColor === '#8b949e' ? OBJECT_EDGE_FALLBACK : columnColor;
}

function layerLanes(nodes: LineageNode[]): LaneInfo[] {
  const byKey = new Map<string, LaneInfo>();
  for (const node of nodes) {
    const lane = deriveLane(node);
    if (!byKey.has(lane.key)) byKey.set(lane.key, lane);
  }
  return [...byKey.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function CoverageKpis({ dimension }: { dimension: CoverageDimension }) {
  const { data } = useCoverageSummary();
  const [listOpen, setListOpen] = useState(false);
  if (!data) return null;
  const chip: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, color: 'var(--fg-2)',
  };
  const num: CSSProperties = { fontWeight: 700, color: 'var(--fg)', fontSize: 13 };
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={chip}><span style={num}>{data.objects_total}</span> {t.lineage.kpiObjects}</span>
      {dimension !== 'contract' && (
        <span style={chip}><span style={num}>{data.with_internal_gate ?? 0}</span> Internal Gates</span>
      )}
      {dimension !== 'internal' && (
        <span style={chip}><span style={num}>{data.with_contract_checks ?? 0}</span> Contracts</span>
      )}
      <span style={chip}><span style={num}>{data.with_checks}</span> {t.lineage.kpiWithChecks}</span>
      <span style={chip}><span style={num}>{Math.round(data.contract_coverage_pct)}%</span> {t.lineage.kpiCoverage}</span>
      <button
        onClick={() => setListOpen(o => !o)}
        title={data.unvalidated_30d.join('\n') || '-'}
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

function ObjectSidePanel({
  node,
  canProfile,
  onClose,
  onOpenColumns,
  onProfile,
}: {
  node: LineageNode;
  canProfile: boolean;
  onClose: () => void;
  onOpenColumns: (id: string) => void;
  onProfile: (id: string) => void;
}) {
  const navigate = useNavigate();
  const flag = node.coverage_flag ?? FLAG_OUT;
  const lane = deriveLane(node);
  const coverageLabel = COVERAGE_LABEL[flag] ?? t.lineage.outOfScope;
  const coverageTooltip = COVERAGE_TOOLTIP[flag] ?? t.lineage.tooltips.outOfScope;
  const kindLabel = node.kind === 'internal_gate' ? t.gateSignal : t.governanceBreach;
  const kindTooltip = node.kind === 'internal_gate'
    ? t.lineage.tooltips.gateSignal
    : t.lineage.tooltips.governanceBreach;
  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: 300, height: '100%',
      background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
      padding: 20, overflowY: 'auto', zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>{lineageNodeLabel(node)}</div>
        <button onClick={onClose} aria-label={t.common.close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 18 }}>x</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
        {t.lineage.layerLabel}: {lane.label}{lane.code ? ` (${lane.code})` : ''}
      </div>
      {node.role && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
          Role: <strong style={{ color: 'var(--fg)' }}>{node.role}</strong>
        </div>
      )}
      {node.confidence != null && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>
          Confidence: <strong style={{ color: 'var(--fg)' }}>{Math.round(node.confidence * 100)}%</strong>
        </div>
      )}
      <div
        title={coverageTooltip}
        aria-label={`${coverageLabel}: ${coverageTooltip}`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
      >
        <img src={coverageIconDataUri(flag)} width={16} height={16} alt={coverageLabel} style={{ display: 'block' }} />
        <span style={{ fontSize: 12 }}>{coverageLabel}</span>
      </div>
      {node.kind && (
        <div
          title={kindTooltip}
          aria-label={`${kindLabel}: ${kindTooltip}`}
          style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}
        >
          {t.incidents.filterKind}: <strong style={{ color: 'var(--fg)' }}>{kindLabel}</strong>
        </div>
      )}
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
      {node.family && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 4 }}>
          {t.lineage.family}: <span style={{ color: 'var(--fg)' }}>{node.family}</span>
        </div>
      )}
      {node.columns && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 8 }}>
          Columns: <span style={{ color: 'var(--fg)' }}>{node.columns.length}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <button
          onClick={() => onOpenColumns(node.id)}
          style={{ background: 'var(--cont)', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          Column lineage
        </button>
        <button
          onClick={() => onProfile(node.id)}
          disabled={!canProfile}
          title={canProfile ? undefined : 'Profiling requires steward role or higher.'}
          style={{
            background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)',
            borderRadius: 5, padding: '7px 14px', fontSize: 13,
            cursor: canProfile ? 'pointer' : 'not-allowed', opacity: canProfile ? 1 : 0.45,
          }}
        >
          Profile object
        </button>
        <button
          onClick={() => navigate(`/contracts?product=${encodeURIComponent(node.id)}`)}
          style={{ background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          {t.lineage.openContract}
        </button>
        <button
          onClick={() => navigate(`/contracts?compile=${encodeURIComponent(node.id)}`)}
          style={{ background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          {t.lineage.compile}
        </button>
        {node.has_internal_gate && !node.has_boundary_contract && canProfile && (
          <button
            onClick={() => navigate(`/contracts?promote=${encodeURIComponent(node.id)}`)}
            title={t.lineage.promoteHint}
            style={{
              background: 'var(--cont)', color: '#fff', border: 'none',
              borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            }}
          >
            {t.lineage.promoteCta}
          </button>
        )}
      </div>
    </div>
  );
}

function ObjectLineageGraph({
  data,
  layerFilter,
  setLayerFilter,
  flagFilter,
  setFlagFilter,
  dimension,
  setDimension,
  search,
  setSearch,
  focus,
  setFocus,
  setView,
  onProfile,
  canProfile,
}: {
  data: LineageGraph;
  layerFilter: string;
  setLayerFilter: (value: string) => void;
  flagFilter: string;
  setFlagFilter: (value: string) => void;
  dimension: CoverageDimension;
  setDimension: (value: CoverageDimension) => void;
  search: string;
  setSearch: (value: string) => void;
  focus: string;
  setFocus: (value: string) => void;
  setView: (value: string) => void;
  onProfile: (id: string) => void;
  canProfile: boolean;
}) {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Cytoscape.Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [graphReady, setGraphReady] = useState(0);
  const [graphError, setGraphError] = useState<string | null>(null);
  const navigate = useNavigate();
  const nodes = data.nodes;
  const edges = data.edges;
  const lanes = useMemo(() => layerLanes(nodes), [nodes]);
  const edgeKinds = useMemo(() => [...new Set(edges.map(edgeKind))].sort(), [edges]);

  const applyFilters = useCallback(() => {
    const cy = cyInstance.current;
    if (!cy) return;
    cy.nodes().style('display', 'element');
    cy.nodes().removeClass('dimension-dim');
    if (layerFilter) {
      cy.nodes().filter(n => n.data('laneKey') !== layerFilter && !n.data('isLane')).style('display', 'none');
      cy.nodes().filter(n => n.data('isLane') && n.data('laneKey') !== layerFilter).style('display', 'none');
    }
    if (flagFilter) {
      cy.nodes().filter(n => !n.data('isLane') && n.data('coverage_flag') !== flagFilter).style('display', 'none');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      cy.nodes().filter(n =>
        !n.data('isLane') &&
        !String(n.data('label')).toLowerCase().includes(q) &&
        !String(n.data('id')).toLowerCase().includes(q)
      ).style('display', 'none');
    }
    if (dimension === 'internal') {
      cy.nodes().filter(n =>
        !n.data('isLane') && !n.data('has_internal_gate')
      ).addClass('dimension-dim');
    }
    if (dimension === 'contract') {
      cy.nodes().filter(n =>
        !n.data('isLane') && !n.data('has_boundary_contract')
      ).addClass('dimension-dim');
    }
  }, [layerFilter, flagFilter, search, dimension]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters, graphReady]);

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
        const nodeData = nodes.find(n => n.id === focus);
        if (nodeData) setSelectedNode(nodeData);
      }
    }
  }, [focus, graphReady, nodes]);

  useEffect(() => {
    if (!data || !cyRef.current) return;
    setGraphError(null);
    const theme = resolveTheme();
    const key = cacheKey(nodes);

    let restoredPositions: PositionMap | null = null;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached) as PositionMap;
        if (parsed && nodes.every(n => parsed[n.id])) restoredPositions = parsed;
      }
    } catch {
      // ignore cache issues
    }

    let cy: Cytoscape.Core;
    try {
      cy = Cytoscape({
        container: cyRef.current,
        elements: {
          nodes: [
            ...lanes.map(lane => ({
              data: {
                id: `lane-${lane.key}`,
                label: lane.code ? `${lane.label} (${lane.code})` : lane.label,
                isLane: true,
                laneKey: lane.key,
              },
              selectable: false,
              grabbable: false,
            })),
            ...nodes.map(n => {
              const lane = deriveLane(n);
              return {
                data: {
                  id: n.id,
                  label: lineageNodeLabel(n),
                  laneKey: lane.key,
                  layer: n.layer,
                  layerCode: n.layerCode ?? '',
                  role: n.role ?? '',
                  confidence: n.confidence ?? null,
                  parent: `lane-${lane.key}`,
                  family: n.family ?? '',
                  coverage_flag: n.coverage_flag ?? FLAG_OUT,
                  dq_status: n.dq_status ?? 'unknown',
                  has_contract: n.has_contract ?? false,
                  has_internal_gate: n.has_internal_gate ?? false,
                  has_boundary_contract: n.has_boundary_contract ?? false,
                  artifact_kind: n.kind ?? '',
                  last_run: n.last_run ?? '',
                },
              };
            }),
          ],
          edges: edges.map(e => ({
            data: {
              id: e.id,
              source: e.source,
              target: e.target,
              type: edgeKind(e),
              color: objectEdgeColor(edgeKind(e)),
            },
          })),
        },
        style: [
          {
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
              'line-color': 'data(color)',
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            } as Record<string, unknown>,
          },
          {
            selector: 'edge[type="computed"]',
            style: { 'line-style': 'dashed' } as Record<string, unknown>,
          },
          {
            selector: 'node[artifact_kind="internal_gate"]',
            style: { 'border-style': 'dashed' } as Record<string, unknown>,
          },
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
          { selector: 'node:selected', style: { 'border-width': 3 } as Record<string, unknown> },
          { selector: '.rc-path', style: { 'opacity': 1, 'border-width': 3 } as Record<string, unknown> },
          { selector: 'edge.rc-path', style: { 'line-color': theme.cont, 'target-arrow-color': theme.cont, 'width': 2.5 } as Record<string, unknown> },
          { selector: '.dimension-dim', style: { 'opacity': 0.15 } as Record<string, unknown> },
          { selector: '.rc-dim', style: { 'opacity': 0.18 } as Record<string, unknown> },
        ],
        layout: restoredPositions
          ? { name: 'preset' }
          : { name: 'dagre', rankDir: 'LR', nodeSep: 60, rankSep: 120, padding: 40 } as unknown as { name: string },
        userZoomingEnabled: true,
        userPanningEnabled: true,
      });
    } catch (err) {
      setGraphError(String(err));
      return;
    }

    if (restoredPositions) {
      for (const [nodeId, pos] of Object.entries(restoredPositions)) cy.getElementById(nodeId).position(pos);
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

    cy.on('zoom', () => {
      const z = cy.zoom();
      cy.nodes().style('label', z < 0.5 ? '' : 'data(label)');
    });
    cy.on('layoutstop', savePositions);
    cy.on('dragfree', 'node', savePositions);
    cy.on('tap', 'node', evt => {
      const nodeEl = evt.target;
      if (nodeEl.data('isLane')) return;
      const nodeId = String(nodeEl.data('id'));
      const nodeData = nodes.find(n => n.id === nodeId);
      if (nodeData) {
        setSelectedNode(nodeData);
        setFocus(nodeId);
        applyRootCause(cy, nodeId);
      }
    });
    cy.on('tap', evt => {
      if (evt.target === cy) {
        applyRootCause(cy, '');
        setSelectedNode(null);
        setFocus('');
      }
    });
    cy.on('dbltap', 'node', evt => {
      const nodeEl = evt.target;
      if (nodeEl.data('isLane')) return;
      navigate(`/objects/${nodeEl.data('id')}`);
    });

    cyInstance.current = cy;
    setGraphReady(g => g + 1);

    return () => {
      cy.destroy();
      if (cyInstance.current === cy) cyInstance.current = null;
    };
  }, [data, edges, lanes, navigate, nodes, setFocus]);

  if (graphError) return (
    <div style={{ color: 'var(--status-fail)', padding: 24 }}>
      Graph-Fehler: {graphError}<br />
      <button onClick={() => setGraphError(null)} style={{ marginTop: 8, cursor: 'pointer' }}>Erneut versuchen</button>
    </div>
  );

  return (
    <>
      <CoverageKpis dimension={dimension} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={layerFilter}
          onChange={e => setLayerFilter(e.target.value)}
          aria-label={t.lineage.layerLabel}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12 }}
        >
          <option value="">{t.lineage.allLayers}</option>
          {lanes.map(lane => (
            <option key={lane.key} value={lane.key}>{lane.code ? `${lane.label} (${lane.code})` : lane.label}</option>
          ))}
        </select>
        <select
          value={flagFilter}
          onChange={e => setFlagFilter(e.target.value)}
          aria-label={t.lineage.allCoverage}
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12 }}
        >
          <option value="">{t.lineage.allCoverage}</option>
          <option value={FLAG_COVERED}>covered</option>
          <option value={FLAG_PARTIAL}>partial</option>
          <option value={FLAG_GAP}>gap</option>
          <option value={FLAG_OUT}>out of scope</option>
        </select>
        <SegmentControl
          value={dimension}
          onChange={setDimension}
          options={[
            { key: 'all', label: t.lineage.dimensionAll },
            { key: 'internal', label: t.lineage.dimensionInternal },
            { key: 'contract', label: t.lineage.dimensionContract },
          ]}
        />
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
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {Object.entries(COVERAGE_LABEL).map(([flag, label]) => (
            <span
              key={flag}
              title={COVERAGE_TOOLTIP[flag]}
              aria-label={`${label}: ${COVERAGE_TOOLTIP[flag]}`}
              style={legendItemStyle}
            >
              <img src={coverageIconDataUri(flag)} width={14} height={14} alt="" style={{ display: 'block' }} /> {label}
            </span>
          ))}
          <span
            title={t.lineage.tooltips.gateSignal}
            aria-label={`${t.gateSignal}: ${t.lineage.tooltips.gateSignal}`}
            style={legendItemStyle}
          >
            <span style={{ width: 18, height: 12, border: '1px dashed var(--line-2)', borderRadius: 3, display: 'inline-block' }} />
            {t.gateSignal}
          </span>
          <span
            title={t.lineage.tooltips.governanceBreach}
            aria-label={`${t.governanceBreach}: ${t.lineage.tooltips.governanceBreach}`}
            style={legendItemStyle}
          >
            <span style={{ width: 18, height: 12, border: '1px solid var(--line-2)', borderRadius: 3, display: 'inline-block' }} />
            {t.governanceBreach}
          </span>
          {edgeKinds.map(kind => (
            <span key={kind} style={legendItemStyle}>
              <span style={{ width: 18, height: 3, borderRadius: 2, background: objectEdgeColor(kind), display: 'inline-block' }} />
              {kind}
            </span>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', height: 560 }}>
        <div ref={cyRef} style={{ width: '100%', height: '100%' }} />
        {selectedNode && (
          <ObjectSidePanel
            node={selectedNode}
            canProfile={canProfile}
            onClose={() => {
              setSelectedNode(null);
              setFocus('');
              const cy = cyInstance.current;
              if (cy) applyRootCause(cy, '');
            }}
            onOpenColumns={id => {
              setFocus(id);
              setView('columns');
            }}
            onProfile={onProfile}
          />
        )}
      </div>
    </>
  );
}

type ColumnSelection =
  | { kind: 'object'; object: string }
  | { kind: 'column'; object: string; column: string; entry: ColumnLineageEntry }
  | { kind: 'edge'; edge: ColumnGraphEdgeData }
  | null;

function applyColumnGraphState(
  cy: Cytoscape.Core,
  expanded: Set<string>,
  traceColumnIds: Set<string>,
  traceEdgeIds: Set<string>,
  search: string,
) {
  cy.elements().removeClass('trace-hl trace-dim found');
  cy.nodes('[kind="column"]').forEach(n => {
    n.style('display', expanded.has(String(n.data('object'))) ? 'element' : 'none');
  });
  cy.edges('[kind="column"]').forEach(e => {
    const srcObj = String(e.source().data('object'));
    const tgtObj = String(e.target().data('object'));
    e.style('display', expanded.has(srcObj) && expanded.has(tgtObj) ? 'element' : 'none');
  });
  cy.edges('[kind="aggregate"]').forEach(e => {
    const src = String(e.data('source'));
    const tgt = String(e.data('target'));
    e.style('display', expanded.has(src) && expanded.has(tgt) ? 'none' : 'element');
  });

  if (traceColumnIds.size > 0) {
    cy.elements().addClass('trace-dim');
    traceColumnIds.forEach(id => {
      const node = cy.getElementById(id);
      node.removeClass('trace-dim').addClass('trace-hl');
      node.parent().removeClass('trace-dim');
    });
    traceEdgeIds.forEach(id => cy.getElementById(id).removeClass('trace-dim').addClass('trace-hl'));
  }

  const q = search.trim().toLowerCase();
  if (q) {
    cy.nodes().filter(n =>
      String(n.data('label') ?? '').toLowerCase().includes(q) ||
      String(n.id()).toLowerCase().includes(q)
    ).addClass('found');
  }

  const visible = cy.elements().filter(el => el.style('display') !== 'none');
  if (visible.length > 0) {
    visible.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 18, rankSep: 84, edgeSep: 8, padding: 38, fit: true } as unknown as { name: string }).run();
  }
}

function ColumnPanel({
  selection,
  errors,
  canProfile,
  onClose,
  onProfile,
}: {
  selection: ColumnSelection;
  errors: string[];
  canProfile: boolean;
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  if (!selection) return null;
  const panel: CSSProperties = {
    position: 'absolute', top: 0, right: 0, width: 330, height: '100%',
    background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
    padding: 20, overflowY: 'auto', zIndex: 10,
  };
  const badge = (kind: string) => (
    <span style={{
      display: 'inline-block', background: edgeTypeColor(kind), color: '#fff',
      borderRadius: 10, padding: '1px 6px', fontSize: 10, marginLeft: 6,
    }}>
      {kind}
    </span>
  );
  const steps = (items: { object: string; column: string; edgeType: string; expression?: string }[]) => (
    items.length === 0 ? (
      <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>None</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, idx) => (
          <div key={`${item.object}-${item.column}-${idx}`} style={{ fontSize: 12, color: 'var(--fg-2)', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
            <code>{item.object}.{item.column}</code>{badge(item.edgeType)}
            {item.expression && (
              <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-3)', fontSize: 11 }}>
                {item.expression}
              </pre>
            )}
          </div>
        ))}
      </div>
    )
  );

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <strong style={{ fontSize: 14 }}>
          {selection.kind === 'object' ? selection.object : selection.kind === 'column' ? selection.column : 'Column edge'}
        </strong>
        <button onClick={onClose} aria-label={t.common.close} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 18 }}>x</button>
      </div>

      {selection.kind === 'object' && (
        <>
          <div style={{ color: 'var(--fg-3)', fontSize: 12, marginBottom: 12 }}>Click the box to expand or collapse lineage columns.</div>
          <button
            onClick={() => onProfile(selection.object)}
            disabled={!canProfile}
            title={canProfile ? undefined : 'Profiling requires steward role or higher.'}
            style={{
              background: 'var(--bg-2)', color: 'var(--fg)', border: '1px solid var(--line)',
              borderRadius: 5, padding: '7px 14px', fontSize: 13,
              cursor: canProfile ? 'pointer' : 'not-allowed', opacity: canProfile ? 1 : 0.45,
            }}
          >
            Profile object
          </button>
        </>
      )}

      {selection.kind === 'column' && (
        <>
          <div style={{ color: 'var(--fg-3)', fontSize: 12, marginBottom: 12 }}>
            in <code>{selection.object}</code>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 6px' }}>
            Upstream ({selection.entry.upstream.length})
          </div>
          {steps(selection.entry.upstream)}
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 6px' }}>
            Downstream ({selection.entry.downstream.length})
          </div>
          {steps(selection.entry.downstream)}
        </>
      )}

      {selection.kind === 'edge' && (
        <>
          <div style={{ color: 'var(--fg-2)', fontSize: 12, marginBottom: 8 }}>
            <code>{splitColumnId(selection.edge.source).object}.{splitColumnId(selection.edge.source).column}</code>
            {' -> '}
            <code>{splitColumnId(selection.edge.target).object}.{splitColumnId(selection.edge.target).column}</code>
          </div>
          {selection.edge.edgeType && badge(selection.edge.edgeType)}
          {selection.edge.expression && (
            <>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 6px' }}>
                Expression
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-2)', fontSize: 11 }}>
                {selection.edge.expression}
              </pre>
            </>
          )}
        </>
      )}

      {errors.length > 0 && (
        <div style={{
          marginTop: 16, border: '1px solid var(--status-warn)', borderRadius: 6,
          background: 'rgba(245, 158, 11, 0.08)', color: 'var(--status-warn)',
          padding: 10, fontSize: 12,
        }}>
          {errors.join(' ')}
        </div>
      )}
    </div>
  );
}

function ColumnLineageGraph({
  graph,
  focusObject,
  search,
  setSearch,
  canProfile,
  onProfile,
}: {
  graph: LineageGraph;
  focusObject: string;
  search: string;
  setSearch: (value: string) => void;
  canProfile: boolean;
  onProfile: (id: string) => void;
}) {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Cytoscape.Core | null>(null);
  const indexesRef = useRef<ColumnIndexByObject>({});
  const traceRef = useRef<(id: string) => void>(() => undefined);
  const { data, isLoading, isError, error, refetch } = useColumnLineage(focusObject);
  const [indexes, setIndexes] = useState<ColumnIndexByObject>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [traceColumnIds, setTraceColumnIds] = useState<Set<string>>(new Set());
  const [traceEdgeIds, setTraceEdgeIds] = useState<Set<string>>(new Set());
  const [traceErrors, setTraceErrors] = useState<string[]>([]);
  const [selection, setSelection] = useState<ColumnSelection>(null);
  const objectMeta = useMemo<ColumnObjectMetaById>(() => Object.fromEntries(
    graph.nodes.map(node => [node.id, {
      label: lineageNodeLabel(node),
      layer: node.layer,
      layerCode: node.layerCode,
      role: node.role,
    }]),
  ), [graph.nodes]);

  useEffect(() => {
    if (!data || !('columns' in data)) return;
    setIndexes({ [data.object]: data.columns });
    setExpanded(new Set());
    setTraceColumnIds(new Set());
    setTraceEdgeIds(new Set());
    setTraceErrors([]);
    setSelection(null);
  }, [data]);

  useEffect(() => {
    indexesRef.current = indexes;
  }, [indexes]);

  const elements = useMemo<ColumnGraphElements>(() => buildColumnGraphElements(indexes, objectMeta), [indexes, objectMeta]);

  const traceColumn = useCallback(async (id: string) => {
    const ref = splitColumnId(id);
    const result = await traceColumnLineage(ref, indexesRef.current, objectId => fetchColumnLineage(objectId));
    setIndexes(result.indexes);
    setTraceColumnIds(new Set(result.columnIds));
    setTraceEdgeIds(new Set(result.edgeIds));
    setTraceErrors(result.errors);
    setExpanded(prev => {
      const next = new Set(prev);
      result.columnIds.forEach(colId => next.add(splitColumnId(colId).object));
      return next;
    });
    setSelection({
      kind: 'column',
      object: ref.object,
      column: ref.column,
      entry: result.indexes[ref.object]?.[ref.column] ?? { upstream: [], downstream: [] },
    });
  }, []);

  useEffect(() => {
    traceRef.current = id => {
      void traceColumn(id);
    };
  }, [traceColumn]);

  useEffect(() => {
    if (!search.trim()) return;
    setExpanded(prev => {
      const next = new Set(prev);
      const q = search.trim().toLowerCase();
      for (const node of elements.nodes) {
        if (node.kind === 'column' && (
          node.label.toLowerCase().includes(q) ||
          node.id.toLowerCase().includes(q) ||
          (node.object ?? '').toLowerCase().includes(q)
        )) {
          next.add(node.object ?? '');
        }
      }
      next.delete('');
      return next;
    });
  }, [elements.nodes, search]);

  useEffect(() => {
    if (!cyRef.current || elements.nodes.length === 0) return;
    const theme = resolveTheme();
    const cy = Cytoscape({
      container: cyRef.current,
      elements: {
        nodes: elements.nodes.map(node => ({ data: node })),
        edges: elements.edges.map(edge => ({ data: edge })),
      },
      style: [
        {
          selector: 'node[kind="object"]',
          style: {
            'label': 'data(label)',
            'shape': 'roundrectangle',
            'background-color': theme.bg1,
            'background-opacity': 1,
            'border-width': 2,
            'border-color': theme.cont,
            'color': theme.fg,
            'font-size': 11,
            'font-family': theme.fontMono,
            'font-weight': 700,
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': -2,
            'padding': 12,
            'compound-sizing-wrt-labels': 'include',
          } as Record<string, unknown>,
        },
        {
          selector: 'node[kind="column"]',
          style: {
            'label': 'data(label)',
            'shape': 'roundrectangle',
            'background-color': theme.bg2,
            'border-width': 1,
            'border-color': theme.line2,
            'color': theme.fg2,
            'font-size': 9,
            'font-family': theme.fontMono,
            'width': 'label',
            'height': 16,
            'padding': 4,
            'text-valign': 'center',
            'text-halign': 'center',
          } as Record<string, unknown>,
        },
        {
          selector: 'edge[kind="column"]',
          style: {
            'width': 1.4,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
          } as Record<string, unknown>,
        },
        {
          selector: 'edge[kind="column"][edgeType="computed"]',
          style: { 'line-style': 'dashed' } as Record<string, unknown>,
        },
        {
          selector: 'edge[kind="aggregate"]',
          style: {
            'width': 'mapData(count,1,20,1.5,6)',
            'line-color': theme.line2,
            'target-arrow-color': theme.line2,
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            'label': 'data(count)',
            'font-size': 8,
            'font-family': theme.fontMono,
            'color': theme.fg3,
            'text-background-color': theme.bg1,
            'text-background-opacity': 0.85,
            'text-background-padding': 1,
          } as Record<string, unknown>,
        },
        {
          selector: '.trace-hl',
          style: {
            'line-color': theme.cont,
            'target-arrow-color': theme.cont,
            'width': 3,
            'border-color': theme.cont,
            'border-width': 3,
            'z-index': 99,
          } as Record<string, unknown>,
        },
        { selector: '.trace-dim', style: { 'opacity': 0.18 } as Record<string, unknown> },
        { selector: '.found', style: { 'border-color': '#f59e0b', 'border-width': 3 } as Record<string, unknown> },
      ],
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node', evt => {
      const node = evt.target;
      const kind = String(node.data('kind'));
      if (kind === 'object') {
        const object = String(node.data('id'));
        setSelection({ kind: 'object', object });
        setExpanded(prev => {
          const next = new Set(prev);
          if (next.has(object)) next.delete(object);
          else next.add(object);
          return next;
        });
      } else if (kind === 'column') {
        traceRef.current(String(node.data('id')));
      }
    });
    cy.on('tap', 'edge', evt => {
      const edge = evt.target;
      if (edge.data('kind') !== 'column') return;
      setSelection({ kind: 'edge', edge: edge.data() as ColumnGraphEdgeData });
    });
    cy.on('tap', evt => {
      if (evt.target === cy) {
        setSelection(null);
        setTraceColumnIds(new Set());
        setTraceEdgeIds(new Set());
        setTraceErrors([]);
      }
    });

    cyInstance.current = cy;
    return () => {
      cy.destroy();
      if (cyInstance.current === cy) cyInstance.current = null;
    };
  }, [elements]);

  useEffect(() => {
    const cy = cyInstance.current;
    if (!cy) return;
    applyColumnGraphState(cy, expanded, traceColumnIds, traceEdgeIds, search);
  }, [elements, expanded, traceColumnIds, traceEdgeIds, search]);

  if (!focusObject) {
    return (
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 24, color: 'var(--fg-3)' }}>
        Select an object in the object lineage map to open column lineage.
      </div>
    );
  }

  if (isLoading) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;
  if (isError) {
    return (
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 24 }}>
        <div style={{ color: 'var(--status-crit)', fontSize: 12, marginBottom: 12 }}>
          {error instanceof Error ? error.message : 'Column lineage failed to load.'}
        </div>
        <button onClick={() => void refetch()} style={{ background: 'none', border: '1px solid var(--status-crit)', color: 'var(--status-crit)', borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>
          {t.common.retry}
        </button>
      </div>
    );
  }

  if (elements.nodes.length === 0) {
    return (
      <>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search object or column..."
            aria-label="Search object or column"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12, minWidth: 220 }}
          />
          <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>Object: <code>{focusObject}</code></span>
        </div>
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 24, color: 'var(--fg-3)' }}>
          No column-level lineage was found for <code>{focusObject}</code>.
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search object or column..."
          aria-label="Search object or column"
          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 10px', color: 'var(--fg)', fontSize: 12, minWidth: 220 }}
        />
        <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>Object: <code>{focusObject}</code></span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {(['direct', 'computed', 'passthrough'] as const).map(kind => (
            <span key={kind} style={{ fontSize: 11, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 18, height: 3, borderRadius: 2, background: edgeTypeColor(kind), display: 'inline-block' }} />
              {kind}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', height: 560 }}>
        <div ref={cyRef} style={{ width: '100%', height: '100%' }} />
        <ColumnPanel
          selection={selection}
          errors={traceErrors}
          canProfile={canProfile}
          onClose={() => setSelection(null)}
          onProfile={onProfile}
        />
      </div>
    </>
  );
}

export default function LineageMap() {
  const { data, isLoading, isError } = useLineage();
  const [layerFilter, setLayerFilter] = useSearchParamState('layer');
  const [flagFilter, setFlagFilter] = useSearchParamState('status');
  const [search, setSearch] = useSearchParamState('search');
  const [focus, setFocus] = useSearchParamState('focus');
  const [view, setView] = useSearchParamState('view', 'objects');
  const [dimension, setDimension] = useState<CoverageDimension>('all');
  const [profileObject, setProfileObject] = useState('');
  const role = useRoleStore(s => s.role);
  const canProfile = canProfileObject(role);
  const currentView = view === 'columns' ? 'columns' : 'objects';
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 900;

  if (isNarrow) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-3)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>Desktop</div>
        <div style={{ fontWeight: 600 }}>{t.lineage.desktopOnly}</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>{t.lineage.desktopOnlyHint}</div>
      </div>
    );
  }

  if (isError) return <div style={{ color: 'var(--status-fail)', padding: 24 }}>Backend nicht erreichbar — bitte Backend starten und Seite neu laden.</div>;
  if (isLoading || !data) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>{t.common.loading}</div>;

  const tabButton = (key: 'objects' | 'columns'): CSSProperties => ({
    border: '1px solid var(--line)',
    borderRadius: 5,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    background: currentView === key ? 'var(--cont)' : 'var(--bg-2)',
    color: currentView === key ? '#fff' : 'var(--fg-2)',
  });

  return (
    <div className="page-full">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t.lineage.title}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <button type="button" onClick={() => setView('objects')} style={tabButton('objects')}>Objects</button>
          <button type="button" onClick={() => setView('columns')} style={tabButton('columns')}>Columns</button>
        </div>
        {data.extract_age != null && (
          <div style={{ fontSize: 12, color: data.stale ? 'var(--status-warn)' : 'var(--fg-3)' }}
               title={data.stale ? t.lineage.staleWarning : undefined}>
            {t.lineage.extractAge}: {data.extract_age}{data.stale ? ' !' : ''}
          </div>
        )}
      </div>

      {currentView === 'objects' ? (
        <ObjectLineageGraph
          data={data}
          layerFilter={layerFilter}
          setLayerFilter={setLayerFilter}
          flagFilter={flagFilter}
          setFlagFilter={setFlagFilter}
          dimension={dimension}
          setDimension={setDimension}
          search={search}
          setSearch={setSearch}
          focus={focus}
          setFocus={setFocus}
          setView={setView}
          onProfile={setProfileObject}
          canProfile={canProfile}
        />
      ) : (
        <ColumnLineageGraph
          graph={data}
          focusObject={focus}
          search={search}
          setSearch={setSearch}
          canProfile={canProfile}
          onProfile={setProfileObject}
        />
      )}

      {profileObject && (
        <ObjectProfilePanel objectId={profileObject} onClose={() => setProfileObject('')} />
      )}
    </div>
  );
}

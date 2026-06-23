import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { lineageNodeLabel } from '@/lib/lineage';
import type { LineageGraph, LineageNode } from '@/types';

Cytoscape.use(dagre as Parameters<typeof Cytoscape.use>[0]);

interface LineageMiniGraphProps {
  subgraph: LineageGraph;
}

interface ThemeTokens {
  bg1: string;
  bg2: string;
  fg: string;
  fg2: string;
  fg3: string;
  line: string;
  line2: string;
  cont: string;
  obs: string;
  qual: string;
  statusOk: string;
  statusWarn: string;
  statusFail: string;
  fontMono: string;
}

function resolveTheme(): ThemeTokens {
  const styles = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    bg1: cssVar('--bg-1', '#11151B'),
    bg2: cssVar('--bg-2', '#1A1F27'),
    fg: cssVar('--fg', '#E7EBF2'),
    fg2: cssVar('--fg-2', '#AAB3C2'),
    fg3: cssVar('--fg-3', '#5E6877'),
    line: cssVar('--line', '#27303A'),
    line2: cssVar('--line-2', '#313945'),
    cont: cssVar('--cont', '#5E83E6'),
    obs: cssVar('--obs', '#F59E0B'),
    qual: cssVar('--qual', '#00D4AA'),
    statusOk: cssVar('--status-ok', '#2da44e'),
    statusWarn: cssVar('--status-warn', '#d97706'),
    statusFail: cssVar('--status-fail', '#c44444'),
    fontMono: cssVar('--font-mono', "'JetBrains Mono', monospace"),
  };
}

function coverageColor(node: LineageNode, theme: ThemeTokens): string {
  const flag = String(node.coverage_flag ?? '').toLowerCase();
  if (flag === 'covered' || flag === '●') return theme.statusOk;
  if (flag === 'partial' || flag === '◐') return theme.statusWarn;
  if (flag === 'gap' || flag === '△') return theme.statusFail;
  return '';
}

function nodeColor(node: LineageNode, theme: ThemeTokens): string {
  const coverage = coverageColor(node, theme);
  if (coverage) return coverage;
  const role = String(node.role ?? '').toLowerCase();
  if (role.includes('source')) return theme.obs;
  if (role.includes('core') || role.includes('transformation')) return theme.qual;
  if (role.includes('consumption') || role.includes('fact') || role.includes('dimension')) return theme.cont;
  return theme.line2;
}

export function LineageMiniGraph({ subgraph }: LineageMiniGraphProps) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ref.current || subgraph.nodes.length === 0) return undefined;

    const theme = resolveTheme();
    const cy = Cytoscape({
      container: ref.current,
      elements: {
        nodes: subgraph.nodes.map(node => ({
          data: {
            ...node,
            id: node.id,
            label: lineageNodeLabel(node),
            color: nodeColor(node, theme),
          },
        })),
        edges: subgraph.edges.map((edge, index) => ({
          data: {
            ...edge,
            id: edge.id || `${edge.source}->${edge.target}:${index}`,
            source: edge.source,
            target: edge.target,
          },
        })),
      },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'shape': 'roundrectangle',
            'background-color': theme.bg2,
            'border-color': 'data(color)',
            'border-width': 2,
            'color': theme.fg,
            'font-family': theme.fontMono,
            'font-size': 10,
            'font-weight': 600,
            'height': 30,
            'padding': 8,
            'text-halign': 'center',
            'text-valign': 'center',
            'text-max-width': '120px',
            'text-wrap': 'ellipsis',
            'width': 'label',
          } as Record<string, unknown>,
        },
        {
          selector: 'edge',
          style: {
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            'line-color': theme.line2,
            'target-arrow-color': theme.line2,
            'target-arrow-shape': 'triangle',
            'width': 1.4,
          } as Record<string, unknown>,
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': theme.cont,
            'border-color': theme.fg2,
          } as Record<string, unknown>,
        },
      ],
      layout: { name: 'preset' },
      maxZoom: 2.2,
      minZoom: 0.25,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node', event => {
      const id = String(event.target.id());
      if (id) navigate(`/objects/${encodeURIComponent(id)}`);
    });

    cy.layout({
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 36,
      rankSep: 76,
      fit: true,
      padding: 26,
    } as Cytoscape.LayoutOptions).run();

    window.setTimeout(() => {
      if (!cy.destroyed()) cy.fit(undefined, 26);
    }, 0);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(() => {
        cy.resize();
        cy.fit(undefined, 26);
      });
      ro.observe(ref.current);
    }

    return () => {
      ro?.disconnect();
      cy.destroy();
    };
  }, [navigate, subgraph]);

  if (subgraph.nodes.length === 0) {
    return (
      <div style={{ color: 'var(--fg-3)', fontSize: 12, padding: 24, textAlign: 'center' }}>
        No lineage nodes.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="lineage-mini-graph"
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        height: 360,
        minHeight: 320,
        overflow: 'hidden',
        width: '100%',
      }}
    />
  );
}

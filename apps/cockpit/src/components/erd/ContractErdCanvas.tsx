import { useEffect, useRef } from 'react';
import Cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { formatNodeLabel, type ErdModel, type ErdNode } from '@/lib/erd';

Cytoscape.use(dagre as Parameters<typeof Cytoscape.use>[0]);

interface Props {
  model: ErdModel;
  onSelect?: (node: ErdNode | null) => void;
}

interface ThemeTokens {
  bg1: string; bg2: string; fg: string; fg2: string; fg3: string;
  line: string; line2: string; cont: string; obs: string; qual: string;
  statusWarn: string; statusFail: string; fontMono: string;
}

// Spiegelt das Vorgehen aus LineageMiniGraph: Theme-Tokens zur Laufzeit aus den
// CSS-Variablen lesen, damit der Canvas dem aktiven Theme folgt.
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
    statusWarn: cssVar('--status-warn', '#d97706'),
    statusFail: cssVar('--status-fail', '#c44444'),
    fontMono: cssVar('--font-mono', "'JetBrains Mono', monospace"),
  };
}

function borderColor(node: ErdNode, theme: ThemeTokens): string {
  if (node.external) return theme.fg3;
  if (node.kind === 'provider_contract') return theme.qual;
  if (node.kind === 'internal_gate') return theme.obs;
  return theme.cont; // consumer_contract
}

export function ContractErdCanvas({ model, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current || model.nodes.length === 0) return undefined;
    const theme = resolveTheme();

    const cy = Cytoscape({
      container: ref.current,
      elements: {
        nodes: model.nodes.map(node => ({
          data: {
            id: node.id,
            label: formatNodeLabel(node),
            color: borderColor(node, theme),
            bg: node.external ? theme.bg1 : theme.bg2,
            external: node.external,
          },
        })),
        edges: model.edges.map(edge => ({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            color: edge.severity === 'fail' || edge.severity === 'critical'
              ? theme.statusFail
              : edge.severity === 'warn' ? theme.statusWarn : theme.line2,
          },
        })),
      },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'shape': 'roundrectangle',
            'background-color': 'data(bg)',
            'border-color': 'data(color)',
            'border-width': 2,
            'color': theme.fg,
            'font-family': theme.fontMono,
            'font-size': 10,
            'line-height': 1.4,
            'text-halign': 'center',
            'text-valign': 'center',
            'text-justification': 'left',
            'text-wrap': 'wrap',
            'padding': 10,
            'width': 'label',
            'height': 'label',
          } as Record<string, unknown>,
        },
        {
          selector: 'node[?external]',
          style: { 'border-style': 'dashed' } as Record<string, unknown>,
        },
        {
          selector: 'edge',
          style: {
            'label': 'data(label)',
            'font-family': theme.fontMono,
            'font-size': 9,
            'color': theme.fg2,
            'text-background-color': theme.bg1,
            'text-background-opacity': 1,
            'text-background-padding': '2px',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'width': 1.4,
          } as Record<string, unknown>,
        },
        {
          selector: 'node:selected',
          style: { 'border-color': theme.fg, 'border-width': 3 } as Record<string, unknown>,
        },
      ],
      layout: { name: 'preset' },
      maxZoom: 2.2,
      minZoom: 0.2,
      wheelSensitivity: 0.2,
    });

    const byId = new Map(model.nodes.map(n => [n.id, n]));
    cy.on('tap', 'node', event => {
      const node = byId.get(String(event.target.id()));
      if (node) onSelectRef.current?.(node);
    });
    cy.on('tap', event => {
      if (event.target === cy) onSelectRef.current?.(null);
    });

    // Mit Beziehungen: gerichtetes dagre-Layout (FK-Fluss von links nach rechts).
    // Ohne Kanten würde dagre alle Knoten in eine Spalte stapeln — dann kacheln
    // wir sie stattdessen als Raster.
    const layout: Cytoscape.LayoutOptions = model.edges.length > 0
      ? ({ name: 'dagre', rankDir: 'LR', nodeSep: 48, rankSep: 110, fit: true, padding: 30 } as Cytoscape.LayoutOptions)
      : ({ name: 'grid', avoidOverlap: true, avoidOverlapPadding: 24, fit: true, padding: 30 } as Cytoscape.LayoutOptions);
    cy.layout(layout).run();

    window.setTimeout(() => { if (!cy.destroyed()) cy.fit(undefined, 30); }, 0);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(() => { cy.resize(); cy.fit(undefined, 30); });
      ro.observe(ref.current);
    }

    return () => { ro?.disconnect(); cy.destroy(); };
  }, [model]);

  return (
    <div
      ref={ref}
      data-testid="contract-erd-canvas"
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        height: '100%',
        minHeight: 420,
        overflow: 'hidden',
        width: '100%',
      }}
    />
  );
}

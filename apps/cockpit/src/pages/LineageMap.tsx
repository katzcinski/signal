import { useNavigate } from 'react-router-dom';
import { useLineage } from '@/api/lineage';
import type { LineageNode } from '@/types';

const FAMILY_COLOR: Record<string, string> = {
  observability: 'var(--obs)',
  quality:       'var(--qual)',
  contract:      'var(--cont)',
};

const LAYER_X = [80, 300, 520];
const NODE_W = 150;
const NODE_H = 36;
const LAYER_SPACING_Y = 70;

function layoutNodes(nodes: LineageNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const byLayer: Record<number, LineageNode[]> = {};
  nodes.forEach(n => { byLayer[n.layer] = [...(byLayer[n.layer] ?? []), n]; });
  Object.entries(byLayer).forEach(([layer, ns]) => {
    const lx = LAYER_X[Number(layer)] ?? Number(layer) * 220 + 80;
    const totalH = (ns.length - 1) * LAYER_SPACING_Y;
    ns.forEach((n, i) => {
      positions.set(n.id, { x: lx, y: 60 + i * LAYER_SPACING_Y - totalH / 2 + 120 });
    });
  });
  return positions;
}

export default function LineageMap() {
  const { data, isLoading } = useLineage();
  const navigate = useNavigate();

  if (isLoading || !data) return <div style={{ color: 'var(--fg-3)', padding: 24 }}>Loading…</div>;

  const positions = layoutNodes(data.nodes);
  const svgH = Math.max(...Array.from(positions.values()).map(p => p.y)) + 80;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Lineage Map</h1>
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'auto' }}>
        <svg width="720" height={svgH} style={{ display: 'block', padding: 20 }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--line-2)" />
            </marker>
          </defs>
          {data.edges.map(e => {
            const s = positions.get(e.source);
            const t = positions.get(e.target);
            if (!s || !t) return null;
            const sx = s.x + NODE_W;
            const sy = s.y + NODE_H / 2;
            const tx = t.x;
            const ty = t.y + NODE_H / 2;
            const mx = (sx + tx) / 2;
            return (
              <path
                key={e.id}
                d={`M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`}
                fill="none" stroke="var(--line-2)" strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {data.nodes.map(n => {
            const pos = positions.get(n.id);
            if (!pos) return null;
            const color = FAMILY_COLOR[n.family] ?? 'var(--fg-3)';
            return (
              <g
                key={n.id}
                onClick={() => navigate(`/objects/${n.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
                  rx={5} ry={5}
                  fill="var(--bg-2)" stroke={color} strokeWidth={1.5}
                />
                <rect x={pos.x} y={pos.y} width={3} height={NODE_H} rx={2} fill={color} />
                <text
                  x={pos.x + 12} y={pos.y + NODE_H / 2 + 4}
                  fill="var(--fg)" fontSize={10}
                  fontFamily="var(--font-mono)"
                >
                  {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

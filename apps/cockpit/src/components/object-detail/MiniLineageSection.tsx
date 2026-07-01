import { Link, useNavigate } from 'react-router-dom';
import { useLineage } from '@/api/lineage';
import { t } from '@/i18n/de';
import { MiniLineageSkeleton } from './ObjectDetailSkeletons';

const BOX_W = 144;
const BOX_H = 34;
const H_GAP = 56;
const V_GAP = 10;

function colH(count: number): number {
  return Math.max(1, count) * (BOX_H + V_GAP) - V_GAP;
}

function boxY(svgH: number, idx: number, total: number): number {
  const totalH = colH(total);
  return (svgH - totalH) / 2 + idx * (BOX_H + V_GAP);
}

function truncate(s: string, max = 17): string {
  return s.length > max ? s.slice(0, max - 1) + '...' : s;
}

function FullLineageLink({ focusId }: { focusId: string }) {
  return (
    <Link
      to={`/lineage?focus=${encodeURIComponent(focusId)}`}
      style={{ color: 'var(--cont)', fontSize: 11 }}
    >
      {t.objectDetail.lineageOpenFull}
    </Link>
  );
}

function SparseState({
  focusId,
  title,
  detail,
}: {
  focusId: string;
  title: string;
  detail: string;
}) {
  return (
    <div
      data-testid="mini-lineage-sparse"
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--bg-2)',
        padding: 'var(--s5)',
        display: 'grid',
        gap: 'var(--s3)',
      }}
    >
      <div>
        <div style={{
          color: 'var(--fg)',
          fontSize: 'var(--fs-body)',
          lineHeight: 'var(--lh-body)',
          fontWeight: 700,
        }}>
          {title}
        </div>
        <div style={{
          color: 'var(--fg-3)',
          fontSize: 'var(--fs-meta)',
          lineHeight: 'var(--lh-meta)',
          marginTop: 4,
        }}>
          {detail}
        </div>
      </div>
      <div>
        <FullLineageLink focusId={focusId} />
      </div>
    </div>
  );
}

export function MiniLineageSection({ focusId }: { focusId: string }) {
  const { data: graph, isLoading } = useLineage({ seeds: [focusId], depth: 1, enabled: !!focusId });
  const navigate = useNavigate();

  if (isLoading) {
    return <MiniLineageSkeleton />;
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <SparseState
        focusId={focusId}
        title={t.objectDetail.lineageEmptyTitle}
        detail={t.objectDetail.lineageEmptyDetail}
      />
    );
  }

  const { nodes, edges } = graph;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const max = 5;
  const predIds = [...new Set(edges.filter(e => e.target === focusId).map(e => e.source))].slice(0, max);
  const succIds = [...new Set(edges.filter(e => e.source === focusId).map(e => e.target))].slice(0, max);
  const focusNode = nodeMap.get(focusId);

  if (predIds.length === 0 && succIds.length === 0) {
    return (
      <SparseState
        focusId={focusId}
        title={t.objectDetail.lineageFocusedTitle}
        detail={t.objectDetail.lineageFocusedDetail}
      />
    );
  }

  const hasPreds = predIds.length > 0;
  const hasSuccs = succIds.length > 0;
  const svgH = Math.max(colH(predIds.length), BOX_H, colH(succIds.length)) + 20;
  const focusX = hasPreds ? BOX_W + H_GAP : 0;
  const succX = focusX + BOX_W + H_GAP;
  const svgW = hasSuccs ? succX + BOX_W : focusX + BOX_W;
  const focusY = (svgH - BOX_H) / 2;

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  };

  return (
    <div data-testid="mini-lineage-dag">
      <svg
        width={svgW}
        height={svgH}
        style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
        aria-label={`Lineage: ${focusId}`}
      >
        <defs>
          <marker id="mini-dag-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="var(--fg-3)" opacity={0.5} />
          </marker>
        </defs>

        {predIds.map((pid, i) => (
          <path
            key={pid}
            d={curve(BOX_W, boxY(svgH, i, predIds.length) + BOX_H / 2, focusX, focusY + BOX_H / 2)}
            stroke="var(--line-2)"
            strokeWidth={1.5}
            fill="none"
            markerEnd="url(#mini-dag-arr)"
          />
        ))}

        {succIds.map((sid, i) => (
          <path
            key={sid}
            d={curve(focusX + BOX_W, focusY + BOX_H / 2, succX, boxY(svgH, i, succIds.length) + BOX_H / 2)}
            stroke="var(--line-2)"
            strokeWidth={1.5}
            fill="none"
            markerEnd="url(#mini-dag-arr)"
          />
        ))}

        {predIds.map((pid, i) => {
          const y = boxY(svgH, i, predIds.length);
          const nd = nodeMap.get(pid);
          return (
            <g
              key={pid}
              transform={`translate(0,${y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/objects/${pid}`)}
            >
              <rect width={BOX_W} height={BOX_H} rx={4} fill="var(--bg-2)" stroke="var(--line)" strokeWidth={1} />
              <text x={BOX_W / 2} y={BOX_H / 2 + 4} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--fg-2)">
                {truncate(nd?.label ?? pid)}
              </text>
            </g>
          );
        })}

        <g transform={`translate(${focusX},${focusY})`}>
          <rect width={BOX_W} height={BOX_H} rx={4} fill="var(--cont)" />
          <text x={BOX_W / 2} y={BOX_H / 2 + 4} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="#fff" fontWeight="bold">
            {truncate(focusNode?.label ?? focusId)}
          </text>
        </g>

        {succIds.map((sid, i) => {
          const y = boxY(svgH, i, succIds.length);
          const nd = nodeMap.get(sid);
          return (
            <g
              key={sid}
              transform={`translate(${succX},${y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/objects/${sid}`)}
            >
              <rect width={BOX_W} height={BOX_H} rx={4} fill="var(--bg-2)" stroke="var(--line)" strokeWidth={1} />
              <text x={BOX_W / 2} y={BOX_H / 2 + 4} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--fg-2)">
                {truncate(nd?.label ?? sid)}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <FullLineageLink focusId={focusId} />
      </div>
    </div>
  );
}

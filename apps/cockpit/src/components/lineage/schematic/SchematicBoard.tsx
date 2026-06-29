/**
 * Präsentationaler SVG-Renderer fürs Schaltplan-Board.
 *
 * Kontrolliert: nimmt ein fertig berechnetes ELK-Layout plus Trace-/Auswahl-
 * State und Callbacks entgegen, hält selbst keinen Zustand und ruft kein ELK.
 * So bleibt das Rendering testbar; der stateful Container (ELK-Aufruf,
 * Trace-Berechnung, Inspector) kommt in Phase 4 obendrauf.
 */
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { columnId, edgeTypeColor } from '@/lib/lineage';
import type { PositionedChip, RoutedEdge, RoutedObjectEdge, SchematicLayout } from './layout';
import { GEO } from './layout';
import { dqStatusColor, laneColor, orthogonalPath } from './theme';

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const DRAG_THRESHOLD = 4; // px in Screen-Koordinaten

interface Viewport {
  x: number;
  y: number;
  k: number;
}

/** Client-Pixel → SVG-User-Koordinaten (berücksichtigt die viewBox-Skalierung). */
function clientToUser(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export interface SchematicBoardProps {
  layout: SchematicLayout;
  /** Pin-Keys (columnId) des aktiven Trace-Pfads. */
  tracePins?: Set<string>;
  /** Kanten-IDs des aktiven Trace-Pfads. */
  traceEdges?: Set<string>;
  /** Chips, die durch Filter/Suche ausgegraut sind. */
  dimmedChips?: Set<string>;
  selectedChip?: string | null;
  selectedPin?: { node: string; pin: string } | null;
  onSelectChip?: (nodeId: string) => void;
  onSelectPin?: (nodeId: string, pinId: string) => void;
  onBackground?: () => void;
}

export function SchematicBoard({
  layout,
  tracePins,
  traceEdges,
  dimmedChips,
  selectedChip,
  selectedPin,
  onSelectChip,
  onSelectPin,
  onBackground,
}: SchematicBoardProps) {
  const gridId = useId();
  const shadowId = useId();
  const tracing = !!tracePins && tracePins.size > 0;
  const isDimmedChip = (id: string) => !!dimmedChips && dimmedChips.has(id);

  const W = Math.max(layout.width, 1);
  const H = Math.max(layout.height, 1);

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  // Pan-State: letzter Punkt (User-Koordinaten) + ob die Geste schon ein Zug ist.
  const panRef = useRef<{ lastX: number; lastY: number; startClientX: number; startClientY: number } | null>(null);
  const movedRef = useRef(false);

  // Drag wandert über einen Pin/Chip hinweg: Auswahl unterdrücken, wenn gerade
  // panned wurde (der Klick nach pointerup darf nicht selektieren/deselektieren).
  const guard = useCallback(
    <A extends unknown[]>(fn?: (...args: A) => void) =>
      (...args: A) => {
        if (movedRef.current) return;
        fn?.(...args);
      },
    [],
  );

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView(v => {
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
      if (k === v.k) return v;
      // Weltpunkt unter dem Cursor fixieren.
      const wx = (cx - v.x) / v.k;
      const wy = (cy - v.y) / v.k;
      return { k, x: cx - wx * k, y: cy - wy * k };
    });
  }, []);

  // Wheel-Zoom als non-passiver Listener, damit preventDefault das Seiten-
  // Scrollen unterbindet (React onWheel ist passiv).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = clientToUser(svg, e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    movedRef.current = false;
    const p = clientToUser(svg, e.clientX, e.clientY);
    panRef.current = { lastX: p.x, lastY: p.y, startClientX: e.clientX, startClientY: e.clientY };
    svg.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    const svg = svgRef.current;
    if (!pan || !svg) return;
    if (
      !movedRef.current &&
      Math.hypot(e.clientX - pan.startClientX, e.clientY - pan.startClientY) < DRAG_THRESHOLD
    ) {
      return;
    }
    movedRef.current = true;
    const p = clientToUser(svg, e.clientX, e.clientY);
    const dx = p.x - pan.lastX;
    const dy = p.y - pan.lastY;
    pan.lastX = p.x;
    pan.lastY = p.y;
    setView(v => ({ ...v, x: v.x + dx * v.k, y: v.y + dy * v.k }));
  };

  const endPan = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (svg && svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    panRef.current = null;
  };

  const zoomIn = () => zoomAt(1.25, W / 2, H / 2);
  const zoomOut = () => zoomAt(1 / 1.25, W / 2, H / 2);
  const fit = () => setView({ x: 0, y: 0, k: 1 });

  return (
    <div className="schem-stage">
      <svg
        ref={svgRef}
        className="schem-board"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Schematic lineage"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <defs>
          <pattern id={gridId} width={26} height={26} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--line)" opacity={0.32} />
          </pattern>
          {/* Weiche Schlagschatten geben den Chips Tiefe statt flacher Rechtecke. */}
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx={0} dy={3} stdDeviation={4} floodColor="#000" floodOpacity={0.42} />
          </filter>
        </defs>

        <g className="schem-viewport" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* Großzügiges Raster, damit beim Pannen kein leerer Rand entsteht. */}
          <rect
            x={-W}
            y={-H}
            width={W * 3}
            height={H * 3}
            fill={`url(#${gridId})`}
            onClick={guard(onBackground)}
          />

          {/* Traces unter den Chips, damit Pin-Dots die Endpunkte überdecken. */}
          <g className="schem-traces">
            {layout.mode === 'column'
              ? layout.edges.map(edge => (
                  <ColumnTrace
                    key={edge.id}
                    edge={edge}
                    active={!!traceEdges && traceEdges.has(edge.id)}
                    dimmed={
                      isDimmedChip(edge.fromNode) ||
                      isDimmedChip(edge.toNode) ||
                      (tracing && !(traceEdges && traceEdges.has(edge.id)))
                    }
                  />
                ))
              : layout.objectEdges.map(edge => (
                  <ObjectTrace
                    key={edge.id}
                    edge={edge}
                    dimmed={isDimmedChip(edge.fromNode) || isDimmedChip(edge.toNode)}
                  />
                ))}
          </g>

          <g className="schem-chips">
            {layout.chips.map(chip => (
              <Chip
                key={chip.id}
                chip={chip}
                mode={layout.mode}
                shadowId={shadowId}
                dimmed={isDimmedChip(chip.id)}
                selected={selectedChip === chip.id}
                tracePins={tracePins}
                selectedPin={selectedPin}
                onSelectChip={guard(onSelectChip)}
                onSelectPin={guard(onSelectPin)}
              />
            ))}
          </g>
        </g>
      </svg>

      <div className="schem-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={zoomIn} aria-label="Vergrößern">+</button>
        <button type="button" onClick={zoomOut} aria-label="Verkleinern">−</button>
        <button type="button" onClick={fit} aria-label="Ansicht zurücksetzen">⤢</button>
      </div>
    </div>
  );
}

function ColumnTrace({ edge, active, dimmed }: { edge: RoutedEdge; active: boolean; dimmed: boolean }) {
  const cls =
    'schem-trace' +
    (edge.kind === 'derived' ? ' is-derived' : '') +
    (active ? ' is-active' : '') +
    (dimmed ? ' is-dimmed' : '');
  return (
    <path className={cls} d={orthogonalPath(edge.points)} stroke={edge.color || edgeTypeColor(edge.edgeType)}>
      <title>
        {`${edge.fromNode}.${edge.fromPin} → ${edge.toNode}.${edge.toPin}`}
        {edge.expression ? ` · ${edge.expression}` : ''}
      </title>
    </path>
  );
}

function ObjectTrace({ edge, dimmed }: { edge: RoutedObjectEdge; dimmed: boolean }) {
  return (
    <path className={'schem-obj-trace' + (dimmed ? ' is-dimmed' : '')} d={orthogonalPath(edge.points)}>
      <title>{`${edge.fromNode} → ${edge.toNode}`}</title>
    </path>
  );
}

interface ChipProps {
  chip: PositionedChip;
  mode: 'column' | 'object';
  shadowId: string;
  dimmed: boolean;
  selected: boolean;
  tracePins?: Set<string>;
  selectedPin?: { node: string; pin: string } | null;
  onSelectChip?: (nodeId: string) => void;
  onSelectPin?: (nodeId: string, pinId: string) => void;
}

function Chip({ chip, mode, shadowId, dimmed, selected, tracePins, selectedPin, onSelectChip, onSelectPin }: ChipProps) {
  const clipId = useId();
  const cls = 'schem-chip' + (selected ? ' is-selected' : '') + (dimmed ? ' is-dimmed' : '');
  const tagText = `${chip.layer.toUpperCase()}${chip.system ? ` · ${chip.system}` : ''}`;
  const dqColor = chip.dqStatus ? dqStatusColor(chip.dqStatus) : null;
  const dotY = mode === 'object' ? 20 : 32;
  const lane = laneColor(chip.laneOrder);
  // Spalten-Chips bekommen ein abgesetztes Kopfband; Objekt-Chips sind nur Kopf.
  const headerH = mode === 'column' ? 58 : chip.height;
  const selectChip = () => onSelectChip?.(chip.id);
  const selectPin = (event: MouseEvent<SVGElement>, pinId: string) => {
    event.stopPropagation();
    onSelectPin?.(chip.id, pinId);
  };

  return (
    <g className={cls} transform={`translate(${chip.x}, ${chip.y})`} onClick={selectChip} style={{ cursor: 'pointer' }}>
      <clipPath id={clipId}>
        <rect x={0} y={0} width={chip.width} height={chip.height} rx={7} />
      </clipPath>
      <rect
        className="schem-chip-body"
        x={0}
        y={0}
        width={chip.width}
        height={chip.height}
        rx={7}
        filter={`url(#${shadowId})`}
      />
      {/* Kopfband, Lane-Akzent und Trennlinie, an die gerundeten Ecken geklippt. */}
      <g clipPath={`url(#${clipId})`}>
        <rect className="schem-chip-header" x={0} y={0} width={chip.width} height={headerH} />
        <rect className="schem-lane" x={0} y={0} width={chip.width} height={3} fill={lane} />
        {mode === 'column' && (
          <line className="schem-divider" x1={0} y1={headerH} x2={chip.width} y2={headerH} />
        )}
      </g>

      <text className="schem-tag" x={13} y={20}>
        {tagText}
      </text>
      <text
        className="schem-title"
        x={13}
        y={38}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {chip.label}
      </text>
      {mode === 'object' && (
        <text className="schem-sub" x={13} y={53}>
          {`${chip.pins.length} cols`}
        </text>
      )}

      {/* Status-/Contract-Dots oben rechts. */}
      {dqColor && (
        <circle cx={chip.width - 14} cy={dotY} r={4} fill={dqColor}>
          <title>{`DQ: ${chip.dqStatus}`}</title>
        </circle>
      )}
      {chip.hasContract && (
        <circle cx={chip.width - (dqColor ? 28 : 14)} cy={dotY} r={4} fill="var(--cont)">
          <title>Contract bound</title>
        </circle>
      )}

      {mode === 'column' &&
        chip.pins.map(pin => {
          const key = columnId(chip.id, pin.id);
          const active =
            (!!tracePins && tracePins.has(key)) ||
            (!!selectedPin && selectedPin.node === chip.id && selectedPin.pin === pin.id);
          return (
            <g key={pin.id}>
              <rect
                className="schem-pin-rowbg"
                x={1}
                y={pin.rowY - 13}
                width={chip.width - 2}
                height={GEO.pinRowH}
                style={{ cursor: 'pointer' }}
                onClick={(event) => selectPin(event, pin.id)}
              >
                <title>{`${chip.label}.${pin.id}`}</title>
              </rect>
              <text
                className={'schem-pin-label' + (active ? ' is-active' : '')}
                x={22}
                y={pin.rowY + 3.5}
                style={{ fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                onClick={(event) => selectPin(event, pin.id)}
              >
                {pin.label}
              </text>
              {pin.dataType && (
                <text className="schem-pin-type" x={chip.width - 10} y={pin.rowY + 3.5} textAnchor="end">
                  {pin.dataType}
                </text>
              )}
              {pin.hasIncoming && (
                <circle
                  className={'schem-pin-dot' + (active ? ' is-active' : '')}
                  cx={0}
                  cy={pin.rowY}
                  r={3.4}
                  fill={active ? 'var(--cont)' : 'var(--fg-3)'}
                />
              )}
              {pin.hasOutgoing && (
                <circle
                  className={'schem-pin-dot' + (active ? ' is-active' : '')}
                  cx={chip.width}
                  cy={pin.rowY}
                  r={3.4}
                  fill={active ? 'var(--cont)' : 'var(--fg-3)'}
                />
              )}
            </g>
          );
        })}
    </g>
  );
}

/**
 * Präsentationaler SVG-Renderer fürs Schaltplan-Board.
 *
 * Kontrolliert: nimmt ein fertig berechnetes ELK-Layout plus Trace-/Auswahl-
 * State und Callbacks entgegen, hält selbst keinen Zustand und ruft kein ELK.
 * So bleibt das Rendering testbar; der stateful Container (ELK-Aufruf,
 * Trace-Berechnung, Inspector) kommt in Phase 4 obendrauf.
 */
import { useId } from 'react';
import { columnId, edgeTypeColor } from '@/lib/lineage';
import type { PositionedChip, RoutedEdge, RoutedObjectEdge, SchematicLayout } from './layout';
import { GEO } from './layout';
import { dqStatusColor, laneColor, orthogonalPath } from './theme';

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
  const tracing = !!tracePins && tracePins.size > 0;
  const isDimmedChip = (id: string) => !!dimmedChips && dimmedChips.has(id);

  return (
    <svg
      className="schem-board"
      viewBox={`0 0 ${Math.max(layout.width, 1)} ${Math.max(layout.height, 1)}`}
      width={layout.width}
      height={layout.height}
      role="img"
      aria-label="Schematic lineage"
    >
      <defs>
        <pattern id={gridId} width={24} height={24} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={1} fill="var(--line)" opacity={0.5} />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width={Math.max(layout.width, 1)}
        height={Math.max(layout.height, 1)}
        fill={`url(#${gridId})`}
        onClick={onBackground}
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
            dimmed={isDimmedChip(chip.id)}
            selected={selectedChip === chip.id}
            tracePins={tracePins}
            selectedPin={selectedPin}
            onSelectChip={onSelectChip}
            onSelectPin={onSelectPin}
          />
        ))}
      </g>
    </svg>
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
  dimmed: boolean;
  selected: boolean;
  tracePins?: Set<string>;
  selectedPin?: { node: string; pin: string } | null;
  onSelectChip?: (nodeId: string) => void;
  onSelectPin?: (nodeId: string, pinId: string) => void;
}

function Chip({ chip, mode, dimmed, selected, tracePins, selectedPin, onSelectChip, onSelectPin }: ChipProps) {
  const cls = 'schem-chip' + (selected ? ' is-selected' : '') + (dimmed ? ' is-dimmed' : '');
  const tagText = `${chip.layer.toUpperCase()}${chip.system ? ` · ${chip.system}` : ''}`;
  const dqColor = chip.dqStatus ? dqStatusColor(chip.dqStatus) : null;
  const dotY = mode === 'object' ? 20 : 32;

  return (
    <g className={cls} transform={`translate(${chip.x}, ${chip.y})`}>
      <rect className="schem-chip-body" x={0} y={0} width={chip.width} height={chip.height} rx={5} />
      <rect x={0} y={0} width={chip.width} height={3} rx={1.5} fill={laneColor(chip.laneOrder)} />

      <text className="schem-tag" x={12} y={18}>
        {tagText}
      </text>
      <text
        className="schem-title"
        x={12}
        y={36}
        style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
        onClick={() => onSelectChip?.(chip.id)}
      >
        {chip.label}
      </text>
      {mode === 'object' && (
        <text className="schem-sub" x={12} y={52}>
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
                onClick={() => onSelectPin?.(chip.id, pin.id)}
              >
                <title>{`${chip.label}.${pin.id}`}</title>
              </rect>
              <text
                className={'schem-pin-label' + (active ? ' is-active' : '')}
                x={22}
                y={pin.rowY + 3.5}
                style={{ fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                onClick={() => onSelectPin?.(chip.id, pin.id)}
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

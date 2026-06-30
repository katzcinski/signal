/**
 * ELK-Layout fürs Schaltplan-Board.
 *
 * Wandelt das Schaltplan-Modell (Chips/Pins/Traces) in einen ELK-Graphen mit
 * Ports pro Pin (WEST = Eingang, EAST = Ausgang) und lässt ELK Layered +
 * orthogonales Routing rechnen. Ergebnis: positionierte Chips, Pin-Reihen-Y und
 * Polyline-Punkte je Trace fürs SVG.
 *
 * Aufgeteilt in pure Funktionen (buildElkGraph / mapElkResult) und den async
 * Runner (layoutSchematic), damit Graph-Aufbau und Ergebnis-Mapping ohne
 * laufende ELK-Engine deterministisch unit-testbar bleiben.
 */
import ELK, { type ELK as ElkInstance, type ElkNode, type ElkPort } from 'elkjs/lib/elk.bundled.js';
import type { ObjectEdge, SchematicChip, SchematicEdge, SchematicModel, SchematicPin } from './model';

/** Knoten-IDs, deren Spalten (Pins) ausgeklappt sind. */
export type ExpandedSet = ReadonlySet<string>;

/** Geometrie — an das Mockup angelehnt. */
export const GEO = {
  nodeWidth: 240,
  headerH: 58,
  padTop: 10,
  padBottom: 14,
  pinRowH: 26,
  objHeight: 64,
} as const;

export function chipHeight(pinCount: number): number {
  return GEO.headerH + GEO.padTop + pinCount * GEO.pinRowH + GEO.padBottom;
}

/** Y-Mitte einer Pin-Reihe relativ zur Chip-Oberkante. */
export function pinRowY(index: number): number {
  return GEO.headerH + GEO.padTop + index * GEO.pinRowH + GEO.pinRowH / 2;
}

// Stabile ID-Bausteine für ELK-Ports/-Kanten. ':' als Separator (Pin- und
// Objekt-IDs enthalten keine Doppelpunkte).
const SEP = ':';
const westPortId = (node: string, pin: string) => `${node}${SEP}${pin}${SEP}W`;
const eastPortId = (node: string, pin: string) => `${node}${SEP}${pin}${SEP}E`;
const OBJ_EDGE = 'objedge';
const objEdgeId = (from: string, to: string) => `${OBJ_EDGE}${SEP}${from}${SEP}${to}`;

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  // Layer-Bänder über laneOrder erzwingen, statt ELK rein topologisch ordnen
  // zu lassen — Source/Harmonization/Business fallen so in stabile x-Spalten.
  'elk.partitioning.activate': 'true',
  'elk.layered.spacing.nodeNodeBetweenLayers': '130',
  'elk.spacing.nodeNode': '36',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.semiInteractive': 'true',
};

export interface EdgePartition {
  /** Pin-zu-Pin-Kanten zwischen Paaren, deren beide Enden ausgeklappt sind. */
  columnEdges: SchematicEdge[];
  /** Aggregierte Objekt-Kanten für alle übrigen Paare. */
  objectPairs: ObjectEdge[];
}

const pairKey = (from: string, to: string) => `${from}${SEP}${to}`;

/**
 * Teilt die Kanten nach Ausklapp-Zustand auf. Pure — von buildElkGraph und
 * mapElkResult gemeinsam genutzt, damit Graph-Aufbau und Mapping nie driften:
 * ein Paar wird genau dann pin-genau gezeichnet, wenn beide Enden ausgeklappt
 * sind UND echte Column-Edges existieren; sonst als eine Objekt-Kante.
 */
export function partitionEdges(model: SchematicModel, expanded: ExpandedSet): EdgePartition {
  const colByPair = new Map<string, SchematicEdge[]>();
  for (const e of model.edges) {
    const key = pairKey(e.fromNode, e.toNode);
    const list = colByPair.get(key);
    if (list) list.push(e);
    else colByPair.set(key, [e]);
  }

  const columnEdges: SchematicEdge[] = [];
  const objectPairs: ObjectEdge[] = [];
  for (const pair of model.objectEdges) {
    const cols = colByPair.get(pairKey(pair.from, pair.to));
    if (cols && expanded.has(pair.from) && expanded.has(pair.to)) {
      columnEdges.push(...cols);
    } else {
      objectPairs.push(pair);
    }
  }
  return { columnEdges, objectPairs };
}

/**
 * Baut den ELK-Eingabegraphen. Pure — keine ELK-Ausführung. Hybrid: jeder Chip
 * ist ausgeklappt (Ports je Pin, Kanten Port→Port) oder eingeklappt (portlos,
 * aggregierte Objekt-Kante).
 */
export function buildElkGraph(model: SchematicModel, expanded: ExpandedSet): ElkNode {
  const children: ElkNode[] = model.chips.map(chip => {
    const isOpen = expanded.has(chip.id);
    const ports: ElkPort[] = [];
    if (isOpen) {
      chip.pins.forEach((pin, idx) => {
        const y = pinRowY(idx);
        if (pin.hasIncoming) ports.push(port(westPortId(chip.id, pin.id), 'WEST', 0, y));
        if (pin.hasOutgoing) ports.push(port(eastPortId(chip.id, pin.id), 'EAST', GEO.nodeWidth, y));
      });
    }
    return {
      id: chip.id,
      width: GEO.nodeWidth,
      height: isOpen ? chipHeight(chip.pins.length) : GEO.objHeight,
      layoutOptions: {
        ...(isOpen ? { 'elk.portConstraints': 'FIXED_POS' } : {}),
        'elk.partitioning.partition': String(chip.laneOrder),
      },
      ports,
    };
  });

  const { columnEdges, objectPairs } = partitionEdges(model, expanded);
  const edges = [
    ...columnEdges.map(e => ({
      id: e.id,
      sources: [eastPortId(e.fromNode, e.fromPin)],
      targets: [westPortId(e.toNode, e.toPin)],
    })),
    ...objectPairs.map(e => ({
      id: objEdgeId(e.from, e.to),
      sources: [e.from],
      targets: [e.to],
    })),
  ];

  return { id: 'root', layoutOptions: ROOT_OPTIONS, children, edges };
}

function port(id: string, side: 'WEST' | 'EAST', x: number, y: number): ElkPort {
  return { id, x, y, width: 1, height: 1, layoutOptions: { 'elk.port.side': side } };
}

// ---- Ergebnis-Mapping ----

export interface PositionedPin extends SchematicPin {
  /** Reihen-Y relativ zur Chip-Oberkante. */
  rowY: number;
}

export interface PositionedChip extends Omit<SchematicChip, 'pins'> {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Sind die Spalten dieses Chips ausgeklappt? */
  expanded: boolean;
  pins: PositionedPin[];
}

export interface RoutedEdge extends SchematicEdge {
  /** Absolute Polyline-Punkte (orthogonal) für den <path>. */
  points: Array<{ x: number; y: number }>;
}

/** Aggregierte Objekt-zu-Objekt-Kante im Object-Mode. */
export interface RoutedObjectEdge {
  id: string;
  fromNode: string;
  toNode: string;
  points: Array<{ x: number; y: number }>;
}

export interface SchematicLayout {
  chips: PositionedChip[];
  /** Pin-zu-Pin-Traces (zwischen ausgeklappten Paaren). */
  edges: RoutedEdge[];
  /** Aggregierte Objekt-Traces (alle übrigen Paare). */
  objectEdges: RoutedObjectEdge[];
  width: number;
  height: number;
}

function sectionPoints(node: ElkNode, edgeId: string): Array<{ x: number; y: number }> {
  const edge = (node.edges ?? []).find(e => e.id === edgeId);
  const section = edge?.sections?.[0];
  if (!section) return [];
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(p => ({
    x: p.x,
    y: p.y,
  }));
}

/**
 * Mappt das ELK-Ergebnis zurück aufs Schaltplan-Modell. Pure — nimmt den von
 * ELK befüllten Graphen und das Quellmodell.
 */
export function mapElkResult(model: SchematicModel, expanded: ExpandedSet, result: ElkNode): SchematicLayout {
  const posById = new Map<string, ElkNode>();
  for (const c of result.children ?? []) posById.set(c.id, c);

  const chips: PositionedChip[] = model.chips.map(chip => {
    const p = posById.get(chip.id);
    const isOpen = expanded.has(chip.id);
    const { pins, ...rest } = chip;
    return {
      ...rest,
      x: p?.x ?? 0,
      y: p?.y ?? 0,
      width: p?.width ?? GEO.nodeWidth,
      height: p?.height ?? (isOpen ? chipHeight(chip.pins.length) : GEO.objHeight),
      expanded: isOpen,
      pins: pins.map((pin, idx) => ({ ...pin, rowY: pinRowY(idx) })),
    };
  });

  // Dieselbe Aufteilung wie beim Graph-Aufbau, damit Traces 1:1 zu den
  // tatsächlich emittierten ELK-Kanten passen.
  const { columnEdges, objectPairs } = partitionEdges(model, expanded);
  const edges: RoutedEdge[] = columnEdges.map(e => ({ ...e, points: sectionPoints(result, e.id) }));
  const objectEdges: RoutedObjectEdge[] = objectPairs.map(pair => ({
    id: objEdgeId(pair.from, pair.to),
    fromNode: pair.from,
    toNode: pair.to,
    points: sectionPoints(result, objEdgeId(pair.from, pair.to)),
  }));

  return {
    chips,
    edges,
    objectEdges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}

let elkInstance: ElkInstance | null = null;
function getElk(): ElkInstance {
  if (!elkInstance) elkInstance = new ELK();
  return elkInstance;
}

/** Async Layout-Runner: baut den Graphen, lässt ELK rechnen, mappt zurück. */
export async function layoutSchematic(model: SchematicModel, expanded: ExpandedSet): Promise<SchematicLayout> {
  const graph = buildElkGraph(model, expanded);
  const result = await getElk().layout(graph);
  return mapElkResult(model, expanded, result);
}

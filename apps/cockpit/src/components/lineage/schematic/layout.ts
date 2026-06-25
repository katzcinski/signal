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
import type { SchematicChip, SchematicEdge, SchematicModel, SchematicPin } from './model';

export type ViewMode = 'column' | 'object';

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

/**
 * Baut den ELK-Eingabegraphen. Pure — keine ELK-Ausführung.
 * Column-Mode: ein Port je Pin-Richtung, Kanten Port→Port.
 * Object-Mode: portlose Chips, aggregierte Objekt-zu-Objekt-Kanten.
 */
export function buildElkGraph(model: SchematicModel, mode: ViewMode): ElkNode {
  return mode === 'object' ? buildObjectGraph(model) : buildColumnGraph(model);
}

function buildColumnGraph(model: SchematicModel): ElkNode {
  const children: ElkNode[] = model.chips.map(chip => {
    const ports: ElkPort[] = [];
    chip.pins.forEach((pin, idx) => {
      const y = pinRowY(idx);
      if (pin.hasIncoming) ports.push(port(westPortId(chip.id, pin.id), 'WEST', 0, y));
      if (pin.hasOutgoing) ports.push(port(eastPortId(chip.id, pin.id), 'EAST', GEO.nodeWidth, y));
    });
    return {
      id: chip.id,
      width: GEO.nodeWidth,
      height: chipHeight(chip.pins.length),
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
        'elk.partitioning.partition': String(chip.laneOrder),
      },
      ports,
    };
  });

  const edges = model.edges.map(e => ({
    id: e.id,
    sources: [eastPortId(e.fromNode, e.fromPin)],
    targets: [westPortId(e.toNode, e.toPin)],
  }));

  return { id: 'root', layoutOptions: ROOT_OPTIONS, children, edges };
}

function buildObjectGraph(model: SchematicModel): ElkNode {
  const children: ElkNode[] = model.chips.map(chip => ({
    id: chip.id,
    width: GEO.nodeWidth,
    height: GEO.objHeight,
    layoutOptions: { 'elk.partitioning.partition': String(chip.laneOrder) },
  }));

  // Column-Traces auf Objekt-Paare aggregieren.
  const seen = new Set<string>();
  const edges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  for (const e of model.edges) {
    if (e.fromNode === e.toNode) continue;
    const id = objEdgeId(e.fromNode, e.toNode);
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, sources: [e.fromNode], targets: [e.toNode] });
  }

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
  mode: ViewMode;
  chips: PositionedChip[];
  edges: RoutedEdge[];
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
export function mapElkResult(model: SchematicModel, mode: ViewMode, result: ElkNode): SchematicLayout {
  const posById = new Map<string, ElkNode>();
  for (const c of result.children ?? []) posById.set(c.id, c);

  const chips: PositionedChip[] = model.chips.map(chip => {
    const p = posById.get(chip.id);
    const { pins, ...rest } = chip;
    return {
      ...rest,
      x: p?.x ?? 0,
      y: p?.y ?? 0,
      width: p?.width ?? GEO.nodeWidth,
      height: p?.height ?? chipHeight(chip.pins.length),
      pins: pins.map((pin, idx) => ({ ...pin, rowY: pinRowY(idx) })),
    };
  });

  const edges: RoutedEdge[] =
    mode === 'column'
      ? model.edges.map(e => ({ ...e, points: sectionPoints(result, e.id) }))
      : [];

  const objectEdges: RoutedObjectEdge[] = [];
  if (mode === 'object') {
    for (const e of result.edges ?? []) {
      const parts = e.id.split(SEP);
      if (parts[0] !== OBJ_EDGE) continue;
      objectEdges.push({
        id: e.id,
        fromNode: parts[1],
        toNode: parts[2],
        points: sectionPoints(result, e.id),
      });
    }
  }

  return {
    mode,
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
export async function layoutSchematic(model: SchematicModel, mode: ViewMode): Promise<SchematicLayout> {
  const graph = buildElkGraph(model, mode);
  const result = await getElk().layout(graph);
  return mapElkResult(model, mode, result);
}

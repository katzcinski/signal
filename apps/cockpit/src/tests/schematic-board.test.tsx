import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchematicBoard } from '@/components/lineage/schematic/SchematicBoard';
import { buildSchematicModel, type RawColumnEdge } from '@/components/lineage/schematic/model';
import { mapElkResult, chipHeight, GEO, pinRowY } from '@/components/lineage/schematic/layout';
import { dqStatusColor, laneColor, orthogonalPath } from '@/components/lineage/schematic/theme';
import { columnId } from '@/lib/lineage';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { LineageNode } from '@/types';

const NODES: LineageNode[] = [
  { id: 'INB', layer: 'Source', layerCode: 'r', columns: ['VBELN', 'NETWR'], dq_status: 'pass' },
  {
    id: 'HRM', layer: 'Harmonization', layerCode: 'ic', columns: ['SALES_DOC', 'NET_VALUE_USD'],
    dq_status: 'warn', has_contract: true,
  },
];
const EDGES: RawColumnEdge[] = [
  { source: 'INB', sourceColumn: 'VBELN', target: 'HRM', targetColumn: 'SALES_DOC', edgeType: 'direct' },
  {
    source: 'INB', sourceColumn: 'NETWR', target: 'HRM', targetColumn: 'NET_VALUE_USD',
    edgeType: 'computed', expression: 'CONV(NETWR)',
  },
];
const model = buildSchematicModel(NODES, EDGES);

// Deterministisches Layout ohne ELK-Engine. Default: beide Chips ausgeklappt.
function fakeLayout(expanded: Set<string> = new Set(['INB', 'HRM'])) {
  const result: ElkNode = {
    id: 'root',
    width: 700,
    height: 240,
    children: [
      { id: 'INB', x: 0, y: 0, width: GEO.nodeWidth, height: chipHeight(2) },
      { id: 'HRM', x: 400, y: 30, width: GEO.nodeWidth, height: chipHeight(2) },
    ],
    edges: model.edges.map(e => ({
      id: e.id,
      sources: [],
      targets: [],
      sections: [{ id: 's', startPoint: { x: 240, y: 81 }, endPoint: { x: 400, y: 111 } }],
    })),
  };
  return mapElkResult(model, expanded, result);
}

describe('theme helpers', () => {
  it('maps DQ status to theme status vars', () => {
    expect(dqStatusColor('pass')).toBe('var(--status-ok)');
    expect(dqStatusColor('warn')).toBe('var(--status-warn)');
    expect(dqStatusColor('critical')).toBe('var(--status-crit)');
    expect(dqStatusColor(undefined)).toBe('var(--status-unknown)');
  });

  it('gives a stable lane colour per order', () => {
    expect(laneColor(0)).toBe(laneColor(5)); // cycles
    expect(laneColor(0)).not.toBe(laneColor(1));
  });

  it('builds an orthogonal path and rounds interior corners', () => {
    expect(orthogonalPath([])).toBe('');
    expect(orthogonalPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M 0 0 L 10 0');
    const rounded = orthogonalPath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]);
    expect(rounded).toContain('Q 20 0'); // arc around the bend
  });
});

describe('SchematicBoard', () => {
  it('renders a chip title and pin labels', () => {
    render(<SchematicBoard layout={fakeLayout()} />);
    expect(screen.getByText('INB')).toBeInTheDocument();
    expect(screen.getByText('VBELN')).toBeInTheDocument();
    expect(screen.getByText('NET_VALUE_USD')).toBeInTheDocument();
  });

  it('fires onSelectPin when a pin label is clicked', () => {
    const onSelectPin = vi.fn();
    const onSelectChip = vi.fn();
    render(<SchematicBoard layout={fakeLayout()} onSelectChip={onSelectChip} onSelectPin={onSelectPin} />);
    fireEvent.click(screen.getByText('VBELN'));
    expect(onSelectPin).toHaveBeenCalledWith('INB', 'VBELN');
    expect(onSelectChip).not.toHaveBeenCalled();
  });

  it('fires onSelectChip when the chip body is clicked', () => {
    const onSelectChip = vi.fn();
    const { container } = render(<SchematicBoard layout={fakeLayout()} onSelectChip={onSelectChip} />);
    const chipBody = container.querySelector('.schem-chip-body')!;
    fireEvent.click(chipBody);
    expect(onSelectChip).toHaveBeenCalledWith('INB');
  });

  it('marks traced edges active and dims the rest', () => {
    const traced = model.edges[1]; // computed edge
    const { container } = render(
      <SchematicBoard
        layout={fakeLayout()}
        tracePins={new Set([columnId('INB', 'NETWR'), columnId('HRM', 'NET_VALUE_USD')])}
        traceEdges={new Set([traced.id])}
      />,
    );
    const active = container.querySelector('.schem-trace.is-active');
    const dimmed = container.querySelector('.schem-trace.is-dimmed');
    expect(active).toBeTruthy();
    expect(dimmed).toBeTruthy();
  });

  it('renders aggregated object edges when both ends are collapsed', () => {
    const objResult: ElkNode = {
      id: 'root', width: 700, height: 200,
      children: [
        { id: 'INB', x: 0, y: 0, width: GEO.nodeWidth, height: GEO.objHeight },
        { id: 'HRM', x: 400, y: 0, width: GEO.nodeWidth, height: GEO.objHeight },
      ],
      edges: [{ id: 'objedge:INB:HRM', sources: [], targets: [], sections: [{ id: 's', startPoint: { x: 240, y: 32 }, endPoint: { x: 400, y: 32 } }] }],
    };
    const { container } = render(<SchematicBoard layout={mapElkResult(model, new Set(), objResult)} />);
    expect(container.querySelector('.schem-obj-trace')).toBeTruthy();
    expect(screen.getAllByText('2 cols').length).toBe(2); // beide Chips eingeklappt
  });

  it('toggles a chip\'s columns via the header chevron', () => {
    const onToggleColumns = vi.fn();
    const { container } = render(
      <SchematicBoard layout={fakeLayout(new Set())} onToggleColumns={onToggleColumns} />,
    );
    const chevrons = container.querySelectorAll('.schem-coltoggle');
    expect(chevrons.length).toBe(2); // beide Chips haben Spalten
    fireEvent.click(chevrons[0]);
    expect(onToggleColumns).toHaveBeenCalledWith('INB');
  });

  it('renders an expand handle only for expandable chips and fires onExpand', () => {
    const onExpandChip = vi.fn();
    const { container } = render(
      <SchematicBoard layout={fakeLayout()} expandableChips={new Set(['INB'])} onExpandChip={onExpandChip} />,
    );
    const handles = container.querySelectorAll('.schem-expand');
    expect(handles.length).toBe(1); // nur INB ist erweiterbar, HRM nicht
    fireEvent.click(handles[0]);
    expect(onExpandChip).toHaveBeenCalledWith('INB');
  });

  it('calls onBackground when the canvas backdrop is clicked', () => {
    const onBackground = vi.fn();
    const { container } = render(<SchematicBoard layout={fakeLayout()} onBackground={onBackground} />);
    const bg = container.querySelector('rect[fill^="url("]')!;
    fireEvent.click(bg);
    expect(onBackground).toHaveBeenCalled();
  });

  it('places pin rows using the geometry helper', () => {
    expect(fakeLayout().chips[0].pins[0].rowY).toBe(pinRowY(0));
  });
});

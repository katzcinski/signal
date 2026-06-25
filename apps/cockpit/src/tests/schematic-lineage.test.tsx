import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchematicLineage from '@/components/lineage/schematic/SchematicLineage';
import type { LineageGraph } from '@/types';

const GRAPH: LineageGraph = {
  nodes: [
    { id: 'INB', layer: 'Source', layerCode: 'r', system: 'S/4HANA', columns: ['VBELN', 'NETWR'], dq_status: 'pass' },
    {
      id: 'HRM', layer: 'Harmonization', layerCode: 'ic', system: 'Datasphere',
      columns: ['SALES_DOC', 'NET_VALUE_USD'], dq_status: 'warn', has_contract: true,
    },
  ],
  edges: [],
  columnEdges: [
    { source: 'INB', sourceColumn: 'VBELN', target: 'HRM', targetColumn: 'SALES_DOC', edgeType: 'direct' },
    {
      source: 'INB', sourceColumn: 'NETWR', target: 'HRM', targetColumn: 'NET_VALUE_USD',
      edgeType: 'computed', expression: "CURRENCY_CONVERSION(NETWR, 'USD')",
    },
  ],
};

vi.mock('@/api/lineage', () => ({
  useLineage: () => ({ data: GRAPH, isLoading: false }),
}));

describe('SchematicLineage container', () => {
  it('renders the board after ELK layout resolves', async () => {
    render(<SchematicLineage />);
    expect(await screen.findByText('INB')).toBeInTheDocument();
    // Layer-Sidebar + System-Chips aus den Daten.
    expect(screen.getByText('S/4HANA')).toBeInTheDocument();
    expect(screen.getByText('Datasphere')).toBeInTheDocument();
  });

  it('traces a column and surfaces its transformation in the inspector', async () => {
    render(<SchematicLineage />);
    const pin = await screen.findByText('NET_VALUE_USD');
    fireEvent.click(pin);
    // Inspector zeigt den Transformations-Codeblock (pre), nicht nur den SVG-Tooltip.
    await waitFor(() => {
      expect(screen.getByText(/CURRENCY_CONVERSION/, { selector: 'pre' })).toBeInTheDocument();
    });
  });

  it('switches to object level and shows column counts', async () => {
    render(<SchematicLineage />);
    await screen.findByText('INB');
    fireEvent.click(screen.getByText('Objekt-Ebene'));
    await waitFor(() => {
      expect(screen.getAllByText('2 cols').length).toBeGreaterThan(0);
    });
  });
});

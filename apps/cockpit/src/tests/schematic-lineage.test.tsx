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

// Der Container ist seed-gated: ohne Seed wird nichts geladen. Der Mock liefert
// den Graphen unabhängig vom Scope; die Tests wählen zuerst ein Seed.
vi.mock('@/api/lineage', () => ({
  useLineage: () => ({ data: GRAPH, isLoading: false }),
}));

vi.mock('@/api/objects', () => ({
  useObjects: () => ({
    data: [
      { id: 'INB', name: 'INB', layer: 'Source' },
      { id: 'HRM', name: 'HRM', layer: 'Harmonization' },
    ],
  }),
}));

/** Seed über das Suchfeld wählen, damit der Graph geladen/gerendert wird. */
async function pickSeed(label = 'INB') {
  const input = screen.getByPlaceholderText('Seed-Objekt hinzufügen…');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: label } });
  const option = await screen.findByRole('button', { name: new RegExp(label) });
  fireEvent.mouseDown(option);
}

describe('SchematicLineage container', () => {
  it('gates on a seed and renders a collapsed board once one is chosen', async () => {
    render(<SchematicLineage />);
    // Vor der Seed-Auswahl: Empty-State, kein Board.
    expect(screen.getByText('Lineage gezielt laden')).toBeInTheDocument();
    expect(screen.queryByText('S/4HANA')).not.toBeInTheDocument();

    await pickSeed('INB');

    // Default eingeklappt: Chips zeigen die Spaltenanzahl, noch keine Pins.
    expect(await screen.findAllByText('2 cols')).not.toHaveLength(0);
    expect(screen.queryByText('VBELN')).not.toBeInTheDocument();
    // Layer-Sidebar + System-Chips aus den Daten.
    expect(screen.getByText('S/4HANA')).toBeInTheDocument();
    expect(screen.getByText('Datasphere')).toBeInTheDocument();
  });

  it('expands all columns to reveal pins', async () => {
    render(<SchematicLineage />);
    await pickSeed('INB');
    await screen.findAllByText('2 cols');
    fireEvent.click(screen.getByText('Alle Spalten'));
    // Nach dem Ausklappen (Relayout) erscheinen die Pin-Labels.
    expect(await screen.findByText('VBELN')).toBeInTheDocument();
  });

  it('traces a column and surfaces its transformation in the inspector', async () => {
    render(<SchematicLineage />);
    await pickSeed('INB');
    await screen.findAllByText('2 cols');
    fireEvent.click(screen.getByText('Alle Spalten'));
    const pin = await screen.findByText('NET_VALUE_USD');
    fireEvent.click(pin);
    // Inspector zeigt den Transformations-Codeblock (pre), nicht nur den SVG-Tooltip.
    await waitFor(() => {
      expect(screen.getByText(/CURRENCY_CONVERSION/, { selector: 'pre' })).toBeInTheDocument();
    });
  });
});

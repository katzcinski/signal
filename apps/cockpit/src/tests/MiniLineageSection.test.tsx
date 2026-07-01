import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniLineageSection } from '@/components/object-detail/MiniLineageSection';
import type { LineageGraph } from '@/types';

const state = vi.hoisted(() => ({
  graph: { nodes: [], edges: [] } as LineageGraph,
  isLoading: false,
}));

vi.mock('@/api/lineage', () => ({
  useLineage: () => ({
    data: state.graph,
    isLoading: state.isLoading,
  }),
}));

function renderMiniLineage() {
  return render(
    <MemoryRouter>
      <MiniLineageSection focusId="Sales_Orders_View" />
    </MemoryRouter>,
  );
}

describe('MiniLineageSection', () => {
  beforeEach(() => {
    state.graph = { nodes: [], edges: [] };
    state.isLoading = false;
  });

  it('renders a local skeleton while lineage is loading', () => {
    state.isLoading = true;

    renderMiniLineage();

    expect(screen.getByTestId('mini-lineage-skeleton')).toBeTruthy();
    expect(screen.queryByText('Lädt…')).toBeNull();
  });

  it('renders a real empty state when the one-hop graph has zero nodes', () => {
    state.graph = { nodes: [], edges: [] };

    renderMiniLineage();

    expect(screen.getByTestId('mini-lineage-sparse')).toBeTruthy();
    expect(screen.getByText('Keine Lineage-Knoten im aktuellen Extract')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Lineage Map/i })).toHaveAttribute(
      'href',
      '/lineage?focus=Sales_Orders_View',
    );
  });

  it('renders a focused sparse state for a single-node graph', () => {
    state.graph = {
      nodes: [{ id: 'Sales_Orders_View', label: 'Sales Orders', layer: 'consumption' }],
      edges: [],
    };

    renderMiniLineage();

    expect(screen.getByTestId('mini-lineage-sparse')).toBeTruthy();
    expect(screen.getByText('Nur dieses Objekt im aktuellen Ausschnitt')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Lineage Map/i })).toHaveAttribute(
      'href',
      '/lineage?focus=Sales_Orders_View',
    );
  });

  it('renders the normal mini DAG and full lineage link for connected graphs', () => {
    state.graph = {
      nodes: [
        { id: 'RAW_ORDERS', label: 'Raw Orders', layer: 'source' },
        { id: 'Sales_Orders_View', label: 'Sales Orders', layer: 'consumption' },
        { id: 'REVENUE_MART', label: 'Revenue Mart', layer: 'consumption' },
      ],
      edges: [
        { id: 'RAW_ORDERS->Sales_Orders_View', source: 'RAW_ORDERS', target: 'Sales_Orders_View' },
        { id: 'Sales_Orders_View->REVENUE_MART', source: 'Sales_Orders_View', target: 'REVENUE_MART' },
      ],
    };

    renderMiniLineage();

    expect(screen.getByTestId('mini-lineage-dag')).toBeTruthy();
    expect(screen.getByLabelText('Lineage: Sales_Orders_View')).toBeTruthy();
    expect(screen.queryByTestId('mini-lineage-sparse')).toBeNull();
    expect(screen.getByRole('link', { name: /Lineage Map/i })).toHaveAttribute(
      'href',
      '/lineage?focus=Sales_Orders_View',
    );
  });
});

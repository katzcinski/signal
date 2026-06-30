import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ProductDetail from '@/pages/ProductDetail';

vi.mock('@/components/LineageMiniGraph', () => ({
  LineageMiniGraph: () => <div>Mini graph</div>,
}));

vi.mock('@/api/products', () => ({
  useProduct: () => ({
    data: {
      product: 'sales_product',
      owners: ['team-sales'],
      lifecycle: 'active',
      own_health: 'pass',
      ports: [{
        dataset: 'DS_PRODUCT',
        kind: 'provider_contract',
        lifecycle: 'active',
        compliance: 'compliant',
        version: '1.0.0',
      }],
      interior: [],
      inbound_dependencies: [],
      inbound_sources: [],
      upstream_risk: [],
      findings: [],
      subgraph: { nodes: [], edges: [] },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('ProductDetail', () => {
  it('hides findings and upstream risk sections when empty', async () => {
    render(
      <MemoryRouter initialEntries={['/products/sales_product']}>
        <Routes>
          <Route path="/products/:name" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('sales_product').length).toBeGreaterThan(0);
    expect(screen.queryByText('Findings')).toBeNull();
    expect(screen.queryByText('Upstream Risk')).toBeNull();
    expect(screen.getByText('Ports')).toBeTruthy();
    expect(await screen.findByText('Mini graph')).toBeTruthy();
  });
});

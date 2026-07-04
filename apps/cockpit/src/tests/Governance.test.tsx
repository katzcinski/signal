import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Governance nutzt die geteilte, sortierbare Table statt eines Roh-<table>.
const state = vi.hoisted(() => ({
  objects: [] as unknown[],
  contracts: [] as unknown[],
}));

vi.mock('@/api/objects', () => ({
  useObjects: () => ({ data: state.objects, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/api/contracts', () => ({
  useContracts: () => ({ data: state.contracts, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/api/coverage', () => ({
  useCoverageSummary: () => ({ data: { contracts_breached: 3 } }),
}));

import Governance from '@/pages/Compliance';

const OBJECTS = [
  { id: 'P1', name: 'OBJ_COVERED', space: 'SALES' },
  { id: 'P2', name: 'OBJ_BARE', space: 'FINANCE' },
];
const CONTRACTS = [
  { product: 'P1', kind: 'consumer_contract', lifecycle: 'active' },
  // internal_gate zählt nicht als Boundary-Contract → P2 bleibt „ohne Contract".
  { product: 'P2', kind: 'internal_gate', lifecycle: 'active' },
];

function firstCellTexts(): string[] {
  const [, ...dataRows] = screen.getAllByRole('row');
  return dataRows.map(row => within(row).getAllByRole('cell')[0].textContent ?? '');
}

describe('Governance', () => {
  beforeEach(() => {
    state.objects = [...OBJECTS];
    state.contracts = [...CONTRACTS];
  });

  it('renders one row per object and ignores internal gates for contract binding', () => {
    render(<Governance />);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(1 + OBJECTS.length);

    const covered = within(screen.getByText('OBJ_COVERED').closest('tr')!);
    expect(covered.getByText('✓ Ja')).toBeInTheDocument();

    const bare = within(screen.getByText('OBJ_BARE').closest('tr')!);
    expect(bare.getByText('○ Nein')).toBeInTheDocument();
    expect(bare.getByText('FINANCE')).toBeInTheDocument();
  });

  it('shows the breached-contracts figure from the coverage summary', () => {
    render(<Governance />);
    const chip = screen.getByText(/Verletzte Contracts/).closest('span')!;
    expect(within(chip).getByText('3')).toBeInTheDocument();
  });

  it('sorts by the Hat-Contract column on header click', () => {
    render(<Governance />);

    fireEvent.click(screen.getByText('Hat Contract'));
    expect(firstCellTexts()).toEqual(['OBJ_BARE', 'OBJ_COVERED']); // aufsteigend: ohne Contract zuerst

    fireEvent.click(screen.getByText('Hat Contract'));
    expect(firstCellTexts()).toEqual(['OBJ_COVERED', 'OBJ_BARE']); // absteigend
  });

  it('shows the shared empty state when there are no objects', () => {
    state.objects = [];
    render(<Governance />);
    expect(screen.getByText('Keine Objekte')).toBeInTheDocument();
  });

  it('shows the hint banner when no boundary contract is active', () => {
    state.contracts = [{ product: 'P2', kind: 'internal_gate', lifecycle: 'active' }];
    render(<Governance />);
    expect(screen.getByText(/Noch keine aktiven Contracts/)).toBeInTheDocument();
  });
});

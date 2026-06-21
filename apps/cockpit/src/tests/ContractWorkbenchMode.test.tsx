import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractWorkbench from '@/pages/ContractWorkbench';
import { t } from '@/i18n/de';
import type { ContractOut } from '@/types';

let currentContract: ContractOut;
// When a test needs more than the single selected contract (e.g. to exercise the
// frame split), it sets currentList; otherwise the list mirrors currentContract.
let currentList: ContractOut[] | null;

function mutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
  };
}

vi.mock('@/api/contracts', () => ({
  useContracts: () => ({
    data: currentList ?? [currentContract],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContract: () => ({
    data: currentContract,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInventory: () => ({ data: { datasets: [] } }),
  usePutContract: mutation,
  useCertifyContract: mutation,
  useApproveContract: mutation,
  useDeprecateContract: mutation,
  useCompileContractDryRun: mutation,
  useDryRunChecks: mutation,
  useRevertChecks: mutation,
  useExportBdc: mutation,
  usePromoteContract: mutation,
  useSeedContract: mutation,
  useDiffContract: () => ({
    ...mutation(),
    data: { ceremony_required: currentContract.kind !== 'internal_gate', entries: [] },
  }),
  useContractSla: () => ({
    data: {
      windows: { '7d': null, '30d': null, '90d': null },
    },
  }),
}));

const contract = (overrides: Partial<ContractOut> = {}): ContractOut => ({
  product: 'P_MODE',
  kind: 'internal_gate',
  dataset: 'P_MODE',
  owned_by: 'platform',
  owners: [],
  lifecycle: 'active',
  version: '1.0.0',
  guarantees: {},
  compliance: null,
  certified: false,
  ...overrides,
});

function renderWorkbench(route = '/contracts?product=P_MODE') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ContractWorkbench />
    </MemoryRouter>,
  );
}

describe('ContractWorkbench mode derivation', () => {
  beforeEach(() => {
    currentContract = contract();
    currentList = null;
  });

  it('defaults internal gates to quick certification and keeps the gate hint visible', () => {
    renderWorkbench();

    expect(screen.getByRole('button', { name: t.workbench.fullMode })).toBeInTheDocument();
    expect(screen.getByText(t.workbench.gateChangeHint)).toBeInTheDocument();
  });

  it('lets lite=0 override the gate default', () => {
    renderWorkbench('/contracts?product=P_MODE&lite=0');

    expect(screen.getByRole('button', { name: t.workbench.liteMode })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.workbench.fullMode })).not.toBeInTheDocument();
  });

  it('does not offer quick certification for certified governance contracts', () => {
    currentContract = contract({
      kind: 'consumer_contract',
      owned_by: 'product',
      certified: true,
      compliance: 'unknown',
    });

    renderWorkbench();

    expect(screen.queryByRole('button', { name: t.workbench.liteMode })).not.toBeInTheDocument();
  });

  it('does not render SLA bars for active internal gates in full mode', () => {
    renderWorkbench('/contracts?product=P_MODE&lite=0');

    expect(screen.queryByText(t.workbench.slaTitle)).not.toBeInTheDocument();
  });

  it('does not offer approval ceremony for internal gate drafts', () => {
    currentContract = contract({ lifecycle: 'draft' });

    renderWorkbench('/contracts?product=P_MODE&lite=0');

    expect(screen.queryByRole('button', { name: t.workbench.approve })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.workbench.liteMode })).toBeInTheDocument();
  });

  it('keeps approval ceremony available for governance contract drafts', () => {
    currentContract = contract({
      kind: 'consumer_contract',
      owned_by: 'product',
      lifecycle: 'draft',
    });

    renderWorkbench();

    expect(screen.getByRole('button', { name: t.workbench.approve })).toBeInTheDocument();
  });
});

describe('ContractWorkbench frame split', () => {
  beforeEach(() => {
    currentContract = contract();
    currentList = null;
  });

  it('splits the list into internal and contract frames and filters by the active one', () => {
    currentList = [
      contract({ product: 'P_GATE', dataset: 'P_GATE', kind: 'internal_gate' }),
      contract({ product: 'P_CONTRACT', dataset: 'P_CONTRACT', kind: 'consumer_contract', owned_by: 'product' }),
    ];

    renderWorkbench('/contracts');

    // Default frame = internal: the gate shows, the contract does not.
    expect(screen.getByText('P_GATE')).toBeInTheDocument();
    expect(screen.queryByText('P_CONTRACT')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.workbench.tabContract }));

    expect(screen.getByText('P_CONTRACT')).toBeInTheDocument();
    expect(screen.queryByText('P_GATE')).not.toBeInTheDocument();
  });

  it('lands a selected contract in the contract frame regardless of the section param', () => {
    currentContract = contract({ product: 'P_MODE', kind: 'consumer_contract', owned_by: 'product' });

    // Deep link forces ?section=internal, but the selected item is a contract:
    // the item's kind wins, so the editor renders the contract frame, not internal.
    renderWorkbench('/contracts?product=P_MODE&section=internal');

    expect(screen.getByText(t.workbench.frameContract)).toBeInTheDocument();
    expect(screen.queryByText(t.workbench.frameInternal)).not.toBeInTheDocument();
  });

  it('offers in-place promotion for an internal gate', () => {
    renderWorkbench('/contracts?product=P_MODE');

    expect(screen.getByRole('button', { name: t.workbench.promote })).toBeInTheDocument();
  });

  it('does not offer promotion for a governance contract', () => {
    currentContract = contract({
      kind: 'consumer_contract',
      owned_by: 'product',
      certified: true,
      compliance: 'unknown',
    });

    renderWorkbench();

    expect(screen.queryByRole('button', { name: t.workbench.promote })).not.toBeInTheDocument();
  });
});

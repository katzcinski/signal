import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractWorkbench from '@/pages/ContractWorkbench';
import { t } from '@/i18n/de';
import type { ContractOut } from '@/types';

let currentContract: ContractOut;

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
    data: [currentContract],
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
});

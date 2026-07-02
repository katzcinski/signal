import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/de';
import type { IncidentDetail } from '@/types';

const data = vi.hoisted(() => ({
  incidents: [
    {
      id: 1,
      product: 'DS_CONTRACT',
      run_id: 'run-1',
      severity: 'fail',
      status: 'open',
      owner: 'team-a',
      title: 'Open contract breach',
      failed_checks: ['row_count'],
      opened_at: '2026-07-02T08:00:00Z',
      resolved_at: null,
      contract_version: '1.0.0',
      kind: 'consumer_contract',
      events: [],
      impacted_objects: [],
    },
    {
      id: 2,
      product: 'DS_GATE',
      run_id: 'run-2',
      severity: 'critical',
      status: 'acknowledged',
      owner: 'team-b',
      title: 'Internal latency signal',
      failed_checks: ['freshness'],
      opened_at: '2026-07-02T07:00:00Z',
      resolved_at: null,
      contract_version: '',
      kind: 'internal_gate',
      events: [],
      impacted_objects: [],
    },
    {
      id: 3,
      product: 'DS_GATE_2',
      run_id: 'run-3',
      severity: 'warn',
      status: 'open',
      owner: '',
      title: 'Open gate signal',
      failed_checks: ['volume'],
      opened_at: '2026-07-02T06:00:00Z',
      resolved_at: null,
      contract_version: '',
      kind: 'internal_gate',
      events: [],
      impacted_objects: [],
    },
    {
      id: 4,
      product: 'DS_DONE',
      run_id: 'run-4',
      severity: 'fail',
      status: 'resolved',
      owner: 'team-c',
      title: 'Resolved breach',
      failed_checks: [],
      opened_at: '2026-07-01T08:00:00Z',
      resolved_at: '2026-07-01T09:00:00Z',
      contract_version: '1.0.0',
      kind: 'provider_contract',
      events: [],
      impacted_objects: [],
    },
  ] as IncidentDetail[],
  transition: vi.fn(),
}));

vi.mock('@/api/incidents', () => ({
  useIncidents: (_status?: string, severity?: string, kind?: string) => ({
    data: data.incidents.filter(incident => {
      if (severity && incident.severity !== severity) return false;
      if (kind && incident.kind !== kind) return false;
      return true;
    }),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useIncident: (id: number | null) => ({
    data: data.incidents.find(incident => incident.id === id),
    isLoading: false,
  }),
  useIncidentTransition: () => ({ mutate: data.transition, isPending: false }),
  useFailedChecks: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import Incidents from '@/pages/Incidents';

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderIncidents(route = '/incidents') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/incidents" element={<><Incidents /><LocationEcho /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Incidents page', () => {
  it('opens the drawer from a shared ?id= deep link', () => {
    renderIncidents('/incidents?status=acknowledged&kind=internal_gate&id=2');

    expect(screen.getByRole('dialog', { name: 'Internal latency signal' })).toBeInTheDocument();
    expect(screen.getAllByText('DS_GATE').length).toBeGreaterThan(0);
    expect(screen.getAllByText(t.incidents.kindGate).length).toBeGreaterThan(0);
  });

  it('writes and clears the selected incident id through the URL', () => {
    renderIncidents();

    fireEvent.click(screen.getByText('Open contract breach'));
    expect(screen.getByTestId('location')).toHaveTextContent('id=1');
    expect(screen.getByRole('dialog', { name: 'Open contract breach' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(t.common.close));
    expect(screen.getByTestId('location')).not.toHaveTextContent('id=1');
  });

  it('shows status counts beside the tabs', () => {
    renderIncidents();

    expect(screen.getByRole('button', { name: `${t.incidents.tabs.open} (2)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${t.incidents.tabs.acknowledged} (1)` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${t.incidents.tabs.resolved} (1)` })).toBeInTheDocument();
  });

  it('syncs kind and severity chips into the URL and clears active filters individually', () => {
    renderIncidents();

    fireEvent.click(screen.getByRole('button', { name: t.incidents.kindGate }));
    expect(screen.getByTestId('location')).toHaveTextContent('kind=internal_gate');
    expect(screen.queryByText('Open contract breach')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.status.critical }));
    expect(screen.getByTestId('location')).toHaveTextContent('severity=critical');

    fireEvent.click(screen.getByRole('button', { name: `${t.incidents.tabs.acknowledged} (1)` }));
    expect(screen.getByTestId('location')).toHaveTextContent('status=acknowledged');
    expect(screen.getByText('Internal latency signal')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(new RegExp(t.status.critical)));
    expect(screen.getByTestId('location')).not.toHaveTextContent('severity=critical');
  });
});

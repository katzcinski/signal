import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DataLoadsPanel } from '@/components/object-detail/DataLoadsPanel';
import { t } from '@/i18n/de';

let mockState: {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
};

vi.mock('@/api/datasphere', () => ({
  useObjectDataLoads: () => mockState,
}));

beforeEach(() => {
  mockState = { data: [], isLoading: false, isError: false, error: null };
});

describe('DataLoadsPanel (W-5)', () => {
  it('renders a row per data load with mapped type label', () => {
    mockState = {
      isLoading: false, isError: false, error: null,
      data: [{
        object_id: 'DS', load_type: 'task_chain', run_id: 'r1', status: 'COMPLETED',
        started_at: new Date().toISOString(), finished_at: null, duration_ms: 4200,
        error_message: null, triggered_by: 'svc_user', raw: {},
      }],
    };
    render(<DataLoadsPanel objectId="DS" enabled />);
    expect(screen.getByText(t.dataLoads.typeTaskChain)).toBeTruthy();
    expect(screen.getByText('COMPLETED')).toBeTruthy();
    expect(screen.getByText('svc_user')).toBeTruthy();
  });

  it('shows the empty note when there are no loads', () => {
    render(<DataLoadsPanel objectId="DS" enabled />);
    expect(screen.getByText(t.dataLoads.empty)).toBeTruthy();
  });

  it('shows a not-configured hint on 503 instead of an error', () => {
    mockState = { isError: true, error: { response: { status: 503 } } };
    render(<DataLoadsPanel objectId="DS" enabled />);
    expect(screen.getByText(t.dataLoads.notConfigured)).toBeTruthy();
  });

  it('shows a generic error for non-503 failures', () => {
    mockState = { isError: true, error: { response: { status: 502 } } };
    render(<DataLoadsPanel objectId="DS" enabled />);
    expect(screen.getByText(t.dataLoads.error)).toBeTruthy();
  });

  it('renders nothing when disabled', () => {
    const { container } = render(<DataLoadsPanel objectId="DS" enabled={false} />);
    expect(container.firstChild).toBeNull();
  });
});

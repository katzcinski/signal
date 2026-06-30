import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { t } from '@/i18n/de';
import type { NotificationConfig } from '@/types';

const h = vi.hoisted(() => ({
  cfg: { current: null as NotificationConfig | null },
  deleteChannel: vi.fn(),
}));

// Mock the API layer so the page renders without react-query/axios.
vi.mock('@/api/notifications', () => {
  const noopMut = () => ({ mutate: () => {}, isPending: false });
  return {
    useNotificationConfig: () => ({ data: h.cfg.current, isLoading: false, isError: false, refetch: () => {} }),
    useCreateChannel: noopMut, usePatchChannel: noopMut,
    useDeleteChannel: () => ({ mutate: h.deleteChannel, isPending: false }),
    useCreateRule: noopMut, useDeleteRule: noopMut,
    useCreateMute: noopMut, useDeleteMute: noopMut,
  };
});

import Notifications from '@/pages/Notifications';

const baseConfig = (overrides: Partial<NotificationConfig> = {}): NotificationConfig => ({
  channels: [{ id: 1, name: 'Ops Slack', type: 'slack', url: 'https://hooks.slack.example.com/x', enabled: true, created_at: '', created_by: '' }],
  rules: [{ id: 1, name: 'Critical SALES', channel_id: 1, match_severity: 'critical', match_space: 'SALES', match_product: '', match_owned_by: '', match_owner: '', match_kind: '', enabled: true, created_at: '', created_by: '' }],
  mutes: [],
  can_edit: true,
  ...overrides,
});

describe('Notifications page (UX-N2)', () => {
  beforeEach(() => {
    h.deleteChannel.mockClear();
  });

  it('renders channels and rule facets routing to the channel', () => {
    h.cfg.current = baseConfig();
    render(<Notifications />);
    expect(screen.getAllByText('Ops Slack').length).toBeGreaterThan(0);
    expect(screen.getByText('Critical SALES')).toBeInTheDocument();
    // combined facet summary (unique): "Severity=critical · Space=SALES"
    expect(screen.getByText(/Severity=critical.*Space=SALES/)).toBeInTheDocument();
    expect(screen.getByText(t.notifications.addChannel)).toBeInTheDocument();
    expect(screen.getByText(t.notifications.addRule)).toBeInTheDocument();
  });

  it('shows the read-only banner and hides add forms for non-admins', () => {
    h.cfg.current = baseConfig({ can_edit: false });
    render(<Notifications />);
    expect(screen.getByText(t.role.readOnlyBanner)).toBeInTheDocument();
    expect(screen.queryByText(t.notifications.addChannel)).not.toBeInTheDocument();
    expect(screen.queryByText(t.notifications.addMute)).not.toBeInTheDocument();
  });

  it('requires confirmation before deleting a channel', () => {
    h.cfg.current = baseConfig();
    render(<Notifications />);

    fireEvent.click(screen.getAllByText(t.notifications.delete)[0]);
    expect(h.deleteChannel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(t.common.confirm));
    expect(h.deleteChannel).toHaveBeenCalledWith(1);
  });
});

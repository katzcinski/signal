import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/store/ui';
import { t } from '@/i18n/de';

vi.mock('@/api/objects', () => ({
  useObjects: () => ({
    data: [{ id: 'obj-1', name: 'SALES', space: 'CORE' }],
  }),
}));

vi.mock('@/api/contracts', () => ({
  useContracts: () => ({
    data: [{ product: 'Sales Product' }],
  }),
}));

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
}));

import { CommandPalette } from '@/components/CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    useUIStore.setState({ recents: [] });
  });

  it('renders as a modal dialog and exposes the library route', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPalette onClose={onClose} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole('dialog', { name: t.palette.placeholder });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(t.nav.library)).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

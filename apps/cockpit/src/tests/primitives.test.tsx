import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Field, Input, Select } from '@/components/ui/Field';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Tooltip } from '@/components/ui/Tooltip';

describe('UI primitives (UX-F6)', () => {
  it('Button pulls radius from the token and reflects disabled state', () => {
    const { rerender } = render(<Button>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn.style.borderRadius).toBe('var(--r-md)');
    expect(btn.style.cursor).toBe('pointer');
    rerender(<Button disabled>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go' }).style.cursor).toBe('not-allowed');
  });

  it('Button variant sets the primary accent', () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).style.background).toBe('var(--cont)');
  });

  it('Card spacing comes from the token scale', () => {
    const { container } = render(<Card pad="md">x</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.padding).toBe('var(--s4)');
    expect(el.style.borderRadius).toBe('var(--r-lg)');
  });

  it('Field wraps a control with its label', () => {
    render(<Field label="Name"><Input value="" onChange={() => {}} /></Field>);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('Select renders options from the shared control style', () => {
    render(<Select aria-label="pick"><option value="a">a</option></Select>);
    const sel = screen.getByLabelText('pick');
    expect(sel.style.borderRadius).toBe('var(--r-md)');
  });

  it('SectionHeader shows the title and count', () => {
    render(<SectionHeader title="Channels" count={3} />);
    expect(screen.getByText('Channels (3)')).toBeInTheDocument();
  });

  it('Tooltip renders hover content without replacing the trigger', () => {
    render(<Tooltip content="More context"><button>Info</button></Tooltip>);
    expect(screen.getByRole('button', { name: 'Info' })).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveTextContent('More context');
  });

  it('Combobox listbox escapes clipping containers', () => {
    render(
      <div data-testid="clip" style={{ overflow: 'hidden' }}>
        <Combobox options={['alpha', 'beta']} value="" onChange={() => {}} placeholder="Pick" />
      </div>,
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Pick' }));

    const listbox = screen.getByRole('listbox');
    expect(screen.getByTestId('clip')).not.toContainElement(listbox);
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox.style.position).toBe('fixed');
  });
});

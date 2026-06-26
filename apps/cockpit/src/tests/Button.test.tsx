import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders an enabled button with pointer cursor', () => {
    const { getByRole } = render(<Button>Los</Button>);
    const btn = getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.style.cursor).toBe('pointer');
  });

  it('UX-F8: disabled reads via a tone-shift, not a pure opacity fade', () => {
    const { getByRole } = render(<Button variant="primary" disabled>Los</Button>);
    const btn = getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.style.cursor).toBe('not-allowed');
    // no opacity fade — disabled is encoded through colour, not transparency
    expect(btn.style.opacity).toBe('');
    expect(btn.style.background).toBe('var(--bg-2)');
    expect(btn.style.color).toBe('var(--fg-3)');
    expect(btn.style.borderColor).toBe('var(--line)');
  });

  it('keeps a transition so hover/active animate rather than jump', () => {
    const { getByRole } = render(<Button>Los</Button>);
    expect((getByRole('button') as HTMLButtonElement).style.transition).toContain('filter');
  });
});

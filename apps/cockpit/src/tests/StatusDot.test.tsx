import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusDot } from '@/components/ui/StatusDot';

// R3-7 (Carbon rule): status must not be colour-only — assert the shape glyph
// and the aria-label text channel are present and distinct per status.
describe('StatusDot encoding', () => {
  it('exposes an aria-label for the status (text channel)', () => {
    const { container } = render(<StatusDot status="critical" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.getAttribute('aria-label')).toBe('critical');
  });

  it('uses distinct shape glyphs for pass vs warn vs fail (shape channel)', () => {
    const glyph = (s: string) => render(<StatusDot status={s} />).container.textContent;
    expect(glyph('pass')).not.toEqual(glyph('warn'));
    expect(glyph('warn')).not.toEqual(glyph('fail'));
  });
});

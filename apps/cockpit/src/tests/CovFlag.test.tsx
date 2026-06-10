import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CovFlag } from '@/components/ui/CovFlag';

describe('CovFlag', () => {
  it('renders the covered symbol with a title', () => {
    const { container } = render(<CovFlag flag="covered" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('title')).toBe('covered');
    expect(span?.textContent).toContain('●');
  });

  it('renders distinct symbols per coverage state', () => {
    const gap = render(<CovFlag flag="gap" />).container.textContent;
    const none = render(<CovFlag flag="out_of_scope" />).container.textContent;
    expect(gap).not.toEqual(none);
  });

  it('shows a label when requested', () => {
    const { container } = render(<CovFlag flag="partial" showLabel />);
    expect(container.textContent).toContain('partial');
  });
});

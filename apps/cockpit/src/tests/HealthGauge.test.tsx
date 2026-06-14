import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HealthGauge } from '@/components/ui/HealthGauge';

describe('HealthGauge (UX-N12)', () => {
  it('renders the current percentage', () => {
    const { container } = render(<HealthGauge pct={87} />);
    expect(container.textContent).toContain('87%');
  });

  it('shows an upward trend when health improved', () => {
    const { container } = render(<HealthGauge pct={90} prevPct={80} />);
    expect(container.textContent).toContain('▲');
    expect(container.textContent).toContain('+10');
  });

  it('shows a downward trend when health degraded', () => {
    const { container } = render(<HealthGauge pct={70} prevPct={85} />);
    expect(container.textContent).toContain('▼');
    expect(container.textContent).toContain('-15');
  });

  it('omits the trend when no prior period is known', () => {
    const { container } = render(<HealthGauge pct={75} prevPct={null} />);
    expect(container.textContent).not.toContain('▲');
    expect(container.textContent).not.toContain('▼');
  });

  it('exposes an accessible label', () => {
    const { container } = render(<HealthGauge pct={50} prevPct={40} />);
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute('aria-label')).toContain('50%');
  });
});

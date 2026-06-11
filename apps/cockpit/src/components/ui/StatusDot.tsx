import type { OverallStatus } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  pass:    'var(--status-ok)',
  warn:    'var(--status-warn)',
  fail:    'var(--status-fail)',
  critical:'var(--status-crit)',
  unknown: 'var(--status-unknown)',
  stale:   'var(--status-stale)',
};

// R3-7 (Carbon rule): status must be encoded by ≥3 of {colour, shape, text}.
// The glyph adds shape redundancy so the dot is not colour-only; aria-label
// supplies the text channel for assistive tech.
const STATUS_GLYPH: Record<string, string> = {
  pass:    '●',
  warn:    '◆',
  fail:    '▲',
  critical:'▲',
  unknown: '○',
  stale:   '◐',
};

interface Props { status: OverallStatus | string; size?: number }

export function StatusDot({ status, size = 8 }: Props) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.unknown;
  const glyph = STATUS_GLYPH[status] ?? STATUS_GLYPH.unknown;
  return (
    <span
      role="img"
      aria-label={status}
      title={status}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color, fontSize: size + 4, lineHeight: 1, flexShrink: 0 }}
    >
      {glyph}
    </span>
  );
}

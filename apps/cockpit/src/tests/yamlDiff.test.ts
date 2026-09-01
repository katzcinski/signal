import { describe, expect, it } from 'vitest';
import { diffYamlLines } from '@/components/workbench/yamlDiff';

describe('diffYamlLines', () => {
  it('marks every line as context when there is no baseline', () => {
    const lines = diffYamlLines('', 'product: P\nversion: 1.0.0\n');
    expect(lines).toEqual([
      { kind: 'ctx', text: 'product: P' },
      { kind: 'ctx', text: 'version: 1.0.0' },
    ]);
  });

  it('marks a changed line as del + add and keeps the rest as context', () => {
    const base = 'product: P\nversion: 2.3.0\nguarantees:\n';
    const next = 'product: P\nversion: 3.0.0\nguarantees:\n';

    expect(diffYamlLines(base, next)).toEqual([
      { kind: 'ctx', text: 'product: P' },
      { kind: 'del', text: 'version: 2.3.0' },
      { kind: 'add', text: 'version: 3.0.0' },
      { kind: 'ctx', text: 'guarantees:' },
    ]);
  });

  it('marks a purely added block without touching the surrounding context', () => {
    const base = 'guarantees:\n  volume:\n';
    const next = 'guarantees:\n  volume:\n  not_null:\n    - columns:\n';

    expect(diffYamlLines(base, next)).toEqual([
      { kind: 'ctx', text: 'guarantees:' },
      { kind: 'ctx', text: '  volume:' },
      { kind: 'add', text: '  not_null:' },
      { kind: 'add', text: '    - columns:' },
    ]);
  });

  it('marks removed lines as del', () => {
    expect(diffYamlLines('a\nb\nc\n', 'a\nc\n')).toEqual([
      { kind: 'ctx', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'ctx', text: 'c' },
    ]);
  });

  it('reports no changes for identical documents', () => {
    const yaml = 'product: P\nversion: 1.0.0\n';
    expect(diffYamlLines(yaml, yaml).every(l => l.kind === 'ctx')).toBe(true);
  });

  it('falls back to plain context beyond the size budget instead of a costly diff', () => {
    const big = Array.from({ length: 700 }, (_, i) => `line: ${i}`).join('\n');
    const lines = diffYamlLines(big, `${big}\nextra: 1`);
    expect(lines).toHaveLength(701);
    expect(lines.every(l => l.kind === 'ctx')).toBe(true);
  });
});

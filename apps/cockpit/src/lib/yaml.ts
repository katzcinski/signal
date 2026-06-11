// Minimal YAML serializer for the read-only contract preview (display only —
// the API is fed JSON, so this never has to round-trip). Handles the scalar /
// array / nested-object shapes a contract uses.

function scalar(v: unknown): string {
  if (v === null || v === undefined) return '~';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  // Quote when empty, leading digit (e.g. versions), or contains YAML-significant chars.
  if (s === '' || /^[\d-]/.test(s) || /[:#{}[\],&*!|>'"%@`]/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map(item => {
        if (item && typeof item === 'object') {
          const block = toYaml(item, indent + 1).replace(/^ {2}/, '');
          return `${pad}- ${block.trimStart()}`;
        }
        return `${pad}- ${scalar(item)}`;
      })
      .join('\n');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${k}: []`;
          return `${pad}${k}:\n${toYaml(v, indent)}`;
        }
        if (v && typeof v === 'object') {
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${scalar(v)}`;
      })
      .join('\n');
  }

  return `${pad}${scalar(value)}`;
}

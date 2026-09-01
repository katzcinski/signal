// Zeilen-Diff für die YAML-Vorschau im Vertragsblatt (Design-Proposal: der
// Entwurf zeigt hinzugefügte/entfernte Zeilen direkt am Artefakt, nicht nur in
// „Prüfung & Diff"). Rein clientseitig gegen die gespeicherte Fassung — der
// verbindliche Breaking-Diff bleibt Server-Sache (G3).
export type YamlDiffKind = 'ctx' | 'add' | 'del';
export interface YamlDiffLine { kind: YamlDiffKind; text: string }

// Oberhalb dieser Zeilenzahl ist die LCS-Tabelle nicht mehr die Kosten wert;
// die Vorschau fällt dann auf reinen Kontext zurück (kein falsches Markup).
const MAX_LINES = 600;

const split = (text: string): string[] =>
  text ? text.replace(/\n+$/, '').split('\n') : [];

const asContext = (lines: string[]): YamlDiffLine[] =>
  lines.map(text => ({ kind: 'ctx' as const, text }));

/**
 * Zeilenweiser Diff (LCS) zwischen gespeicherter und Entwurfs-YAML.
 * Ohne Baseline (oder bei sehr großen Dokumenten) ist jede Zeile Kontext.
 */
export function diffYamlLines(base: string, next: string): YamlDiffLine[] {
  const a = split(base);
  const b = split(next);
  if (a.length === 0) return asContext(b);
  if (a.length > MAX_LINES || b.length > MAX_LINES) return asContext(b);

  const n = a.length;
  const m = b.length;
  // dp[i][j] = Länge der LCS von a[i..] und b[j..]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: YamlDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'ctx', text: b[j] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i] });
      i++;
    } else {
      out.push({ kind: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] });
  while (j < m) out.push({ kind: 'add', text: b[j++] });
  return out;
}

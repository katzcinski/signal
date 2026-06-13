import { coverageIconDataUri } from './coverageIcon';

// Renders a coverage-status icon as a data-URI <img> (see coverageIcon.ts).
// `label` doubles as alt text; omit it for purely decorative use beside a label.
export function CoverageIcon({ flag, size = 16, label }: { flag: string; size?: number; label?: string }) {
  return <img src={coverageIconDataUri(flag)} width={size} height={size} alt={label ?? ''} style={{ display: 'block' }} />;
}

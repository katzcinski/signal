import type { ReactNode } from 'react';

interface ObjectSummaryCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}

// Vier Karten teilen sich ein Grid: Label und Wertzeile haben feste Höhen,
// der Hinweis ist unten verankert — so fluchten alle Karten unabhängig von
// der Länge ihrer Inhalte.
export function ObjectSummaryCard({ label, value, hint, tone = 'var(--cont)' }: ObjectSummaryCardProps) {
  return (
    <div className="object-summary-card">
      <div style={{
        color: 'var(--fg-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        lineHeight: 'var(--lh-meta)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 8,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </div>
      <div style={{
        color: tone,
        fontSize: 'var(--fs-h2)',
        lineHeight: 'var(--lh-tight)',
        fontWeight: 700,
        minHeight: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s2)',
        flexWrap: 'wrap',
      }}>
        {value}
      </div>
      {hint && (
        <div style={{
          color: 'var(--fg-3)',
          fontSize: 'var(--fs-meta)',
          lineHeight: 'var(--lh-meta)',
          marginTop: 'auto',
          paddingTop: 8,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

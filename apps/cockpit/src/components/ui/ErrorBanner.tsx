import { t } from '@/i18n/strings';

interface Props {
  message?: string;
  onRetry?: () => void;
}

// Red-tinted error panel — rendered whenever a query failed, so an API outage
// is never mistaken for an empty (all-good) state.
export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div style={{
      background: 'rgba(229, 72, 77, 0.08)', border: '1px solid var(--status-crit)',
      borderRadius: 6, padding: '10px 14px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ color: 'var(--status-crit)', fontSize: 12 }}>{message ?? t.common.error}</span>
      <div style={{ flex: 1 }} />
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: 'none', border: '1px solid var(--status-crit)', color: 'var(--status-crit)',
            borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
          }}
        >
          {t.common.retry}
        </button>
      )}
    </div>
  );
}

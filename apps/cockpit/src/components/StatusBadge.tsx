import { t } from '../i18n/de'

type Status = 'pass' | 'fail' | 'warn' | 'critical' | 'error' | 'unknown' | 'skipped_stale' | string

const STATUS_CLASSES: Record<string, string> = {
  pass: 'bg-green-900 text-green-300 border border-green-700',
  fail: 'bg-red-900 text-red-300 border border-red-700',
  critical: 'bg-red-900 text-red-200 border border-red-600 font-bold',
  warn: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
  error: 'bg-red-900 text-red-400 border border-red-700',
  unknown: 'bg-gray-800 text-gray-400 border border-gray-600',
  skipped_stale: 'bg-gray-800 text-gray-400 border border-gray-500',
}

interface Props {
  status: Status
  showTooltip?: boolean
}

export function StatusBadge({ status, showTooltip }: Props) {
  const cls = STATUS_CLASSES[status] ?? STATUS_CLASSES.unknown
  const label = t.status[status as keyof typeof t.status] ?? status
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${cls}`}
      title={showTooltip && status === 'skipped_stale' ? 'Check wurde übersprungen weil Daten veraltet sind (G6)' : undefined}
    >
      {label}
    </span>
  )
}

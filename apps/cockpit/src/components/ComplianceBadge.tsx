import { t } from '../i18n/de'

const CLASSES: Record<string, string> = {
  compliant: 'bg-green-900 text-green-300 border border-green-700',
  breached: 'bg-red-900 text-red-300 border border-red-700',
  unknown: 'bg-gray-800 text-gray-400 border border-gray-600',
}

export function ComplianceBadge({ compliance }: { compliance: string }) {
  const cls = CLASSES[compliance] ?? CLASSES.unknown
  const label = t.compliance[compliance as keyof typeof t.compliance] ?? compliance
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${cls}`}>
      {label}
    </span>
  )
}

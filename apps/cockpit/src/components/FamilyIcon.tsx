/** Family icons use icon+label, never color alone (U1). */
const ICONS: Record<string, string> = {
  quality: '✓',
  obs: '📊',
  contract: '📄',
  freshness: '🕐',
  volume: '📦',
  completeness: '◎',
  uniqueness: '🔑',
  referential: '🔗',
  schema: '🗂',
}

export function FamilyIcon({ family, label }: { family: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span>{ICONS[family] ?? '?'}</span>
      {label && <span className="text-gray-400 text-xs">{label}</span>}
    </span>
  )
}

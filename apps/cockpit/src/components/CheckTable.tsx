import { CheckResult } from '../api/client'
import { StatusBadge } from './StatusBadge'
import { FamilyIcon } from './FamilyIcon'

interface Props {
  checks: CheckResult[]
  onCheckClick?: (checkName: string) => void
}

export function CheckTable({ checks, onCheckClick }: Props) {
  if (checks.length === 0) return <p className="text-gray-500 text-sm p-4">Keine Checks</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="text-left p-3">Check</th>
            <th className="text-left p-3">Typ</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Ist-Wert</th>
            <th className="text-left p-3">Erwartung</th>
            <th className="text-right p-3">Dauer (ms)</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={i} className="border-b border-gray-900 hover:bg-gray-900/40">
              <td
                className={`p-3 font-mono text-xs text-gray-300 ${onCheckClick ? 'cursor-pointer hover:text-blue-400' : ''}`}
                onClick={() => onCheckClick?.(c.check_name)}
              >{c.check_name}</td>
              <td className="p-3">
                <FamilyIcon family={c.severity ?? 'unknown'} />
              </td>
              <td className="p-3">
                <StatusBadge status={c.state === 'skipped_stale' ? 'skipped_stale' : c.passed ? 'pass' : (c.severity ?? 'fail')} showTooltip />
              </td>
              <td className="p-3 font-mono text-xs text-gray-400">{c.actual_value ?? '—'}</td>
              <td className="p-3 font-mono text-xs text-gray-500">{c.expect_expr ?? '—'}</td>
              <td className="p-3 text-right font-mono text-xs text-gray-500">{c.duration_ms?.toFixed(1) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

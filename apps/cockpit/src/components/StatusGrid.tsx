import { Link } from 'react-router-dom'
import { ObjectStatus } from '../api/client'
import { StatusBadge } from './StatusBadge'
import { ComplianceBadge } from './ComplianceBadge'
import { t } from '../i18n/de'

interface Props {
  objects: ObjectStatus[]
  filter?: string
}

export function StatusGrid({ objects, filter }: Props) {
  const filtered = filter
    ? objects.filter(o => o.object_name.toLowerCase().includes(filter.toLowerCase()))
    : objects

  if (filtered.length === 0) {
    return <p className="text-gray-500 text-sm p-4">{t.noData}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="text-left p-3">Objekt</th>
            <th className="text-left p-3">Quality</th>
            <th className="text-left p-3">Compliance</th>
            <th className="text-right p-3">Checks</th>
            <th className="text-left p-3">Letzter Run</th>
            <th className="text-left p-3">Contract-Version</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(obj => (
            <tr key={obj.object_name} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
              <td className="p-3">
                <Link
                  to={`/objects/${encodeURIComponent(obj.object_name)}`}
                  className="text-blue-400 hover:text-blue-300 font-mono"
                >
                  {obj.object_name}
                </Link>
              </td>
              <td className="p-3">
                <StatusBadge status={obj.overall_status ?? 'unknown'} showTooltip />
              </td>
              <td className="p-3">
                <ComplianceBadge compliance={obj.compliance} />
              </td>
              <td className="p-3 text-right font-mono text-xs text-gray-400">
                {obj.passed_checks}/{obj.total_checks}
              </td>
              <td className="p-3 text-gray-400 text-xs">
                {obj.last_run_at ? new Date(obj.last_run_at).toLocaleString('de-DE') : '—'}
              </td>
              <td className="p-3 text-gray-500 font-mono text-xs">
                {obj.contract_version || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

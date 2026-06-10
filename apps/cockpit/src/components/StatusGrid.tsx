import { Link } from 'react-router-dom'
import type { ObjectSummary } from '@/types'
import { StatusBadge } from './StatusBadge'
import { t } from '../i18n/de'

interface Props {
  objects: ObjectSummary[]
  filter?: string
}

export function StatusGrid({ objects, filter }: Props) {
  const filtered = filter
    ? objects.filter(o => o.name.toLowerCase().includes(filter.toLowerCase()))
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
            <th className="text-left p-3">Coverage</th>
            <th className="text-right p-3">Checks</th>
            <th className="text-left p-3">Letzter Run</th>
            <th className="text-left p-3">Contract</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(obj => (
            <tr key={obj.id} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
              <td className="p-3">
                <Link
                  to={`/objects/${encodeURIComponent(obj.id)}`}
                  className="text-blue-400 hover:text-blue-300 font-mono"
                >
                  {obj.name}
                </Link>
              </td>
              <td className="p-3">
                <StatusBadge status={obj.overall_status ?? 'unknown'} showTooltip />
              </td>
              <td className="p-3">
                <span className={`text-sm ${
                  obj.cov_flag === 'covered' ? 'text-green-400' :
                  obj.cov_flag === 'partial' ? 'text-yellow-400' :
                  obj.cov_flag === 'gap' ? 'text-red-400' :
                  'text-gray-500'
                }`}>
                  {obj.cov_flag ?? 'gap'}
                </span>
              </td>
              <td className="p-3 text-right font-mono text-xs text-gray-400">
                {obj.check_count ?? 0}
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

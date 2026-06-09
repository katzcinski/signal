import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Spinner } from '../components/Spinner'
import { ErrorMessage } from '../components/ErrorMessage'
import { t } from '../i18n/de'

export function CoverageMap() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['lineage-graph'],
    queryFn: api.getLineageGraph,
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage message={String(error)} />

  const nodes = data?.nodes ?? []
  const covered = nodes.filter(n => n.has_contract).length
  const uncovered = nodes.filter(n => !n.has_contract).length
  const staleWarning = data?.extract_age_seconds && data.extract_age_seconds > 3600

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{t.coverage}</h1>
        {staleWarning && (
          <span className="text-xs bg-yellow-900 text-yellow-300 border border-yellow-700 rounded px-2 py-1">
            ⚠ Extrakt veraltet ({Math.round(data!.extract_age_seconds! / 3600)}h)
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
        <div className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
          <p className="text-2xl font-mono font-bold text-white">{nodes.length}</p>
          <p className="text-gray-500 text-xs mt-1">Objekte gesamt</p>
        </div>
        <div className="bg-gray-900 border border-green-900 rounded p-4 text-center">
          <p className="text-2xl font-mono font-bold text-green-400">{covered}</p>
          <p className="text-gray-500 text-xs mt-1">Mit Contract ✓</p>
        </div>
        <div className="bg-gray-900 border border-yellow-900 rounded p-4 text-center">
          <p className="text-2xl font-mono font-bold text-yellow-400">{uncovered}</p>
          <p className="text-gray-500 text-xs mt-1">Ohne Contract ⚠</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">
          Objekte (Objektebene — Spaltenebene nach O3-Fix)
        </div>
        {nodes.length === 0 ? (
          <p className="text-gray-500 text-sm p-4">Kein Lineage-Graph vorhanden. Starte einen Extrakt.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left p-3">Objekt</th>
                <th className="text-left p-3">Layer</th>
                <th className="text-left p-3">Coverage</th>
                <th className="text-left p-3">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(n => {
                const name = n.id || n.technicalName || ''
                return (
                  <tr key={name} className="border-b border-gray-900 hover:bg-gray-900/50">
                    <td className="p-3 font-mono text-xs">{name}</td>
                    <td className="p-3 text-xs text-gray-400">{n.layer ?? '—'}</td>
                    <td className="p-3">
                      <span className={n.has_contract ? 'text-green-400' : 'text-yellow-400'}>
                        {n.coverage}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {!n.has_contract && (
                        <Link
                          to={`/contracts/new?dataset=${encodeURIComponent(name)}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          Contract erstellen
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

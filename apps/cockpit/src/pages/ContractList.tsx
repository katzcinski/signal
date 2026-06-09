import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { Spinner } from '../components/Spinner'
import { ErrorMessage } from '../components/ErrorMessage'
import { ComplianceBadge } from '../components/ComplianceBadge'
import { t } from '../i18n/de'

export function ContractList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['contracts'],
    queryFn: api.listContracts,
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage message={String(error)} />

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">{t.contracts}</h1>

      {(!data || data.length === 0) ? (
        <p className="text-gray-500 text-sm">{t.noData}</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left p-3">Produkt</th>
                <th className="text-left p-3">Lifecycle</th>
                <th className="text-left p-3">Version</th>
                <th className="text-left p-3">Owner</th>
                <th className="text-left p-3">Compliance</th>
                <th className="text-left p-3">Aktualisiert</th>
              </tr>
            </thead>
            <tbody>
              {data.map(c => (
                <tr key={c.product} className="border-b border-gray-900 hover:bg-gray-900/50">
                  <td className="p-3">
                    <Link to={`/contracts/${c.product}`} className="text-blue-400 hover:text-blue-300 font-mono">
                      {c.product}
                    </Link>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      c.lifecycle === 'active' ? 'bg-green-900 text-green-300' :
                      c.lifecycle === 'draft' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {t.lifecycle[c.lifecycle as keyof typeof t.lifecycle] ?? c.lifecycle}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-400">{c.version}</td>
                  <td className="p-3 text-xs text-gray-400">{c.owned_by}</td>
                  <td className="p-3"><ComplianceBadge compliance={c.compliance} /></td>
                  <td className="p-3 text-xs text-gray-500">
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString('de-DE') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

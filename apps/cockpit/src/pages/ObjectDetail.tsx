import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { CheckTable } from '../components/CheckTable'
import { ActualValueSparkline } from '../components/ActualValueSparkline'
import { StatusBadge } from '../components/StatusBadge'
import { Spinner } from '../components/Spinner'
import { ErrorMessage } from '../components/ErrorMessage'

export function ObjectDetail() {
  const { name } = useParams<{ name: string }>()
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null)
  const decoded = decodeURIComponent(name ?? '')

  const { data, isLoading, error } = useQuery({
    queryKey: ['object', decoded],
    queryFn: () => api.getObject(decoded),
  })

  const { data: history } = useQuery({
    queryKey: ['check-history', decoded, selectedCheck],
    queryFn: () => api.getCheckHistory(decoded, selectedCheck!),
    enabled: !!selectedCheck,
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage message={String(error)} />
  if (!data) return null

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm">Dashboard</Link>
        <span className="text-gray-700">/</span>
        <span className="text-sm font-mono">{decoded}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold font-mono">{decoded}</h1>
        <StatusBadge status={(data as any).overall_status ?? 'unknown'} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg mb-6">
        <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">Checks</div>
        <CheckTable
          checks={((data as any).checks ?? []).map((c: any) => ({
            ...c,
            check_name: c.check_name ?? c.name,
          }))}
          onCheckClick={setSelectedCheck}
        />
      </div>

      {selectedCheck && history && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <ActualValueSparkline data={history} checkName={selectedCheck} />
        </div>
      )}

      <p className="text-xs text-gray-600 mt-4">
        Klicke auf einen Check-Namen, um die Zeitreihe zu sehen.
      </p>
    </div>
  )
}

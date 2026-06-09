import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { Spinner } from '../components/Spinner'
import { ErrorMessage } from '../components/ErrorMessage'
import { t } from '../i18n/de'

export function ContractDetail() {
  const { product } = useParams<{ product: string }>()
  const qc = useQueryClient()
  const [showYaml, setShowYaml] = useState(false)
  const [compileResult, setCompileResult] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['contract', product],
    queryFn: () => api.getContract(product!),
    enabled: !!product,
  })

  const approveMut = useMutation({
    mutationFn: () => api.approveContract(product!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })

  const deprecateMut = useMutation({
    mutationFn: () => api.deprecateContract(product!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })

  const compileMut = useMutation({
    mutationFn: () => api.compileContract(product!, true),
    onSuccess: (res) => setCompileResult(res.checks_yaml),
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage message={String(error)} />
  if (!data) return null

  const lifecycle = String((data as any).lifecycle ?? 'draft')

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1 text-sm">
        <Link to="/contracts" className="text-gray-500 hover:text-gray-300">{t.contracts}</Link>
        <span className="text-gray-700">/</span>
        <span className="font-mono">{product}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold font-mono">{product}</h1>
          <span className={`text-xs px-2 py-0.5 rounded ${
            lifecycle === 'active' ? 'bg-green-900 text-green-300' :
            lifecycle === 'draft' ? 'bg-yellow-900 text-yellow-300' :
            'bg-gray-800 text-gray-400'
          }`}>
            {t.lifecycle[lifecycle as keyof typeof t.lifecycle] ?? lifecycle}
          </span>
        </div>

        <div className="flex gap-2">
          {lifecycle === 'draft' && (
            <button
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}
              className="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 rounded disabled:opacity-50"
            >
              {t.approve}
            </button>
          )}
          {lifecycle === 'active' && (
            <button
              onClick={() => deprecateMut.mutate()}
              disabled={deprecateMut.isPending}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
            >
              {t.deprecate}
            </button>
          )}
          <button
            onClick={() => compileMut.mutate()}
            disabled={compileMut.isPending}
            className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 rounded disabled:opacity-50"
          >
            {compileMut.isPending ? 'Kompiliert…' : t.compile}
          </button>
        </div>
      </div>

      {/* Contract summary */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <p className="text-xs text-gray-500 mb-1">Dataset</p>
          <p className="font-mono">{String((data as any).dataset ?? '—')}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <p className="text-xs text-gray-500 mb-1">Version</p>
          <p className="font-mono">{String((data as any).version ?? '—')}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <p className="text-xs text-gray-500 mb-1">Owner</p>
          <p>{String((data as any).owned_by ?? '—')}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded p-4">
          <p className="text-xs text-gray-500 mb-1">Guarantees</p>
          <p className="text-gray-400">
            {Object.keys((data as any).guarantees ?? {}).join(', ') || '—'}
          </p>
        </div>
      </div>

      {/* Guarantees detail */}
      {(data as any).guarantees && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg mb-6">
          <div className="px-4 py-3 border-b border-gray-800 text-sm font-medium">Garantien</div>
          <div className="p-4 space-y-3 text-sm">
            {Object.entries((data as any).guarantees as Record<string, unknown>).map(([key, val]) => (
              <div key={key} className="flex gap-2">
                <span className="text-gray-500 font-mono text-xs w-32 shrink-0">{key}</span>
                <span className="text-gray-300 font-mono text-xs">{JSON.stringify(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* YAML preview toggle */}
      <button
        onClick={() => setShowYaml(!showYaml)}
        className="text-xs text-gray-500 hover:text-gray-300 mb-2"
      >
        {showYaml ? 'YAML ausblenden' : 'YAML anzeigen'}
      </button>
      {showYaml && (
        <pre className="bg-gray-950 border border-gray-800 rounded p-4 text-xs font-mono text-gray-300 overflow-x-auto mb-6">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

      {/* Compile result */}
      {compileResult && (
        <div className="bg-gray-950 border border-blue-900 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-blue-400 font-medium">Kompiliertes YAML (Dry-Run)</span>
            <button onClick={() => setCompileResult(null)} className="text-gray-600 hover:text-gray-400 text-xs">×</button>
          </div>
          <pre className="text-xs font-mono text-gray-300 overflow-x-auto max-h-64">{compileResult}</pre>
        </div>
      )}

    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { t } from '../i18n/de'

interface Props {
  onClose: () => void
  onRunStarted: (runId: string) => void
}

export function RunTriggerDialog({ onClose, onRunStarted }: Props) {
  const [dataset, setDataset] = useState('')
  const [environment, setEnvironment] = useState('default')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.triggerRun({ dataset, environment, execution_mode: 'live' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['runs'] })
      onRunStarted(data.run_id)
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{t.triggerRun}</h2>

        <label className="block mb-3">
          <span className="text-xs text-gray-400 mb-1 block">Dataset</span>
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
            value={dataset}
            onChange={e => setDataset(e.target.value)}
            placeholder="z.B. Sales_Orders_View"
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs text-gray-400 mb-1 block">Environment</span>
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
            value={environment}
            onChange={e => setEnvironment(e.target.value)}
            placeholder="default"
          />
        </label>

        {mutation.error && (
          <p className="text-red-400 text-sm mb-3">{String(mutation.error)}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            Abbrechen
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!dataset || mutation.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded"
          >
            {mutation.isPending ? 'Startet…' : t.triggerRun}
          </button>
        </div>
      </div>
    </div>
  )
}

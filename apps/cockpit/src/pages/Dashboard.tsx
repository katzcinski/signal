import { useState } from 'react'
import { useObjects } from '@/api/objects'
import { StatusGrid } from '../components/StatusGrid'
import { RunTriggerDialog } from '../components/RunTriggerDialog'
import { LiveRunPanel } from '../components/LiveRunPanel'
import { Spinner } from '../components/Spinner'
import { ErrorMessage } from '../components/ErrorMessage'
import { t } from '../i18n/de'

export function Dashboard() {
  const [showTrigger, setShowTrigger] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const { data, isLoading, error } = useObjects()

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage message={String(error)} />

  const isEmpty = !data || data.length === 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">{t.dashboard}</h1>
        <button
          onClick={() => setShowTrigger(true)}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded"
        >
          {t.triggerRun}
        </button>
      </div>

      {isEmpty ? (
        <OnboardingFlow />
      ) : (
        <>
          <div className="mb-4">
            <input
              className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Objekte filtern…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <StatusGrid objects={data} filter={filter} />
          </div>
        </>
      )}

      {activeRunId && (
        <div className="mt-6">
          <LiveRunPanel runId={activeRunId} />
        </div>
      )}

      {showTrigger && (
        <RunTriggerDialog
          onClose={() => setShowTrigger(false)}
          onRunStarted={(id) => { setActiveRunId(id) }}
        />
      )}
    </div>
  )
}

function OnboardingFlow() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="text-4xl mb-4">📊</div>
      <h2 className="text-lg font-semibold mb-2">Willkommen im DQ Cockpit</h2>
      <p className="text-gray-400 text-sm mb-6">
        Noch keine Daten vorhanden. Folge diesen Schritten:
      </p>
      <ol className="text-left space-y-3 text-sm">
        {[
          'Extrakt starten: POST /api/extract',
          'Contract initialisieren: Contracts → Seed',
          'Dry-Run ausführen',
          'Erstes Ergebnis prüfen',
        ].map((step, i) => (
          <li key={i} className="flex items-start gap-3 bg-gray-900 rounded p-3 border border-gray-800">
            <span className="w-6 h-6 bg-blue-900 text-blue-300 rounded-full flex items-center justify-center text-xs shrink-0">
              {i + 1}
            </span>
            <span className="text-gray-300">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

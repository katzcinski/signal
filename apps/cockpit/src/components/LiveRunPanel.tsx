import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

interface Props {
  runId: string
}

interface LogLine {
  ts: string
  line: string
}

export function LiveRunPanel({ runId }: Props) {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // SSE connection
  useEffect(() => {
    const es = new EventSource(`/api/runs/${runId}/events`)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.event === 'done') {
          setDone(true)
          es.close()
        } else if (data.line) {
          setLogs(prev => [...prev, { ts: data.ts, line: data.line }])
        }
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [runId])

  // Polling fallback / status
  const { data: run } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId),
    refetchInterval: done ? false : 2000,
  })

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [logs])

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-sm font-mono text-gray-400">Run: {runId.slice(0, 8)}…</span>
        {run && (
          <span className={`text-xs px-2 py-0.5 rounded font-mono ${
            run.run_state === 'finished' ? 'bg-green-900 text-green-300' :
            run.run_state === 'error' ? 'bg-red-900 text-red-300' :
            'bg-yellow-900 text-yellow-300 animate-pulse'
          }`}>
            {run.run_state}
          </span>
        )}
      </div>
      <div ref={logRef} className="font-mono text-xs p-4 h-64 overflow-y-auto bg-gray-950 space-y-1">
        {logs.length === 0 && !done && (
          <span className="text-gray-600">Verbinde…</span>
        )}
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 shrink-0">{new Date(l.ts).toLocaleTimeString('de-DE')}</span>
            <span className={l.line.includes('FAIL') ? 'text-red-400' : l.line.includes('PASS') ? 'text-green-400' : 'text-gray-300'}>
              {l.line}
            </span>
          </div>
        ))}
        {done && <div className="text-gray-500 pt-2">— Fertig —</div>}
      </div>
    </div>
  )
}

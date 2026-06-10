import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { HistoryPoint } from '../api/client'

interface Props {
  data: HistoryPoint[]
  checkName: string
}

export function ActualValueSparkline({ data, checkName }: Props) {
  if (data.length === 0) return <p className="text-gray-600 text-xs">Keine Zeitreihe</p>

  const chartData = data.map(p => ({
    t: new Date(p.started_at).toLocaleDateString('de-DE'),
    v: p.actual_value != null ? Number(p.actual_value) : null,
  })).reverse()

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2 font-mono">{checkName}</p>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={chartData}>
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#6b7280' }} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 11 }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Line type="monotone" dataKey="v" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

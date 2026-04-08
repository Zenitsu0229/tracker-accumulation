import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { Trade } from '../../types'
import { fmtYen } from '../../utils/formatters'

interface Props { trades: Trade[]; height?: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0].value as number
  const color = val >= 0 ? '#4ade80' : '#f87171'
  return (
    <div style={{
      background: '#0a0a0a', border: '1px solid #2a2a2a',
      padding: '8px 12px', fontSize: '0.8rem',
    }}>
      <div style={{ color: '#777', marginBottom: 4, fontSize: '0.73rem' }}>{label}</div>
      <div style={{ color, fontWeight: 700 }}>{fmtYen(val)}</div>
    </div>
  )
}

export default function DailyChart({ trades, height = 240 }: Props) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    trades.filter((t) => t.pnl !== null).forEach((t) => {
      const k = t.closeDate.toISOString().slice(0, 10)
      map.set(k, (map.get(k) ?? 0) + t.pnl!)
    })
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, pnl]) => ({ date: date.slice(2).replace(/-/g, '/'), pnl }))
  }, [trades])

  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 10_000) return `${(v / 10_000).toFixed(0)}万`
    return v.toLocaleString()
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 24, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#666', fontSize: 10 }}
          minTickGap={24}
          axisLine={{ stroke: '#2a2a2a' }}
          tickLine={{ stroke: '#2a2a2a' }}
        />
        <YAxis
          tick={{ fill: '#666', fontSize: 11 }}
          tickFormatter={yFmt}
          width={58}
          axisLine={{ stroke: '#2a2a2a' }}
          tickLine={{ stroke: '#2a2a2a' }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
        <Bar dataKey="pnl" maxBarSize={24}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

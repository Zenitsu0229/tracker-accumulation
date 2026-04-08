import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { Trade } from '../../types'
import { fmtYen, fmtDate } from '../../utils/formatters'

interface Props { trades: Trade[] }

interface DataPoint {
  date: string; cum: number; pnl: number
  name: string; openDate: string; closeDate: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomDot(props: any) {
  const { cx, cy, payload } = props
  const fill = payload.pnl >= 0 ? '#4ade80' : '#f87171'
  return <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke="#050505" strokeWidth={1} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: DataPoint = payload[0].payload
  const pnlColor = d.pnl >= 0 ? '#4ade80' : '#f87171'
  const cumColor = d.cum >= 0 ? '#a5b4fc' : '#fca5a5'
  return (
    <div style={{
      background: '#0a0a0a', border: '1px solid #2a2a2a',
      padding: '10px 14px', minWidth: 210, fontSize: '0.8rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
    }}>
      <div style={{ color: '#e0e0e0', fontWeight: 700, marginBottom: 8, fontSize: '0.82rem' }}>{d.name}</div>
      {d.openDate && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
          <span style={{ color: '#555' }}>取引開始日</span>
          <span style={{ color: '#93c5fd' }}>{d.openDate}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
        <span style={{ color: '#555' }}>取引終了日</span>
        <span style={{ color: '#c0c0c0' }}>{d.closeDate}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
        <span style={{ color: '#555' }}>当日損益</span>
        <span style={{ color: pnlColor, fontWeight: 700 }}>{fmtYen(d.pnl)}</span>
      </div>
      <div style={{ borderTop: '1px solid #1e1e1e', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: '#555' }}>累積損益</span>
        <span style={{ color: cumColor, fontWeight: 700 }}>{fmtYen(d.cum)}</span>
      </div>
    </div>
  )
}

export default function CumulativeChart({ trades }: Props) {
  const data = useMemo<DataPoint[]>(() => {
    let cum = 0
    return trades
      .filter((t) => t.pnl !== null)
      .sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
      .map((t) => {
        cum += t.pnl!
        return {
          date: t.closeDate.toISOString().slice(0, 10),
          cum, pnl: t.pnl!,
          name: t.name,
          openDate:  t.openDate ? fmtDate(t.openDate) : '',
          closeDate: fmtDate(t.closeDate),
        }
      })
  }, [trades])

  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (a >= 10_000)    return `${(v / 10_000).toFixed(0)}万`
    return v.toLocaleString()
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={data} margin={{ top: 12, right: 24, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="cumGradPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#666', fontSize: 11 }}
          tickFormatter={(v) => v.slice(2).replace(/-/g, '/')}
          minTickGap={40}
          axisLine={{ stroke: '#2a2a2a' }}
          tickLine={{ stroke: '#2a2a2a' }}
        />
        <YAxis
          tick={{ fill: '#666', fontSize: 11 }}
          tickFormatter={yFmt}
          width={62}
          axisLine={{ stroke: '#2a2a2a' }}
          tickLine={{ stroke: '#2a2a2a' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="cum"
          stroke="#818cf8"
          strokeWidth={2}
          fill="url(#cumGradPos)"
          dot={<CustomDot />}
          activeDot={{ r: 5, fill: '#818cf8', stroke: '#050505', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

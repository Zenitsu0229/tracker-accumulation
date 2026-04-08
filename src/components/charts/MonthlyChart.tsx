import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { Trade } from '../../types'
import { fmtYen } from '../../utils/formatters'

interface Props { trades: Trade[] }

const TOOLTIP_STYLE = {
  background: '#0a0a0a', border: '1px solid #2a2a2a',
  padding: '8px 12px', fontSize: '0.8rem',
}
const AXIS_LINE = { stroke: '#2a2a2a' }
const TICK = { fill: '#666', fontSize: 11 }
const GRID_STROKE = '#1e1e1e'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const v = payload[0].value as number
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#666', marginBottom: 4, fontSize: '0.73rem' }}>{label}</div>
      <div style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{fmtYen(v)}</div>
    </div>
  )
}

const PIE_COLORS = ['#818cf8', '#a78bfa', '#60a5fa', '#f59e0b', '#4ade80', '#f87171', '#34d399', '#fb923c']

export function MonthlyBarChart({ trades }: Props) {
  const data = useMemo(() => {
    const m = new Map<string, number>()
    trades.filter((t) => t.pnl !== null).forEach((t) => {
      const k = `${t.closeDate.getFullYear()}/${String(t.closeDate.getMonth() + 1).padStart(2, '0')}`
      m.set(k, (m.get(k) ?? 0) + t.pnl!)
    })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, pnl]) => ({ month, pnl }))
  }, [trades])

  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (a >= 10_000)    return `${(v / 10_000).toFixed(0)}万`
    return v.toLocaleString()
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 24, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="month" tick={TICK} minTickGap={10} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
        <YAxis tick={TICK} tickFormatter={yFmt} width={62} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
        <Tooltip content={<BarTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
        <Bar dataKey="pnl" maxBarSize={32}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MarketPieChart({ trades }: Props) {
  const data = useMemo(() => {
    const m = new Map<string, number>()
    trades.filter((t) => t.pnl !== null && t.market && t.market !== '-').forEach((t) => {
      m.set(t.market, (m.get(t.market) ?? 0) + t.pnl!)
    })
    return [...m.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([name, rawValue]) => ({ name, value: Math.abs(rawValue), rawValue }))
  }, [trades])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = ({ name, percent }: any) =>
    percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data} cx="50%" cy="50%" outerRadius={82}
          dataKey="value" label={renderLabel} labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Legend
          formatter={(v) => <span style={{ color: '#888', fontSize: 11 }}>{v}</span>}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(_, name, props: any) => [fmtYen(props.payload.rawValue), name]}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#e0e0e0' }}
          itemStyle={{ color: '#999' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function AccountBarChart({ trades }: Props) {
  const data = useMemo(() => {
    const m = new Map<string, number>()
    trades.filter((t) => t.pnl !== null && t.account && t.account !== '-').forEach((t) => {
      m.set(t.account, (m.get(t.account) ?? 0) + t.pnl!)
    })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([account, pnl]) => ({ account, pnl }))
  }, [trades])

  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 10_000) return `${(v / 10_000).toFixed(0)}万`
    return v.toLocaleString()
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 24, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="account" tick={TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
        <YAxis tick={TICK} tickFormatter={yFmt} width={62} axisLine={AXIS_LINE} tickLine={AXIS_LINE} />
        <Tooltip content={<BarTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
        <Bar dataKey="pnl" maxBarSize={40}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

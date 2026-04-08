import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Trade, StockGroup } from '../../types'
import { fmtYen } from '../../utils/formatters'

interface Props {
  trades: Trade[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as StockGroup & { pnl: number }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)', padding: '10px 14px', fontSize: '0.82rem', minWidth: 180 }}>
      <div className="font-semibold text-white mb-1 text-xs">{d.name}</div>
      <div className={`font-bold text-base ${d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtYen(d.pnl)}</div>
      <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        {d.wins}勝 / {d.losses}敗 / 計{d.trades.length}件
      </div>
    </div>
  )
}

export default function RankingChart({ trades }: Props) {
  const { data, height } = useMemo(() => {
    const map = new Map<string, StockGroup>()
    trades.filter((t) => t.pnl !== null).forEach((t) => {
      const key = `${t.code}|${t.name}`
      if (!map.has(key)) map.set(key, { code: t.code, name: t.name, totalPnl: 0, wins: 0, losses: 0, trades: [] })
      const g = map.get(key)!
      g.totalPnl += t.pnl!
      if (t.pnl! > 0) g.wins++
      else g.losses++
      g.trades.push(t)
    })
    const sorted = [...map.values()].sort((a, b) => a.totalPnl - b.totalPnl)
    const items = sorted.map((g) => ({ ...g, pnl: g.totalPnl, label: `${g.code} ${g.name}` }))
    return { data: items, height: Math.max(300, items.length * 28 + 60) }
  }, [trades])

  const xFmt = (v: number) => {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (abs >= 10_000) return `${(v / 10_000).toFixed(0)}万`
    return v.toLocaleString()
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 80, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e3247" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#7a84a8', fontSize: 11 }} tickFormatter={xFmt} />
          <YAxis
            type="category"
            dataKey="label"
            width={160}
            tick={{ fill: '#a0aec0', fontSize: 10 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <ReferenceLine x={0} stroke="#4a5268" />
          <Bar dataKey="pnl" radius={[0, 3, 3, 0]} barSize={16}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

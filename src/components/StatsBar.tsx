import { useMemo } from 'react'
import { useStore } from '../store'
import { fmtYen, fmtPct } from '../utils/formatters'

interface StatCardProps {
  label: string
  value: string
  color?: string
  accent?: boolean
}

function StatCard({ label, value, color, accent }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${accent ? 'var(--border-bright)' : 'var(--border)'}`,
        borderLeft: accent ? '2px solid var(--accent)' : '1px solid var(--border)',
        padding: '12px 16px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  )
}

export default function StatsBar() {
  const trades = useStore((s) => s.filteredTrades)

  const stats = useMemo(() => {
    const valid = trades.filter((t) => t.pnl !== null)
    const total = valid.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const wins = valid.filter((t) => (t.pnl ?? 0) > 0)
    const losses = valid.filter((t) => (t.pnl ?? 0) < 0)
    const avgWin = wins.length ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0
    const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0
    const maxWin = wins.length ? Math.max(...wins.map((t) => t.pnl ?? 0)) : 0
    const maxLoss = losses.length ? Math.min(...losses.map((t) => t.pnl ?? 0)) : 0
    const winRate = valid.length ? (wins.length / valid.length) * 100 : 0
    const pf = losses.length && avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0
    return { total, wins: wins.length, losses: losses.length, avgWin, avgLoss, maxWin, maxLoss, winRate, pf, count: valid.length }
  }, [trades])

  if (!trades.length) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 1,
        padding: '1px',
        background: 'var(--border)',
        borderBottom: '1px solid var(--border-bright)',
      }}
    >
      <StatCard label="総実現損益" value={fmtYen(stats.total)} color={stats.total >= 0 ? '#22c55e' : '#ef4444'} accent />
      <StatCard label="取引数" value={`${stats.count} 件`} />
      <StatCard label="勝 / 負" value={`${stats.wins}W / ${stats.losses}L`} />
      <StatCard label="勝率" value={fmtPct(stats.winRate)} color={stats.winRate >= 50 ? '#22c55e' : '#ef4444'} />
      <StatCard label="平均利益" value={fmtYen(stats.avgWin)} color="#22c55e" />
      <StatCard label="平均損失" value={fmtYen(stats.avgLoss)} color="#ef4444" />
      <StatCard label="最大利益" value={fmtYen(stats.maxWin)} color="#22c55e" />
      <StatCard label="最大損失" value={fmtYen(stats.maxLoss)} color="#ef4444" />
      <StatCard label="PF" value={stats.pf ? stats.pf.toFixed(2) : '—'} color={stats.pf >= 1 ? '#22c55e' : '#ef4444'} />
    </div>
  )
}

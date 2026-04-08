import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { Trade } from '../../types'
import { fmtYen } from '../../utils/formatters'

// ── Metrics ────────────────────────────────────────────────
interface StockMetrics {
  code: string
  name: string
  count: number
  wins: number
  losses: number
  draws: number
  winRate: number
  totalPnl: number
  avgPnl: number
  maxProfit: number
  maxLoss: number
}

function buildMetrics(trades: Trade[]): StockMetrics[] {
  const map = new Map<string, StockMetrics>()
  trades.filter((t) => t.pnl !== null).forEach((t) => {
    const key = `${t.code}|${t.name}`
    if (!map.has(key)) map.set(key, {
      code: t.code, name: t.name,
      count: 0, wins: 0, losses: 0, draws: 0,
      winRate: 0, totalPnl: 0, avgPnl: 0,
      maxProfit: 0, maxLoss: 0,
    })
    const g = map.get(key)!
    g.count++
    g.totalPnl += t.pnl!
    if      (t.pnl! > 0) g.wins++
    else if (t.pnl! < 0) g.losses++
    else                  g.draws++
    if (t.pnl! > g.maxProfit) g.maxProfit = t.pnl!
    if (t.pnl! < g.maxLoss)   g.maxLoss   = t.pnl!
  })
  map.forEach((g) => {
    g.winRate = g.count > 0 ? (g.wins / g.count) * 100 : 0
    g.avgPnl  = g.count > 0 ? g.totalPnl / g.count    : 0
  })
  return [...map.values()]
}

// ── Sort config ────────────────────────────────────────────
type SortKey = 'totalPnl' | 'winRate' | 'count' | 'avgPnl' | 'maxProfit' | 'maxLoss'
type SortDir = 'asc' | 'desc'

interface SortDef {
  key: SortKey
  label: string
  defaultDir: SortDir
  description: string
}
const SORT_DEFS: SortDef[] = [
  { key: 'totalPnl',   label: '損益合計',  defaultDir: 'desc', description: '実現損益の合計' },
  { key: 'winRate',    label: '勝率',      defaultDir: 'desc', description: '利益取引の割合' },
  { key: 'count',      label: '取引回数',  defaultDir: 'desc', description: '約定済み取引数' },
  { key: 'avgPnl',     label: '平均損益',  defaultDir: 'desc', description: '1取引あたり平均損益' },
  { key: 'maxProfit',  label: '最大利益',  defaultDir: 'desc', description: '単一取引の最大利益' },
  { key: 'maxLoss',    label: '最大損失',  defaultDir: 'asc',  description: '単一取引の最大損失' },
]

// ── Sub-components ─────────────────────────────────────────
function WinRatePill({ rate, wins, losses }: { rate: number; wins: number; losses: number }) {
  const color = rate >= 60 ? '#4ade80' : rate >= 40 ? '#facc15' : '#f87171'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 44, height: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
          <div style={{ width: `${rate}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
        </div>
        <span style={{ color, fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>
          {rate.toFixed(0)}%
        </span>
      </div>
      <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
        <span style={{ color: '#4ade80' }}>{wins}W</span>
        {' / '}
        <span style={{ color: '#f87171' }}>{losses}L</span>
      </span>
    </div>
  )
}

function PnlBar({ pnl, maxAbs }: { pnl: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? (Math.abs(pnl) / maxAbs) * 48 : 0  // max 48% each side
  const isP = pnl >= 0
  return (
    <div style={{ position: 'relative', height: 8, background: 'var(--surface2)', width: '100%', minWidth: 80 }}>
      {/* Center tick */}
      <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'var(--border-bright)' }} />
      {/* Bar */}
      <div style={{
        position: 'absolute',
        ...(isP ? { left: '50%' } : { right: '50%' }),
        width: `${pct}%`,
        height: '100%',
        background: isP ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)',
      }} />
    </div>
  )
}

function SortButton({ def, active, dir, onClick }: {
  def: SortDef; active: boolean; dir: SortDir; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={def.description}
      style={{
        padding: '4px 12px',
        fontSize: '0.75rem',
        fontWeight: active ? 600 : 400,
        background: active ? 'var(--accent)' : 'var(--surface2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? '#fff' : 'var(--muted)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {def.label}
      {active && <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>{dir === 'desc' ? '↓' : '↑'}</span>}
    </button>
  )
}

function ColHeader({ label, sortKey, active, dir, onSort }: {
  label: string; sortKey: SortKey; active: boolean; dir: SortDir; onSort: (k: SortKey) => void
}) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        color: active ? 'var(--accent)' : undefined }}
    >
      {label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )
}

// ── Main component ─────────────────────────────────────────
export default function RankingTab() {
  const trades           = useStore((s) => s.filteredTrades)
  const setSelectedStock = useStore((s) => s.setSelectedStock)
  const setActiveTab     = useStore((s) => s.setActiveTab)

  const [sortKey, setSortKey] = useState<SortKey>('totalPnl')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const groups = useMemo(() => {
    const all = buildMetrics(trades)
    return all.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      return sortDir === 'desc' ? -diff : diff
    })
  }, [trades, sortKey, sortDir])

  const maxAbsPnl = useMemo(
    () => Math.max(...groups.map((g) => Math.abs(g.totalPnl)), 1),
    [groups],
  )

  const handleSort = (key: SortKey) => {
    const def = SORT_DEFS.find((d) => d.key === key)!
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir(def.defaultDir)
    }
  }

  const navigate = (code: string, name: string) => {
    setSelectedStock(`${code}|${name}`)
    setActiveTab('detail')
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>銘柄別 実現損益ランキング</div>
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 4 }}>
          {groups.length}銘柄 — 行クリックで個別チャートへ
        </span>
      </div>

      {/* Sort buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', alignSelf: 'center', marginRight: 4 }}>ソート:</span>
        {SORT_DEFS.map((def) => (
          <SortButton
            key={def.key}
            def={def}
            active={sortKey === def.key}
            dir={sortDir}
            onClick={() => handleSort(def.key)}
          />
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32, textAlign: 'center' }}>#</th>
              <th>銘柄</th>
              <ColHeader label="取引数" sortKey="count"     active={sortKey === 'count'}     dir={sortDir} onSort={handleSort} />
              <th style={{ textAlign: 'right' }}>勝率 / 勝敗</th>
              <ColHeader label="損益合計"  sortKey="totalPnl"  active={sortKey === 'totalPnl'}  dir={sortDir} onSort={handleSort} />
              <ColHeader label="平均損益"  sortKey="avgPnl"    active={sortKey === 'avgPnl'}    dir={sortDir} onSort={handleSort} />
              <ColHeader label="最大利益"  sortKey="maxProfit" active={sortKey === 'maxProfit'} dir={sortDir} onSort={handleSort} />
              <ColHeader label="最大損失"  sortKey="maxLoss"   active={sortKey === 'maxLoss'}   dir={sortDir} onSort={handleSort} />
              <th style={{ minWidth: 100 }}>損益バー</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => {
              const isP = g.totalPnl >= 0
              return (
                <tr
                  key={`${g.code}|${g.name}`}
                  onClick={() => navigate(g.code, g.name)}
                  style={{ cursor: 'pointer' }}
                  title="クリックして個別チャートを表示"
                >
                  {/* Rank */}
                  <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.72rem' }}>
                    {i + 1}
                  </td>

                  {/* Stock */}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem', marginBottom: 1 }}>
                          {g.name}
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>{g.code}</div>
                      </div>
                      <span style={{
                        marginLeft: 4, fontSize: '0.65rem', color: 'var(--muted)',
                        opacity: 0, transition: 'opacity 0.15s',
                      }} className="row-chart-hint">↗</span>
                    </div>
                  </td>

                  {/* Count */}
                  <td style={{ textAlign: 'right', color: 'var(--text)' }}>
                    {g.count}<span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>件</span>
                  </td>

                  {/* Win rate */}
                  <td style={{ textAlign: 'right' }}>
                    <WinRatePill rate={g.winRate} wins={g.wins} losses={g.losses} />
                  </td>

                  {/* Total P&L */}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: isP ? '#4ade80' : '#f87171', whiteSpace: 'nowrap' }}>
                    {fmtYen(g.totalPnl)}
                  </td>

                  {/* Avg P&L */}
                  <td style={{ textAlign: 'right', color: g.avgPnl >= 0 ? '#4ade80' : '#f87171', whiteSpace: 'nowrap' }}>
                    {fmtYen(g.avgPnl)}
                  </td>

                  {/* Max profit */}
                  <td style={{ textAlign: 'right', color: '#4ade80', whiteSpace: 'nowrap' }}>
                    {g.maxProfit > 0 ? `+${Math.round(g.maxProfit).toLocaleString()}円` : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>

                  {/* Max loss */}
                  <td style={{ textAlign: 'right', color: '#f87171', whiteSpace: 'nowrap' }}>
                    {g.maxLoss < 0 ? `${Math.round(g.maxLoss).toLocaleString()}円` : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>

                  {/* P&L bar */}
                  <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                    <PnlBar pnl={g.totalPnl} maxAbs={maxAbsPnl} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div style={{ marginTop: 12, fontSize: '0.67rem', color: 'var(--muted)', display: 'flex', gap: 16 }}>
        <span>損益バー: 中央が±0、左=損失 / 右=利益</span>
        <span>列ヘッダークリックでもソート可能</span>
      </div>
    </div>
  )
}

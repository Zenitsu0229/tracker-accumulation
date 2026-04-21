import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store'
import { StockData, Trade, TradeEntry } from '../../types'
import { fetchStockData } from '../../utils/stockApi'
import { fmtYen, fmtDate, fmtTime, fmtPct } from '../../utils/formatters'
import StockPriceChart from '../charts/StockPriceChart'
import StockSearchSelect from '../StockSearchSelect'
import { Loader2, AlertCircle } from 'lucide-react'

function SqCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px' }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

interface StockStats {
  totalPnl: number; wins: number; losses: number
  winRate: number; avgWin: number; avgLoss: number
}
function calcStats(trades: Trade[]): StockStats {
  const valid  = trades.filter((t) => t.pnl !== null)
  const totalPnl = valid.reduce((s, t) => s + t.pnl!, 0)
  const wins   = valid.filter((t) => t.pnl! > 0)
  const losses = valid.filter((t) => t.pnl! < 0)
  return {
    totalPnl,
    wins:    wins.length,
    losses:  losses.length,
    winRate: valid.length ? (wins.length / valid.length) * 100 : 0,
    avgWin:  wins.length   ? wins.reduce((s, t)   => s + t.pnl!, 0) / wins.length   : 0,
    avgLoss: losses.length ? losses.reduce((s, t) => s + t.pnl!, 0) / losses.length : 0,
  }
}

function AccountBadge({ account }: { account: string }) {
  const isNisa = account === 'NISA'
  return (
    <span style={{
      padding: '1px 6px', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.03em',
      border: `1px solid ${isNisa ? '#1d4ed8' : 'var(--border)'}`,
      background: isNisa ? 'rgba(29,78,216,0.15)' : 'var(--surface2)',
      color: isNisa ? '#60a5fa' : 'var(--muted)',
    }}>
      {account}
    </span>
  )
}

function PriceFlow({ buy, sell, isProfit }: { buy: number | null; sell: number | null; isProfit: boolean }) {
  if (buy == null || sell == null) return <span style={{ color: 'var(--muted)' }}>—</span>
  const diff = sell - buy
  const pct  = buy !== 0 ? (diff / buy) * 100 : 0
  const color = isProfit ? '#22c55e' : '#ef4444'
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
        {buy.toLocaleString()} → {sell.toLocaleString()}
      </span>
      <span style={{ color, fontSize: '0.68rem' }}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(1)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
      </span>
    </span>
  )
}

function TradeTable({ trades }: { trades: Trade[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>買付日時</th>
            <th>売付日時</th>
            <th>口座</th>
            <th>市場</th>
            <th style={{ textAlign: 'right' }}>数量</th>
            <th style={{ textAlign: 'right' }}>取得単価 → 決済単価</th>
            <th style={{ textAlign: 'right' }}>実現損益</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const isP     = (t.pnl ?? 0) >= 0
            const pnlColor = t.pnl === null ? 'var(--muted)' : isP ? '#22c55e' : '#ef4444'
            const pnlBg    = t.pnl === null ? 'transparent' : isP ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)'
            const buyTime  = fmtTime(t.openDate)
            const sellTime = fmtTime(t.closeDate)
            return (
              <tr key={i}>
                <td style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{i + 1}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#38bdf8' }}>{fmtDate(t.openDate)}</span>
                  {buyTime && <span style={{ color: '#1e40af', fontSize: '0.68rem', marginLeft: 4 }}>{buyTime}</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text)' }}>{fmtDate(t.closeDate)}</span>
                  {sellTime && <span style={{ color: 'var(--muted)', fontSize: '0.68rem', marginLeft: 4 }}>{sellTime}</span>}
                </td>
                <td><AccountBadge account={t.account} /></td>
                <td style={{ color: 'var(--muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{t.market}</td>
                <td style={{ textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {t.qty?.toLocaleString() ?? '—'}
                  <span style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>株</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <PriceFlow buy={t.avgCostYen} sell={t.price} isProfit={isP} />
                </td>
                <td style={{ textAlign: 'right', background: pnlBg, whiteSpace: 'nowrap' }}>
                  <span style={{ color: pnlColor, fontWeight: 700 }}>{fmtYen(t.pnl)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function DetailTab() {
  // 実現損益データ（P&L計算の基準）
  const filteredTrades = useStore((s) => s.filteredTrades)
  // 取引履歴の個別注文レコード（チャートマーカー専用）
  const tradeEntries   = useStore((s) => s.tradeEntries)
  const selectedStock    = useStore((s) => s.selectedStock)
  const setSelectedStock = useStore((s) => s.setSelectedStock)

  const [stockData, setStockData] = useState<StockData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error,   setError]       = useState<string | null>(null)

  // 銘柄ドロップダウン → 実現損益ベースで集計
  const stockOptions = useMemo(() => {
    const map = new Map<string, { code: string; name: string; pnl: number; count: number }>()
    filteredTrades.filter((t) => t.pnl !== null).forEach((t) => {
      const key = `${t.code}|${t.name}`
      const cur = map.get(key) ?? { code: t.code, name: t.name, pnl: 0, count: 0 }
      cur.pnl   += t.pnl!
      cur.count += 1
      map.set(key, cur)
    })
    return [...map.values()].sort((a, b) => a.pnl - b.pnl)
  }, [filteredTrades])

  useEffect(() => {
    if (!selectedStock && stockOptions.length > 0) {
      setSelectedStock(`${stockOptions[0].code}|${stockOptions[0].name}`)
    }
  }, [stockOptions, selectedStock, setSelectedStock])

  // P&L統計・テーブル用 → 実現損益のみ
  const stockTrades = useMemo(() => {
    if (!selectedStock) return []
    const [code, name] = selectedStock.split('|')
    return filteredTrades
      .filter((t) => t.code === code && t.name === name)
      .sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
  }, [filteredTrades, selectedStock])

  // チャートマーカー用 → 取引履歴の個別注文レコードを銘柄でフィルタ
  const chartEntries = useMemo<TradeEntry[]>(() => {
    if (!selectedStock) return []
    const [code] = selectedStock.split('|')
    return tradeEntries.filter((e) => e.code === code)
  }, [tradeEntries, selectedStock])

  const stats = useMemo(() => calcStats(stockTrades), [stockTrades])

  useEffect(() => {
    if (!selectedStock || !stockTrades.length) return
    const [code] = selectedStock.split('|')
    setStockData(null)
    setError(null)
    setLoading(true)
    fetchStockData(code)
      .then((data) => { setStockData(data); setLoading(false) })
      .catch((err) => { setError(err.message ?? 'データ取得に失敗しました'); setLoading(false) })
  }, [selectedStock]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!filteredTrades.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--muted)' }}>
        <span style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</span>
        <p>CSVファイルを読み込んでください</p>
      </div>
    )
  }

  const miniStats = [
    { label: '損益合計',  value: fmtYen(stats.totalPnl),  color: stats.totalPnl  >= 0 ? '#22c55e' : '#ef4444' },
    { label: '取引数',    value: `${stockTrades.length} 件`, color: undefined },
    { label: '勝 / 負',  value: `${stats.wins}W / ${stats.losses}L`, color: undefined },
    { label: '勝率',     value: fmtPct(stats.winRate),   color: stats.winRate  >= 50 ? '#22c55e' : '#ef4444' },
    { label: '平均利益', value: fmtYen(stats.avgWin),    color: '#22c55e' },
    { label: '平均損失', value: fmtYen(stats.avgLoss),   color: '#ef4444' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>銘柄選択:</span>
        <StockSearchSelect
          options={stockOptions.map((s) => ({
            value: `${s.code}|${s.name}`,
            code:  s.code,
            name:  s.name,
            pnl:   s.pnl,
            count: s.count,
          }))}
          value={selectedStock}
          onChange={setSelectedStock}
        />
        {tradeEntries.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', padding: '2px 8px', border: '1px solid var(--border)' }}>
            マーカー: 取引履歴 {chartEntries.length}件
          </span>
        )}
      </div>

      {/* Mini stats */}
      {stockTrades.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 1, background: 'var(--border)' }}>
          {miniStats.map((s) => (
            <div key={s.label} style={{ background: 'var(--surface)', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: s.color ?? 'var(--text)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Price chart — chartTrades でエントリー/決済マーカーを表示 */}
      <SqCard title="株価チャート（全期間）">
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 10, color: 'var(--muted)' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem' }}>Yahoo Finance からデータを取得中...</span>
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 8 }}>
            <AlertCircle size={24} color="#ef4444" />
            <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
              この銘柄はYahoo Financeでデータが取得できない場合があります（上場廃止・コード不一致など）
            </p>
          </div>
        )}
        {!loading && !error && stockData && (
          <div className="lw-chart-container">
            <StockPriceChart
              stockData={stockData}
              entries={chartEntries}
              trades={stockTrades}
            />
          </div>
        )}
      </SqCard>

      {/* Trade table — 実現損益のデータのみ */}
      <SqCard title="実現損益（証券会社データ）">
        <TradeTable trades={stockTrades} />
      </SqCard>
    </div>
  )
}

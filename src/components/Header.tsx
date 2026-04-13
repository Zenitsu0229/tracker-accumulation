import { useRef } from 'react'
import { Upload, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { parseCSVTradeHistory, parseCSVPlReport } from '../utils/csvParser'

export default function Header() {
  const tradeHistoryRef = useRef<HTMLInputElement>(null)
  const plReportRef = useRef<HTMLInputElement>(null)
  const { dateRange, setTradeHistory, setPlReport, setDateRange, applyFilter } = useStore()
  const hasTradeHistory = useStore((s) => s.tradeHistoryTrades.length > 0)
  const hasPlReport = useStore((s) => s.plReportTrades.length > 0)
  const tradeHistoryCount = useStore((s) => s.tradeHistoryTrades.length)
  const plReportCount = useStore((s) => s.plReportTrades.length)
  const hasData = useStore((s) => s.allTrades.length > 0)

  const handleTradeHistory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const trades = parseCSVTradeHistory(ev.target!.result as string)
      setTradeHistory(trades)
    }
    reader.readAsText(file, 'Shift-JIS')
    e.target.value = ''
  }

  const handlePlReport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const trades = parseCSVPlReport(ev.target!.result as string)
      setPlReport(trades)
    }
    reader.readAsText(file, 'Shift-JIS')
    e.target.value = ''
  }

  const handleDate = (key: 'start' | 'end', val: string) => {
    setDateRange({ ...dateRange, [key]: val })
  }

  const resetFilter = () => {
    const { allTrades } = useStore.getState()
    if (!allTrades.length) return
    const sorted = [...allTrades].sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setDateRange({ start: fmt(sorted[0].closeDate), end: fmt(sorted[sorted.length - 1].closeDate) })
    applyFilter()
  }

  const S = {
    header: {
      position: 'sticky' as const,
      top: 0,
      zIndex: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border-bright)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 24px',
      height: 52,
      flexWrap: 'wrap' as const,
    },
    brand: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
    title: { fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' },
    accent: { color: 'var(--accent)' },
    divider: { width: 1, height: 24, background: 'var(--border-bright)', margin: '0 2px' },
    dateLabel: { fontSize: '0.75rem', color: 'var(--muted)' },
    dateInput: {
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      color: 'var(--text)',
      padding: '4px 8px',
      fontSize: '0.78rem',
      outline: 'none',
    },
    filterRow: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' as const },
    uploadGroup: { display: 'flex', alignItems: 'center', gap: 6 },
    countBadge: (loaded: boolean) => ({
      fontSize: '0.7rem',
      padding: '1px 6px',
      border: `1px solid ${loaded ? 'var(--accent)' : 'var(--border)'}`,
      color: loaded ? 'var(--accent)' : 'var(--muted)',
      borderRadius: 3,
    }),
  }

  return (
    <header style={S.header}>
      {/* Brand */}
      <div style={S.brand}>
        <span>📈</span>
        <h1 style={S.title}>
          株取引 <span style={S.accent}>損益ビューア</span>
        </h1>
      </div>

      <div style={S.divider} />

      {/* Upload: 取引履歴 */}
      <div style={S.uploadGroup}>
        <button className="btn-primary" onClick={() => tradeHistoryRef.current?.click()}>
          <Upload size={13} />
          取引履歴
        </button>
        <input ref={tradeHistoryRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleTradeHistory} />
        {hasTradeHistory && <span style={S.countBadge(true)}>{tradeHistoryCount}件</span>}
      </div>

      <div style={S.divider} />

      {/* Upload: 実現損益 */}
      <div style={S.uploadGroup}>
        <button className="btn-primary" onClick={() => plReportRef.current?.click()}>
          <Upload size={13} />
          実現損益
        </button>
        <input ref={plReportRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handlePlReport} />
        {hasPlReport && <span style={S.countBadge(true)}>{plReportCount}件</span>}
      </div>

      {/* Date filter */}
      {hasData && (
        <div style={S.filterRow}>
          <span style={S.dateLabel}>期間:</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => handleDate('start', e.target.value)}
            style={S.dateInput}
          />
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>—</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => handleDate('end', e.target.value)}
            style={S.dateInput}
          />
          <button className="btn-ghost" onClick={resetFilter}>
            <RotateCcw size={11} />
            リセット
          </button>
        </div>
      )}
    </header>
  )
}

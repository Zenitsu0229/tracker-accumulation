import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { useStore } from '../../store'
import { Trade, TradeEntry, TradeNote } from '../../types'
import { fmtYen, fmtDateISO } from '../../utils/formatters'

// ── helpers ───────────────────────────────────────────────
function parseISO(s: string): Date {
  return new Date(s + 'T00:00:00')
}

function pnlLabel(pnl: number): string {
  const abs  = Math.abs(pnl)
  const sign = pnl >= 0 ? '+' : ''
  if (abs >= 1_000_000) return `${sign}${(pnl / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${sign}${(pnl / 10_000).toFixed(1)}万`
  return `${sign}${pnl.toLocaleString()}`
}

interface DayData {
  pnl: number; tradeCount: number; winCount: number; lossCount: number
}

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

// ── Auto-template builder ─────────────────────────────────
interface StockGroup { code: string; name: string; entries: TradeEntry[]; trades: Trade[] }

function groupByStock(trades: Trade[], entries: TradeEntry[]): StockGroup[] {
  const map = new Map<string, StockGroup>()
  const key = (c: string, n: string) => `${c}|${n}`
  entries.forEach((e) => {
    const k = key(e.code, e.name)
    if (!map.has(k)) map.set(k, { code: e.code, name: e.name, entries: [], trades: [] })
    map.get(k)!.entries.push(e)
  })
  trades.forEach((t) => {
    if (t.pnl === null) return
    const k = key(t.code, t.name)
    if (!map.has(k)) map.set(k, { code: t.code, name: t.name, entries: [], trades: [] })
    map.get(k)!.trades.push(t)
  })
  return [...map.values()]
}

function buildDayTemplate(trades: Trade[], entries: TradeEntry[]): string {
  const groups = groupByStock(trades, entries)
  if (groups.length === 0) return ''
  const lines: string[] = []
  groups.forEach((g) => {
    lines.push(`【${g.name}（${g.code}）】`)
    g.entries.filter((e) => e.side === '買付').forEach((e) => {
      lines.push(`  買付: ${e.qty.toLocaleString()}株 @¥${e.price.toLocaleString()}`)
    })
    g.entries.filter((e) => e.side === '売付').forEach((e) => {
      lines.push(`  売付: ${e.qty.toLocaleString()}株 @¥${e.price.toLocaleString()}`)
    })
    if (g.trades.length > 0) {
      const total = g.trades.reduce((s, t) => s + (t.pnl ?? 0), 0)
      lines.push(`  損益: ${total >= 0 ? '+' : ''}${Math.round(total).toLocaleString()}円`)
    }
    lines.push('')
  })
  lines.push('▼ エントリー根拠\n- \n')
  lines.push('▼ 反省・気づき\n- \n')
  lines.push('▼ 次回の課題\n- ')
  return lines.join('\n')
}

function buildTemplateForKey(
  trades: Trade[], entries: TradeEntry[], stockKey: string,
): string {
  if (!stockKey) return buildDayTemplate(trades, entries)
  const [code, name] = stockKey.split('|')
  return buildDayTemplate(
    trades.filter((t) => t.code === code && t.name === name),
    entries.filter((e) => e.code === code && e.name === name),
  )
}

// ── styles ────────────────────────────────────────────────
const S = {
  sectionTitle: {
    fontSize: '0.62rem', color: 'var(--muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 6,
  } as React.CSSProperties,

  textarea: {
    width: '100%', background: 'var(--surface2)',
    border: '1px solid var(--border)', color: 'var(--text)',
    padding: '12px 14px', fontSize: '0.85rem',
    resize: 'vertical' as const, outline: 'none',
    lineHeight: 1.8, boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  } as React.CSSProperties,

  select: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '7px 10px',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  navBtn: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text)', cursor: 'pointer',
    fontSize: '1rem', padding: '3px 12px', lineHeight: 1.6,
  } as React.CSSProperties,

  btn: {
    display: 'inline-flex' as const, alignItems: 'center' as const,
    gap: 5, padding: '5px 14px', fontSize: '0.78rem',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text)', cursor: 'pointer',
  } as React.CSSProperties,
}

function smallBtn(color: string): React.CSSProperties {
  return {
    background: 'none', border: `1px solid ${color}55`,
    color, cursor: 'pointer', fontSize: '0.68rem', padding: '2px 8px',
  }
}

// ═══════════════════════════════════════════════════════════
export default function CalendarTab() {
  const filteredTrades = useStore((s) => s.filteredTrades)
  const tradeEntries   = useStore((s) => s.tradeEntries)
  const notes          = useStore((s) => s.notes)
  const addNote        = useStore((s) => s.addNote)
  const updateNote     = useStore((s) => s.updateNote)
  const deleteNote     = useStore((s) => s.deleteNote)
  const importNotes    = useStore((s) => s.importNotes)

  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const inputZoneRef = useRef<HTMLDivElement>(null)

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [noteInput,    setNoteInput]    = useState('')
  const [noteStockKey, setNoteStockKey] = useState('')
  const [savedFlash,   setSavedFlash]   = useState(false)
  const [editId,       setEditId]       = useState<string | null>(null)
  const [editText,     setEditText]     = useState('')

  // ── Aggregate day data（実現損益のみ）─────────────────────
  const dayData = useMemo(() => {
    const map = new Map<string, DayData>()
    const get = (k: string): DayData =>
      map.get(k) ?? { pnl: 0, tradeCount: 0, winCount: 0, lossCount: 0 }
    filteredTrades.forEach((t) => {
      if (t.pnl === null) return
      const k = fmtDateISO(t.closeDate)
      const d = get(k)
      d.pnl += t.pnl; d.tradeCount++
      if (t.pnl > 0) d.winCount++; else if (t.pnl < 0) d.lossCount++
      map.set(k, d)
    })
    return map
  }, [filteredTrades])

  const notesByDate = useMemo(() => {
    const map = new Map<string, TradeNote[]>()
    notes.forEach((n) => {
      const list = map.get(n.date) ?? []; list.push(n); map.set(n.date, list)
    })
    return map
  }, [notes])

  const calendarDays = useMemo(() => {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7
    const lastDate = new Date(y, m + 1, 0).getDate()
    const days: (string | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= lastDate; d++)
      days.push(fmtDateISO(new Date(y, m, d)))
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [currentMonth])

  const selTrades = useMemo(() =>
    selectedDate ? filteredTrades.filter((t) => fmtDateISO(t.closeDate) === selectedDate) : [],
    [filteredTrades, selectedDate])

  const selEntries = useMemo(() =>
    selectedDate ? tradeEntries.filter((e) => fmtDateISO(e.date) === selectedDate) : [],
    [tradeEntries, selectedDate])

  const noteStockOptions = useMemo(() => {
    const opts: { key: string; code: string; name: string; label: string }[] = [
      { key: '', code: '', name: '', label: '日単位（銘柄指定なし）' },
    ]
    const seen = new Set<string>()
    selTrades.filter((t) => t.pnl !== null).forEach((t) => {
      const k = `${t.code}|${t.name}`
      if (!seen.has(k)) { seen.add(k); opts.push({ key: k, code: t.code, name: t.name, label: `${t.name}（${t.code}）` }) }
    })
    selEntries.forEach((e) => {
      const k = `${e.code}|${e.name}`
      if (!seen.has(k)) { seen.add(k); opts.push({ key: k, code: e.code, name: e.name, label: `${e.name}（${e.code}）` }) }
    })
    return opts
  }, [selTrades, selEntries])

  // ── Auto-fill + scroll when date selected ────────────────
  useEffect(() => {
    if (!selectedDate) return
    const firstStock = noteStockOptions[1]
    const firstKey   = firstStock ? firstStock.key : ''
    setNoteStockKey(firstKey)
    setNoteInput(buildTemplateForKey(selTrades, selEntries, firstKey))
    setSavedFlash(false)
    setEditId(null)
    // Scroll to input zone then focus textarea
    setTimeout(() => {
      inputZoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => textareaRef.current?.focus(), 200)
    }, 50)
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────
  const prevMonth = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToToday = () => {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(fmtDateISO(now))
  }

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr))
  }

  const handleAddNote = () => {
    if (!selectedDate || !noteInput.trim()) return
    const opt = noteStockOptions.find((o) => o.key === noteStockKey)
    addNote({ date: selectedDate, code: opt?.code ?? '', name: opt?.name ?? '', note: noteInput.trim() })
    setNoteInput('')
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
    textareaRef.current?.focus()
  }

  const handleExport = () => {
    const data = { version: '1.0', exportedAt: new Date().toISOString(), notes }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `trade-notes-${fmtDateISO(new Date())}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target!.result as string)
        if (Array.isArray(data.notes)) importNotes(data.notes as TradeNote[])
        else alert('notes フィールドが見つかりません')
      } catch { alert('JSONの読み込みに失敗しました') }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const today = fmtDateISO(new Date())

  const monthSummary = useMemo(() => {
    const y = currentMonth.getFullYear(); const m = currentMonth.getMonth()
    let pnl = 0; let days = 0; let wins = 0; let losses = 0
    dayData.forEach((d, k) => {
      const dt = parseISO(k)
      if (dt.getFullYear() !== y || dt.getMonth() !== m || !d.tradeCount) return
      pnl += d.pnl; days++
      if (d.pnl > 0) wins++; else if (d.pnl < 0) losses++
    })
    return { pnl, days, wins, losses }
  }, [dayData, currentMonth])

  const monthChartData = useMemo(() => {
    const y = currentMonth.getFullYear(); const m = currentMonth.getMonth()
    const map = new Map<string, number>()
    filteredTrades.forEach((t) => {
      if (t.pnl === null) return
      const dt = t.closeDate
      if (dt.getFullYear() !== y || dt.getMonth() !== m) return
      const k = fmtDateISO(dt)
      map.set(k, (map.get(k) ?? 0) + t.pnl)
    })
    let cum = 0
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fullDate, pnl]) => {
      cum += pnl
      return { fullDate, date: fullDate.slice(5).replace('-', '/'), pnl, cum }
    })
  }, [filteredTrades, currentMonth])

  const selDayNotes = selectedDate ? (notesByDate.get(selectedDate) ?? []) : []

  // ── render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={S.navBtn} onClick={prevMonth}>‹</button>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', minWidth: 130, textAlign: 'center' }}>
            {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
          </span>
          <button style={S.navBtn} onClick={nextMonth}>›</button>
          <button style={{ ...S.btn, fontSize: '0.72rem', padding: '3px 10px' }} onClick={goToToday}>今月</button>
        </div>
        {monthSummary.days > 0 && (
          <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', marginLeft: 8 }}>
            <span style={{ color: monthSummary.pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{pnlLabel(monthSummary.pnl)}</span>
            <span style={{ color: 'var(--muted)' }}>{monthSummary.days}取引日</span>
            <span style={{ color: '#4ade80' }}>{monthSummary.wins}勝</span>
            <span style={{ color: '#f87171' }}>{monthSummary.losses}敗</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <label style={{ ...S.btn, cursor: 'pointer' }}>
            JSON入力
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          <button style={S.btn} onClick={handleExport}>JSON出力</button>
        </div>
      </div>

      {/* ── Calendar（全幅）── */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {WEEKDAYS.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', padding: '3px 0', color: i === 5 ? '#60a5fa' : i === 6 ? '#f87171' : 'var(--muted)' }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {calendarDays.map((dateStr, idx) => {
            if (!dateStr) return <div key={idx} style={{ minHeight: 72, background: 'rgba(255,255,255,0.02)' }} />
            const data       = dayData.get(dateStr)
            const dayNotes   = notesByDate.get(dateStr) ?? []
            const isSelected = dateStr === selectedDate
            const isToday    = dateStr === today
            const dow        = (parseISO(dateStr).getDay() + 6) % 7
            const isSat      = dow === 5; const isSun = dow === 6
            const hasPnl     = data && data.tradeCount > 0
            const dayNum     = parseInt(dateStr.slice(8))
            const bg         = hasPnl ? (data!.pnl > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)') : 'var(--surface)'
            return (
              <div
                key={dateStr}
                onClick={() => handleSelectDate(dateStr)}
                style={{
                  minHeight: 72, padding: '5px 7px', background: bg,
                  border: isSelected ? '1px solid var(--accent)' : isToday ? '1px solid #475569' : '1px solid var(--border)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, transition: 'filter 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: isToday ? 700 : 400, color: isSat ? '#60a5fa' : isSun ? '#f87171' : 'var(--text)' }}>
                  {isToday ? `${dayNum}●` : dayNum}
                </span>
                {hasPnl && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, lineHeight: 1.2, color: data!.pnl > 0 ? '#4ade80' : '#f87171' }}>
                    {pnlLabel(data!.pnl)}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 'auto' }}>
                  {data && data.tradeCount > 0 && (
                    <span style={{ fontSize: '0.58rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 3px' }}>
                      {data.tradeCount}件
                    </span>
                  )}
                  {data && data.winCount > 0 && (
                    <span style={{ fontSize: '0.58rem', color: '#4ade80', background: 'rgba(74,222,128,0.12)', padding: '1px 3px' }}>
                      勝{data.winCount}
                    </span>
                  )}
                  {data && data.lossCount > 0 && (
                    <span style={{ fontSize: '0.58rem', color: '#f87171', background: 'rgba(248,113,113,0.12)', padding: '1px 3px' }}>
                      負{data.lossCount}
                    </span>
                  )}
                  {dayNotes.length > 0 && (
                    <span style={{ fontSize: '0.58rem', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '1px 3px' }}>
                      📝{dayNotes.length}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Monthly P&L Chart ── */}
      {monthChartData.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px 20px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月 — 損益チャート
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={monthChartData}
              margin={{ top: 8, right: 24, left: 4, bottom: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(chartData: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                const fullDate = chartData?.activePayload?.[0]?.payload?.fullDate
                if (fullDate) handleSelectDate(fullDate)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
              <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} axisLine={{ stroke: '#2a2a2a' }} tickLine={{ stroke: '#2a2a2a' }} minTickGap={16} />
              <YAxis
                tick={{ fill: '#666', fontSize: 10 }} width={62}
                axisLine={{ stroke: '#2a2a2a' }} tickLine={{ stroke: '#2a2a2a' }}
                tickFormatter={(v: number) => {
                  const a = Math.abs(v)
                  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                  if (a >= 10_000)    return `${(v / 10_000).toFixed(0)}万`
                  return v.toLocaleString()
                }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                content={({ active, payload, label }: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                  if (!active || !payload?.length) return null
                  const pnl = payload.find((p: any) => p.dataKey === 'pnl')?.value as number // eslint-disable-line @typescript-eslint/no-explicit-any
                  const cum = payload.find((p: any) => p.dataKey === 'cum')?.value as number // eslint-disable-line @typescript-eslint/no-explicit-any
                  return (
                    <div style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', padding: '8px 12px', fontSize: '0.8rem' }}>
                      <div style={{ color: '#777', marginBottom: 6, fontSize: '0.72rem' }}>{label}</div>
                      {pnl != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
                          <span style={{ color: '#777' }}>日次損益</span>
                          <span style={{ color: pnl >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{fmtYen(pnl)}</span>
                        </div>
                      )}
                      {cum != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                          <span style={{ color: '#777' }}>月内累積</span>
                          <span style={{ color: cum >= 0 ? '#818cf8' : '#fca5a5', fontWeight: 700 }}>{fmtYen(cum)}</span>
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#555' }}>クリックで記録を開く</div>
                    </div>
                  )
                }}
              />
              <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
              <Bar dataKey="pnl" maxBarSize={28} name="日次損益">
                {monthChartData.map((d, i) => {
                  const isSel     = d.fullDate === selectedDate
                  const baseAlpha = isSel ? '1)' : '0.7)'
                  return (
                    <Cell
                      key={i}
                      fill={`${d.pnl >= 0 ? 'rgba(74,222,128,' : 'rgba(248,113,113,'}${baseAlpha}`}
                      stroke={isSel ? (d.pnl >= 0 ? '#4ade80' : '#f87171') : 'none'}
                      strokeWidth={isSel ? 2 : 0}
                    />
                  )
                })}
              </Bar>
              <Line type="monotone" dataKey="cum" stroke="#818cf8" strokeWidth={2}
                dot={{ r: 3, fill: '#818cf8', stroke: '#050505', strokeWidth: 1 }}
                activeDot={{ r: 5 }} name="月内累積"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: 8 }}>
            {[
              { color: 'rgba(74,222,128,0.7)',  label: '日次利益', line: false },
              { color: 'rgba(248,113,113,0.7)', label: '日次損失', line: false },
              { color: '#818cf8',               label: '月内累積', line: true  },
            ].map(({ color, label, line }) => (
              <span key={label} style={{ fontSize: '0.68rem', color, display: 'flex', alignItems: 'center', gap: 5 }}>
                {line
                  ? <span style={{ display: 'inline-block', width: 18, height: 2, background: color, verticalAlign: 'middle' }} />
                  : <span style={{ display: 'inline-block', width: 10, height: 10, background: color }} />
                }
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Note Input Zone（チャート下・全幅）── */}
      <div
        ref={inputZoneRef}
        style={{
          background: 'var(--surface)', border: selectedDate ? '1px solid var(--accent)' : '1px solid var(--border)',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Zone header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em' }}>
              反省・記録
            </span>
            {selectedDate ? (
              <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 700 }}>
                {selectedDate.replace(/-/g, '/')}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                カレンダーまたはチャートの日付をクリックしてください
              </span>
            )}
          </div>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '2px 6px' }}
            >✕</button>
          )}
        </div>

        {selectedDate ? (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0 }}>

            {/* Left: trade summary + existing notes */}
            <div style={{ borderRight: '1px solid var(--border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 520 }}>

              {/* Realized P&L */}
              {selTrades.length > 0 && (
                <section>
                  <div style={S.sectionTitle}>実現損益</div>
                  {selTrades.map((t, i) => {
                    const isP = (t.pnl ?? 0) >= 0
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text)' }}>{t.name}<span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: '0.7rem' }}>({t.code})</span></span>
                        <span style={{ color: isP ? '#4ade80' : '#f87171', fontWeight: 700 }}>{fmtYen(t.pnl)}</span>
                      </div>
                    )
                  })}
                  {selTrades.length > 1 && (() => {
                    const total = selTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.78rem', fontWeight: 700 }}>
                        <span style={{ color: 'var(--muted)' }}>合計</span>
                        <span style={{ color: total >= 0 ? '#4ade80' : '#f87171' }}>{fmtYen(total)}</span>
                      </div>
                    )
                  })()}
                </section>
              )}

              {/* Trade entries */}
              {selEntries.length > 0 && (
                <section>
                  <div style={S.sectionTitle}>取引履歴</div>
                  {selEntries.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.75rem' }}>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: e.side === '買付' ? '#38bdf8' : '#a78bfa', fontWeight: 600, fontSize: '0.7rem' }}>{e.side}</span>
                        <span style={{ color: 'var(--text)' }}>{e.name}</span>
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{e.qty.toLocaleString()}株 @¥{e.price.toLocaleString()}</span>
                    </div>
                  ))}
                </section>
              )}

              {selTrades.length === 0 && selEntries.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>この日の取引データなし</p>
              )}

              {/* Existing notes */}
              {selDayNotes.length > 0 && (
                <section>
                  <div style={S.sectionTitle}>保存済み記録 ({selDayNotes.length})</div>
                  {selDayNotes.map((n) => (
                    <div key={n.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: 10, marginBottom: 6 }}>
                      {editId === n.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            style={{ ...S.textarea, minHeight: 100, fontSize: '0.78rem' }}
                            rows={4}
                            autoFocus
                            onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') { updateNote(n.id, editText); setEditId(null) } }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={smallBtn('#4ade80')} onClick={() => { updateNote(n.id, editText); setEditId(null) }}>保存</button>
                            <button style={smallBtn('#94a3b8')} onClick={() => setEditId(null)}>×</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {n.code && <div style={{ fontSize: '0.65rem', color: '#60a5fa', marginBottom: 4 }}>{n.name || n.code}</div>}
                          <p style={{ fontSize: '0.76rem', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{n.note}</p>
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button style={smallBtn('#818cf8')} onClick={() => { setEditId(n.id); setEditText(n.note) }}>編集</button>
                            <button style={smallBtn('#f87171')} onClick={() => deleteNote(n.id)}>削除</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>

            {/* Right: large input area */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Stock selector + template button */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: 4 }}>銘柄</div>
                  <select
                    value={noteStockKey}
                    onChange={(e) => {
                      const key = e.target.value
                      setNoteStockKey(key)
                      setNoteInput(buildTemplateForKey(selTrades, selEntries, key))
                      setTimeout(() => textareaRef.current?.focus(), 0)
                    }}
                    style={S.select}
                  >
                    {noteStockOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                {(selTrades.length > 0 || selEntries.length > 0) && (
                  <div style={{ paddingTop: 20 }}>
                    <button
                      style={{ ...smallBtn('#60a5fa'), padding: '5px 12px', fontSize: '0.72rem' }}
                      onClick={() => { setNoteInput(buildTemplateForKey(selTrades, selEntries, noteStockKey)); textareaRef.current?.focus() }}
                    >
                      テンプレート再挿入
                    </button>
                  </div>
                )}
              </div>

              {/* Textarea — large */}
              <textarea
                ref={textareaRef}
                placeholder={`${selectedDate?.replace(/-/g, '/')} の反省・気づき・次回の課題を記入...\n\nCtrl+Enter で保存`}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                style={{ ...S.textarea, flex: 1, minHeight: 340 }}
                onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') handleAddNote() }}
              />

              {/* Save row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: savedFlash ? '#4ade80' : 'var(--muted)', transition: 'color 0.3s' }}>
                  {savedFlash ? '✓ 保存しました' : 'Ctrl+Enter で保存'}
                </span>
                <button
                  onClick={handleAddNote}
                  disabled={!noteInput.trim()}
                  style={{
                    padding: '8px 32px', fontSize: '0.88rem', fontWeight: 700,
                    background: noteInput.trim() ? 'var(--accent)' : 'var(--surface2)',
                    color: noteInput.trim() ? '#fff' : 'var(--muted)',
                    border: 'none', cursor: noteInput.trim() ? 'pointer' : 'default',
                    letterSpacing: '0.04em',
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Placeholder when no date selected
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
            上のカレンダーまたは損益チャートの日付をクリックすると、記録を入力できます
          </div>
        )}
      </div>

      {/* ── Record table ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>記録一覧</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', padding: '1px 8px', border: '1px solid var(--border)' }}>{notes.length}件</span>
        </div>
        {notes.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
            記録がありません
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>日付</th>
                  <th style={{ width: 140 }}>銘柄</th>
                  <th>メモ</th>
                  <th style={{ width: 90, textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...notes].sort((a, b) => b.date.localeCompare(a.date)).map((n) => (
                  <tr key={n.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}
                        onClick={() => {
                          const d = parseISO(n.date)
                          setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                          setSelectedDate(n.date)
                        }}
                      >
                        {n.date.replace(/-/g, '/')}
                      </button>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {n.name ? n.name : ''}{n.code ? ` (${n.code})` : '—'}
                    </td>
                    <td>
                      {editId === n.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            style={{ ...S.textarea, minWidth: 200, flex: 1, minHeight: 80, fontSize: '0.78rem' }}
                            rows={3}
                            autoFocus
                            onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') { updateNote(n.id, editText); setEditId(null) } }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                            <button style={smallBtn('#4ade80')} onClick={() => { updateNote(n.id, editText); setEditId(null) }}>保存</button>
                            <button style={smallBtn('#94a3b8')} onClick={() => setEditId(null)}>×</button>
                          </div>
                        </div>
                      ) : (
                        <span style={{
                          fontSize: '0.78rem', color: 'var(--text)',
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap',
                        }}>
                          {n.note}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button style={smallBtn('#818cf8')} onClick={() => { setEditId(n.id); setEditText(n.note) }}>編集</button>
                        <button style={smallBtn('#f87171')} onClick={() => deleteNote(n.id)}>削除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

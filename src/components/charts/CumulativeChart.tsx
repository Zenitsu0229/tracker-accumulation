import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Brush,
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

const BTN = (active = false) => ({
  padding: '3px 10px',
  fontSize: '0.75rem',
  background: active ? 'var(--accent)' : 'var(--surface2)',
  color: active ? '#fff' : 'var(--muted)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  lineHeight: 1.6,
  transition: 'all 0.12s',
} as React.CSSProperties)

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

  const last = Math.max(0, data.length - 1)
  const [start, setStart] = useState(0)
  const [end,   setEnd]   = useState(last)

  // データが変わったら全期間にリセット
  useEffect(() => {
    setStart(0)
    setEnd(Math.max(0, data.length - 1))
  }, [data])

  const isFullRange = start === 0 && end === last

  const zoomIn = () => {
    const range = end - start
    if (range < 4) return
    const step = Math.max(1, Math.floor(range / 4))
    setStart(Math.min(start + step, end - 2))
    setEnd(Math.max(end - step, start + 2))
  }

  const zoomOut = () => {
    const range = end - start
    const step = Math.max(1, Math.floor(range / 3))
    setStart(Math.max(0, start - step))
    setEnd(Math.min(last, end + step))
  }

  const resetZoom = () => { setStart(0); setEnd(last) }

  // マウスホイールでズーム（non-passive で preventDefault するため ref を使用）
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const range = end - start
      if (e.deltaY < 0) {
        // ズームイン
        if (range < 4) return
        const step = Math.max(1, Math.floor(range / 6))
        setStart((s) => Math.min(s + step, end - 2))
        setEnd((en) => Math.max(en - step, start + 2))
      } else {
        // ズームアウト
        const step = Math.max(1, Math.floor(range / 4))
        setStart((s) => Math.max(0, s - step))
        setEnd((en) => Math.min(last, en + step))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [start, end, last])

  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (a >= 10_000)    return `${(v / 10_000).toFixed(0)}万`
    return v.toLocaleString()
  }

  // 表示件数バッジ
  const visibleCount = end - start + 1

  return (
    <div>
      {/* ズームコントロール */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginRight: 4 }}>
          {visibleCount} / {data.length} 件
        </span>
        <button style={BTN()} onClick={zoomIn}  title="ズームイン (ホイール↑)">＋</button>
        <button style={BTN()} onClick={zoomOut} title="ズームアウト (ホイール↓)">－</button>
        <button style={BTN(!isFullRange)} onClick={resetZoom} title="全期間表示">全期間</button>
      </div>

      <div ref={wrapRef} style={{ cursor: 'crosshair' }}>
        <ResponsiveContainer width="100%" height={360}>
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
            <Brush
              dataKey="date"
              startIndex={start}
              endIndex={end}
              onChange={(range) => {
                if (range.startIndex != null && range.endIndex != null) {
                  setStart(range.startIndex)
                  setEnd(range.endIndex)
                }
              }}
              height={28}
              stroke="#2a2a2a"
              fill="#0a0a0a"
              travellerWidth={7}
              tickFormatter={(v) => String(v).slice(2, 7).replace(/-/g, '/')}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

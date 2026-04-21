import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  CandlestickData,
  SeriesMarker,
  Time,
  CrosshairMode,
  HistogramData,
  LineStyle,
  LineData,
} from 'lightweight-charts'
import { StockData, StockCandle, Trade, TradeEntry } from '../../types'
import { fmtYen, fmtDate } from '../../utils/formatters'
import { nearestTradingDay } from '../../utils/stockApi'

interface Props {
  stockData: StockData
  /** 取引履歴の個別注文レコード — チャートマーカー専用 */
  entries: TradeEntry[]
  /** 実現損益トレード — クリック時のP&L表示用 */
  trades: Trade[]
}

type BusinessDay = { year: number; month: number; day: number }
function timeToString(time: Time): string {
  if (typeof time === 'string') return time
  if (typeof time === 'number') {
    const jst = new Date(time * 1000 + 9 * 3600 * 1000)
    return jst.toISOString().slice(0, 10)
  }
  const bd = time as unknown as BusinessDay
  return `${bd.year}-${String(bd.month).padStart(2, '0')}-${String(bd.day).padStart(2, '0')}`
}

// SMA calculation
function calcMA(candles: StockCandle[], period: number): LineData[] {
  const result: LineData[] = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close
    result.push({ time: candles[i].time as Time, value: Math.round(sum / period) })
  }
  return result
}

// Find the closest realized P&L trade for a given sell entry (within ±3 days)
function findMatchingTrade(entry: TradeEntry, trades: Trade[]): Trade | null {
  let best: Trade | null = null
  let bestDiff = Infinity
  for (const t of trades) {
    const diff = Math.abs(t.closeDate.getTime() - entry.date.getTime()) / 86400000
    if (diff > 3) continue
    const qtyMatch = t.qty === entry.qty
    const score = diff - (qtyMatch ? 0.5 : 0)
    if (score < bestDiff) { bestDiff = score; best = t }
  }
  return best
}

const C = {
  markerBuy:     '#38bdf8',
  markerProfit:  '#4ade80',
  markerLoss:    '#f87171',
  labelAcquire:  '#0369a1',
  labelProfit:   '#15803d',
  labelLoss:     '#b91c1c',
  candleUp:      '#22c55e',
  candleDown:    '#ef4444',
  volUp:         'rgba(34,197,94,0.15)',
  volDown:       'rgba(239,68,68,0.15)',
  ma5:           '#fbbf24',
  ma25:          '#818cf8',
  ma75:          '#fb923c',
  bg:            '#0d0d14',
  grid:          '#1a1a28',
  border:        '#2a2a3e',
  text:          '#94a3b8',
  textDim:       '#4a5568',
  crosshair:     '#818cf8',
  crosshairLabel:'#4338ca',
}

const MA_DEFS = [
  { period: 5,  color: C.ma5,  label: '5日' },
  { period: 25, color: C.ma25, label: '25日' },
  { period: 75, color: C.ma75, label: '75日' },
] as const

interface ClickInfo {
  time: string
  buys:  TradeEntry[]
  sells: TradeEntry[]
  matchedTrades: Trade[]  // P&L trades matching sell entries on this day
}

export default function StockPriceChart({ stockData, entries, trades }: Props) {
  const mainRef       = useRef<HTMLDivElement>(null)
  const mainChartRef  = useRef<IChartApi | null>(null)
  const candleSerRef  = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSerRef  = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ma5SerRef     = useRef<ISeriesApi<'Line'> | null>(null)
  const ma25SerRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const ma75SerRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const buyMapRef     = useRef<Map<string, TradeEntry[]>>(new Map())
  const sellMapRef    = useRef<Map<string, TradeEntry[]>>(new Map())
  const [clickInfo, setClickInfo] = useState<ClickInfo | null>(null)
  const [visibleMAs, setVisibleMAs] = useState<Set<number>>(new Set([25, 75]))

  // ── 1. Create chart ───────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current) return

    const main = createChart(mainRef.current, {
      localization: { dateFormat: 'yyyy/MM/dd' },
      layout: {
        background: { color: C.bg },
        textColor: C.text,
        fontSize: 11,
        fontFamily: "'Inter', 'Hiragino Sans', sans-serif",
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair + '88', width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: C.crosshairLabel },
        horzLine: { color: C.crosshair + '66', width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: C.crosshairLabel },
      },
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.06, bottom: 0.22 } },
      timeScale: { borderColor: C.border, timeVisible: false, barSpacing: 6 },
      autoSize: true,
    })
    mainChartRef.current = main

    const candleSer = main.addCandlestickSeries({
      upColor: C.candleUp, downColor: C.candleDown,
      borderUpColor: C.candleUp, borderDownColor: C.candleDown,
      wickUpColor: C.candleUp, wickDownColor: C.candleDown,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    candleSerRef.current = candleSer

    const volSer = main.addHistogramSeries({
      color: 'rgba(129,140,248,0.20)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    })
    main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } })
    volumeSerRef.current = volSer

    const makeMA = (color: string, visible: boolean) => main.addLineSeries({
      color, lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    ma5SerRef.current  = makeMA(C.ma5,  false)
    ma25SerRef.current = makeMA(C.ma25, true)
    ma75SerRef.current = makeMA(C.ma75, true)

    // Click handler
    main.subscribeClick((param) => {
      const cs = candleSerRef.current
      if (!cs) return
      priceLinesRef.current.forEach((pl) => { try { cs.removePriceLine(pl) } catch { /**/ } })
      priceLinesRef.current = []
      if (!param.time) { setClickInfo(null); return }

      const ts  = timeToString(param.time)
      const buys  = buyMapRef.current.get(ts)  ?? []
      const sells = sellMapRef.current.get(ts) ?? []
      if (!buys.length && !sells.length) { setClickInfo(null); return }

      // Match sells with realized P&L trades for P&L display
      const matchedTrades: Trade[] = []
      for (const sell of sells) {
        const t = findMatchingTrade(sell, trades)
        if (t && !matchedTrades.includes(t)) matchedTrades.push(t)
      }

      setClickInfo({ time: ts, buys, sells, matchedTrades })

      // Price lines
      const lines: IPriceLine[] = []
      const seenPrices = new Set<number>()

      for (const buy of buys) {
        if (!seenPrices.has(buy.price)) {
          seenPrices.add(buy.price)
          lines.push(cs.createPriceLine({ price: buy.price, color: C.labelAcquire, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `買 ¥${buy.price.toLocaleString()}` }))
        }
      }
      for (const t of matchedTrades) {
        if (t.avgCostYen != null && !seenPrices.has(t.avgCostYen)) {
          seenPrices.add(t.avgCostYen)
          lines.push(cs.createPriceLine({ price: t.avgCostYen, color: C.labelAcquire, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `取得 ¥${t.avgCostYen.toLocaleString()}` }))
        }
        if (t.price != null && !seenPrices.has(t.price)) {
          seenPrices.add(t.price)
          const isP = (t.pnl ?? 0) >= 0
          lines.push(cs.createPriceLine({ price: t.price, color: isP ? C.labelProfit : C.labelLoss, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `売 ¥${t.price.toLocaleString()}` }))
        }
      }
      priceLinesRef.current = lines
    })

    return () => {
      main.remove()
      mainChartRef.current  = null
      candleSerRef.current  = null; volumeSerRef.current = null
      ma5SerRef.current     = null; ma25SerRef.current   = null; ma75SerRef.current = null
      priceLinesRef.current = []
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Update data ─────────────────────────────────────────
  useEffect(() => {
    const cs = candleSerRef.current; const vs = volumeSerRef.current
    if (!cs || !vs || !stockData.candles.length) return

    priceLinesRef.current.forEach((pl) => { try { cs.removePriceLine(pl) } catch { /**/ } })
    priceLinesRef.current = []
    setClickInfo(null)

    cs.setData(stockData.candles.map<CandlestickData>((c) => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    })))
    vs.setData(stockData.candles.map<HistogramData>((c) => ({
      time: c.time as Time, value: c.volume,
      color: c.close >= c.open ? C.volUp : C.volDown,
    })))

    ma5SerRef.current?.setData(calcMA(stockData.candles, 5))
    ma25SerRef.current?.setData(calcMA(stockData.candles, 25))
    ma75SerRef.current?.setData(calcMA(stockData.candles, 75))

    // ── Build markers from raw TradeEntry records ──────────
    const markers: SeriesMarker<Time>[] = []
    const buyMap  = new Map<string, TradeEntry[]>()
    const sellMap = new Map<string, TradeEntry[]>()

    entries.forEach((e) => {
      const dn = nearestTradingDay(e.date, stockData.candles)
      if (!dn) return
      if (e.side === '買付') {
        const a = buyMap.get(dn) ?? []; a.push(e); buyMap.set(dn, a)
      } else {
        const a = sellMap.get(dn) ?? []; a.push(e); sellMap.set(dn, a)
      }
    })
    buyMapRef.current  = buyMap
    sellMapRef.current = sellMap

    buyMap.forEach((es, time) => {
      const totalQty = es.reduce((s, e) => s + e.qty, 0)
      markers.push({
        time: time as Time,
        position: 'belowBar',
        color: C.markerBuy,
        shape: 'circle',
        text: `買 ${totalQty.toLocaleString()}`,
        size: 1,
      })
    })
    sellMap.forEach((es, time) => {
      const totalQty = es.reduce((s, e) => s + e.qty, 0)
      // P&L lookup from realized trades for label
      const matchedPnl = es.reduce<number | null>((acc, e) => {
        const t = findMatchingTrade(e, trades)
        if (!t || t.pnl == null) return acc
        return (acc ?? 0) + t.pnl
      }, null)
      const label = matchedPnl != null
        ? `売 ${Math.abs(matchedPnl) >= 10000
            ? `${matchedPnl >= 0 ? '+' : ''}${(matchedPnl / 10000).toFixed(1)}万`
            : fmtYen(matchedPnl)}`
        : `売 ${totalQty.toLocaleString()}株`
      const isProfit = (matchedPnl ?? 0) >= 0
      markers.push({
        time: time as Time,
        position: 'aboveBar',
        color: matchedPnl != null
          ? (isProfit ? C.markerProfit : C.markerLoss)
          : '#94a3b8',
        shape: 'arrowDown',
        text: label,
        size: 1,
      })
    })

    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)))
    cs.setMarkers(markers)

    // Initial visible range based on entries
    const entryDates = entries.map((e) => e.date.getTime())
    if (entryDates.length > 0) {
      const earliest = new Date(Math.min(...entryDates)); earliest.setMonth(earliest.getMonth() - 3)
      const latest   = new Date(Math.max(...entryDates)); latest.setMonth(latest.getMonth() + 1)
      const fmtD = (d: Date) => d.toISOString().slice(0, 10)
      try {
        mainChartRef.current?.timeScale().setVisibleRange({ from: fmtD(earliest) as Time, to: fmtD(latest) as Time })
      } catch { mainChartRef.current?.timeScale().fitContent() }
    } else {
      mainChartRef.current?.timeScale().fitContent()
    }
  }, [stockData, entries, trades])

  // ── 3. Toggle MA visibility ────────────────────────────────
  useEffect(() => {
    ma5SerRef.current?.applyOptions({ visible: visibleMAs.has(5) })
    ma25SerRef.current?.applyOptions({ visible: visibleMAs.has(25) })
    ma75SerRef.current?.applyOptions({ visible: visibleMAs.has(75) })
  }, [visibleMAs])

  const toggleMA = (period: number) => {
    setVisibleMAs((prev) => {
      const next = new Set(prev)
      next.has(period) ? next.delete(period) : next.add(period)
      return next
    })
  }

  const clearClick = () => {
    priceLinesRef.current.forEach((pl) => { try { candleSerRef.current?.removePriceLine(pl) } catch { /**/ } })
    priceLinesRef.current = []
    setClickInfo(null)
  }

  return (
    <div style={{ position: 'relative', userSelect: 'none', background: C.bg }}>
      <div ref={mainRef} style={{ height: 520 }} />

      {/* Legend / MA toggle bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px',
        background: '#0a0a12', borderTop: `1px solid ${C.border}`,
        flexWrap: 'wrap', rowGap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.7rem' }}>
          <LegendMarker shape="circle" color={C.markerBuy}    label="買付" />
          <LegendMarker shape="arrow"  color={C.markerProfit} label="売付（利益）" />
          <LegendMarker shape="arrow"  color={C.markerLoss}   label="売付（損失）" />
          <LegendMarker shape="arrow"  color="#94a3b8"        label="売付（損益不明）" />
        </div>

        <div style={{ width: 1, height: 14, background: C.border }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.65rem', color: C.textDim }}>MA</span>
          {MA_DEFS.map(({ period, color, label }) => {
            const on = visibleMAs.has(period)
            return (
              <button
                key={period}
                onClick={() => toggleMA(period)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', fontSize: '0.68rem', cursor: 'pointer',
                  background: on ? `${color}18` : 'transparent',
                  border: `1px solid ${on ? color : C.border}`,
                  color: on ? color : C.textDim,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ display: 'inline-block', width: 14, height: 2, background: on ? color : C.border }} />
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '0.67rem', color: C.textDim }}>
          マーカークリックで詳細表示
        </div>
      </div>

      {/* Click info panel */}
      {clickInfo && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(10,10,20,0.97)', border: `1px solid ${C.border}`,
          padding: '14px 18px', zIndex: 20, minWidth: 260, maxWidth: 360,
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 600 }}>
              {clickInfo.time.replace(/-/g, '/')}
            </div>
            <button onClick={clearClick} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textDim, cursor: 'pointer', fontSize: '0.8rem', padding: '2px 8px' }}>✕</button>
          </div>

          {/* Buy entries */}
          {clickInfo.buys.length > 0 && (
            <div style={{ marginBottom: clickInfo.sells.length > 0 ? 10 : 0 }}>
              <div style={{ fontSize: '0.65rem', color: C.textDim, marginBottom: 6, letterSpacing: '0.06em' }}>買付</div>
              {clickInfo.buys.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.8rem' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.markerBuy, flexShrink: 0 }} />
                  <span style={{ color: '#93c5fd' }}>{fmtDate(e.date)}</span>
                  <span style={{ color: C.text }}>{e.qty.toLocaleString()}株</span>
                  <span style={{ color: C.textDim, fontSize: '0.72rem', marginLeft: 'auto' }}>@ ¥{e.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sell entries */}
          {clickInfo.sells.length > 0 && (
            <div>
              <div style={{ fontSize: '0.65rem', color: C.textDim, marginBottom: 6, letterSpacing: '0.06em' }}>売付</div>
              {clickInfo.sells.map((e, i) => {
                const matched = findMatchingTrade(e, trades)
                const isP = (matched?.pnl ?? 0) >= 0
                return (
                  <div key={i} style={{ marginBottom: i < clickInfo.sells.length - 1 ? 10 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: matched ? 6 : 0, fontSize: '0.8rem' }}>
                      <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `8px solid ${matched ? (isP ? C.markerProfit : C.markerLoss) : '#94a3b8'}`, flexShrink: 0 }} />
                      <span style={{ color: '#cbd5e1' }}>{fmtDate(e.date)}</span>
                      <span style={{ color: C.text }}>{e.qty.toLocaleString()}株</span>
                      <span style={{ color: C.textDim, fontSize: '0.72rem', marginLeft: 'auto' }}>@ ¥{e.price.toLocaleString()}</span>
                    </div>
                    {matched && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: isP ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${isP ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, marginLeft: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: '0.65rem', color: C.textDim }}>実現損益</span>
                          {matched.openDate && (
                            <span style={{ fontSize: '0.65rem', color: '#475569' }}>
                              {fmtDate(matched.openDate)} 取得 ¥{matched.avgCostYen?.toLocaleString() ?? '—'}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: isP ? '#4ade80' : '#f87171' }}>{fmtYen(matched.pnl)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LegendMarker({ shape, color, label }: { shape: 'circle' | 'arrow'; color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {shape === 'circle'
        ? <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        : <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `7px solid ${color}`, flexShrink: 0 }} />
      }
      <span style={{ color, fontSize: '0.7rem' }}>{label}</span>
    </span>
  )
}

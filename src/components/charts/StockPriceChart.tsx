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
import { StockData, StockCandle, Trade } from '../../types'
import { fmtYen, fmtDate } from '../../utils/formatters'
import { nearestTradingDay } from '../../utils/stockApi'

interface Props { stockData: StockData; trades: Trade[] }

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

function daysBetween(a: Date | null, b: Date): number {
  if (!a) return 0
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86400000)
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

const C = {
  markerOpen:    '#38bdf8',
  markerProfit:  '#4ade80',
  markerLoss:    '#f87171',
  labelAcquire:  '#0369a1',
  labelProfit:   '#15803d',
  labelLoss:     '#b91c1c',
  candleUp:      '#22c55e',
  candleDown:    '#ef4444',
  volUp:         'rgba(34,197,94,0.15)',
  volDown:       'rgba(239,68,68,0.15)',
  ma5:           '#fbbf24',   // amber-400  短期
  ma25:          '#818cf8',   // indigo-400 中期
  ma75:          '#fb923c',   // orange-400 長期
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

interface ClickInfo { time: string; trades: Trade[] }

export default function StockPriceChart({ stockData, trades }: Props) {
  const mainRef       = useRef<HTMLDivElement>(null)
  const mainChartRef  = useRef<IChartApi | null>(null)
  const candleSerRef  = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSerRef  = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ma5SerRef     = useRef<ISeriesApi<'Line'> | null>(null)
  const ma25SerRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const ma75SerRef    = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const closeMapRef   = useRef<Map<string, Trade[]>>(new Map())
  const openMapRef    = useRef<Map<string, Trade[]>>(new Map())
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

    // MA line series
    const makeMA = (color: string, visible: boolean) => main.addLineSeries({
      color,
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    })
    ma5SerRef.current  = makeMA(C.ma5,  false)   // 5日は初期非表示
    ma25SerRef.current = makeMA(C.ma25, true)
    ma75SerRef.current = makeMA(C.ma75, true)

    // Click → price lines
    main.subscribeClick((param) => {
      const cs = candleSerRef.current
      if (!cs) return
      priceLinesRef.current.forEach((pl) => { try { cs.removePriceLine(pl) } catch { /**/ } })
      priceLinesRef.current = []
      if (!param.time) { setClickInfo(null); return }
      const ts = timeToString(param.time)
      const closedTrades = closeMapRef.current.get(ts) ?? []
      const openTrades   = openMapRef.current.get(ts) ?? []
      if (![...closedTrades, ...openTrades].length) { setClickInfo(null); return }
      setClickInfo({ time: ts, trades: closedTrades.length ? closedTrades : openTrades })

      const lines: IPriceLine[] = []
      const seenBuy = new Set<number>(); const seenSell = new Set<number>()
      closedTrades.forEach((t) => {
        if (t.avgCostYen != null && !seenBuy.has(t.avgCostYen)) {
          seenBuy.add(t.avgCostYen)
          lines.push(cs.createPriceLine({ price: t.avgCostYen, color: C.labelAcquire, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `取得 ¥${t.avgCostYen.toLocaleString()}` }))
        }
        if (t.price != null && !seenSell.has(t.price)) {
          seenSell.add(t.price)
          const isP = (t.pnl ?? 0) >= 0
          lines.push(cs.createPriceLine({ price: t.price, color: isP ? C.labelProfit : C.labelLoss, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `決済 ¥${t.price.toLocaleString()}` }))
        }
      })
      openTrades.forEach((t) => {
        if (t.avgCostYen != null && !seenBuy.has(t.avgCostYen)) {
          seenBuy.add(t.avgCostYen)
          lines.push(cs.createPriceLine({ price: t.avgCostYen, color: C.labelAcquire, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `建玉 ¥${t.avgCostYen.toLocaleString()}` }))
        }
      })
      priceLinesRef.current = lines
    })

    return () => {
      main.remove()
      mainChartRef.current  = null
      candleSerRef.current  = null; volumeSerRef.current = null
      ma5SerRef.current     = null; ma25SerRef.current   = null; ma75SerRef.current = null
      priceLinesRef.current = []
    }
  }, [])

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

    // MA data
    ma5SerRef.current?.setData(calcMA(stockData.candles, 5))
    ma25SerRef.current?.setData(calcMA(stockData.candles, 25))
    ma75SerRef.current?.setData(calcMA(stockData.candles, 75))

    // Markers
    const markers: SeriesMarker<Time>[] = []
    const openMap  = new Map<string, Trade[]>()
    const closeMap = new Map<string, Trade[]>()
    trades.forEach((t) => {
      const cn = nearestTradingDay(t.closeDate, stockData.candles)
      if (t.openDate) {
        const on = nearestTradingDay(t.openDate, stockData.candles)
        if (on && on !== cn) { const a = openMap.get(on) ?? []; a.push(t); openMap.set(on, a) }
      }
      if (cn) { const a = closeMap.get(cn) ?? []; a.push(t); closeMap.set(cn, a) }
    })
    openMapRef.current  = openMap
    closeMapRef.current = closeMap

    openMap.forEach((ts, time) => {
      const totalQty = ts.reduce((s, t) => s + (t.qty ?? 0), 0)
      markers.push({ time: time as Time, position: 'belowBar', color: C.markerOpen, shape: 'circle', text: totalQty ? `${totalQty.toLocaleString()}` : `${ts.length}`, size: 1 })
    })
    closeMap.forEach((ts, time) => {
      const total = ts.reduce((s, t) => s + (t.pnl ?? 0), 0)
      const isProfit = total >= 0
      const pnlLabel = Math.abs(total) >= 10000
        ? `${isProfit ? '+' : ''}${(total / 10000).toFixed(1)}万`
        : fmtYen(total)
      markers.push({ time: time as Time, position: 'aboveBar', color: isProfit ? C.markerProfit : C.markerLoss, shape: 'arrowDown', text: pnlLabel, size: 1 })
    })
    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)))
    cs.setMarkers(markers)

    // Initial visible range
    const tradeDates = trades.flatMap((t) => [t.openDate, t.closeDate].filter(Boolean) as Date[]).map((d) => d.getTime())
    if (tradeDates.length > 0) {
      const earliest = new Date(Math.min(...tradeDates)); earliest.setMonth(earliest.getMonth() - 3)
      const latest   = new Date(Math.max(...tradeDates)); latest.setMonth(latest.getMonth() + 1)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      try {
        mainChartRef.current?.timeScale().setVisibleRange({ from: fmt(earliest) as Time, to: fmt(latest) as Time })
      } catch { mainChartRef.current?.timeScale().fitContent() }
    } else {
      mainChartRef.current?.timeScale().fitContent()
    }
  }, [stockData, trades])

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
        {/* Trade markers legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.7rem' }}>
          <LegendMarker shape="circle" color={C.markerOpen}   label="エントリー" />
          <LegendMarker shape="arrow"  color={C.markerProfit} label="決済（利益）" />
          <LegendMarker shape="arrow"  color={C.markerLoss}   label="決済（損失）" />
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: C.border }} />

        {/* MA toggles */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: C.textDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>約定日</div>
              <div style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 600 }}>{clickInfo.time.replace(/-/g, '/')}</div>
            </div>
            <button onClick={clearClick} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textDim, cursor: 'pointer', fontSize: '0.8rem', padding: '2px 8px', lineHeight: 1.5 }}>✕</button>
          </div>

          {clickInfo.trades.map((t, i) => {
            const isP  = (t.pnl ?? 0) >= 0
            const days = daysBetween(t.openDate, t.closeDate)
            return (
              <div key={i} style={{ borderTop: i > 0 ? `1px solid #1e1e30` : 'none', paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', background: '#1a1a2e', border: `1px solid ${C.border}`, color: C.text }}>{t.type}</span>
                  <span style={{ fontSize: '0.72rem', color: C.textDim }}>{t.market}</span>
                  {t.qty && <span style={{ fontSize: '0.72rem', color: C.textDim }}>{t.qty.toLocaleString()}株</span>}
                  {days > 0 && <span style={{ fontSize: '0.68rem', color: '#4a5580', marginLeft: 'auto' }}>{days}日間</span>}
                </div>
                <div style={{ marginBottom: 10, fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.markerOpen, flexShrink: 0 }} />
                    <span style={{ color: '#64748b', fontSize: '0.68rem', width: 56, flexShrink: 0 }}>エントリー</span>
                    <span style={{ color: '#93c5fd' }}>{t.openDate ? fmtDate(t.openDate) : '—'}</span>
                    {t.avgCostYen != null && <span style={{ color: '#475569', fontSize: '0.68rem', marginLeft: 'auto' }}>¥{t.avgCostYen.toLocaleString()}</span>}
                  </div>
                  <div style={{ marginLeft: 4, borderLeft: `1px dashed ${C.border}`, height: 8 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `8px solid ${isP ? C.markerProfit : C.markerLoss}`, flexShrink: 0 }} />
                    <span style={{ color: '#64748b', fontSize: '0.68rem', width: 56, flexShrink: 0 }}>決済</span>
                    <span style={{ color: '#cbd5e1' }}>{fmtDate(t.closeDate)}</span>
                    {t.price != null && <span style={{ color: '#475569', fontSize: '0.68rem', marginLeft: 'auto' }}>¥{t.price.toLocaleString()}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: isP ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${isP ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  <span style={{ fontSize: '0.68rem', color: C.textDim }}>実現損益</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: isP ? '#4ade80' : '#f87171', letterSpacing: '-0.02em' }}>{fmtYen(t.pnl)}</span>
                </div>
              </div>
            )
          })}

          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid #1e1e30`, fontSize: '0.65rem', color: '#2a2a4a', display: 'flex', gap: 10 }}>
            <span><span style={{ color: C.labelAcquire, fontWeight: 700 }}>---</span> 取得単価</span>
            <span><span style={{ color: C.labelProfit, fontWeight: 700 }}>—</span> 決済（利益）</span>
            <span><span style={{ color: C.labelLoss, fontWeight: 700 }}>—</span> 決済（損失）</span>
          </div>
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

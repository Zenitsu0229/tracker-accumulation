import { StockData, StockCandle } from '../types'

function toUnix(d: Date): number {
  return Math.floor(d.getTime() / 1000)
}

function parseYahooResponse(data: unknown): StockData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  if (!d?.chart?.result?.length) throw new Error('データが見つかりません')
  const result = d.chart.result[0]
  const meta = result.meta
  const timestamps: number[] = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}

  const candles: StockCandle[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    const volume = quote.volume?.[i] ?? 0
    if (open == null || high == null || low == null || close == null) continue
    const date = new Date(timestamps[i] * 1000)
    // Adjust for JST (UTC+9) to get correct date
    const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000)
    const time = jstDate.toISOString().slice(0, 10)
    candles.push({ time, open, high, low, close, volume })
  }

  // deduplicate by time (take last)
  const seen = new Map<string, StockCandle>()
  for (const c of candles) seen.set(c.time, c)
  const uniqueCandles = [...seen.values()].sort((a, b) => a.time.localeCompare(b.time))

  return {
    symbol: meta.symbol,
    currency: meta.currency ?? 'JPY',
    exchangeName: meta.fullExchangeName ?? meta.exchangeName ?? '',
    candles: uniqueCandles,
  }
}

export async function fetchStockData(code: string): Promise<StockData> {
  const symbol = encodeURIComponent(code + '.T')
  // Fetch full available history (epoch start → today)
  const p1 = 0
  const p2 = Math.floor(Date.now() / 1000)

  const url = `/api/finance/v8/finance/chart/${symbol}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplits&includeAdjustedClose=true`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data?.chart?.error) throw new Error(data.chart.error.description ?? 'APIエラー')
  return parseYahooResponse(data)
}

/** Find the nearest trading day in candle data for a given date */
export function nearestTradingDay(date: Date, candles: StockCandle[]): string | null {
  if (!candles.length) return null
  const target = fmtISO(date)
  // Exact match (local-date string comparison, no UTC shift)
  if (candles.some((c) => c.time === target)) return target
  // Find closest by string distance (candle times are "YYYY-MM-DD"; compare as local days)
  const targetMs = new Date(target + 'T00:00:00').getTime() // local midnight
  let best = candles[0]
  let minDiff = Math.abs(new Date(candles[0].time + 'T00:00:00').getTime() - targetMs)
  for (const c of candles) {
    const diff = Math.abs(new Date(c.time + 'T00:00:00').getTime() - targetMs)
    if (diff < minDiff) { minDiff = diff; best = c }
  }
  return best.time
}

// Use local date (not UTC) to avoid JST/UTC -1 day offset
function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

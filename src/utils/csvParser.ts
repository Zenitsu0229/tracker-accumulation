import { Trade } from '../types'

// ── CSV row tokenizer ──────────────────────────────────────
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let inQuote = false
  let cur = ''
  for (const c of line) {
    if (c === '"') { inQuote = !inQuote }
    else if (c === ',' && !inQuote) { result.push(cur.trim()); cur = '' }
    else { cur += c }
  }
  result.push(cur.trim())
  return result
}

// "YYYY/M/D" or "YYYY/MM/DD HH:MM:SS" → Date (local time)
function parseDate(s: string): Date | null {
  if (!s || s === '-') return null
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
}

// "1,234.5" → 1234.5 | "-" / "成行" → null
function parseNum(s: string): number | null {
  if (!s || s === '-' || s === '成行') return null
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// Normalize account name for display
function normalizeAccount(s: string): string {
  if (!s || s === '-') return ''
  if (s.startsWith('NISA')) return 'NISA'
  if (s === '一般') return '一般'
  if (s === '特定') return '特定'
  return s
}

// Normalize market name — PTS / Chi-X / etc. → 東証
function normalizeMarket(s: string): string {
  if (!s || s === '-') return '東証'
  if (s === '東証' || s.startsWith('東')) return '東証'
  return '東証'
}

// ── Shared FIFO matching ───────────────────────────────────
interface RawOrder {
  datetime: Date
  code: string; name: string; account: string; market: string; tradeKind: string
  side: '買付' | '売付'; qty: number; price: number
}
interface BuyLot { date: Date; price: number; qty: number }

function fifoMatch(rawOrders: RawOrder[]): Trade[] {
  // Group by code + account (NISA and 一般/特定 are separate positions)
  const byGroup = new Map<string, RawOrder[]>()
  for (const o of rawOrders) {
    const key = `${o.code}::${o.account}`
    const list = byGroup.get(key) ?? []; list.push(o); byGroup.set(key, list)
  }

  const trades: Trade[] = []

  for (const orders of byGroup.values()) {
    orders.sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
    const buyQueue: BuyLot[] = []

    for (const order of orders) {
      if (order.side === '買付') {
        buyQueue.push({ date: order.datetime, price: order.price, qty: order.qty })
        continue
      }
      // Sell: FIFO consume buy lots
      let remaining = order.qty, totalCost = 0, matchedQty = 0
      let firstBuyDate: Date | null = null

      while (remaining > 0 && buyQueue.length > 0) {
        const lot = buyQueue[0]
        const take = Math.min(remaining, lot.qty)
        if (!firstBuyDate) firstBuyDate = lot.date
        totalCost += lot.price * take; matchedQty += take
        remaining -= take; lot.qty -= take
        if (lot.qty === 0) buyQueue.shift()
      }
      if (matchedQty === 0) continue  // No matching buy in this CSV period

      const avgBuyPrice = totalCost / matchedQty
      const pnl = Math.round((order.price - avgBuyPrice) * matchedQty)

      trades.push({
        closeDate: order.datetime,
        openDate: firstBuyDate,
        code: order.code, name: order.name,
        account: order.account, market: order.market,
        type: order.tradeKind, creditType: '',
        pnlYen: pnl, pnlUsd: null, pnl,
        avgCostYen: Math.round(avgBuyPrice * 100) / 100,
        price: order.price, qty: matchedQty,
      })
    }
  }
  return trades
}

// ══════════════════════════════════════════════════════════════
//  FORMAT A: 実現損益レポート (realized_pl CSV)  — 12 columns
//
//  [0]  開始日 (約定日/取得日)   YYYY/M/D
//  [1]  決済日                   YYYY/M/D
//  [2]  銘柄コード
//  [3]  銘柄名
//  [4]  口座区分
//  [5]  信用区分
//  [6]  取引区分                 現物
//  [7]  数量[株/口]
//  [8]  約定/決済単価[円]
//  [9]  約定/決済金額[円]
//  [10] 取得/建玉平均[円]
//  [11] 実現損益合計[円]
// ══════════════════════════════════════════════════════════════
function parsePlReport(lines: string[]): Trade[] {
  const trades: Trade[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    if (row.length < 12) continue

    const openDate  = parseDate(row[0])
    const closeDate = parseDate(row[1])
    if (!closeDate) continue

    const code = row[2]; if (!code) continue

    const qty        = parseNum(row[7])
    const price      = parseNum(row[8])
    const avgCostYen = parseNum(row[10])
    const pnlYen     = parseNum(row[11])
    if (pnlYen === null) continue

    trades.push({
      closeDate, openDate, code,
      name:       row[3] ?? '',
      account:    normalizeAccount(row[4] ?? ''),
      market:     '東証',
      type:       row[6] ?? '現物',
      creditType: row[5] ?? '',
      pnlYen, pnlUsd: null, pnl: pnlYen,
      avgCostYen, price, qty,
    })
  }
  return trades
}

// ══════════════════════════════════════════════════════════════
//  FORMAT B: 注文ログ CSV (order log)  — 40+ columns
//
//  [3]  通常注文状況    "約定"
//  [6]  コード
//  [7]  銘柄名
//  [8]  口座区分
//  [9]  市場
//  [12] 発注/受注日時   "YYYY/MM/DD HH:MM:SS"
//  [13] 売買            買付 | 売付
//  [14] 取引
//  [19] 約定数量
//  [20] 注文単価        price or "成行"
//  [39] 価格判定情報    "売気配(X) 買気配(Y)"
// ══════════════════════════════════════════════════════════════
function extractBidAsk(info: string): { ask: number | null; bid: number | null } {
  const a = info.match(/売気配\(([\d,.]+)\)/)
  const b = info.match(/買気配\(([\d,.]+)\)/)
  return {
    ask: a ? parseFloat(a[1].replace(/,/g, '')) : null,
    bid: b ? parseFloat(b[1].replace(/,/g, '')) : null,
  }
}

function parseOrderLog(lines: string[]): Trade[] {
  const rawOrders: RawOrder[] = []

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    if (row.length < 20) continue
    if (row[3] !== '約定') continue

    const qty = parseNum(row[19])
    if (!qty || qty <= 0) continue

    const side = row[13]
    if (side !== '買付' && side !== '売付') continue

    const datetime = parseDate(row[12]); if (!datetime) continue
    const code = row[6]; if (!code) continue

    let price: number | null = parseNum(row[20] ?? '')
    if (price === null) {
      const { ask, bid } = extractBidAsk(row[39] ?? '')
      price = side === '買付' ? ask : bid
    }
    if (price === null) continue

    rawOrders.push({
      datetime, code,
      name: row[7] ?? '', account: normalizeAccount(row[8] ?? ''),
      market: '東証', tradeKind: row[14] ?? '現物',
      side: side as '買付' | '売付', qty, price,
    })
  }
  return fifoMatch(rawOrders)
}

// ══════════════════════════════════════════════════════════════
//  FORMAT C: 取引履歴 CSV (trade history)  — 28 columns
//
//  [0]  約定日          YYYY/M/D  ← 実際の約定日（最も正確）
//  [1]  受渡日
//  [2]  銘柄コード
//  [3]  銘柄名
//  [4]  市場名称        東証, Chi-X
//  [5]  口座区分        一般, NISA成長投資枠
//  [6]  取引区分        現物
//  [7]  売買区分        買付 | 売付
//  [10] 数量[株]
//  [11] 単価[円]        実際の約定単価（直接記載）
// ══════════════════════════════════════════════════════════════
function parseTradeHistory(lines: string[]): Trade[] {
  const rawOrders: RawOrder[] = []

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    if (row.length < 12) continue

    const side = row[7]
    if (side !== '買付' && side !== '売付') continue

    const datetime = parseDate(row[0]); if (!datetime) continue
    const code = row[2]; if (!code) continue

    const qty   = parseNum(row[10]); if (!qty || qty <= 0) continue
    const price = parseNum(row[11]); if (price === null) continue

    rawOrders.push({
      datetime, code,
      name:      row[3] ?? '',
      account:   normalizeAccount(row[5] ?? ''),
      market:    normalizeMarket(row[4] ?? ''),
      tradeKind: row[6] ?? '現物',
      side: side as '買付' | '売付',
      qty, price,
    })
  }
  return fifoMatch(rawOrders)
}

// ══════════════════════════════════════════════════════════════
//  Auto-detect format by column count and dispatch
//
//  >= 30 cols → Format B (order log)
//  20–29 cols → Format C (trade history)   ← NEW
//  < 20  cols → Format A (realized P&L report)
// ══════════════════════════════════════════════════════════════
function detectLines(text: string) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { lines, cols: 0 }
  let firstData: string[] = []
  for (let i = 1; i < lines.length; i++) {
    const r = parseCSVRow(lines[i])
    if (r.length > 2) { firstData = r; break }
  }
  return { lines, cols: firstData.length }
}

export function parseCSV(text: string): Trade[] {
  const { lines, cols } = detectLines(text)
  if (lines.length < 2) return []
  if (cols >= 30) return parseOrderLog(lines)
  if (cols >= 20) return parseTradeHistory(lines)
  return parsePlReport(lines)
}

/** 取引履歴CSV専用パーサ（注文ログ・取引履歴フォーマット対応） */
export function parseCSVTradeHistory(text: string): Trade[] {
  const { lines, cols } = detectLines(text)
  if (lines.length < 2) return []
  if (cols >= 30) return parseOrderLog(lines)
  if (cols >= 20) return parseTradeHistory(lines)
  return []
}

/** 実現損益CSV専用パーサ */
export function parseCSVPlReport(text: string): Trade[] {
  const { lines } = detectLines(text)
  if (lines.length < 2) return []
  return parsePlReport(lines)
}

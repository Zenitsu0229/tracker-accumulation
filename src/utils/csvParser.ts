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

// "YYYY/MM/DD" or "YYYY/MM/DD HH:MM:SS" → Date (local)
function parseDate(s: string): Date | null {
  if (!s || s === '-') return null
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
}

// "1,234.5" → 1234.5 | "-" / "成行" → null
function parseNum(s: string): number | null {
  if (!s || s === '-' || s === '成行') return null
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// Normalize account display: "NISA口座ロールオーバー" → "NISA" etc.
function normalizeAccount(s: string): string {
  if (!s || s === '-') return ''
  if (s.startsWith('NISA')) return 'NISA'
  return s
}

// ══════════════════════════════════════════════════════════════
//  FORMAT A: 実現損益レポート (realized_pl CSV)  — 12 columns
//
//  [0]  開始日          YYYY/MM/DD  (取得/建玉日)
//  [1]  決済日          YYYY/MM/DD
//  [2]  銘柄コード
//  [3]  銘柄名
//  [4]  口座区分        特定 / NISA口座ロールオーバー / …
//  [5]  信用区分        -
//  [6]  取引            現物
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

    const code = row[2]
    if (!code) continue

    const qty        = parseNum(row[7])
    const price      = parseNum(row[8])
    const avgCostYen = parseNum(row[10])
    const pnlYen     = parseNum(row[11])
    if (pnlYen === null) continue

    trades.push({
      closeDate,
      openDate,
      code,
      name:       row[3] ?? '',
      account:    normalizeAccount(row[4] ?? ''),
      market:     '',
      type:       row[6] ?? '現物',
      creditType: row[5] ?? '',
      pnlYen,
      pnlUsd: null,
      pnl: pnlYen,
      avgCostYen,
      price,
      qty,
    })
  }
  return trades
}

// ══════════════════════════════════════════════════════════════
//  FORMAT B: 注文ログ CSV (order log)  — 40+ columns
//
//  [3]  通常注文状況    "約定" | …
//  [6]  コード
//  [7]  銘柄名
//  [8]  口座区分
//  [9]  市場
//  [12] 発注/受注日時   "YYYY/MM/DD HH:MM:SS"
//  [13] 売買            買付 | 売付
//  [14] 取引            現物
//  [19] 約定数量
//  [20] 注文単価        price or "成行"
//  [39] 価格判定情報    "売気配(X) 買気配(Y)"  (成行 orders)
// ══════════════════════════════════════════════════════════════

function extractBidAsk(info: string): { ask: number | null; bid: number | null } {
  const a = info.match(/売気配\(([\d,.]+)\)/)
  const b = info.match(/買気配\(([\d,.]+)\)/)
  return {
    ask: a ? parseFloat(a[1].replace(/,/g, '')) : null,
    bid: b ? parseFloat(b[1].replace(/,/g, '')) : null,
  }
}

interface RawOrder {
  datetime: Date
  code: string; name: string; account: string; market: string; tradeKind: string
  side: '買付' | '売付'; qty: number; price: number
}
interface BuyLot { date: Date; price: number; qty: number }

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

    const datetime = parseDate(row[12])
    if (!datetime) continue

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
      market: row[9] ?? '', tradeKind: row[14] ?? '現物',
      side: side as '買付' | '売付', qty, price,
    })
  }

  // FIFO match per code+account
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
      if (matchedQty === 0) continue

      const avgBuyPrice = totalCost / matchedQty
      const pnl = Math.round((order.price - avgBuyPrice) * matchedQty)
      trades.push({
        closeDate: order.datetime, openDate: firstBuyDate,
        code: order.code, name: order.name, account: order.account,
        market: order.market, type: order.tradeKind, creditType: '',
        pnlYen: pnl, pnlUsd: null, pnl,
        avgCostYen: Math.round(avgBuyPrice * 100) / 100,
        price: order.price, qty: matchedQty,
      })
    }
  }
  return trades
}

// ══════════════════════════════════════════════════════════════
//  Auto-detect format and parse
// ══════════════════════════════════════════════════════════════
export function parseCSV(text: string): Trade[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  // Find first non-empty data row to count columns
  let firstData = parseCSVRow(lines[1] ?? '')
  for (let i = 1; i < lines.length; i++) {
    const r = parseCSVRow(lines[i])
    if (r.length > 2) { firstData = r; break }
  }

  // ≥ 20 columns → order log; ≤ 15 columns → realized P&L report
  return firstData.length >= 20 ? parseOrderLog(lines) : parsePlReport(lines)
}

/** 取引履歴CSVの個別注文レコード（買付/売付）— チャートマーカー専用 */
export interface TradeEntry {
  date: Date
  code: string
  name: string
  account: string
  market: string
  side: '買付' | '売付'
  qty: number
  price: number
}

export interface Trade {
  closeDate: Date
  openDate: Date | null
  code: string
  name: string
  account: string
  market: string
  type: string
  creditType: string
  pnlYen: number | null
  pnlUsd: number | null
  pnl: number | null
  avgCostYen: number | null
  price: number | null
  qty: number | null
}

export interface StockCandle {
  time: string // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockData {
  symbol: string
  currency: string
  exchangeName: string
  candles: StockCandle[]
}

/** 取引反省・記録ノート */
export interface TradeNote {
  id: string
  date: string       // YYYY-MM-DD（取引日）
  code: string       // 銘柄コード（''=日単位ノート）
  name: string       // 銘柄名
  note: string       // 反省・メモ本文
  createdAt: string  // ISO datetime
  updatedAt: string  // ISO datetime
}

export interface StockGroup {
  code: string
  name: string
  totalPnl: number
  wins: number
  losses: number
  trades: Trade[]
}

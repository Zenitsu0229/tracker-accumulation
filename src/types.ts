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

export interface StockGroup {
  code: string
  name: string
  totalPnl: number
  wins: number
  losses: number
  trades: Trade[]
}

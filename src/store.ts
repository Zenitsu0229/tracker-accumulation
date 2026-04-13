import { create } from 'zustand'
import { Trade } from './types'

interface AppState {
  // 実現損益 CSV → P&L計算の基準データ
  plReportTrades: Trade[]
  // 取引履歴 CSV → チャートのエントリー/決済マーカー専用
  tradeHistoryTrades: Trade[]

  // 実現損益を優先。未ロード時は取引履歴をフォールバック
  allTrades: Trade[]
  filteredTrades: Trade[]
  dateRange: { start: string; end: string }

  activeTab: string
  selectedStock: string // "code|name"

  setPlReport: (trades: Trade[]) => void
  setTradeHistory: (trades: Trade[]) => void
  setDateRange: (range: { start: string; end: string }) => void
  applyFilter: () => void
  setActiveTab: (tab: string) => void
  setSelectedStock: (s: string) => void
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function sortedTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
}

function dateRangeOf(sorted: Trade[]) {
  return {
    start: sorted.length ? fmt(sorted[0].closeDate) : '',
    end:   sorted.length ? fmt(sorted[sorted.length - 1].closeDate) : '',
  }
}

export const useStore = create<AppState>((set, get) => ({
  plReportTrades: [],
  tradeHistoryTrades: [],
  allTrades: [],
  filteredTrades: [],
  dateRange: { start: '', end: '' },
  activeTab: 'overview',
  selectedStock: '',

  // 実現損益をロード → 常にメインデータとして反映
  setPlReport: (trades) => {
    const sorted = sortedTrades(trades)
    const range  = dateRangeOf(sorted)
    set({
      plReportTrades: sorted,
      allTrades: sorted,
      filteredTrades: sorted,
      dateRange: range,
      selectedStock: '',
    })
  },

  // 取引履歴をロード → 実現損益が未ロードの場合のみメインデータとして反映
  setTradeHistory: (trades) => {
    const sorted = sortedTrades(trades)
    const state  = get()
    const isMainSource = state.plReportTrades.length === 0
    set({
      tradeHistoryTrades: sorted,
      ...(isMainSource ? {
        allTrades: sorted,
        filteredTrades: sorted,
        dateRange: dateRangeOf(sorted),
        selectedStock: '',
      } : {}),
    })
  },

  setDateRange: (range) => {
    set({ dateRange: range })
    get().applyFilter()
  },

  applyFilter: () => {
    const { allTrades, dateRange } = get()
    const start = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : null
    const end   = dateRange.end   ? new Date(dateRange.end   + 'T23:59:59') : null
    const filtered = allTrades.filter((t) => {
      if (start && t.closeDate < start) return false
      if (end   && t.closeDate > end)   return false
      return true
    })
    set({ filteredTrades: filtered })
  },

  setActiveTab:     (tab) => set({ activeTab: tab }),
  setSelectedStock: (s)   => set({ selectedStock: s }),
}))

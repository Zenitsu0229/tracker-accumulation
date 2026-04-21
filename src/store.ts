import { create } from 'zustand'
import { Trade, TradeEntry, TradeNote } from './types'

interface AppState {
  // 実現損益 CSV → P&L計算の基準データ
  plReportTrades: Trade[]
  // 取引履歴 CSV → FIFOマッチング済みトレード（フォールバック用）
  tradeHistoryTrades: Trade[]
  // 取引履歴 CSV → 個別注文レコード（チャートマーカー専用）
  tradeEntries: TradeEntry[]

  // 実現損益を優先。未ロード時は取引履歴をフォールバック
  allTrades: Trade[]
  filteredTrades: Trade[]
  dateRange: { start: string; end: string }

  activeTab: string
  selectedStock: string // "code|name"

  // 取引反省・記録ノート
  notes: TradeNote[]

  setPlReport: (trades: Trade[]) => void
  setTradeHistory: (trades: Trade[], entries: TradeEntry[]) => void
  setDateRange: (range: { start: string; end: string }) => void
  applyFilter: () => void
  setActiveTab: (tab: string) => void
  setSelectedStock: (s: string) => void

  addNote: (note: Omit<TradeNote, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateNote: (id: string, note: string) => void
  deleteNote: (id: string) => void
  importNotes: (notes: TradeNote[]) => void
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

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
  tradeEntries: [],
  allTrades: [],
  filteredTrades: [],
  dateRange: { start: '', end: '' },
  activeTab: 'overview',
  selectedStock: '',
  notes: [],

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

  // 取引履歴をロード
  setTradeHistory: (trades, entries) => {
    const sorted = sortedTrades(trades)
    const state  = get()
    const isMainSource = state.plReportTrades.length === 0
    const sortedWithPnl = sorted.filter((t) => t.pnl !== null)
    set({
      tradeHistoryTrades: sorted,
      tradeEntries: [...entries].sort((a, b) => a.date.getTime() - b.date.getTime()),
      ...(isMainSource ? {
        allTrades: sortedWithPnl,
        filteredTrades: sortedWithPnl,
        dateRange: dateRangeOf(sortedWithPnl),
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

  // ── Notes ────────────────────────────────────────────────
  addNote: (draft) => {
    const now = new Date().toISOString()
    const note: TradeNote = { ...draft, id: uid(), createdAt: now, updatedAt: now }
    set((s) => ({ notes: [...s.notes, note] }))
  },

  updateNote: (id, text) => {
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, note: text, updatedAt: new Date().toISOString() } : n
      ),
    }))
  },

  deleteNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
  },

  importNotes: (incoming) => {
    set((s) => {
      // Merge: incoming overrides existing by id, new ones are appended
      const existingMap = new Map(s.notes.map((n) => [n.id, n]))
      incoming.forEach((n) => existingMap.set(n.id, n))
      return { notes: [...existingMap.values()].sort((a, b) => b.date.localeCompare(a.date)) }
    })
  },
}))

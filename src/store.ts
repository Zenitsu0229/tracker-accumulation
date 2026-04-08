import { create } from 'zustand'
import { Trade } from './types'

interface AppState {
  allTrades: Trade[]
  filteredTrades: Trade[]
  dateRange: { start: string; end: string }
  activeTab: string
  selectedStock: string // "code|name"

  setTrades: (trades: Trade[]) => void
  setDateRange: (range: { start: string; end: string }) => void
  applyFilter: () => void
  setActiveTab: (tab: string) => void
  setSelectedStock: (s: string) => void
}

export const useStore = create<AppState>((set, get) => ({
  allTrades: [],
  filteredTrades: [],
  dateRange: { start: '', end: '' },
  activeTab: 'overview',
  selectedStock: '',

  setTrades: (trades) => {
    const sorted = [...trades].sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
    // Use local date to avoid UTC/JST 1-day offset
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const start = sorted.length ? fmt(sorted[0].closeDate) : ''
    const end = sorted.length ? fmt(sorted[sorted.length - 1].closeDate) : ''
    set({ allTrades: sorted, filteredTrades: sorted, dateRange: { start, end } })
  },

  setDateRange: (range) => {
    set({ dateRange: range })
    get().applyFilter()
  },

  applyFilter: () => {
    const { allTrades, dateRange } = get()
    // Append time to force local-date parsing (bare "YYYY-MM-DD" is parsed as UTC by Date constructor)
    const start = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : null
    const end = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : null
    const filtered = allTrades.filter((t) => {
      if (start && t.closeDate < start) return false
      if (end && t.closeDate > end) return false
      return true
    })
    set({ filteredTrades: filtered })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedStock: (s) => set({ selectedStock: s }),
}))

import { Trade } from '../types'

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function groupKey(t: Trade): string {
  return `${t.code}::${t.account}::${dateKey(t.closeDate)}`
}

/**
 * 取引履歴と実現損益の2つのデータを合算する。
 *
 * マッチング: code + account + closeDate(日付) + qty が一致するペアを対応づける。
 * - マッチした場合: 実現損益のP&L（証券会社の正確な値）を優先し、
 *   取引履歴の openDate / avgCostYen で補完する。
 * - マッチしない実現損益: そのまま含める（証券会社データ優先）
 * - マッチしない取引履歴: そのまま含める（FIFO推定値）
 */
export function mergeTradeData(plReport: Trade[], tradeHistory: Trade[]): Trade[] {
  if (!plReport.length) return [...tradeHistory]
  if (!tradeHistory.length) return [...plReport]

  // group plReport: key → Trade[]
  const plGroups = new Map<string, Trade[]>()
  for (const t of plReport) {
    const key = groupKey(t)
    const list = plGroups.get(key) ?? []
    list.push(t)
    plGroups.set(key, list)
  }

  // group tradeHistory: key → Trade[]
  const histGroups = new Map<string, Trade[]>()
  for (const t of tradeHistory) {
    const key = groupKey(t)
    const list = histGroups.get(key) ?? []
    list.push(t)
    histGroups.set(key, list)
  }

  const merged: Trade[] = []

  // Pass 1: process plReport groups, match with tradeHistory
  for (const [key, plTrades] of plGroups.entries()) {
    const histTrades = histGroups.get(key) ?? []
    const usedHistIdx = new Set<number>()

    for (const pl of plTrades) {
      // Find best matching hist trade by qty
      let bestIdx = -1
      if (pl.qty !== null) {
        for (let i = 0; i < histTrades.length; i++) {
          if (usedHistIdx.has(i)) continue
          if (histTrades[i].qty === pl.qty) {
            bestIdx = i
            break
          }
        }
      }

      if (bestIdx >= 0) {
        usedHistIdx.add(bestIdx)
        const hist = histTrades[bestIdx]
        // Use plReport as base (accurate broker P&L)
        // Supplement with tradeHistory fields where plReport is null
        merged.push({
          ...pl,
          openDate: pl.openDate ?? hist.openDate,
          avgCostYen: pl.avgCostYen ?? hist.avgCostYen,
        })
      } else {
        merged.push({ ...pl })
      }
    }

    // Add unmatched histTrades from this group
    for (let i = 0; i < histTrades.length; i++) {
      if (!usedHistIdx.has(i)) {
        merged.push({ ...histTrades[i] })
      }
    }
  }

  // Pass 2: add tradeHistory groups not present in plReport at all
  for (const [key, histTrades] of histGroups.entries()) {
    if (!plGroups.has(key)) {
      for (const h of histTrades) merged.push({ ...h })
    }
  }

  return merged.sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
}

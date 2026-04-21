import { Trade } from '../types'

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function diffDays(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86400000
}

/**
 * 受渡日（T+2）→ 約定日（T+0）の推定変換
 * 祝日は考慮しないが、週末（土日）は正確に処理する
 */
function settlementToTradeDate(d: Date): Date {
  const result = new Date(d)
  const dow = result.getDay() // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  // Mon/Tue の受渡日は前週 Thu/Fri が約定日（週末を跨ぐため -4 日）
  const sub = dow === 1 || dow === 2 ? 4 : 2
  result.setDate(result.getDate() - sub)
  return result
}

/**
 * 取引履歴と実現損益の2つのデータを合算する。
 *
 * マッチング: code + account が一致 かつ closeDate の差が ±3 日以内のペアを対応づける。
 * ±3日の許容は、実現損益CSVが受渡日(T+2)を使用し、取引履歴CSVが約定日(T+0)を
 * 使用するケースに対応するため。
 *
 * - マッチした場合: 実現損益のP&L（証券会社の正確な値）を優先し、
 *   取引履歴の closeDate（正確な約定日）で日付を上書きする。
 *   openDate は取引履歴側を優先し、なければ実現損益の日付から T+2 を逆算して推定する。
 * - マッチしない実現損益: 受渡日→約定日 の逆算を試みてそのまま含める
 * - マッチしない取引履歴: そのまま含める（FIFO推定値 or pnl=null のマーカー専用）
 */
export function mergeTradeData(plReport: Trade[], tradeHistory: Trade[]): Trade[] {
  if (!plReport.length) return [...tradeHistory]
  if (!tradeHistory.length) return [...plReport]

  // code+account でグループ化（日付はマッチング内で柔軟に比較）
  const plGroups = new Map<string, Trade[]>()
  for (const t of plReport) {
    const key = `${t.code}::${t.account}`
    const list = plGroups.get(key) ?? []; list.push(t); plGroups.set(key, list)
  }
  const histGroups = new Map<string, Trade[]>()
  for (const t of tradeHistory) {
    const key = `${t.code}::${t.account}`
    const list = histGroups.get(key) ?? []; list.push(t); histGroups.set(key, list)
  }

  const merged: Trade[] = []

  // Pass 1: pl を基準にマッチングし、取引履歴の正確な日付で上書き
  for (const [key, plTrades] of plGroups.entries()) {
    const histTrades = histGroups.get(key) ?? []
    const usedHistIdx = new Set<number>()

    for (const pl of plTrades) {
      // 最も closeDate が近い取引履歴トレードを探す（±3日以内）
      let bestIdx = -1
      let bestDiff = Infinity

      for (let i = 0; i < histTrades.length; i++) {
        if (usedHistIdx.has(i)) continue
        const d = diffDays(pl.closeDate, histTrades[i].closeDate)
        if (d > 3) continue

        // qty が一致する候補を優先
        const qtyMatch = pl.qty !== null && histTrades[i].qty !== null && pl.qty === histTrades[i].qty
        const score = d - (qtyMatch ? 1 : 0)  // qty一致で優先度UP
        if (score < bestDiff) {
          bestDiff = score
          bestIdx = i
        }
      }

      if (bestIdx >= 0) {
        usedHistIdx.add(bestIdx)
        const hist = histTrades[bestIdx]

        // closeDate が異なる場合は実現損益が受渡日を使っていると判断
        const closeDiff = diffDays(pl.closeDate, hist.closeDate)
        const plUsesSettlement = closeDiff >= 1

        // openDate: 取引履歴の約定日優先、なければ実現損益の日付から推定
        const openDate = hist.openDate
          ?? (pl.openDate
            ? (plUsesSettlement ? settlementToTradeDate(pl.openDate) : pl.openDate)
            : null)

        merged.push({
          ...pl,
          closeDate: hist.closeDate,  // 取引履歴の正確な約定日を使用
          openDate,
          avgCostYen: pl.avgCostYen ?? hist.avgCostYen,
        })
      } else {
        // マッチなし: 実現損益のみ（受渡日→約定日 推定変換を試みる）
        // ただし確信が持てないため変換せずそのまま使用
        merged.push({ ...pl })
      }
    }

    // マッチしなかった取引履歴トレードを追加（マーカー専用含む）
    for (let i = 0; i < histTrades.length; i++) {
      if (!usedHistIdx.has(i)) {
        merged.push({ ...histTrades[i] })
      }
    }
  }

  // Pass 2: 実現損益にない銘柄の取引履歴トレードを追加
  for (const [key, histTrades] of histGroups.entries()) {
    if (!plGroups.has(key)) {
      for (const h of histTrades) merged.push({ ...h })
    }
  }

  return merged.sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime())
}

/** デバッグ用: groupKey（旧互換） */
export function _groupKey(t: Trade): string {
  return `${t.code}::${t.account}::${dateKey(t.closeDate)}`
}

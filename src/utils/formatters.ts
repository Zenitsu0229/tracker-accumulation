export function fmtYen(n: number | null | undefined, showSign = true): string {
  if (n === null || n === undefined) return '—'
  const sign = showSign && n > 0 ? '+' : ''
  return sign + Math.round(n).toLocaleString('ja-JP') + '円'
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function fmtTime(d: Date | null | undefined): string {
  if (!d) return ''
  const h = d.getHours(); const m = d.getMinutes()
  if (h === 0 && m === 0) return ''
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function fmtDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

export function pnlColor(n: number | null): string {
  if (n === null) return 'text-gray-400'
  return n >= 0 ? 'text-emerald-400' : 'text-red-400'
}

export function pnlBg(n: number | null): string {
  if (n === null) return 'rgba(156,163,175,0.7)'
  return n >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)'
}

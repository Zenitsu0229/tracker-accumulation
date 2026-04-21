import { useState, useRef, useEffect, useMemo } from 'react'

export interface StockOption {
  value: string   // "code|name"
  code:  string
  name:  string
  pnl:   number
  count: number
}

interface Props {
  options:  StockOption[]
  value:    string
  onChange: (value: string) => void
}

export default function StockSearchSelect({ options, value, onChange }: Props) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(-1)

  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
        setCursor(-1)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Scroll highlighted item into view
  useEffect(() => {
    if (cursor < 0 || !listRef.current) return
    const item = listRef.current.children[cursor] as HTMLLIElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
    )
  }, [options, query])

  const handleOpen = () => {
    setOpen(true)
    setQuery('')
    setCursor(-1)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSelect = (opt: StockOption) => {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
    setCursor(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') { handleOpen(); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      setCursor((c) => Math.min(c + 1, filtered.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setCursor((c) => Math.max(c - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (cursor >= 0 && filtered[cursor]) { handleSelect(filtered[cursor]); e.preventDefault() }
    } else if (e.key === 'Escape') {
      setOpen(false); setQuery(''); setCursor(-1)
    }
  }

  const pnlColor = (pnl: number) => pnl >= 0 ? '#4ade80' : '#f87171'
  const sign     = (pnl: number) => pnl >= 0 ? '+' : ''

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 320 }}>
      {/* Trigger / display */}
      {open ? (
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(-1) }}
          onKeyDown={handleKeyDown}
          placeholder="銘柄名・コードで検索..."
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--accent)',
            color: 'var(--text)', padding: '7px 12px', fontSize: '0.85rem',
            outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
          autoFocus
        />
      ) : (
        <button
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border-bright)',
            color: 'var(--text)', padding: '7px 12px', fontSize: '0.85rem',
            textAlign: 'left', cursor: 'pointer', outline: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            fontFamily: 'inherit',
          }}
        >
          <span>
            {selected
              ? <><span style={{ color: 'var(--text)' }}>{selected.name}</span><span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: '0.78rem' }}>（{selected.code}）</span><span style={{ color: pnlColor(selected.pnl), marginLeft: 8, fontSize: '0.8rem' }}>{sign(selected.pnl)}{Math.round(selected.pnl).toLocaleString()}円</span></>
              : <span style={{ color: 'var(--muted)' }}>銘柄を選択...</span>
            }
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '0.7rem', flexShrink: 0 }}>▼</span>
        </button>
      )}

      {/* Dropdown list */}
      {open && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--surface)', border: '1px solid var(--border-bright)',
            borderTop: 'none', margin: 0, padding: 0, listStyle: 'none',
            maxHeight: 320, overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--muted)' }}>
              該当なし
            </li>
          ) : (
            filtered.map((o, i) => {
              const isActive   = o.value === value
              const isHighlight = i === cursor
              return (
                <li
                  key={o.value}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={() => handleSelect(o)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer', fontSize: '0.83rem',
                    background: isHighlight ? 'var(--surface2)' : isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  }}
                >
                  <span>
                    <span style={{ color: 'var(--text)', fontWeight: isActive ? 600 : 400 }}>{o.name}</span>
                    <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: '0.75rem' }}>（{o.code}）</span>
                  </span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ color: pnlColor(o.pnl), fontWeight: 600, fontSize: '0.8rem' }}>
                      {sign(o.pnl)}{Math.round(o.pnl).toLocaleString()}円
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{o.count}件</span>
                  </span>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}

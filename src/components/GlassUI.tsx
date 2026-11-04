import { useEffect, useRef, useState } from 'react'
import type { Meta } from '../data'
import { dayToISO, isoToDay } from '../data'
import { CATEGORY_COLORS, FALLBACK_DOT_COLOR } from '../config'

export type SheetKind = 'none' | 'filters' | 'search'

interface DockProps {
  selectedCount: number
  totalCount: number
  sheet: SheetKind
  setSheet: (s: SheetKind) => void
}

export function Dock({ selectedCount, totalCount, sheet, setSheet }: DockProps) {
  const toggle = (s: SheetKind) => setSheet(sheet === s ? 'none' : s)
  return (
    <div className="dock">
      <button
        className={`dock-round ${sheet === 'search' ? 'on' : ''}`}
        onClick={() => toggle('search')}
        aria-label="Search"
      >
        🔍
      </button>
      <button
        className={`dock-pill ${sheet === 'filters' ? 'on' : ''}`}
        onClick={() => toggle('filters')}
      >
        Categories
        <span className="dock-pill-count">
          {selectedCount === totalCount ? 'all' : `${selectedCount}/${totalCount}`}
        </span>
      </button>
    </div>
  )
}

interface FilterSheetProps {
  meta: Meta
  catSel: Set<string>
  setCatSel: (s: Set<string>) => void
  dayRange: [number, number]
  setDayRange: (r: [number, number]) => void
  onMethodology: () => void
}

export function FilterSheet(p: FilterSheetProps) {
  const { meta } = p
  const toggleCat = (id: string) => {
    const next = new Set(p.catSel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    p.setCatSel(next)
  }
  return (
    <div className="sheet">
      <div className="sheet-row sheet-head">
        <span>Categories</span>
        <span className="sheet-val">
          <button
            className="mini-chip"
            onClick={() => p.setCatSel(new Set(meta.categories.map((c) => c.id)))}
          >
            All
          </button>
          <button className="mini-chip" onClick={() => p.setCatSel(new Set())}>None</button>
        </span>
      </div>
      <div className="cat-list">
        {meta.categories.map((c) => (
          <label key={c.id} className="cat-row">
            <input type="checkbox" checked={p.catSel.has(c.id)} onChange={() => toggleCat(c.id)} />
            <span className="cat-dot" style={{ background: CATEGORY_COLORS[c.id] ?? FALLBACK_DOT_COLOR }} />
            <span className="cat-label">{c.label}</span>
            <span className="cat-count">{(meta.counts[c.id] ?? 0).toLocaleString()}</span>
          </label>
        ))}
      </div>
      <div className="sheet-row sheet-head" style={{ marginTop: 10 }}>
        <span>Date range</span>
      </div>
      <div className="date-row">
        <input
          type="date"
          value={dayToISO(p.dayRange[0])}
          min={dayToISO(meta.minDay)}
          max={dayToISO(p.dayRange[1])}
          onChange={(e) => e.target.value && p.setDayRange([isoToDay(e.target.value), p.dayRange[1]])}
        />
        <span>→</span>
        <input
          type="date"
          value={dayToISO(p.dayRange[1])}
          min={dayToISO(p.dayRange[0])}
          max={dayToISO(meta.maxDay)}
          onChange={(e) => e.target.value && p.setDayRange([p.dayRange[0], isoToDay(e.target.value)])}
        />
      </div>
      <div className="sheet-links">
        <button className="link-btn" onClick={p.onMethodology}>Methodology & data</button>
        <a href="https://github.com/ZihuiTommyWang/sf-safety-map" target="_blank" rel="noreferrer">GitHub</a>
        <span>Updated {meta.built.slice(0, 10)}</span>
      </div>
    </div>
  )
}

export interface SearchTarget {
  lng: number
  lat: number
  label: string
  id: number
}

interface SearchSheetProps {
  onResult: (t: SearchTarget) => void
  onClose: () => void
}

export function SearchSheet({ onResult, onClose }: SearchSheetProps) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const go = async () => {
    const query = q.trim()
    if (!query || busy) return
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '1',
        viewbox: '-122.55,37.84,-122.33,37.68',
        bounded: '1',
        q: query,
      })
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
      const rows = (await res.json()) as { lon: string; lat: string; display_name: string }[]
      if (!rows.length) {
        setError('Nothing found in SF — try a street address or place name.')
        return
      }
      onResult({ lng: Number(rows[0].lon), lat: Number(rows[0].lat), label: rows[0].display_name, id: Date.now() })
      onClose()
    } catch {
      setError('Search failed — check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet">
      <div className="search-row">
        <input
          ref={inputRef}
          value={q}
          placeholder="Address or place in SF…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go()
            if (e.key === 'Escape') onClose()
          }}
        />
        <button className="sheet-action inline" onClick={go} disabled={busy}>
          {busy ? '…' : 'Go'}
        </button>
      </div>
      {error && <p className="sheet-note error">{error}</p>}
      <p className="sheet-note">Search by <a href="https://nominatim.org" target="_blank" rel="noreferrer">Nominatim</a> / OpenStreetMap.</p>
    </div>
  )
}

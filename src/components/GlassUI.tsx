import { useEffect, useRef, useState } from 'react'
import type { Meta } from '../data'
import { dayToISO, isoToDay } from '../data'
import { CATEGORY_COLORS, FALLBACK_DOT_COLOR } from '../config'
import type { AddressIndex } from '../addressSearch'
import { loadAddressIndex, searchAddresses } from '../addressSearch'

export type SheetKind = 'none' | 'filters' | 'time' | 'search'

interface DockProps {
  selectedCount: number
  totalCount: number
  timeLabel: string
  sheet: SheetKind
  setSheet: (s: SheetKind) => void
}

export function Dock({ selectedCount, totalCount, timeLabel, sheet, setSheet }: DockProps) {
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
      <button
        className={`dock-pill ${sheet === 'time' ? 'on' : ''}`}
        onClick={() => toggle('time')}
      >
        {timeLabel}
        <span className="dock-pill-caret">▾</span>
      </button>
    </div>
  )
}

interface TimeSheetProps {
  meta: Meta
  dayRange: [number, number]
  setDayRange: (r: [number, number]) => void
}

export function TimeSheet(p: TimeSheetProps) {
  const { meta } = p
  return (
    <div className="sheet">
      <div className="sheet-row sheet-head">
        <span>Time window</span>
        <span className="sheet-val">
          {([
            ['30 days', 29],
            ['6 months', 182],
            ['Year', meta.maxDay - meta.minDay],
          ] as const).map(([label, span]) => {
            const from = Math.max(meta.minDay, meta.maxDay - span)
            const active = p.dayRange[0] === from && p.dayRange[1] === meta.maxDay
            return (
              <button
                key={label}
                className={`mini-chip ${active ? 'on' : ''}`}
                onClick={() => p.setDayRange([from, meta.maxDay])}
              >
                {label}
              </button>
            )
          })}
        </span>
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
      <p className="sheet-note">The map, counts, and report cards all follow this window.</p>
    </div>
  )
}

interface FilterSheetProps {
  meta: Meta
  catSel: Set<string>
  setCatSel: (s: Set<string>) => void
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
      <div className="sheet-links">
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

interface Suggestion {
  lng: number
  lat: number
  title: string
  sub: string
}

const SF_BBOX = { minLng: -122.55, maxLng: -122.33, minLat: 37.68, maxLat: 37.84 }

/** Dedupe key tolerant of "St" vs "Street" etc. between sources. */
function normKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd')
    .replace(/[^\w\s]/g, '')
    .trim()
}

export function SearchSheet({ onResult, onClose }: SearchSheetProps) {
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<AddressIndex | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)
  useEffect(() => {
    inputRef.current?.focus()
    loadAddressIndex().then(setIndex).catch(() => {})
  }, [])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 3) {
      setSugs([])
      setError(null)
      return
    }
    const seq = ++seqRef.current

    // Local results from the city's official address registry — instant.
    const local: Suggestion[] = index
      ? searchAddresses(index, query, 4).map((a) => ({ lng: a.lng, lat: a.lat, title: a.title, sub: a.sub }))
      : []
    setSugs(local)
    setError(null)

    // Photon (OSM) in parallel for places and businesses.
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          limit: '6',
          lat: '37.7749',
          lon: '-122.4194',
          bbox: `${SF_BBOX.minLng},${SF_BBOX.minLat},${SF_BBOX.maxLng},${SF_BBOX.maxLat}`,
        })
        const res = await fetch(`https://photon.komoot.io/api/?${params}`)
        const data = (await res.json()) as {
          features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[]
        }
        if (seq !== seqRef.current) return
        const seen = new Set(local.map((s) => normKey(s.title)))
        const out = [...local]
        for (const f of data.features ?? []) {
          if (out.length >= 7) break
          const [lng, lat] = f.geometry.coordinates
          if (lng < SF_BBOX.minLng || lng > SF_BBOX.maxLng || lat < SF_BBOX.minLat || lat > SF_BBOX.maxLat) continue
          const p = f.properties
          const title = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.name || p.street
          if (!title) continue
          const sub = [p.name && p.street && !p.housenumber ? p.street : null, p.district, p.city]
            .filter((x): x is string => Boolean(x && x !== title))
            .join(' · ')
          const key = normKey(title)
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ lng, lat, title, sub })
        }
        setSugs(out)
        setError(out.length ? null : 'Nothing found in SF — try a street address or place name.')
      } catch {
        if (seq === seqRef.current && !local.length) {
          setError('Search failed — check your connection and try again.')
        }
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [q, index])

  const pick = (s: Suggestion) => {
    onResult({ lng: s.lng, lat: s.lat, label: s.sub ? `${s.title}, ${s.sub}` : s.title, id: Date.now() })
    onClose()
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
            if (e.key === 'Enter' && sugs.length) pick(sugs[0])
            if (e.key === 'Escape') onClose()
          }}
        />
      </div>
      {sugs.length > 0 && (
        <ul className="sug-list">
          {sugs.map((s, i) => (
            <li key={i}>
              <button onClick={() => pick(s)}>
                <span className="sug-title">{s.title}</span>
                {s.sub && <span className="sug-sub">{s.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="sheet-note error">{error}</p>}
      <p className="sheet-note">
        Every official SF address (via <a href="https://data.sf.gov/d/3mea-di5p" target="_blank" rel="noreferrer">DataSF</a>) ·
        places by <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> / OpenStreetMap.
      </p>
    </div>
  )
}

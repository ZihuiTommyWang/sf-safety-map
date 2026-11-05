import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Meta } from '../data'
import { dayToISO, isoToDay } from '../data'
import { CATEGORY_COLORS, FALLBACK_DOT_COLOR } from '../config'
import type { AddressIndex } from '../addressSearch'
import { loadAddressIndex, searchAddresses } from '../addressSearch'

export interface SearchTarget {
  lng: number
  lat: number
  label: string
  id: number
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

function FeedbackForm() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const send = async () => {
    const message = text.trim()
    if (!message || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message, _subject: 'SF Safety Map feedback' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('sent')
      setText('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return <p className="sheet-note">Thanks — your feedback was sent.</p>
  }
  return (
    <>
      <textarea
        className="fb-text"
        rows={3}
        placeholder="A bug, an idea, a request…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="sheet-action" onClick={send} disabled={status === 'sending' || !text.trim()}>
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>
      {status === 'error' && <p className="sheet-note error">Could not send — please try again.</p>}
    </>
  )
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10.2" y1="10.2" x2="13.6" y2="13.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

type Panel = 'none' | 'crimes' | 'time' | 'feedback'

const FEEDBACK_ENDPOINT = 'https://formsubmit.co/ajax/tommyw628@gmail.com'

interface SheetProps {
  meta: Meta
  catSel: Set<string>
  setCatSel: (s: Set<string>) => void
  dayRange: [number, number]
  setDayRange: (r: [number, number]) => void
  timeBadge: string
  onResult: (t: SearchTarget) => void
  /** Card content (spot report / tapped incidents); renders in the sheet body. */
  children?: ReactNode
  /** Bumped whenever new content arrives, so the sheet auto-expands to show it. */
  contentVersion: number
  /** Bumped on map-tap dismiss / Escape: close panels and clear the search. */
  dismissVersion: number
}

export function Sheet(p: SheetProps) {
  const [panel, setPanel] = useState<Panel>('none')
  const [minimized, setMinimized] = useState(false)
  const dragY = useRef<number | null>(null)
  const [q, setQ] = useState('')
  const [sugs, setSugs] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<AddressIndex | null>(null)
  const seqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAddressIndex().then(setIndex).catch(() => {})
  }, [])

  // New card content (dot tap, search result): surface it immediately.
  useEffect(() => {
    if (p.contentVersion === 0) return
    setMinimized(false)
    setPanel('none')
    setQ('')
    setSugs([])
    inputRef.current?.blur()
  }, [p.contentVersion])

  // Dismiss gesture (empty map tap, Escape): tidy the sheet back to idle.
  useEffect(() => {
    if (p.dismissVersion === 0) return
    setPanel('none')
    setQ('')
    setSugs([])
    inputRef.current?.blur()
  }, [p.dismissVersion])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 3) {
      setSugs([])
      setError(null)
      return
    }
    const seq = ++seqRef.current

    const local: Suggestion[] = index
      ? searchAddresses(index, query, 3).map((a) => ({ lng: a.lng, lat: a.lat, title: a.title, sub: a.sub }))
      : []
    setSugs(local)
    setError(null)

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
          if (out.length >= 5) break
          const [lng, lat] = f.geometry.coordinates
          if (lng < SF_BBOX.minLng || lng > SF_BBOX.maxLng || lat < SF_BBOX.minLat || lat > SF_BBOX.maxLat) continue
          const pr = f.properties
          const title = pr.housenumber && pr.street ? `${pr.housenumber} ${pr.street}` : pr.name || pr.street
          if (!title) continue
          const sub = [pr.name && pr.street && !pr.housenumber ? pr.street : null, pr.district, pr.city]
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
    setQ('')
    setSugs([])
    setPanel('none')
    inputRef.current?.blur()
    p.onResult({ lng: s.lng, lat: s.lat, label: s.sub ? `${s.title}, ${s.sub}` : s.title, id: Date.now() })
  }

  const togglePanel = (next: Panel) => {
    setMinimized(false)
    setPanel(panel === next ? 'none' : next)
  }
  const searching = q.trim().length >= 3

  // Grab handle: tap toggles; drag up expands, drag down minimizes.
  const onGrabDown = (e: React.PointerEvent) => {
    dragY.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onGrabUp = (e: React.PointerEvent) => {
    if (dragY.current === null) return
    const dy = e.clientY - dragY.current
    dragY.current = null
    if (dy > 24) setMinimized(true)
    else if (dy < -24) setMinimized(false)
    else setMinimized((m) => !m)
  }

  return (
    <div className={`sheet-shell ${minimized ? 'min' : ''}`}>
      <button
        className="sheet-grab"
        onPointerDown={onGrabDown}
        onPointerUp={onGrabUp}
        aria-label={minimized ? 'Expand' : 'Minimize'}
      />
      <div className="sheet-search">
        <SearchIcon />
        <input
          ref={inputRef}
          value={q}
          placeholder="Search any SF address or place…"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setPanel('none')
            setMinimized(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && sugs.length) pick(sugs[0])
            if (e.key === 'Escape') {
              setQ('')
              inputRef.current?.blur()
            }
          }}
        />
        {q && (
          <button className="sheet-clear" onClick={() => setQ('')} aria-label="Clear search">
            ×
          </button>
        )}
      </div>
      <div className="sheet-fold">
      <div className="sheet-filters">
        <button className={panel === 'crimes' ? 'on' : ''} onClick={() => togglePanel('crimes')}>
          Crimes · <b>{p.catSel.size === p.meta.categories.length ? 'All' : `${p.catSel.size}/${p.meta.categories.length}`}</b>
        </button>
        <button className={panel === 'time' ? 'on' : ''} onClick={() => togglePanel('time')}>
          Time · <b>{p.timeBadge}</b>
        </button>
        <button
          className={`fb-btn ${panel === 'feedback' ? 'on' : ''}`}
          onClick={() => togglePanel('feedback')}
        >
          Feedback
        </button>
      </div>

      {searching && (
        <div className="sheet-body">
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
        </div>
      )}

      {!searching && panel === 'none' && p.children && <div className="sheet-body">{p.children}</div>}

      {!searching && panel === 'crimes' && (
        <div className="sheet-body">
          <div className="panel-head">
            <span>Crime types</span>
            <span className="panel-actions">
              <button className="mini-chip" onClick={() => p.setCatSel(new Set(p.meta.categories.map((c) => c.id)))}>
                All
              </button>
              <button className="mini-chip" onClick={() => p.setCatSel(new Set())}>
                None
              </button>
            </span>
          </div>
          <div className="cat-list">
            {p.meta.categories.map((c) => (
              <label key={c.id} className="cat-row">
                <input
                  type="checkbox"
                  checked={p.catSel.has(c.id)}
                  onChange={() => {
                    const next = new Set(p.catSel)
                    if (next.has(c.id)) next.delete(c.id)
                    else next.add(c.id)
                    p.setCatSel(next)
                  }}
                />
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[c.id] ?? FALLBACK_DOT_COLOR }} />
                <span className="cat-label">{c.label}</span>
                <span className="cat-count">{(p.meta.counts[c.id] ?? 0).toLocaleString()}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {!searching && panel === 'feedback' && (
        <div className="sheet-body">
          <FeedbackForm />
        </div>
      )}

      {!searching && panel === 'time' && (
        <div className="sheet-body">
          <div className="panel-head">
            <span>Time window</span>
            <span className="panel-actions">
              {([
                ['30 Days', 29],
                ['6 Months', 182],
                ['1 Year', 364],
                ['3 Years', p.meta.maxDay - p.meta.minDay],
              ] as const).map(([label, span]) => {
                const from = Math.max(p.meta.minDay, p.meta.maxDay - span)
                const active = p.dayRange[0] === from && p.dayRange[1] === p.meta.maxDay
                return (
                  <button
                    key={label}
                    className={`mini-chip ${active ? 'on' : ''}`}
                    onClick={() => p.setDayRange([from, p.meta.maxDay])}
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
              min={dayToISO(p.meta.minDay)}
              max={dayToISO(p.dayRange[1])}
              onChange={(e) => e.target.value && p.setDayRange([isoToDay(e.target.value), p.dayRange[1]])}
            />
            <span>→</span>
            <input
              type="date"
              value={dayToISO(p.dayRange[1])}
              min={dayToISO(p.dayRange[0])}
              max={dayToISO(p.meta.maxDay)}
              onChange={(e) => e.target.value && p.setDayRange([p.dayRange[0], isoToDay(e.target.value)])}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

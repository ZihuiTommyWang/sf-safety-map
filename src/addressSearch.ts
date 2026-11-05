// Instant, offline search over the city's official address registry
// (public/data/addresses.json, built nightly from DataSF's EAS dataset).

import { DATA_BASE } from './config'
import { CITY } from './city'

interface StreetEntry {
  s: string
  n: number[]
  x: number[]
  y: number[]
  d: number[]
  /**
   * Queens-style hyphenated house numbers ("89-64" stored as 8964): digits
   * after the hyphen, per address (0 = plain number). Absent on plain streets.
   */
  p?: number[]
}

export interface AddressIndex {
  x0: number
  y0: number
  nh: string[]
  streets: StreetEntry[]
}

let indexPromise: Promise<AddressIndex> | null = null

/** Lazily fetch the ~1.2MB-gzipped index the first time search is used. */
export function loadAddressIndex(): Promise<AddressIndex> {
  indexPromise ??= fetch(`${DATA_BASE}addresses.json`).then((r) => {
    if (!r.ok) {
      indexPromise = null
      throw new Error(`addresses.json: ${r.status}`)
    }
    return r.json() as Promise<AddressIndex>
  })
  return indexPromise
}

const SUFFIX: Record<string, string> = {
  STREET: 'ST', AVENUE: 'AVE', BOULEVARD: 'BLVD', DRIVE: 'DR', ROAD: 'RD',
  COURT: 'CT', PLACE: 'PL', LANE: 'LN', TERRACE: 'TER', CIRCLE: 'CIR',
  ALLEY: 'ALY', HIGHWAY: 'HWY', PLAZA: 'PLZ', SQUARE: 'SQ', PARKWAY: 'PKWY',
}

function normStreet(input: string): string {
  return input
    .toUpperCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      // NYC's registry writes numbered streets without ordinals ("5 AVE"),
      // SF's with them ("1ST ST") — normalize the query to match.
      if (CITY.id === 'nyc') {
        const ord = w.match(/^(\d+)(ST|ND|RD|TH)$/)
        if (ord) return ord[1]
      }
      return SUFFIX[w] ?? w
    })
    .join(' ')
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
}

export interface AddressSuggestion {
  lng: number
  lat: number
  title: string
  sub: string
  exact: boolean
}

/** House number as displayed: re-inserts the Queens hyphen if the street has one. */
function fmtNum(e: StreetEntry, i: number): string {
  const s = String(e.n[i])
  const cut = e.p?.[i] ?? 0
  return cut > 0 && cut < s.length ? `${s.slice(0, s.length - cut)}-${s.slice(s.length - cut)}` : s
}

export function searchAddresses(idx: AddressIndex, query: string, limit = 5): AddressSuggestion[] {
  const m = query.trim().match(/^(\d+(?:-\d+)?)\s+(.+)$/)
  const num = m ? Number(m[1].replace('-', '')) : null
  const frag = normStreet(m ? m[2] : query.trim())
  if (!frag) return []

  // Score street matches: prefix on the full name beats substring.
  const matches: { e: StreetEntry; score: number }[] = []
  for (const e of idx.streets) {
    if (e.s.startsWith(frag)) matches.push({ e, score: 2 })
    else if (frag.length >= 3 && e.s.includes(frag)) matches.push({ e, score: 1 })
  }
  matches.sort((a, b) => b.score - a.score || a.e.s.localeCompare(b.e.s))

  const out: AddressSuggestion[] = []
  const at = (e: StreetEntry, i: number, exact: boolean) => ({
    lng: e.x[i] / 1e5 + idx.x0,
    lat: e.y[i] / 1e5 + idx.y0,
    title: titleCase(`${fmtNum(e, i)} ${e.s}`),
    sub: idx.nh[e.d[i]] || CITY.name,
    exact,
  })

  for (const { e } of matches) {
    if (out.length >= limit) break
    if (num === null) {
      // Street-only query: offer the street itself (midpoint address).
      const mid = e.n.length >> 1
      out.push({ ...at(e, mid, false), title: titleCase(e.s), sub: idx.nh[e.d[mid]] || CITY.name })
      continue
    }
    // Binary search for the requested number.
    let lo = 0
    let hi = e.n.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (e.n[mid] < num) lo = mid + 1
      else hi = mid
    }
    if (e.n[lo] === num) {
      out.push(at(e, lo, true))
    } else {
      // No such number on this street — offer the nearest real ones.
      const candidates = [lo - 1, lo]
        .filter((i) => i >= 0 && i < e.n.length)
        .sort((a, b) => Math.abs(e.n[a] - num) - Math.abs(e.n[b] - num))
      for (const i of candidates.slice(0, out.length === 0 ? 2 : 1)) {
        out.push(at(e, i, false))
        if (out.length >= limit) break
      }
    }
  }
  return out.slice(0, limit)
}

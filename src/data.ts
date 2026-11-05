import { DATA_BASE, EXPOSURE } from './config'
import { CITY } from './city'

export interface Category {
  id: string
  label: string
}

export interface PresetGroup {
  label: string
  cats: string[]
}

export interface Meta {
  built: string
  day0: string
  minDay: number
  maxDay: number
  total: number
  /** Reports whose time was not recorded (stored with hour = HOUR_UNKNOWN). */
  timeUnknown: number
  hourUnknown: number
  categories: Category[]
  presets: Record<string, PresetGroup>
  counts: Record<string, number>
  /**
   * Large cities split incidents into several files, newest first; the app
   * loads the first eagerly and the rest only when the time filter needs them.
   * Absent for cities small enough for a single incidents.json (SF).
   */
  files?: { name: string; minDay: number; maxDay: number }[]
  /** Source publishes on a lag (NYPD: quarterly) — the date data runs through. */
  dataThrough?: string
}

/** Sentinel stored in the hour column when the report's time was not recorded. */
export const HOUR_UNKNOWN = 24

export interface Incidents {
  n: number
  lat: number[]
  lng: number[]
  cat: number[]
  day: number[]
  hour: number[]
  desc: number[]
  res: number[]
  descs: string[]
  resolutions: string[]
}

export interface DataBundle {
  meta: Meta
  incidents: Incidents
  geojson: GeoJSON.FeatureCollection
  /** Hex id per incident, for exposure-tier density computation. */
  pointHex: Int32Array
  hexCount: number
  /** Earliest day currently in memory (older chunks may still be on the server). */
  loadedMinDay: number
  /** In-flight older-chunk fetch, so concurrent requests coalesce. */
  pending?: Promise<boolean>
}

const DAY0_UTC = Date.UTC(2018, 0, 1)

export function dayToDate(day: number): Date {
  return new Date(DAY0_UTC + day * 86400000)
}

export function dayToISO(day: number): string {
  return dayToDate(day).toISOString().slice(0, 10)
}

export function isoToDay(iso: string): number {
  return Math.floor((Date.parse(`${iso}T00:00:00Z`) - DAY0_UTC) / 86400000)
}

export function formatHour(h: number): string {
  if (h === HOUR_UNKNOWN) return 'unknown'
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

async function fetchJSON<T>(name: string): Promise<T> {
  const r = await fetch(`${DATA_BASE}${name}`)
  if (!r.ok) throw new Error(`${name}: ${r.status}`)
  return r.json() as Promise<T>
}

/** Append features for incidents [from, inc.n) to the (mutable) geojson. */
function appendFeatures(geojson: GeoJSON.FeatureCollection, inc: Incidents, from: number): void {
  for (let i = from; i < inc.n; i++) {
    geojson.features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [inc.lng[i], inc.lat[i]] },
      properties: { i, c: inc.cat[i], d: inc.day[i], h: inc.hour[i], t: 0 },
    })
  }
}

/** Merge a chunk into the bundle's columnar store, re-interning its string tables. */
function appendChunk(inc: Incidents, chunk: Incidents): void {
  const descMap = chunk.descs.map((s) => {
    let i = inc.descs.indexOf(s)
    if (i === -1) {
      i = inc.descs.length
      inc.descs.push(s)
    }
    return i
  })
  const resMap = chunk.resolutions.map((s) => {
    let i = inc.resolutions.indexOf(s)
    if (i === -1) {
      i = inc.resolutions.length
      inc.resolutions.push(s)
    }
    return i
  })
  for (let i = 0; i < chunk.n; i++) {
    inc.lat.push(chunk.lat[i])
    inc.lng.push(chunk.lng[i])
    inc.cat.push(chunk.cat[i])
    inc.day.push(chunk.day[i])
    inc.hour.push(chunk.hour[i])
    inc.desc.push(descMap[chunk.desc[i]])
    inc.res.push(resMap[chunk.res[i]])
  }
  inc.n += chunk.n
}

export async function loadData(): Promise<DataBundle> {
  const meta = await fetchJSON<Meta>('meta.json')
  const firstFile = meta.files ? meta.files[0].name : 'incidents.json'
  const incidents = await fetchJSON<Incidents>(firstFile)
  const { pointHex, hexCount } = buildHexIndex(incidents)

  // Built once; the map layers then filter on the small numeric properties.
  // `t` (exposure tier) is rewritten in place by applyTiers when filters change.
  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  appendFeatures(geojson, incidents, 0)
  const loadedMinDay = meta.files ? meta.files[0].minDay : meta.minDay
  return { meta, incidents, geojson, pointHex, hexCount, loadedMinDay }
}

/**
 * Makes sure incidents back to `minDayNeeded` are in memory, fetching older
 * chunks if necessary. Resolves true when new data was appended (the caller
 * should re-apply tiers and re-render).
 */
export function ensureCoverage(bundle: DataBundle, minDayNeeded: number): Promise<boolean> {
  if (!bundle.meta.files || minDayNeeded >= bundle.loadedMinDay) return Promise.resolve(false)
  bundle.pending ??= (async () => {
    try {
      const toLoad = bundle.meta.files!.filter((f) => f.minDay < bundle.loadedMinDay)
      let appended = false
      for (const f of toLoad) {
        const chunk = await fetchJSON<Incidents>(f.name)
        const from = bundle.incidents.n
        appendChunk(bundle.incidents, chunk)
        appendFeatures(bundle.geojson, bundle.incidents, from)
        bundle.loadedMinDay = Math.min(bundle.loadedMinDay, f.minDay)
        appended = true
      }
      if (appended) {
        const { pointHex, hexCount } = buildHexIndex(bundle.incidents)
        bundle.pointHex = pointHex
        bundle.hexCount = hexCount
      }
      return appended
    } finally {
      bundle.pending = undefined
    }
  })()
  return bundle.pending
}

// ---------- exposure tiers ----------

const [LAT0, LNG0] = CITY.hexOrigin
const MXm = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const MYm = 110540

/** Assigns each incident to a pointy-top hex of ~EXPOSURE.hexSizeM meters. */
function buildHexIndex(inc: Incidents): { pointHex: Int32Array; hexCount: number } {
  const size = EXPOSURE.hexSizeM
  const ids = new Map<string, number>()
  const pointHex = new Int32Array(inc.n)
  for (let i = 0; i < inc.n; i++) {
    const x = (inc.lng[i] - LNG0) * MXm
    const y = (inc.lat[i] - LAT0) * MYm
    const q = ((Math.sqrt(3) / 3) * x - y / 3) / size
    const r = ((2 / 3) * y) / size
    let rq = Math.round(q)
    let rr = Math.round(r)
    const rs = Math.round(-q - r)
    const dq = Math.abs(rq - q)
    const dr = Math.abs(rr - r)
    const ds = Math.abs(rs - (-q - r))
    if (dq > dr && dq > ds) rq = -rr - rs
    else if (dr > ds) rr = -rq - rs
    const key = `${rq},${rr}`
    let id = ids.get(key)
    if (id === undefined) {
      id = ids.size
      ids.set(key, id)
    }
    pointHex[i] = id
  }
  return { pointHex, hexCount: ids.size }
}

export interface SpotStats {
  count: number
  /** Incident density here vs. the citywide average, under the same filters. */
  mult: number
  /** What an average spot of the same radius citywide would see, same filters. */
  typical: number
  /** The most recent incidents in the radius, newest first, with distance. */
  recent: { i: number; dist: number }[]
}


export function spotStats(
  bundle: DataBundle,
  f: FilterState,
  lng: number,
  lat: number,
  radiusM = 300,
): SpotStats {
  const inc = bundle.incidents
  const r2 = radiusM * radiusM
  const [d0, d1] = f.dayRange
  const local: { i: number; dist: number }[] = []
  for (let i = 0; i < inc.n; i++) {
    if (!f.cats.has(inc.cat[i])) continue
    if (inc.day[i] < d0 || inc.day[i] > d1) continue
    const dx = (inc.lng[i] - lng) * MXm
    const dy = (inc.lat[i] - lat) * MYm
    const distSq = dx * dx + dy * dy
    if (distSq > r2) continue
    local.push({ i, dist: Math.round(Math.sqrt(distSq)) })
  }
  local.sort((a, b) => inc.day[b.i] - inc.day[a.i])
  const area = Math.PI * r2
  const typical = (countFiltered(inc, f) / CITY.landM2) * area
  return {
    count: local.length,
    mult: typical > 0 ? local.length / typical : 0,
    typical: Math.round(typical),
    recent: local.slice(0, 5),
  }
}

/**
 * Recomputes each feature's exposure tier `t` (0–4) in place: the citywide
 * percentile of its hex's incident count, counting only incidents matching the
 * active categories and date range. Hour filters deliberately don't participate
 * so the scrubber animation never forces a source update.
 */
export function applyTiers(bundle: DataBundle, cats: Set<number>, dayRange: [number, number]): void {
  const { incidents: inc, pointHex } = bundle
  const counts = new Int32Array(bundle.hexCount)
  const [d0, d1] = dayRange
  for (let i = 0; i < inc.n; i++) {
    if (!cats.has(inc.cat[i])) continue
    if (inc.day[i] < d0 || inc.day[i] > d1) continue
    counts[pointHex[i]]++
  }
  const nonzero: number[] = []
  for (const c of counts) if (c > 0) nonzero.push(c)
  nonzero.sort((a, b) => a - b)
  const q = (p: number) => (nonzero.length ? nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] : 1)
  const T = EXPOSURE.quantiles.map(q)
  for (let i = 0; i < inc.n; i++) {
    const n = counts[pointHex[i]]
    const t = n >= T[3] ? 4 : n >= T[2] ? 3 : n >= T[1] ? 2 : n >= T[0] ? 1 : 0
    ;(bundle.geojson.features[i].properties as { t: number }).t = t
  }
}

export interface FilterState {
  cats: Set<number>
  dayRange: [number, number]
}

export function countFiltered(inc: Incidents, f: FilterState): number {
  const { cat, day } = inc
  const [d0, d1] = f.dayRange
  let n = 0
  for (let i = 0; i < inc.n; i++) {
    if (!f.cats.has(cat[i])) continue
    if (day[i] < d0 || day[i] > d1) continue
    n++
  }
  return n
}

/** MapLibre filter expression matching FilterState, for heat + dot layers. */
export function toMapFilter(f: FilterState): unknown[] {
  const catList = [...f.cats]
  const catExpr = catList.length
    ? ['match', ['get', 'c'], catList, true, false]
    : ['boolean', false]
  return [
    'all',
    catExpr,
    ['>=', ['get', 'd'], f.dayRange[0]],
    ['<=', ['get', 'd'], f.dayRange[1]],
  ]
}

import { DATA_BASE, EXPOSURE } from './config'

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

export async function loadData(): Promise<DataBundle> {
  const [meta, incidents] = await Promise.all([
    fetch(`${DATA_BASE}meta.json`).then((r) => {
      if (!r.ok) throw new Error(`meta.json: ${r.status}`)
      return r.json() as Promise<Meta>
    }),
    fetch(`${DATA_BASE}incidents.json`).then((r) => {
      if (!r.ok) throw new Error(`incidents.json: ${r.status}`)
      return r.json() as Promise<Incidents>
    }),
  ])

  const { pointHex, hexCount } = buildHexIndex(incidents)

  // Built once; the map layers then filter on the small numeric properties.
  // `t` (exposure tier) is rewritten in place by applyTiers when filters change.
  const features: GeoJSON.Feature[] = new Array(incidents.n)
  for (let i = 0; i < incidents.n; i++) {
    features[i] = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [incidents.lng[i], incidents.lat[i]] },
      properties: { i, c: incidents.cat[i], d: incidents.day[i], h: incidents.hour[i], t: 0 },
    }
  }
  return { meta, incidents, geojson: { type: 'FeatureCollection', features }, pointHex, hexCount }
}

// ---------- exposure tiers ----------

const LAT0 = 37.768
const LNG0 = -122.435
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
  hourRange: [number, number]
  /** When >= 0, the scrubber overrides hourRange with a single hour. */
  scrubHour: number
}

/**
 * Reports with an unrecorded time (hour = HOUR_UNKNOWN = 24) are included only
 * when no time filtering is active: the full 12 AM–11 PM range with the
 * scrubber off. Any narrower view excludes them rather than lying about when
 * they happened.
 */
function isFullHourRange(f: FilterState): boolean {
  return f.scrubHour < 0 && f.hourRange[0] === 0 && f.hourRange[1] === 23
}

export function countFiltered(inc: Incidents, f: FilterState): number {
  const { cat, day, hour } = inc
  const [d0, d1] = f.dayRange
  const [h0, h1] = f.hourRange
  const allHours = isFullHourRange(f)
  let n = 0
  for (let i = 0; i < inc.n; i++) {
    if (!f.cats.has(cat[i])) continue
    if (day[i] < d0 || day[i] > d1) continue
    if (!allHours) {
      if (f.scrubHour >= 0 ? hour[i] !== f.scrubHour : hour[i] < h0 || hour[i] > h1) continue
    }
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
  const hourExpr = isFullHourRange(f)
    ? true
    : f.scrubHour >= 0
      ? ['==', ['get', 'h'], f.scrubHour]
      : ['all', ['>=', ['get', 'h'], f.hourRange[0]], ['<=', ['get', 'h'], f.hourRange[1]]]
  return [
    'all',
    catExpr,
    ['>=', ['get', 'd'], f.dayRange[0]],
    ['<=', ['get', 'd'], f.dayRange[1]],
    hourExpr,
  ]
}

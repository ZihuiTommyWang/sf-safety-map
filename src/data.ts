import { DATA_BASE } from './config'

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
  categories: Category[]
  presets: Record<string, PresetGroup>
  counts: Record<string, number>
}

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

  // Built once; the map layers then filter on the small numeric properties.
  const features: GeoJSON.Feature[] = new Array(incidents.n)
  for (let i = 0; i < incidents.n; i++) {
    features[i] = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [incidents.lng[i], incidents.lat[i]] },
      properties: { i, c: incidents.cat[i], d: incidents.day[i], h: incidents.hour[i] },
    }
  }
  return { meta, incidents, geojson: { type: 'FeatureCollection', features } }
}

export interface FilterState {
  cats: Set<number>
  dayRange: [number, number]
  hourRange: [number, number]
  /** When >= 0, the scrubber overrides hourRange with a single hour. */
  scrubHour: number
}

export function countFiltered(inc: Incidents, f: FilterState): number {
  const { cat, day, hour } = inc
  const [d0, d1] = f.dayRange
  const [h0, h1] = f.hourRange
  let n = 0
  for (let i = 0; i < inc.n; i++) {
    if (!f.cats.has(cat[i])) continue
    if (day[i] < d0 || day[i] > d1) continue
    if (f.scrubHour >= 0 ? hour[i] !== f.scrubHour : hour[i] < h0 || hour[i] > h1) continue
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
  const hourExpr =
    f.scrubHour >= 0
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

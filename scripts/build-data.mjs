// Fetches the last 12 months of SFPD incident reports from DataSF and writes
// compact columnar JSON to public/data/ for the static frontend.
//
// Source: Police Department Incident Reports 2018-present (dataset wg3w-h783)
// https://data.sfgov.org/Public-Safety/wg3w-h783 — public Socrata SODA API, no key.
//
// Usage: node scripts/build-data.mjs

import { writeFile, mkdir } from 'node:fs/promises'
import { DISPLAY_CATEGORIES, PRESET_GROUPS, mapIncident } from './categories.mjs'

const ENDPOINT = 'https://data.sf.gov/resource/wg3w-h783.json'
const PAGE_SIZE = 50000
const MONTHS_BACK = 12
// Day indexes are stored relative to this date to keep the numbers small.
export const DAY0_UTC = Date.UTC(2018, 0, 1)

const cutoff = new Date()
cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS_BACK)
const cutoffStr = cutoff.toISOString().slice(0, 10)

const SELECT = [
  'incident_date',
  'incident_time',
  'incident_category',
  'incident_subcategory',
  'incident_description',
  'resolution',
  'latitude',
  'longitude',
].join(',')

// Rough SF bounding box to drop bad geocodes.
const SF = { minLat: 37.68, maxLat: 37.84, minLng: -122.55, maxLng: -122.33 }

async function fetchPage(offset) {
  const params = new URLSearchParams({
    $select: SELECT,
    $where: `incident_date >= '${cutoffStr}T00:00:00' AND latitude IS NOT NULL`,
    $order: 'incident_date, incident_time',
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
  })
  const url = `${ENDPOINT}?${params}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'sf-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' },
  })
  if (!res.ok) throw new Error(`DataSF request failed: ${res.status} ${await res.text()}`)
  return res.json()
}

const catIndex = new Map(DISPLAY_CATEGORIES.map((c, i) => [c.id, i]))

const lat = []
const lng = []
const cat = []
const day = []
const hour = []
const desc = []
const res = []
const descIndex = new Map()
const resIndex = new Map()
const descs = []
const resolutions = []
const unmapped = new Map()

function intern(value, index, list) {
  let i = index.get(value)
  if (i === undefined) {
    i = list.length
    list.push(value)
    index.set(value, i)
  }
  return i
}

let offset = 0
let fetched = 0
for (;;) {
  const rows = await fetchPage(offset)
  fetched += rows.length
  process.stderr.write(`fetched ${fetched} rows...\n`)
  for (const row of rows) {
    const la = Number(row.latitude)
    const lo = Number(row.longitude)
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue
    if (la < SF.minLat || la > SF.maxLat || lo < SF.minLng || lo > SF.maxLng) continue

    const catId = mapIncident(row.incident_category, row.incident_subcategory)
    if (catId === 'other' && row.incident_category) {
      const key = row.incident_category
      unmapped.set(key, (unmapped.get(key) || 0) + 1)
    }

    const d = Math.floor((Date.parse(`${row.incident_date.slice(0, 10)}T00:00:00Z`) - DAY0_UTC) / 86400000)
    const h = row.incident_time ? Number(row.incident_time.slice(0, 2)) : 0

    lat.push(Math.round(la * 1e5) / 1e5)
    lng.push(Math.round(lo * 1e5) / 1e5)
    cat.push(catIndex.get(catId))
    day.push(d)
    hour.push(Number.isFinite(h) ? h : 0)
    desc.push(intern(row.incident_description || row.incident_category || 'Unknown', descIndex, descs))
    res.push(intern(row.resolution || 'Unknown', resIndex, resolutions))
  }
  if (rows.length < PAGE_SIZE) break
  offset += PAGE_SIZE
}

if (lat.length < 10000) {
  throw new Error(`Suspiciously few incidents (${lat.length}) — aborting so we don't publish bad data.`)
}

const minDay = Math.min(...day)
const maxDay = Math.max(...day)

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })

const incidents = { n: lat.length, lat, lng, cat, day, hour, desc, res, descs, resolutions }
await writeFile(new URL('../public/data/incidents.json', import.meta.url), JSON.stringify(incidents))

const counts = {}
for (const c of cat) {
  const id = DISPLAY_CATEGORIES[c].id
  counts[id] = (counts[id] || 0) + 1
}

const meta = {
  built: new Date().toISOString(),
  day0: '2018-01-01',
  minDay,
  maxDay,
  total: lat.length,
  categories: DISPLAY_CATEGORIES,
  presets: PRESET_GROUPS,
  counts,
}
await writeFile(new URL('../public/data/meta.json', import.meta.url), JSON.stringify(meta, null, 2))

console.log(`\nWrote ${lat.length} incidents (${cutoffStr} → now)`)
console.log(`Date range: day ${minDay}–${maxDay}; ${descs.length} unique descriptions`)
console.log('Category counts:', counts)
if (unmapped.size) {
  console.log('\nCategories that fell through to "other":')
  for (const [k, v] of [...unmapped.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
}

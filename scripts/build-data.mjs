// Fetches the last 12 months of SFPD incident reports from DataSF and writes
// compact columnar JSON to public/data/ for the static frontend.
//
// Source: Police Department Incident Reports 2018-present (dataset wg3w-h783)
// https://data.sf.gov/d/wg3w-h783 — public Socrata SODA API. No key required;
// set SODA_APP_TOKEN to avoid anonymous throttling.
//
// This output is NOT committed to git — the deploy workflow builds it fresh.
// Guards below make the build fail loudly instead of publishing bad data.
//
// Usage: node scripts/build-data.mjs

import { writeFile, mkdir } from 'node:fs/promises'
import { DISPLAY_CATEGORIES, PRESET_GROUPS, KNOWN_DROPPED, MAPPED_RAW, mapIncident } from './categories.mjs'

const ENDPOINT = 'https://data.sf.gov/resource/wg3w-h783.json'
const PAGE_SIZE = 50000
const MONTHS_BACK = 12
// Day indexes are stored relative to this date to keep the numbers small.
export const DAY0_UTC = Date.UTC(2018, 0, 1)
// Stored in the hour column when the report has no usable time (see below).
const HOUR_UNKNOWN = 24

const cutoff = new Date()
cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS_BACK)
const cutoffStr = cutoff.toISOString().slice(0, 10)

const SELECT = [
  'row_id',
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

const headers = { Accept: 'application/json', 'User-Agent': 'sf-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' }
if (process.env.SODA_APP_TOKEN) headers['X-App-Token'] = process.env.SODA_APP_TOKEN

async function fetchPage(offset) {
  const params = new URLSearchParams({
    $select: SELECT,
    $where: `incident_date >= '${cutoffStr}T00:00:00' AND latitude IS NOT NULL`,
    // :id is Socrata's system row identifier — the only ordering that is
    // guaranteed stable across paged requests. Ordering by date/time is NOT
    // stable (thousands of rows tie) and can duplicate or skip rows.
    $order: ':id',
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
  })
  const res = await fetch(`${ENDPOINT}?${params}`, { headers })
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
const dropped = new Map()
const seenRows = new Set()
let duplicates = 0
let timeUnknown = 0

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
    if (row.row_id) {
      if (seenRows.has(row.row_id)) {
        duplicates++
        continue
      }
      seenRows.add(row.row_id)
    }

    const la = Number(row.latitude)
    const lo = Number(row.longitude)
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue
    if (la < SF.minLat || la > SF.maxLat || lo < SF.minLng || lo > SF.maxLng) continue

    const catId = mapIncident(row.incident_category, row.incident_subcategory, row.incident_description)
    if (catId === null) {
      const key = (row.incident_category || '(null)').toLowerCase().trim()
      dropped.set(key, (dropped.get(key) || 0) + 1)
      continue
    }

    const d = Math.floor((Date.parse(`${row.incident_date.slice(0, 10)}T00:00:00Z`) - DAY0_UTC) / 86400000)

    // "00:00" is overwhelmingly a data-entry default for "time not recorded"
    // (3.5k reports vs ~1.1k for a normal busy hour), so exact midnight is
    // treated as unknown rather than poisoning the hour-of-day view.
    let h = HOUR_UNKNOWN
    const t = row.incident_time
    if (t && t !== '00:00') {
      const parsed = Number(t.slice(0, 2))
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 23) h = parsed
    }
    if (h === HOUR_UNKNOWN) timeUnknown++

    lat.push(Math.round(la * 1e5) / 1e5)
    lng.push(Math.round(lo * 1e5) / 1e5)
    cat.push(catIndex.get(catId))
    day.push(d)
    hour.push(h)
    desc.push(intern(row.incident_description || row.incident_category || 'Unknown', descIndex, descs))
    res.push(intern(row.resolution || 'Unknown', resIndex, resolutions))
  }
  if (rows.length < PAGE_SIZE) break
  offset += PAGE_SIZE
}

// ---- Guards: fail loudly rather than publish bad data. ----

// Taxonomy drift: a substantial raw category that is neither mapped nor on the
// known-dropped list means SFPD changed their vocabulary — a human must look.
const DRIFT_THRESHOLD = 500
const unexpected = [...dropped.entries()].filter(([k]) => !KNOWN_DROPPED.has(k) && !MAPPED_RAW.has(k))
for (const [k, v] of unexpected) {
  const line = `Unrecognized raw category "${k}": ${v} rows (not mapped, not known-dropped)`
  if (v > DRIFT_THRESHOLD) throw new Error(`${line} — refusing to build. Update scripts/categories.mjs.`)
  console.warn(`WARNING: ${line}`)
}

// Volume floors: a DataSF outage or partial response must not wipe the map.
if (lat.length < 30000) {
  throw new Error(`Suspiciously few incidents (${lat.length}, expected ~50k) — aborting.`)
}
const counts = {}
for (const c of cat) {
  const id = DISPLAY_CATEGORIES[c].id
  counts[id] = (counts[id] || 0) + 1
}
for (const core of ['assault', 'theft', 'drugs']) {
  if ((counts[core] || 0) < 500) {
    throw new Error(`Core category "${core}" has only ${counts[core] || 0} rows — mapping likely broken.`)
  }
}

// ---- Write output. ----

const minDay = Math.min(...day)
const maxDay = Math.max(...day)

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })

const incidents = { n: lat.length, lat, lng, cat, day, hour, desc, res, descs, resolutions }
await writeFile(new URL('../public/data/incidents.json', import.meta.url), JSON.stringify(incidents))

const meta = {
  built: new Date().toISOString(),
  day0: '2018-01-01',
  minDay,
  maxDay,
  total: lat.length,
  timeUnknown,
  hourUnknown: HOUR_UNKNOWN,
  categories: DISPLAY_CATEGORIES,
  presets: PRESET_GROUPS,
  counts,
}
await writeFile(new URL('../public/data/meta.json', import.meta.url), JSON.stringify(meta, null, 2))

console.log(`\nWrote ${lat.length} incidents (${cutoffStr} → now); ${duplicates} duplicate rows skipped`)
console.log(`Date range: day ${minDay}–${maxDay}; ${descs.length} unique descriptions; ${timeUnknown} with unknown time`)
console.log('Category counts:', counts)
const droppedTotal = [...dropped.values()].reduce((a, b) => a + b, 0)
console.log(`Dropped ${droppedTotal} non-safety reports (all raw categories recognized: ${unexpected.length === 0})`)

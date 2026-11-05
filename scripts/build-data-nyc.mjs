// Fetches the last 36 months of NYPD complaint reports from NYC Open Data and
// writes compact columnar JSON to public-nyc/data/ for the static frontend.
//
// Sources (public Socrata SODA API; SODA_APP_TOKEN avoids throttling):
//   qgea-i56i  NYPD Complaint Data Historic (through the last full year)
//   5uac-w243  NYPD Complaint Data Current (Year To Date)
// The NYPD publishes quarterly, so "now" is the YTD dataset's max date —
// typically a few months behind the calendar. meta.dataThrough records it.
//
// NYC has ~3x SF's volume, so incidents are split into three 12-month files
// (newest first); the app loads the first eagerly and the rest on demand.
//
// Usage: node scripts/build-data-nyc.mjs

import { writeFile, mkdir } from 'node:fs/promises'
import { DISPLAY_CATEGORIES, KNOWN_DROPPED, MAPPED_RAW, mapIncidentNYC } from './categories-nyc.mjs'

const HISTORIC = 'https://data.cityofnewyork.us/resource/qgea-i56i.json'
const YTD = 'https://data.cityofnewyork.us/resource/5uac-w243.json'
const PAGE_SIZE = 50000
const MONTHS_BACK = 36
export const DAY0_UTC = Date.UTC(2018, 0, 1)
const HOUR_UNKNOWN = 24

// Rough NYC bounding box to drop bad geocodes.
const NYC = { minLat: 40.48, maxLat: 40.93, minLng: -74.28, maxLng: -73.65 }

const SELECT = [
  'cmplnt_num',
  'cmplnt_fr_dt',
  'cmplnt_fr_tm',
  'ofns_desc',
  'pd_desc',
  'law_cat_cd',
  'latitude',
  'longitude',
].join(',')

const headers = { Accept: 'application/json', 'User-Agent': 'city-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' }
if (process.env.SODA_APP_TOKEN) headers['X-App-Token'] = process.env.SODA_APP_TOKEN

// The API routinely hangs or 5xxs on individual pages of a multi-million-row
// pull — retry each page with backoff rather than losing the whole build.
async function fetchJSON(url) {
  let lastErr
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(120000) })
      if (!res.ok) throw new Error(`NYC Open Data request failed: ${res.status} ${await res.text()}`)
      return await res.json()
    } catch (err) {
      lastErr = err
      process.stderr.write(`request failed (attempt ${attempt}/5): ${err.message || err}\n`)
      await new Promise((r) => setTimeout(r, 10000 * attempt))
    }
  }
  throw lastErr
}

// The data's "now": the newest plausible date in the YTD dataset (it contains
// a handful of garbage dates, so bound by the calendar).
const todayISO = new Date().toISOString().slice(0, 10)
const maxRow = await fetchJSON(
  `${YTD}?$select=max(cmplnt_fr_dt)&$where=cmplnt_fr_dt <= '${todayISO}T23:59:59'`,
)
const dataThrough = maxRow[0].max_cmplnt_fr_dt.slice(0, 10)
const cutoff = new Date(`${dataThrough}T00:00:00Z`)
cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS_BACK)
const cutoffStr = cutoff.toISOString().slice(0, 10)
console.log(`Data through ${dataThrough} (NYPD publishes quarterly); window starts ${cutoffStr}`)

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
const seen = new Set()
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

/** "LARCENY,PETIT FROM AUTO" → "Larceny, Petit From Auto" */
function displayDesc(s) {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,(?=\S)/g, ', ')
    .replace(/(^|[\s,/&-])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase())
    .trim()
}

const SEVERITY = { FELONY: 'Felony', MISDEMEANOR: 'Misdemeanor', VIOLATION: 'Violation' }

function ingest(row) {
  if (row.cmplnt_num) {
    if (seen.has(row.cmplnt_num)) {
      duplicates++
      return
    }
    seen.add(row.cmplnt_num)
  }

  const la = Number(row.latitude)
  const lo = Number(row.longitude)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return
  if (la < NYC.minLat || la > NYC.maxLat || lo < NYC.minLng || lo > NYC.maxLng) return

  const dateStr = (row.cmplnt_fr_dt || '').slice(0, 10)
  if (dateStr < cutoffStr || dateStr > dataThrough) return

  const catId = mapIncidentNYC(row.ofns_desc, row.pd_desc)
  if (catId === null) {
    const key = (row.ofns_desc || '(null)').toLowerCase().trim()
    dropped.set(key, (dropped.get(key) || 0) + 1)
    return
  }

  const d = Math.floor((Date.parse(`${dateStr}T00:00:00Z`) - DAY0_UTC) / 86400000)

  // Unlike SFPD, NYPD midnight times look genuine (no data-entry spike), so
  // only a missing/unparseable time is treated as unknown.
  let h = HOUR_UNKNOWN
  const t = row.cmplnt_fr_tm
  if (t) {
    const parsed = Number(t.slice(0, 2))
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 23) h = parsed
  }
  if (h === HOUR_UNKNOWN) timeUnknown++

  lat.push(Math.round(la * 1e5) / 1e5)
  lng.push(Math.round(lo * 1e5) / 1e5)
  cat.push(catIndex.get(catId))
  day.push(d)
  hour.push(h)
  desc.push(intern(displayDesc(row.pd_desc || row.ofns_desc || 'Unknown'), descIndex, descs))
  res.push(intern(SEVERITY[row.law_cat_cd] || 'Unknown', resIndex, resolutions))
}

async function fetchAll(endpoint, where, label) {
  let offset = 0
  let fetched = 0
  for (;;) {
    const params = new URLSearchParams({
      $select: SELECT,
      $where: where,
      // :id is the only pagination order that is stable across requests.
      $order: ':id',
      $limit: String(PAGE_SIZE),
      $offset: String(offset),
    })
    const rows = await fetchJSON(`${endpoint}?${params}`)
    fetched += rows.length
    process.stderr.write(`${label}: fetched ${fetched} rows...\n`)
    for (const row of rows) ingest(row)
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
}

// Historic covers through the last full year; YTD covers the current year.
// The windows overlap defensively — cmplnt_num dedup keeps one copy.
await fetchAll(
  HISTORIC,
  `cmplnt_fr_dt >= '${cutoffStr}T00:00:00' AND latitude IS NOT NULL`,
  'historic',
)
await fetchAll(
  YTD,
  `cmplnt_fr_dt >= '${cutoffStr}T00:00:00' AND cmplnt_fr_dt <= '${dataThrough}T23:59:59' AND latitude IS NOT NULL`,
  'ytd',
)

// ---- Guards: fail loudly rather than publish bad data. ----

const DRIFT_THRESHOLD = 2000
const unexpected = [...dropped.entries()].filter(([k]) => !KNOWN_DROPPED.has(k) && !MAPPED_RAW.has(k))
for (const [k, v] of unexpected) {
  const line = `Unrecognized raw category "${k}": ${v} rows (not mapped, not known-dropped)`
  if (v > DRIFT_THRESHOLD) throw new Error(`${line} — refusing to build. Update scripts/categories-nyc.mjs.`)
  console.warn(`WARNING: ${line}`)
}

if (lat.length < 600000) {
  throw new Error(`Suspiciously few incidents (${lat.length}, expected ~1M for 36 months) — aborting.`)
}
const counts = {}
for (const c of cat) {
  const id = DISPLAY_CATEGORIES[c].id
  counts[id] = (counts[id] || 0) + 1
}
for (const core of ['assault', 'theft', 'drugs']) {
  if ((counts[core] || 0) < 10000) {
    throw new Error(`Core category "${core}" has only ${counts[core] || 0} rows — mapping likely broken.`)
  }
}

// ---- Write output: three 12-month chunks, newest first. ----

let minDay = Infinity
let maxDay = -Infinity
for (const d of day) {
  if (d < minDay) minDay = d
  if (d > maxDay) maxDay = d
}

const ranges = [
  [maxDay - 364, maxDay],
  [maxDay - 729, maxDay - 365],
  [minDay, maxDay - 730],
].filter(([a, b]) => a <= b)

await mkdir(new URL('../public-nyc/data/', import.meta.url), { recursive: true })

const files = []
for (let f = 0; f < ranges.length; f++) {
  const [d0, d1] = ranges[f]
  const sub = { n: 0, lat: [], lng: [], cat: [], day: [], hour: [], desc: [], res: [], descs, resolutions }
  for (let i = 0; i < lat.length; i++) {
    if (day[i] < d0 || day[i] > d1) continue
    sub.lat.push(lat[i])
    sub.lng.push(lng[i])
    sub.cat.push(cat[i])
    sub.day.push(day[i])
    sub.hour.push(hour[i])
    sub.desc.push(desc[i])
    sub.res.push(res[i])
    sub.n++
  }
  const name = `incidents-${f}.json`
  await writeFile(new URL(`../public-nyc/data/${name}`, import.meta.url), JSON.stringify(sub))
  files.push({ name, minDay: Math.max(d0, minDay), maxDay: d1, n: sub.n })
  console.log(`${name}: ${sub.n} incidents (day ${d0}–${d1})`)
}

const meta = {
  built: new Date().toISOString(),
  day0: '2018-01-01',
  minDay,
  maxDay,
  total: lat.length,
  timeUnknown,
  hourUnknown: HOUR_UNKNOWN,
  categories: DISPLAY_CATEGORIES,
  presets: {},
  counts,
  files: files.map(({ name, minDay, maxDay }) => ({ name, minDay, maxDay })),
  dataThrough,
}
await writeFile(new URL('../public-nyc/data/meta.json', import.meta.url), JSON.stringify(meta, null, 2))

console.log(`\nWrote ${lat.length} incidents (${cutoffStr} → ${dataThrough}); ${duplicates} duplicate rows skipped`)
console.log(`Date range: day ${minDay}–${maxDay}; ${descs.length} unique descriptions; ${timeUnknown} with unknown time`)
console.log('Category counts:', counts)
const droppedTotal = [...dropped.values()].reduce((a, b) => a + b, 0)
console.log(`Dropped ${droppedTotal} non-safety reports (all raw categories recognized: ${unexpected.length === 0})`)

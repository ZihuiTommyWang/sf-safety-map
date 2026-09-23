// Builds public/data/streets.json: SF street centerline segments colored by how
// many safety incidents snap to them.
//
// Streets: DataSF "Streets – Active and Retired" (3psu-pn9h) — DPW basemap
// centerlines, one feature per block face with CNN id and cross streets.
// Incidents: public/data/incidents.json (run build-data.mjs first) — already
// filtered to place-based harm. SFPD anonymizes incidents to the block or
// intersection, so snapping to centerline segments matches the data's true
// resolution.
//
// Usage: node scripts/build-streets.mjs

import { readFile, writeFile } from 'node:fs/promises'

const ENDPOINT = 'https://data.sf.gov/resource/3psu-pn9h.json'
const PAGE_SIZE = 50000
const SNAP_MAX_M = 60 // max snap distance; block-anonymized points sit on centerlines
const CELL_M = 120 // spatial-hash cell size

const LAT0 = 37.768, LNG0 = -122.435
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const MY = 110540
const toXY = (lng, lat) => [(lng - LNG0) * MX, (lat - LAT0) * MY]

const headers = { Accept: 'application/json', 'User-Agent': 'sf-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' }
if (process.env.SODA_APP_TOKEN) headers['X-App-Token'] = process.env.SODA_APP_TOKEN

// ---- fetch centerlines ----
const segments = []
let offset = 0
for (;;) {
  const params = new URLSearchParams({
    $select: 'cnn,streetname,f_st,t_st,layer,line',
    $where: "active = true AND line IS NOT NULL",
    $order: ':id',
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
  })
  const res = await fetch(`${ENDPOINT}?${params}`, { headers })
  if (!res.ok) throw new Error(`Centerlines request failed: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  for (const row of rows) {
    if (!row.line?.coordinates?.length) continue
    if (row.layer === 'PSEUDO') continue // freeway ramps/joins, not walkable blocks
    segments.push({
      cnn: row.cnn,
      name: row.streetname || 'Unnamed',
      from: row.f_st || '',
      to: row.t_st || '',
      coords: row.line.coordinates,
      xy: row.line.coordinates.map(([lng, lat]) => toXY(lng, lat)),
      count: 0,
    })
  }
  process.stderr.write(`centerlines: ${segments.length}...\n`)
  if (rows.length < PAGE_SIZE) break
  offset += PAGE_SIZE
}
if (segments.length < 10000) throw new Error(`Only ${segments.length} centerline segments — aborting.`)

// ---- spatial hash of sub-segments ----
const grid = new Map()
const cellKey = (cx, cy) => cx * 100000 + cy
for (let si = 0; si < segments.length; si++) {
  const xy = segments[si].xy
  for (let j = 0; j < xy.length - 1; j++) {
    const [x1, y1] = xy[j]
    const [x2, y2] = xy[j + 1]
    const minX = Math.min(x1, x2) - SNAP_MAX_M, maxX = Math.max(x1, x2) + SNAP_MAX_M
    const minY = Math.min(y1, y2) - SNAP_MAX_M, maxY = Math.max(y1, y2) + SNAP_MAX_M
    for (let cx = Math.floor(minX / CELL_M); cx <= Math.floor(maxX / CELL_M); cx++) {
      for (let cy = Math.floor(minY / CELL_M); cy <= Math.floor(maxY / CELL_M); cy++) {
        const key = cellKey(cx, cy)
        let arr = grid.get(key)
        if (!arr) grid.set(key, (arr = []))
        arr.push([si, j])
      }
    }
  }
}

function distSqToSub(px, py, si, j) {
  const xy = segments[si].xy
  const [x1, y1] = xy[j]
  const [x2, y2] = xy[j + 1]
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = x1 + t * dx - px, qy = y1 + t * dy - py
  return qx * qx + qy * qy
}

// ---- snap incidents ----
const inc = JSON.parse(await readFile(new URL('../public/data/incidents.json', import.meta.url), 'utf8'))
let snapped = 0, unsnapped = 0
const maxSq = SNAP_MAX_M * SNAP_MAX_M
for (let i = 0; i < inc.n; i++) {
  const [px, py] = toXY(inc.lng[i], inc.lat[i])
  const candidates = grid.get(cellKey(Math.floor(px / CELL_M), Math.floor(py / CELL_M)))
  if (!candidates) { unsnapped++; continue }
  let best = -1, bestSq = maxSq
  for (const [si, j] of candidates) {
    const d = distSqToSub(px, py, si, j)
    if (d < bestSq) { bestSq = d; best = si }
  }
  if (best >= 0) { segments[best].count++; snapped++ } else unsnapped++
}

// ---- write ----
const withData = segments.filter((s) => s.count > 0)
const fc = {
  type: 'FeatureCollection',
  features: withData.map((s) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: s.coords.map(([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]) },
    properties: { n: s.count, s: s.name, f: s.from, t: s.to },
  })),
}
await writeFile(new URL('../public/data/streets.json', import.meta.url), JSON.stringify(fc))

const counts = withData.map((s) => s.count).sort((a, b) => a - b)
const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))]
console.log(`\n${segments.length} centerline segments; ${withData.length} carry incidents`)
console.log(`Snapped ${snapped}/${inc.n} incidents (${((snapped / inc.n) * 100).toFixed(1)}%); ${unsnapped} beyond ${SNAP_MAX_M}m`)
console.log(`Count quantiles p50=${q(.5)} p80=${q(.8)} p95=${q(.95)} max=${counts[counts.length - 1]}`)
console.log('Hottest blocks:')
for (const s of [...withData].sort((a, b) => b.count - a.count).slice(0, 8)) {
  console.log(`  ${s.count}  ${s.name} (${s.from} → ${s.to})`)
}

// Builds public-nyc/data/addresses.json: a compact index of every official
// NYC address, for complete, offline, instant search autocomplete.
//
// Source: NYC Open Data "Address Point" (uf93-f8nk) — the city's address
// registry (~968k rows). Same format as SF's (see build-addresses.mjs), plus
// per-street `p` arrays encoding Queens-style hyphenated numbers: "89-64" is
// stored as n=8964 with p=2 (digits after the hyphen).
//
// Usage: node scripts/build-addresses-nyc.mjs

import { writeFile, mkdir } from 'node:fs/promises'

const ENDPOINT = 'https://data.cityofnewyork.us/resource/uf93-f8nk.json'
const PAGE_SIZE = 50000
export const X0 = -74.3
export const Y0 = 40.45

const BOROUGH = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' }

const headers = { Accept: 'application/json', 'User-Agent': 'city-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' }
if (process.env.SODA_APP_TOKEN) headers['X-App-Token'] = process.env.SODA_APP_TOKEN

const streets = new Map() // "street|borough" -> { s, n: [], x: [], y: [], d: [], p: [] }
const nhoods = []
const nhoodIdx = new Map()
let total = 0

let offset = 0
for (;;) {
  const params = new URLSearchParams({
    $select: 'house_number,full_street_name,boroughcode,the_geom',
    $order: ':id',
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
  })
  const res = await fetch(`${ENDPOINT}?${params}`, { headers })
  if (!res.ok) throw new Error(`Address Point request failed: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  for (const row of rows) {
    const street = row.full_street_name
    const coords = row.the_geom?.coordinates
    const raw = (row.house_number || '').trim()
    if (!street || !coords || !raw) continue
    const m = raw.match(/^(\d+)(?:-(\d+))?/)
    if (!m) continue
    const num = Number(m[1] + (m[2] || ''))
    const hyphen = m[2] ? m[2].length : 0
    const [lng, latV] = coords
    if (!Number.isFinite(num) || !Number.isFinite(lng) || !Number.isFinite(latV)) continue

    const nh = BOROUGH[row.boroughcode] || ''
    // Street names repeat across boroughs (3 St in Brooklyn vs Manhattan) —
    // key on both so numbers don't interleave.
    const key = `${street}|${nh}`
    let entry = streets.get(key)
    if (!entry) streets.set(key, (entry = { s: street, n: [], x: [], y: [], d: [], p: [] }))
    entry.n.push(num)
    entry.x.push(Math.round((lng - X0) * 1e5))
    entry.y.push(Math.round((latV - Y0) * 1e5))
    entry.p.push(hyphen)
    let di = nhoodIdx.get(nh)
    if (di === undefined) {
      di = nhoods.length
      nhoods.push(nh)
      nhoodIdx.set(nh, di)
    }
    entry.d.push(di)
    total++
  }
  process.stderr.write(`addresses: ${total}...\n`)
  if (rows.length < PAGE_SIZE) break
  offset += PAGE_SIZE
}

if (total < 700000) throw new Error(`Only ${total} addresses (expected ~968k) — aborting.`)

// Sort each street's addresses by number (dedupe exact collisions) so the
// client can binary-search; drop `p` entirely for streets with no hyphens.
const out = []
for (const [, e] of [...streets.entries()].sort((a, b) => a[1].s.localeCompare(b[1].s))) {
  const order = [...e.n.keys()].sort((a, b) => e.n[a] - e.n[b])
  const n = [], x = [], y = [], d = [], p = []
  let prev = -1
  for (const i of order) {
    if (e.n[i] === prev) continue
    prev = e.n[i]
    n.push(e.n[i])
    x.push(e.x[i])
    y.push(e.y[i])
    d.push(e.d[i])
    p.push(e.p[i])
  }
  const entry = { s: e.s, n, x, y, d }
  if (p.some((v) => v > 0)) entry.p = p
  out.push(entry)
}

await mkdir(new URL('../public-nyc/data/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../public-nyc/data/addresses.json', import.meta.url),
  JSON.stringify({ x0: X0, y0: Y0, nh: nhoods, streets: out }),
)
console.log(`Wrote ${total} addresses on ${out.length} streets (${nhoods.length} boroughs)`)

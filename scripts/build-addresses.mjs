// Builds public/data/addresses.json: a compact index of every official SF
// address, for complete, offline, instant search autocomplete.
//
// Source: DataSF "Addresses - Enterprise Addressing System" (3mea-di5p) —
// the city's canonical base-address registry (~224k rows, updated nightly).
//
// Format (grouped by street to keep it small):
//   { nh: [neighborhood names],
//     streets: [{ s: "HARRISON ST", n: [514, ...], x: [...], y: [...], d: [nhIdx] }] }
// x = round((lng + 122.6) * 1e5), y = round((lat - 37.6) * 1e5)
//
// Usage: node scripts/build-addresses.mjs

import { writeFile, mkdir } from 'node:fs/promises'

const ENDPOINT = 'https://data.sf.gov/resource/3mea-di5p.json'
const PAGE_SIZE = 50000
export const X0 = -122.6
export const Y0 = 37.6

const headers = { Accept: 'application/json', 'User-Agent': 'sf-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' }
if (process.env.SODA_APP_TOKEN) headers['X-App-Token'] = process.env.SODA_APP_TOKEN

const streets = new Map() // street_full -> { n: [], x: [], y: [], d: [] }
const nhoods = []
const nhoodIdx = new Map()
let total = 0

let offset = 0
for (;;) {
  const params = new URLSearchParams({
    $select: 'address_number,street_full_street_name,longitude,latitude,nhood',
    $order: ':id',
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
  })
  const res = await fetch(`${ENDPOINT}?${params}`, { headers })
  if (!res.ok) throw new Error(`EAS request failed: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  for (const row of rows) {
    const num = Number(row.address_number)
    const lng = Number(row.longitude)
    const lat = Number(row.latitude)
    const street = row.street_full_street_name
    if (!street || !Number.isFinite(num) || !Number.isFinite(lng) || !Number.isFinite(lat)) continue
    let entry = streets.get(street)
    if (!entry) streets.set(street, (entry = { n: [], x: [], y: [], d: [] }))
    entry.n.push(num)
    entry.x.push(Math.round((lng - X0) * 1e5))
    entry.y.push(Math.round((lat - Y0) * 1e5))
    const nh = row.nhood || ''
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

if (total < 150000) throw new Error(`Only ${total} addresses (expected ~224k) — aborting.`)

// Sort each street's addresses by number (dedupe exact number collisions,
// keeping the first) so the client can binary-search.
const out = []
for (const [s, e] of [...streets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const order = [...e.n.keys()].sort((a, b) => e.n[a] - e.n[b])
  const n = [], x = [], y = [], d = []
  let prev = -1
  for (const i of order) {
    if (e.n[i] === prev) continue
    prev = e.n[i]
    n.push(e.n[i])
    x.push(e.x[i])
    y.push(e.y[i])
    d.push(e.d[i])
  }
  out.push({ s, n, x, y, d })
}

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })
await writeFile(
  new URL('../public/data/addresses.json', import.meta.url),
  JSON.stringify({ x0: X0, y0: Y0, nh: nhoods, streets: out }),
)
console.log(`Wrote ${total} addresses on ${out.length} streets (${nhoods.length} neighborhoods)`)

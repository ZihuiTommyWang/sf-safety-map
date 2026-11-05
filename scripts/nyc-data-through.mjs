// Prints the date the NYPD YTD complaint dataset currently runs through
// (e.g. "2026-06-30"), or "unknown" if the API can't be reached. The deploy
// workflow uses this as a cache key so the expensive NYC build only runs when
// the NYPD actually publishes new data (quarterly).

const YTD = 'https://data.cityofnewyork.us/resource/5uac-w243.json'
const headers = { Accept: 'application/json', 'User-Agent': 'city-safety-map-build (github.com/ZihuiTommyWang/sf-safety-map)' }
if (process.env.SODA_APP_TOKEN) headers['X-App-Token'] = process.env.SODA_APP_TOKEN

const todayISO = new Date().toISOString().slice(0, 10)
const url = `${YTD}?$select=max(cmplnt_fr_dt)&$where=cmplnt_fr_dt <= '${todayISO}T23:59:59'`

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(60000) })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const rows = await res.json()
    const through = rows[0]?.max_cmplnt_fr_dt?.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(through || '')) throw new Error(`bad date: ${through}`)
    console.log(through)
    process.exit(0)
  } catch (err) {
    process.stderr.write(`probe attempt ${attempt}/3 failed: ${err.message || err}\n`)
    await new Promise((r) => setTimeout(r, 5000 * attempt))
  }
}
console.log('unknown')

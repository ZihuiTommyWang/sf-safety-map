import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import Sidebar from './components/Sidebar'
import TimeScrubber from './components/TimeScrubber'
import MethodologyModal from './components/MethodologyModal'
import type { DataBundle, FilterState } from './data'
import { loadData, countFiltered, dayToISO, isoToDay, formatHour } from './data'
import { DEFAULT_PRESET, DOT_ZOOM, CATEGORY_COLORS, FALLBACK_DOT_COLOR } from './config'

interface PickedIncident {
  catId: string
  catLabel: string
  desc: string
  date: string
  hour: string
  resolution: string
  day: number
}

function parseHash(bundle: DataBundle) {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const validIds = new Set(bundle.meta.categories.map((c) => c.id))
  const out: { cats?: Set<string>; day?: [number, number]; hour?: [number, number] } = {}
  const c = params.get('c')
  if (c) {
    const ids = c.split(',').filter((id) => validIds.has(id))
    if (ids.length) out.cats = new Set(ids)
  }
  const from = params.get('from')
  const to = params.get('to')
  if (from && to) {
    const d0 = isoToDay(from)
    const d1 = isoToDay(to)
    if (Number.isFinite(d0) && Number.isFinite(d1) && d0 <= d1) out.day = [d0, d1]
  }
  const h = params.get('h')
  if (h) {
    const [h0, h1] = h.split('-').map(Number)
    if (h0 >= 0 && h1 <= 23 && h0 <= h1) out.hour = [h0, h1]
  }
  return out
}

export default function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [catSel, setCatSel] = useState<Set<string>>(new Set())
  const [dayRange, setDayRange] = useState<[number, number]>([0, 0])
  const [hourRange, setHourRange] = useState<[number, number]>([0, 23])
  const [scrubActive, setScrubActive] = useState(false)
  const [scrubHour, setScrubHour] = useState(20)
  const [scrubPlaying, setScrubPlaying] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 720)
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [picked, setPicked] = useState<PickedIncident[] | null>(null)
  const [zoom, setZoom] = useState(0)

  useEffect(() => {
    loadData()
      .then((b) => {
        const fromHash = parseHash(b)
        setCatSel(fromHash.cats ?? new Set(b.meta.presets[DEFAULT_PRESET].cats))
        setDayRange(fromHash.day ?? [b.meta.minDay, b.meta.maxDay])
        if (fromHash.hour) setHourRange(fromHash.hour)
        setZoom(12.2)
        setBundle(b)
      })
      .catch((e) => setError(String(e)))
  }, [])

  // Shareable URL: keep filters in the hash (debounced).
  const hashTimer = useRef<number>(undefined)
  useEffect(() => {
    if (!bundle) return
    window.clearTimeout(hashTimer.current)
    hashTimer.current = window.setTimeout(() => {
      const params = new URLSearchParams()
      params.set('c', [...catSel].join(','))
      params.set('from', dayToISO(dayRange[0]))
      params.set('to', dayToISO(dayRange[1]))
      params.set('h', `${hourRange[0]}-${hourRange[1]}`)
      history.replaceState(null, '', `#${params}`)
    }, 300)
  }, [bundle, catSel, dayRange, hourRange])

  // Hour animation loop.
  useEffect(() => {
    if (!scrubPlaying) return
    const t = window.setInterval(() => setScrubHour((h) => (h + 1) % 24), 650)
    return () => window.clearInterval(t)
  }, [scrubPlaying])

  const catIdToIndex = useMemo(() => {
    const m = new Map<string, number>()
    bundle?.meta.categories.forEach((c, i) => m.set(c.id, i))
    return m
  }, [bundle])

  const filter: FilterState = useMemo(
    () => ({
      cats: new Set([...catSel].map((id) => catIdToIndex.get(id)!).filter((i) => i !== undefined)),
      dayRange,
      hourRange,
      scrubHour: scrubActive ? scrubHour : -1,
    }),
    [catSel, catIdToIndex, dayRange, hourRange, scrubActive, scrubHour],
  )

  const shownCount = useMemo(
    () => (bundle ? countFiltered(bundle.incidents, filter) : 0),
    [bundle, filter],
  )

  const activePreset = useMemo(() => {
    if (!bundle) return null
    const ids = [...catSel].sort().join(',')
    if (ids === bundle.meta.categories.map((c) => c.id).sort().join(',')) return 'all'
    for (const [key, group] of Object.entries(bundle.meta.presets)) {
      if (ids === [...group.cats].sort().join(',')) return key
    }
    return null
  }, [bundle, catSel])

  const applyPreset = (key: string) => {
    if (!bundle) return
    if (key === 'all') setCatSel(new Set(bundle.meta.categories.map((c) => c.id)))
    else setCatSel(new Set(bundle.meta.presets[key].cats))
  }

  const onPick = (indices: number[]) => {
    if (!bundle) return
    const { incidents, meta } = bundle
    const seen = new Set<number>()
    const items: PickedIncident[] = []
    for (const i of indices) {
      if (seen.has(i)) continue
      seen.add(i)
      const cat = meta.categories[incidents.cat[i]]
      items.push({
        catId: cat.id,
        catLabel: cat.label,
        desc: incidents.descs[incidents.desc[i]],
        date: dayToISO(incidents.day[i]),
        hour: formatHour(incidents.hour[i]),
        resolution: incidents.resolutions[incidents.res[i]],
        day: incidents.day[i],
      })
    }
    items.sort((a, b) => b.day - a.day)
    setPicked(items)
  }

  if (error) {
    return (
      <div className="loading-screen">
        <p>Failed to load incident data.</p>
        <p className="error-detail">{error}</p>
      </div>
    )
  }
  if (!bundle) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading {`88,000+`} SF incidents…</p>
      </div>
    )
  }

  return (
    <div className="app">
      <MapView bundle={bundle} filter={filter} onPick={onPick} onZoom={setZoom} />

      <Sidebar
        meta={bundle.meta}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        catSel={catSel}
        setCatSel={setCatSel}
        activePreset={activePreset}
        applyPreset={applyPreset}
        dayRange={dayRange}
        setDayRange={setDayRange}
        hourRange={hourRange}
        setHourRange={setHourRange}
        shownCount={shownCount}
        onMethodology={() => setMethodologyOpen(true)}
      />

      <div className="legend">
        <span>Calmer</span>
        <div className="legend-bar" />
        <span>More incidents</span>
      </div>

      {zoom < DOT_ZOOM && (
        <div className="zoom-hint">Zoom in to see individual incidents — click any dot for details</div>
      )}

      <TimeScrubber
        active={scrubActive}
        hour={scrubHour}
        playing={scrubPlaying}
        setActive={setScrubActive}
        setHour={setScrubHour}
        setPlaying={setScrubPlaying}
      />

      {picked && (
        <div className="incident-card">
          <div className="incident-card-header">
            <strong>
              {picked.length} incident{picked.length === 1 ? '' : 's'} here
            </strong>
            <button className="close-btn" onClick={() => setPicked(null)} aria-label="Close">✕</button>
          </div>
          <ul>
            {picked.slice(0, 50).map((it, i) => (
              <li key={i}>
                <span
                  className="cat-dot"
                  style={{ background: CATEGORY_COLORS[it.catId] ?? FALLBACK_DOT_COLOR }}
                />
                <div>
                  <div className="incident-desc">{it.desc}</div>
                  <div className="incident-meta">
                    {it.catLabel} · {it.date} · {it.hour} · {it.resolution}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {picked.length > 50 && <div className="incident-more">…and {picked.length - 50} more</div>}
        </div>
      )}

      {methodologyOpen && (
        <MethodologyModal
          built={bundle.meta.built}
          total={bundle.meta.total}
          onClose={() => setMethodologyOpen(false)}
        />
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import { Dock, FilterSheet, TimeSheet, SearchSheet } from './components/GlassUI'
import type { SheetKind, SearchTarget } from './components/GlassUI'
import MethodologyModal from './components/MethodologyModal'
import type { DataBundle, FilterState } from './data'
import { loadData, countFiltered, applyTiers, spotStats, dayToISO, isoToDay, formatHour } from './data'
import { CATEGORY_COLORS, FALLBACK_DOT_COLOR } from './config'

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
  const out: { cats?: Set<string>; day?: [number, number] } = {}
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
  return out
}

export default function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [catSel, setCatSel] = useState<Set<string>>(new Set())
  const [dayRange, setDayRange] = useState<[number, number]>([0, 0])
  const [sheet, setSheet] = useState<SheetKind>('none')
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [spotOpen, setSpotOpen] = useState(false)
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [picked, setPicked] = useState<PickedIncident[] | null>(null)
  const [hasPicked, setHasPicked] = useState(false)
  const [tierVersion, setTierVersion] = useState(0)

  useEffect(() => {
    loadData()
      .then((b) => {
        const fromHash = parseHash(b)
        const cats = fromHash.cats ?? new Set(b.meta.categories.map((c) => c.id))
        const days = fromHash.day ?? ([b.meta.minDay, b.meta.maxDay] as [number, number])
        const catIdx = new Set(
          [...cats].map((id) => b.meta.categories.findIndex((c) => c.id === id)).filter((i) => i >= 0),
        )
        applyTiers(b, catIdx, days)
        setCatSel(cats)
        setDayRange(days)
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
      history.replaceState(null, '', `#${params}`)
    }, 300)
  }, [bundle, catSel, dayRange])

  // Exposure tiers follow the category/date filters (debounced).
  const tierTimer = useRef<number>(undefined)
  const skipFirstTiers = useRef(true)
  useEffect(() => {
    if (!bundle) return
    if (skipFirstTiers.current) {
      // loadData already applied tiers for the initial state.
      skipFirstTiers.current = false
      return
    }
    window.clearTimeout(tierTimer.current)
    tierTimer.current = window.setTimeout(() => {
      const catIdx = new Set(
        [...catSel].map((id) => bundle.meta.categories.findIndex((c) => c.id === id)).filter((i) => i >= 0),
      )
      applyTiers(bundle, catIdx, dayRange)
      setTierVersion((v) => v + 1)
    }, 250)
  }, [bundle, catSel, dayRange])

  const catIdToIndex = useMemo(() => {
    const m = new Map<string, number>()
    bundle?.meta.categories.forEach((c, i) => m.set(c.id, i))
    return m
  }, [bundle])

  const filter: FilterState = useMemo(
    () => ({
      cats: new Set([...catSel].map((id) => catIdToIndex.get(id)!).filter((i) => i !== undefined)),
      dayRange,
    }),
    [catSel, catIdToIndex, dayRange],
  )

  const shownCount = useMemo(
    () => (bundle ? countFiltered(bundle.incidents, filter) : 0),
    [bundle, filter],
  )

  const timeLabel = useMemo(() => {
    if (!bundle) return 'Year'
    const { minDay, maxDay } = bundle.meta
    if (dayRange[1] === maxDay) {
      if (dayRange[0] <= minDay) return 'Year'
      if (dayRange[0] === maxDay - 29) return '30 days'
      if (dayRange[0] === maxDay - 182) return '6 months'
    }
    const fmt = (d: number) =>
      new Date(Date.UTC(2018, 0, 1) + d * 86400000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    return `${fmt(dayRange[0])} – ${fmt(dayRange[1])}`
  }, [bundle, dayRange])

  const openSpot = (target: SearchTarget) => {
    setPicked(null)
    setSearchTarget(target)
    setSpotOpen(true)
    setHasPicked(true)
  }

  // Live stats for the open spot; re-derives when filters change.
  const spot = useMemo(
    () => (bundle && searchTarget ? spotStats(bundle, filter, searchTarget.lng, searchTarget.lat) : null),
    [bundle, filter, searchTarget],
  )

  const spotRecent = useMemo(() => {
    if (!bundle || !spot) return []
    const { incidents, meta } = bundle
    const relDay = (d: number) => {
      const n = meta.maxDay - d
      return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 60 ? `${n} days ago` : dayToISO(d)
    }
    const longDay = (d: number) =>
      new Date(Date.UTC(2018, 0, 1) + d * 86400000).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      })
    return spot.recent.map(({ i, dist }) => {
      const cat = meta.categories[incidents.cat[i]]
      const resRaw = incidents.resolutions[incidents.res[i]]
      return {
        catId: cat.id,
        catLabel: cat.label,
        desc: incidents.descs[incidents.desc[i]],
        rel: relDay(incidents.day[i]),
        longDate: longDay(incidents.day[i]),
        hour: incidents.hour[i] >= 24 ? 'not recorded' : formatHour(incidents.hour[i]),
        outcome: resRaw.includes('Open') ? 'Unresolved (open or active)' : resRaw,
        dist,
      }
    })
  }, [bundle, spot])

  const [expandedIncident, setExpandedIncident] = useState(-1)
  useEffect(() => setExpandedIncident(-1), [searchTarget])

  const onPick = (indices: number[]) => {
    setSpotOpen(false)
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
    setHasPicked(true)
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
      <MapView
        bundle={bundle}
        filter={filter}
        tierVersion={tierVersion}
        searchTarget={searchTarget}
        onPick={onPick}
      />

      <div className="count-capsule">
        <b>{shownCount.toLocaleString()}</b> incidents
        {timeLabel !== 'Year' && <span className="capsule-dim"> · {timeLabel === '30 days' || timeLabel === '6 months' ? `last ${timeLabel}` : timeLabel}</span>}
      </div>

      {!hasPicked && (
        <div className="zoom-hint">Every glow is a real incident — tap one to read it</div>
      )}

      <div className="legend">
        <span>Quiet</span>
        <div className="legend-bar" />
        <span>Intense</span>
      </div>

      {sheet === 'filters' && (
        <FilterSheet
          meta={bundle.meta}
          catSel={catSel}
          setCatSel={setCatSel}
          onMethodology={() => setMethodologyOpen(true)}
        />
      )}
      {sheet === 'time' && (
        <TimeSheet meta={bundle.meta} dayRange={dayRange} setDayRange={setDayRange} />
      )}
      {sheet === 'search' && (
        <SearchSheet onResult={openSpot} onClose={() => setSheet('none')} />
      )}

      <Dock
        selectedCount={catSel.size}
        totalCount={bundle.meta.categories.length}
        timeLabel={timeLabel}
        sheet={sheet}
        setSheet={setSheet}
      />

      {spotOpen && searchTarget && spot && (
        <div className="incident-card spot-card">
          <div className="incident-card-header">
            <strong>
              {searchTarget.label.split(',').slice(0, 2).join(', ')}
              <span className="card-sub">
                within 300 m · {timeLabel === 'Year' ? 'last 12 months' : timeLabel.toLowerCase()}
              </span>
            </strong>
            <button
              className="close-btn"
              onClick={() => {
                setSpotOpen(false)
                setSearchTarget(null)
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="cmp">
            <div className="cmp-row">
              <span className="cmp-name">This spot</span>
              <div className="cmp-track">
                <i
                  className={spot.mult < 1 ? 'good' : spot.mult < 2.5 ? 'mid' : 'bad'}
                  style={{ width: `${Math.round((100 * spot.count) / Math.max(spot.count, spot.typical, 1))}%` }}
                />
              </div>
              <span className="cmp-val">{spot.count.toLocaleString()}</span>
            </div>
            <div className="cmp-row">
              <span className="cmp-name">Typical SF</span>
              <div className="cmp-track">
                <i
                  className="base"
                  style={{ width: `${Math.round((100 * spot.typical) / Math.max(spot.count, spot.typical, 1))}%` }}
                />
              </div>
              <span className="cmp-val dim">{spot.typical.toLocaleString()}</span>
            </div>
          </div>
          <ul>
            {spotRecent.map((it, i) => (
              <li
                key={i}
                className={expandedIncident === i ? 'open' : ''}
                onClick={() => setExpandedIncident(expandedIncident === i ? -1 : i)}
              >
                <div className="li-head">
                  <span
                    className="cat-dot"
                    style={{ background: CATEGORY_COLORS[it.catId] ?? FALLBACK_DOT_COLOR }}
                  />
                  <span className="incident-desc">{it.desc}</span>
                  <span className="li-caret">▶</span>
                </div>
                {expandedIncident === i && (
                  <div className="li-detail">
                    <span>Category</span>
                    <b>{it.catLabel}</b>
                    <span>Date</span>
                    <b>{it.longDate} ({it.rel})</b>
                    <span>Time</span>
                    <b>{it.hour}</b>
                    <span>Outcome</span>
                    <b>{it.outcome}</b>
                    <span>Distance</span>
                    <b>{it.dist} m from this spot</b>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {spot.count > spotRecent.length && (
            <div className="incident-more">…and {(spot.count - spotRecent.length).toLocaleString()} more in this radius</div>
          )}
        </div>
      )}

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

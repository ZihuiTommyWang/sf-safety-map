import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import { Sheet } from './components/GlassUI'
import type { SearchTarget } from './components/GlassUI'
import MethodologyModal from './components/MethodologyModal'
import type { DataBundle, FilterState } from './data'
import { loadData, ensureCoverage, countFiltered, applyTiers, spotStats, dayToISO, isoToDay, formatHour } from './data'
import { CATEGORY_COLORS, FALLBACK_DOT_COLOR } from './config'
import { CITY } from './city'

interface PickedIncident {
  catId: string
  catLabel: string
  desc: string
  rel: string
  longDate: string
  hour: string
  outcome: string
  day: number
}

// Relative to the actual calendar today (not the data's last day), so a city
// whose source publishes on a lag never claims a months-old report is "Today".
const TODAY_DAY = Math.floor((Date.now() - Date.UTC(2018, 0, 1)) / 86400000)

function relDayLabel(_maxDay: number, d: number): string {
  const n = TODAY_DAY - d
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 60 ? `${n} days ago` : dayToISO(d)
}

function longDayLabel(d: number): string {
  return new Date(Date.UTC(2018, 0, 1) + d * 86400000).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
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
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [spotOpen, setSpotOpen] = useState(false)
  const [methodologyOpen, setMethodologyOpen] = useState(false)
  const [picked, setPicked] = useState<PickedIncident[] | null>(null)
  const [tierVersion, setTierVersion] = useState(0)
  const [contentVersion, setContentVersion] = useState(0)
  /** Bumped when older incident chunks finish loading (counts/spots re-derive). */
  const [dataVersion, setDataVersion] = useState(0)

  useEffect(() => {
    loadData()
      .then((b) => {
        const fromHash = parseHash(b)
        const cats = fromHash.cats ?? new Set(b.meta.categories.map((c) => c.id))
        // Default view: the last year (the data itself reaches back 3 years).
        const days =
          fromHash.day ?? ([Math.max(b.meta.minDay, b.meta.maxDay - 364), b.meta.maxDay] as [number, number])
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

  // Widening the time window may need older incident chunks (large cities
  // split their data; the initial load covers only the default view).
  useEffect(() => {
    if (!bundle || dayRange[0] >= bundle.loadedMinDay) return
    ensureCoverage(bundle, dayRange[0]).then((changed) => {
      if (!changed) return
      const catIdx = new Set(
        [...catSel].map((id) => bundle.meta.categories.findIndex((c) => c.id === id)).filter((i) => i >= 0),
      )
      applyTiers(bundle, catIdx, dayRange)
      setTierVersion((v) => v + 1)
      setDataVersion((v) => v + 1)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, dayRange])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle, filter, dataVersion],
  )

  const timeLabel = useMemo(() => {
    if (!bundle) return '1 year'
    const { minDay, maxDay } = bundle.meta
    if (dayRange[1] === maxDay) {
      if (dayRange[0] <= minDay) return '3 years'
      if (dayRange[0] === maxDay - 364) return '1 year'
      if (dayRange[0] === maxDay - 29) return '30 days'
      if (dayRange[0] === maxDay - 182) return '6 months'
    }
    return 'custom'
  }, [bundle, dayRange])

  // A history entry backs the open card, so the phone back gesture (and Esc)
  // closes it instead of leaving the site.
  const cardPushed = useRef(false)
  const clearContent = () => {
    cardPushed.current = false
    setSpotOpen(false)
    setSearchTarget(null)
    setPicked(null)
  }
  useEffect(() => {
    const onPop = () => clearContent()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const pushCardEntry = () => {
    if (!cardPushed.current) {
      history.pushState({ card: true }, '')
      cardPushed.current = true
    }
  }

  const openSpot = (target: SearchTarget) => {
    setPicked(null)
    setSearchTarget(target)
    setSpotOpen(true)
    setContentVersion((v) => v + 1)
    pushCardEntry()
  }

  const closeContent = () => {
    if (cardPushed.current) history.back()
    else clearContent()
  }

  const [dismissVersion, setDismissVersion] = useState(0)
  const onMapDismiss = () => {
    closeContent()
    setDismissVersion((v) => v + 1)
  }

  const onAreaPick = (lng: number, lat: number) => {
    openSpot({ lng, lat, label: 'This area', id: Date.now() })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMapDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live stats for the open spot; re-derives when filters change.
  const spot = useMemo(
    () => (bundle && searchTarget ? spotStats(bundle, filter, searchTarget.lng, searchTarget.lat) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle, filter, searchTarget, dataVersion],
  )

  const spotRecent = useMemo(() => {
    if (!bundle || !spot) return []
    const { incidents, meta } = bundle
    return spot.recent.map(({ i, dist }) => {
      const cat = meta.categories[incidents.cat[i]]
      const resRaw = incidents.resolutions[incidents.res[i]]
      return {
        catId: cat.id,
        catLabel: cat.label,
        desc: incidents.descs[incidents.desc[i]],
        rel: relDayLabel(meta.maxDay, incidents.day[i]),
        longDate: longDayLabel(incidents.day[i]),
        hour: incidents.hour[i] >= 24 ? 'Not recorded' : formatHour(incidents.hour[i]),
        outcome: resRaw.includes('Open') ? 'Unresolved (open or active)' : resRaw,
        dist,
      }
    })
  }, [bundle, spot])

  const [expandedIncident, setExpandedIncident] = useState(-1)
  useEffect(() => setExpandedIncident(-1), [searchTarget, picked])

  const onPick = (indices: number[]) => {
    setSpotOpen(false)
    setSearchTarget(null)
    if (!bundle) return
    const { incidents, meta } = bundle
    const seen = new Set<number>()
    const items: PickedIncident[] = []
    for (const i of indices) {
      if (seen.has(i)) continue
      seen.add(i)
      const cat = meta.categories[incidents.cat[i]]
      const resRaw = incidents.resolutions[incidents.res[i]]
      items.push({
        catId: cat.id,
        catLabel: cat.label,
        desc: incidents.descs[incidents.desc[i]],
        rel: relDayLabel(meta.maxDay, incidents.day[i]),
        longDate: longDayLabel(incidents.day[i]),
        hour: incidents.hour[i] >= 24 ? 'Not recorded' : formatHour(incidents.hour[i]),
        outcome: resRaw.includes('Open') ? 'Unresolved (open or active)' : resRaw,
        day: incidents.day[i],
      })
    }
    items.sort((a, b) => b.day - a.day)
    setPicked(items)
    setContentVersion((v) => v + 1)
    pushCardEntry()
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
        <p>{CITY.loadingLabel}</p>
      </div>
    )
  }

  const sheetContent =
    spotOpen && searchTarget && spot ? (
      <div className="sheet-card">
        <div className="sheet-card-header">
          <strong>
            {searchTarget.label.split(',').slice(0, 2).join(', ')}
            <span className="card-sub">
              Within 300 m · {timeLabel === 'custom' ? 'Custom dates' : `Last ${timeLabel}`}
            </span>
          </strong>
          <button className="close-btn" onClick={closeContent} aria-label="Close">
            ×
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
            <span className="cmp-name">{CITY.typicalLabel}</span>
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
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[it.catId] ?? FALLBACK_DOT_COLOR }} />
                <span className="incident-desc">{it.catLabel}</span>
                <span className="li-date">{it.rel}</span>
                <span className="li-caret">▶</span>
              </div>
              {expandedIncident === i && (
                <div className="li-detail">
                  <span>Details</span>
                  <b>{it.desc}</b>
                  <span>Date</span>
                  <b>{it.longDate}</b>
                  <span>Time</span>
                  <b>{it.hour}</b>
                  <span>{CITY.outcomeLabel}</span>
                  <b>{it.outcome}</b>
                  <span>Distance</span>
                  <b>{it.dist} m from this spot</b>
                </div>
              )}
            </li>
          ))}
        </ul>
        {spot.count > spotRecent.length && (
          <div className="incident-more">+ {(spot.count - spotRecent.length).toLocaleString()} more in this radius</div>
        )}
      </div>
    ) : picked ? (
      <div className="sheet-card">
        <div className="sheet-card-header">
          <strong>
            {picked.length} incident{picked.length === 1 ? '' : 's'} here
          </strong>
          <button className="close-btn" onClick={closeContent} aria-label="Close">
            ×
          </button>
        </div>
        <ul>
          {picked.slice(0, 5).map((it, i) => (
            <li
              key={i}
              className={expandedIncident === i ? 'open' : ''}
              onClick={() => setExpandedIncident(expandedIncident === i ? -1 : i)}
            >
              <div className="li-head">
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[it.catId] ?? FALLBACK_DOT_COLOR }} />
                <span className="incident-desc">{it.catLabel}</span>
                <span className="li-date">{it.rel}</span>
                <span className="li-caret">▶</span>
              </div>
              {expandedIncident === i && (
                <div className="li-detail">
                  <span>Details</span>
                  <b>{it.desc}</b>
                  <span>Date</span>
                  <b>{it.longDate}</b>
                  <span>Time</span>
                  <b>{it.hour}</b>
                  <span>{CITY.outcomeLabel}</span>
                  <b>{it.outcome}</b>
                </div>
              )}
            </li>
          ))}
        </ul>
        {picked.length > 5 && <div className="incident-more">+ {picked.length - 5} more</div>}
      </div>
    ) : null

  return (
    <div className="app">
      <MapView
        bundle={bundle}
        filter={filter}
        tierVersion={tierVersion}
        searchTarget={searchTarget}
        onPick={onPick}
        onAreaPick={onAreaPick}
        onDismiss={onMapDismiss}
      />

      <div className="topbar">
        <span className="wordmark">{CITY.title}</span>
        <button className="count-chip" onClick={() => setMethodologyOpen(true)}>
          <b>{shownCount.toLocaleString()}</b> Incidents
          <span className="count-chip-info">ⓘ</span>
        </button>
      </div>

      <Sheet
        meta={bundle.meta}
        catSel={catSel}
        setCatSel={setCatSel}
        dayRange={dayRange}
        setDayRange={setDayRange}
        timeBadge={
          timeLabel === 'custom'
            ? 'Custom'
            : timeLabel.replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
        }
        onResult={openSpot}
        contentVersion={contentVersion}
        dismissVersion={dismissVersion}
      >
        {sheetContent}
      </Sheet>

      <MethodologyModal
        open={methodologyOpen}
        onClose={() => setMethodologyOpen(false)}
        dataThrough={bundle.meta.dataThrough}
      />
    </div>
  )
}

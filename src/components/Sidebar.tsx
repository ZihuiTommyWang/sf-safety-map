import type { Meta } from '../data'
import { dayToISO, isoToDay, formatHour } from '../data'
import { CATEGORY_COLORS, FALLBACK_DOT_COLOR } from '../config'

interface Props {
  meta: Meta
  open: boolean
  onToggle: () => void
  catSel: Set<string>
  setCatSel: (s: Set<string>) => void
  activePreset: string | null
  applyPreset: (key: string) => void
  dayRange: [number, number]
  setDayRange: (r: [number, number]) => void
  hourRange: [number, number]
  setHourRange: (r: [number, number]) => void
  shownCount: number
  onMethodology: () => void
}

export default function Sidebar(p: Props) {
  const { meta } = p

  const toggleCat = (id: string) => {
    const next = new Set(p.catSel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    p.setCatSel(next)
  }

  return (
    <>
      <aside className={`sidebar ${p.open ? 'open' : ''}`}>
        <header className="sidebar-header">
          <h1>SF Safety Map</h1>
          <p className="tagline">Real SFPD incident reports — free, open source, no ads.</p>
        </header>

        <div className="count-box">
          <span className="count">{p.shownCount.toLocaleString()}</span> incidents shown
        </div>

        <section>
          <h2>Presets</h2>
          <div className="preset-chips">
            {Object.entries(meta.presets).map(([key, group]) => (
              <button
                key={key}
                className={`chip ${p.activePreset === key ? 'active' : ''}`}
                onClick={() => p.applyPreset(key)}
              >
                {group.label}
              </button>
            ))}
            <button
              className={`chip ${p.activePreset === 'all' ? 'active' : ''}`}
              onClick={() => p.applyPreset('all')}
            >
              All
            </button>
          </div>
        </section>

        <section>
          <h2>Categories</h2>
          <div className="cat-list">
            {meta.categories.map((c) => (
              <label key={c.id} className="cat-row">
                <input
                  type="checkbox"
                  checked={p.catSel.has(c.id)}
                  onChange={() => toggleCat(c.id)}
                />
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[c.id] ?? FALLBACK_DOT_COLOR }} />
                <span className="cat-label">{c.label}</span>
                <span className="cat-count">{(meta.counts[c.id] ?? 0).toLocaleString()}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2>Date range</h2>
          <div className="date-row">
            <input
              type="date"
              value={dayToISO(p.dayRange[0])}
              min={dayToISO(meta.minDay)}
              max={dayToISO(p.dayRange[1])}
              onChange={(e) => e.target.value && p.setDayRange([isoToDay(e.target.value), p.dayRange[1]])}
            />
            <span>→</span>
            <input
              type="date"
              value={dayToISO(p.dayRange[1])}
              min={dayToISO(p.dayRange[0])}
              max={dayToISO(meta.maxDay)}
              onChange={(e) => e.target.value && p.setDayRange([p.dayRange[0], isoToDay(e.target.value)])}
            />
          </div>
        </section>

        <section>
          <h2>
            Time of day{' '}
            <span className="hour-label">
              {formatHour(p.hourRange[0])} – {formatHour(p.hourRange[1])}
            </span>
          </h2>
          <div className="hour-sliders">
            <input
              type="range"
              min={0}
              max={23}
              value={p.hourRange[0]}
              onChange={(e) => {
                const v = Number(e.target.value)
                p.setHourRange([v, Math.max(v, p.hourRange[1])])
              }}
            />
            <input
              type="range"
              min={0}
              max={23}
              value={p.hourRange[1]}
              onChange={(e) => {
                const v = Number(e.target.value)
                p.setHourRange([Math.min(v, p.hourRange[0]), v])
              }}
            />
          </div>
        </section>

        <footer className="sidebar-footer">
          <button className="link-btn" onClick={p.onMethodology}>Methodology & data</button>
          <a href="https://github.com/ZihuiTommyWang/sf-safety-map" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span className="built">Updated {meta.built.slice(0, 10)}</span>
        </footer>
      </aside>
      <button className="sidebar-toggle" onClick={p.onToggle} aria-label="Toggle filters">
        {p.open ? '‹' : '☰'}
      </button>
    </>
  )
}

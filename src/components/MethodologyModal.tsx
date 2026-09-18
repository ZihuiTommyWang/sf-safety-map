interface Props {
  built: string
  total: number
  onClose: () => void
}

export default function MethodologyModal({ built, total, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Methodology & data</h2>
        <p>
          Every point on this map is a real incident report from the San Francisco Police
          Department, via{' '}
          <a href="https://data.sf.gov/d/wg3w-h783" target="_blank" rel="noreferrer">
            DataSF's public incident dataset
          </a>
          . The map currently shows the last 12 months ({total.toLocaleString()} incidents with
          usable coordinates) and refreshes nightly. Last update: {built.slice(0, 10)}.
        </p>
        <h3>How the heatmap works</h3>
        <p>
          The green→red surface is a density estimate of the incidents matching your filters —
          more nearby incidents means hotter colors. Zoom in and it dissolves into the individual
          incidents themselves; click any dot to read what was actually reported there.
        </p>
        <h3>Honest caveats</h3>
        <ul>
          <li>
            <strong>Reports ≠ risk.</strong> This is where incidents were <em>reported</em>, which
            also reflects police presence, foot traffic, and reporting habits — not just danger.
          </li>
          <li>
            <strong>Smoothing bleeds.</strong> Heat radiates a block or two beyond where incidents
            actually occurred. Zoom in for the truth.
          </li>
          <li>
            <strong>Locations are approximate.</strong> SFPD anonymizes incident locations to the
            block or intersection level.
          </li>
          <li>
            <strong>Some times are unknown.</strong> Several thousand reports have no recorded
            time (SFPD logs them as exact midnight). They appear on the map, but are excluded
            whenever you filter or animate by time of day rather than skewing the midnight hour.
          </li>
          <li>
            <strong>Categories are simplified.</strong> SFPD's ~50 categories are grouped into ~19
            for readability; the mapping is{' '}
            <a
              href="https://github.com/ZihuiTommyWang/sf-safety-map/blob/main/scripts/categories.mjs"
              target="_blank"
              rel="noreferrer"
            >
              open source
            </a>
            .
          </li>
        </ul>
        <p className="modal-footnote">
          Free and open source. No ads, no tracking, no accounts. Basemap © CARTO, © OpenStreetMap
          contributors.
        </p>
      </div>
    </div>
  )
}

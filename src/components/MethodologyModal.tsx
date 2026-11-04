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
        <h2>About this map</h2>
        <p>
          Real SFPD incident reports from the last 12 months ({total.toLocaleString()}), via{' '}
          <a href="https://data.sf.gov/d/wg3w-h783" target="_blank" rel="noreferrer">
            DataSF
          </a>
          , refreshed nightly. Brighter means more incidents nearby.
        </p>
        <p className="modal-footnote">
          Updated {built.slice(0, 10)} · free &{' '}
          <a href="https://github.com/ZihuiTommyWang/sf-safety-map" target="_blank" rel="noreferrer">
            open source
          </a>{' '}
          · no ads or tracking · basemap © CARTO, © OpenStreetMap
        </p>
      </div>
    </div>
  )
}

interface Props {
  total: number
  onClose: () => void
}

export default function MethodologyModal({ total, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>About this map</h2>
        <p>
          Real SFPD incident reports from the last 3 years ({total.toLocaleString()}), via{' '}
          <a href="https://data.sf.gov/d/wg3w-h783" target="_blank" rel="noreferrer">
            DataSF
          </a>
          , refreshed nightly. Brighter means more incidents nearby.
        </p>
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

// Always mounted (hidden with CSS when closed) so crawlers index the text.
export default function MethodologyModal({ open, onClose }: Props) {
  return (
    <div className={open ? 'modal-backdrop' : 'modal-backdrop modal-hidden'} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>About this map</h2>
        <p>
          A crime map of San Francisco. Real SFPD incident reports via{' '}
          <a href="https://data.sf.gov/d/wg3w-h783" target="_blank" rel="noreferrer">
            DataSF
          </a>
          , refreshed nightly. Brighter means more incidents nearby.
        </p>
        <p>
          Crimes are grouped into 13 categories, like assault, robbery, theft, car break-ins,
          vehicle theft, and burglary.
        </p>
        <p>
          Locations are anonymized by SFPD to the block level, so a dot marks a block, not an
          exact address. More reports don't always mean more danger. Busy areas simply report more.
        </p>
        <p>Free, open source, no ads, no tracking.</p>
        <p className="modal-footnote">
          Basemap © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a> ·
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        </p>
      </div>
    </div>
  )
}

import { CITY } from '../city'

interface Props {
  open: boolean
  onClose: () => void
  /** For sources that publish on a lag (NYPD): the date the data runs through. */
  dataThrough?: string
}

// Always mounted (hidden with CSS when closed) so crawlers index the text.
export default function MethodologyModal({ open, onClose, dataThrough }: Props) {
  const nyc = CITY.id === 'nyc'
  const through = dataThrough
    ? new Date(`${dataThrough}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      })
    : null
  return (
    <div className={open ? 'modal-backdrop' : 'modal-backdrop modal-hidden'} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>About this map</h2>
        {nyc ? (
          <p>
            A crime map of New York City. Real NYPD incident reports via{' '}
            <a href={CITY.attribution.url} target="_blank" rel="noreferrer">
              NYC Open Data
            </a>
            . The NYPD publishes this data quarterly{through ? `, currently through ${through}` : ''}.
            Brighter means more incidents nearby.
          </p>
        ) : (
          <p>
            A crime map of San Francisco. Real SFPD incident reports via{' '}
            <a href={CITY.attribution.url} target="_blank" rel="noreferrer">
              DataSF
            </a>
            , refreshed nightly. Brighter means more incidents nearby.
          </p>
        )}
        <p>
          Crimes are grouped into 13 categories, like assault, robbery, theft, car break-ins,
          vehicle theft, and burglary.
        </p>
        <p>
          Locations are anonymized by {nyc ? 'the NYPD' : 'SFPD'} to the block level, so a dot
          marks a block, not an exact address. More reports don't always mean more danger. Busy
          areas simply report more.
        </p>
        <p>Free, open source, no ads, no tracking.</p>
        <p>
          Also available:{' '}
          {nyc ? (
            <a href="https://citysafetymap.com/sf/">San Francisco Safety Map</a>
          ) : (
            <a href="https://citysafetymap.com/nyc/">New York Safety Map</a>
          )}{' '}
          · <a href="https://citysafetymap.com/">all cities</a>
        </p>
        <p className="modal-footnote">
          Basemap © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a> ·
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        </p>
      </div>
    </div>
  )
}

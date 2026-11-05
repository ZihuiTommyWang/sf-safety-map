// Per-city configuration. The active city is baked in at build time via
// VITE_CITY (default 'sf'); one codebase builds citysafetymap.com/sf and /nyc.

export interface CityConfig {
  id: 'sf' | 'nyc'
  /** Full city name ("San Francisco"). */
  name: string
  /** Short form used in UI copy ("SF"). */
  short: string
  /** Topbar wordmark / document title. */
  title: string
  center: [number, number]
  initialZoom: number
  minZoom: number
  maxBounds: [[number, number], [number, number]]
  fitBounds: [[number, number], [number, number]]
  /** Origin for the exposure hex grid (lat, lng — roughly city centroid). */
  hexOrigin: [number, number]
  /** Land area, for the "Typical <city>" density baseline. */
  landM2: number
  /** Bounding box for search (local index sanity + Photon biasing). */
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number }
  /** lat, lon bias for Photon POI search. */
  photonCenter: [number, number]
  searchPlaceholder: string
  typicalLabel: string
  loadingLabel: string
  feedbackSubject: string
  /** Label for the per-incident disposition row (SFPD has resolutions; NYPD only severity). */
  outcomeLabel: string
  attribution: { label: string; url: string }
}

const cities: Record<string, CityConfig> = {
  sf: {
    id: 'sf',
    name: 'San Francisco',
    short: 'SF',
    title: 'San Francisco Safety Map',
    center: [-122.4327, 37.7689],
    initialZoom: 12.2,
    minZoom: 10.5,
    maxBounds: [
      [-122.585, 37.665],
      [-122.28, 37.865],
    ],
    fitBounds: [
      [-122.525, 37.703],
      [-122.355, 37.837],
    ],
    hexOrigin: [37.768, -122.435],
    landM2: 121e6,
    bbox: { minLng: -122.55, maxLng: -122.33, minLat: 37.68, maxLat: 37.84 },
    photonCenter: [37.7749, -122.4194],
    searchPlaceholder: 'Search any SF address or place…',
    typicalLabel: 'Typical SF',
    loadingLabel: 'Loading SF incidents…',
    feedbackSubject: 'SF Safety Map feedback',
    outcomeLabel: 'Outcome',
    attribution: { label: 'DataSF', url: 'https://data.sf.gov/d/wg3w-h783' },
  },
  nyc: {
    id: 'nyc',
    name: 'New York City',
    short: 'NYC',
    title: 'New York Safety Map',
    center: [-73.94, 40.72],
    initialZoom: 10.4,
    minZoom: 9.2,
    maxBounds: [
      [-74.32, 40.45],
      [-73.62, 40.96],
    ],
    fitBounds: [
      [-74.05, 40.565],
      [-73.74, 40.9],
    ],
    hexOrigin: [40.73, -73.94],
    landM2: 778e6,
    bbox: { minLng: -74.27, maxLng: -73.68, minLat: 40.49, maxLat: 40.92 },
    photonCenter: [40.7128, -74.006],
    searchPlaceholder: 'Search any NYC address or place…',
    typicalLabel: 'Typical NYC',
    loadingLabel: 'Loading NYC incidents…',
    feedbackSubject: 'NYC Safety Map feedback',
    outcomeLabel: 'Severity',
    attribution: { label: 'NYC Open Data', url: 'https://data.cityofnewyork.us/d/qgea-i56i' },
  },
}

export const CITY: CityConfig = cities[(import.meta.env.VITE_CITY as string) || 'sf'] ?? cities.sf

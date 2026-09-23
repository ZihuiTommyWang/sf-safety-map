// Central knobs for look & behavior — colors, zooms, presets. Tweak here first.

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export const SF_CENTER: [number, number] = [-122.4327, 37.7689]
export const SF_BOUNDS: [[number, number], [number, number]] = [
  [-122.585, 37.665],
  [-122.28, 37.865],
]
export const INITIAL_ZOOM = 12.2
export const MIN_ZOOM = 10.5

// "Exposure" firefly rendering: every incident is one amber dot, and dots in
// dense areas overexpose toward white-hot (like a long-exposure photo). A dot's
// tier (0–4) is the citywide percentile of its ~140m hex's incident count,
// recomputed for the active category/date filters.
export const EXPOSURE = {
  hexSizeM: 140,
  // Percentile breakpoints over hexes that have at least one incident.
  quantiles: [0.55, 0.8, 0.93, 0.985] as const,
  colors: ['#8a5c22', '#c98f35', '#ffb84d', '#ffd98f', '#fff6e0'] as const,
  opacity: [0.22, 0.32, 0.5, 0.72, 0.95] as const,
  radiusZ11: [0.9, 1.0, 1.2, 1.4, 1.6] as const,
  radiusZ15: [2.3, 2.6, 3.1, 3.6, 4.2] as const,
  hotGlowColor: '#ffcf70',
}

// Dot color per display category id (fallback used for anything unlisted).
export const CATEGORY_COLORS: Record<string, string> = {
  'assault': '#ef5350',
  'homicide': '#b71c1c',
  'robbery': '#ff7043',
  'sex-offenses': '#c2185b',
  'weapons': '#ec407a',
  'drugs': '#7e57c2',
  'street-disorder': '#26a69a',
  'theft': '#ffca28',
  'car-break-in': '#ffa726',
  'vehicle-theft': '#ff8a65',
  'burglary': '#ab47bc',
  'vandalism': '#66bb6a',
  'arson': '#d84315',
}
export const FALLBACK_DOT_COLOR = '#607d8b'

export const DEFAULT_PRESET = 'walking'

export const DATA_BASE = import.meta.env.BASE_URL + 'data/'

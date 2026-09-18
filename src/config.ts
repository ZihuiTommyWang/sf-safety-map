// Central knobs for look & behavior — colors, zooms, presets. Tweak here first.

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export const SF_CENTER: [number, number] = [-122.4327, 37.7689]
export const SF_BOUNDS: [[number, number], [number, number]] = [
  [-122.585, 37.665],
  [-122.28, 37.865],
]
export const INITIAL_ZOOM = 12.2
export const MIN_ZOOM = 10.5

// Zoom where the heatmap hands off to clickable incident dots.
export const DOT_ZOOM = 14.6

// Heatmap density ramp (0 → 1). Green = calm, red = hot, like a walkability lens.
export const HEAT_RAMP: [number, string][] = [
  [0, 'rgba(0, 0, 0, 0)'],
  [0.08, 'rgba(26, 82, 44, 0.55)'],
  [0.3, 'rgba(80, 158, 47, 0.65)'],
  [0.5, 'rgba(207, 199, 48, 0.7)'],
  [0.72, 'rgba(235, 137, 28, 0.78)'],
  [1, 'rgba(220, 46, 38, 0.85)'],
]

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

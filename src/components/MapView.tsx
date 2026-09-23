import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_STYLE, SF_CENTER, SF_BOUNDS, INITIAL_ZOOM, MIN_ZOOM, EXPOSURE } from '../config'
import type { DataBundle, FilterState } from '../data'
import { toMapFilter } from '../data'

interface Props {
  bundle: DataBundle
  filter: FilterState
  /** Bumped whenever exposure tiers were rewritten in bundle.geojson. */
  tierVersion: number
  onPick: (indices: number[]) => void
}

const tierMatch = (values: readonly number[]) =>
  ['match', ['get', 't'], 0, values[0], 1, values[1], 2, values[2], 3, values[3], values[4]]

export default function MapView({ bundle, filter, tierVersion, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: SF_CENTER,
      zoom: INITIAL_ZOOM,
      bounds: [[-122.525, 37.703], [-122.355, 37.837]],
      fitBoundsOptions: { padding: 20 },
      minZoom: MIN_ZOOM,
      maxBounds: SF_BOUNDS,
      attributionControl: { compact: true, customAttribution: 'Incident data: <a href="https://data.sf.gov/d/wg3w-h783">DataSF</a>' },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      map.addSource('incidents', { type: 'geojson', data: bundle.geojson })

      // Halo behind the hottest tiers, so dense cores visibly bloom.
      map.addLayer({
        id: 'fly-hotglow',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4.2, 15, 11],
          'circle-color': EXPOSURE.hotGlowColor,
          'circle-opacity': 0.1,
          'circle-blur': 1.8,
        },
      })
      map.addLayer({
        id: 'fly-core',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            11, tierMatch(EXPOSURE.radiusZ11) as never,
            15, tierMatch(EXPOSURE.radiusZ15) as never,
            17.5, tierMatch(EXPOSURE.radiusZ15.map((r) => r * 2)) as never],
          'circle-color': tierMatch(EXPOSURE.colors as unknown as number[]) as never,
          'circle-opacity': tierMatch(EXPOSURE.opacity) as never,
        },
      })

      applyFilters(map, filter)
      readyRef.current = true
    })

    map.on('click', (e) => {
      if (!readyRef.current) return
      const pad = 8
      const feats = map.queryRenderedFeatures(
        [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
        { layers: ['fly-core'] },
      )
      if (feats.length) onPickRef.current(feats.map((ft) => ft.properties!.i as number))
    })
    map.on('mousemove', (e) => {
      if (!readyRef.current) return
      const feats = map.queryRenderedFeatures(e.point, { layers: ['fly-core'] })
      map.getCanvas().style.cursor = feats.length ? 'pointer' : ''
    })

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    applyFilters(map, filter)
  }, [filter])

  // Tiers were rewritten in place — push the updated GeoJSON to the GPU.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('incidents') as maplibregl.GeoJSONSource | undefined
    src?.setData(bundle.geojson)
  }, [bundle, tierVersion])

  return <div ref={containerRef} className="map-container" />
}

function applyFilters(map: maplibregl.Map, filter: FilterState) {
  const f = toMapFilter(filter) as never
  map.setFilter('fly-core', f)
  // The halo only backs the hottest dots.
  map.setFilter('fly-hotglow', ['all', f, ['>=', ['get', 't'], 3]] as never)
}

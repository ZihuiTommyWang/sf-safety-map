import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  MAP_STYLE, SF_CENTER, SF_BOUNDS, INITIAL_ZOOM, MIN_ZOOM, DOT_ZOOM,
  HEAT_RAMP, CATEGORY_COLORS, FALLBACK_DOT_COLOR,
} from '../config'
import type { DataBundle, FilterState } from '../data'
import { toMapFilter } from '../data'

interface Props {
  bundle: DataBundle
  filter: FilterState
  onPick: (indices: number[]) => void
  onZoom: (zoom: number) => void
}

export default function MapView({ bundle, filter, onPick, onZoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const onPickRef = useRef(onPick)
  const onZoomRef = useRef(onZoom)
  onPickRef.current = onPick
  onZoomRef.current = onZoom

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

    const heatRamp: unknown[] = ['interpolate', ['linear'], ['heatmap-density']]
    for (const [stop, color] of HEAT_RAMP) heatRamp.push(stop, color)

    const catColors: unknown[] = ['match', ['get', 'c']]
    bundle.meta.categories.forEach((c, i) => {
      catColors.push(i, CATEGORY_COLORS[c.id] ?? FALLBACK_DOT_COLOR)
    })
    catColors.push(FALLBACK_DOT_COLOR)

    map.on('load', () => {
      map.addSource('incidents', { type: 'geojson', data: bundle.geojson })

      map.addLayer({
        id: 'heat',
        type: 'heatmap',
        source: 'incidents',
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 0.03, 13, 0.1, 15.5, 0.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 7, 13, 15, 15.5, 30],
          'heatmap-color': heatRamp as never,
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.8, 0.9, DOT_ZOOM + 0.8, 0.18],
        },
      })

      map.addLayer({
        id: 'dots',
        type: 'circle',
        source: 'incidents',
        minzoom: DOT_ZOOM - 0.6,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.6, 2.2, 16.5, 5.5, 19, 9],
          'circle-color': catColors as never,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.6, 0, DOT_ZOOM + 0.4, 0.85],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM, 0, 17, 1],
          'circle-stroke-color': 'rgba(0,0,0,0.6)',
          'circle-stroke-opacity': 0.6,
        },
      })

      const f = toMapFilter(filter) as never
      map.setFilter('heat', f)
      map.setFilter('dots', f)
      readyRef.current = true
    })

    map.on('click', (e) => {
      if (map.getZoom() < DOT_ZOOM - 0.6 || !readyRef.current) return
      const pad = 8
      const feats = map.queryRenderedFeatures(
        [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
        { layers: ['dots'] },
      )
      if (feats.length) onPickRef.current(feats.map((ft) => ft.properties!.i as number))
    })
    map.on('mousemove', (e) => {
      if (map.getZoom() < DOT_ZOOM - 0.6 || !readyRef.current) return
      const feats = map.queryRenderedFeatures(e.point, { layers: ['dots'] })
      map.getCanvas().style.cursor = feats.length ? 'pointer' : ''
    })
    map.on('zoom', () => onZoomRef.current(map.getZoom()))

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
    const f = toMapFilter(filter) as never
    map.setFilter('heat', f)
    map.setFilter('dots', f)
  }, [filter])

  return <div ref={containerRef} className="map-container" />
}

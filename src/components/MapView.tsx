import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_STYLE, EXPOSURE } from '../config'
import type { DataBundle, FilterState } from '../data'
import { toMapFilter } from '../data'
import type { SearchTarget } from './GlassUI'
import { CITY } from '../city'

interface Props {
  bundle: DataBundle
  filter: FilterState
  /** Bumped whenever exposure tiers were rewritten in bundle.chunks. */
  tierVersion: number
  searchTarget: SearchTarget | null
  onPick: (indices: number[]) => void
  /** Tap below DETAIL_ZOOM: open an area report instead of a dot list. */
  onAreaPick: (lng: number, lat: number) => void
  /** Tap on empty map at detail zoom: dismiss whatever is open. */
  onDismiss: () => void
}

/** Below this zoom a tap means "this area", not "these exact dots". */
const DETAIL_ZOOM = 14

/** Vertical offset so a focused point lands above the sheet, not under it. */
const sheetOffset = (): [number, number] => [0, -Math.min(window.innerHeight * 0.18, 170)]

const tierMatch = (values: readonly number[]) =>
  ['match', ['get', 't'], 0, values[0], 1, values[1], 2, values[2], 3, values[3], values[4]]

export default function MapView({ bundle, filter, tierVersion, searchTarget, onPick, onAreaPick, onDismiss }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const readyRef = useRef(false)
  const addedChunks = useRef(0)
  const coreLayers = useRef<string[]>([])
  const [painted, setPainted] = useState(false)
  const onPickRef = useRef(onPick)
  const onAreaPickRef = useRef(onAreaPick)
  const onDismissRef = useRef(onDismiss)
  onPickRef.current = onPick
  onAreaPickRef.current = onAreaPick
  onDismissRef.current = onDismiss

  // Incident data lives in one source + layer pair PER loaded chunk: pushing a
  // single million-feature collection to the GL worker runs the tab out of
  // memory, while per-chunk updates stay bounded.
  const syncChunks = (map: maplibregl.Map, f: FilterState) => {
    for (let k = addedChunks.current; k < bundle.chunks.length; k++) {
      // maxzoom 15 + no buffer keep the worker's tile index small; point
      // positions overzoom from z15 tiles with sub-meter error, so individual
      // dots at street zoom are unaffected.
      map.addSource(`incidents-${k}`, {
        type: 'geojson',
        data: bundle.chunks[k],
        maxzoom: 15,
        buffer: 8,
        tolerance: 0,
      })
      map.addLayer({
        id: `fly-hotglow-${k}`,
        type: 'circle',
        source: `incidents-${k}`,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4.2, 15, 11],
          'circle-color': EXPOSURE.hotGlowColor,
          'circle-opacity': 0.1,
          'circle-blur': 1.8,
        },
      })
      map.addLayer({
        id: `fly-core-${k}`,
        type: 'circle',
        source: `incidents-${k}`,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            11, tierMatch(EXPOSURE.radiusZ11) as never,
            15, tierMatch(EXPOSURE.radiusZ15) as never,
            17.5, tierMatch(EXPOSURE.radiusZ15.map((r) => r * 2)) as never],
          'circle-color': tierMatch(EXPOSURE.colors as unknown as number[]) as never,
          'circle-opacity': tierMatch(EXPOSURE.opacity) as never,
        },
      })
      coreLayers.current.push(`fly-core-${k}`)
      addedChunks.current = k + 1
    }
    applyFilters(map, f, addedChunks.current)
  }

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CITY.center,
      zoom: CITY.initialZoom,
      bounds: CITY.fitBounds,
      fitBoundsOptions: { padding: 20 },
      minZoom: CITY.minZoom,
      maxBounds: CITY.maxBounds,
      attributionControl: { compact: true, customAttribution: `Incident data: <a href="${CITY.attribution.url}">${CITY.attribution.label}</a>` },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', () => {
      syncChunks(map, filter)
      readyRef.current = true
    })

    map.on('click', (e) => {
      if (!readyRef.current) return
      if (map.getZoom() < DETAIL_ZOOM) {
        onAreaPickRef.current(e.lngLat.lng, e.lngLat.lat)
        return
      }
      const pad = 8
      const feats = map.queryRenderedFeatures(
        [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
        { layers: coreLayers.current },
      )
      if (feats.length) {
        onPickRef.current(feats.map((ft) => ft.properties!.i as number))
        map.easeTo({ center: e.lngLat, offset: sheetOffset(), duration: 500 })
      } else {
        onDismissRef.current()
      }
    })
    map.once('idle', () => setPainted(true))
    map.on('mousemove', (e) => {
      if (!readyRef.current) return
      const feats = map.queryRenderedFeatures(e.point, { layers: coreLayers.current })
      map.getCanvas().style.cursor = feats.length ? 'pointer' : ''
    })

    return () => {
      readyRef.current = false
      addedChunks.current = 0
      coreLayers.current = []
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    applyFilters(map, filter, addedChunks.current)
  }, [filter])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markerRef.current?.remove()
    markerRef.current = null
    if (!searchTarget) return
    markerRef.current = new maplibregl.Marker({ color: '#ffb84d' })
      .setLngLat([searchTarget.lng, searchTarget.lat])
      .addTo(map)
    map.flyTo({
      center: [searchTarget.lng, searchTarget.lat],
      zoom: Math.max(map.getZoom(), 15.2),
      offset: sheetOffset(),
      duration: 1400,
    })
  }, [searchTarget])

  // Tiers were rewritten in place (and chunks may have been added) — push the
  // updated GeoJSON to the GPU, one bounded chunk at a time.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncChunks(map, filter)
    for (let k = 0; k < bundle.chunks.length; k++) {
      const src = map.getSource(`incidents-${k}`) as maplibregl.GeoJSONSource | undefined
      src?.setData(bundle.chunks[k])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, tierVersion])

  return <div ref={containerRef} className={`map-container ${painted ? 'painted' : ''}`} />
}

function applyFilters(map: maplibregl.Map, filter: FilterState, chunkCount: number) {
  const f = toMapFilter(filter) as never
  for (let k = 0; k < chunkCount; k++) {
    map.setFilter(`fly-core-${k}`, f)
    // The halo only backs the hottest dots.
    map.setFilter(`fly-hotglow-${k}`, ['all', f, ['>=', ['get', 't'], 3]] as never)
  }
}

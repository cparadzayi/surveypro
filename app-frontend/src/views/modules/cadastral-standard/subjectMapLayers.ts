/**
 * Map pieces shared by every screen that tags a subject's sides: the Plan screen
 * and the Servitudes screen both draw the selected subject's clickable sides and
 * resolve a map click to a side, a stand or (on a split figure) a sheet.
 *
 * Free of Vue so the click rules can be tested without a real map.
 */
import type maplibregl from 'maplibre-gl'
import { subjectSides, type SideAnnotation } from './sideAnnotations'
import { pickDiagramSubjectId } from './diagramSubjectPick'
import { sheetSubjectAt } from './sheetSubjects'

export interface SidesLayerOptions {
  /** Source id; the layers are `${srcId}-solid`, `-dashed` and `-hit`. */
  srcId: string
  /** Colour of a servitude side. The Plan keeps its plan blue; the Servitudes screen
   *  draws them red against a road's burnt sienna. */
  servitudeColour: string
  /** Draw the invisible click target. Off where the sides are shown but not edited. Default on. */
  interactive?: boolean
}

/** Draw (or redraw) the clickable sides of ONE subject. `ring` is in map (lng/lat)
 *  coordinates; null clears the layer. */
export function upsertSubjectSidesLayer(
  map: maplibregl.Map,
  opts: SidesLayerOptions,
  ring: [number, number][] | null,
  annotations: SideAnnotation[],
): void {
  const { srcId } = opts
  const roleBySide = new Map(annotations.map(a => [a.side, a.role]))
  const feats = ring
    ? subjectSides(ring).map(s => ({
        type: 'Feature',
        properties: { side: s.side, role: roleBySide.get(s.side) ?? '' },
        geometry: { type: 'LineString', coordinates: [s.a, s.b] },
      }))
    : []
  const data = { type: 'FeatureCollection', features: feats } as any
  const existing = map.getSource(srcId) as any
  if (existing) { existing.setData(data); return }
  map.addSource(srcId, { type: 'geojson', data })
  const colour = ['match', ['get', 'role'], 'road', '#B7410E', 'servitude', opts.servitudeColour, 'contiguous', '#000000', '#9aa0a6'] as any
  const isSolid = ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']] as any
  // Casing + hover under the visible lines: white keeps the side readable on satellite, amber
  // marks the side under the pointer before it is clicked.
  map.addLayer({
    id: `${srcId}-casing`, type: 'line', source: srcId,
    paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.8 },
  })
  if (opts.interactive !== false) {
    map.addLayer({
      id: `${srcId}-hover`, type: 'line', source: srcId, filter: ['==', ['get', 'side'], ''] as any,
      paint: { 'line-color': '#f59e0b', 'line-width': 12, 'line-opacity': 0.55 },
    })
  }
  map.addLayer({
    id: `${srcId}-solid`, type: 'line', source: srcId, filter: isSolid,
    paint: { 'line-color': colour, 'line-width': 5 },
  })
  // dasharray is not data-driven, so contiguous/unannotated get their own layer.
  map.addLayer({
    id: `${srcId}-dashed`, type: 'line', source: srcId, filter: ['!', isSolid] as any,
    paint: { 'line-color': colour, 'line-width': 5, 'line-dasharray': [2, 2] },
  })
  // The side letters (AB, BC...) along each side, so it is clear which boundary is which.
  map.addLayer({
    id: `${srcId}-letters`, type: 'symbol', source: srcId,
    layout: {
      'symbol-placement': 'line-center', 'text-field': ['get', 'side'], 'text-size': 12,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true,
      'text-offset': [0, -1],
    },
    paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  })
  if (opts.interactive === false) return
  map.addLayer({
    id: `${srcId}-hit`, type: 'line', source: srcId,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 },
  })
  map.on('mousemove', `${srcId}-hit`, (e: any) => {
    map.getCanvas().style.cursor = 'pointer'
    const side = String(e.features?.[0]?.properties?.side ?? '')
    map.setFilter(`${srcId}-hover`, ['==', ['get', 'side'], side] as any)
  })
  map.on('mouseleave', `${srcId}-hit`, () => {
    map.getCanvas().style.cursor = ''
    map.setFilter(`${srcId}-hover`, ['==', ['get', 'side'], ''] as any)
  })
}

export interface ClickResolution {
  /** A side of the selected subject was hit. */
  side?: string
  /** That side's two end points (map coordinates), for working out which terminal was clicked. */
  sideCoords?: [number, number][]
  /** The subject (stand, outside figure or sheet figure) under the click. */
  subjectId?: string | number
}

export interface ClickInput {
  map: maplibregl.Map
  point: { x: number; y: number }
  lngLat: { lng: number; lat: number }
  sidesHitLayer: string
  parcels: Array<{ id: string | number; area_m2?: number }>
  /** The unsplit outside figure, never picked as a whole when given. */
  excludeFigureId: string | number | null
  /** Each sheet's figure in map coordinates; empty on a single-sheet plan. */
  sheetRings: Array<{ id: string; ring: [number, number][] }>
}

/**
 * Side first (it sits on top of the subject), then the smallest stand under the
 * click, then -- only when no stand is there -- the sheet whose figure holds it.
 * The sheet test is geometric on purpose: it needs no map layer, so no layer order
 * or paint opacity can hide a sheet from a click.
 */
export function resolveSubjectClick(c: ClickInput): ClickResolution | null {
  const { map } = c
  if (map.getLayer(c.sidesHitLayer)) {
    const hits = map.queryRenderedFeatures(c.point as any, { layers: [c.sidesHitLayer] })
    const side = hits.length ? String(hits[0].properties?.side ?? '') : ''
    if (side) {
      const coords = (hits[0].geometry as any)?.coordinates as [number, number][] | undefined
      return { side, sideCoords: coords }
    }
  }
  const fillLayers = c.parcels
    .filter(p => c.excludeFigureId == null || String(p.id) !== String(c.excludeFigureId))
    .map(p => `parcel-${p.id}-fill`)
    .filter(id => map.getLayer(id))
  const hits = fillLayers.length ? map.queryRenderedFeatures(c.point as any, { layers: fillLayers }) : []
  const picked = pickDiagramSubjectId(hits.map(h => h.layer.id), c.parcels, c.excludeFigureId)
  const subjectId = picked ?? sheetSubjectAt([c.lngLat.lng, c.lngLat.lat], c.sheetRings)
  return subjectId == null ? null : { subjectId }
}

/** Dashed outlines of each sheet's figure (selected one solid blue), so a split
 *  figure's parts can be seen and clicked. `rings` are in map coordinates. */
export function upsertSheetOutlinesLayer(
  map: maplibregl.Map,
  rings: Array<{ id: string; ring: [number, number][] }>,
  selectedId: string | number | null,
): void {
  const srcId = 'sheet-subject-outlines'
  const feats = rings.map(r => ({
    type: 'Feature',
    properties: { selected: selectedId != null && String(r.id) === String(selectedId) },
    geometry: { type: 'Polygon', coordinates: [r.ring] },
  }))
  const data = { type: 'FeatureCollection', features: feats } as any
  const existing = map.getSource(srcId) as any
  if (existing) { existing.setData(data); return }
  map.addSource(srcId, { type: 'geojson', data })
  map.addLayer({
    id: srcId, type: 'line', source: srcId,
    paint: {
      'line-color': ['case', ['get', 'selected'], '#2563eb', '#7c3aed'] as any,
      'line-width': ['case', ['get', 'selected'], 5, 2] as any,
      'line-dasharray': [3, 2],
    },
  })
}

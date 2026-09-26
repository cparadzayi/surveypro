/**
 * Choosing what the Survey Plan map should frame.
 *
 * The map used to fit itself to the coordinate points and to nothing else:
 * `fitBounds` returned early when `coordinatePoints` was empty, so a project
 * whose points were missing — after a CSV re-import, say — left the camera on
 * the hardcoded Gweru default with the parcels it had already loaded drawn
 * somewhere off-screen. The frame has to fall back to the parcel geometry, which
 * is usually still there.
 *
 * Kept separate from the 8k-line view so the rule is testable, and so "no data"
 * stays a distinct answer. `calculateBounds` in coordinateTransform returns an
 * all-zero box for an empty list, which MapLibre happily zooms to as Null
 * Island; a null extent is what stops that.
 */

export interface MapExtent {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface MapFitTarget {
  extent: MapExtent
  /** Which dataset the frame came from, for the log line. */
  source: 'points' | 'parcels'
}

/**
 * Collect every [lng, lat] vertex from a GeoJSON geometry.
 *
 * Accepts bare geometries, `Feature`, `FeatureCollection` and JSON strings,
 * because parcel `geom` arrives as any of those depending on whether it came
 * back through the API as a column or a field. Unparseable or vertex-less
 * entries are skipped rather than thrown on: one malformed parcel must not cost
 * the surveyor the frame for all the others.
 */
export function geoJsonVertices(input: unknown): Array<[number, number]> {
  const out: Array<[number, number]> = []

  const walk = (node: any): void => {
    if (!Array.isArray(node)) return
    // A vertex is [lng, lat]; anything deeper is a ring/part nesting.
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]])
      return
    }
    for (const child of node) walk(child)
  }

  for (const geometry of unwrapGeometries(input)) {
    walk(geometry?.coordinates)
  }
  return out
}

/**
 * Reduce the accepted shapes to a flat list of bare geometries.
 *
 * A parcel list is the normal input, so a top-level array has to be treated as
 * a list rather than as a geometry — otherwise `coordinates` is read off the
 * array itself and every parcel silently yields no vertices.
 */
function unwrapGeometries(input: any): any[] {
  if (input == null) return []

  if (Array.isArray(input)) return input.flatMap(unwrapGeometries)

  if (typeof input === 'string') {
    try {
      return unwrapGeometries(JSON.parse(input))
    } catch {
      return []
    }
  }

  if (typeof input !== 'object') return []

  switch (input.type) {
    case 'Feature':
      return unwrapGeometries(input.geometry)
    case 'FeatureCollection':
      return unwrapGeometries(input.features ?? [])
    case 'GeometryCollection':
      return unwrapGeometries(input.geometries ?? [])
    default:
      return [input]
  }
}

/** Bounding box over a vertex list, or null when there is nothing to frame. */
export function extentFromVertices(vertices: Array<[number, number]>): MapExtent | null {
  if (vertices.length === 0) return null

  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const [lng, lat] of vertices) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null
  return { minLng, minLat, maxLng, maxLat }
}

/**
 * What the map should frame: the survey points when there are any, otherwise
 * the parcels.
 *
 * Points are preferred because the plan is a point plan — a parcel outline is
 * frequently wider than the beacons it contains, and framing to the parcel
 * pushes the points towards the edge. Parcels are the fallback, not the
 * preference: they are the layer most likely to survive a failed import.
 */
export function mapFitTarget(input: {
  wgs84Points: Array<{ lng: number; lat: number }>
  wgs84Features?: unknown[]
}): MapFitTarget | null {
  const pointExtent = extentFromVertices(
    (input.wgs84Points ?? [])
      .filter(p => p && Number.isFinite(p.lng) && Number.isFinite(p.lat))
      .map(p => [p.lng, p.lat] as [number, number])
  )
  if (pointExtent) return { extent: pointExtent, source: 'points' }

  const parcelExtent = extentFromVertices(geoJsonVertices(input.wgs84Features ?? []))
  if (parcelExtent) return { extent: parcelExtent, source: 'parcels' }

  return null
}

/**
 * The Survey Plan map must frame whatever it actually has.
 *
 * The reported failure: a project loaded four parcels and zero coordinate points
 * (its points had been cleared by a CSV re-import) and the map came up showing
 * nothing, because `fitBounds` returned early on an empty point set and the
 * camera stayed on the hardcoded Gweru default. These lock in the fallback, and
 * equally the refusal to fit to nothing — `calculateBounds` in
 * coordinateTransform answers an all-zero box for an empty list, which MapLibre
 * would happily zoom to as Null Island.
 */

import { describe, it, expect } from 'vitest'
import { mapFitTarget, extentFromVertices, geoJsonVertices } from '@/utils/mapExtent'

/** A stand 30.2953°E, 29.8000°S, roughly Gweru. */
const SQUARE = {
  type: 'Polygon',
  coordinates: [[
    [30.2950, -29.8000],
    [30.2956, -29.8000],
    [30.2956, -29.7994],
    [30.2950, -29.7994],
    [30.2950, -29.8000]
  ]]
}

describe('geoJsonVertices', () => {
  it('reads a bare polygon', () => {
    expect(geoJsonVertices(SQUARE)).toHaveLength(5) // closed ring
  })

  it('unwraps a Feature', () => {
    expect(geoJsonVertices({ type: 'Feature', geometry: SQUARE })).toHaveLength(5)
  })

  it('unwraps a FeatureCollection', () => {
    const fc = { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: SQUARE },
      { type: 'Feature', geometry: SQUARE }
    ] }
    expect(geoJsonVertices(fc)).toHaveLength(10)
  })

  it('parses a geometry that arrived as a JSON string', () => {
    expect(geoJsonVertices(JSON.stringify(SQUARE))).toHaveLength(5)
  })

  it('skips unparseable geometry instead of throwing', () => {
    expect(geoJsonVertices('{not json')).toEqual([])
    expect(geoJsonVertices(null)).toEqual([])
    expect(geoJsonVertices(undefined)).toEqual([])
    expect(geoJsonVertices({ type: 'Polygon' })).toEqual([])
  })
})

describe('extentFromVertices', () => {
  it('spans every vertex', () => {
    const extent = extentFromVertices([[30.0, -29.0], [30.5, -29.8], [30.2, -29.4]])

    expect(extent).toEqual({ minLng: 30.0, minLat: -29.8, maxLng: 30.5, maxLat: -29.0 })
  })

  it('returns null for no vertices rather than a zero box', () => {
    // A zero box is the Null Island zoom-to bug this guards against.
    expect(extentFromVertices([])).toBeNull()
  })

  it('ignores non-finite vertices', () => {
    expect(extentFromVertices([[NaN, -29.0], [Infinity, -29.0]])).toBeNull()
  })
})

describe('mapFitTarget', () => {
  const points = [
    { lng: 30.2900, lat: -29.7900 },
    { lng: 30.2950, lat: -29.7950 }
  ]

  it('frames the points when there are points', () => {
    const target = mapFitTarget({ wgs84Points: points, wgs84Features: [SQUARE] })

    expect(target?.source).toBe('points')
    expect(target?.extent).toEqual({ minLng: 30.29, minLat: -29.795, maxLng: 30.295, maxLat: -29.79 })
  })

  it('falls back to the parcels when the point set is empty', () => {
    // The reported case: four parcels, zero points, nothing on screen.
    const target = mapFitTarget({ wgs84Points: [], wgs84Features: [SQUARE] })

    expect(target?.source).toBe('parcels')
    expect(target?.extent).toEqual({ minLng: 30.295, minLat: -29.8, maxLng: 30.2956, maxLat: -29.7994 })
  })

  it('spans several parcels, not just the first', () => {
    const far = {
      type: 'Polygon',
      coordinates: [[[30.40, -29.90], [30.41, -29.90], [30.41, -29.89], [30.40, -29.89], [30.40, -29.90]]]
    }
    const target = mapFitTarget({ wgs84Points: [], wgs84Features: [SQUARE, far] })

    expect(target?.extent.maxLng).toBeCloseTo(30.41)
    expect(target?.extent.minLng).toBeCloseTo(30.295)
  })

  it('handles a MultiPolygon spanning two stands', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [SQUARE.coordinates, [[[31.0, -28.0], [31.1, -28.0], [31.1, -27.9], [31.0, -27.9], [31.0, -28.0]]]]
    }
    const target = mapFitTarget({ wgs84Points: [], wgs84Features: [multi] })

    // Both rings, not just the first polygon of the multipolygon.
    expect(target?.extent.maxLng).toBeCloseTo(31.1)
    expect(target?.extent.minLng).toBeCloseTo(30.295)
    expect(target?.extent.maxLat).toBeCloseTo(-27.9)
    expect(target?.extent.minLat).toBeCloseTo(-29.8)
  })

  it('returns null when there is neither points nor geometry', () => {
    expect(mapFitTarget({ wgs84Points: [], wgs84Features: [] })).toBeNull()
    expect(mapFitTarget({ wgs84Points: [] })).toBeNull()
  })

  it('returns null when every parcel geometry is unusable', () => {
    // A parcel whose geom failed to parse must not become a Null Island fit.
    const target = mapFitTarget({ wgs84Points: [], wgs84Features: ['{oops', null, { type: 'Polygon' }] })

    expect(target).toBeNull()
  })

  it('ignores points with non-finite coordinates', () => {
    const target = mapFitTarget({ wgs84Points: [{ lng: NaN, lat: -29.79 }], wgs84Features: [SQUARE] })

    expect(target?.source).toBe('parcels')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { normalizeCapeLoCoordinates, normalizeGeoJSONPoint } from '../capeLoNormalization'

const extent = { minY: -100, maxY: 100, minX: 2000, maxX: 2200 }

describe('normalizeCapeLoCoordinates', () => {
  it('turns south-oriented Cape Lo (Y westing, X southing) into 0-based north-oriented x/y', () => {
    // the most westerly (Y = +100) and most southerly (X = +2200) point is the origin
    expect(normalizeCapeLoCoordinates(100, 2200, extent)).toEqual({ x: 0, y: 0 })
    // the most easterly (Y = -100) and most northerly (X = 2000) point is the far corner
    expect(normalizeCapeLoCoordinates(-100, 2000, extent)).toEqual({ x: 200, y: 200 })
  })
})

describe('normalizeGeoJSONPoint', () => {
  it('works on the very first call (it used to throw a ReferenceError from a debug log)', () => {
    // GeoJSON here is [Southing, Westing]
    expect(() => normalizeGeoJSONPoint([2200, 100], extent)).not.toThrow()
  })

  it('returns [x, y] for a [southing, westing] point, and does not log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(normalizeGeoJSONPoint([2200, 100], extent)).toEqual([0, 0])
    expect(normalizeGeoJSONPoint([2000, -100], extent)).toEqual([200, 200])
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

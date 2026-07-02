import { describe, test, expect } from '@jest/globals'
import { resolveVertexBeaconName } from '../beaconName.js'

// Beacons stored as [Southing, Westing] (DB order) — helper normalizes.
const beacons = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: '86B' }, geometry: { type: 'Point', coordinates: [2144076.45, -85723.40] } },
    { type: 'Feature', properties: { name: 'SD1' }, geometry: { type: 'Point', coordinates: [2144164.76, -85729.94] } },
  ],
}

describe('resolveVertexBeaconName', () => {
  test('returns the name of the beacon coincident with the vertex', () => {
    // vertex in canonical [Y=Westing, X=Southing]
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], beacons)).toBe('86B')
    expect(resolveVertexBeaconName([-85729.94, 2144164.76], beacons)).toBe('SD1')
  })
  test('matches within tolerance (a few cm of noise)', () => {
    expect(resolveVertexBeaconName([-85723.42, 2144076.44], beacons, 0.5)).toBe('86B')
  })
  test('returns "" when no beacon is within tolerance', () => {
    expect(resolveVertexBeaconName([-85000, 2140000], beacons, 0.5)).toBe('')
  })
  test('returns "" for empty/missing beacons', () => {
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], { features: [] })).toBe('')
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], null)).toBe('')
  })
  test('falls back to beacon_name then id when name is absent', () => {
    const b = { features: [
      { properties: { beacon_name: 'X9' }, geometry: { type: 'Point', coordinates: [2144076.45, -85723.40] } },
    ] }
    expect(resolveVertexBeaconName([-85723.40, 2144076.45], b)).toBe('X9')
  })
})

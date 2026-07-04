import { describe, test, expect } from '@jest/globals'
import { buildBeaconDescription } from '../beaconDescription.js'

// Subject vertices are canonical [Y=Westing, X=Southing].
const geometry = { vertices: [
  { letter: 'A', y: -85000, x: 2144000 },
  { letter: 'B', y: -85000, x: 2144060 },
] }
const fc = (features) => ({ type: 'FeatureCollection', features })
// Real beacon points arrive raw as [Southing, Westing]; normalizeCapeLoYX flips them.
const beacon = (name, southing, westing, extra = {}) => ({
  type: 'Feature',
  properties: { name, ...extra },
  geometry: { type: 'Point', coordinates: [southing, westing] },
})

describe('buildBeaconDescription', () => {
  test('describes only beacons on the subject parcel, ignoring far ones', () => {
    const beacons = fc([
      beacon('A1', 2144000, -85000, { description: '12mm iron peg' }),
      beacon('B1', 2144060, -85000, { description: '12mm iron peg' }),
      beacon('FAR', 2200000, -90000, { description: '50mm pipe' }),
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A1, B1', description: '12mm iron peg' },
    ])
  })

  test('uses each beacon\'s description property, grouping distinct descriptions in vertex order', () => {
    const beacons = fc([
      beacon('A1', 2144000, -85000, { description: '12mm iron peg' }),
      beacon('B1', 2144060, -85000, { description: '50mm iron pipe' }),
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A1', description: '12mm iron peg' },
      { names: 'B1', description: '50mm iron pipe' },
    ])
  })

  test('infers the description from the name when none is provided', () => {
    const beacons = fc([
      beacon('84A', 2144000, -85000),   // default → 12mm iron peg in concrete
      beacon('B1', 2144060, -85000),    // [A-Z]\d → 50mm Iron Pipe in Concrete
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: '84A', description: '12mm iron peg in concrete' },
      { names: 'B1', description: '50mm Iron Pipe in Concrete' },
    ])
  })

  test('returns [] when no beacon coincides with a vertex', () => {
    expect(buildBeaconDescription(geometry, fc([]))).toEqual([])
  })
})

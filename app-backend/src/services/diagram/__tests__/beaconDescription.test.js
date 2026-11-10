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
      { names: 'A, B', description: '12mm iron peg' },
    ])
  })

  test('uses each beacon\'s description property, grouping distinct descriptions in vertex order', () => {
    const beacons = fc([
      beacon('A1', 2144000, -85000, { description: '12mm iron peg' }),
      beacon('B1', 2144060, -85000, { description: '50mm iron pipe' }),
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A', description: '12mm iron peg' },
      { names: 'B', description: '50mm iron pipe' },
    ])
  })

  test('infers the description from the name when none is provided', () => {
    const beacons = fc([
      beacon('84A', 2144000, -85000),   // default → 12mm iron peg
      beacon('B1', 2144060, -85000),    // [A-Z]\d → 50mm Iron Pipe in Concrete
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A', description: '12mm iron peg' },
      { names: 'B', description: '50mm Iron Pipe in Concrete' },
    ])
  })

  test('returns [] when no beacon coincides with a vertex', () => {
    expect(buildBeaconDescription(geometry, fc([]))).toEqual([])
  })
})

describe('connection points are described with the corners', () => {
  const beacons = fc([
    beacon('A1', 2144000, -85000, { description: '12mm iron peg in concrete' }),
    beacon('B1', 2144060, -85000, { description: '12mm iron peg in concrete' }),
    beacon('PARENT', 2144400, -85300, { description: '50mm iron pipe' }),
    beacon('FAR', 2200000, -90000, { description: 'not connected' }),
  ])
  const conn = [{ letter: 'C', toBeacon: 'PARENT' }]

  test('a connection point with its own description is listed against its letter', () => {
    expect(buildBeaconDescription(geometry, beacons, 0.5, conn)).toEqual([
      { names: 'A, B', description: '12mm iron peg in concrete' },
      { names: 'C', description: '50mm iron pipe' },
    ])
  })

  test('one with the same description joins the corners, so the "All" shorthand still holds', () => {
    const same = fc([
      beacon('A1', 2144000, -85000, { description: '12mm iron peg in concrete' }),
      beacon('B1', 2144060, -85000, { description: '12mm iron peg in concrete' }),
      beacon('PARENT', 2144400, -85300, { description: '12mm iron peg in concrete' }),
    ])
    expect(buildBeaconDescription(geometry, same, 0.5, conn)).toEqual([
      { names: 'A, B, C', description: '12mm iron peg in concrete' },
    ])
  })

  test('matches the beacon by name, whatever its case', () => {
    expect(buildBeaconDescription(geometry, beacons, 0.5, [{ letter: 'C', toBeacon: 'parent' }]).at(-1))
      .toEqual({ names: 'C', description: '50mm iron pipe' })
  })

  test('a connection to an unknown beacon adds nothing, and without connections nothing changes', () => {
    expect(buildBeaconDescription(geometry, beacons, 0.5, [{ letter: 'C', toBeacon: 'NOPE' }])).toEqual(
      buildBeaconDescription(geometry, beacons))
  })

  test('two connections to one beacon describe it once', () => {
    const got = buildBeaconDescription(geometry, beacons, 0.5, [{ letter: 'C', toBeacon: 'PARENT' }, { letter: 'D', toBeacon: 'PARENT' }])
    expect(got.filter((g) => g.description === '50mm iron pipe')).toEqual([{ names: 'C', description: '50mm iron pipe' }])
  })
})

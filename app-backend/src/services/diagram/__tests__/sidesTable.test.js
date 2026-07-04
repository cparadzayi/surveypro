import { describe, test, expect } from '@jest/globals'
import { toDMS, buildSidesTable, buildFigureRepresents, formatDiagramArea } from '../sidesTable.js'

const geometry = {
  vertices: [
    { letter: 'A', y: -85728.70, x: 2143972.14 },
    { letter: 'B', y: -85741.41, x: 2143988.59 },
    { letter: 'C', y: -85765.14, x: 2144017.16 },
  ],
  sides: [
    { side: 'AB', distance: 20.79, bearingDeg: 322.30861 }, // ≈ 322°18′31″
    { side: 'BC', distance: 37.14, bearingDeg: 320.28722 },
    { side: 'CA', distance: 5000, bearingDeg: 44.9361 },
  ],
  area: 4047,
}
const beacons = {
  type: 'FeatureCollection',
  features: [
    { properties: { name: '86B' }, geometry: { type: 'Point', coordinates: [2143972.14, -85728.70] } },
  ],
}

describe('toDMS', () => {
  test('converts degrees to d/m/s', () => {
    expect(toDMS(314.9444)).toEqual({ d: 314, m: 56, s: 40 })
  })
  test("uses banker's rounding on the arcsecond (round half to even) per SI 727", () => {
    // 2.5" → 2 (even), not 3; 0.5" → 0 (even), not 1. Plain Math.round would round half up.
    expect(toDMS(2.5 / 3600)).toEqual({ d: 0, m: 0, s: 2 })
    expect(toDMS(0.5 / 3600)).toEqual({ d: 0, m: 0, s: 0 })
  })
})

describe('formatDiagramArea', () => {
  test('below 1 hectare: whole square metres with unit', () => {
    expect(formatDiagramArea(4047)).toBe('4047 square metres')
  })
  test("below 1 hectare uses banker's rounding on the whole metre", () => {
    expect(formatDiagramArea(4046.5)).toBe('4046 square metres') // 4046 is even
  })
  test('1 hectare or more: hectares to 4 decimals with unit', () => {
    expect(formatDiagramArea(12345)).toBe('1.2345 hectares')
    expect(formatDiagramArea(15000)).toBe('1.5000 hectares')
  })
})

describe('buildSidesTable', () => {
  test('const row is signed 0.00 / 0.00', () => {
    expect(buildSidesTable(geometry, beacons).constRow).toEqual({ y: '+0.00', x: '+0.00' })
  })
  test('coordinate rows carry full signed coords to 2dp', () => {
    const t = buildSidesTable(geometry, beacons)
    expect(t.coordinateRows[0]).toMatchObject({ letter: 'A', y: '-85728.70', x: '+2143972.14' })
  })
  test('directions round to nearest 10 seconds when distance < 6000 m', () => {
    const t = buildSidesTable(geometry, beacons)
    // AB 322°18′31″ → 322 18 30 (nearest 10″, banker's)
    expect(t.sideRows[0].direction).toBe('322 18 30')
  })
  test('coordinate rows carry the matched beacon name (blank when none)', () => {
    const t = buildSidesTable(geometry, beacons)
    expect(t.coordinateRows[0].beaconName).toBe('86B')
    expect(t.coordinateRows[1].beaconName).toBe('')
  })
})

describe('buildFigureRepresents', () => {
  test('joins vertex letters and closes back to the first', () => {
    expect(buildFigureRepresents(geometry)).toBe('A.B.C.A')
  })
})

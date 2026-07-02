import { describe, test, expect } from '@jest/globals'
import { toDMS, buildSidesTable, buildFigureRepresents, formatDiagramArea } from '../sidesTable.js'

const geometry = {
  vertices: [
    { letter: 'A', y: -85557.12, x: 787.48 },
    { letter: 'B', y: -85605.99, x: 836.25 },
    { letter: 'C', y: -85503.68, x: 938.79 },
  ],
  sides: [
    { side: 'AB', distance: 69.05, bearingDeg: 314.9444 },
    { side: 'BC', distance: 144.85, bearingDeg: 44.9361 },
    { side: 'CA', distance: 120.0, bearingDeg: 224.0 },
  ],
  area: 5019,
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
  test('const row is 0.00 / 0.00', () => {
    expect(buildSidesTable(geometry).constRow).toEqual({ y: '0.00', x: '0.00' })
  })
  test('coordinate rows carry full signed coords to 2dp', () => {
    const t = buildSidesTable(geometry)
    expect(t.coordinateRows[0]).toEqual({ letter: 'A', y: '-85557.12', x: '+787.48' })
  })
  test('side rows have metres + spaced DMS direction', () => {
    const t = buildSidesTable(geometry)
    expect(t.sideRows[0]).toEqual({ side: 'AB', metres: '69.05', direction: '314 56 40' })
  })
})

describe('buildFigureRepresents', () => {
  test('joins vertex letters and closes back to the first', () => {
    expect(buildFigureRepresents(geometry)).toBe('A.B.C.A.')
  })
})

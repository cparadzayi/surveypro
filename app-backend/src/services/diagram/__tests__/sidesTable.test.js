import { describe, test, expect } from '@jest/globals'
import { toDMS, buildSidesTable, buildFigureRepresents } from '../sidesTable.js'

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

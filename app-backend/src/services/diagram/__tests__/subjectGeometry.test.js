import { describe, test, expect } from '@jest/globals'
import { deriveSubjectGeometry } from '../subjectGeometry.js'
import { roundBearingSouth } from '../../../utils/zim-geo.js'

// Realistic Cape Lo square. The DB delivers the ring as [Southing, Westing]
// (Southing ≈ 2.14M, Westing ≈ tens of thousands); the helper must normalize to
// canonical [Y=Westing, X=Southing]. Laid out so the edges are cardinal:
// A→B due South, B→C due West, C→D due North, D→A due East. South-oriented
// bearings: 0=S, 90=W, 180=N, 270=E.
const squareStored = {
  properties: { area_m2: 10000 },
  geometry: { type: 'Polygon', coordinates: [[
    [2144000, 85000], // A
    [2144100, 85000], // B  (+100m south)
    [2144100, 85100], // C  (+100m west)
    [2144000, 85100], // D  (+100m north)
    [2144000, 85000], // close
  ]] },
}

describe('deriveSubjectGeometry', () => {
  test('normalizes [Southing,Westing] so vertices carry y=Westing, x=Southing', () => {
    const g = deriveSubjectGeometry(squareStored)
    expect(g.vertices.map(v => v.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(g.vertices[0]).toMatchObject({ letter: 'A', y: 85000, x: 2144000 })
    expect(g.vertices[2]).toMatchObject({ letter: 'C', y: 85100, x: 2144100 })
  })

  test('sides connect consecutive vertices and close D->A', () => {
    const g = deriveSubjectGeometry(squareStored)
    expect(g.sides.map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
    expect(g.sides[0].distance).toBeCloseTo(100, 6)
  })

  test('bearings are south-oriented (0=S, 90=W, 180=N, 270=E)', () => {
    const g = deriveSubjectGeometry(squareStored)
    expect(g.sides[0].bearingDeg).toBeCloseTo(0, 3)    // AB due south
    expect(g.sides[1].bearingDeg).toBeCloseTo(90, 3)   // BC due west
    expect(g.sides[2].bearingDeg).toBeCloseTo(180, 3)  // CD due north
    expect(g.sides[3].bearingDeg).toBeCloseTo(270, 3)  // DA due east
  })

  test('carries area from properties', () => {
    expect(deriveSubjectGeometry(squareStored).area).toBe(10000)
  })

  test('carries the subject parcel designation (falls back to stand, then null)', () => {
    const withDesig = { ...squareStored, properties: { ...squareStored.properties, designation: 'STAND 405 BRACKENHURST TOWNSHIP' } }
    expect(deriveSubjectGeometry(withDesig).designation).toBe('STAND 405 BRACKENHURST TOWNSHIP')
    const standOnly = { ...squareStored, properties: { area_m2: 1, stand: '405' } }
    expect(deriveSubjectGeometry(standOnly).designation).toBe('405')
    expect(deriveSubjectGeometry(squareStored).designation).toBeNull()
  })

  test('already-normalized [Westing,Southing] input is left unchanged (idempotent)', () => {
    const normalized = {
      properties: { area_m2: 5000 },
      geometry: { type: 'Polygon', coordinates: [[
        [85000, 2144000], [85000, 2144100], [85100, 2144100], [85000, 2144000],
      ]] },
    }
    const g = deriveSubjectGeometry(normalized)
    expect(g.vertices[0]).toMatchObject({ y: 85000, x: 2144000 })
  })
})

describe('deriveSubjectGeometry — agrees with the Area & Consistency computation', () => {
  // STAND 404, Brackenhurst Township, as OBSERVED (three decimals), the fixture
  // from area-computation.lodgedCoordinates.test.js. The DB may hold the ring at
  // the surveyor's working precision, but the record publishes co-ordinates at
  // two decimals — and both the diagram and the consistency data must derive
  // the same sides and directions from them. Stand diagrams were sourced from
  // the raw ring here, producing directions 10" away from the consistency sheet
  // (SD5->SD6 was 314°57'20" there and 314°57'10" here, SD3->86C 69.93 vs 69.92).
  const STAND_404 = {
    properties: { area_m2: 4047 },
    geometry: { type: 'Polygon', coordinates: [[
      [2144027.044, -85673.907], // SD4
      [2144063.183, -85710.106], // SD5
      [2144076.451, -85723.396], // SD6
      [2144117.414, -85682.515], // SD3
      [2144068.004, -85633.040], // 86C
      [2144027.044, -85673.907], // close
    ]] },
  }

  const dms = (deg) => {
    const total = Math.round(deg * 3600)
    return `${Math.floor(total / 3600)}°${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}'${String(total % 60).padStart(2, '0')}"`
  }

  test('rounds the observed co-ordinates to the lodged precision before deriving sides', () => {
    const g = deriveSubjectGeometry(STAND_404)
    // SD3's westing -85682.515 is exactly on the half-cent → banker's gives -85682.52.
    expect(g.vertices[3]).toMatchObject({ y: -85682.52, x: 2144117.41 })
  })

  test('states the directions the Area & Consistency sheet states', () => {
    const g = deriveSubjectGeometry(STAND_404)
    const directions = g.sides.map((s) => {
      const res = s.distance < 6000 ? 10 : 1
      return dms(roundBearingSouth(s.bearingDeg, res))
    })
    expect(directions).toEqual([
      "314°57'10\"",
      "314°57'20\"",
      "44°56'40\"",
      "134°57'30\"",
      "224°56'10\"",
    ])
  })

  test('states the distances the Area & Consistency sheet states', () => {
    const g = deriveSubjectGeometry(STAND_404)
    const metres = g.sides.map((s) => Number(s.distance.toFixed(2)))
    expect(metres).toEqual([51.15, 18.78, 57.87, 69.93, 57.86])
  })
})

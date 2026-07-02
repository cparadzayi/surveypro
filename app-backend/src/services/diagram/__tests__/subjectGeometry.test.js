import { describe, test, expect } from '@jest/globals'
import { deriveSubjectGeometry } from '../subjectGeometry.js'

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

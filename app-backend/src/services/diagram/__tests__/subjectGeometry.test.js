import { describe, test, expect } from '@jest/globals'
import { deriveSubjectGeometry } from '../subjectGeometry.js'

// A simple square, Cape Lo [Y,X]; ring closed (last == first).
const square = {
  properties: { area_m2: 10000 },
  geometry: { type: 'Polygon', coordinates: [[
    [0, 0], [0, 100], [100, 100], [100, 0], [0, 0],
  ]] },
}

describe('deriveSubjectGeometry', () => {
  test('letters vertices A..D in ring order, drops closing duplicate', () => {
    const g = deriveSubjectGeometry(square)
    expect(g.vertices.map(v => v.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(g.vertices[0]).toMatchObject({ letter: 'A', y: 0, x: 0 })
    expect(g.vertices[2]).toMatchObject({ letter: 'C', y: 100, x: 100 })
  })

  test('sides connect consecutive vertices and close D->A', () => {
    const g = deriveSubjectGeometry(square)
    expect(g.sides.map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
    expect(g.sides[0].distance).toBeCloseTo(100, 6)
  })

  test('bearing uses the north-azimuth convention', () => {
    const g = deriveSubjectGeometry(square)
    // AB: (0,0)->(0,100): dy=0, dx=100 → atan2(0,-100)=180°
    expect(g.sides[0].bearingDeg).toBeCloseTo(180, 6)
    // BC: (0,100)->(100,100): dy=100, dx=0 → atan2(-100,0)=270°
    expect(g.sides[1].bearingDeg).toBeCloseTo(270, 6)
  })

  test('carries area from properties', () => {
    expect(deriveSubjectGeometry(square).area).toBe(10000)
  })
})

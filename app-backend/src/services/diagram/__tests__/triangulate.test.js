import { describe, test, expect } from '@jest/globals'
import { triangulateWithHoles, triangleArea } from '../triangulate.js'

const area = (r) => Math.abs(r.reduce((t, q, i) => { const n = r[(i + 1) % r.length]; return t + (q[0] * n[1] - n[0] * q[1]) }, 0)) / 2
const sum = (tris) => tris.reduce((t, x) => t + triangleArea(x), 0)

describe('triangulateWithHoles', () => {
  test('a plain polygon: the triangles add up to its area', () => {
    const L = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]
    expect(sum(triangulateWithHoles(L))).toBeCloseTo(area(L), 9)
  })

  test('a square with a square hole: only the ring is covered', () => {
    const outer = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const hole = [[3, 3], [7, 3], [7, 7], [3, 7]]
    const tris = triangulateWithHoles(outer, [hole])
    expect(sum(tris)).toBeCloseTo(100 - 16, 9)
    // nothing is drawn inside the hole
    expect(tris.some((t) => t.every(() => false))).toBe(false)
    const cx = (t) => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3]
    for (const t of tris) { const [x, y] = cx(t); expect(x > 3 && x < 7 && y > 3 && y < 7).toBe(false) }
  })

  test('a boundary and its inward offset with a different vertex count (the figure band)', () => {
    // a 5-corner figure and a smaller 5-corner offset, as the PDF fills it
    const outer = [[0, 0], [60, 5], [70, 40], [30, 70], [-5, 35]]
    const c = [27, 30]
    const inner = outer.map(([x, y]) => [c[0] + (x - c[0]) * 0.9, c[1] + (y - c[1]) * 0.9])
    const tris = triangulateWithHoles(outer, [inner])
    expect(sum(tris)).toBeCloseTo(area(outer) - area(inner), 6)
  })

  test('the winding of the inputs does not matter', () => {
    const outer = [[0, 0], [0, 10], [10, 10], [10, 0]]          // clockwise
    const hole = [[3, 3], [7, 3], [7, 7], [3, 7]]               // counter-clockwise
    expect(sum(triangulateWithHoles(outer, [hole]))).toBeCloseTo(84, 9)
  })
})

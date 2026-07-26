import { describe, test, expect } from '@jest/globals'
import { roadBandRibbon, outwardNormal } from '../roadBandRibbon.js'

const cen = [50, -50] // below the edge, so "outward" from a horizontal edge is +y

describe('outwardNormal', () => {
  test('points away from the centroid', () => {
    expect(outwardNormal([0, 0], [100, 0], cen)).toEqual([0, 1])
  })
})

describe('roadBandRibbon', () => {
  test('straight frontage → a thin quad of the given width', () => {
    // inner A→B along x, outward +y, width 4 → rectangle [A, B, B+4y, A+4y]
    expect(roadBandRibbon([[0, 0], [100, 0]], 4, cen)).toEqual([
      [0, 0], [100, 0], [100, 4], [0, 4],
    ])
  })

  test('degenerate (<2 points) → empty', () => {
    expect(roadBandRibbon([[0, 0]], 4, cen)).toEqual([])
  })

  test('bent ribbon: inner polyline preserved, thin outward offset, 2N points', () => {
    // Frontage A→B plus an offshoot leg at each end (tipA, tipB), symmetric.
    const inner = [[-10, 10], [0, 0], [100, 0], [110, 10]] // tipA, A, B, tipB
    const w = 4
    const poly = roadBandRibbon(inner, w, cen)
    // 8 points: the 4 inner (in order) then 4 outer (reversed).
    expect(poly).toHaveLength(8)
    expect(poly.slice(0, 4)).toEqual(inner)
    // Each inner vertex has a matching outer vertex offset by ~w (miter can stretch to <=2w).
    const outerRev = poly.slice(4)          // reversed outer
    const outer = outerRev.slice().reverse() // outer[j] pairs with inner[j]
    for (let j = 0; j < inner.length; j++) {
      const d = Math.hypot(outer[j][0] - inner[j][0], outer[j][1] - inner[j][1])
      expect(d).toBeGreaterThanOrEqual(w - 1e-9)
      expect(d).toBeLessThanOrEqual(2 * w + 1e-9)
    }
    // Outward: every outer point is farther from the centroid than its inner point
    // (the band sits on the road side, not toward the figure).
    for (let j = 0; j < inner.length; j++) {
      const dIn = Math.hypot(inner[j][0] - cen[0], inner[j][1] - cen[1])
      const dOut = Math.hypot(outer[j][0] - cen[0], outer[j][1] - cen[1])
      expect(dOut).toBeGreaterThan(dIn)
    }
  })

  test('one-sided bend (only tipB) keeps A square and follows the offshoot at B', () => {
    const inner = [[0, 0], [100, 0], [110, 10]] // A, B, tipB
    const poly = roadBandRibbon(inner, 4, cen)
    expect(poly).toHaveLength(6)
    expect(poly.slice(0, 3)).toEqual(inner)
    // A (index 0) is an endpoint → offset straight out by exactly w along the frontage normal.
    const outerRev = poly.slice(3)
    const outerA = outerRev[outerRev.length - 1] // reversed, so last is inner[0]'s outer
    expect(outerA[0]).toBeCloseTo(0, 6)
    expect(outerA[1]).toBeCloseTo(4, 6)
  })
})

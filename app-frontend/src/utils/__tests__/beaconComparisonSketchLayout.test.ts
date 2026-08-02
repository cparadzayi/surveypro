import { describe, it, expect } from 'vitest'
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset } from '../beaconComparisonSketchLayout'

describe('computeExtent', () => {
  it('returns the min/max Y and X across all points', () => {
    const ext = computeExtent([{ y: 10, x: 100 }, { y: 30, x: 80 }, { y: 20, x: 120 }])
    expect(ext).toEqual({ minY: 10, maxY: 30, minX: 80, maxX: 120 })
  })

  it('handles a single point (zero extent, no crash)', () => {
    expect(computeExtent([{ y: 5, x: 5 }])).toEqual({ minY: 5, maxY: 5, minX: 5, maxX: 5 })
  })
})

describe('pickSketchScale', () => {
  it('picks the smallest ladder denominator whose ground extent fits the area', () => {
    // 20m x 20m extent; at 1:100 that's 200mm x 200mm — too big for a 150x100mm area.
    // At 1:200 that's 100mm x 100mm — fits.
    const extent = { minY: 0, maxY: 20, minX: 0, maxX: 20 }
    const { denom, label } = pickSketchScale(extent, { width: 150, height: 100 })
    expect(denom).toBe(200)
    expect(label).toBe('1 : 200')
  })

  it('falls back to the largest ladder denominator when nothing fits', () => {
    const extent = { minY: 0, maxY: 100000, minX: 0, maxX: 100000 }
    const { denom } = pickSketchScale(extent, { width: 150, height: 100 })
    expect(denom).toBe(5000) // largest rung on the ladder
  })

  it('does not divide by zero for a degenerate (zero-width) extent', () => {
    const extent = { minY: 5, maxY: 5, minX: 0, maxX: 20 }
    expect(() => pickSketchScale(extent, { width: 150, height: 100 })).not.toThrow()
  })
})

describe('makeSketchTransform', () => {
  it('maps the extent corners into the area, north-up and east-right, centred', () => {
    const extent = { minY: 0, maxY: 10, minX: 0, maxX: 10 } // 10m x 10m
    const denom = 100 // 1:100 -> 10m = 100mm exactly the area size
    const areaMm = { width: 100, height: 100 }
    const origin = { x: 20, y: 30 }
    const tf = makeSketchTransform(extent, areaMm, denom, origin)
    // Most-west (maxY) -> left edge; most-east (minY) -> right edge (east-right convention).
    const west = tf({ y: 10, x: 0 })  // maxY, minX
    const east = tf({ y: 0, x: 0 })   // minY, minX
    expect(west.mmX).toBeCloseTo(origin.x, 6)
    expect(east.mmX).toBeCloseTo(origin.x + 100, 6)
    // North up: X is Southing (larger X = further south), and jsPDF's own Y already
    // increases downward — mapping X directly to mmY with no flip means minX (the
    // NORTHERNMOST point, smallest Southing) lands at the smallest mmY (top of the
    // area), and maxX (southernmost) lands at the largest mmY (bottom). That is
    // "north at the top", matching how a surveyor reads a plan.
    const northMost = tf({ y: 0, x: 0 })  // x = minX
    const southMost = tf({ y: 0, x: 10 }) // x = maxX
    expect(northMost.mmY).toBeCloseTo(origin.y, 6)
    expect(southMost.mmY).toBeCloseTo(origin.y + 100, 6)
  })

  it('centres a smaller extent within a larger area', () => {
    const extent = { minY: 0, maxY: 5, minX: 0, maxX: 5 } // 5m x 5m
    const denom = 100 // -> 50mm x 50mm drawing
    const areaMm = { width: 100, height: 100 } // 50mm of slack each axis -> 25mm each side
    const origin = { x: 0, y: 0 }
    const tf = makeSketchTransform(extent, areaMm, denom, origin)
    const center = tf({ y: 2.5, x: 2.5 })
    expect(center.mmX).toBeCloseTo(50, 6)
    expect(center.mmY).toBeCloseTo(50, 6)
  })
})

describe('midpointOffset', () => {
  it('offsets perpendicular to the ray, at the requested distance, from the true midpoint', () => {
    const a = { mmX: 0, mmY: 0 }
    const b = { mmX: 10, mmY: 0 } // horizontal ray
    const p = midpointOffset(a, b, 2, 1)
    // Perpendicular to a horizontal ray is vertical; midpoint x stays 5.
    expect(p.mmX).toBeCloseTo(5, 6)
    expect(Math.abs(p.mmY)).toBeCloseTo(2, 6)
  })

  it('side=-1 offsets to the opposite side from side=1', () => {
    const a = { mmX: 0, mmY: 0 }
    const b = { mmX: 10, mmY: 0 }
    const p1 = midpointOffset(a, b, 2, 1)
    const p2 = midpointOffset(a, b, 2, -1)
    expect(p1.mmY).toBeCloseTo(-p2.mmY, 6)
  })

  it('does not divide by zero for coincident points', () => {
    const p = { mmX: 3, mmY: 4 }
    expect(() => midpointOffset(p, p, 2)).not.toThrow()
  })
})

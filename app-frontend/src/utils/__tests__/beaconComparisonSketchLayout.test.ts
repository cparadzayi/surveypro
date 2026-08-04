import { describe, it, expect } from 'vitest'
import {
  computeExtent, pickSketchScale, makeSketchTransform, midpointOffset,
  sampleCubicBezier, curveControlPoints, boxAtAnchor, pointInRect,
  segmentsIntersect, polylineIntersectsRect, findClearAnchor, computeDrawSizeMm,
  rectsOverlap,
} from '../beaconComparisonSketchLayout'

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

describe('computeDrawSizeMm', () => {
  it('computes the drawn width/height at a given scale, independent of any target area', () => {
    const extent = { minY: 0, maxY: 20, minX: 0, maxX: 10 } // 20m wide, 10m tall
    const size = computeDrawSizeMm(extent, 200) // 1:200 -> 20m = 100mm, 10m = 50mm
    expect(size.width).toBeCloseTo(100, 6)
    expect(size.height).toBeCloseTo(50, 6)
  })

  it('does not divide by zero for a degenerate (zero-width) extent', () => {
    const extent = { minY: 5, maxY: 5, minX: 0, maxX: 20 }
    expect(() => computeDrawSizeMm(extent, 100)).not.toThrow()
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

describe('sampleCubicBezier', () => {
  it('returns n+1 points including exact endpoints', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 10 }
    const samples = sampleCubicBezier(a, a, b, b, 10)
    expect(samples).toHaveLength(11)
    expect(samples[0]).toEqual(a)
    expect(samples[10]).toEqual(b)
  })
})

describe('curveControlPoints + sampleCubicBezier', () => {
  it('bows a straight horizontal chord toward side=1 by half the bow distance at its midpoint', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const { cp1, cp2 } = curveControlPoints(a, b, 4, 1)
    const samples = sampleCubicBezier(a, cp1, cp2, b, 2)
    expect(samples).toHaveLength(3)
    expect(samples[0]).toEqual(a)
    expect(samples[2]).toEqual(b)
    expect(samples[1].mmX).toBeCloseTo(5, 6)
    // Standard quadratic-to-cubic conversion makes the t=0.5 sample land at
    // chordMidpoint + 0.5*bowOffset, not at the full bow -- this is that midpoint.
    expect(samples[1].mmY).toBeCloseTo(2, 6)
  })

  it('bows to the opposite side for side=-1', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const { cp1, cp2 } = curveControlPoints(a, b, 4, -1)
    const samples = sampleCubicBezier(a, cp1, cp2, b, 2)
    expect(samples[1].mmY).toBeCloseTo(-2, 6)
  })
})

describe('boxAtAnchor + pointInRect', () => {
  it('builds a rectangle around the anchor padded by the given box size', () => {
    const rect = boxAtAnchor({ mmX: 10, mmY: 10 }, 6, 4)
    expect(pointInRect({ mmX: 10, mmY: 10 }, rect)).toBe(true)
    expect(pointInRect({ mmX: 100, mmY: 100 }, rect)).toBe(false)
  })
})

describe('segmentsIntersect', () => {
  it('detects a simple X-crossing', () => {
    expect(segmentsIntersect(
      { mmX: 0, mmY: 0 }, { mmX: 10, mmY: 10 },
      { mmX: 0, mmY: 10 }, { mmX: 10, mmY: 0 },
    )).toBe(true)
  })

  it('returns false for parallel non-overlapping segments', () => {
    expect(segmentsIntersect(
      { mmX: 0, mmY: 0 }, { mmX: 10, mmY: 0 },
      { mmX: 0, mmY: 5 }, { mmX: 10, mmY: 5 },
    )).toBe(false)
  })

  it('returns false for segments that do not reach each other', () => {
    expect(segmentsIntersect(
      { mmX: 0, mmY: 0 }, { mmX: 1, mmY: 0 },
      { mmX: 5, mmY: -5 }, { mmX: 5, mmY: 5 },
    )).toBe(false)
  })
})

describe('polylineIntersectsRect', () => {
  const rect = { x0: 4, y0: 4, x1: 6, y1: 6 }

  it('detects a polyline segment passing through the rectangle', () => {
    const poly = [{ mmX: 0, mmY: 5 }, { mmX: 10, mmY: 5 }]
    expect(polylineIntersectsRect(poly, rect)).toBe(true)
  })

  it('returns false when the polyline stays clear of the rectangle', () => {
    const poly = [{ mmX: 0, mmY: 20 }, { mmX: 10, mmY: 20 }]
    expect(polylineIntersectsRect(poly, rect)).toBe(false)
  })

  it('detects a lone polyline point that lies inside the rectangle', () => {
    const poly = [{ mmX: 5, mmY: 5 }]
    expect(polylineIntersectsRect(poly, rect)).toBe(true)
  })
})

describe('findClearAnchor', () => {
  it('picks the minimum offset on the preferred side when nothing blocks it', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [], 2.5, 30)
    expect(anchor.mmX).toBeCloseTo(5, 6)
    expect(anchor.mmY).toBeCloseTo(3, 6)
  })

  it('steps outward past a blocking polyline on the preferred side', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const blocker = [{ mmX: 0, mmY: 3 }, { mmX: 10, mmY: 3 }]
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [blocker], 2.5, 30)
    expect(anchor.mmY).toBeGreaterThan(3)
  })

  it('falls back to the opposite side when the preferred side is blocked all the way to the cap', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const blockers: Array<{ mmX: number; mmY: number }[]> = []
    for (let off = 2; off <= 32; off += 2) blockers.push([{ mmX: 0, mmY: off }, { mmX: 10, mmY: off }])
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, blockers, 2.5, 30)
    expect(anchor.mmY).toBeLessThan(0)
  })
})

describe('rectsOverlap', () => {
  it('detects overlapping rectangles', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 15, y1: 15 })).toBe(true)
  })

  it('returns false for rectangles that do not touch', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 20, y0: 20, x1: 30, y1: 30 })).toBe(false)
  })

  it('treats exactly touching edges as overlapping (inclusive boundary)', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(true)
  })
})

describe('findClearAnchor with otherRects', () => {
  it('avoids a previously-placed annotation rectangle even when no ray polyline blocks it', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    // Sits exactly where the minimum-offset (offset=3, side=1) anchor's box would land
    // (boxAtAnchor((5,3), 2, 2) === {x0:4, y0:0.8, x1:8, y1:6}) -- no ray polylines
    // involved at all, so this can only be avoided via the new otherRects exclusion set.
    const blockingRect = { x0: 4, y0: 0.8, x1: 8, y1: 6 }
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [], 2.5, 30, [blockingRect])
    expect(anchor.mmY).toBeGreaterThan(3)
  })

  it('still works with otherRects omitted (existing callers unaffected)', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [], 2.5, 30)
    expect(anchor.mmY).toBeCloseTo(3, 6)
  })
})

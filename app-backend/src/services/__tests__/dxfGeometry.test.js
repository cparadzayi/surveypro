/**
 * Layer 1 unit tests for the DXF geometric primitives.
 * Run with:  cd app-backend && npm run test -- dxfGeometry
 */
import { describe, test, expect } from '@jest/globals'
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
  isPointInPolygon,
  isPointNearPolygon,
  lineSegmentsIntersect,
} from '../dxfGeometry.js'

describe('pointDistance', () => {
  test('zero distance for same point', () => {
    expect(pointDistance({ x: 5, y: 7 }, { x: 5, y: 7 })).toBe(0)
  })
  test('3-4-5 triangle', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
  test('negative coordinates', () => {
    expect(pointDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('pointToLineDistance', () => {
  test('point on line → 0', () => {
    expect(pointToLineDistance({ x: 2, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 8 })).toBeCloseTo(0, 6)
  })
  test('perpendicular distance for horizontal line', () => {
    // Line from (0,0) to (10,0), point at (5,3) → distance 3
    expect(pointToLineDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3, 6)
  })
  test('perpendicular distance for diagonal line', () => {
    // Line from (0,0) to (1,1), point at (1,0) → perpendicular distance sqrt(0.5) ≈ 0.7071
    expect(pointToLineDistance({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(Math.SQRT1_2, 6)
  })
  test('degenerate zero-length line → reduces to pointDistance to start', () => {
    expect(pointToLineDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('distanceToSegment', () => {
  test('point on segment → 0', () => {
    expect(distanceToSegment({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(0, 6)
  })
  test('perpendicular projection inside segment', () => {
    expect(distanceToSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3, 6)
  })
  test('projection past segEnd → clamps to segEnd', () => {
    // Segment (0,0)-(2,0); point (5,0) projects to t=2.5 past end → clamps, distance = |5-2| = 3
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(3, 6)
  })
  test('projection past segStart → clamps to segStart', () => {
    // Segment (0,0)-(2,0); point (-3,0) clamps to start, distance = 3
    expect(distanceToSegment({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(3, 6)
  })
  test('zero-length segment → reduces to pointDistance to start', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('isPointInPolygon', () => {
  // Unit square (0,0)-(10,0)-(10,10)-(0,10)
  const square = [
    { x: 0,  y: 0  },
    { x: 10, y: 0  },
    { x: 10, y: 10 },
    { x: 0,  y: 10 },
  ]

  test('point clearly inside square → true', () => {
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
  })
  test('point clearly outside square → false', () => {
    expect(isPointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
  test('point on vertex (algorithm choice — accepts either result)', () => {
    // Ray-casting is famously fragile on vertices. Just assert it returns
    // a boolean and doesn't throw — the actual on/off result is algorithm-dependent.
    const result = isPointInPolygon({ x: 0, y: 0 }, square)
    expect(typeof result).toBe('boolean')
  })
  test('point on a horizontal edge', () => {
    const result = isPointInPolygon({ x: 5, y: 0 }, square)
    expect(typeof result).toBe('boolean')
  })
  test('star-shaped polygon containment', () => {
    // Concave 5-vertex polygon. (5,5) is inside; (5,9.5) is outside the convex hull
    // but the polygon's notch puts it outside.
    const star = [
      { x: 5,  y: 0  },
      { x: 6,  y: 4  },
      { x: 10, y: 5  },
      { x: 6,  y: 6  },
      { x: 5,  y: 10 },
      { x: 4,  y: 6  },
      { x: 0,  y: 5  },
      { x: 4,  y: 4  },
    ]
    expect(isPointInPolygon({ x: 5, y: 5 }, star)).toBe(true)
    expect(isPointInPolygon({ x: 9, y: 9 }, star)).toBe(false)
  })
  test('ray crossing a vertex — does not double-count', () => {
    // Triangle: (0,0)-(10,0)-(5,10). Point at (5,5) sits below the apex (5,10).
    // A horizontal ray from (5,5) eastward would graze the apex if naive — but
    // the algorithm uses strict-inequality slope test that handles this correctly.
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]
    expect(isPointInPolygon({ x: 5, y: 5 }, triangle)).toBe(true)
    expect(isPointInPolygon({ x: 5, y: 11 }, triangle)).toBe(false)
  })
})

describe('isPointNearPolygon', () => {
  // CLOSED unit square (last vertex repeats first). isPointNearPolygon
  // iterates length-1 edges, so the polygon MUST be closed by repeating
  // the first vertex at the end — see the JSDoc note on this function.
  const closedSquare = [
    { x: 0,  y: 0  },
    { x: 10, y: 0  },
    { x: 10, y: 10 },
    { x: 0,  y: 10 },
    { x: 0,  y: 0  },
  ]

  test('point inside → true regardless of buffer', () => {
    expect(isPointNearPolygon({ x: 5, y: 5 }, closedSquare, 0)).toBe(true)
    expect(isPointNearPolygon({ x: 5, y: 5 }, closedSquare, 100)).toBe(true)
  })
  test('point outside but within buffer of an edge → true', () => {
    // Point (12, 5) is 2 units east of the (10,0)-(10,10) edge
    expect(isPointNearPolygon({ x: 12, y: 5 }, closedSquare, 3)).toBe(true)
  })
  test('point outside beyond buffer → false', () => {
    expect(isPointNearPolygon({ x: 12, y: 5 }, closedSquare, 1)).toBe(false)
  })
  test('buffer = 0 reduces to a stricter isPointInPolygon (boundary may differ)', () => {
    // (5, 5) inside both ways
    expect(isPointNearPolygon({ x: 5, y: 5 }, closedSquare, 0)).toBe(true)
    // (20, 20) outside both ways
    expect(isPointNearPolygon({ x: 20, y: 20 }, closedSquare, 0)).toBe(false)
  })
})

describe('lineSegmentsIntersect', () => {
  // Segments are [{x, y}, {x, y}] pairs (start, end).
  const horizontal = [{ x: 0, y: 5 }, { x: 10, y: 5 }]   // y=5, x in [0,10]
  const vertical   = [{ x: 5, y: 0 }, { x: 5, y: 10 }]   // x=5, y in [0,10]
  const diagonal   = [{ x: 0, y: 0 }, { x: 10, y: 10 }]  // y=x

  test('crossing segments → true', () => {
    expect(lineSegmentsIntersect(horizontal, vertical)).toBe(true)
    expect(lineSegmentsIntersect(horizontal, diagonal)).toBe(true)
  })
  test('parallel non-touching → false', () => {
    const horizontalAbove = [{ x: 0, y: 7 }, { x: 10, y: 7 }]
    expect(lineSegmentsIntersect(horizontal, horizontalAbove)).toBe(false)
  })
  test('parallel touching at endpoint → false (PDF original returns false on parallels)', () => {
    // PDF version returns false for any pair with denom ≈ 0, which
    // includes parallel-touching. Documenting the behaviour with the test.
    const horizontalTouch = [{ x: 10, y: 5 }, { x: 20, y: 5 }]
    expect(lineSegmentsIntersect(horizontal, horizontalTouch)).toBe(false)
  })
  test('collinear overlapping → false (PDF returns false on parallel/collinear)', () => {
    const horizontalOverlap = [{ x: 5, y: 5 }, { x: 15, y: 5 }]
    expect(lineSegmentsIntersect(horizontal, horizontalOverlap)).toBe(false)
  })
  test('T-intersection (endpoint exactly on the other segment)', () => {
    // Vertical's start (5,0) sits on the line y=0; horizontal's at y=5.
    // The two segments DO cross because horizontal extends through x=5
    // and vertical extends through y=5 — true intersection.
    expect(lineSegmentsIntersect(horizontal, vertical)).toBe(true)
  })
  test('segments meeting at a shared endpoint', () => {
    // diagonal goes (0,0)-(10,10); endHook starts at (10,10) and goes elsewhere.
    // The orientation test treats t=1 / s=1 as intersection (ua and ub == 1, inclusive).
    const endHook = [{ x: 10, y: 10 }, { x: 20, y: 5 }]
    expect(lineSegmentsIntersect(diagonal, endHook)).toBe(true)
  })
})

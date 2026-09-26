/**
 * app-shared/figureSplit.js — the outside-figure split rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
 */
import { describe, test, expect } from '@jest/globals'
import {
  projectOnSegment, segmentIntersection, pointInRing, resolveEndpoint,
  interiorStaysInside,
} from '../../../../app-shared/figureSplit.js'

const P = (y, x) => ({ y, x })

describe('projectOnSegment', () => {
  test('drops a perpendicular onto the segment', () => {
    const r = projectOnSegment(P(0, 0), P(10, 0), P(4, 3))
    expect(r.point.y).toBeCloseTo(4, 9)
    expect(r.point.x).toBeCloseTo(0, 9)
    expect(r.t).toBeCloseTo(0.4, 9)
    expect(r.distance).toBeCloseTo(3, 9)
  })

  test('clamps past either end rather than running off the segment', () => {
    expect(projectOnSegment(P(0, 0), P(10, 0), P(-5, 0)).t).toBe(0)
    expect(projectOnSegment(P(0, 0), P(10, 0), P(99, 0)).t).toBe(1)
  })

  test('a zero-length segment reports its own endpoint', () => {
    const r = projectOnSegment(P(3, 3), P(3, 3), P(5, 3))
    expect(r.point).toEqual(P(3, 3))
    expect(r.distance).toBeCloseTo(2, 9)
  })
})

describe('segmentIntersection', () => {
  test('finds a proper crossing', () => {
    expect(segmentIntersection(P(0, 0), P(10, 10), P(0, 10), P(10, 0)))
      .toEqual({ y: 5, x: 5 })
  })

  test('parallel and collinear segments do not cross', () => {
    expect(segmentIntersection(P(0, 0), P(10, 0), P(0, 5), P(10, 5))).toBeNull()
    expect(segmentIntersection(P(0, 0), P(10, 0), P(5, 0), P(15, 0))).toBeNull()
  })

  test('contact at an endpoint counts, and is not treated as a miss', () => {
    // A T-junction: the second segment STARTS exactly on the midpoint of the
    // first. The bounds are inclusive on purpose -- see the note on
    // segmentIntersection. Do not "tighten" this to strict bounds: an interior
    // cut segment grazing the outside figure does so at a ring vertex more
    // often than anywhere else, and excluding endpoints returns null for BOTH
    // edges meeting there, so interiorStaysInside would accept a bad cut.
    const hit = segmentIntersection(P(0, 0), P(10, 0), P(5, 0), P(5, 10))
    expect(hit).not.toBeNull()
    expect(hit.y).toBeCloseTo(5, 9)
    expect(hit.x).toBeCloseTo(0, 9)
  })

  test('a touch exactly on a shared ring vertex is reported for both its edges', () => {
    // The case above, one step worse: the cut lands on the corner where two
    // ring edges meet. Both must report it, because the caller asks only
    // whether there was contact, never how many times.
    // The cut runs DIAGONALLY through the corner. It has to: a cut along the
    // line of either edge is collinear with it, which is the one case that
    // correctly returns null, and an earlier draft of this test got that wrong.
    const corner = P(10, 0)
    const edgeIn = [P(0, 0), corner]          // x = 0, y running 0 -> 10
    const edgeOut = [corner, P(10, 10)]       // y = 10, x running 0 -> 10
    const cut = [P(5, -5), P(15, 5)]          // through the corner at t = 0.5

    for (const [r1, r2] of [edgeIn, edgeOut]) {
      const hit = segmentIntersection(cut[0], cut[1], r1, r2)
      expect(hit).not.toBeNull()
      expect(hit.y).toBeCloseTo(corner.y, 9)
      expect(hit.x).toBeCloseTo(corner.x, 9)
    }
  })

  test('segments that stop short of each other do not cross', () => {
    expect(segmentIntersection(P(0, 0), P(4, 0), P(5, -5), P(5, 5))).toBeNull()
  })
})

describe('pointInRing', () => {
  const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]

  test('inside is inside, outside is outside', () => {
    expect(pointInRing(square, P(5, 5))).toBe(true)
    expect(pointInRing(square, P(15, 5))).toBe(false)
  })

  test('a point on the edge is not inside', () => {
    expect(pointInRing(square, P(0, 5))).toBe(false)
    expect(pointInRing(square, P(10, 10))).toBe(false)
  })
})

describe('resolveEndpoint', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a click near a vertex snaps to that vertex', () => {
    const r = resolveEndpoint(square, P(100.04, 0.03))
    expect(r.kind).toBe('vertex')
    expect(r.index).toBe(1)
    expect(r.point).toEqual(P(100, 0))
  })

  test('a click near an edge lands exactly on that edge', () => {
    const r = resolveEndpoint(square, P(40, 0.07))
    expect(r.kind).toBe('edge')
    expect(r.index).toBe(0)          // the edge from vertex 0 to vertex 1
    expect(r.point).toEqual(P(40, 0))
  })

  test('the landed point is rounded to 2 dp, once, here', () => {
    const r = resolveEndpoint(square, P(33.333333, 0.004))
    expect(r.point).toEqual(P(33.33, 0))
  })

  test('a vertex exactly at the tolerance snaps; just inside it does not', () => {
    // Decision 12 says "within 0.10 m", which this reads as inclusive. Pinning
    // that on 0.10 itself is not possible in binary -- 0.1 * 0.1 square-rooted
    // is 0.10000000000000002, so the literal boundary is unrepresentable. A
    // 3-4-5 triangle gives a distance of exactly 5 in integer arithmetic, so
    // passing the tolerance explicitly tests `<=` against `<` with no slack.
    expect(resolveEndpoint(square, P(3, 4), 5).kind).toBe('vertex')
    expect(resolveEndpoint(square, P(3, 4), 5).index).toBe(0)

    const outside = resolveEndpoint(square, P(3, 4), 4.99)
    expect(outside.kind).toBe('edge')
    expect(outside.index).toBe(3)            // the edge from vertex 3 back to 0
    expect(outside.point).toEqual(P(0, 4))
  })

  test('a snapped vertex keeps its own coordinate, unrounded', () => {
    // Snapping REUSES an existing beacon; it does not create a point. Decision
    // 13's rounding is for points the cut invents. Rounding a surveyed vertex
    // here would state it to 2 dp in the part rings while the Coordinate List
    // states it to 3 -- the disagreement that rounding once exists to prevent.
    // Task 6 puts this very object into the part ring, so a rounded copy would
    // also sit beside the walk's unrounded original for the same beacon.
    const surveyed = [P(0, 0), P(100.004, 0.007), P(100, 100), P(0, 100)]
    const r = resolveEndpoint(surveyed, P(100.01, 0.01))

    expect(r.kind).toBe('vertex')
    expect(r.index).toBe(1)
    expect(r.point).toEqual(P(100.004, 0.007))
  })

  test('a click well inside still resolves to the nearest boundary', () => {
    // The tool should not let this happen, but the rule must be total.
    const r = resolveEndpoint(square, P(50, 20))
    expect(r.kind).toBe('edge')
    expect(r.point).toEqual(P(50, 0))
  })
})

describe('interiorStaysInside', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a straight chord across the middle is fine', () => {
    expect(interiorStaysInside(square, [P(0, 50), P(100, 50)]).ok).toBe(true)
  })

  test('a bent cut following a road is fine', () => {
    const cut = [P(0, 50), P(40, 50), P(40, 70), P(100, 70)]
    expect(interiorStaysInside(square, cut).ok).toBe(true)
  })

  test('a cut that wanders outside is refused', () => {
    const cut = [P(0, 50), P(50, 150), P(100, 50)]
    const r = interiorStaysInside(square, cut)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('vertex-outside')
    expect(r.at).toEqual(P(50, 150))
  })

  test('a cut that leaves and re-enters is refused even with both ends on the ring', () => {
    // Four crossings, not two: it would cut the figure into three parts.
    const cut = [P(0, 50), P(50, -10), P(100, 50)]
    expect(interiorStaysInside(square, cut).ok).toBe(false)
  })
})

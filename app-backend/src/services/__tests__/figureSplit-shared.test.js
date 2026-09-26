/**
 * app-shared/figureSplit.js — the outside-figure split rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
 */
import { describe, test, expect } from '@jest/globals'
import {
  projectOnSegment, segmentIntersection, pointInRing,
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

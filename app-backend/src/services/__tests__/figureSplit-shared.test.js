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

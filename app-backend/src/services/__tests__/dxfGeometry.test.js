/**
 * Layer 1 unit tests for the DXF geometric primitives.
 * Run with:  cd app-backend && npm run test -- dxfGeometry
 */
import { describe, test, expect } from '@jest/globals'
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
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

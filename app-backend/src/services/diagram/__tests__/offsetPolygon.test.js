import { describe, test, expect } from '@jest/globals'
import { offsetPolygonPt } from '../offsetPolygon.js'

const square = [[0, 0], [100, 0], [100, 100], [0, 100]] // 100pt square

describe('offsetPolygonPt', () => {
  test('inward offset shrinks the bbox by the inset on every side', () => {
    const inner = offsetPolygonPt(square, -10)
    expect(inner.length).toBeGreaterThan(0)
    const xs = inner[0].map(p => p[0]); const ys = inner[0].map(p => p[1])
    expect(Math.abs(Math.min(...xs) - 10)).toBeLessThan(0.5)
    expect(Math.abs(Math.max(...xs) - 90)).toBeLessThan(0.5)
    expect(Math.abs(Math.min(...ys) - 10)).toBeLessThan(0.5)
    expect(Math.abs(Math.max(...ys) - 90)).toBeLessThan(0.5)
  })

  test('reversed winding still shrinks on an inward offset', () => {
    const reversed = square.slice().reverse()
    const inner = offsetPolygonPt(reversed, -10)
    expect(inner.length).toBeGreaterThan(0)
    const xs = inner[0].map(p => p[0])
    expect(Math.abs(Math.min(...xs) - 10)).toBeLessThan(0.5)
    expect(Math.abs(Math.max(...xs) - 90)).toBeLessThan(0.5)
  })

  test('an inward offset that collapses the polygon returns []', () => {
    expect(offsetPolygonPt(square, -60)).toEqual([])
  })

  test('a degenerate polygon returns []', () => {
    expect(offsetPolygonPt([[0, 0], [1, 1]], -1)).toEqual([])
  })
})

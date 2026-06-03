/**
 * Layer 1 unit tests for the DXF generic block placer.
 * Run with:  cd app-backend && npm run test -- dxfBlockPlacer
 */
import { describe, test, expect } from '@jest/globals'
import { computeMapFeatureBounds } from '../dxfBlockPlacer.js'

describe('computeMapFeatureBounds', () => {
  test('null input → returns null', () => {
    expect(computeMapFeatureBounds(null)).toBeNull()
    expect(computeMapFeatureBounds(undefined)).toBeNull()
  })

  test('empty array → returns null', () => {
    expect(computeMapFeatureBounds([])).toBeNull()
  })

  test('3-vertex polygon → correct min/max bbox plus right, bottom, polygon fields', () => {
    const polygon = [{ x: 5, y: 3 }, { x: 10, y: 8 }, { x: 7, y: 1 }]
    const result = computeMapFeatureBounds(polygon)
    expect(result).toEqual({
      x: 5,
      y: 1,
      width: 5,
      height: 7,
      right: 10,
      bottom: 8,
      polygon, // exact reference passed through
    })
  })

  test('square polygon → bbox dimensions match polygon dimensions', () => {
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const result = computeMapFeatureBounds(square)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
    expect(result.right).toBe(10)
    expect(result.bottom).toBe(10)
  })
})

/**
 * Layer 1 unit tests for the DXF generic block placer.
 * Run with:  cd app-backend && npm run test -- dxfBlockPlacer
 */
import { describe, test, expect } from '@jest/globals'
import { computeMapFeatureBounds, isValidPosition } from '../dxfBlockPlacer.js'

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

describe('isValidPosition', () => {
  // A standard rect used by most tests
  const baseRect = { x: 50, y: 50, width: 20, height: 10 }

  test('no polygon, no placed blocks → always valid', () => {
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('empty polygon array (treated as null) + empty placedBlocks → valid', () => {
    expect(isValidPosition({
      rect: baseRect, polygon: [], placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('rect inside polygon → false', () => {
    // Polygon: a square that contains baseRect entirely.
    const polygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ]
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('buffer increases polygon-clearance — nearly-touching rect becomes invalid', () => {
    // Polygon square at (0..40, 0..40); baseRect at (50,50) → 10 units east of polygon.
    const polygon = [
      { x: 0,  y: 0  },
      { x: 40, y: 0  },
      { x: 40, y: 40 },
      { x: 0,  y: 40 },
    ]
    // With buffer=0, rect is 10 units away — no overlap.
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
    // With buffer=15, the buffered polygon expands to (−15..55, −15..55), which
    // now contains baseRect's left edge (x=50). Invalid.
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 15, blockSpacing: 0,
    })).toBe(false)
  })

  test('one placed block, no overlap → valid', () => {
    const placedBlocks = [{ x: 200, y: 200, width: 10, height: 10 }]
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('one placed block, overlapping → false', () => {
    const placedBlocks = [{ x: 55, y: 55, width: 20, height: 10 }] // overlaps baseRect
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('two placed blocks, second overlaps → false (iterates correctly)', () => {
    const placedBlocks = [
      { x: 200, y: 200, width: 10, height: 10 }, // does NOT overlap
      { x: 55,  y: 55,  width: 20, height: 10 }, // DOES overlap
    ]
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('blockSpacing increases required separation — touching becomes overlapping', () => {
    // Block to the immediate right of baseRect, sharing edge at x=70.
    const placedBlocks = [{ x: 70, y: 50, width: 10, height: 10 }]
    // With blockSpacing=0, they touch but don't overlap.
    // rectanglesOverlap uses strict less-than internally — touching IS overlap
    // (consistent with the PDF semantics tested in dxfGeometry.test.js).
    // Verify the strict behavior at blockSpacing=0:
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
    // Move the placed block 5 units further right → 5-unit gap.
    const placedBlocksGap = [{ x: 75, y: 50, width: 10, height: 10 }]
    // With blockSpacing=0, the 5-unit gap is fine.
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: placedBlocksGap, buffer: 0, blockSpacing: 0,
    })).toBe(true)
    // With blockSpacing=10, the 5-unit gap is insufficient.
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: placedBlocksGap, buffer: 0, blockSpacing: 10,
    })).toBe(false)
  })
})

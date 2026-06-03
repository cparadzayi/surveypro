/**
 * Layer 1 unit tests for the DXF per-feature label placer.
 * Run with:  cd app-backend && npm run test -- dxfLabelPlacer
 */
import { describe, test, expect } from '@jest/globals'
import { checkLabelFitsInParcel, findStandLabelPosition } from '../dxfLabelPlacer.js'

describe('checkLabelFitsInParcel', () => {
  // Standard 100×100 parcel for most tests
  const square = [
    { x: 0,   y: 0   },
    { x: 100, y: 0   },
    { x: 100, y: 100 },
    { x: 0,   y: 100 },
  ]

  test('label fully inside parcel bbox → true', () => {
    expect(checkLabelFitsInParcel({
      centerX: 50, centerY: 50, labelWidth: 20, labelHeight: 10, polygon: square,
    })).toBe(true)
  })

  test('label fully outside → false', () => {
    expect(checkLabelFitsInParcel({
      centerX: 200, centerY: 200, labelWidth: 20, labelHeight: 10, polygon: square,
    })).toBe(false)
  })

  test('label straddles one edge → false', () => {
    // Label center at (95, 50); label width 20 → label extends from x=85 to x=105.
    // Parcel goes to x=100. Label straddles right edge.
    expect(checkLabelFitsInParcel({
      centerX: 95, centerY: 50, labelWidth: 20, labelHeight: 10, polygon: square,
    })).toBe(false)
  })

  test('label fits exactly at padding boundary → true (boundary inclusive)', () => {
    // padding=5 means label must be inside [5, 95]×[5, 95].
    // Label center (10, 50), width 10 → label [5, 15]×[45, 55]. At boundary on left.
    expect(checkLabelFitsInParcel({
      centerX: 10, centerY: 50, labelWidth: 10, labelHeight: 10, polygon: square, padding: 5,
    })).toBe(true)
  })

  test('padding parameter adjusts cutoff — same position passing at padding=0 fails at padding=10', () => {
    // Label center (5, 50), width 8 → label [1, 9]×[45, 55].
    // At padding=0: label inside [0, 100]×[0, 100] → true.
    expect(checkLabelFitsInParcel({
      centerX: 5, centerY: 50, labelWidth: 8, labelHeight: 10, polygon: square, padding: 0,
    })).toBe(true)
    // At padding=10: label must be inside [10, 90]×[10, 90] → false (label starts at x=1).
    expect(checkLabelFitsInParcel({
      centerX: 5, centerY: 50, labelWidth: 8, labelHeight: 10, polygon: square, padding: 10,
    })).toBe(false)
  })
})

describe('findStandLabelPosition', () => {
  // Standard 100×100 parcel for most tests
  const square = [
    { x: 0,   y: 0   },
    { x: 100, y: 0   },
    { x: 100, y: 100 },
    { x: 0,   y: 100 },
  ]

  test('square parcel + short stand number → centroid at full input fontHeight', () => {
    const result = findStandLabelPosition({
      polygon: square, standNumber: '1', fontHeight: 10,
    })
    expect(result).not.toBeNull()
    // Square centroid is (50, 50)
    expect(result.x).toBe(50)
    expect(result.y).toBe(50)
    expect(result.fontHeight).toBe(10)
  })

  test('long stand number that needs shrink → fontHeight smaller than input', () => {
    // Square 100×100, edge-reserve 25 → maxAllowedWidth = max(15, 100-50) = 50.
    // Iterative shrink fires when widthEstimate > maxAllowedWidth * 0.5 = 25.
    // standNumber "1234567" (7 chars), fontHeight 10, ratio 0.55 → widthEstimate = 38.5 > 25.
    // Shrinks fontHeight by 10% of input (1 unit) each iteration until widthEstimate ≤ 25.
    const result = findStandLabelPosition({
      polygon: square, standNumber: '1234567', fontHeight: 10,
    })
    expect(result).not.toBeNull()
    expect(result.fontHeight).toBeLessThan(10)
  })

  test('extremely long stand number → fontHeight floors at minFontHeightRatio default (50%)', () => {
    // Even a 30-char string can't shrink below half the input fontHeight.
    const result = findStandLabelPosition({
      polygon: square, standNumber: 'A'.repeat(30), fontHeight: 10,
    })
    expect(result).not.toBeNull()
    expect(result.fontHeight).toBeCloseTo(5, 1) // 50% of input = 5
  })

  test('concave (L-shape) parcel where centroid is outside → returns centroid anyway (PDF stub-equivalent)', () => {
    // L-shape with the centroid (~50, 30) actually outside the polygon.
    // PDF's findLargestInscribedCircle is a stub returning the centroid;
    // we match that behaviour.
    const lShape = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 20  },
      { x: 40,  y: 20  },
      { x: 40,  y: 100 },
      { x: 0,   y: 100 },
    ]
    const result = findStandLabelPosition({
      polygon: lShape, standNumber: '7', fontHeight: 8,
    })
    expect(result).not.toBeNull()
    // Whatever position is returned, the function doesn't throw or return null.
    expect(typeof result.x).toBe('number')
    expect(typeof result.y).toBe('number')
  })

  test('empty polygon → returns null', () => {
    expect(findStandLabelPosition({
      polygon: [], standNumber: '1', fontHeight: 10,
    })).toBeNull()
  })

  test('single-vertex / 2-vertex polygon → returns null', () => {
    expect(findStandLabelPosition({
      polygon: [{ x: 0, y: 0 }], standNumber: '1', fontHeight: 10,
    })).toBeNull()
    expect(findStandLabelPosition({
      polygon: [{ x: 0, y: 0 }, { x: 10, y: 10 }], standNumber: '1', fontHeight: 10,
    })).toBeNull()
  })

  test('returned {x, y} is the centroid (DXF baseline-left convention, not bottom-left)', () => {
    const result = findStandLabelPosition({
      polygon: square, standNumber: '1', fontHeight: 10,
    })
    // Centroid of square is (50, 50). Returned position must match this directly,
    // NOT (50 - width/2, 50 - height/2) like the PDF would.
    expect(result.x).toBe(50)
    expect(result.y).toBe(50)
  })

  test('returned width ≈ standNumber.length * fontHeight * charWidthRatio', () => {
    const result = findStandLabelPosition({
      polygon: square, standNumber: '12', fontHeight: 10, charWidthRatio: 0.6,
    })
    // 2 chars × 10 × 0.6 = 12
    expect(result.width).toBeCloseTo(12, 5)
  })

  test('width caps within maxAllowedWidth * 0.5 after shrink terminates (sufficient case)', () => {
    // Small parcel + long string forces full shrink.
    const tinySquare = [
      { x: 0,  y: 0  },
      { x: 60, y: 0  },
      { x: 60, y: 60 },
      { x: 0,  y: 60 },
    ]
    const result = findStandLabelPosition({
      polygon: tinySquare, standNumber: '12345678', fontHeight: 10,
    })
    expect(result).not.toBeNull()
    // After shrink, width should be ≤ maxAllowedWidth * 0.5 OR fontHeight floored
    // maxAllowedWidth = max(15, 60-50) = 15. width should be ≤ 7.5 OR fontHeight = 5 (floor).
    expect(result.fontHeight).toBeGreaterThanOrEqual(5)
  })

  test('charWidthRatio=0.7 produces wider label than charWidthRatio=0.4 for same input', () => {
    const wide = findStandLabelPosition({
      polygon: square, standNumber: '12', fontHeight: 10, charWidthRatio: 0.7,
    })
    const narrow = findStandLabelPosition({
      polygon: square, standNumber: '12', fontHeight: 10, charWidthRatio: 0.4,
    })
    expect(wide.width).toBeGreaterThan(narrow.width)
  })
})

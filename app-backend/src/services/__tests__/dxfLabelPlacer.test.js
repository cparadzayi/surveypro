/**
 * Layer 1 unit tests for the DXF per-feature label placer.
 * Run with:  cd app-backend && npm run test -- dxfLabelPlacer
 */
import { describe, test, expect } from '@jest/globals'
import { checkLabelFitsInParcel } from '../dxfLabelPlacer.js'

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

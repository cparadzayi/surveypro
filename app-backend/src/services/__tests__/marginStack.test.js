import { describe, test, expect } from '@jest/globals'
import {
  marginStackSlots, endorsementShiftPt, MARGIN_WIDTH_PT, SG_ENDORSEMENT_GAP_PT,
} from '../marginStack.js'

describe('right-margin stack: SG approval box above the endorsements', () => {
  const mapBounds = { x: 100, y: 140, width: 2000, height: 1500 }
  const { sgSignature, endorsement } = marginStackSlots(mapBounds, 200, 110)

  test('both blocks sit in the margin, right of the drawing area', () => {
    expect(sgSignature.x).toBeGreaterThanOrEqual(mapBounds.x + mapBounds.width)
    expect(endorsement.x).toBe(mapBounds.x + mapBounds.width)
  })

  test('the SG box is centred over the endorsement table', () => {
    const sgCentre = sgSignature.x + sgSignature.width / 2
    const endCentre = endorsement.x + endorsement.width / 2
    expect(sgCentre).toBeCloseTo(endCentre, 6)
    expect(endorsement.width).toBe(MARGIN_WIDTH_PT)
  })

  test('the SG box is above the endorsements with a readable gap', () => {
    const gap = endorsement.y - (sgSignature.y + sgSignature.height)
    expect(gap).toBe(SG_ENDORSEMENT_GAP_PT)
    expect(gap).toBeGreaterThanOrEqual(20)       // ~7 mm: visibly separate blocks
    expect(sgSignature.y).toBe(mapBounds.y)      // box starts at the top margin line
  })

  test('the endorsement shift is the box height plus the gap', () => {
    expect(endorsementShiftPt(110)).toBe(110 + SG_ENDORSEMENT_GAP_PT)
    expect(endorsement.y - mapBounds.y).toBe(endorsementShiftPt(110))
  })
})

/**
 * Unit tests for dxfBottomZoneEmitter (sub-project 3-v4).
 * Run:  cd app-backend && npm test -- --testPathPatterns="dxfBottomZoneEmitter"
 */
import { describe, test, expect } from '@jest/globals'
import {
  sizeStatement,
  sizeOFDTable,
  sizeSGBox,
  sizeBeaconDescriptions,
} from '../dxfBottomZoneEmitter.js'

// Identity mm so tests work in raw units (paper-mm == ground-metre).
const mm = (x) => x

// Font heights typical of the integrated generator at S=1000.
const fonts = {
  hBody:   2,
  hSub:    2.5,
  rH:      3,
  ofTitleH: 3,
  ofBodyH:  2.5,
  ofRowH:   4,
  sgTitleH: 3.5,
  sgBodyH:  2.5,
}

describe('sizeStatement', () => {
  test('returns {0,0} when metadata has neither date nor surveyor', () => {
    expect(sizeStatement({}, fonts)).toEqual({ width: 0, height: 0 })
  })

  test('includes only the date row when surveyor absent', () => {
    const result = sizeStatement({ date: '2026-01-01' }, fonts)
    // Single line: "Surveyed in 2026-01-01 by me" — no gap after it.
    expect(result.height).toBeCloseTo(fonts.hBody, 5)
    expect(result.width).toBeGreaterThan(0)
  })

  test('width tracks the longest of the three candidate lines', () => {
    const long = 'X'.repeat(120)
    const result = sizeStatement({ date: '2026', surveyor: long }, fonts)
    // Longest candidate is the surveyor name → width = 120 chars * hBody * 0.55.
    expect(result.width).toBeCloseTo(120 * fonts.hBody * 0.55, 3)
  })
})

describe('sizeOFDTable', () => {
  test('returns {0,0} when edges array is empty', () => {
    expect(sizeOFDTable({ edges: [] }, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeOFDTable({}, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeOFDTable(null, fonts, mm)).toEqual({ width: 0, height: 0 })
  })

  test('height scales linearly with edges.length', () => {
    const one = sizeOFDTable({ edges: [{}] }, fonts, mm)
    const ten = sizeOFDTable({ edges: Array(10).fill({}) }, fonts, mm)
    // Extra 9 rows × ofRowH.
    expect(ten.height - one.height).toBeCloseTo(9 * fonts.ofRowH, 5)
  })

  test('width equals sum(OUTSIDE_FIGURE_DATA.columns[i].width) * PT_TO_MM_GEN', () => {
    const result = sizeOFDTable({ edges: [{}] }, fonts, mm)
    // Columns: 45 + 40 + 70 + 55 + 65 + 70 = 345 pt → 121.7 mm (identity mm).
    const expectedPt = 45 + 40 + 70 + 55 + 65 + 70
    const expectedMM = expectedPt * (25.4 / 72)
    expect(result.width).toBeCloseTo(expectedMM, 3)
  })
})

describe('sizeSGBox', () => {
  test('returns SURVEYOR_GENERAL_BOX dims scaled by PT_TO_MM_GEN', () => {
    const result = sizeSGBox(mm)
    // SURVEYOR_GENERAL_BOX is 200 × 80 pt.
    expect(result.width).toBeCloseTo(200 * (25.4 / 72), 3)
    expect(result.height).toBeCloseTo(80 * (25.4 / 72), 3)
  })
})

describe('sizeBeaconDescriptions', () => {
  test('returns {0,0} when beaconGroups is empty or missing', () => {
    expect(sizeBeaconDescriptions([], fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeBeaconDescriptions(null, fonts, mm)).toEqual({ width: 0, height: 0 })
    expect(sizeBeaconDescriptions(undefined, fonts, mm)).toEqual({ width: 0, height: 0 })
  })

  test('height grows linearly with total beacon row count', () => {
    const small = [{ points: 'A', description: 'iron peg' }]
    const big   = Array(20).fill({ points: 'A', description: 'iron peg' })
    const smallH = sizeBeaconDescriptions(small, fonts, mm).height
    const bigH   = sizeBeaconDescriptions(big,   fonts, mm).height
    // The current addBeaconDescription emits a header + one row per group.
    // big has 19 more rows → height delta = 19 * rH * 1.2.
    expect(bigH - smallH).toBeCloseTo(19 * fonts.rH * 1.2, 3)
  })
})

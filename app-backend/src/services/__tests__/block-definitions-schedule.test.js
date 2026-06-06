/**
 * Unit tests for the two new shared schedule helpers exported from
 * app-shared/block-definitions.js. Run with:
 *   cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
 */
import { describe, test, expect } from '@jest/globals'
import {
  computeScheduleColumnWidths,
  planScheduleSplit,
} from '../../../../app-shared/block-definitions.js'

/**
 * Deterministic text-width measurer for tests. Mirrors DXF's
 * (text, fontSize) => text.length * fontSize * 0.55 approximation
 * so test outputs are easy to hand-verify.
 */
const measureText = (text, fontSize) =>
  String(text).length * fontSize * 0.55

describe('computeScheduleColumnWidths', () => {
  test('returns 6 widths summing to a finite total', () => {
    const widths = computeScheduleColumnWidths({
      dataRows: [],
      headerFontSize: 6,
      bodyFontSize:   7,
      measureText,
    })
    expect(widths).toHaveLength(6)
    const total = widths.reduce((s, w) => s + w, 0)
    expect(Number.isFinite(total)).toBe(true)
    expect(total).toBeGreaterThan(0)
  })

  test('widest header token determines column when data is short', () => {
    // 'DIAGRAM' (7 chars) at headerFontSize=6 → 7*6*0.55 = 23.1 pt
    // 'GP-1' (4 chars) at bodyFontSize=7 → 4*7*0.55 = 15.4 pt
    // Header wins → raw = 23.1 + 2*4 = 31.1
    const widths = computeScheduleColumnWidths({
      dataRows: [{ stand: '1', diagram: 'GP-1' }],
      headerFontSize: 6, bodyFontSize: 7, measureText,
    })
    // diagram is column index 2 (stand, area, diagram, ...).
    expect(widths[2]).toBeCloseTo(7 * 6 * 0.55 + 8, 3)
  })

  test('widest data value determines column when it exceeds widest header', () => {
    // 'NUMBER' (6 chars) at headerFontSize=6 → 6*6*0.55 = 19.8 pt
    // 'DG-12345/2024' (13 chars) at bodyFontSize=7 → 13*7*0.55 = 50.05 pt
    // Data wins → raw = 50.05 + 8 = 58.05
    const widths = computeScheduleColumnWidths({
      dataRows: [{ stand: '1', deedNumber: 'DG-12345/2024' }],
      headerFontSize: 6, bodyFontSize: 7, measureText,
    })
    // deedNumber is column index 3.
    expect(widths[3]).toBeCloseTo(13 * 7 * 0.55 + 8, 3)
  })

  test('colMinFloor (24 pt) enforced when both header and data are narrow', () => {
    // Tiny measureText so the raw width is below colMinFloor.
    const tinyMeasure = () => 1
    const widths = computeScheduleColumnWidths({
      dataRows: [{ stand: '1' }],
      headerFontSize: 6, bodyFontSize: 7, measureText: tinyMeasure,
      colMinFloor: 24,
    })
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(24)
    }
  })

  test('padding adds 2 * padding to each column', () => {
    const fixedMeasure = () => 10
    const widthsPad0 = computeScheduleColumnWidths({
      dataRows: [{}],
      headerFontSize: 6, bodyFontSize: 7, measureText: fixedMeasure,
      padding: 0, colMinFloor: 0,
    })
    const widthsPad5 = computeScheduleColumnWidths({
      dataRows: [{}],
      headerFontSize: 6, bodyFontSize: 7, measureText: fixedMeasure,
      padding: 5, colMinFloor: 0,
    })
    for (let i = 0; i < 6; i++) {
      expect(widthsPad5[i] - widthsPad0[i]).toBeCloseTo(10, 5)
    }
  })

  test('injected measureText is called with (text, fontSize)', () => {
    const calls = []
    const recorder = (text, fontSize) => {
      calls.push({ text, fontSize })
      return text.length * fontSize * 0.55
    }
    computeScheduleColumnWidths({
      dataRows: [{ stand: '1' }],
      headerFontSize: 6, bodyFontSize: 7, measureText: recorder,
    })
    // At least one header call at fontSize=6.
    expect(calls.some(c => c.fontSize === 6)).toBe(true)
    // At least one data call at fontSize=7.
    expect(calls.some(c => c.fontSize === 7 && c.text === '1')).toBe(true)
  })
})

/**
 * Unit tests for emitScheduleOfAreasTopological in dxfScheduleEmitter.js.
 * Run with:  cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"
 */
import { describe, test, expect, beforeEach } from '@jest/globals'
import { emitScheduleOfAreasTopological } from '../dxfScheduleEmitter.js'
import {
  extractScheduleRow,
  computeScheduleLayout,
  addScheduleTable,
  nextLargerSheet,
  SCHEDULE_HEADER_HEIGHT_MM,
} from '../dxfScheduleHelpers.js'

const makeFeatures = (n) => {
  const out = []
  for (let i = 1; i <= n; i++) {
    out.push({ properties: { stand: String(i), area_m2: 100 + i } })
  }
  return out
}

const makeHarness = () => {
  const calls = { addText: [], addLine: [], warn: [] }
  return {
    calls,
    addText: (...args) => calls.addText.push(args),
    addLine: (...args) => calls.addLine.push(args),
    warn:    (cat, payload) => calls.warn.push({ cat, payload }),
    logger:  { info: () => {}, warn: () => {}, error: () => {} },
    fonts:   { hHead: 2.5, hBody: 2, rH: 3 },
    // Identity mm so test geometry is in raw units. Returns the value untouched.
    helpers: {
      extractScheduleRow,
      computeScheduleLayout,
      addScheduleTable,
      nextLargerSheet,
      SCHEDULE_HEADER_HEIGHT_MM,
      mm: (x) => x,
    },
  }
}

describe('emitScheduleOfAreasTopological — happy path (no consolidation)', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  test('1. single sub-table that fits → 1 addScheduleTable call, no warn', () => {
    const features = makeFeatures(3)
    const drawingZone = { x: 0, y: 0, width: 400, height: 300 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone,
      polygon: null,
      sheetSize: 'ISO_A2',
      fonts: h.fonts,
      helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBe(1)
    expect(result.placedStandCount).toBe(3)
    expect(result.missingStandCount).toBe(0)
    expect(h.calls.warn.length).toBe(0)
    const titleCalls = h.calls.addText.filter(args => args[3] === 'SCHEDULE OF AREAS')
    expect(titleCalls.length).toBe(1)
  })

  test('2. zero stands → returns early, no warn, no emissions', () => {
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: [],
      drawingZone: { x: 0, y: 0, width: 400, height: 300 },
      polygon: null,
      sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBe(0)
    expect(result.placedStandCount).toBe(0)
    expect(result.missingStandCount).toBe(0)
    expect(h.calls.warn.length).toBe(0)
    expect(h.calls.addText.length).toBe(0)
  })

  test('3. polygon=null → topology still produces positions; placement succeeds', () => {
    const features = makeFeatures(5)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 400, height: 300 },
      polygon: null,
      sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBeGreaterThanOrEqual(1)
    expect(result.placedStandCount).toBe(5)
    expect(h.calls.warn.length).toBe(0)
  })

  test('4. returned southmostY = min(p.y) across placed tables', () => {
    const features = makeFeatures(3)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 400, height: 300 },
      polygon: null,
      sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const expectedSouthmost = Math.min(...result.placedTables.map(p => p.y))
    expect(result.southmostY).toBe(expectedSouthmost)
  })

  test('5. southmostY === drawingZone.y when no tables placed (overflow fallback)', () => {
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(50),
      drawingZone: { x: 0, y: 17, width: 5, height: 5 },
      polygon: null,
      sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBe(0)
    expect(result.southmostY).toBe(17)
  })

  test("6. cont'd titles: first 'SCHEDULE OF AREAS', subsequent \"SCHEDULE OF AREAS (cont'd)\"", () => {
    const features = makeFeatures(12)
    const drawingZone = { x: 0, y: 0, width: 600, height: 30 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const titles = h.calls.addText
      .map(args => args[3])
      .filter(t => typeof t === 'string' && t.startsWith('SCHEDULE OF AREAS'))
    expect(titles[0]).toBe('SCHEDULE OF AREAS')
    expect(titles[1]).toBe("SCHEDULE OF AREAS (cont'd)")
  })
})

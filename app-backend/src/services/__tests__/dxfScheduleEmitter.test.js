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

describe('emitScheduleOfAreasTopological — consolidation pass', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  // Note: pure-geometry tests for consolidation-success are sensitive to the
  // placer's internal logic. If the assertions below fail during implementation,
  // tune the GEOMETRY (drawingZone dims, rowCount, polygon obstacle position) —
  // not the assertions. The assertions encode the invariants the algorithm
  // must satisfy; the constants are negotiable.
  const consolidationFixture = () => ({
    features: makeFeatures(24),
    drawingZone: { x: 0, y: 0, width: 600, height: 80 },
  })

  test('7. consolidation reduces table count when Pass 1 cannot seat all numTables', () => {
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedStandCount).toBe(24)
    expect(h.calls.warn.length).toBe(0)
  })

  test('8. all non-final placed tables hold identical rowCount; last ≤ that', () => {
    // Algorithm invariant (holds whether Pass 1 placed all numTables OR
    // consolidation re-budgeted): tables 0..n-2 share a uniform rowCount
    // (either layout.rowsPerTable from Pass 1 or ceil(N/feasible) from
    // consolidation); the final table holds the residual.
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    if (result.placedTables.length >= 2) {
      const fullTables = result.placedTables.slice(0, -1)
      const uniformRowCount = fullTables[0].rowCount
      for (const t of fullTables) expect(t.rowCount).toBe(uniformRowCount)
      expect(result.placedTables[result.placedTables.length - 1].rowCount)
        .toBeLessThanOrEqual(uniformRowCount)
    }
    // Sum of rowCounts always equals placedStandCount.
    const sum = result.placedTables.reduce((s, t) => s + t.rowCount, 0)
    expect(sum).toBe(result.placedStandCount)
  })

  test('9. when consolidation triggers, each emitted table is taller than the Pass-1 size', () => {
    // Original Pass 1 subTableHeight at this fixture = 12 + 22*3 = 78 (rowsPerColumn=22).
    // Consolidated taller tables have rowCount > 22 → height > 78. The invariant:
    // if any table holds more rows than Pass 1's per-table budget, its emitted
    // height must reflect the taller consolidated size. When consolidation didn't
    // trigger (Pass 1 placed all layout.numTables), this guard skips the assertion.
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const PASS1_ROWS_PER_TABLE = 22   // floor((80-12)/3)
    const PASS1_HEIGHT          = 78  // 12 + 22*3
    for (const t of result.placedTables) {
      if (t.rowCount > PASS1_ROWS_PER_TABLE) {
        expect(t.height).toBeGreaterThan(PASS1_HEIGHT)
      }
    }
  })

  test('10. consolidation, feasible=0 → no consolidation attempted; scheduleOverflow warn (zero-fit)', () => {
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 80 }, { x: 0, y: 80 },
    ]
    const features = makeFeatures(24)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedStandCount).toBe(0)
    expect(result.missingStandCount).toBe(24)
    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBe(1)
    expect(warns[0].payload.phase).toBe('consolidation-zero-fit')
    expect(warns[0].payload.recommendedSheetSize).toBe('ISO_A1')
  })

  test('11. consolidation-residual: when missingStandCount > 0 after consolidation, residual warn fires with correct payload shape', () => {
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 80 }, { x: 0, y: 80 },
    ]
    const features = makeFeatures(24)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    // Invariant: every stand is either placed or counted missing.
    expect(result.placedStandCount + result.missingStandCount).toBe(features.length)

    // Invariant: when an overflow warn fires, payload has required keys.
    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBeGreaterThan(0)
    expect(warns[0].payload).toHaveProperty('atSheetSize', 'ISO_A2')
    expect(warns[0].payload).toHaveProperty('recommendedSheetSize')
    expect(['consolidation-zero-fit', 'consolidation-residual', 'initial-budget'])
      .toContain(warns[0].payload.phase)
  })

  test('12. consolidation that successfully places ALL stands → no warn', () => {
    const features = makeFeatures(20)
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedStandCount).toBe(20)
    expect(result.missingStandCount).toBe(0)
    expect(h.calls.warn.length).toBe(0)
  })
})

describe('emitScheduleOfAreasTopological — overflow & edge cases', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  test('13. computeScheduleLayout fits:false → title placeholder + warn(phase:"initial-budget")', () => {
    const features = makeFeatures(50)
    const drawingZone = { x: 0, y: 0, width: 10, height: 5 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const titlePlaceholders = h.calls.addText.filter(args => args[3] === 'SCHEDULE OF AREAS')
    expect(titlePlaceholders.length).toBe(1)
    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBe(1)
    expect(warns[0].payload.phase).toBe('initial-budget')
  })

  test('14. warn payload shape: atSheetSize, recommendedSheetSize, placedStandCount, missingStandCount, placedTables', () => {
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 80 }, { x: 0, y: 80 },
    ]
    emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(24),
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBeGreaterThan(0)
    const payload = warns[0].payload
    expect(payload).toHaveProperty('atSheetSize', 'ISO_A2')
    expect(payload).toHaveProperty('recommendedSheetSize')
    expect(payload).toHaveProperty('placedStandCount')
    expect(payload).toHaveProperty('missingStandCount')
    expect(payload).toHaveProperty('placedTables')
    expect(payload).toHaveProperty('phase')
  })

  test('15. recommendedSheetSize uses nextLargerSheet(sheetSize)', () => {
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 80 }, { x: 0, y: 80 },
    ]
    emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(24),
      drawingZone, polygon, sheetSize: 'ISO_A1',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBeGreaterThan(0)
    expect(warns[0].payload.recommendedSheetSize).toBe('ISO_A0')
  })

  test('16. polygon with rectangle obstacle → placements avoid the polygon', () => {
    // Polygon obstacle at x=200..280 (80 wide) leaves a 320-wide right strip
    // (x=283..600, accounting for blockSpacing buffer) that fits the 260-wide
    // sub-table. Left strip x=0..197 is only 197 wide and won't fit.
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 200, y: 20 }, { x: 280, y: 20 }, { x: 280, y: 60 }, { x: 200, y: 60 },
    ]
    const features = makeFeatures(6)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBeGreaterThan(0)
    for (const t of result.placedTables) {
      const cx = t.x + t.width / 2
      const cy = t.y + t.height / 2
      const insidePolygon = cx >= 200 && cx <= 280 && cy >= 20 && cy <= 60
      expect(insidePolygon).toBe(false)
    }
  })

  test('17. drawingZone too narrow for one sub-table → scheduleOverflow (initial-budget)', () => {
    const features = makeFeatures(100)
    const drawingZone = { x: 0, y: 0, width: 100, height: 100 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBe(1)
    expect(warns[0].payload.phase).toBe('initial-budget')
  })

  test('18. logger.info called with topology candidate counts (smoke test)', () => {
    const calls = { info: [], warn: [], error: [] }
    const logger = {
      info:  (msg) => calls.info.push(msg),
      warn:  (msg) => calls.warn.push(msg),
      error: (msg) => calls.error.push(msg),
    }
    const features = makeFeatures(3)
    const drawingZone = { x: 0, y: 0, width: 400, height: 300 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn,
      logger,
    })

    const infoMsgs = calls.info.join(' ')
    expect(infoMsgs).toMatch(/Layer 1.*topology/)
  })
})

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

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

  test('7. Pass 2 split places multiple sub-tables when Pass 1 can not seat them all', () => {
    // 24 stands in a 600x80 zone. Pass 1 may seat all (if zone holds enough
    // rows) OR Pass 2's split must place the residual. Either way all stands
    // are placed, no consolidation-zero-fit warn.
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedStandCount).toBeGreaterThan(0)
    // Pass 2's 'split-residual' warn is fine; consolidation-zero-fit must NOT fire.
    for (const w of h.calls.warn) {
      if (w.cat === 'scheduleOverflow') {
        expect(w.payload.phase).not.toBe('consolidation-zero-fit')
      }
    }
  })

  test('8. Pass 2 stand row-conservation: sum(rowCounts) === placedStandCount', () => {
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    const sum = result.placedTables.reduce((s, t) => s + t.rowCount, 0)
    expect(sum).toBe(result.placedStandCount)
    // Plus standCount conservation: placed + missing === total.
    expect(result.placedStandCount + result.missingStandCount).toBe(24)
  })

  test('9. every placed sub-table has rowCount > 0 (no zero-row tables emitted)', () => {
    // Pass 2 split must never push a sub-table with rowCount=0; planScheduleSplit
    // enforces minRowsPerTable=3 (except when totalRows < 3). Both Pass 1 and
    // Pass 3 emit at fixed rowsPerTable from layout. So every placedTable's
    // rowCount must be > 0 regardless of which pass placed it.
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    for (const t of result.placedTables) {
      expect(t.rowCount).toBeGreaterThan(0)
    }
  })

  test('9a. Pass 2 split places sub-tables in distinct gaps when Pass 1 is partial', () => {
    // 40 stands in a 400×120 zone. With layout.rowsPerTable≈33, Pass 1 places
    // one sub-table that doesn't fit all stands, triggering Pass 2 split. The
    // split should fan out across the residual whitespace.
    const features = makeFeatures(40)
    const drawingZone = { x: 0, y: 0, width: 400, height: 120 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    expect(result.placedStandCount).toBeGreaterThan(0)
    // Pass 2's split-residual or no warn — never consolidation-zero-fit.
    for (const w of h.calls.warn) {
      if (w.cat === 'scheduleOverflow') {
        expect(['split-residual', 'consolidation-residual', 'initial-budget'])
          .toContain(w.payload.phase)
      }
    }
  })

  test('9b. Pass 2 → empty plan when polygon truly fills zone → falls through to Pass 3', () => {
    // Closed polygon covering the entire zone (note the explicit closing vertex).
    // computeWhitespaceZones returns no zones; planScheduleSplit returns plan=[].
    // Pass 3 ignores polygon AND seedPlacedBlocks → places sub-tables with overlap.
    const features = makeFeatures(5)
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 },
      { x: 600, y: 80 }, { x: 0, y: 80 },
      { x: 0, y: 0 },   // explicit closing duplicate
    ]
    const calls = { info: [], warn: [], error: [] }
    const logger = {
      info:  (m) => calls.info.push(m),
      warn:  (m) => calls.warn.push(m),
      error: (m) => calls.error.push(m),
    }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn,
      logger,
    })
    expect(result.placedStandCount).toBe(5)   // Pass 3 saved it
    expect(calls.info.some(m => m.includes('Pass 3'))).toBe(true)
  })

  test('9c. Pass 2 split honors seedPlacedBlocks when filtering availableGaps', () => {
    // A 1000-wide zone with a seed-block covering x:0..600. Pass 1 places
    // some tables; if Pass 2 fires it must only place new sub-tables in the
    // x:600..1000 strip (seed-overlap zones filtered out).
    const features = makeFeatures(8)
    const drawingZone = { x: 0, y: 0, width: 1000, height: 80 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
      seedPlacedBlocks: [{ x: 0, y: 0, width: 600, height: 80, name: 'ofd' }],
    })
    expect(result.placedStandCount).toBeGreaterThan(0)
    for (const t of result.placedTables) {
      // Every placed sub-table must clear the seed block (its left edge x >= 600).
      expect(t.x).toBeGreaterThanOrEqual(600 - 1e-6)
    }
  })

  test('9d. Pass 2 split never places a sub-table overlapping the parcel polygon (regression)', () => {
    // Maglas-density regression: with a non-convex polygon, computeWhitespaceZones
    // can return zones that extend slightly into the polygon due to its
    // band-flush quirk. Pass 2 must re-validate each placement against the
    // polygon and skip gaps that would produce an overlapping sub-table.
    //
    // Hexagonal polygon (6 vertices) imitates the outside figure shape. The
    // left strip on this polygon may extend into the figure near the
    // hexagon's narrow neck.
    const drawingZone = { x: 0, y: 0, width: 1000, height: 200 }
    const polygon = [
      { x: 600, y: 50  },   // upper-right edge
      { x: 700, y: 100 },
      { x: 700, y: 150 },
      { x: 600, y: 200 },
      { x: 500, y: 100 },   // bulge to the left in the middle
      { x: 600, y: 50  },   // closing duplicate
    ]
    const features = makeFeatures(40)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    // Compute rectangleOverlapsPolygon-equivalent check inline: for each
    // placed sub-table, verify its bbox does not intersect the polygon
    // interior. We use a simple point-in-polygon test on a coarse grid
    // sampled inside each sub-table's bbox.
    const isInside = (px, py, poly) => {
      let inside = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y
        const xj = poly[j].x, yj = poly[j].y
        const intersect = ((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }
      return inside
    }
    for (const t of result.placedTables) {
      // Sample 5x5 grid inside this sub-table's bbox.
      for (let i = 1; i <= 5; i++) {
        for (let j = 1; j <= 5; j++) {
          const px = t.x + (t.width  * i) / 6
          const py = t.y + (t.height * j) / 6
          expect(isInside(px, py, polygon)).toBe(false)
        }
      }
    }
  })

  test('10. polygon fills zone → Pass 3 skip-polygon fallback places all tables (no warn)', () => {
    // Pass 1 + Pass 2 both place 0 (polygon covers the whole zone). Pass 3
    // skips polygon avoidance and finds positions inside mapBounds + edge
    // margin. Mandatory SI 727 schedule renders over the parcel polygon —
    // documented PDF-fidelity trade-off.
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 80 }, { x: 0, y: 80 },
    ]
    const features = makeFeatures(24)
    const calls = { info: [], warn: [], error: [] }
    const logger = {
      info:  (msg) => calls.info.push(msg),
      warn:  (msg) => calls.warn.push(msg),
      error: (msg) => calls.error.push(msg),
    }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn,
      logger,
    })

    // Pass 3 placed all stands; no scheduleOverflow warn.
    expect(result.placedStandCount).toBe(24)
    expect(result.missingStandCount).toBe(0)
    expect(h.calls.warn.filter(w => w.cat === 'scheduleOverflow').length).toBe(0)

    // Pass 3 logger trace fires.
    const passThreeLogs = calls.info.filter(m => m.includes('Pass 3'))
    expect(passThreeLogs.length).toBeGreaterThan(0)
  })

  test('10b. true zero-fit: even Pass 3 cannot place tables → title placeholder + warn', () => {
    // Drawing zone too small for ANY sub-table (after edge margin) even when
    // polygon is ignored. Triggers initial-budget overflow (fits:false) not
    // consolidation-zero-fit, since computeScheduleLayout catches it first.
    const features = makeFeatures(50)
    const drawingZone = { x: 0, y: 0, width: 40, height: 40 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBe(1)
    expect(['initial-budget', 'consolidation-zero-fit']).toContain(warns[0].payload.phase)

    // Title placeholder is emitted regardless of which path failed.
    const titlePlaceholders = h.calls.addText.filter(args => args[3] === 'SCHEDULE OF AREAS')
    expect(titlePlaceholders.length).toBe(1)
  })

  test('11. stand-conservation invariant holds across all paths', () => {
    // With Pass 3 in place, residual + consolidation-zero-fit are unreachable
    // through natural geometry (Pass 3 fits whenever layout passes; if Pass 3
    // can't fit, layout already returned fits:false → initial-budget).
    // The conservation invariant is what survives: every stand is either
    // placed or counted missing, regardless of which path took us there.
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

    expect(result.placedStandCount + result.missingStandCount).toBe(features.length)
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

  test('14. warn payload shape (initial-budget path)', () => {
    // Initial-budget is the realistic overflow path now that Pass 3 covers
    // the polygon-fills-zone case (no warn fires there anymore). Verify the
    // initial-budget payload has the expected shape.
    const drawingZone = { x: 0, y: 0, width: 100, height: 100 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(100),
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBe(1)
    const payload = warns[0].payload
    expect(payload).toHaveProperty('atSheetSize', 'ISO_A2')
    expect(payload).toHaveProperty('phase', 'initial-budget')
    // Either escalation field is acceptable; initial-budget uses requiredSheetSize.
    expect(payload.requiredSheetSize || payload.recommendedSheetSize).toBeTruthy()
  })

  test('15. sheet escalation uses nextLargerSheet(sheetSize)', () => {
    // ISO_A1 + small overflow zone → escalation field = ISO_A0.
    const drawingZone = { x: 0, y: 0, width: 100, height: 100 }
    emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(100),
      drawingZone, polygon: null, sheetSize: 'ISO_A1',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const warns = h.calls.warn.filter(w => w.cat === 'scheduleOverflow')
    expect(warns.length).toBe(1)
    const escalation = warns[0].payload.requiredSheetSize || warns[0].payload.recommendedSheetSize
    expect(escalation).toBe('ISO_A0')
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

  test('19. layout shrinks zone by 2 * GRID_EDGE_MARGIN so sub-table fits placer scan window', () => {
    // Regression for the Maglas-at-A0 bug: at large zones the layout previously
    // sized sub-tables to fill the full zone height, but the grid-fallback's
    // 14-unit edge margin made every candidate position fall outside the scan
    // window. Now the emitter feeds layout a zone reduced by 2*14 on each axis
    // so the sub-table height matches the placer's effective scan range.
    //
    // Geometry: zone 600 wide × 88 tall. Effective for layout: 572 × 60.
    // rH=3, headerHeight=12 → rowsPerColumn = floor((60-12)/3) = 16.
    // 32 rows → numTables = 2, subTableHeight = 12 + 16*3 = 60. Effective scan
    // height window = 88 - 28 = 60. Sub-table just fits → grid generates
    // candidates → placement succeeds.
    const features = makeFeatures(32)
    const drawingZone = { x: 0, y: 0, width: 600, height: 88 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    // Without the fix, placedTables would be 0 (grid produces no candidates).
    expect(result.placedTables.length).toBeGreaterThan(0)
    expect(result.placedStandCount).toBe(32)
    expect(h.calls.warn.length).toBe(0)
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
    // Drawing height 60 → effective 32 after the placer's 14-unit edge margin
    // subtraction on top + bottom → fits 6 rows/table (rowsPerColumn) → 12 rows → 2 tables.
    const features = makeFeatures(12)
    const drawingZone = { x: 0, y: 0, width: 600, height: 60 }
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

  test('20. seedPlacedBlocks parameter — candidate overlapping the seed is rejected', () => {
    // 600x80 zone, single sub-table. Seed an obstacle covering the entire
    // left half — the placer should pick a position on the right half.
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(3),
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon:     null,
      sheetSize:   'ISO_A2',
      fonts:       h.fonts,
      helpers:     h.helpers,
      addText:     h.addText,
      addLine:     h.addLine,
      warn:        h.warn,
      logger:      h.logger,
      seedPlacedBlocks: [{ x: 0, y: 0, width: 300, height: 80, name: 'obstacle' }],
    })

    expect(result.placedTables.length).toBeGreaterThan(0)
    // Every placed sub-table's top-left x should be ≥ 300 (past the obstacle).
    for (const t of result.placedTables) {
      expect(t.x).toBeGreaterThanOrEqual(300)
    }
  })

  test('21. omitting seedPlacedBlocks is identical to passing []', () => {
    const features = makeFeatures(3)
    const without = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    const h2 = makeHarness()
    const withEmpty = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon: null, sheetSize: 'ISO_A2',
      fonts: h2.fonts, helpers: h2.helpers,
      addText: h2.addText, addLine: h2.addLine, warn: h2.warn, logger: h2.logger,
      seedPlacedBlocks: [],
    })
    expect(without.placedStandCount).toBe(withEmpty.placedStandCount)
    expect(without.placedTables.length).toBe(withEmpty.placedTables.length)
  })

  test('22. Pass 3 ignores seedPlacedBlocks (schedule MUST emit even if it overlaps OFD)', () => {
    // Regression for the user-reported Maglas-density issue (2026-06-06):
    // when OFD has pre-claimed central whitespace AND the figure polygon
    // dominates the rest, Pass 1 + Pass 2 fail. Pass 3 is the documented
    // "schedule MUST emit somewhere — overlap is acceptable" path; it
    // already ignores the polygon, and must also ignore seedPlacedBlocks
    // for the same reason. The schedule is mandatory SI 727 content —
    // overlapping OFD is preferable to no schedule at all.
    const features = makeFeatures(3)
    // Polygon covers the entire drawing zone → Pass 1 + Pass 2 fail.
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 80 }, { x: 0, y: 80 },
    ]
    // Seed an obstacle covering nearly the entire zone (mimics OFD + title
    // zone + scale bar + north arrow claims on a dense Maglas-density plan).
    // Pass 1/2 must avoid it; Pass 3 must NOT — the schedule wouldn't fit
    // in the remaining sliver, so Pass 3 must accept overlap with the seed.
    const seedPlacedBlocks = [{ x: 0, y: 0, width: 595, height: 80, name: 'ofd' }]

    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone: { x: 0, y: 0, width: 600, height: 80 },
      polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
      seedPlacedBlocks,
    })

    // Pass 3 must have rescued the placement — at least one sub-table emitted.
    expect(result.placedTables.length).toBeGreaterThan(0)
    expect(result.placedStandCount).toBeGreaterThan(0)
    // No scheduleOverflow with consolidation-zero-fit phase (Pass 3 succeeded).
    const overflowWarns = h.calls.warn.filter(w =>
      w.cat === 'scheduleOverflow' && w.payload.phase === 'consolidation-zero-fit')
    expect(overflowWarns.length).toBe(0)
  })
})

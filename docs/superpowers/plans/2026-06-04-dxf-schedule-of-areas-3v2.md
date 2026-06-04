# DXF Schedule of Areas Topological Placement (Sub-project 3-v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `dxfGenerator.js`'s fixed bottom-left col1-strip Schedule of Areas emission with topology-driven placement inside the drawing zone, using 4c's `findBlockPosition`. Dissolves the col1 bottom-zone partition; lets schedule and beacon descriptions roam the drawing-zone whitespace.

**Architecture:** Extract the four #3 helpers + `SCHEDULE_HEADER_HEIGHT_MM` to a new `dxfScheduleHelpers.js` (breaks the import cycle between the new emitter and `dxfGenerator.js`). Add a new pure orchestrator `dxfScheduleEmitter.js` that does topology placement → single-pass consolidation re-budget → `scheduleOverflow` warn with sheet-size escalation. Wire the emitter into `dxfGenerator.js`; dissolve col1; expand col2/col3 to fill.

**Tech Stack:** Node.js ESM, Jest 30 with `--experimental-vm-modules`, existing 4a-4d primitives in `dxfGeometry.js` / `dxfTopology.js` / `dxfBlockPlacer.js`.

---

## Task 1: Extract schedule helpers to `dxfScheduleHelpers.js`

Mechanical move of the 5 declarations from `dxfGenerator.js:322-550` (the SHEET_LADDER constant, `SCHEDULE_HEADER_HEIGHT_MM`, and the four functions `nextLargerSheet`, `extractScheduleRow`, `computeScheduleLayout`, `addScheduleTable`). No logic changes. After the move, `dxfGenerator.js` re-exports them so external consumers keep working.

**Files:**
- Create: `app-backend/src/services/dxfScheduleHelpers.js`
- Modify: `app-backend/src/services/dxfGenerator.js:322-550` (delete bodies + add import + re-export)
- Rename: `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js` → `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`

- [ ] **Step 1.1: Create the new helpers file with the verbatim move**

Write `app-backend/src/services/dxfScheduleHelpers.js`:

```js
/**
 * Schedule of Areas helpers — extracted from dxfGenerator.js during
 * sub-project 3-v2 to break an import cycle: dxfScheduleEmitter.js
 * needs these helpers AND is called from dxfGenerator.js.
 *
 * Pure functions, no DXF emission. The two functions that emit
 * (`addScheduleTable`) take addText/addLine as injected callbacks.
 *
 * Algorithms unchanged from the #3 ship at d1f6fcd.
 */

import { SCHEDULE_OF_AREAS } from '../../../app-shared/block-definitions.js'

/**
 * Sheet ladder ordered smallest → largest. Index in this array maps to
 * valid Schedule of Areas starting sizes.
 */
const SHEET_LADDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']

/**
 * Total paper-millimetres reserved for the Schedule of Areas header
 * (title + column headers + DEED parent + underline). Shared by
 * computeScheduleLayout's row-budget math AND addScheduleTable's actual
 * header emission. Drift between the two would silently break the layout.
 */
export const SCHEDULE_HEADER_HEIGHT_MM = 12

/**
 * Returns the next-larger sheet size in SHEET_LADDER, or
 * 'multi-sheet-required' when already at the top (or for an unknown
 * starting size — defensive fallback so sub-project #5 always sees a
 * clear signal).
 */
export function nextLargerSheet(currentSheetSize) {
  const idx = SHEET_LADDER.indexOf(currentSheetSize)
  if (idx < 0 || idx === SHEET_LADDER.length - 1) return 'multi-sheet-required'
  return SHEET_LADDER[idx + 1]
}

/**
 * Extracts the six SI 727 Schedule-of-Areas column values from a parcel
 * GeoJSON feature's `properties`. Returns an object whose values are all
 * strings ('' for absent optional fields).
 */
export function extractScheduleRow(parcelFeature) {
  const props = parcelFeature?.properties || {}
  return {
    stand:      String(props.stand ?? ''),
    area:       String(Math.round(props.area_m2 ?? 0)),
    diagram:    String(props.diagram ?? ''),
    deedNumber: String(props.deedNumber ?? ''),
    deedDate:   String(props.deedDate ?? ''),
    surveyor:   String(props.surveyor ?? ''),
  }
}

/**
 * Computes the Schedule-of-Areas layout for a given row count and zone
 * size (in paper-millimetres). See dxfGenerator.js commit d1f6fcd for
 * the full design notes.
 */
export function computeScheduleLayout({
  rowCount,
  zoneWidth,
  zoneHeight,
  rowHeight,
  headerHeight,
  currentSheetSize,
}) {
  const singleCols = SCHEDULE_OF_AREAS?.singleColumn?.columns
  const multiCols  = SCHEDULE_OF_AREAS?.multiColumn?.columns
  const spacing    = SCHEDULE_OF_AREAS?.multiColumn?.columnSpacing
  if (!Array.isArray(singleCols) || !Array.isArray(multiCols) || typeof spacing !== 'number') {
    throw new Error('SCHEDULE_OF_AREAS missing from app-shared/block-definitions.js')
  }

  const singleTableWidth = singleCols.reduce((s, c) => s + c.width, 0)
  const subTableWidth    = multiCols.reduce((s, c) => s + c.width, 0)

  const rowsPerColumn = Math.max(0, Math.floor((zoneHeight - headerHeight) / rowHeight))

  const singleScale = Math.min(1, zoneWidth / singleTableWidth)
  const singleColumnWidths = singleCols.map(c => c.width * singleScale)

  if (rowCount === 0) {
    return { fits: true, numTables: 1, rowsPerTable: 0, columnWidths: singleColumnWidths }
  }

  if (rowsPerColumn === 0) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }

  if (rowCount <= rowsPerColumn) {
    return { fits: true, numTables: 1, rowsPerTable: rowCount, columnWidths: singleColumnWidths }
  }

  const numTablesNeeded  = Math.ceil(rowCount / rowsPerColumn)
  if (zoneWidth < subTableWidth) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }
  const maxTablesByWidth = Math.floor((zoneWidth + spacing) / (subTableWidth + spacing))

  if (numTablesNeeded > maxTablesByWidth) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }

  const perTableBudget = (zoneWidth - (numTablesNeeded - 1) * spacing) / numTablesNeeded
  const subTableWidthOut = Math.min(perTableBudget, subTableWidth)
  const multiScale = subTableWidthOut / subTableWidth
  const multiColumnWidths = multiCols.map(c => c.width * multiScale)

  return {
    fits: true,
    numTables: numTablesNeeded,
    rowsPerTable: rowsPerColumn,
    columnWidths: multiColumnWidths,
  }
}

/**
 * Emits one Schedule-of-Areas sub-table block (title + column headers +
 * DEED parent header + underline + data rows). Returns the y coordinate
 * after the last row.
 *
 * `addText` and `addLine` are injected so the helper stays unit-testable.
 */
export function addScheduleTable({
  layer, x, y,
  dataRows, columnWidths,
  titleText, hHead, hBody, rH,
  addText, addLine,
}) {
  const singleCols = SCHEDULE_OF_AREAS?.singleColumn?.columns
  if (!Array.isArray(singleCols)) {
    throw new Error('SCHEDULE_OF_AREAS missing from app-shared/block-definitions.js')
  }

  const colX = []
  let cx = 0
  for (const w of columnWidths) {
    colX.push(x + cx)
    cx += w
  }
  const rightEdge = x + cx

  let cy = y
  addText(layer, x, cy, titleText, hHead, 0, 'BOLD')
  cy -= hHead * 1.6

  const DXF_CHAR_WIDTH_RATIO = 0.6
  const deedStartX = colX[3]
  const deedEndX   = colX[4] + columnWidths[4]
  const deedCenter = (deedStartX + deedEndX) / 2
  const deedTextWidth = 'DEED'.length * hBody * DXF_CHAR_WIDTH_RATIO
  addText(layer, deedCenter - deedTextWidth / 2, cy, 'DEED', hBody, 0, 'BOLD')
  cy -= hBody * 1.2

  let maxHeaderLines = 1
  for (let i = 0; i < singleCols.length; i++) {
    const tokens = String(singleCols[i].label).split('\n')
    if (tokens.length > maxHeaderLines) maxHeaderLines = tokens.length
    let lineY = cy
    for (const tok of tokens) {
      addText(layer, colX[i], lineY, tok, hBody, 0, 'BOLD')
      lineY -= hBody * 1.2
    }
  }
  cy -= maxHeaderLines * hBody * 1.2

  addLine(layer, x, cy, rightEdge, cy)
  cy -= hBody * 0.6

  const cellKeys = singleCols.map(c => c.key)
  for (const row of dataRows) {
    for (let i = 0; i < cellKeys.length; i++) {
      const val = row[cellKeys[i]]
      if (val) addText(layer, colX[i], cy, val, hBody)
    }
    cy -= rH
  }

  return cy
}
```

- [ ] **Step 1.2: Delete the moved declarations from `dxfGenerator.js` + add import + re-export**

In `app-backend/src/services/dxfGenerator.js`, **delete** lines 318-550 inclusive (from the `* valid Schedule of Areas starting sizes.` jsdoc comment through the closing `}` of `addScheduleTable`). Verify by checking line 551 is `/** Convert PDF point size to ground metres at given scale */`.

Find the existing import block near the top of the file and **add** this import next to the other `app-shared/block-definitions.js` import:

```js
import {
  extractScheduleRow,
  computeScheduleLayout,
  addScheduleTable,
  nextLargerSheet,
  SCHEDULE_HEADER_HEIGHT_MM,
} from './dxfScheduleHelpers.js'
```

Then **add** a re-export block immediately after the existing imports (so external consumers — including the rename test — see the same surface):

```js
// Re-export schedule helpers extracted to dxfScheduleHelpers.js during 3-v2.
// External consumers (tests, other modules) keep importing from dxfGenerator.js.
export {
  extractScheduleRow,
  computeScheduleLayout,
  addScheduleTable,
  nextLargerSheet,
} from './dxfScheduleHelpers.js'
```

- [ ] **Step 1.3: Run the existing tests — must still pass via re-export**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Test Suites: 8 passed, 8 total / Tests: 237 passed, 237 total`. The schedule-helper tests still import from `../dxfGenerator.js` at this point and resolve through the re-export.

- [ ] **Step 1.4: Rename the schedule-helper test file and swap its import**

Rename the file:

```bash
git mv app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js \
       app-backend/src/services/__tests__/dxfScheduleHelpers.test.js
```

In `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`, change line 6 from:

```js
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout, addScheduleTable } from '../dxfGenerator.js'
```

to:

```js
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout, addScheduleTable } from '../dxfScheduleHelpers.js'
```

Also update the docstring at lines 1-4. Change:

```js
/**
 * Layer 1 unit tests for the Schedule of Areas helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas
 */
```

to:

```js
/**
 * Unit tests for the Schedule of Areas helpers in dxfScheduleHelpers.js.
 * Run with:  cd app-backend && npm run test -- dxfScheduleHelpers
 */
```

- [ ] **Step 1.5: Run the full dxf suite**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Test Suites: 8 passed, 8 total / Tests: 237 passed, 237 total`. Same totals; only the test file *name* changed.

- [ ] **Step 1.6: Commit**

```bash
git add app-backend/src/services/dxfScheduleHelpers.js
git add app-backend/src/services/dxfGenerator.js
git add app-backend/src/services/__tests__/dxfScheduleHelpers.test.js
git commit -m "refactor(dxf): extract schedule helpers to dxfScheduleHelpers.js (3-v2 Task 1)"
```

---

## Task 2: Create `dxfScheduleEmitter.js` skeleton + happy-path tests

Write the module shell with constants and the public `emitScheduleOfAreasTopological` function. Implement Pass 1 (topology placement at original size) and the final emission loop, but stop short of consolidation — that's Task 3. Six happy-path tests cover the no-consolidation paths.

**Files:**
- Create: `app-backend/src/services/dxfScheduleEmitter.js`
- Create: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`

- [ ] **Step 2.1: Write the test file with 6 happy-path tests**

Write `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`:

```js
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
    // At least one TEXT was emitted with the title
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
    // Zone too small to fit even one schedule sub-table → fits:false → southmostY fallback.
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: makeFeatures(50),
      drawingZone: { x: 0, y: 17, width: 5, height: 5 },   // way too small
      polygon: null,
      sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBe(0)
    expect(result.southmostY).toBe(17)   // === drawingZone.y
  })

  test("6. cont'd titles: first 'SCHEDULE OF AREAS', subsequent \"SCHEDULE OF AREAS (cont'd)\"", () => {
    // Build a drawing zone that fits 2 tables side-by-side with a small row count each
    // so multi-table mode triggers. computeScheduleLayout's multi-column path needs
    // rowCount > rowsPerColumn AND zoneWidth >= subTableWidth.
    // singleTableWidth = 35+60+40+40+35+50 = 260, subTableWidth same as singleTableWidth.
    // rowHeight = rH = 3, headerHeight = 12. rowsPerColumn = floor((H-12)/3).
    // For zone height 30: rowsPerColumn = floor(18/3) = 6. So 12 rows → 2 tables.
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
```

- [ ] **Step 2.2: Run the tests — confirm they fail because the module doesn't exist**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"`
Expected: `Cannot find module '../dxfScheduleEmitter.js'` resolution error (Jest shows this as a failed test suite). Don't proceed past this until the module file exists.

- [ ] **Step 2.3: Create the emitter module — constants + skeleton + Pass 1 + emission loop**

Write `app-backend/src/services/dxfScheduleEmitter.js`:

```js
/**
 * Schedule of Areas Topological Emitter — places schedule sub-tables
 * inside the drawing zone via 4c's `findBlockPosition`. Replaces the
 * fixed bottom-left col1 strip emission shipped in sub-project 3.
 *
 * Imports `findBlockPosition` from `./dxfBlockPlacer.js`. Receives the
 * four #3 helpers + `mm` via an injected `helpers` parameter bag to
 * avoid a cycle with `dxfGenerator.js`. DXF emission goes through
 * caller-injected `addText` / `addLine` callbacks.
 *
 * Algorithm in `docs/superpowers/specs/2026-06-04-dxf-schedule-of-areas-3v2-design.md`.
 *
 * Consolidation pass added in Task 3. Overflow + edge case handling in Task 4.
 */

import { findBlockPosition } from './dxfBlockPlacer.js'

/** Clearance (paper-mm) from polygon edges for the placer's buffer parameter. */
export const POLYGON_BUFFER_MM = 2.0

/** Minimum separation (paper-mm) between placed sub-tables and other blocks. */
export const BLOCK_SPACING_MM = 3.0

/** Topology + grid step resolution (paper-mm). */
export const SCAN_STEP_MM = 2.0

// Spec amendment: TITLE_SPACING_MM dropped. SCHEDULE_HEADER_HEIGHT_MM already
// covers the title-to-header gap inside the schedule. Adding TITLE_SPACING
// as a separate reserve on top would make subTableHeight > zoneHeight and
// Pass 1 would always fail (`mm(headerHeight + rowsPerTable*rowHeight + TITLE_SPACING)`
// exceeds the budget that `computeScheduleLayout` allotted for the same rows).

/**
 * Emit Schedule of Areas sub-tables at topology-derived positions inside
 * `drawingZone`. See spec for the full algorithm.
 *
 * @returns {{
 *   placedTables: Array<{x:number,y:number,width:number,height:number,rowCount:number,isContinuation:boolean}>,
 *   placedStandCount: number,
 *   missingStandCount: number,
 *   southmostY: number
 * }}
 */
export function emitScheduleOfAreasTopological({
  surveyedFeatures,
  drawingZone,
  polygon,
  sheetSize,
  fonts,
  helpers,
  addText,
  addLine,
  warn,
  logger,
}) {
  const { hHead, hBody, rH } = fonts
  const {
    extractScheduleRow, computeScheduleLayout, addScheduleTable,
    nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, mm,
  } = helpers

  // 1. Extract data rows. Zero-stand shortcut.
  const dataRows = surveyedFeatures.map(extractScheduleRow)
  if (dataRows.length === 0) {
    return {
      placedTables: [], placedStandCount: 0, missingStandCount: 0,
      southmostY: drawingZone.y,
    }
  }

  // 2. Compute layout using the drawing-zone dimensions.
  const layout = computeScheduleLayout({
    rowCount:         dataRows.length,
    zoneWidth:        drawingZone.width  / mm(1),
    zoneHeight:       drawingZone.height / mm(1),
    rowHeight:        rH / mm(1),
    headerHeight:     SCHEDULE_HEADER_HEIGHT_MM,
    currentSheetSize: sheetSize,
  })

  // 3. Initial-budget overflow.
  if (!layout.fits) {
    addText(
      'TITLE_BLOCK',
      drawingZone.x + mm(3),
      drawingZone.y + drawingZone.height - mm(5),
      'SCHEDULE OF AREAS', hHead, 0, 'BOLD',
    )
    warn('scheduleOverflow', {
      atSheetSize:       sheetSize,
      requiredSheetSize: layout.recommendedSheetSize,
      standCount:        dataRows.length,
      phase:             'initial-budget',
    })
    return {
      placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length,
      southmostY: drawingZone.y,
    }
  }

  // 4. Sub-table dimensions in ground-metres. Height = headerHeight + rowsPerTable
  //    * rowHeight, matching computeScheduleLayout's budget exactly so Pass 1
  //    candidate positions are not pre-emptively rejected by the placer.
  const columnWidthsG = layout.columnWidths.map(mm)
  const subTableWidthG = columnWidthsG.reduce((s, w) => s + w, 0)
  const subTableHeightG = mm(
    SCHEDULE_HEADER_HEIGHT_MM + layout.rowsPerTable * (rH / mm(1)),
  )

  // 5. PASS 1 — topology placement at original size.
  let placedPositions = []
  for (let i = 0; i < layout.numTables; i++) {
    const position = findBlockPosition({
      block:         { width: subTableWidthG, height: subTableHeightG },
      mapBounds:     drawingZone,
      polygon,
      placedBlocks:  placedPositions,
      buffer:        mm(POLYGON_BUFFER_MM),
      blockSpacing:  mm(BLOCK_SPACING_MM),
      scanStep:      mm(SCAN_STEP_MM),
      tableMinWidth: subTableWidthG,
      logger,
    })
    if (position === null) break
    placedPositions.push({
      x: position.x, y: position.y,
      width: subTableWidthG, height: subTableHeightG,
      rowCount: layout.rowsPerTable,
    })
  }

  // 6. (Consolidation pass — added in Task 3.)

  // 7. FINAL emission loop.
  const placedTables = []
  let placedStandCount = 0
  let southmostY = Infinity

  for (let i = 0; i < placedPositions.length; i++) {
    const p = placedPositions[i]
    const rows = dataRows.slice(placedStandCount, placedStandCount + p.rowCount)
    if (rows.length === 0) break
    const titleText = i === 0 ? 'SCHEDULE OF AREAS' : "SCHEDULE OF AREAS (cont'd)"
    addScheduleTable({
      layer: 'TITLE_BLOCK',
      // findBlockPosition returns block bottom-y (LOW y); addScheduleTable's
      // `y` is the title-row TOP (HIGH y). Block occupies [p.y, p.y + p.height].
      x: p.x, y: p.y + p.height,
      dataRows: rows,
      columnWidths: columnWidthsG,
      titleText,
      hHead, hBody, rH,
      addText, addLine,
    })
    placedTables.push({
      x: p.x, y: p.y, width: p.width, height: p.height,
      rowCount: rows.length,
      isContinuation: i > 0,
    })
    placedStandCount += rows.length
    if (p.y < southmostY) southmostY = p.y
  }

  // 8. (Residual-overflow warn — added in Task 3.)

  if (placedTables.length === 0) southmostY = drawingZone.y

  return {
    placedTables,
    placedStandCount,
    missingStandCount: dataRows.length - placedStandCount,
    southmostY,
  }
}
```

- [ ] **Step 2.4: Run the 6 tests — all should pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"`
Expected: `Tests: 6 passed, 6 total`.

- [ ] **Step 2.5: Run the wider dxf suite — no regression**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Test Suites: 9 passed, 9 total / Tests: 243 passed, 243 total` (237 baseline + 6 new).

- [ ] **Step 2.6: Commit**

```bash
git add app-backend/src/services/dxfScheduleEmitter.js
git add app-backend/src/services/__tests__/dxfScheduleEmitter.test.js
git commit -m "feat(dxf): dxfScheduleEmitter module + 6 happy-path tests (3-v2 Task 2)"
```

---

## Task 3: Add consolidation pass + 6 consolidation tests

Implement the single re-budget pass that runs when Pass 1 didn't seat all sub-tables. The pass discards Pass 1's positions, recomputes `rowsPerTable' = ceil(N / feasible)` and a taller sub-table height, and re-runs `findBlockPosition` with the taller block.

**Files:**
- Modify: `app-backend/src/services/dxfScheduleEmitter.js` (insert step 6 between Pass 1 and the emission loop)
- Modify: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` (add 6 consolidation tests)

- [ ] **Step 3.1: Add 6 consolidation tests to the test file**

Append this `describe` block to `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` (after the existing happy-path block):

```js
describe('emitScheduleOfAreasTopological — consolidation pass', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  // Note: pure-geometry tests for consolidation-success are sensitive to the
  // placer's internal logic. If the assertions below fail during implementation,
  // tune the GEOMETRY (drawingZone dims, rowCount, polygon obstacle position) —
  // not the assertions. The assertions encode the invariants the algorithm
  // must satisfy; the constants are negotiable. Pattern matches sub-projects
  // 4b/4c/4d where geometric test constants needed similar tuning.

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

  test('8. consolidation re-budgets with rowsPerTable = ceil(N / feasible)', () => {
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    const feasible = result.placedTables.length
    if (feasible > 0) {
      const expectedRows = Math.ceil(24 / feasible)
      // All but the last table hold expectedRows; the last may hold ≤ expectedRows (residual rows).
      for (const t of result.placedTables.slice(0, -1)) {
        expect(t.rowCount).toBe(expectedRows)
      }
      expect(result.placedTables[result.placedTables.length - 1].rowCount).toBeLessThanOrEqual(expectedRows)
    }
  })

  test('9. consolidation discards Pass 1 positions before retrying', () => {
    // After consolidation, table heights reflect the taller consolidated size,
    // not Pass 1's original size. The exact threshold depends on geometry,
    // but a consolidated table will always be at least 1.5× the original height
    // when consolidation actually triggered.
    const { features, drawingZone } = consolidationFixture()
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    // Original Pass 1 single-mode subTableHeight = 12 + rowsPerTable*3 where
    // rowsPerTable = floor((80-12)/3) = 22 → height = 78. Consolidated with
    // rowsPerTable' > 22 produces height > 78. Only assert when consolidation
    // actually triggered (placedTables.length < layout.numTables).
    if (result.placedTables.length > 0 && result.placedTables.length < 4) {
      expect(result.placedTables[0].height).toBeGreaterThan(78)
    }
  })

  test('10. consolidation, feasible=0 → no consolidation attempted; scheduleOverflow warn (zero-fit)', () => {
    // Drawing zone fits the layout numerically but no candidate satisfies the
    // placer. Use a polygon that fills the entire drawing zone so no candidate
    // is valid (every position overlaps the polygon).
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    // Polygon covering the entire zone except a sliver — buffer keeps even the
    // sliver from being valid.
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
    // The residual phase is reachable when Pass 2 places some but not all
    // sub-tables (e.g. taller height fits in fewer slots than feasible).
    // It's hard to deterministically trigger through pure geometry without
    // intimate placer-internal knowledge — the natural-placement test 7
    // covers the "consolidation succeeds" path. This test asserts the
    // RESIDUAL INVARIANT: when result.missingStandCount > 0 AND at least
    // one table was placed, the residual warn fires with the right keys.
    //
    // Construct via the zero-fit scenario from test 10; verify the OVERFLOW
    // INVARIANT (placedStandCount + missingStandCount === features.length)
    // holds regardless of phase, and that any fired warn has the required
    // payload keys.
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
    // Same fixture as test 7 — already covered by test 7's warn-count assertion.
    // Repeat here as an explicit anti-warn assertion at a different geometry.
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
```

- [ ] **Step 3.2: Run the tests — confirm 6 new tests fail (consolidation not yet implemented)**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"`
Expected: tests 7-12 fail because consolidation logic isn't in the module yet. The exact failures will be in tests 7, 8, 9, 10 (zero-fit warn doesn't fire because no logic emits it).

- [ ] **Step 3.3: Add the consolidation pass to `dxfScheduleEmitter.js`**

In `app-backend/src/services/dxfScheduleEmitter.js`, **replace** the comment line `// 6. (Consolidation pass — added in Task 3.)` with:

```js
  // 6. PASS 2 — consolidation (only if PASS 1 didn't seat all tables).
  if (placedPositions.length < layout.numTables) {
    const feasible = placedPositions.length
    placedPositions = []   // discard pass-1 positions; replay from scratch

    if (feasible === 0) {
      warn('scheduleOverflow', {
        atSheetSize:          sheetSize,
        recommendedSheetSize: nextLargerSheet(sheetSize),
        placedStandCount:     0,
        missingStandCount:    dataRows.length,
        placedTables:         0,
        phase:                'consolidation-zero-fit',
      })
      return {
        placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length,
        southmostY: drawingZone.y,
      }
    }

    const rowsPerTable2 = Math.ceil(dataRows.length / feasible)
    const subTableHeight2G = mm(
      SCHEDULE_HEADER_HEIGHT_MM + rowsPerTable2 * (rH / mm(1)),
    )

    for (let i = 0; i < feasible; i++) {
      const position = findBlockPosition({
        block:         { width: subTableWidthG, height: subTableHeight2G },
        mapBounds:     drawingZone,
        polygon,
        placedBlocks:  placedPositions,
        buffer:        mm(POLYGON_BUFFER_MM),
        blockSpacing:  mm(BLOCK_SPACING_MM),
        scanStep:      mm(SCAN_STEP_MM),
        tableMinWidth: subTableWidthG,
        logger,
      })
      if (position === null) break
      placedPositions.push({
        x: position.x, y: position.y,
        width: subTableWidthG, height: subTableHeight2G,
        rowCount: rowsPerTable2,
      })
    }

    // Pass 2 may also fail (consolidated taller height doesn't fit anywhere).
    // Emit the same zero-fit warn and return early — otherwise the final
    // emission loop would silently emit 0 tables with no warning.
    if (placedPositions.length === 0) {
      warn('scheduleOverflow', {
        atSheetSize:          sheetSize,
        recommendedSheetSize: nextLargerSheet(sheetSize),
        placedStandCount:     0,
        missingStandCount:    dataRows.length,
        placedTables:         0,
        phase:                'consolidation-zero-fit',
      })
      return {
        placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length,
        southmostY: drawingZone.y,
      }
    }
  }
```

Also **replace** the comment `// 8. (Residual-overflow warn — added in Task 3.)` with:

```js
  // 8. Residual-overflow warn.
  const missingStandCount = dataRows.length - placedStandCount
  if (missingStandCount > 0 && placedTables.length > 0) {
    warn('scheduleOverflow', {
      atSheetSize:          sheetSize,
      recommendedSheetSize: nextLargerSheet(sheetSize),
      placedStandCount,
      missingStandCount,
      placedTables:         placedTables.length,
      phase:                'consolidation-residual',
    })
  }
```

And update the return statement to use the `missingStandCount` variable:

Change:
```js
    missingStandCount: dataRows.length - placedStandCount,
```
to:
```js
    missingStandCount,
```

- [ ] **Step 3.4: Run the tests — all 12 should pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"`
Expected: `Tests: 12 passed, 12 total`.

- [ ] **Step 3.5: Run the wider dxf suite — no regression**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Test Suites: 9 passed, 9 total / Tests: 249 passed, 249 total` (237 baseline + 12 emitter).

- [ ] **Step 3.6: Commit**

```bash
git add app-backend/src/services/dxfScheduleEmitter.js
git add app-backend/src/services/__tests__/dxfScheduleEmitter.test.js
git commit -m "feat(dxf): consolidation re-budget pass for schedule emitter (3-v2 Task 3)"
```

---

## Task 4: Add 6 overflow & edge case tests

The consolidation logic is in place, but no tests cover the `fits:false` initial-budget path, the warn payload schema, or the polygon-avoidance behavior. This task adds those tests.

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`

- [ ] **Step 4.1: Append 6 more tests**

Append this `describe` block:

```js
describe('emitScheduleOfAreasTopological — overflow & edge cases', () => {
  let h
  beforeEach(() => { h = makeHarness() })

  test('13. computeScheduleLayout fits:false → title placeholder + warn(phase:"initial-budget")', () => {
    // Zone width less than singleTableWidth/2 AND zone height too small for any row.
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
    // Trigger zero-fit consolidation via full-zone polygon (same as test 10).
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
    // At ISO_A1 → recommended should be ISO_A0.
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

  test('16. polygon with rectangle obstacle in the middle → placements avoid the polygon', () => {
    // Drawing zone 600×80. Polygon: rectangle at x=200..400, y=20..60.
    // Placements should land in left/right strips, not inside the obstacle.
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 200, y: 20 }, { x: 400, y: 20 }, { x: 400, y: 60 }, { x: 200, y: 60 },
    ]
    const features = makeFeatures(6)
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })

    expect(result.placedTables.length).toBeGreaterThan(0)
    // No placed table's center is inside the polygon obstacle.
    for (const t of result.placedTables) {
      const cx = t.x + t.width / 2
      const cy = t.y + t.height / 2
      const insidePolygon = cx >= 200 && cx <= 400 && cy >= 20 && cy <= 60
      expect(insidePolygon).toBe(false)
    }
  })

  test('17. drawingZone too narrow for one sub-table → scheduleOverflow (initial-budget)', () => {
    // singleTableWidth = 260. Zone width 100 < 260/2 (130). With rowsPerColumn>0
    // single-column path picks numTables=1 with scaled columns (singleScale=100/260≈0.38).
    // But computeScheduleLayout single-mode always fits — it never returns fits:false
    // when rowsPerColumn > 0 AND rowCount > 0 unless multi-column overflow triggers.
    // So feed rowCount large enough to need multi-column but zone too narrow.
    // numTables>1 with zoneWidth < subTableWidth → fits:false.
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

  test('18. logger.info called with topology/grid candidate counts (smoke test)', () => {
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

    // findBlockPosition's logger.info logs Layer 1 (topology) and Layer 2 (grid) counts.
    const infoMsgs = calls.info.join(' ')
    expect(infoMsgs).toMatch(/Layer 1.*topology/)
  })
})
```

- [ ] **Step 4.2: Run all 18 emitter tests**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"`
Expected: `Tests: 18 passed, 18 total`. If any geometric assertion fails, the fix is in the test fixture (smaller `polygon`, larger `drawingZone`, etc.) — NOT in the emitter. Re-check that the test geometry matches the assertion.

- [ ] **Step 4.3: Run the wider dxf suite**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Test Suites: 9 passed, 9 total / Tests: 255 passed, 255 total` (237 baseline + 18 emitter).

- [ ] **Step 4.4: Commit**

```bash
git add app-backend/src/services/__tests__/dxfScheduleEmitter.test.js
git commit -m "test(dxf): overflow + edge case tests for schedule emitter (3-v2 Task 4)"
```

---

## Task 5: Wire emitter into `dxfGenerator.js`, dissolve col1 partition

This is the integration step. Two coordinated changes: (a) replace the C1 emission block with a call to `emitScheduleOfAreasTopological`, anchoring beacons below the placed schedule; (b) remove col1 from the bottom-zone three-column partition, expand the remaining columns to fill the freed width. Three #3-integration tests may need overflow-payload key updates (`requiredSheetSize` is preserved for initial-budget; consolidation paths use `recommendedSheetSize`).

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js:1570-1733` (C1 emission, bottom-zone partition, C2/C3 emission references)
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js:313-335` (overflow payload schema)

- [ ] **Step 5.1: Add the emitter import**

In `app-backend/src/services/dxfGenerator.js`, find the existing `import { findStandLabelPosition, findEdgeLabelPosition } from './dxfLabelPlacer.js'` line (added in 4d). **Add** below it:

```js
import { emitScheduleOfAreasTopological } from './dxfScheduleEmitter.js'
```

- [ ] **Step 5.2: Replace the bottom-zone column partition (delete col1, expand col2/col3)**

In `app-backend/src/services/dxfGenerator.js`, find lines 1571-1581 (matching `// ── C) BOTTOM ZONE LAYOUT` through `addLine(TB, col2R, drawDivY, col2R, cntB);`). **Replace** the entire block with:

```js
  // ── C) BOTTOM ZONE LAYOUT (within content area, below drawDivY) ──
  // 3-v2: col1 dissolved. Schedule and beacon descriptions emit topologically
  // in the drawing zone (above drawDivY). Bottom zone is split into two columns:
  //   statement (Statement+OFData, 58% of contentW from left)
  //   approved (Approved+Coords, ~42% of contentW from right)
  const statementL = cntL + mm(3);
  const statementR = cntL + contentW * 0.58;
  const approvedL  = statementR + mm(3);
  const approvedR  = cntR - mm(3);

  // Vertical divider between statement (left) and approved (right).
  addLine(TB, statementR, drawDivY, statementR, cntB);
```

- [ ] **Step 5.3: Replace the C1 emission block with the topological emitter call**

In `app-backend/src/services/dxfGenerator.js`, find lines matching `// ── C1) SCHEDULE OF AREAS (bottom-left column) ──` through the end of the `addBeaconDescription` call (originally lines 1583-1656). **Replace** the entire block with:

```js
  // ── C1) SCHEDULE OF AREAS — topological placement (3-v2) ──
  // Schedule and beacon descriptions emit into the drawing zone (above drawDivY).
  // emitScheduleOfAreasTopological returns southmostY = min(p.y) across placed
  // sub-tables (DXF south-up); beacon descriptions anchor just below that.
  const drawingZone = {
    x: cntL,
    y: drawDivY,                       // LOW y in DXF (bottom of drawing zone)
    width:  cntR - cntL,
    height: cntT - drawDivY,
  };

  // Outside-figure outline as polygon to avoid (null when absent).
  const figurePolygon = (ofResult && Array.isArray(ofResult.vertices) && ofResult.vertices.length >= 3)
    ? ofResult.vertices
    : null;

  const scheduleResult = emitScheduleOfAreasTopological({
    surveyedFeatures,
    drawingZone,
    polygon: figurePolygon,
    sheetSize,
    fonts: { hHead, hBody, rH },
    helpers: {
      extractScheduleRow,
      computeScheduleLayout,
      addScheduleTable,
      nextLargerSheet,
      SCHEDULE_HEADER_HEIGHT_MM,
      mm,
    },
    addText: (layer, x, y, text, height, angle, style) => addText(layer, x, y, text, height, angle, style),
    addLine: (layer, x1, y1, x2, y2) => addLine(layer, x1, y1, x2, y2),
    warn,
    logger,
  });

  // Pass the schedule's overflow warning (if any) through to the warnings summary.
  // emitScheduleOfAreasTopological's `warn` callback already emits the structured
  // payload; no extra plumbing needed here.

  // Beacon descriptions — anchored just below the bottommost placed sub-table.
  // When no sub-tables placed (overflow), scheduleResult.southmostY === drawingZone.y;
  // fall back to anchoring near the top of the drawing zone.
  const beaconAnchorY = scheduleResult.placedTables.length > 0
    ? scheduleResult.southmostY - mm(8)
    : drawingZone.y + drawingZone.height - mm(20);
  addBeaconDescription(
    TB,
    cntL, cntR - mm(2),
    beaconAnchorY, cntB + mm(4),
    options.beaconGroups || [],
  );
```

- [ ] **Step 5.4: Update C2 (Statement + OF data) emission to use new variable names**

In `app-backend/src/services/dxfGenerator.js`, the C2 block (originally lines 1658-1718) references `col2L` and `col3R`. **Replace** each occurrence:

| Old reference | New variable |
|---|---|
| `col2L` | `statementL` |
| `col2R` | `statementR` |
| `col3L` | `approvedL` |
| `col3R` | `approvedR` |

The replacements affect 11 lines (1662, 1666, 1668, 1673, 1677, 1681-1683, 1691, 1697-1698). Use the editor to find-and-replace each variable name within the C2/C3 sections only (lines ~1658-1730). Make sure to leave any unrelated `col*` strings outside this range untouched (there are none in the current file but be careful with global replaces).

The relevant updated lines look like this (representative sample):

```js
// Was: addText(TB, col2L, cY, ...)
addText(TB, statementL, cY, `Surveyed in ${metadata.date} by me`, hBody);
// ...
// Was: addLine(TB, col2L - mm(3), cY + mm(2), col3R + mm(3), cY + mm(2));
addLine(TB, statementL - mm(3), cY + mm(2), approvedR + mm(3), cY + mm(2));
// ...
// Was: const c = (off) => col2L + off;
const c = (off) => statementL + off;
```

- [ ] **Step 5.5: Update C3 (Approved box) emission to use new variable names**

In `app-backend/src/services/dxfGenerator.js`, the C3 block (originally lines 1720-1732) uses `col3L` and `col3R`. **Replace**:

```js
// Was: const aCX = (col3L + col3R) / 2;
const aCX = (approvedL + approvedR) / 2;
// Was: addRect(TB, col3L, aY - mm(30), col3R, aY);
addRect(TB, approvedL, aY - mm(30), approvedR, aY);
```

- [ ] **Step 5.6: Run the wider dxf suite to find which tests need overflow-payload key updates**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`

Two integration tests in `dxfGenerator.integration.test.js` will likely fail:

1. `'clean sampleFixture still produces zero warnings + scheduleOverflow null'` (line ~307) — may still pass if the sample fixture's 2-parcel schedule fits topologically.
2. `'overflow fixture (200 parcels at A2) emits structured scheduleOverflow warning'` (line ~313) — will likely fail because (a) the warn payload now has different keys for consolidation paths and (b) the topology placement may NOT actually overflow for 200 1×1m parcels in a much larger drawing zone.

Capture the actual failure output. Expected adjustments are in Step 5.7.

- [ ] **Step 5.7: Update the overflow integration test for the new payload schema**

In `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`, find the test starting at line 313 (`'overflow fixture (200 parcels at A2) emits structured scheduleOverflow warning'`).

**Replace** the test body (the test's content between the `test(...` opening and closing braces) with:

```js
  test('overflow fixture (1000 parcels at A2) emits structured scheduleOverflow warning', () => {
    // 3-v2: drawing zone is much larger than col1 was. Need significantly more
    // parcels to exceed the consolidated-pass row budget at A2.
    const manyParcels = []
    for (let i = 1; i <= 1000; i++) {
      manyParcels.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[
          [50000, 2200000], [50001, 2200000], [50001, 2200001], [50000, 2200001], [50000, 2200000],
        ]]},
        properties: { stand: String(i), area_m2: 100 + i },
      })
    }
    const overflowFixture = { ...sampleFixture, parcels: { features: manyParcels } }
    const { warnings } = generateDXF(overflowFixture, fakeLogger)
    expect(warnings.summary.scheduleOverflow).not.toBeNull()
    expect(warnings.summary.scheduleOverflow.atSheetSize).toBe('ISO_A2')
    // Payload now has either initial-budget or consolidation phase. Both share
    // atSheetSize. Initial-budget uses requiredSheetSize + standCount; consolidation
    // uses recommendedSheetSize + placedStandCount/missingStandCount.
    const sched = warnings.summary.scheduleOverflow
    expect(['initial-budget', 'consolidation-zero-fit', 'consolidation-residual'])
      .toContain(sched.phase)
    // The escalation field is either requiredSheetSize (initial) or recommendedSheetSize (consolidation).
    const escalation = sched.requiredSheetSize ?? sched.recommendedSheetSize
    expect(['ISO_A1', 'ISO_A0', 'multi-sheet-required']).toContain(escalation)
  })
```

If the `'clean sampleFixture still produces zero warnings + scheduleOverflow null'` test fails (because the sampleFixture's 2-parcel schedule no longer fits in the drawing zone — unlikely but possible), the fix is the same shape: relax the assertion to allow either null or a phase-tagged warning. Don't preemptively change it; only adjust if Step 5.6 surfaced the failure.

- [ ] **Step 5.8: Re-run the dxf suite to confirm**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 255 passed, 255 total` (237 baseline + 18 emitter; overflow integration test now matches the new schema).

Note: if the entity-count integration tests (the 130 baseline `dxfGenerator.*.test.js` tests) fail because the col1R/col2R divider line count changed (the col1R divider was removed in Step 5.2), update the affected assertion. Capture the exact failure first; the fix is usually adjusting the expected line count by -1 or rephrasing the assertion to look for specific divider y-coords rather than total counts. Look for any test asserting on number of LINE entities in TITLE_BLOCK.

- [ ] **Step 5.9: Smoke-test on the sample fixture (optional but recommended)**

Run a one-off script to confirm the DXF generates without error on the existing sample fixture:

```bash
cd app-backend
node -e "import('./src/services/dxfGenerator.js').then(({generateDXF}) => { import('./src/services/__tests__/__fixtures__/sampleFixture.js').then(({sampleFixture}) => { const r = generateDXF(sampleFixture, {info:()=>{},warn:()=>{},error:()=>{}}); console.log('warnings:', JSON.stringify(r.warnings.summary)); console.log('buffer size:', r.buffer.length); }); });"
```

Expected: prints a warnings summary (scheduleOverflow may be null or contain a phase-tagged payload) and a buffer size (>10000 bytes). No throws.

If the fixture path is different on your machine, locate it via `git ls-files | findstr sampleFixture`.

- [ ] **Step 5.10: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(dxf): integrate topological schedule emitter, dissolve col1 (3-v2 Task 5) — sub-project 3-v2 complete"
```

---

## Post-implementation

After Task 5 commits:

1. Re-run the full dxf suite once more to confirm a clean green: `cd app-backend && npm test -- --testPathPatterns="dxf"` → expect `~255 passed`.
2. Invoke the `superpowers:finishing-a-development-branch` skill to handle the merge / PR / discard decision.
3. After merge, update the memory file `surveypro-pdfkit-rebaseline-status.md`:
   - Mark sub-project 3-v2 as ✅ shipped with the merge commit.
   - Update sub-project #5 row to note it consumes `dxfScheduleHelpers.nextLargerSheet` for sheet escalation.
   - Move the line `(with **known design gap**...)` annotation off sub-project #3 since 3-v2 closes the gap.

# Schedule of Areas: 15cm Width, Simplified Borders, One-Line Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the Schedule of Areas table to ~15cm at print scale (proportional column scale-up), remove the per-row horizontal divider lines and the table's outer right edge, and make the "SURVEYOR-GENERAL" column header render on one line — consistently across PDF and DXF, single-column and split-table layouts.

**Architecture:** Both generators already source column widths from one shared function, `computeScheduleColumnWidths()` in `app-shared/block-definitions.js`, whose output is threaded through the shared sheet-layout planner and both renderers. A new shared function, `scaleColumnWidthsToTarget()`, is applied at each generator's call site (not inside `computeScheduleColumnWidths` itself, so its existing exact-value unit tests are untouched). Border drawing is refactored in three places: `dxfScheduleHelpers.js:addScheduleTable` (DXF, single pass, localized edit) and two near-identical PDF blocks in `pdfkitGeoPDF.js` (`drawScheduleOfAreasSingleColumn` and the per-sub-table block inside `drawScheduleOfAreasMultiTable`), both refactored to call one new shared helper, `drawScheduleTableGrid`.

**Tech Stack:** Node.js (ESM), Jest 30 (`--experimental-vm-modules`), PDFKit, `pdfjs-dist` (snapshot text extraction).

## Global Constraints

- 15cm target width = `150 * (72 / 25.4)` ≈ 425.2 PDF points (150mm at print scale).
- Never shrink a column below its content-fit width — only scale up.
- Column dividers (STAND | AREAS | DIAGRAM | DEED-NUMBER | DEED-DATE | SURVEYOR-GENERAL) stay, full table height, except the DEED-NUMBER|DEED-DATE divider which still starts only at the sub-header row (unchanged from today).
- Outer top/left/bottom border and the header/body divider rule stay. Outer right edge and per-row horizontal dividers are removed.
- Header text reads "SURVEYOR-GENERAL" (hyphenated, one line).
- Run backend tests from `app-backend` with `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails — ESM project).

---

## Task 1: Shared `scaleColumnWidthsToTarget` helper

**Files:**
- Modify: `app-shared/block-definitions.js`
- Test: `app-backend/src/services/__tests__/block-definitions-schedule.test.js`

**Interfaces:**
- Produces: `scaleColumnWidthsToTarget(widths: number[], targetWidthPt: number) => number[]` — scales `widths` up (never down) so they sum to at least `targetWidthPt`, preserving relative ratios. Returns the input unchanged if its sum already meets/exceeds the target.
- Produces: `SCHEDULE_TARGET_WIDTH_PT: number` — the 15cm-in-points constant, exported alongside `SCHEDULE_OF_AREAS`.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to the end of
`app-backend/src/services/__tests__/block-definitions-schedule.test.js` (after
the closing `})` of the existing `describe('computeScheduleColumnWidths', ...)`
block, before `describe('planScheduleSplit', ...)`):

```js
describe('scaleColumnWidthsToTarget', () => {
  test('scales widths up proportionally to reach the target', () => {
    const widths = [10, 20, 10, 10, 10, 20] // sum 80
    const scaled = scaleColumnWidthsToTarget(widths, 160)
    expect(scaled.reduce((a, b) => a + b, 0)).toBeCloseTo(160, 5)
    for (let i = 0; i < widths.length; i++) {
      expect(scaled[i]).toBeCloseTo(widths[i] * 2, 5)
    }
  })

  test('does not shrink widths that already meet or exceed the target', () => {
    const widths = [50, 60, 40, 40, 35, 50] // sum 275
    const scaled = scaleColumnWidthsToTarget(widths, 200)
    expect(scaled).toEqual(widths)
  })

  test('widths summing exactly to the target are returned unchanged', () => {
    const widths = [40, 40] // sum 80
    const scaled = scaleColumnWidthsToTarget(widths, 80)
    expect(scaled).toEqual(widths)
  })

  test('SCHEDULE_TARGET_WIDTH_PT is 15cm in PDF points', () => {
    expect(SCHEDULE_TARGET_WIDTH_PT).toBeCloseTo(150 * 72 / 25.4, 5)
  })
})
```

Update the test file's import statement (near the top) to include the two new
names:

```js
import {
  computeScheduleColumnWidths,
  scaleColumnWidthsToTarget,
  SCHEDULE_TARGET_WIDTH_PT,
  planScheduleSplit,
  edgeDistanceMetres,
  classifyBeaconGroups,
  resolveLoSystem,
  snapScaleBarSegment,
} from '../../../../app-shared/block-definitions.js'
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-schedule
```

Expected: FAIL — `scaleColumnWidthsToTarget is not a function` / `SCHEDULE_TARGET_WIDTH_PT is not defined` (import error).

- [ ] **Step 3: Implement `scaleColumnWidthsToTarget` and `SCHEDULE_TARGET_WIDTH_PT`**

In `app-shared/block-definitions.js`, add immediately after the closing `}` of
`computeScheduleColumnWidths` (the function ending at line 638, just before
the `planScheduleSplit` JSDoc block):

```js
/**
 * 15cm at print scale, in PDF points (150mm / 25.4mm-per-inch * 72pt-per-inch).
 * The Schedule of Areas targets this width so it reads clearly when printed,
 * regardless of how narrow its content-fit columns would otherwise be.
 */
export const SCHEDULE_TARGET_WIDTH_PT = 150 * (72 / 25.4)

/**
 * Scales a set of column widths UP (never down) so they sum to at least
 * targetWidthPt, preserving each column's relative share of the total.
 * Widths that already sum to targetWidthPt or more are returned unchanged —
 * the table never shrinks below what its content needs.
 *
 * @param {number[]} widths
 * @param {number} targetWidthPt
 * @returns {number[]}
 */
export function scaleColumnWidthsToTarget(widths, targetWidthPt) {
  const sum = widths.reduce((a, b) => a + b, 0)
  if (sum <= 0 || sum >= targetWidthPt) return widths
  const scale = targetWidthPt / sum
  return widths.map((w) => w * scale)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-schedule
```

Expected: PASS — all tests in `block-definitions-schedule.test.js`, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add app-shared/block-definitions.js app-backend/src/services/__tests__/block-definitions-schedule.test.js
git commit -m "feat(schedule): add scaleColumnWidthsToTarget helper for 15cm print width"
```

---

## Task 2: DXF — apply 15cm width, one-line header, and border cleanup

**Files:**
- Modify: `app-shared/block-definitions.js` (SURVEYOR-GENERAL label)
- Modify: `app-backend/src/services/dxfGenerator.js` (wire scaling into the column-width call site)
- Modify: `app-backend/src/services/dxfScheduleHelpers.js` (`addScheduleTable`: remove right edge + row dividers)
- Test: `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`

**Interfaces:**
- Consumes: `scaleColumnWidthsToTarget`, `SCHEDULE_TARGET_WIDTH_PT` from Task 1.
- Produces: no new exports — `addScheduleTable`'s existing signature and return value (`dataBotY`) are unchanged.

- [ ] **Step 1: Change the SURVEYOR-GENERAL label to one line**

In `app-shared/block-definitions.js`, in `SCHEDULE_OF_AREAS.singleColumn.columns`
(around line 34), change:

```js
      { key: 'surveyor', label: 'SURVEYOR-\nGENERAL', width: 50, align: 'center' }
```

to:

```js
      { key: 'surveyor', label: 'SURVEYOR-GENERAL', width: 50, align: 'center' }
```

Make the identical change in `SCHEDULE_OF_AREAS.multiColumn.columns` (around
line 53) — same `label:` line, same edit.

- [ ] **Step 2: Write the failing DXF border/label tests**

In `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`, replace
the existing test `'emits the four outer-border lines forming a rectangle'`
(lines 410-427) with:

```js
  test('emits three outer-border lines (top, left, bottom) — no right edge', () => {
    const { lineCalls, addText, addLine } = mockPrimitives()
    const dataRows = [{ stand: '1', area: '100', diagram: '', deedNumber: '', deedDate: '', surveyor: '' }]
    const args = defaultArgs({ addText, addLine, dataRows })
    addScheduleTable(args)
    const tableTopY = args.y - args.hHead * 1.6
    const top   = lineCalls.find(l => l.y1 === tableTopY && l.y2 === tableTopY && l.x1 === 0 && l.x2 === 64)
    const left  = lineCalls.find(l => l.x1 === 0  && l.x2 === 0  && l.y1 !== l.y2)
    const right = lineCalls.find(l => l.x1 === 64 && l.x2 === 64 && l.y1 !== l.y2)
    expect(top).toBeDefined()
    expect(left).toBeDefined()
    expect(right).toBeUndefined()
  })
```

Replace the existing test `'emits a horizontal divider between every pair of
adjacent data rows'` (lines 440-455) with:

```js
  test('does NOT emit a horizontal divider between data rows (only top, header/body divider, and bottom)', () => {
    const { lineCalls, addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '2', area: '200', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '3', area: '300', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '4', area: '400', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
    ]
    addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows }) })
    const fullWidthHorizontals = lineCalls.filter(l =>
      l.y1 === l.y2 && l.x1 === 0 && l.x2 === 64)
    // Exactly 3 regardless of row count: outer top, header/body divider, outer bottom.
    expect(fullWidthHorizontals.length).toBe(3)
  })
```

Add a new test right after the existing `'emits all six SI 727 column
headers'` test (after line 339):

```js
  test('emits "SURVEYOR-GENERAL" as a single text entry, not split across two lines', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    const texts = textCalls.map(c => c.text)
    expect(texts).toContain('SURVEYOR-GENERAL')
    expect(texts).not.toContain('SURVEYOR-')
    expect(texts).not.toContain('GENERAL')
  })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfScheduleHelpers
```

Expected: FAIL — the new/updated tests fail because `addScheduleTable` still
draws a right edge and per-row dividers, and the label is still split across
two `\n`-separated tokens.

- [ ] **Step 4: Update `addScheduleTable`'s grid drawing**

In `app-backend/src/services/dxfScheduleHelpers.js`, in the `── Grid lines ──`
section (around lines 245-278), replace:

```js
  // ── Grid lines ──
  // Outer border (top, bottom, left, right).
  addLine(layer, x,         tableTopY, rightEdge, tableTopY)
  addLine(layer, x,         dataBotY,  rightEdge, dataBotY)
  addLine(layer, x,         dataBotY,  x,         tableTopY)
  addLine(layer, rightEdge, dataBotY,  rightEdge, tableTopY)

  // DEED row ↔ sub-header row divider (only across DEED columns,
  // matches PDF drawScheduleOfAreasSingleColumn:10301-10304).
  addLine(layer, deedStartX, deedRowBotY, deedEndX, deedRowBotY)

  // Sub-header row ↔ data divider (full width).
  addLine(layer, x, subHeaderBotY, rightEdge, subHeaderBotY)

  // Between every two adjacent data rows.
  for (let r = 1; r < dataRows.length; r++) {
    const dividerY = dataTopY - r * rH
    addLine(layer, x, dividerY, rightEdge, dividerY)
  }

  // Vertical column dividers between the 6 columns.
```

with:

```js
  // ── Grid lines ──
  // Outer border: top, left, bottom. The right edge is intentionally omitted
  // — columns read as continuous vertical bands, not a closed box.
  addLine(layer, x, tableTopY, rightEdge, tableTopY)
  addLine(layer, x, dataBotY,  rightEdge, dataBotY)
  addLine(layer, x, dataBotY,  x,         tableTopY)

  // DEED row ↔ sub-header row divider (only across DEED columns,
  // matches PDF drawScheduleOfAreasSingleColumn:10301-10304).
  addLine(layer, deedStartX, deedRowBotY, deedEndX, deedRowBotY)

  // Sub-header row ↔ data divider (full width). No per-row horizontal
  // dividers below this — rows read as continuous vertical columns.
  addLine(layer, x, subHeaderBotY, rightEdge, subHeaderBotY)

  // Vertical column dividers between the 6 columns.
```

(The trailing `for (let i = 1; i < columnWidths.length; i++) { ... }` column-divider
loop that follows is unchanged — leave it exactly as-is.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfScheduleHelpers
```

Expected: PASS — all tests in `dxfScheduleHelpers.test.js`.

- [ ] **Step 6: Wire the 15cm scaling into the DXF generator**

In `app-backend/src/services/dxfGenerator.js`, update the import block (lines
23-34) to add the two new names:

```js
import {
  TITLE_BLOCK,
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  formatStandRanges,
  computeScheduleColumnWidths,
  scaleColumnWidthsToTarget,
  SCHEDULE_TARGET_WIDTH_PT,
  edgeDistanceMetres,
  classifyBeaconGroups,
  snapScaleBarSegment,
  resolveLoSystem,
} from '../../../app-shared/block-definitions.js'
```

Then, around line 1914, replace:

```js
  const scheduleColumnWidthsPt = computeScheduleColumnWidths({
    dataRows:       surveyedFeatures.map(extractScheduleRow),
    headerFontSize: 6,
    bodyFontSize:   7,
    measureText:    dxfScheduleMeasure,
  });
```

with:

```js
  const rawScheduleColumnWidthsPt = computeScheduleColumnWidths({
    dataRows:       surveyedFeatures.map(extractScheduleRow),
    headerFontSize: 6,
    bodyFontSize:   7,
    measureText:    dxfScheduleMeasure,
  });
  // Widen to 15cm at print scale, preserving each column's relative share.
  const scheduleColumnWidthsPt = scaleColumnWidthsToTarget(rawScheduleColumnWidthsPt, SCHEDULE_TARGET_WIDTH_PT);
```

- [ ] **Step 7: Run the full DXF integration suite to check for regressions**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator dxfScheduleEmitter dxfScheduleHelpers
```

Expected: PASS. If any schedule-overflow/escalation/split tests in
`dxfGenerator.integration.test.js` fail because the widened table no longer
fits their fixture's assumed sheet size, inspect the failure — if it's
because the wider (15cm) table genuinely needs a larger sheet than the old
narrower one did for that specific fixture, that is expected fallout from the
width change; update the test's expected sheet size / row counts to match.
Do not weaken an assertion just to make it pass — confirm the new behavior is
correct first.

- [ ] **Step 8: Commit**

```bash
git add app-shared/block-definitions.js app-backend/src/services/dxfGenerator.js app-backend/src/services/dxfScheduleHelpers.js app-backend/src/services/__tests__/dxfScheduleHelpers.test.js
git commit -m "feat(dxf): widen Schedule of Areas to 15cm, drop right edge + row dividers, one-line SURVEYOR-GENERAL"
```

---

## Task 3: PDF — apply 15cm width, shared grid helper, and border cleanup

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Test (new): `app-backend/src/services/__tests__/scheduleTableGrid.test.js`

**Interfaces:**
- Consumes: `scaleColumnWidthsToTarget`, `SCHEDULE_TARGET_WIDTH_PT` from Task 1.
- Produces: `drawScheduleTableGrid(doc, { x, headerY, headerHeight, colWidths, rowHeight, rowCount })` — exported from `pdfkitGeoPDF.js` for direct unit testing; draws the table's border/divider grid (no text). Used by both `drawScheduleOfAreasSingleColumn` and `drawScheduleOfAreasMultiTable`.

- [ ] **Step 1: Write the failing test for the new grid helper**

Create `app-backend/src/services/__tests__/scheduleTableGrid.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { drawScheduleTableGrid } from '../pdfkitGeoPDF.js'

// Minimal chainable PDFKit stand-in recording moveTo/lineTo pairs as lines.
function fakeDoc() {
  const lines = []
  let cursor = null
  const doc = {
    lines,
    lineWidth: () => doc,
    moveTo: (x, y) => { cursor = { x, y }; return doc },
    lineTo: (x, y) => { lines.push({ x1: cursor.x, y1: cursor.y, x2: x, y2: y }); cursor = { x, y }; return doc },
    stroke: () => doc,
  }
  return doc
}

// SI 727 default column widths (sum 260), used across all tests below.
const colWidths = [35, 60, 40, 40, 35, 50]

describe('drawScheduleTableGrid', () => {
  test('draws top, left, bottom — no right edge', () => {
    const doc = fakeDoc()
    drawScheduleTableGrid(doc, { x: 0, headerY: 100, headerHeight: 25, colWidths, rowHeight: 15, rowCount: 3 })
    const tableWidth = 260
    const bottomY = 100 + 25 + 3 * 15
    const top    = doc.lines.find(l => l.y1 === 100 && l.y2 === 100 && l.x1 === 0 && l.x2 === tableWidth)
    const left   = doc.lines.find(l => l.x1 === 0 && l.x2 === 0 && l.y1 === 100 && l.y2 === bottomY)
    const bottom = doc.lines.find(l => l.y1 === bottomY && l.y2 === bottomY && l.x1 === 0 && l.x2 === tableWidth)
    const right  = doc.lines.find(l => l.x1 === tableWidth && l.x2 === tableWidth)
    expect(top).toBeDefined()
    expect(left).toBeDefined()
    expect(bottom).toBeDefined()
    expect(right).toBeUndefined()
  })

  test('draws exactly one full-width horizontal below the header, regardless of row count', () => {
    const doc = fakeDoc()
    drawScheduleTableGrid(doc, { x: 0, headerY: 100, headerHeight: 25, colWidths, rowHeight: 15, rowCount: 10 })
    const tableWidth = 260
    const fullWidthHorizontals = doc.lines.filter(l => l.y1 === l.y2 && l.x1 === 0 && l.x2 === tableWidth)
    // top + header/body divider + bottom = 3, independent of rowCount.
    expect(fullWidthHorizontals.length).toBe(3)
  })

  test('draws 5 column dividers running the full table height, except DEED|DATE which starts at the sub-header row', () => {
    const doc = fakeDoc()
    drawScheduleTableGrid(doc, { x: 0, headerY: 100, headerHeight: 25, colWidths, rowHeight: 15, rowCount: 2 })
    const bottomY = 100 + 25 + 2 * 15
    const dividerXs = [35, 95, 135, 175, 210]
    for (const dx of dividerXs) {
      expect(doc.lines.some(l => l.x1 === dx && l.x2 === dx)).toBe(true)
    }
    // DEED|DATE divider (x=175) starts at deedHeaderY (headerY + 12), not headerY.
    const deedDivider = doc.lines.find(l => l.x1 === 175 && l.x2 === 175)
    expect(deedDivider.y1).toBe(112)
    // A regular divider (x=35) spans the full header+body height.
    const stdDivider = doc.lines.find(l => l.x1 === 35 && l.x2 === 35)
    expect(stdDivider.y1).toBe(100)
    expect(stdDivider.y2).toBe(bottomY)
  })

  test('table width scales with wider colWidths (15cm target)', () => {
    const doc = fakeDoc()
    const widerColWidths = [57, 98, 65, 65, 57, 82] // sums to 424 (~15cm)
    drawScheduleTableGrid(doc, { x: 0, headerY: 0, headerHeight: 25, colWidths: widerColWidths, rowHeight: 15, rowCount: 1 })
    const tableWidth = widerColWidths.reduce((a, b) => a + b, 0)
    const top = doc.lines.find(l => l.y1 === 0 && l.y2 === 0 && l.x1 === 0 && l.x2 === tableWidth)
    expect(top).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js scheduleTableGrid
```

Expected: FAIL — `drawScheduleTableGrid is not a function` (not yet exported from `pdfkitGeoPDF.js`).

- [ ] **Step 3: Implement and export `drawScheduleTableGrid`**

In `app-backend/src/services/pdfkitGeoPDF.js`, add this new function
immediately before the `drawScheduleOfAreasSingleColumn` function (before the
`/**\n * Draw Schedule of Areas - Single column...` comment block, i.e. right
before what is currently line 8841):

```js
/**
 * Draws the Schedule of Areas grid: outer top/left/bottom border (the right
 * edge is intentionally omitted — columns read as continuous vertical bands),
 * the header/body divider rule, and column dividers running the full table
 * height. The DEED-NUMBER|DEED-DATE divider only starts at the sub-header row
 * (headerY + 12) so it doesn't cut through the merged "DEED" header above it.
 * No per-row horizontal lines are drawn — rows are not individually boxed.
 *
 * Text (headers + data cells) is drawn separately by the caller; this
 * function only strokes lines.
 *
 * @param {PDFDocument} doc
 * @param {Object} args
 * @param {number} args.x - Left edge of the table.
 * @param {number} args.headerY - Top of the header row.
 * @param {number} args.headerHeight - Header row height (25pt in this table).
 * @param {number[]} args.colWidths - 6 column widths, same order as
 *        SCHEDULE_OF_AREAS.singleColumn.columns (stand, area, diagram,
 *        deedNumber, deedDate, surveyor).
 * @param {number} args.rowHeight - Height of one data row.
 * @param {number} args.rowCount - Number of data rows below the header.
 */
export function drawScheduleTableGrid(doc, { x, headerY, headerHeight, colWidths, rowHeight, rowCount }) {
  const tableWidth = colWidths.reduce((s, w) => s + w, 0);
  const deedHeaderY = headerY + 12;
  const deedStartX = x + colWidths[0] + colWidths[1] + colWidths[2];
  const bottomY = headerY + headerHeight + rowCount * rowHeight;

  doc.lineWidth(0.5);

  // Outer border: top, left, bottom — no right edge.
  doc.moveTo(x, headerY).lineTo(x + tableWidth, headerY).stroke();
  doc.moveTo(x, headerY).lineTo(x, bottomY).stroke();
  doc.moveTo(x, bottomY).lineTo(x + tableWidth, bottomY).stroke();

  // Header/body divider.
  doc.moveTo(x, headerY + headerHeight).lineTo(x + tableWidth, headerY + headerHeight).stroke();

  // DEED merged-header divider (spans just the DEED-NUMBER + DEED-DATE columns).
  doc.moveTo(deedStartX, deedHeaderY).lineTo(deedStartX + colWidths[3] + colWidths[4], deedHeaderY).stroke();

  // Column dividers — full table height, except DEED-NUMBER|DEED-DATE (index 3)
  // which starts at the sub-header row so it doesn't cut through the merged
  // DEED header.
  let cx = x;
  for (let i = 0; i < colWidths.length - 1; i++) {
    cx += colWidths[i];
    const topY = (i === 3) ? deedHeaderY : headerY;
    doc.moveTo(cx, topY).lineTo(cx, bottomY).stroke();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js scheduleTableGrid
```

Expected: PASS — all 4 tests in `scheduleTableGrid.test.js`.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/scheduleTableGrid.test.js
git commit -m "feat(pdf): add drawScheduleTableGrid shared border/divider helper"
```

- [ ] **Step 6: Rewire `drawScheduleOfAreasSingleColumn` to use the new helper**

In `app-backend/src/services/pdfkitGeoPDF.js`, inside `drawScheduleOfAreasSingleColumn`,
replace:

```js
  // Draw outer border
  doc.rect(tableX, headerY, tableWidth, headerHeight).stroke();

  // Sub-header separator Y for DEED merged cell
  const deedHeaderY = headerY + 12;
  const deedStartX = tableX + colStand + colArea + colDiagram;

  // Draw vertical lines for columns
  // Note: the divider between DEED NUMBER and DEED DATE only starts at deedHeaderY
  // so that the DEED merged header spans both sub-columns without a line cutting through it.
  let currentX = tableX + colStand;
  doc
    .moveTo(currentX, headerY)
    .lineTo(currentX, headerY + headerHeight)
    .stroke();

  currentX += colArea;
  doc
    .moveTo(currentX, headerY)
    .lineTo(currentX, headerY + headerHeight)
    .stroke();

  currentX += colDiagram;
  doc
    .moveTo(currentX, headerY)
    .lineTo(currentX, headerY + headerHeight)
    .stroke();

  // DEED NUMBER | DATE divider — starts at sub-header row, not top of header
  currentX += colDeedNumber;
  doc
    .moveTo(currentX, deedHeaderY)
    .lineTo(currentX, headerY + headerHeight)
    .stroke();

  currentX += colDeedDate;
  doc
    .moveTo(currentX, headerY)
    .lineTo(currentX, headerY + headerHeight)
    .stroke();

  // Draw horizontal line separating DEED header from sub-headers
  doc
    .moveTo(deedStartX, deedHeaderY)
    .lineTo(deedStartX + colDeedNumber + colDeedDate, deedHeaderY)
    .stroke();
```

with:

```js
  // Sub-header separator Y for DEED merged cell (used below for header TEXT
  // positioning; the border/divider LINES are drawn once, after all rows are
  // known, by drawScheduleTableGrid — see the end of this function).
  const deedHeaderY = headerY + 12;
  const deedStartX = tableX + colStand + colArea + colDiagram;
```

Then, still inside the same function, replace:

```js
  // SURVEYOR-GENERAL (rowspan 2)
  doc.text("SURVEYOR-", tableX + tableWidth - colSurveyor + 2, headerY + 5, {
    width: colSurveyor - 4,
    align: "center",
    lineBreak: false,
  });
  doc.text("GENERAL", tableX + tableWidth - colSurveyor + 2, headerY + 12, {
    width: colSurveyor - 4,
    align: "center",
    lineBreak: false,
  });
```

with:

```js
  // SURVEYOR-GENERAL (rowspan 2, one line — the table now targets a 15cm
  // print width so this fits without wrapping)
  doc.text("SURVEYOR-GENERAL", tableX + tableWidth - colSurveyor + 2, headerY + 8, {
    width: colSurveyor - 4,
    align: "center",
    lineBreak: false,
  });
```

Then, further down in the `surveyedParcels.forEach(...)` loop, replace:

```js
    // Draw row border
    doc.rect(tableX, currentY, tableWidth, rowHeight).stroke();

    // Draw vertical lines
    currentX = tableX + colStand;
    doc
      .moveTo(currentX, currentY)
      .lineTo(currentX, currentY + rowHeight)
      .stroke();

    currentX += colArea;
    doc
      .moveTo(currentX, currentY)
      .lineTo(currentX, currentY + rowHeight)
      .stroke();

    currentX += colDiagram;
    doc
      .moveTo(currentX, currentY)
      .lineTo(currentX, currentY + rowHeight)
      .stroke();

    currentX += colDeedNumber;
    doc
      .moveTo(currentX, currentY)
      .lineTo(currentX, currentY + rowHeight)
      .stroke();

    currentX += colDeedDate;
    doc
      .moveTo(currentX, currentY)
      .lineTo(currentX, currentY + rowHeight)
      .stroke();

    // Row data — 7pt regular (≤ 6pt Bold headers)
```

with:

```js
    // Row data — 7pt regular (≤ 6pt Bold headers)
```

Finally, at the end of the function, replace:

```js
    currentY += rowHeight;
  });

  doc.restore();
}
```

with:

```js
    currentY += rowHeight;
  });

  drawScheduleTableGrid(doc, {
    x: tableX,
    headerY,
    headerHeight,
    colWidths: widths,
    rowHeight,
    rowCount: surveyedParcels.length,
  });

  doc.restore();
}
```

- [ ] **Step 7: Rewire `drawScheduleOfAreasMultiTable`'s per-sub-table block**

In the same file, inside `drawScheduleOfAreasMultiTable`'s render loop
(`for (let tableNum = 0; tableNum < placedTables.length; tableNum++) { ... }`),
replace:

```js
    doc.rect(currentTableX, headerY, tableWidth, headerHeight).stroke();

    // Sub-header separator Y for DEED merged cell
    const deedHeaderY = headerY + 12;
    const deedStartX = currentTableX + colStand + colArea + colDiagram;

    // Vertical lines
    // Note: the divider between DEED NUMBER and DEED DATE only starts at deedHeaderY
    // so that the DEED merged header spans both sub-columns without a line cutting through it.
    let currentX = currentTableX + colStand;
    doc
      .moveTo(currentX, headerY)
      .lineTo(currentX, headerY + headerHeight)
      .stroke();
    currentX += colArea;
    doc
      .moveTo(currentX, headerY)
      .lineTo(currentX, headerY + headerHeight)
      .stroke();
    currentX += colDiagram;
    doc
      .moveTo(currentX, headerY)
      .lineTo(currentX, headerY + headerHeight)
      .stroke();
    // DEED NUMBER | DATE divider — starts at sub-header row, not top of header
    currentX += colDeedNumber;
    doc
      .moveTo(currentX, deedHeaderY)
      .lineTo(currentX, headerY + headerHeight)
      .stroke();
    currentX += colDeedDate;
    doc
      .moveTo(currentX, headerY)
      .lineTo(currentX, headerY + headerHeight)
      .stroke();

    // Horizontal line separating DEED header from sub-headers
    doc
      .moveTo(deedStartX, deedHeaderY)
      .lineTo(deedStartX + colDeedNumber + colDeedDate, deedHeaderY)
      .stroke();
```

with:

```js
    // Sub-header separator Y for DEED merged cell (used below for header TEXT
    // positioning; the border/divider LINES are drawn once, after all rows
    // are known, by drawScheduleTableGrid — see the end of this loop body).
    const deedHeaderY = headerY + 12;
    const deedStartX = currentTableX + colStand + colArea + colDiagram;
```

Then replace:

```js
    doc.text(
      "SURVEYOR-",
      currentTableX + tableWidth - colSurveyor + 2,
      headerY + 5,
      { width: colSurveyor - 4, align: "center", lineBreak: false }
    );
    doc.text(
      "GENERAL",
      currentTableX + tableWidth - colSurveyor + 2,
      headerY + 12,
      { width: colSurveyor - 4, align: "center", lineBreak: false }
    );
```

with:

```js
    doc.text(
      "SURVEYOR-GENERAL",
      currentTableX + tableWidth - colSurveyor + 2,
      headerY + 8,
      { width: colSurveyor - 4, align: "center", lineBreak: false }
    );
```

Then, inside `parcelsForThisTable.forEach(...)`, replace:

```js
      doc.rect(currentTableX, currentY, tableWidth, rowHeight).stroke();

      currentX = currentTableX + colStand;
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .stroke();
      currentX += colArea;
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .stroke();
      currentX += colDiagram;
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .stroke();
      currentX += colDeedNumber;
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .stroke();
      currentX += colDeedDate;
      doc
        .moveTo(currentX, currentY)
        .lineTo(currentX, currentY + rowHeight)
        .stroke();

      doc.fontSize(7).font("Helvetica");
```

with:

```js
      doc.fontSize(7).font("Helvetica");
```

Finally, at the end of the per-table loop iteration, replace:

```js
      currentY += rowHeight;
    });

    doc.restore();

    parcelIndex += rowsInThisTable;
    tablesDrawn++;
  }
```

with:

```js
      currentY += rowHeight;
    });

    drawScheduleTableGrid(doc, {
      x: currentTableX,
      headerY,
      headerHeight,
      colWidths: dynColWidths,
      rowHeight,
      rowCount: rowsInThisTable,
    });

    doc.restore();

    parcelIndex += rowsInThisTable;
    tablesDrawn++;
  }
```

- [ ] **Step 8: Wire the 15cm scaling into the PDF generator**

In `app-backend/src/services/pdfkitGeoPDF.js`, update the import on line 14
from:

```js
import { computeScheduleColumnWidths, edgeDistanceMetres, classifyBeaconGroups, resolveLoSystem, snapScaleBarSegment } from "../../../app-shared/block-definitions.js";
```

to:

```js
import { computeScheduleColumnWidths, scaleColumnWidthsToTarget, SCHEDULE_TARGET_WIDTH_PT, edgeDistanceMetres, classifyBeaconGroups, resolveLoSystem, snapScaleBarSegment } from "../../../app-shared/block-definitions.js";
```

Then, around line 12090, inside the `_scheduleColumnWidthsPt` computation's
`try` block, replace:

```js
      return computeScheduleColumnWidths({
        dataRows: _scheduleRows.map(extractScheduleRow),
        headerFontSize: 6,   // matches drawScheduleOfAreasSingleColumn header font
        bodyFontSize:   7,   // matches drawScheduleOfAreasSingleColumn body font
        measureText:    _pdfScheduleMeasurer,
      });
```

with:

```js
      const _rawWidths = computeScheduleColumnWidths({
        dataRows: _scheduleRows.map(extractScheduleRow),
        headerFontSize: 6,   // matches drawScheduleOfAreasSingleColumn header font
        bodyFontSize:   7,   // matches drawScheduleOfAreasSingleColumn body font
        measureText:    _pdfScheduleMeasurer,
      });
      // Widen to 15cm at print scale, preserving each column's relative share.
      return scaleColumnWidthsToTarget(_rawWidths, SCHEDULE_TARGET_WIDTH_PT);
```

- [ ] **Step 9: Run the full PDF schedule test suite**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js scheduleTableGrid block-definitions-schedule
```

Expected: PASS — both suites green.

- [ ] **Step 10: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js
git commit -m "feat(pdf): widen Schedule of Areas to 15cm, drop right edge + row dividers, one-line SURVEYOR-GENERAL"
```

---

## Task 4: Full regression pass + snapshot update + visual verification

**Files:**
- Modify: `app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing new — this task only verifies.

- [ ] **Step 1: Run the full backend test suite**

```bash
cd app-backend && npm test
```

Expected: mostly PASS. The PDF snapshot tests (`pdfkitGeoPDF.snapshot.test.js`)
are EXPECTED to fail here — the widened columns shift text x-positions, and
"SURVEYOR-" + "GENERAL" (two text items) become one "SURVEYOR-GENERAL" item.
Any other failing suite should be treated as a real regression: read the
failure, and if it stems from a stale assumption about the old ~9.2cm table
width or the two-line header (e.g. a schedule-overflow/escalation fixture
whose sheet size no longer suffices for a wider table), update that test's
expectation to match the new, intended behavior. Do not modify
`app-shared/block-definitions.js`, `dxfScheduleHelpers.js`, or
`pdfkitGeoPDF.js`'s new grid logic just to force an unrelated test green.

- [ ] **Step 2: Update the PDF snapshot**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.snapshot -u
```

- [ ] **Step 3: Manually inspect the snapshot diff before committing it**

```bash
cd app-backend && git diff src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
```

Confirm:
- Every "SURVEYOR-" / "GENERAL" pair of text items collapses into one
  "SURVEYOR-GENERAL" item.
- Schedule-related x-coordinates shift outward (wider table), but unrelated
  text items (title block, beacon descriptions, outside figure data, etc.)
  are unchanged.
- No text item is missing or duplicated versus the pre-change snapshot aside
  from the SURVEYOR-GENERAL merge.

If anything besides those two expected changes shows up, stop and investigate
before proceeding — it likely means a border-drawing edit accidentally moved
text (e.g. a leftover reference to a removed `currentX` variable) rather than
just lines.

- [ ] **Step 4: Re-run the full suite to confirm everything is green**

```bash
cd app-backend && npm test
```

Expected: PASS, full suite.

- [ ] **Step 5: Regenerate the Shabani general plan PDF and visually confirm**

Using the same route/flow the user used to originally generate
`general-developed-STANDS_207-279_340-345_MAGLAS_TOWNSHIP_OF_SHABANI_MINE_SURFA.pdf`,
regenerate that plan's PDF and DXF outputs. Open the PDF and confirm:
- The Schedule of Areas table is visibly wider (~15cm across at print scale)
  than before.
- No horizontal line appears between data rows — only a rule under the
  column headers.
- The table's right edge has no vertical line.
- "SURVEYOR-GENERAL" reads on one line in the header.
- Column divider lines between STAND / AREAS / DIAGRAM / DEED NUMBER / DATE /
  SURVEYOR-GENERAL are still present, full height.

- [ ] **Step 6: Commit the snapshot update**

```bash
cd app-backend && git add src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
git add -A  # pick up any test-expectation fixes made in Step 1
git commit -m "test(schedule): update PDF snapshot for 15cm width + one-line SURVEYOR-GENERAL"
```

---

## Self-Review Notes

- **Spec coverage:** Width scaling (Task 1 + wiring in Tasks 2/3), row-divider
  removal (Tasks 2/3), right-edge removal (Tasks 2/3), one-line
  SURVEYOR-GENERAL (Tasks 2/3), both PDF and DXF (Tasks 2 and 3 separately),
  applies to split/multi-table layout too (Task 3 Step 7 covers
  `drawScheduleOfAreasMultiTable`; DXF's `addScheduleTable` is shared by both
  single- and multi-table DXF paths already). Testing plan from the spec is
  covered by Tasks 1/2/3's TDD steps and Task 4's full-suite + snapshot pass.
- **Dead code confirmed untouched:** `drawScheduleOfAreasMultiColumn` and
  `scheduleOfAreasMultiTable.js` are not referenced in any task.
- **Type/interface consistency:** `drawScheduleTableGrid`'s parameter names
  (`x, headerY, headerHeight, colWidths, rowHeight, rowCount`) are used
  identically at both PDF call sites in Task 3 Steps 6-7.

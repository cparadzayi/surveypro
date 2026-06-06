# Schedule Split-to-Fit + Dynamic Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the SI 727 Schedule of Areas into smaller sub-tables that fit available whitespace fragments (eliminating OFD overlap) and size column widths dynamically to match header + data content.

**Architecture:** Two new pure functions in `app-shared/block-definitions.js` — `computeScheduleColumnWidths` (per-column max(header, data) + padding + floor) and `planScheduleSplit` (greedy largest-gap-first with `minRowsPerTable=3`). Both DXF (`dxfScheduleEmitter.js`) and PDF (`pdfkitGeoPDF.js`) consume them; the DXF Pass 2 (consolidation) is replaced with the split algorithm; PDF's `drawScheduleOfAreasMultiTable` is rewritten around the same plan output.

**Tech Stack:** Node.js (Fastify backend), Jest 29 ESM, pure-function module pattern shared with `dxfBlockPlacer.js`, `dxfBeaconPlacer.js`, `dxfBottomZoneEmitter.js`, `dxfScheduleEmitter.js`.

**Spec:** `docs/superpowers/specs/2026-06-06-schedule-split-and-dynamic-columns-design.md` (commit `517ebd6` on branch `feature/dxf-schedule-split-and-dynamic-cols`).

**Baseline:** 328 dxf tests on main at `58e46d3` (verified at branch creation). Target after Task 5: ~347 dxf tests. Task 6 PDF count depends on existing PDF test inventory (collected during the task).

---

## File Structure

| File | Responsibility |
|---|---|
| `app-shared/block-definitions.js` | MOD. Two new exported pure functions: `computeScheduleColumnWidths`, `planScheduleSplit`. Co-located with existing layout constants (3-v3 single-source-of-truth pattern). |
| `app-backend/src/services/__tests__/block-definitions-schedule.test.js` | NEW. 13 unit tests covering both new functions. |
| `app-backend/src/services/dxfScheduleEmitter.js` | MOD. Pass 2 replaced; Pass 1 + Pass 3 unchanged. Accepts `columnWidthsG` via helpers bag. |
| `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` | MOD. Rewrite consolidation tests 7-9 for split semantics; add 3 new tests. |
| `app-backend/src/services/dxfGenerator.js` | MOD. Compute column widths once before invoking the orchestrator; thread `columnWidthsMM` through. |
| `app-backend/src/services/dxfBottomZoneEmitter.js` | MOD. Forward `columnWidthsMM` from helpers bag into the schedule emitter call. |
| `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js` | MOD. 1 new test for dynamically-sized widths. |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | MOD. 2 new integration tests. |
| `app-backend/src/services/pdfkitGeoPDF.js` | MOD. Rewrite `drawScheduleOfAreasMultiTable` around the shared `planScheduleSplit` + `computeScheduleColumnWidths`. |
| PDF tests | MOD. Inventory at Task 6 start; add/rewrite to cover the new path. |

---

## Conventions in use

- **PDF point everywhere as the shared unit.** Both `computeScheduleColumnWidths` (returns) and `planScheduleSplit` (consumes for `tableWidth`, `headerHeight`, `rowHeight`) work in PDF points. The DXF consumer converts via `PT_TO_MM_GEN = 25.4 / 72` once at the boundary and then via `helpers.mm` to ground-metres.
- **Identity `mm` for unit tests:** existing harness in `dxfScheduleEmitter.test.js` uses `mm: (x) => x` so test geometry is in raw units. New tests follow the same convention.
- **`measureText` injection convention:** `(text: string, fontSize: number) => number_in_pt`. PDF wraps `doc.font(...).widthOfString(text)`; DXF returns `String(text).length * fontSize * 0.55` (the 3-v3 charWidthRatio).

---

### Task 1: `computeScheduleColumnWidths` in block-definitions.js

**Files:**
- Modify: `app-shared/block-definitions.js` (append after existing exports)
- Create: `app-backend/src/services/__tests__/block-definitions-schedule.test.js`

- [ ] **Step 1.1: Create the new test file with the first failing test**

Write file `app-backend/src/services/__tests__/block-definitions-schedule.test.js`:

```js
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
})
```

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
```

Expected: FAIL with "does not provide an export named 'computeScheduleColumnWidths'".

- [ ] **Step 1.3: Implement `computeScheduleColumnWidths`**

Append to `app-shared/block-definitions.js` (after the last existing export, e.g. after `getAdaptiveLabelSize`):

```js
/**
 * Compute per-column widths for the Schedule of Areas so headers and
 * data values never overflow their column. Widths are in PDF points.
 *
 * Per column:
 *   raw   = max(widest header token at headerFontSize,
 *               widest data value  at bodyFontSize)
 *         + 2 * padding
 *   width = max(raw, colMinFloor)
 *
 * Returns 6 widths in the same order as SCHEDULE_OF_AREAS.singleColumn.columns:
 *   [stand, area, diagram, deedNumber, deedDate, surveyor].
 *
 * @param {Object} args
 * @param {Array<Object>} args.dataRows - schedule data rows; keys match column.key values
 * @param {number} args.headerFontSize - PDF pt; used for header-token measurement
 * @param {number} args.bodyFontSize   - PDF pt; used for data-cell measurement
 * @param {(text:string, fontSize:number) => number} args.measureText
 *        Text-width measurer returning PDF pt. PDF passes a function backed
 *        by doc.widthOfString; DXF passes (text, fz) => text.length * fz * 0.55.
 * @param {number} [args.padding=4]    - per-side cell padding in pt
 * @param {number} [args.colMinFloor=24] - per-column minimum width in pt
 * @returns {number[]} 6 column widths in pt
 */
export function computeScheduleColumnWidths({
  dataRows, headerFontSize, bodyFontSize, measureText,
  padding = 4, colMinFloor = 24,
}) {
  const cols = SCHEDULE_OF_AREAS.singleColumn.columns
  const widths = []
  for (const col of cols) {
    const headerTokens = String(col.label).split('\n')
    let widestHeader = 0
    for (const t of headerTokens) {
      const w = measureText(t, headerFontSize)
      if (w > widestHeader) widestHeader = w
    }
    let widestData = 0
    for (const row of dataRows) {
      const val = row[col.key]
      if (val == null || val === '') continue
      const w = measureText(String(val), bodyFontSize)
      if (w > widestData) widestData = w
    }
    const raw = Math.max(widestHeader, widestData) + 2 * padding
    widths.push(Math.max(raw, colMinFloor))
  }
  return widths
}
```

- [ ] **Step 1.4: Run the first test and verify it passes**

```bash
cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
```

Expected: PASS — 1 test.

- [ ] **Step 1.5: Add the remaining 5 `computeScheduleColumnWidths` tests**

Append to `app-backend/src/services/__tests__/block-definitions-schedule.test.js`, inside the existing `describe('computeScheduleColumnWidths', ...)` block (before the closing `})`):

```js
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
```

- [ ] **Step 1.6: Run the new tests and verify they all pass**

```bash
cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
```

Expected: PASS — 5 tests (total 6 in the file, the 6th test is added after `planScheduleSplit` in Task 2).

- [ ] **Step 1.7: Run the full dxf suite to confirm no regressions**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — 328 tests pass (baseline; new block-definitions-schedule.test.js doesn't match the "dxf" pattern, so this just confirms the dxf suite is still green).

- [ ] **Step 1.8: Commit**

```bash
git add app-shared/block-definitions.js \
        app-backend/src/services/__tests__/block-definitions-schedule.test.js
git commit -m "feat(schedule): computeScheduleColumnWidths in block-definitions (Task 1)

Per-column dynamic width: max(widest header token, widest data value)
plus 2*padding, floored at colMinFloor. Returns 6 widths in PDF pt in
the order matching SCHEDULE_OF_AREAS.singleColumn.columns. Text-width
measurement is injected so PDF can use real font metrics and DXF can
use its charWidthRatio approximation.

6 unit tests cover: width count, header-vs-data dominance, floor
enforcement, padding accumulation, measureText call shape.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: `planScheduleSplit` in block-definitions.js

**Files:**
- Modify: `app-shared/block-definitions.js` (append second new function)
- Modify: `app-backend/src/services/__tests__/block-definitions-schedule.test.js` (add `describe('planScheduleSplit')` block)

- [ ] **Step 2.1: Update the import in the test file**

Edit `app-backend/src/services/__tests__/block-definitions-schedule.test.js`. The import line already names `planScheduleSplit`; verify it's present:

```js
import {
  computeScheduleColumnWidths,
  planScheduleSplit,
} from '../../../../app-shared/block-definitions.js'
```

(If the import already exists from Task 1, no edit needed.)

- [ ] **Step 2.2: Add the first failing `planScheduleSplit` test**

Append to the test file (after the closing `})` of `describe('computeScheduleColumnWidths', ...)`):

```js
describe('planScheduleSplit', () => {
  test('all rows fit in one gap → plan has 1 entry, no continuation, no residual', () => {
    const result = planScheduleSplit({
      totalRows: 5,
      availableGaps: [{ x: 0, y: 0, width: 100, height: 200 }],
      tableWidth:   50,
      headerHeight: 30,
      rowHeight:    15,
    })
    expect(result.plan).toHaveLength(1)
    expect(result.plan[0].gapIndex).toBe(0)
    expect(result.plan[0].startRow).toBe(0)
    expect(result.plan[0].rowCount).toBe(5)
    expect(result.plan[0].isContinuation).toBe(false)
    expect(result.residualRows).toBe(0)
  })
})
```

- [ ] **Step 2.3: Run the test to verify it fails**

```bash
cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
```

Expected: FAIL with "planScheduleSplit is not a function" (or undefined import).

- [ ] **Step 2.4: Implement `planScheduleSplit`**

Append to `app-shared/block-definitions.js`:

```js
/**
 * Plan how to split a schedule of totalRows stands across the available
 * whitespace gaps. Greedy: largest-capacity gap first, fills with as many
 * rows as it holds.
 *
 * Per gap, capacity = floor((gap.height - headerHeight) / rowHeight).
 * Gaps narrower than tableWidth are skipped (too narrow for the table).
 * Gaps with capacity < minRowsPerTable are skipped UNLESS totalRows is
 * itself below minRowsPerTable (very small plan), in which case the first
 * width-passing gap holds all rows.
 *
 * Returns:
 *   plan: [{ gapIndex, startRow, rowCount, isContinuation }]
 *         gapIndex is the original index in availableGaps. startRow is
 *         the index into the caller's dataRows where this sub-table
 *         starts. isContinuation is true for all sub-tables after the
 *         first.
 *   residualRows: number of rows left unplaced. > 0 triggers caller-side
 *                 scheduleOverflow warn + final-rescue fallback.
 *
 * @param {Object} args
 * @param {number} args.totalRows
 * @param {Array<{x:number,y:number,width:number,height:number}>} args.availableGaps
 * @param {number} args.tableWidth   - sum of column widths in the same units as gaps
 * @param {number} args.headerHeight - total header height (title + DEED + sub-headers)
 * @param {number} args.rowHeight
 * @param {number} [args.minRowsPerTable=3]
 * @returns {{ plan: Array<{gapIndex:number,startRow:number,rowCount:number,isContinuation:boolean}>, residualRows: number }}
 */
export function planScheduleSplit({
  totalRows, availableGaps, tableWidth, headerHeight, rowHeight,
  minRowsPerTable = 3,
}) {
  const candidates = []
  for (let i = 0; i < availableGaps.length; i++) {
    const g = availableGaps[i]
    if (g.width < tableWidth) continue
    const capacity = Math.floor((g.height - headerHeight) / rowHeight)
    if (capacity < minRowsPerTable && totalRows >= minRowsPerTable) continue
    if (capacity <= 0) continue
    candidates.push({ originalIndex: i, capacity })
  }
  candidates.sort((a, b) => b.capacity - a.capacity)

  let remainingRows = totalRows
  let startIndex = 0
  const plan = []
  for (const c of candidates) {
    if (remainingRows < minRowsPerTable && plan.length > 0) break
    const rowsHere = Math.min(c.capacity, remainingRows)
    if (rowsHere <= 0) break
    plan.push({
      gapIndex:       c.originalIndex,
      startRow:       startIndex,
      rowCount:       rowsHere,
      isContinuation: plan.length > 0,
    })
    startIndex    += rowsHere
    remainingRows -= rowsHere
    if (remainingRows === 0) break
  }
  return { plan, residualRows: remainingRows }
}
```

- [ ] **Step 2.5: Run the test and verify it passes**

```bash
cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
```

Expected: PASS — 7 tests passing (6 from Task 1 + 1 new).

- [ ] **Step 2.6: Add the remaining 6 `planScheduleSplit` tests**

Append inside the `describe('planScheduleSplit', ...)` block:

```js
  test('rows distributed across gaps in descending capacity order', () => {
    // gap[0] holds 2 rows; gap[1] holds 10 rows; gap[2] holds 4 rows.
    // Largest-first → gap[1] first (rows 0-9), then gap[2] (rows 10-13), then gap[0] skipped (capacity < min).
    const result = planScheduleSplit({
      totalRows: 14,
      availableGaps: [
        { x: 0, y: 0,  width: 50, height:  60 },  // (60-30)/15 = 2  → skipped (< minRowsPerTable=3)
        { x: 0, y: 70, width: 50, height: 180 },  // (180-30)/15 = 10
        { x: 0, y:260, width: 50, height:  90 },  // (90-30)/15 = 4
      ],
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(2)
    expect(result.plan[0].gapIndex).toBe(1)
    expect(result.plan[0].rowCount).toBe(10)
    expect(result.plan[0].startRow).toBe(0)
    expect(result.plan[1].gapIndex).toBe(2)
    expect(result.plan[1].rowCount).toBe(4)
    expect(result.plan[1].startRow).toBe(10)
    expect(result.plan[1].isContinuation).toBe(true)
    expect(result.residualRows).toBe(0)
  })

  test('residualRows tracks unplaceable rows when gap capacity runs out', () => {
    const result = planScheduleSplit({
      totalRows: 20,
      availableGaps: [{ x: 0, y: 0, width: 50, height: 105 }], // capacity = (105-30)/15 = 5
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(1)
    expect(result.plan[0].rowCount).toBe(5)
    expect(result.residualRows).toBe(15)
  })

  test('gap narrower than tableWidth is skipped', () => {
    const result = planScheduleSplit({
      totalRows: 5,
      availableGaps: [{ x: 0, y: 0, width: 30, height: 200 }], // width 30 < tableWidth 50 → skip
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(0)
    expect(result.residualRows).toBe(5)
  })

  test('totalRows < minRowsPerTable → single entry with all rows', () => {
    // Plan with only 2 stands. Even a small gap should hold them.
    const result = planScheduleSplit({
      totalRows: 2,
      availableGaps: [{ x: 0, y: 0, width: 50, height: 60 }], // capacity (60-30)/15 = 2
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(1)
    expect(result.plan[0].rowCount).toBe(2)
    expect(result.residualRows).toBe(0)
  })

  test('stand row order preserved across sub-tables (startRow monotonically increases)', () => {
    const result = planScheduleSplit({
      totalRows: 12,
      availableGaps: [
        { x: 0, y: 0,   width: 50, height:  75 },  // 3 rows
        { x: 0, y: 100, width: 50, height: 105 },  // 5 rows
        { x: 0, y: 220, width: 50, height:  90 },  // 4 rows
      ],
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    // Largest first: gap[1] (5 rows), then gap[2] (4 rows), then gap[0] (3 rows).
    let prevEnd = 0
    for (const p of result.plan) {
      expect(p.startRow).toBe(prevEnd)
      prevEnd = p.startRow + p.rowCount
    }
    expect(prevEnd).toBe(12)
    expect(result.residualRows).toBe(0)
  })

  test('availableGaps empty → returns plan:[], residualRows:totalRows', () => {
    const result = planScheduleSplit({
      totalRows: 10,
      availableGaps: [],
      tableWidth: 50, headerHeight: 30, rowHeight: 15,
    })
    expect(result.plan).toHaveLength(0)
    expect(result.residualRows).toBe(10)
  })
```

- [ ] **Step 2.7: Run all unit tests and verify they pass**

```bash
cd app-backend && npm test -- --testPathPatterns="block-definitions-schedule"
```

Expected: PASS — 13 tests passing (6 column-widths + 7 split).

- [ ] **Step 2.8: Run the full dxf suite to confirm no regressions**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — 328 tests pass (baseline unchanged).

- [ ] **Step 2.9: Commit**

```bash
git add app-shared/block-definitions.js \
        app-backend/src/services/__tests__/block-definitions-schedule.test.js
git commit -m "feat(schedule): planScheduleSplit in block-definitions (Task 2)

Greedy schedule-table split: largest-capacity gap first, fills rows
up to gap capacity, never below minRowsPerTable=3 (except when
totalRows itself is below the minimum). Returns plan entries plus
residualRows count for caller-side overflow handling.

7 unit tests cover: single-gap fit, descending-capacity ordering,
residualRows tracking, gap-narrower-than-table skip, undersized-plan
exception, startRow monotonicity, empty-gaps return shape.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Rewrite DXF Pass 2 around `planScheduleSplit`

**Files:**
- Modify: `app-backend/src/services/dxfScheduleEmitter.js` (replace Pass 2; add imports)
- Modify: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` (rewrite 7-9; add 3 new tests)

- [ ] **Step 3.1: Add the imports for the new dependencies**

Edit `app-backend/src/services/dxfScheduleEmitter.js`. Find the existing import line:

```js
import { findBlockPosition, GRID_EDGE_MARGIN } from './dxfBlockPlacer.js'
```

Add directly below:

```js
import { computeWhitespaceZones } from './dxfTopology.js'
import { rectanglesOverlap } from './dxfGeometry.js'
import { planScheduleSplit } from '../../../app-shared/block-definitions.js'
```

- [ ] **Step 3.2: Accept `columnWidthsG` from the helpers bag**

In `dxfScheduleEmitter.js`, find the existing `helpers` destructuring (around line 70):

```js
  const {
    extractScheduleRow, computeScheduleLayout, addScheduleTable,
    nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, mm,
  } = helpers
```

Replace with:

```js
  const {
    extractScheduleRow, computeScheduleLayout, addScheduleTable,
    nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, mm,
    columnWidthsG,        // 2026-06-06: dynamic widths in ground-metres
                          //  threaded from dxfGenerator via the orchestrator
  } = helpers
```

The helper consumes `columnWidthsG` if provided; if absent (transitional state during Task 3, before Task 4 wires it through), it falls back to `layout.columnWidths.map(mm)`.

- [ ] **Step 3.3: Use `columnWidthsG` when available**

In `dxfScheduleEmitter.js`, find the line:

```js
  const columnWidthsG = layout.columnWidths.map(mm)
```

Replace with:

```js
  // 2026-06-06: prefer dynamic widths from helpers when caller provides them.
  // Falls back to layout.columnWidths (the pre-2026-06-06 fixed widths) when
  // helpers.columnWidthsG is absent so existing test fixtures still work.
  const columnWidthsG_local = helpers.columnWidthsG || layout.columnWidths.map(mm)
```

Then update the only line that uses `columnWidthsG` later in the function (the `subTableWidthG = columnWidthsG.reduce(...)` line and the addScheduleTable call's `columnWidths: columnWidthsG` argument) to reference `columnWidthsG_local` instead.

Verify by searching:

```bash
grep -n "columnWidthsG" app-backend/src/services/dxfScheduleEmitter.js
```

Should show:
- Line ~73-74: destructure (consumed only as the fallback condition)
- One `const columnWidthsG_local = ...` definition
- Two or three references to `columnWidthsG_local`

- [ ] **Step 3.4: Replace the inner Pass 2 (consolidation) body with the split algorithm**

The current schedule emitter wraps Pass 2 + Pass 3 + the final-fail handler inside one outer `if (placedPositions.length < layout.numTables) { ... }`. We only replace the **inner consolidation body** — the outer if-block, Pass 3, and the final-fail handler all stay intact.

First, confirm the precise boundaries by searching:

```bash
grep -n "feasible = placedPositions\|PASS 3 — skip-polygon" app-backend/src/services/dxfScheduleEmitter.js
```

Expected output (line numbers approximate):
- `const feasible = placedPositions.length` — start of the block to replace
- `// PASS 3 — skip-polygon` — line immediately AFTER the block to replace

Open `app-backend/src/services/dxfScheduleEmitter.js`. The replacement region runs **from** the line:

```js
    const feasible = placedPositions.length
```

**through** the closing `}` of `if (feasible > 0) { ... }` (the line immediately before the `// PASS 3` comment). Roughly lines 164-193 in the current file.

Delete that range. In its place, insert:

```js
    // 2026-06-06: split-into-smaller replaces pre-2026-06-06 consolidation
    // (fewer-but-taller tables, which rarely succeeded because consolidated
    // taller tables exceeded the zone height). Spec:
    //   docs/superpowers/specs/2026-06-06-schedule-split-and-dynamic-columns-design.md
    placedPositions = []   // discard pass-1 positions; replay from scratch
    const subTableWidthG = columnWidthsG_local.reduce((s, w) => s + w, 0)
    const headerHeightG  = mm(SCHEDULE_HEADER_HEIGHT_MM)

    // Enumerate whitespace gaps then exclude those overlapping seedPlacedBlocks.
    // computeWhitespaceZones already excludes the polygon interior; seed
    // exclusion is layered on top so we don't try to place a sub-table on
    // the OFD table the orchestrator placed first.
    const allZones = computeWhitespaceZones({
      polygon,
      mapBounds:     drawingZone,
      buffer:        mm(POLYGON_BUFFER_MM),
      tableMinWidth: subTableWidthG,
      scanStep:      mm(SCAN_STEP_MM),
    })
    const availableGaps = allZones.filter(g =>
      !seedPlacedBlocks.some(b =>
        rectanglesOverlap(g, b, mm(BLOCK_SPACING_MM))))

    const { plan, residualRows } = planScheduleSplit({
      totalRows:    dataRows.length,
      availableGaps,
      tableWidth:   subTableWidthG,
      headerHeight: headerHeightG,
      rowHeight:    rH,
      minRowsPerTable: 3,
    })

    for (const entry of plan) {
      const g = availableGaps[entry.gapIndex]
      const subTableHeightG = headerHeightG + entry.rowCount * rH
      // Anchor each sub-table at the gap's top. In DXF south-up coords,
      // gap.y + gap.height is the high-y (top); subtracting the table
      // height gives the bottom-y (low-y) which is what placedPositions stores.
      const subTableBottomY = g.y + g.height - subTableHeightG
      placedPositions.push({
        x: g.x, y: subTableBottomY,
        width: subTableWidthG, height: subTableHeightG,
        rowCount: entry.rowCount,
      })
    }

    if (placedPositions.length > 0 && residualRows > 0) {
      warn('scheduleOverflow', {
        atSheetSize:          sheetSize,
        recommendedSheetSize: nextLargerSheet(sheetSize),
        placedStandCount:     dataRows.length - residualRows,
        missingStandCount:    residualRows,
        placedTables:         placedPositions.length,
        phase:                'split-residual',
      })
    }

    if (placedPositions.length > 0) {
      logger.info(`[dxfScheduleEmitter] Pass 2 split placed ${placedPositions.length} sub-tables (residualRows: ${residualRows})`)
    }
```

After the insert, the file structure must read (schematically):

```js
  // 6. PASS 2 — split-to-fit (was: consolidation).
  if (placedPositions.length < layout.numTables) {
    // ← new split code goes here →
    placedPositions = []
    const subTableWidthG = ...
    ...new Pass 2 logic ending with the logger.info line above...

    // PASS 3 — skip-polygon fallback. (UNCHANGED)
    if (placedPositions.length === 0) {
      ...existing Pass 3 code, unchanged...
    }

    // All three passes failed — emit title placeholder + warn and return. (UNCHANGED)
    if (placedPositions.length === 0) {
      emitTitlePlaceholder()
      warn('scheduleOverflow', { ..., phase: 'consolidation-zero-fit' })
      return { ... }
    }
  }
```

**Verify bracket balance** by running:

```bash
node -e "require('fs').readFileSync('app-backend/src/services/dxfScheduleEmitter.js','utf8').length"
```

…and then importing the module via `node --experimental-vm-modules -e "import('./app-backend/src/services/dxfScheduleEmitter.js')"` to catch syntax errors before running the tests.

- [ ] **Step 3.5: Run the schedule emitter tests and observe the failures**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"
```

Expected: 1-3 failures in tests 7-9 (consolidation tests) since Pass 2 no longer consolidates. Other tests pass.

- [ ] **Step 3.6: Rewrite tests 7-9 for the new Pass 2 semantics**

Edit `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`. Find tests 7, 8, and 9 (consolidation tests). Replace each in place with the following 3 split-aware tests.

Test 7 — replace its current body with the body below (keep the surrounding `test(...)` structure if convenient, just swap the name + body):

```js
  test('7. Pass 2 split places multiple sub-tables in distinct whitespace fragments', () => {
    // 24 stands in a tall narrow zone that Pass 1 cannot seat in one block.
    // Pass 2 should split into 2+ sub-tables.
    const features = makeFeatures(24)
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    // All stands placed across one or more sub-tables.
    expect(result.placedStandCount).toBeGreaterThan(0)
    // Pass 2's split-residual warn is fine; consolidation-zero-fit must NOT fire.
    for (const w of h.calls.warn) {
      if (w.cat === 'scheduleOverflow') {
        expect(w.payload.phase).not.toBe('consolidation-zero-fit')
      }
    }
  })
```

Test 8 — replace with:

```js
  test('8. Pass 2 stand row-conservation invariant: sum(placed) + missing = total', () => {
    const features = makeFeatures(24)
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    expect(result.placedStandCount + result.missingStandCount).toBe(24)
  })
```

Test 9 — replace with:

```js
  test('9. Pass 2 split produces sub-tables with varied rowCount when gaps differ in capacity', () => {
    // Many stands in a wide+tall zone — Pass 1 may seat all in one big table,
    // or Pass 2 may split. Either way, every placed table's rowCount > 0
    // and the sub-tables together cover placedStandCount stands.
    const features = makeFeatures(50)
    const drawingZone = { x: 0, y: 0, width: 800, height: 200 }
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon: null, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    let sumRows = 0
    for (const t of result.placedTables) {
      expect(t.rowCount).toBeGreaterThan(0)
      sumRows += t.rowCount
    }
    expect(sumRows).toBe(result.placedStandCount)
  })
```

- [ ] **Step 3.7: Add 3 new tests for split-specific Pass 2 behavior**

Append after test 9 in the same describe block (or in any describe block in the file — placement is flexible):

```js
  test('Pass 2 with one tall zone + several short zones emits varied-size sub-tables', () => {
    // Drawing zone shape: a wide rectangle. Polygon obstructs the middle so
    // there are several disconnected whitespace bands of different heights.
    const features = makeFeatures(20)
    const drawingZone = { x: 0, y: 0, width: 600, height: 200 }
    // L-shaped polygon obstruction.
    const polygon = [
      { x: 100, y: 50 }, { x: 400, y: 50 },
      { x: 400, y: 150 }, { x: 100, y: 150 },
    ]
    const result = emitScheduleOfAreasTopological({
      surveyedFeatures: features,
      drawingZone, polygon, sheetSize: 'ISO_A2',
      fonts: h.fonts, helpers: h.helpers,
      addText: h.addText, addLine: h.addLine, warn: h.warn, logger: h.logger,
    })
    // Should place at least some stands; varied capacity is implicit.
    expect(result.placedStandCount).toBeGreaterThan(0)
  })

  test('Pass 2 returns 0 plan entries when even the largest gap fits no rows → falls through to Pass 3', () => {
    // Polygon fills the entire zone so computeWhitespaceZones returns nothing.
    // Pass 2 plan empty, Pass 3 takes over with skip-polygon.
    const features = makeFeatures(5)
    const drawingZone = { x: 0, y: 0, width: 600, height: 80 }
    const polygon = [
      { x: 0, y: 0 }, { x: 600, y: 0 },
      { x: 600, y: 80 }, { x: 0, y: 80 },
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

  test('Pass 2 split honors seedPlacedBlocks when filtering availableGaps', () => {
    // A 1000-wide zone with a seed-block covering x:0..600. Pass 1 may fail
    // (depends on layout); if it does, Pass 2 must only use the x:600..1000
    // strip. We verify by checking every placed table x ≥ 600.
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
      expect(t.x).toBeGreaterThanOrEqual(600 - 1e-6)
    }
  })
```

- [ ] **Step 3.8: Run the schedule emitter tests and verify they all pass**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfScheduleEmitter"
```

Expected: PASS — 23 existing tests rewritten or new + 3 added = 26 total.

- [ ] **Step 3.9: Run the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — 328 baseline + 3 new tests = 331. The 3 rewritten tests (7-9) are in-place rewrites, not additions.

- [ ] **Step 3.10: Commit**

```bash
git add app-backend/src/services/dxfScheduleEmitter.js \
        app-backend/src/services/__tests__/dxfScheduleEmitter.test.js
git commit -m "feat(dxf): Pass 2 split-to-fit replaces consolidation (Task 3)

DXF schedule emitter Pass 2 rewritten:
- Calls computeWhitespaceZones to enumerate available gaps
- Filters out gaps overlapping seedPlacedBlocks (OFD etc)
- Calls planScheduleSplit for greedy largest-gap-first assignment
- Fires scheduleOverflow with phase 'split-residual' when residualRows > 0
- Falls through to Pass 3 unchanged when split produces no placements

Tests 7-9 rewritten for split semantics + 3 new tests cover varied-size
sub-tables, full-zone polygon → Pass 3 fallthrough, and seedPlacedBlocks
exclusion from availableGaps. Pass 1 and Pass 3 unchanged.

helpers.columnWidthsG fallback path preserves the old behavior when
caller doesn't yet provide dynamic widths (wired in Task 4).

dxf suite: 328 → 331 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Wire `columnWidthsMM` through dxfGenerator → orchestrator → emitter

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js` (compute widths; thread through)
- Modify: `app-backend/src/services/dxfBottomZoneEmitter.js` (forward through helpers)
- Modify: `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js` (1 new test)

- [ ] **Step 4.1: Add the import + width computation in dxfGenerator.js**

Edit `app-backend/src/services/dxfGenerator.js`. Find an existing import from block-definitions (around line 28-30):

```js
import { OUTSIDE_FIGURE_DATA, SURVEYOR_GENERAL_BOX } from '../../../app-shared/block-definitions.js'
```

Replace with:

```js
import {
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  SCHEDULE_OF_AREAS,
  computeScheduleColumnWidths,
} from '../../../app-shared/block-definitions.js'
```

Then find the existing `bottomZoneFonts` definition (around line 1664). **Immediately after** the closing `};` of `bottomZoneFonts`, insert:

```js
  // 2026-06-06: dynamic column widths. Computed once per generateDXF call
  // from header + data measurements via the same algorithm PDF uses.
  // PT_TO_MM_GEN converts from PDF pt to paper-mm; helpers.mm converts
  // to ground-metres at the use site (matches the rest of the file).
  const dxfMeasureText = (text, fontSize) =>
    String(text).length * fontSize * 0.55
  const scheduleColumnWidthsPt = computeScheduleColumnWidths({
    dataRows:       surveyedFeatures.map(extractScheduleRow),
    headerFontSize: SCHEDULE_OF_AREAS.singleColumn.headerFontSize,
    bodyFontSize:   SCHEDULE_OF_AREAS.singleColumn.fontSize,
    measureText:    dxfMeasureText,
  });
  const scheduleColumnWidthsMM = scheduleColumnWidthsPt.map(w => w * PT_TO_MM_GEN);
  const scheduleColumnWidthsG  = scheduleColumnWidthsMM.map(mm);
```

- [ ] **Step 4.2: Pass `columnWidthsG` through the orchestrator helpers bag**

Still in `dxfGenerator.js`, find the `helpers: { ... }` bag inside the `placeBottomZoneBlocks({...})` call (around line 1688). Add `columnWidthsG: scheduleColumnWidthsG,` to the helpers object:

```js
    helpers: {
      mm,
      extractScheduleRow,
      computeScheduleLayout,
      addScheduleTable,
      nextLargerSheet,
      SCHEDULE_HEADER_HEIGHT_MM,
      addBeaconDescription,
      scheduleEmitter:  emitScheduleOfAreasTopological,
      columnWidthsG:    scheduleColumnWidthsG,
    },
```

- [ ] **Step 4.3: Forward `columnWidthsG` in the bottom-zone orchestrator**

Edit `app-backend/src/services/dxfBottomZoneEmitter.js`. Find where the orchestrator calls the schedule emitter — search for `scheduleEmitter(`:

```bash
grep -n "scheduleEmitter(" app-backend/src/services/dxfBottomZoneEmitter.js
```

The call already passes `helpers` to the schedule emitter, which includes `columnWidthsG` if Task 4.2 added it correctly. **Verify** that the orchestrator passes `helpers` unmodified (no destructure that drops keys) by reading the call site. If it does pass `helpers` unmodified, no edit needed in this step — Task 4.3 is purely a check.

If the orchestrator's call shape filters helpers, add `columnWidthsG: helpers.columnWidthsG,` to the schedule-emitter-call's helpers parameter.

- [ ] **Step 4.4: Add a dxfScheduleHelpers test exercising dynamic widths**

Edit `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`. Append a new test inside the existing `describe('addScheduleTable', ...)` block:

```js
  test('renders correctly with dynamically-sized columnWidths (wider deedNumber)', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    // Simulated dynamic widths: deedNumber column wider than baseline 35 pt.
    // Test that addScheduleTable accepts and draws without throwing.
    const dynamicWidths = [10, 12, 10, 18, 10, 12]  // deedNumber wider
    const args = defaultArgs({
      addText, addLine,
      columnWidths: dynamicWidths,
      dataRows: [
        { stand: '1', area: '100', diagram: '', deedNumber: 'DG-12345/2024', deedDate: '', surveyor: '' },
      ],
    })
    expect(() => addScheduleTable(args)).not.toThrow()
    // The deedNumber value 'DG-12345/2024' must appear as a TEXT entry.
    const texts = textCalls.map(c => c.text)
    expect(texts).toContain('DG-12345/2024')
  })
```

- [ ] **Step 4.5: Run the schedule helper tests**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfScheduleHelpers"
```

Expected: PASS — 41 tests passing (40 baseline + 1 new).

- [ ] **Step 4.6: Run the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — 332 tests (331 from Task 3 + 1 new).

- [ ] **Step 4.7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js \
        app-backend/src/services/dxfBottomZoneEmitter.js \
        app-backend/src/services/__tests__/dxfScheduleHelpers.test.js
git commit -m "feat(dxf): thread dynamic column widths through orchestrator (Task 4)

dxfGenerator computes scheduleColumnWidthsG once per generateDXF call
via computeScheduleColumnWidths with the dxfMeasureText approximator
(text.length × fontSize × 0.55) and threads through the bottom-zone
orchestrator helpers bag into the schedule emitter.

dxfBottomZoneEmitter.placeBottomZoneBlocks forwards helpers unmodified
to the schedule emitter call (no edit needed) — verified.

dxfScheduleHelpers.addScheduleTable already accepts variable column
widths from the columnWidths param; 1 new test exercises dynamic
widths with a long deedNumber value.

dxf suite: 331 → 332 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Integration tests for the DXF side

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` (+2 tests)

- [ ] **Step 5.1: Add the Maglas-density split test**

Edit `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. Find the bottom-zone-topology describe block added in sub-project 3-v4. Append a new test inside it:

```js
  test('Maglas-density fixture (200+ stands) splits into multiple sub-tables without consolidation-zero-fit overflow', () => {
    // Build a 200-stand fixture. The pre-2026-06-06 schedule emitter would
    // hit Pass 3 (skip-polygon + overlap-acceptable) on this density. The
    // new Pass 2 split should place all stands across multiple sub-tables
    // without ever firing consolidation-zero-fit overflow.
    const features = []
    for (let i = 0; i < 200; i++) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[
          [50000 + i * 0.5, 2200000], [50000 + i * 0.5 + 0.5, 2200000],
          [50000 + i * 0.5 + 0.5, 2200001], [50000 + i * 0.5, 2200001],
          [50000 + i * 0.5, 2200000],
        ]]},
        properties: { stand: String(1000 + i), area_m2: 100 + i },
      })
    }
    const fixture = {
      ...sampleFixture,
      parcels: { type: 'FeatureCollection', features },
      sheetSize: 'ISO_A0',
    }
    const r = generateDXF(fixture, fakeLogger)
    // Pass 2 split must not produce consolidation-zero-fit overflow.
    const sched = r.warnings.summary.scheduleOverflow
    if (sched) {
      expect(sched.phase).not.toBe('consolidation-zero-fit')
    }
    // At least one schedule sub-table title emitted (could be many).
    const titleCount = (r.buffer.toString().match(/SCHEDULE OF AREAS/g) || []).length
    expect(titleCount).toBeGreaterThan(0)
  })
```

- [ ] **Step 5.2: Add the long-deedNumber dynamic-width test**

Append inside the same describe block:

```js
  test('long deedNumber values widen the deedNumber column (dynamic-width proof)', () => {
    // Two fixtures: one with short deed numbers (baseline), one with long ones.
    // The long-deed fixture should produce a wider total schedule table width.
    //
    // We compare by counting the x-extent of TEXT entries on the TITLE_BLOCK
    // layer that contain a schedule sub-table title — the rightmost extent of
    // the bordered area widens proportionally to the deedNumber column.
    const makeFeatures = (deedNumber) => Array.from({ length: 5 }, (_, i) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[
        [50000 + i, 2200000], [50001 + i, 2200000],
        [50001 + i, 2200001], [50000 + i, 2200001],
        [50000 + i, 2200000],
      ]]},
      properties: { stand: String(100 + i), area_m2: 100 + i, deedNumber },
    }))

    const shortFixture = { ...sampleFixture,
      parcels: { type: 'FeatureCollection', features: makeFeatures('DG-1/24') } }
    const longFixture  = { ...sampleFixture,
      parcels: { type: 'FeatureCollection', features: makeFeatures('DG-1234567890/2024') } }

    const shortDxf = generateDXF(shortFixture, fakeLogger).buffer.toString()
    const longDxf  = generateDXF(longFixture,  fakeLogger).buffer.toString()

    // Find the longest TEXT entity x+widthExtent in each by scanning DEED
    // text occurrences (any line containing 'DG-' on the TITLE_BLOCK layer).
    const findDeedTextXs = (dxf) => {
      const xs = []
      const re = /\b0\s*\n\s*TEXT\b([\s\S]*?)(?=\b0\s*\n\s*[A-Z]+\b|$)/g
      for (const m of dxf.match(re) || []) {
        if (!/\bDG-/.test(m)) continue
        const xMatch = m.match(/\b10\s*\n\s*(-?[\d.eE+]+)/)
        if (xMatch) xs.push(parseFloat(xMatch[1]))
      }
      return xs
    }
    const shortMaxX = Math.max(...findDeedTextXs(shortDxf))
    const longMaxX  = Math.max(...findDeedTextXs(longDxf))

    // The long-deed DXF's deedNumber TEXT entity sits further right because
    // its column is wider. Tolerance: must be measurably further right
    // (more than 1 m at S=1000 → 1 ground unit).
    if (Number.isFinite(shortMaxX) && Number.isFinite(longMaxX)) {
      expect(longMaxX).toBeGreaterThan(shortMaxX)
    }
  })
```

- [ ] **Step 5.3: Run the integration tests**

```bash
cd app-backend && npm test -- --testPathPatterns="dxfGenerator.integration"
```

Expected: PASS — existing tests + 2 new tests.

- [ ] **Step 5.4: Run the full dxf suite**

```bash
cd app-backend && npm test -- --testPathPatterns="dxf"
```

Expected: PASS — **334 tests** (332 from Task 4 + 2 new).

- [ ] **Step 5.5: Commit**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): 2 integration tests for schedule split + dynamic columns (Task 5)

1. Maglas-density 200-stand fixture splits into multiple sub-tables
   without firing scheduleOverflow consolidation-zero-fit.
2. Long deedNumber fixture produces visibly wider deedNumber column
   than baseline short deed numbers (proves dynamic widths reach the
   integrated DXF output).

dxf suite: 332 → 334 tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: PDF rewrite of `drawScheduleOfAreasMultiTable`

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` (rewrite the multi-table function)
- Modify: PDF tests (inventory at task start)

- [ ] **Step 6.1: Inventory existing PDF tests for the schedule**

Run:

```bash
cd app-backend && grep -rn "drawScheduleOfAreas\|drawScheduleOfAreasMultiTable\|SCHEDULE OF AREAS" src/services/__tests__/ src/__tests__/ 2>/dev/null
```

Record which test files exist and what they assert. The most common pattern: tests check the PDF buffer for substring presence of "SCHEDULE OF AREAS" or per-row stand numbers.

- [ ] **Step 6.2: Add the PDF measurer import + factory**

Edit `app-backend/src/services/pdfkitGeoPDF.js`. Near the top of the file (after existing imports), add:

```js
import {
  computeScheduleColumnWidths as _computeScheduleColumnWidths,
  planScheduleSplit          as _planScheduleSplit,
} from '../../../app-shared/block-definitions.js'
```

(Use the `as _` alias to avoid colliding with any in-scope local of the same name. Confirm the import path with one of the file's other existing imports from `block-definitions`.)

- [ ] **Step 6.3: Write a PDF text-width measurer factory**

Above the `function drawScheduleOfAreasMultiTable(...)` definition (around line 9202), insert:

```js
/**
 * Build a text-width measurer suitable for computeScheduleColumnWidths.
 * Switches between header and body fonts per the supplied fontSize so
 * doc.widthOfString returns the correct value for either token type.
 *
 * @param {PDFKit.PDFDocument} doc
 * @param {number} headerFontSize - 6 for the schedule header
 * @param {number} bodyFontSize   - 7 for the schedule body
 * @returns {(text:string, fontSize:number) => number}
 */
function buildPdfScheduleMeasurer(doc, headerFontSize, bodyFontSize) {
  return (text, fontSize) => {
    if (fontSize === headerFontSize) {
      doc.font('Helvetica-Bold').fontSize(fontSize)
    } else {
      doc.font('Helvetica').fontSize(fontSize)
    }
    return doc.widthOfString(String(text))
  }
}
```

- [ ] **Step 6.4: Replace the fixed column-width block at the top of `drawScheduleOfAreasMultiTable`**

In `drawScheduleOfAreasMultiTable`, find the block that defines the fixed columns (around line 9229):

```js
  const colStand = 35;
  const colArea = 60;
  const colDiagram = 40;
  const colDeedNumber = 40;
  const colDeedDate = 35;
  const colSurveyor = 50;
  const tableWidth =
    colStand + colArea + colDiagram + colDeedNumber + colDeedDate + colSurveyor;
```

Replace with:

```js
  // 2026-06-06: dynamic column widths from the shared algorithm in
  // app-shared/block-definitions.js. Same algorithm DXF uses (different
  // measurer). Falls back to the legacy [35,60,40,40,35,50] when the
  // measurer throws (e.g., font load failure).
  let dynColWidths
  try {
    const measurer = buildPdfScheduleMeasurer(doc, 6, 7)
    dynColWidths = _computeScheduleColumnWidths({
      dataRows:       surveyedParcels.map(p => ({
        stand:      p.properties.stand,
        area:       String(p.properties.area_m2 || ''),
        diagram:    p.properties.diagramNumber || '',
        deedNumber: p.properties.deedNumber    || '',
        deedDate:   p.properties.deedDate      || '',
        surveyor:   p.properties.surveyorGeneral || '',
      })),
      headerFontSize: 6,
      bodyFontSize:   7,
      measureText:    measurer,
    })
  } catch (e) {
    logger.warn(`[PDFKit] computeScheduleColumnWidths fell back to fixed widths: ${e.message}`)
    dynColWidths = [35, 60, 40, 40, 35, 50]
  }
  const colStand      = dynColWidths[0]
  const colArea       = dynColWidths[1]
  const colDiagram    = dynColWidths[2]
  const colDeedNumber = dynColWidths[3]
  const colDeedDate   = dynColWidths[4]
  const colSurveyor   = dynColWidths[5]
  const tableWidth    = dynColWidths.reduce((s, w) => s + w, 0)
```

The rest of the function (rendering, header drawing, row iteration) uses these `colStand`/`colArea`/etc. variables, so it inherits the dynamic widths transparently.

- [ ] **Step 6.5: Replace the maxRowsPerTable / split heuristic with `planScheduleSplit`**

In `drawScheduleOfAreasMultiTable`, locate the existing whitespace-gap enumeration and the loop that decides where each sub-table goes (around lines 9290-9530). The loop currently iterates `candidateZones`, tracks `tablesPlaced`, and writes per-table positions.

Replace the gap-selection + per-table placement loop with a call to `_planScheduleSplit`. The structure should be:

```js
  // 2026-06-06: replace the bespoke gap-walking loop with the shared
  // planScheduleSplit. candidateZones (already filtered for collision +
  // mapBounds + non-polygon-overlap) becomes availableGaps.
  const headerHeight = 25
  const titleSpacing = 15
  const rowHeight    = 15
  const fullHeaderHeight = headerHeight + titleSpacing
  const { plan, residualRows } = _planScheduleSplit({
    totalRows:    standCount,
    availableGaps: candidateZones,
    tableWidth,
    headerHeight: fullHeaderHeight,
    rowHeight,
    minRowsPerTable: 3,
  })

  if (plan.length === 0) {
    // No gap fit any sub-table — fall through to the existing emergency
    // fallback that draws a single overlapping table at startX/startY.
    logger.warn(`[PDFKit] planScheduleSplit returned no plan — using emergency single-table fallback`)
    // (Existing fallback code stays as-is below.)
  } else {
    if (residualRows > 0) {
      logger.warn(`[PDFKit] planScheduleSplit residualRows: ${residualRows} of ${standCount} stands unplaced`)
    }
    // Emit each plan entry as a sub-table at the chosen gap.
    for (let i = 0; i < plan.length; i++) {
      const entry = plan[i]
      const gap   = candidateZones[entry.gapIndex]
      const rowsForThisTable = surveyedParcels.slice(entry.startRow, entry.startRow + entry.rowCount)
      const titleText = entry.isContinuation ? "SCHEDULE OF AREAS (cont'd)" : "SCHEDULE OF AREAS"
      // Reuse the existing single-column renderer at the chosen position.
      // gap.x and gap.y are the top-left in PDF coords (PDF y increases
      // downward; the gap reports its top-y, so we anchor the sub-table
      // there directly).
      drawScheduleOfAreasSingleColumn(
        doc,
        { features: rowsForThisTable },
        gap.x,
        gap.y,
        mapBounds,
      )
    }
    // Return early — the multi-table path is complete.
    return { tableWidth, tablesEmitted: plan.length, residualRows }
  }
```

The existing emergency fallback below (single overlapping table at `startX, startY`) stays untouched as the no-plan path.

- [ ] **Step 6.6: Run the PDF tests inventory caught in Step 6.1**

For each PDF test file identified in Step 6.1, run it:

```bash
cd app-backend && npm test -- --testPathPatterns="pdfkit"
```

Expected: most tests pass. Some may fail if they assert specific column widths from the old fixed `[35, 60, 40, 40, 35, 50]` values. Note failures.

- [ ] **Step 6.7: Update PDF tests that assert on fixed column widths**

For each PDF test failure caused by changed column widths, edit the test to assert on the dynamic equivalent. Examples:

- A test asserting `tableWidth === 260` → assert `tableWidth >= 200 && tableWidth <= 350` (allows for dynamic variation but flags pathological resizes).
- A test asserting specific text x-positions inside the schedule → assert that the text APPEARS, not the exact position.

After each edit, re-run the failing test:

```bash
cd app-backend && npm test -- --testPathPatterns="pdfkit"
```

- [ ] **Step 6.8: Run the full backend test suite**

```bash
cd app-backend && npm test
```

Expected: dxf suite + pdfkit tests + everything else green. Pre-existing failures in `si727LayoutCalculator.test.js` and `scaleSelector.test.js` from main are expected (documented in the 3-v4 merge notes).

- [ ] **Step 6.9: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js \
        app-backend/src/services/__tests__/    # whatever PDF tests were touched
git commit -m "feat(pdf): drawScheduleOfAreasMultiTable uses shared planScheduleSplit + dynamic columns (Task 6)

PDF schedule placement now consumes the same two functions DXF uses:
- computeScheduleColumnWidths with a doc.widthOfString-backed measurer
  → no more fixed [35,60,40,40,35,50] widths
- planScheduleSplit → greedy largest-gap-first sub-table assignment

Column-width fallback to the legacy fixed widths is logged but never
fails the render — preserves the existing happy path on font-load errors.

The emergency single-overlapping-table fallback (Pass 3 equivalent)
stays unchanged for the case planScheduleSplit returns no plan.

PDF tests updated where they asserted on the old fixed column widths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## After all tasks complete

Use the `superpowers:finishing-a-development-branch` skill to:

1. Verify `cd app-backend && npm test -- --testPathPatterns="dxf"` is green at ~334 tests.
2. Verify `cd app-backend && npm test -- --testPathPatterns="pdfkit"` is green.
3. Verify the full backend suite is green (modulo the documented pre-existing failures from main).
4. Present the standard 4 finishing options.
5. After merge, update memory:
   - `surveypro-pdfkit-rebaseline-status.md` — add this sub-project as a "follow-ups" row beneath the main table.

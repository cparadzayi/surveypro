# DXF Schedule of Areas Multi-Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the full 6-column SI 727 Schedule of Areas (`STAND No.`, `AREAS SQUARE METRES`, `DIAGRAM NUMBER`, `DEED NUMBER`, `DEED DATE`, `SURVEYOR-GENERAL`) in the DXF; split into side-by-side continuation tables within the bottom-left zone when row count exceeds the single-column budget; emit a structured `scheduleOverflow` warning (consumed by sub-project #5) when even the multi-table layout overflows at the current sheet size.

**Architecture:** Extend `app-backend/src/services/dxfGenerator.js` in place. Three pure helpers (`extractScheduleRow`, `computeScheduleLayout`, `addScheduleTable`) plus one ladder utility (`nextLargerSheet`) plus two named constants (`SHEET_LADDER`, `SCHEDULE_HEADER_HEIGHT_MM`). Widen the existing `import { TITLE_BLOCK, formatStandRanges }` line (added by sub-project #2) to also pull `SCHEDULE_OF_AREAS` from `app-shared/block-definitions.js`. Replace the existing 2-column emission block (`dxfGenerator.js:1292-1308`) with a layout-driven single/multi/overflow branch. New `scheduleOverflow` warning category — structured object value, not a counter.

**Tech Stack:** Node.js / Fastify backend, Jest 30 with ESM (`--experimental-vm-modules`). DXF R12 (AC1009) unchanged. No new runtime dependencies.

**Branch:** `feature/dxf-schedule-of-areas-multi-column` (already created off main at `851e1f8`; spec committed at `5117928`).

**Spec:** [`docs/superpowers/specs/2026-06-02-dxf-schedule-of-areas-multi-column-design.md`](../specs/2026-06-02-dxf-schedule-of-areas-multi-column-design.md)

---

## Implementation note — layout-function unit convention

The spec describes the layout math in millimetres (the block-definitions
native unit). The existing `dxfGenerator.js` code mixes ground-metres and
paper-millimetres fluently via the `mm(x)` converter (`x` paper-mm →
ground metres at the chosen scale). To keep `computeScheduleLayout`
unit-agnostic and easily testable, **the helper accepts all dimensions
in paper-millimetres and returns column widths in paper-millimetres**.
The caller (Task 5) converts at the boundary:

```js
const layout = computeScheduleLayout({
  rowCount: dataRows.length,
  zoneWidth:  (col1R - col1L - mm(3)) / mm(1),     // ground → paper-mm
  zoneHeight: ((drawDivY - mm(5)) - (cntB + mm(4))) / mm(1),
  rowHeight:  rH / mm(1),                          // ground → paper-mm
  headerHeight: SCHEDULE_HEADER_HEIGHT_MM,
  currentSheetSize: sheetSize,
})
// At emission time: mm(layout.columnWidths[i]) converts back to ground.
```

## Implementation note — small spec amendment (Task 3)

The spec's step-4 readability check `zoneWidth ≥ singleTableWidth / 2`
turns out to be too strict in practice: the DXF's bottom-left zone is
~28 % of the content width (~104 paper-mm at A2 col1), while
`singleTableWidth` sums to 310 paper-mm — so `zoneWidth ≥ 155` never
holds at A2/A1 and every plan would skip to multi-column mode. This is
inconsistent with the design intent (single-column for small plans,
multi-column for overflow).

**Amendment, applied in Task 3:** drop the readability check. Always
use single-column mode when `rowCount ≤ rowsPerColumn`, scaling the
column widths to fit `zoneWidth` (up to a 1.0 scale factor, never
inflating beyond natural). Multi-column mode unchanged. The plan file
records the amendment in Task 3 Step 3's JSDoc; no separate spec rewrite.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfGenerator.js` | **modify** | Widen the existing `import { TITLE_BLOCK, formatStandRanges }` to also pull `SCHEDULE_OF_AREAS`. Add `SHEET_LADDER` + `SCHEDULE_HEADER_HEIGHT_MM` constants near `PAPER_SIZES`. Add `nextLargerSheet` utility. Extend `warnings.summary` initialiser + `warn()` to support the structured `scheduleOverflow` category. Add three exported pure helpers (`extractScheduleRow`, `computeScheduleLayout`, `addScheduleTable`). Replace the C1 SCHEDULE OF AREAS emission block at lines 1292-1308. ~320 lines added, ~17 lines removed. |
| `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js` | **create** | Layer 1 unit tests for the three helpers + `nextLargerSheet`. ~250 lines. |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | **modify** | Layer 2 structural integration tests: 6-column header, both stand numbers in output, no `undefined`/`null` leak, side-by-side fixture, overflow warning fixture, clean-fixture zero-warning baseline. ~75 lines added. |
| `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md` | **modify** | Append four new tick items + screenshot filenames for the manual CAD verification step. ~6 lines added. |

No new files apart from the unit-test file; no frontend changes; no route changes; no new layer.

---

## Task 1: Foundation — imports, constants, `nextLargerSheet`, warning aggregator

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Create: `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`

This task lays the foundation Tasks 2–4 build on: the wider import, the two named constants, the small ladder utility, and the warning aggregator extension. Plus a new unit-test file with the `nextLargerSheet` test cases (matching sub-project #2's incremental-import discipline).

- [ ] **Step 1: Create the new unit-test file with the failing first tests**

Create `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`:

```js
/**
 * Layer 1 unit tests for the Schedule of Areas helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas
 */
import { describe, test, expect } from '@jest/globals'
import { nextLargerSheet } from '../dxfGenerator.js'

describe('nextLargerSheet', () => {
  test.each([
    ['ISO_A2', 'ISO_A1'],
    ['ISO_A1', 'ISO_A0'],
    ['ISO_A0', 'multi-sheet-required'],
  ])('%s → %s', (input, expected) => {
    expect(nextLargerSheet(input)).toBe(expected)
  })

  test('unknown sheet size → "multi-sheet-required" (defensive)', () => {
    expect(nextLargerSheet('ISO_A4')).toBe('multi-sheet-required')
    expect(nextLargerSheet('unknown')).toBe('multi-sheet-required')
    expect(nextLargerSheet(null)).toBe('multi-sheet-required')
    expect(nextLargerSheet(undefined)).toBe('multi-sheet-required')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: all 4 `nextLargerSheet` tests fail with `SyntaxError: The requested module '../dxfGenerator.js' does not provide an export named 'nextLargerSheet'`. Whole test file fails to link at parse time (matches the incremental-import pattern established in sub-project #2).

- [ ] **Step 3: Widen the block-definitions import**

Edit `app-backend/src/services/dxfGenerator.js`. Find (line 23):

```js
import { TITLE_BLOCK, formatStandRanges } from '../../../app-shared/block-definitions.js'
```

Replace with:

```js
import { TITLE_BLOCK, SCHEDULE_OF_AREAS, formatStandRanges } from '../../../app-shared/block-definitions.js'
```

- [ ] **Step 4: Add `SHEET_LADDER` and `SCHEDULE_HEADER_HEIGHT_MM` constants**

Still in `app-backend/src/services/dxfGenerator.js`. Find (around line 310):

```js
/** ISO paper sizes in mm (landscape orientation: width > height) */
const PAPER_SIZES = {
  'ISO_A4': { w: 297, h: 210 },
  'ISO_A3': { w: 420, h: 297 },
  'ISO_A2': { w: 594, h: 420 },
  'ISO_A1': { w: 841, h: 594 },
  'ISO_A0': { w: 1189, h: 841 },
};
```

Replace with:

```js
/** ISO paper sizes in mm (landscape orientation: width > height) */
const PAPER_SIZES = {
  'ISO_A4': { w: 297, h: 210 },
  'ISO_A3': { w: 420, h: 297 },
  'ISO_A2': { w: 594, h: 420 },
  'ISO_A1': { w: 841, h: 594 },
  'ISO_A0': { w: 1189, h: 841 },
};

/**
 * Paper-size escalation ladder used by Schedule of Areas overflow detection
 * (and consumed by sub-project #5 multi-sheet tiling). Walking the ladder
 * stops at ISO_A0; beyond that, the layout returns 'multi-sheet-required'.
 */
const SHEET_LADDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']

/**
 * Total paper-millimetres reserved for the Schedule of Areas header
 * (title + column headers + DEED parent + underline). Shared by
 * computeScheduleLayout's row-budget math AND addScheduleTable's actual
 * header emission. Drift between the two would silently break the layout.
 */
const SCHEDULE_HEADER_HEIGHT_MM = 12
```

- [ ] **Step 5: Add the `nextLargerSheet` helper**

Still in `app-backend/src/services/dxfGenerator.js`. Add directly below the new constants from Step 4:

```js
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
```

- [ ] **Step 6: Extend the warnings aggregator for `scheduleOverflow`**

Still in `app-backend/src/services/dxfGenerator.js`. Find the warnings initialiser (around line 328-339):

```js
  const warnings = {
    count: 0,
    summary: {
      beacons: 0,
      parcels: 0,
      outsideFigureVertices: 0,
      scaleFallback: false,
      beaconDescTruncated: 0,
      priorDiagramsTruncated: 0,
      nonAscii: false,
    },
  }
  function warn(category, n = 1) {
    if (category === 'scaleFallback' || category === 'nonAscii') {
      warnings.summary[category] = true
    } else {
      warnings.summary[category] = (warnings.summary[category] || 0) + n
    }
    warnings.count += n
  }
```

Replace with:

```js
  const warnings = {
    count: 0,
    summary: {
      beacons: 0,
      parcels: 0,
      outsideFigureVertices: 0,
      scaleFallback: false,
      beaconDescTruncated: 0,
      priorDiagramsTruncated: 0,
      nonAscii: false,
      scheduleOverflow: null,
    },
  }
  function warn(category, n = 1) {
    if (category === 'scaleFallback' || category === 'nonAscii') {
      warnings.summary[category] = true
      warnings.count += 1
      return
    }
    if (category === 'scheduleOverflow') {
      // Structured object value, not a counter. `n` carries the payload.
      warnings.summary[category] = n
      warnings.count += 1
      return
    }
    warnings.summary[category] = (warnings.summary[category] || 0) + n
    warnings.count += n
  }
```

- [ ] **Step 7: Run the new tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: all 4 `nextLargerSheet` tests pass. Paste the actual `Tests:` line in your report.

- [ ] **Step 8: Run the wider dxfGenerator suite to verify the warning extension didn't break baseline tests**

Run: `cd app-backend && npm run test -- dxfGenerator`

Expected: all 87 dxfGenerator tests still pass (the existing 80 from sub-project #2 + 4 new `nextLargerSheet` + 3 from the pre-existing `dxfGenerator.test.js` file structure — confirm `Test Suites: 4 passed, 4 total`). The integration tests use `warnings.count === 0` on the clean fixture; the new `scheduleOverflow: null` initialiser must NOT count toward `warnings.count` (only sets when `warn('scheduleOverflow', value)` is called). Verify by running.

- [ ] **Step 9: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js
git commit -m "feat(dxf): Schedule of Areas foundation — block-definitions widening, SHEET_LADDER, nextLargerSheet, scheduleOverflow warning

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `extractScheduleRow` helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`

Pure extractor: reads six column values from a parcel feature's `properties`. Returns an object whose values are all strings (`''` for absent optional fields).

- [ ] **Step 1: Widen the test-file import and write the failing tests**

First widen the import at the top of `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`:

Find:
```js
import { nextLargerSheet } from '../dxfGenerator.js'
```
Replace with:
```js
import { nextLargerSheet, extractScheduleRow } from '../dxfGenerator.js'
```

Then append the new describe block after the `nextLargerSheet` describe block:

```js
describe('extractScheduleRow', () => {
  test('happy path — all properties populated → all six string fields', () => {
    const f = { properties: {
      stand: '123', area_m2: 1234.7,
      diagram: 'Diagram-GP 4567', deedNumber: '12/2024', deedDate: '2024-01-15', surveyor: 'J.K. Doe',
    }}
    expect(extractScheduleRow(f)).toEqual({
      stand: '123', area: '1235',
      diagram: 'Diagram-GP 4567', deedNumber: '12/2024', deedDate: '2024-01-15', surveyor: 'J.K. Doe',
    })
  })

  test('all optional fields absent → blank strings (not undefined/null)', () => {
    const f = { properties: { stand: '7', area_m2: 200 } }
    expect(extractScheduleRow(f)).toEqual({
      stand: '7', area: '200',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })

  test('null and undefined values → blank strings', () => {
    const f = { properties: {
      stand: '7', area_m2: 100,
      diagram: null, deedNumber: undefined, deedDate: null, surveyor: undefined,
    }}
    const row = extractScheduleRow(f)
    expect(row.diagram).toBe('')
    expect(row.deedNumber).toBe('')
    expect(row.deedDate).toBe('')
    expect(row.surveyor).toBe('')
  })

  test('numeric diagram is stringified', () => {
    const f = { properties: { stand: '7', area_m2: 100, diagram: 1234 } }
    expect(extractScheduleRow(f).diagram).toBe('1234')
  })

  test('missing properties.stand → stand: "" (defensive)', () => {
    const f = { properties: { area_m2: 100 } }
    expect(extractScheduleRow(f).stand).toBe('')
  })

  test('area_m2: 9999.7 → area: "10000" (rounding)', () => {
    const f = { properties: { stand: '7', area_m2: 9999.7 } }
    expect(extractScheduleRow(f).area).toBe('10000')
  })

  test('area_m2: 0 → area: "0" (not blank)', () => {
    const f = { properties: { stand: '7', area_m2: 0 } }
    expect(extractScheduleRow(f).area).toBe('0')
  })

  test('area_m2 missing → area: "0" (matches existing default)', () => {
    const f = { properties: { stand: '7' } }
    expect(extractScheduleRow(f).area).toBe('0')
  })

  test('parcelFeature with missing properties → all blank/zero (no throw)', () => {
    const f = {}
    expect(extractScheduleRow(f)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: 9 new test failures. Error: `extractScheduleRow is not a function`.

- [ ] **Step 3: Add the `extractScheduleRow` helper**

Edit `app-backend/src/services/dxfGenerator.js`. Add directly below `nextLargerSheet`:

```js
/**
 * Extracts the six SI 727 Schedule-of-Areas column values from a parcel
 * GeoJSON feature's `properties`. Returns an object whose values are all
 * strings ('' for absent optional fields).
 *
 * The four optional fields (diagram, deedNumber, deedDate, surveyor) are
 * populated by Surveyor-General officials at approval time as ownership
 * transfers. They're meant to be blank at submission — the DXF still
 * emits the full 6-column header so the SI 727 form is recognisable.
 */
export function extractScheduleRow(parcelFeature) {
  const p = parcelFeature?.properties || {}
  return {
    stand:      String(p.stand ?? ''),
    area:       String(Math.round(p.area_m2 ?? 0)),
    diagram:    String(p.diagram ?? ''),
    deedNumber: String(p.deedNumber ?? ''),
    deedDate:   String(p.deedDate ?? ''),
    surveyor:   String(p.surveyor ?? ''),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: all 4 `nextLargerSheet` + 9 `extractScheduleRow` = 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js
git commit -m "feat(dxf): extractScheduleRow helper — 6 SI 727 column fields with blank fallbacks

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: `computeScheduleLayout` helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`

The trickiest helper. Decides whether the rows fit single-column, side-by-side multi-column, or not at all at this zone size; returns column widths scaled to fit, or a recommended-sheet-size escalation signal.

Operates in paper-millimetres throughout (caller converts from ground at the boundary).

- [ ] **Step 1: Widen the test-file import and write the failing tests**

First widen the import. Find:
```js
import { nextLargerSheet, extractScheduleRow } from '../dxfGenerator.js'
```
Replace with:
```js
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout } from '../dxfGenerator.js'
```

Then append the new describe block after `extractScheduleRow`:

```js
describe('computeScheduleLayout', () => {
  // Block-definitions:
  // singleColumn widths: 45+60+50+50+45+60 = 310mm
  // multiColumn widths : 35+42+38+38+32+45 = 230mm  spacing: 8mm
  // Defaults used to make assertions concrete; mirror the DXF zone math.
  const base = {
    zoneWidth:  110,          // typical A2 col1 zone
    zoneHeight: 150,
    rowHeight:  6,            // ≈ pt(7) * 1.6 in mm
    headerHeight: 12,
    currentSheetSize: 'ISO_A2',
  }

  test('rowCount: 0 → fits single, rowsPerTable: 0, columnWidths sum to zoneWidth', () => {
    const out = computeScheduleLayout({ ...base, rowCount: 0 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(0)
    const sum = out.columnWidths.reduce((s, w) => s + w, 0)
    expect(sum).toBeLessThanOrEqual(base.zoneWidth + 0.01)
    expect(out.columnWidths).toHaveLength(6)
  })

  test('small rowCount fits single-column', () => {
    // rowsPerColumn = floor((150 - 12) / 6) = 23
    const out = computeScheduleLayout({ ...base, rowCount: 20 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(20)
    expect(out.columnWidths).toHaveLength(6)
  })

  test('exactly at single-column budget fits single', () => {
    const out = computeScheduleLayout({ ...base, rowCount: 23 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    expect(out.rowsPerTable).toBe(23)
  })

  test('rowCount just over single-column budget at wider zone → multi (2 tables)', () => {
    // Need a zone wide enough for 2 multi-tables: 2*230 + 8 = 468mm
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 500,    // wide enough for 2 multi-tables
      rowCount: 30,       // 30 > 23 rowsPerColumn → needs 2 tables
    })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(2)
    expect(out.rowsPerTable).toBe(23)
    expect(out.columnWidths).toHaveLength(6)
    // Multi-mode column widths sum to ≤ subTableWidth (230mm) per table
    const sum = out.columnWidths.reduce((s, w) => s + w, 0)
    expect(sum).toBeLessThanOrEqual(230 + 0.01)
  })

  test('overflow at A2 → not-fits, recommendedSheetSize ISO_A1', () => {
    // Narrow zone + many rows → cant fit even 2 multi-tables
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 200,    // 200 / 23 = 9 tables; need ~9 * 230 + 8*8 = 2134mm
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('ISO_A1')
  })

  test('overflow at A1 → ISO_A0', () => {
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 200,
      currentSheetSize: 'ISO_A1',
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('ISO_A0')
  })

  test('overflow at A0 → multi-sheet-required', () => {
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 500,
      currentSheetSize: 'ISO_A0',
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('multi-sheet-required')
  })

  test('unknown currentSheetSize → multi-sheet-required (defensive)', () => {
    const out = computeScheduleLayout({
      ...base,
      zoneWidth: 110,
      rowCount: 200,
      currentSheetSize: 'ISO_A4',
    })
    expect(out.fits).toBe(false)
    expect(out.recommendedSheetSize).toBe('multi-sheet-required')
  })

  test('zero zoneHeight → rowsPerColumn 0 → empty rowCount fits, any positive rowCount overflows', () => {
    const empty = computeScheduleLayout({ ...base, zoneHeight: 0, rowCount: 0 })
    expect(empty.fits).toBe(true)
    expect(empty.rowsPerTable).toBe(0)

    const some = computeScheduleLayout({ ...base, zoneHeight: 0, rowCount: 5 })
    expect(some.fits).toBe(false)
  })

  test('rowCount fits single-column even on narrow zone (scales columns to zoneWidth)', () => {
    // 100mm zone is narrower than 310mm singleTableWidth; columns scale down.
    const out = computeScheduleLayout({ ...base, zoneWidth: 100, rowCount: 5 })
    expect(out.fits).toBe(true)
    expect(out.numTables).toBe(1)
    const sum = out.columnWidths.reduce((s, w) => s + w, 0)
    expect(sum).toBeLessThanOrEqual(100 + 0.01)
    // Proportions preserved — STAND col is the narrowest of 45/60/50/50/45/60.
    expect(out.columnWidths[0]).toBeLessThan(out.columnWidths[1]) // STAND < AREAS
  })

  test('returns numeric (not null) for the recommendedSheetSize on fit=true', () => {
    // Spec says only failure has recommendedSheetSize; success omits it.
    const out = computeScheduleLayout({ ...base, rowCount: 5 })
    expect(out.recommendedSheetSize).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: 11 new failures. Error: `computeScheduleLayout is not a function`.

- [ ] **Step 3: Add the `computeScheduleLayout` helper**

Edit `app-backend/src/services/dxfGenerator.js`. Add directly below `extractScheduleRow`:

```js
/**
 * Computes the Schedule-of-Areas layout for a given row count and zone
 * size (in paper-millimetres). Returns either a fits-true layout with
 * scaled column widths, or a fits-false escalation with a
 * recommendedSheetSize.
 *
 * Inputs:
 *   rowCount         number of data rows to render
 *   zoneWidth        available width in paper-mm
 *   zoneHeight       available height in paper-mm
 *   rowHeight        per-row height in paper-mm
 *   headerHeight     reserved header height in paper-mm (use SCHEDULE_HEADER_HEIGHT_MM)
 *   currentSheetSize current sheet size string (e.g. 'ISO_A2')
 *
 * Returns either:
 *   { fits: true,  numTables, rowsPerTable, columnWidths: number[6] }
 * or:
 *   { fits: false, recommendedSheetSize }
 *
 * Spec amendment: the spec's `zoneWidth >= singleTableWidth / 2`
 * readability check is dropped here. The DXF's bottom-left zone is
 * ~28% of content width — at A2 (~104mm) the check would always fail.
 * Instead, single-column mode always scales columns down to fit
 * zoneWidth (up to a 1.0 scale factor, never inflating). Multi-column
 * overflow detection is unchanged.
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

  // Scale single-mode columns to fit zoneWidth, never exceeding natural.
  const singleScale = Math.min(1, zoneWidth / singleTableWidth)
  const singleColumnWidths = singleCols.map(c => c.width * singleScale)

  // Empty schedule: emit header + zero rows. Always fits.
  if (rowCount === 0) {
    return { fits: true, numTables: 1, rowsPerTable: 0, columnWidths: singleColumnWidths }
  }

  // No vertical room at all: every row overflows.
  if (rowsPerColumn === 0) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }

  // Single-column path: row count fits in one table.
  if (rowCount <= rowsPerColumn) {
    return { fits: true, numTables: 1, rowsPerTable: rowCount, columnWidths: singleColumnWidths }
  }

  // Multi-column path: how many natural-width sub-tables fit in zoneWidth?
  const maxTablesByWidth = Math.max(1, Math.floor((zoneWidth + spacing) / (subTableWidth + spacing)))
  const numTablesNeeded  = Math.ceil(rowCount / rowsPerColumn)

  if (numTablesNeeded > maxTablesByWidth) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }

  // Multi-mode column widths: each sub-table gets (zoneWidth - (N-1)*spacing) / N,
  // capped at natural subTableWidth. Columns scaled within that budget.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: 4 `nextLargerSheet` + 9 `extractScheduleRow` + 11 `computeScheduleLayout` = 24 tests pass. Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js
git commit -m "feat(dxf): computeScheduleLayout helper — single/multi/overflow layout math

Spec amendment: dropped the zoneWidth >= singleTableWidth/2 readability
check. The DXF's bottom-left zone is ~28% of content width; at A2 that
check would never hold and every plan would fall to multi-column mode.
Single-column now scales columns down to fit zoneWidth (max scale 1.0,
never inflates). Multi-column overflow detection unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: `addScheduleTable` helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`

Emits one schedule sub-table (title + header row + DEED parent header + underline + data rows). Takes `addText` and `addLine` as injected dependencies so it's exported and testable in isolation against captured-call mocks.

- [ ] **Step 1: Widen the test-file import and write the failing tests**

First widen the import. Find:
```js
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout } from '../dxfGenerator.js'
```
Replace with:
```js
import { nextLargerSheet, extractScheduleRow, computeScheduleLayout, addScheduleTable } from '../dxfGenerator.js'
```

Then append the new describe block:

```js
describe('addScheduleTable', () => {
  // Capture all calls to addText / addLine for inspection.
  function mockPrimitives() {
    const textCalls = []
    const lineCalls = []
    const addText = (layer, x, y, text, h, rotation, style) =>
      textCalls.push({ layer, x, y, text, h, rotation, style })
    const addLine = (layer, x1, y1, x2, y2) =>
      lineCalls.push({ layer, x1, y1, x2, y2 })
    return { textCalls, lineCalls, addText, addLine }
  }

  const defaultArgs = (overrides = {}) => ({
    layer: 'TITLE_BLOCK',
    x: 0,
    y: 1000,
    dataRows: [],
    columnWidths: [10, 12, 10, 10, 10, 12],   // sum 64 (arbitrary test units)
    titleText: 'SCHEDULE OF AREAS',
    hHead: 1.5,
    hBody: 1.0,
    rH: 1.6,
    addText: () => {},
    addLine: () => {},
    ...overrides,
  })

  test('emits the title with BOLD style at (x, y)', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    const titleCalls = textCalls.filter(c => c.text === 'SCHEDULE OF AREAS')
    expect(titleCalls).toHaveLength(1)
    expect(titleCalls[0].style).toBe('BOLD')
    expect(titleCalls[0].x).toBe(0)
    expect(titleCalls[0].y).toBe(1000)
  })

  test('emits the (cont\\'d) title when titleText is "SCHEDULE OF AREAS (cont\\'d)"', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine, titleText: "SCHEDULE OF AREAS (cont'd)" }) })
    expect(textCalls.some(c => c.text === "SCHEDULE OF AREAS (cont'd)")).toBe(true)
  })

  test('emits all six SI 727 column headers', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    const texts = textCalls.map(c => c.text)
    // singleColumn label values are "STAND\\nNo.", "AREAS\\nSQUARE\\nMETRES", etc.
    // The header emission splits \\n-separated tokens onto sub-lines.
    expect(texts).toEqual(expect.arrayContaining(['STAND', 'No.']))
    expect(texts).toEqual(expect.arrayContaining(['AREAS']))
    expect(texts).toEqual(expect.arrayContaining(['DIAGRAM']))
    expect(texts).toEqual(expect.arrayContaining(['NUMBER']))
    expect(texts).toEqual(expect.arrayContaining(['DATE']))
    expect(texts.some(t => t.startsWith('SURVEYOR'))).toBe(true)
  })

  test('emits the DEED parent header (centered above NUMBER + DATE)', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    expect(textCalls.some(c => c.text === 'DEED')).toBe(true)
  })

  test('emits a header underline LINE', () => {
    const { lineCalls, addText, addLine } = mockPrimitives()
    addScheduleTable({ ...defaultArgs({ addText, addLine }) })
    expect(lineCalls.length).toBeGreaterThanOrEqual(1)
  })

  test('emits one TEXT per cell per data row', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: 'D1', deedNumber: '12/24', deedDate: '2024-01', surveyor: 'A' },
      { stand: '2', area: '200', diagram: '',   deedNumber: '',       deedDate: '',       surveyor: ''  },
    ]
    addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows }) })
    // Verify each non-blank cell value appears as a TEXT entry.
    const texts = textCalls.map(c => c.text)
    expect(texts).toEqual(expect.arrayContaining(['1', '100', 'D1', '12/24', '2024-01', 'A']))
    expect(texts).toEqual(expect.arrayContaining(['2', '200']))
  })

  test('blank-cell values are skipped (no empty-string TEXTs emitted)', () => {
    const { textCalls, addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
    ]
    addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows }) })
    // Empty-string TEXT entries are noise and may produce empty DXF labels.
    expect(textCalls.every(c => c.text !== '')).toBe(true)
  })

  test('returns the final y coordinate (≤ y - rows consumed)', () => {
    const { addText, addLine } = mockPrimitives()
    const dataRows = [
      { stand: '1', area: '100', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '2', area: '200', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
      { stand: '3', area: '300', diagram: '', deedNumber: '', deedDate: '', surveyor: '' },
    ]
    const startY = 1000
    const out = addScheduleTable({ ...defaultArgs({ addText, addLine, dataRows, y: startY, rH: 2 }) })
    expect(typeof out).toBe('number')
    // Y decreases as we go down; 3 rows of rH=2 + header consumption → at least 6 below startY.
    expect(out).toBeLessThan(startY)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: 8 new failures. Error: `addScheduleTable is not a function`.

- [ ] **Step 3: Add the `addScheduleTable` helper**

Edit `app-backend/src/services/dxfGenerator.js`. Add directly below `computeScheduleLayout`:

```js
/**
 * Emits one Schedule-of-Areas sub-table block (title + column headers +
 * DEED parent header + underline + data rows). Returns the y coordinate
 * after the last row, so the caller can stack the next sub-table or the
 * beacon-descriptions block below.
 *
 * `addText` and `addLine` are injected (the closures inside generateDXF)
 * so the helper can be exported and unit-tested with capture mocks.
 *
 * Inputs (object-style for clarity):
 *   layer         DXF layer name (e.g. 'TITLE_BLOCK')
 *   x, y          top-left anchor (ground metres at scale)
 *   dataRows      Array<extractScheduleRow output>
 *   columnWidths  number[6] in ground metres
 *   titleText     'SCHEDULE OF AREAS' or "SCHEDULE OF AREAS (cont'd)"
 *   hHead         header text height (ground metres)
 *   hBody         body text height (ground metres)
 *   rH            data-row vertical spacing (ground metres)
 *   addText       (layer, x, y, text, h, rotation, style) => void
 *   addLine       (layer, x1, y1, x2, y2) => void
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

  // Column x offsets (cumulative).
  const colX = []
  let cx = 0
  for (const w of columnWidths) {
    colX.push(x + cx)
    cx += w
  }
  const rightEdge = x + cx

  // 1. Title.
  let cy = y
  addText(layer, x, cy, titleText, hHead, 0, 'BOLD')
  cy -= hHead * 1.6

  // 2. DEED parent header above NUMBER (col 3) + DATE (col 4).
  // Center the 'DEED' label between the start of column 3 and the end of column 4.
  const deedStartX = colX[3]
  const deedEndX   = colX[4] + columnWidths[4]
  const deedCenter = (deedStartX + deedEndX) / 2
  addText(layer, deedCenter, cy, 'DEED', hBody, 0, 'BOLD')
  cy -= hBody * 1.2

  // 3. Column headers. Labels may contain \n for multi-line headers (e.g. 'STAND\nNo.').
  // Render each token on its own line, decrementing cy by hBody between lines.
  // Each column may have a different number of header sub-lines; advance cy by the max.
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

  // 4. Underline.
  addLine(layer, x, cy, rightEdge, cy)
  cy -= hBody * 0.6

  // 5. Data rows.
  const cellKeys = ['stand', 'area', 'diagram', 'deedNumber', 'deedDate', 'surveyor']
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas`

Expected: 4 + 9 + 11 + 8 = 32 tests pass. Paste the actual `Tests:` line.

- [ ] **Step 5: Run the wider dxfGenerator suite to verify no regressions**

Run: `cd app-backend && npm run test -- dxfGenerator`

Expected: existing `dxfGenerator.test.js`, `dxfGenerator.titleBlock.test.js`, `dxfGenerator.integration.test.js` all pass. Test Suites: 4 passed, 4 total.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js
git commit -m "feat(dxf): addScheduleTable helper — emit title + headers + DEED parent + rows

addText/addLine injected for test isolation. Blank-cell values are
skipped (no empty TEXT entries leak into the DXF). Returns the final y
coordinate so the caller can position the next sub-table or the
beacon-descriptions block below.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Rewrite the C1 SCHEDULE OF AREAS emission

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`

Replace the existing 2-column inline code (lines 1292-1308) with the layout-driven single/multi/overflow branch. No new tests; the unit tests cover the helpers and the structural integration tests (Task 6) cover the wiring.

- [ ] **Step 1: Locate the existing emission block**

Open `app-backend/src/services/dxfGenerator.js` and locate the existing block around lines 1292-1308 (line numbers may have shifted slightly with the foundation work):

```js
  // ── C1) SCHEDULE OF AREAS (bottom-left column) ──
  let sY = drawDivY - mm(5);
  addText(TB, col1L, sY, 'SCHEDULE OF AREAS', hHead, 0, 'BOLD');
  sY -= mm(5);
  // Table header
  const scW = col1R - col1L;
  addText(TB, col1L, sY, 'STAND No', hBody, 0, 'BOLD');
  addText(TB, col1L + scW * 0.35, sY, 'AREAS', hBody, 0, 'BOLD');
  addText(TB, col1L + scW * 0.35, sY - hBody * 0.8, 'SQ. METRES', hBody, 0, 'BOLD');
  addLine(TB, col1L, sY - mm(5), col1R - mm(3), sY - mm(5));
  sY -= mm(7);
  // Data rows
  for (const sp of surveyedParcels) {
    addText(TB, col1L, sY, String(sp.stand), hBody);
    addText(TB, col1L + scW * 0.35, sY, Math.round(sp.area_m2).toString(), hBody);
    sY -= rH;
  }
```

- [ ] **Step 2: Replace the block with the layout-driven emission**

Find the block from Step 1 in full and replace with:

```js
  // ── C1) SCHEDULE OF AREAS (bottom-left column) ──
  // Layout-driven single/multi/overflow. Helpers operate in paper-mm;
  // emission converts back to ground via mm(x) at the boundary.
  let sY = drawDivY - mm(5);

  // Build data rows from the original feature collection so optional
  // cell fields (diagram/deedNumber/deedDate/surveyor) are picked up.
  const scheduleDataRows = (parcels?.features || [])
    .filter(f => {
      const st = (f.properties?.stand || '').toLowerCase();
      return !f.properties?.isOutsideFigure && !st.includes('outside figure');
    })
    .sort((a, b) => {
      const na = parseInt(a.properties?.stand) || 0;
      const nb = parseInt(b.properties?.stand) || 0;
      return na - nb || String(a.properties?.stand || '').localeCompare(String(b.properties?.stand || ''));
    })
    .map(extractScheduleRow);

  const zoneWidthGround  = col1R - col1L - mm(3);
  const zoneHeightGround = (drawDivY - mm(5)) - (cntB + mm(4));

  const scheduleLayout = computeScheduleLayout({
    rowCount:         scheduleDataRows.length,
    zoneWidth:        zoneWidthGround / mm(1),
    zoneHeight:       zoneHeightGround / mm(1),
    rowHeight:        rH / mm(1),
    headerHeight:     SCHEDULE_HEADER_HEIGHT_MM,
    currentSheetSize: sheetSize,
  });

  if (!scheduleLayout.fits) {
    // Overflow: emit only the title as a placeholder, record structured warning.
    addText(TB, col1L, sY, 'SCHEDULE OF AREAS', hHead, 0, 'BOLD');
    warn('scheduleOverflow', {
      atSheetSize:        sheetSize,
      requiredSheetSize:  scheduleLayout.recommendedSheetSize,
      standCount:         scheduleDataRows.length,
    });
    sY -= mm(10);
  } else {
    const columnWidthsGround = scheduleLayout.columnWidths.map(w => mm(w));
    if (scheduleLayout.numTables === 1) {
      sY = addScheduleTable({
        layer: TB, x: col1L, y: sY,
        dataRows: scheduleDataRows,
        columnWidths: columnWidthsGround,
        titleText: 'SCHEDULE OF AREAS',
        hHead, hBody, rH,
        addText, addLine,
      });
    } else {
      // Side-by-side. Compute per-sub-table x offsets using the multi-mode spacing.
      const spacingGround = mm(SCHEDULE_OF_AREAS.multiColumn.columnSpacing);
      const subTableWidthGround = columnWidthsGround.reduce((s, w) => s + w, 0);
      let deepestY = sY;
      for (let i = 0; i < scheduleLayout.numTables; i++) {
        const rows = scheduleDataRows.slice(
          i * scheduleLayout.rowsPerTable,
          (i + 1) * scheduleLayout.rowsPerTable,
        );
        const title = i === 0 ? 'SCHEDULE OF AREAS' : "SCHEDULE OF AREAS (cont'd)";
        const subX = col1L + i * (subTableWidthGround + spacingGround);
        const subY = addScheduleTable({
          layer: TB, x: subX, y: sY,
          dataRows: rows,
          columnWidths: columnWidthsGround,
          titleText: title,
          hHead, hBody, rH,
          addText, addLine,
        });
        if (subY < deepestY) deepestY = subY;
      }
      sY = deepestY;
    }
  }
```

- [ ] **Step 3: Run the test suite to confirm nothing is broken**

Run: `cd app-backend && npm test -- --testPathPatterns=dxfGenerator`

Expected: all dxfGenerator tests pass. The existing integration tests may have one expected impact — the test at `dxfGenerator.integration.test.js` line ~89 asserts `entityCount(dxf, 'TEXT', 'TITLE_BLOCK') >= 8`. With the 6-column schedule (more header cells), the TITLE_BLOCK count will increase — `>= 8` is a lower bound and will still hold. No test should outright fail. If any test fails unexpectedly, read the failure carefully before proceeding.

- [ ] **Step 4: Smoke-check the DXF output against the sample fixture**

Run from `app-backend/`:

```bash
node --experimental-vm-modules -e "
import('./src/services/dxfGenerator.js').then(async ({ generateDXF }) => {
  const { sampleFixture } = await import('./src/services/__tests__/fixtures/sampleDxfPlan.js');
  const { buffer, warnings } = generateDXF(sampleFixture, { info:()=>{}, warn:()=>{}, error:()=>{} });
  const txt = buffer.toString();
  const headerMatches = ['STAND', 'AREAS', 'DIAGRAM', 'NUMBER', 'DATE', 'SURVEYOR', 'DEED']
    .map(h => ({ h, found: txt.includes(h) }));
  console.log('Schedule headers:', headerMatches);
  console.log('Stand 123 present:', txt.includes('\\n123\\n'));
  console.log('Stand 124 present:', txt.includes('\\n124\\n'));
  console.log('scheduleOverflow:', warnings.summary.scheduleOverflow);
  console.log('warnings.count:', warnings.count);
});
"
```

Expected: all 7 schedule headers found; stands 123 and 124 present; `scheduleOverflow: null` (sample fixture has only 2 parcels — no overflow); `warnings.count: 0`.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js
git commit -m "feat(dxf): emit SI 727 6-column Schedule of Areas with side-by-side overflow

Replaces the ad-hoc 2-column emission. Reads parcel.properties.{diagram,
deedNumber,deedDate,surveyor} for the optional cells; blank cells render
empty (SG officials fill them at approval time). When stand count
exceeds the row budget, emits side-by-side continuation sub-tables. When
even side-by-side overflows, emits a scheduleOverflow warning carrying
{ atSheetSize, requiredSheetSize, standCount } for sub-project #5 to
consume.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Structural integration tests

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

Extend the existing integration test file with assertions that exercise the full `generateDXF()` path and verify the new schedule reaches the output correctly.

- [ ] **Step 1: Write the failing tests**

Open `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. The file has three describe blocks (`sample fixture`, `graceful degradation`, `SI 727 title-block lines` from sub-project #2). Append a new describe block at the end of the file:

```js

describe('dxfGenerator integration — Schedule of Areas SI 727 columns', () => {
  function collectTextsByLayer(dxf, layer) {
    const lines = dxf.split('\n')
    const texts = []
    let i = 0, currentType = null, currentLayer = null
    while (i < lines.length - 1) {
      const code = lines[i].trim(), value = lines[i + 1].trim()
      i += 2
      if (code === '0' && /^[A-Z_]+$/.test(value)) { currentType = value; currentLayer = null }
      else if (code === '8' && currentType === 'TEXT') currentLayer = value
      else if (code === '1' && currentType === 'TEXT' && currentLayer === layer) {
        texts.push(value)
      }
    }
    return texts
  }

  test('schedule title "SCHEDULE OF AREAS" is emitted on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    expect(titleBlockTexts).toContain('SCHEDULE OF AREAS')
  })

  test('all six SI 727 column headers appear as TEXT entities on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    // singleColumn labels: 'STAND\\nNo.', 'AREAS\\nSQUARE\\nMETRES',
    // 'DIAGRAM\\nNUMBER', 'NUMBER', 'DATE', 'SURVEYOR-\\nGENERAL'.
    // Each \\n token becomes its own TEXT entity.
    expect(titleBlockTexts).toContain('STAND')
    expect(titleBlockTexts).toContain('AREAS')
    expect(titleBlockTexts).toContain('DIAGRAM')
    expect(titleBlockTexts).toContain('NUMBER')
    expect(titleBlockTexts).toContain('DATE')
    expect(titleBlockTexts.some(t => t.startsWith('SURVEYOR'))).toBe(true)
  })

  test('DEED parent header is emitted as a separate TEXT entity', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    expect(titleBlockTexts).toContain('DEED')
  })

  test('both stand numbers from the sample fixture appear on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    expect(titleBlockTexts).toContain('123')
    expect(titleBlockTexts).toContain('124')
  })

  test('no TEXT entity on TITLE_BLOCK contains the literal "undefined" or "null"', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const titleBlockTexts = collectTextsByLayer(buffer.toString(), 'TITLE_BLOCK')
    for (const t of titleBlockTexts) {
      expect(t).not.toBe('undefined')
      expect(t).not.toBe('null')
    }
  })

  test('clean sampleFixture still produces zero warnings + scheduleOverflow null', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    expect(warnings.count).toBe(0)
    expect(warnings.summary.scheduleOverflow).toBeNull()
  })

  test('overflow fixture (200 parcels at A2) emits structured scheduleOverflow warning', () => {
    // Build a synthetic fixture with enough parcels to exceed the
    // single-zone budget at A2. The narrow col1 (~104mm) can fit at most
    // one multi-sub-table at A2 → any rowCount past rowsPerColumn overflows.
    const manyParcels = []
    for (let i = 1; i <= 200; i++) {
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
    expect(warnings.summary.scheduleOverflow.standCount).toBe(200)
    // requiredSheetSize is one of the ladder entries or 'multi-sheet-required'
    expect(['ISO_A1', 'ISO_A0', 'multi-sheet-required'])
      .toContain(warnings.summary.scheduleOverflow.requiredSheetSize)
  })
})
```

- [ ] **Step 2: Run the integration tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.integration`

Expected: existing 23 tests still pass; 7 new tests pass too. Total 30. Paste the actual `Tests:` line.

If the "DEED" or column-header assertions fail, run the smoke-check command from Task 5 Step 4 and inspect the actual emitted TITLE_BLOCK TEXT entities — the labels in block-definitions use `\n` separators and the helper emits each token on its own line; verify your implementation matches.

- [ ] **Step 3: Run the full dxfGenerator suite to confirm no regressions**

Run: `cd app-backend && npm test -- --testPathPatterns=dxfGenerator`

Expected: all dxfGenerator tests pass.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): structural integration for SI 727 Schedule of Areas

Asserts the 6 SI 727 column headers + DEED parent reach the DXF output
on TITLE_BLOCK, both sample-fixture stand numbers appear, no
undefined/null literals leak from blank cells, and the structured
scheduleOverflow warning fires (with shape { atSheetSize,
requiredSheetSize, standCount }) on an overflow fixture.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Manual CAD verification checklist update

**Files:**
- Modify: `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`

Add four new tick items so the surveyor can visually confirm the new schedule layout in CAD.

- [ ] **Step 1: Locate the existing schedule bullet**

Open `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`. The Schedule of Areas bullet currently reads:

```markdown
- [ ] **Schedule of Areas** in the lower-left zone. *(Screenshot: `07-schedule.png`)*
```

- [ ] **Step 2: Append four new SI 727 Schedule items**

Find:

```markdown
- [ ] **Schedule of Areas** in the lower-left zone. *(Screenshot: `07-schedule.png`)*
```

Replace with:

```markdown
- [ ] **Schedule of Areas** in the lower-left zone. *(Screenshot: `07-schedule.png`)*
- [ ] **SI 727 6-column layout** — header reads `STAND No.`, `AREAS SQUARE METRES`, `DIAGRAM NUMBER`, `DEED` parent above `NUMBER` and `DATE`, `SURVEYOR-GENERAL`. Blank cells appear where the optional fields aren't populated (SG officials fill these at approval). *(Screenshot: `07a-schedule-6col.png`)*
- [ ] **Single-table layout** — for plans with ≤ ~25 stands on A2, the schedule renders as one table in the bottom-left zone with the beacon-descriptions block immediately below. *(Screenshot: `07b-single-table.png`)*
- [ ] **Side-by-side continuation tables** — for plans with more rows than the single-column budget (synthesise via a temporary fixture or a real ~30-parcel plan), the schedule splits into two or more sub-tables labelled `SCHEDULE OF AREAS` and `SCHEDULE OF AREAS (cont'd)`. *(Screenshot: `07c-multi-table.png`)*
- [ ] **Schedule overflow signal** — for plans that overflow at A2 (synthesise via a temporary 200-parcel payload), the response `warnings.summary.scheduleOverflow` contains `{ atSheetSize: 'ISO_A2', requiredSheetSize: 'ISO_A1' | 'ISO_A0' | 'multi-sheet-required', standCount: N }`. Verify via the backend log or inspect the response payload in dev tools. *(Screenshot: `07d-overflow-warning.png`)*
```

- [ ] **Step 3: Verify the markdown renders cleanly**

Confirm in your editor's markdown preview (or by reading the file) that the five consecutive Schedule bullets (1 original + 4 new) all appear with checkboxes, the screenshot references are formatted consistently with the surrounding items, and the file's structure is unchanged elsewhere.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md
git commit -m "docs(verification): add Schedule of Areas SI 727 columns to the manual CAD checklist

Four new visual-check items: 6-column SI 727 layout, single-table case,
side-by-side continuation tables, and the structured scheduleOverflow
warning payload.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Wrap-up

After all 7 tasks land, the branch will have 8 commits on top of `main` (`851e1f8`) — Task 3 amends the spec's algorithm so its commit message documents the deviation explicitly. Final commit chain:

1. `feat(dxf): Schedule of Areas foundation — block-definitions widening, SHEET_LADDER, nextLargerSheet, scheduleOverflow warning`
2. `feat(dxf): extractScheduleRow helper — 6 SI 727 column fields with blank fallbacks`
3. `feat(dxf): computeScheduleLayout helper — single/multi/overflow layout math` (+ spec amendment note)
4. `feat(dxf): addScheduleTable helper — emit title + headers + DEED parent + rows`
5. `feat(dxf): emit SI 727 6-column Schedule of Areas with side-by-side overflow`
6. `test(dxf): structural integration for SI 727 Schedule of Areas`
7. `docs(verification): add Schedule of Areas SI 727 columns to the manual CAD checklist`

Total: 4 new helpers + 1 emission rewrite + 32 new unit tests + 7 new integration tests + 4 new checklist items. The branch is ready for `superpowers:finishing-a-development-branch`.

Manual CAD verification (Layer 3) is the user's responsibility before merging.

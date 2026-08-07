# Schedule of Areas: 15cm width, simplified borders, one-line SURVEYOR-GENERAL

## Problem

Printed general-plan output shows the Schedule of Areas (STAND No. / AREAS SQUARE
METRES / DIAGRAM NUMBER / DEED NUMBER+DATE / SURVEYOR-GENERAL) table too narrow
at print scale (~9.2cm, content-fit only) and visually busy:

1. Table width should be ~15cm at print scale, with column widths widening
   proportionally (not just content-fit).
2. The horizontal line under each data row should be removed — rows should read
   as continuous vertical columns, not a boxed grid.
3. The table's right-edge vertical line should be removed.
4. The "SURVEYOR-GENERAL" column header currently wraps onto two lines
   ("SURVEYOR-" / "GENERAL") and should read on one line.

## Scope decisions (confirmed with user)

- Applies to **both PDF and DXF** output, not PDF only.
- Applies to **every** Schedule of Areas table, whether rendered as a single tall
  column or split into several side-by-side sub-tables (a split layout may end up
  with fewer, wider sub-tables to still fit the sheet — accepted trade-off).
- Extra width from the 15cm target is distributed **proportional to each
  column's current content-fit width** (today's relative ratios preserved, just
  scaled up uniformly).
- Column divider lines between STAND / AREAS / DIAGRAM / DEED / SURVEYOR-GENERAL
  are **kept** (full table height). Only the row-separator horizontals and the
  outer right edge are removed. The outer top/left/bottom border and the
  header's own internal rules (DEED merged-header divider, header/body divider)
  are kept.
- Header reads **"SURVEYOR-GENERAL"** (hyphenated, single line), not
  "SURVEYOR GENERAL".

## Architecture context

Both the PDF (`pdfkitGeoPDF.js`) and DXF (`dxfGenerator.js`) generators compute
column widths for the schedule via the same shared function,
`computeScheduleColumnWidths()` in `app-shared/block-definitions.js`. Its output
(`scheduleColumnWidthsPt` / `scheduleColumnWidthsG`) is threaded through:

- The shared sheet-layout planner (`sheetLayoutPlanner.js` → `calculateBlockPositions`
  in `pdfkitGeoPDF.js`), which decides whether the schedule needs to split into
  side-by-side sub-tables and how many, using the *same* dynamic width
  (`_schedSingleColWidth` prefers `scheduleColumnWidthsPt` when present).
- The PDF renderers `drawScheduleOfAreasSingleColumn` and
  `drawScheduleOfAreasMultiTable` (both take `scheduleColumnWidthsPt`).
- The DXF renderer `addScheduleTable` (`dxfScheduleHelpers.js`), via
  `columnWidthsG_local` in `dxfScheduleEmitter.js`, which prefers the caller's
  dynamic `helpers.columnWidthsG` over the static fallback.

Because every consuming path already reads from this one function's output,
**scaling the widths inside `computeScheduleColumnWidths()` is sufficient** —
no changes are needed to the placement/collision-avoidance/whitespace-search
code in `sheetLayoutPlanner.js`, `dxfScheduleEmitter.js`'s Pass 1/2/3 search, or
`calculateBlockPositions`'s split-column-count math, since they all consume the
already-scaled widths transparently.

`dxfScheduleEmitter.js`'s `computeScheduleLayout` (in `dxfScheduleHelpers.js`)
separately estimates row-budget/table-count using `SCHEDULE_OF_AREAS`'s static
widths, purely as a sizing *estimate* — actual placement is always validated
against real geometry by the existing multi-pass search (shrink/retry/escalate).
This estimate/actual drift already exists today (content-fit widths already
differ from the static defaults) and is out of scope to fully unify here.

Two render paths were found to be dead code and are **not** touched:
`drawScheduleOfAreasMultiColumn` in `pdfkitGeoPDF.js` (defined, never called)
and the whole `scheduleOfAreasMultiTable.js` file (CommonJS, never imported).

## Design

### 1. Width scaling — `app-shared/block-definitions.js`

Add a target-width constant and a proportional scale-up step to
`computeScheduleColumnWidths()`:

```js
// 15cm at print scale, in PDF points (150mm / 25.4 * 72).
export const SCHEDULE_TARGET_WIDTH_PT = 150 * (72 / 25.4)  // ≈ 425.2

export function computeScheduleColumnWidths({ ... }) {
  // ...existing content-fit width computation (unchanged)...
  const sum = widths.reduce((a, b) => a + b, 0)
  if (sum >= SCHEDULE_TARGET_WIDTH_PT) return widths  // never shrink below content
  const scale = SCHEDULE_TARGET_WIDTH_PT / sum
  return widths.map((w) => w * scale)
}
```

No caller-side changes needed — `pdfkitGeoPDF.js` and `dxfGenerator.js` both
already call `computeScheduleColumnWidths` and thread the result through
unchanged variable names (`_scheduleColumnWidthsPt`, `scheduleColumnWidthsPt`).

### 2. Border cleanup

**PDF** (`pdfkitGeoPDF.js`): `drawScheduleOfAreasSingleColumn` and the
per-sub-table drawing block inside `drawScheduleOfAreasMultiTable` currently
draw a full `doc.rect(x, rowY, tableWidth, rowHeight).stroke()` per row (this
is what produces both the per-row horizontal separators and, since each row
also stroke rectangles independently, the doubled visual weight at the right
edge) plus per-row/per-header column divider lines drawn twice (once for the
header, once again for every row).

Extract a shared helper in `pdfkitGeoPDF.js`:

```js
/**
 * Draws the Schedule of Areas grid: outer top/left/bottom border (no right
 * edge), column dividers running the full table height (the DEED|DATE
 * divider only starts at the sub-header row, matching the merged DEED
 * header), and the header/body divider rule. No per-row horizontal lines.
 */
function drawScheduleTableGrid(doc, { x, headerY, headerHeight, deedHeaderY,
  deedStartX, colWidths, rowHeight, rowCount }) {
  const tableWidth = colWidths.reduce((s, w) => s + w, 0)
  const bottomY = headerY + headerHeight + rowCount * rowHeight
  doc.lineWidth(0.5)
  // Outer: top, left, bottom — no right.
  doc.moveTo(x, headerY).lineTo(x + tableWidth, headerY).stroke()
  doc.moveTo(x, headerY).lineTo(x, bottomY).stroke()
  doc.moveTo(x, bottomY).lineTo(x + tableWidth, bottomY).stroke()
  // Header/body divider.
  doc.moveTo(x, headerY + headerHeight).lineTo(x + tableWidth, headerY + headerHeight).stroke()
  // DEED merged-header divider (unchanged).
  doc.moveTo(deedStartX, deedHeaderY).lineTo(deedStartX + colWidths[3] + colWidths[4], deedHeaderY).stroke()
  // Column dividers — full height, except DEED|DATE which starts at deedHeaderY.
  let cx = x
  for (let i = 0; i < colWidths.length - 1; i++) {
    cx += colWidths[i]
    const topY = (i === 3) ? deedHeaderY : headerY  // divider after DEED NUMBER (col index 3)
    doc.moveTo(cx, topY).lineTo(cx, bottomY).stroke()
  }
}
```

Both call sites keep their existing header/row *text* drawing (unchanged
positions — only the widened `colWidths` values change where text lands), but
stop calling `doc.rect(...).stroke()` and the manual per-row/per-header
`moveTo/lineTo` column-divider pairs; they call `drawScheduleTableGrid` once
per table instead, after the row loop (once `rowCount` is known).

**DXF** (`dxfScheduleHelpers.js: addScheduleTable`): smaller, localized edit —
this function already draws its full grid in one pass at the end:
- Remove the right-edge `addLine(layer, rightEdge, dataBotY, rightEdge, tableTopY)` call.
- Remove the `for (let r = 1; r < dataRows.length; r++) { ...divider... }` loop
  that draws a horizontal line between every two data rows.
- Column-divider loop (vertical, full height per column) is unchanged — it
  already satisfies "keep column dividers."

### 3. "SURVEYOR-GENERAL" one line

- `app-shared/block-definitions.js`: change both `SCHEDULE_OF_AREAS.singleColumn`
  and `.multiColumn` column definitions' `surveyor` entry label from
  `'SURVEYOR-\nGENERAL'` to `'SURVEYOR-GENERAL'`. This alone fixes DXF, which
  reads `col.label` and splits on `\n`.
- `pdfkitGeoPDF.js`: in both `drawScheduleOfAreasSingleColumn` and the
  `drawScheduleOfAreasMultiTable` per-table block, replace the two separate
  `doc.text("SURVEYOR-", ...)` / `doc.text("GENERAL", ...)` calls with one
  `doc.text("SURVEYOR-GENERAL", ...)` call, y-positioned at the vertical
  midpoint of the header box (`headerY + headerHeight / 2`, minus half the
  font's line height) so it sits centred in the row like the other
  single-line "STAND No." style headers, rather than pinned to the first of
  two header lines.

## Testing

- `app-shared` unit tests for `computeScheduleColumnWidths`: add a case
  asserting scale-up to `SCHEDULE_TARGET_WIDTH_PT` when content-fit sum is
  below target, and a case asserting no shrink when content-fit sum already
  exceeds target.
- `dxfScheduleHelpers.test.js` (`addScheduleTable`): update/add assertions
  that no right-edge line and no inter-row divider lines are emitted, and that
  the SURVEYOR-GENERAL header renders as a single `addText` call.
- `pdfkitGeoPDF` snapshot/unit tests covering the schedule: update expected
  line counts/border geometry for both `drawScheduleOfAreasSingleColumn` and
  `drawScheduleOfAreasMultiTable`, and assert the single-line SURVEYOR-GENERAL
  text call.
- Full backend suite (`npm test`) run at the end to catch any snapshot
  regressions in the wider schedule/placement tests (overflow, escalation,
  split, balancing) noted in `dxfGenerator.integration.test.js`.

## Out of scope

- `computeScheduleLayout`'s static-width row/table-count estimate in
  `dxfScheduleHelpers.js` (pre-existing estimate/actual drift, tolerated by
  the existing multi-pass placement search).
- `drawScheduleOfAreasMultiColumn` (dead code) and `scheduleOfAreasMultiTable.js`
  (orphaned file) — left untouched.
- The Outside Figure Data table (a different table on the same sheet) — not
  mentioned in the request.

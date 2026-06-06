# SI 727 Schedule of Areas — split-to-fit + dynamic columns — Design

**Sub-project:** Eliminate Schedule of Areas / Outside Figure Data overlap on both PDF and DXF generators, plus make schedule column widths dynamically fit their headers and data.

**Branch:** `feature/dxf-schedule-split-and-dynamic-cols`, branched from `main` at `58e46d3` (grid + padding merge).

**Predecessors:** [3-v3 single-source-of-truth](2026-06-05-dxf-bottom-zone-topology-design.md) (block-definitions established as canonical), [3-v4 bottom-zone topology](2026-06-05-dxf-bottom-zone-topology-design.md), the Pass-3-ignores-seed fix at `885ee2e`, and the schedule-grid-padding refactor at `087f516`.

## Motivation

Two user-reported issues motivate this sub-project:

1. **"No schedule of area tables should overlap the outside figure data. We can divide the offending tables into smaller tables and then fit them in available whitespaces."** The 3-v4 Pass 3 fix (commit `885ee2e`) intentionally allows the DXF schedule to overlap OFD as an absolute last resort. On the user's Maglas-density 240-stand plan, the schedule landed via Pass 3 with overlap. The user wants the algorithm to be smarter: split the schedule into more, smaller sub-tables that fit the available whitespace gaps without overlapping OFD or the parcel polygon.

2. **"Columns should be dynamic enough to fit column headers."** Today both generators use the fixed column widths `[35, 60, 40, 40, 35, 50]` pt from `app-shared/block-definitions.js:SCHEDULE_OF_AREAS.singleColumn.columns`. Headers fit at the current 6 pt font. But if data (long deed numbers like `"DG-12345/2024"`, long stand designations, or future header text changes) exceeds a column width, text overflows the cell silently.

## Scope

In scope:

- New shared function `computeScheduleColumnWidths` in `app-shared/block-definitions.js`. Per-column: `max(widest header token at headerFontSize, widest data value at bodyFontSize) + 2·padding + colMinFloor`. Text measurement is injected so PDF can use real font metrics and DXF can use its `charWidthRatio = 0.55` approximation.
- New shared function `planScheduleSplit` in `app-shared/block-definitions.js`. Greedy: ranks available whitespace gaps by row-capacity descending; assigns rows to gaps in chunks of `[minRowsPerTable=3, gap_capacity]`; returns `{ plan, residualRows }`.
- DXF schedule emitter (`dxfScheduleEmitter.js`): Pass 2 replaced. New Pass 2 calls `planScheduleSplit` with the whitespace zones returned by `computeWhitespaceZones` (already exposed from `dxfTopology.js`). Pass 1 (original size, honor obstacles) and Pass 3 (skip all, accept overlap) unchanged.
- DXF column widths now come from `computeScheduleColumnWidths` (called once in `dxfGenerator.js` before invoking the emitter), replacing the fixed widths threaded through `helpers.computeScheduleLayout`.
- PDF schedule placement (`pdfkitGeoPDF.js:drawScheduleOfAreasMultiTable`): column widths come from `computeScheduleColumnWidths` and the split logic at lines ~9290–9530 is rewritten to use `planScheduleSplit`. The current PDF logic already enumerates whitespace gaps for table candidates — that input is preserved.
- Tests across `block-definitions.js`, both generators' schedule emitters, and integration tests.

Out of scope:

- Frontend `si727LayoutCalculator.js`: stays at the current fixed-width estimate. On plans with unusually long data values, preflight may say "fits" when actual rendering pushes the schedule wider than the fixed estimate. Documented as a known limitation; address in a follow-up if it bites in practice.
- The OFD table itself, the SG approval box, the survey date statement, beacon descriptions: no changes. They keep their pre-3-v4 fixed layout in PDF and their 3-v4 topology placement in DXF.
- Multi-sheet tiling (sub-project #5): still deferred.

## Architecture

### `app-shared/block-definitions.js` — two new exports

```js
/**
 * Compute per-column widths for the Schedule of Areas table so headers
 * and data values never overflow their column. Widths are in PDF points.
 *
 * Per column:
 *   width = max(widest header token at headerFontSize,
 *               widest data value at bodyFontSize)
 *         + 2 * padding
 *   width = max(width, colMinFloor)         // 24 pt floor
 *
 * Returns 6 widths summing to the total tableWidth. Order matches
 * SCHEDULE_OF_AREAS.singleColumn.columns: [stand, area, diagram,
 * deedNumber, deedDate, surveyor].
 *
 * @param {Object} args
 * @param {Array<Object>} args.dataRows - schedule data rows; keys match column.key values
 * @param {number} args.headerFontSize - PDF pt for header text measurement
 * @param {number} args.bodyFontSize - PDF pt for data-cell text measurement
 * @param {(text:string, fontSize:number) => number} args.measureText - text-width measurer
 *        in PDF points. PDF passes a function backed by doc.widthOfString;
 *        DXF passes (text, fontSize) => text.length * fontSize * 0.55.
 * @param {number} [args.padding=4] - per-side cell padding in pt
 * @param {number} [args.colMinFloor=24] - per-column minimum width in pt
 * @returns {number[]} 6 column widths in pt
 */
export function computeScheduleColumnWidths({
  dataRows, headerFontSize, bodyFontSize, measureText,
  padding = 4, colMinFloor = 24,
}) { /* implementation */ }

/**
 * Plan how to split a schedule of totalRows stands across the available
 * whitespace gaps. Greedy: largest-capacity gap first, fills with as many
 * rows as it holds. Never below minRowsPerTable per sub-table (except
 * when totalRows < minRowsPerTable, in which case all rows fit one gap).
 *
 * Returns:
 *   plan: [{ gapIndex, startRow, rowCount, isContinuation }]
 *         where gapIndex is the original index in availableGaps, startRow
 *         is the index into dataRows where this sub-table starts (rows
 *         dataRows[startRow .. startRow+rowCount-1]), and isContinuation
 *         is true for all sub-tables after the first.
 *   residualRows: number of rows left unplaced. > 0 triggers caller-side
 *                 scheduleOverflow warn + Pass 3 fallback (DXF) or PDF
 *                 equivalent emergency rescue.
 *
 * Gaps narrower than tableWidth are silently skipped — they can't hold
 * a sub-table even of minimum size.
 *
 * @param {Object} args
 * @param {number} args.totalRows
 * @param {Array<{x:number,y:number,width:number,height:number}>} args.availableGaps
 * @param {number} args.tableWidth - sum of column widths in the same units as gaps
 * @param {number} args.headerHeight - total header rows height (title + DEED + sub-headers)
 * @param {number} args.rowHeight
 * @param {number} [args.minRowsPerTable=3]
 * @returns {{ plan: Array<{gapIndex:number,startRow:number,rowCount:number,isContinuation:boolean}>, residualRows: number }}
 */
export function planScheduleSplit({
  totalRows, availableGaps, tableWidth, headerHeight, rowHeight,
  minRowsPerTable = 3,
}) { /* implementation */ }
```

### DXF consumer

`dxfGenerator.js` (immediately before invoking the bottom-zone orchestrator):

```js
// Compute dynamic column widths once per generateDXF call.
const dxfMeasureText = (text, fontSize) => String(text).length * fontSize * 0.55
const scheduleColumnWidthsPt = computeScheduleColumnWidths({
  dataRows: surveyedFeatures.map(extractScheduleRow),
  headerFontSize: SCHEDULE_OF_AREAS.singleColumn.headerFontSize,
  bodyFontSize:   SCHEDULE_OF_AREAS.singleColumn.fontSize,
  measureText:    dxfMeasureText,
})
// Convert pt → mm at the boundary, then through helpers.mm at use site.
const scheduleColumnWidthsMM = scheduleColumnWidthsPt.map(w => w * PT_TO_MM_GEN)
```

The `scheduleColumnWidthsMM` array is passed into `placeBottomZoneBlocks` via the orchestrator's helpers bag (already the pattern for the four existing schedule helpers).

`dxfScheduleEmitter.js` — `emitScheduleOfAreasTopological` receives `columnWidthsMM` via the helpers bag (replacing the `computeScheduleLayout(...).columnWidths` fallback path). Pass 2 is rewritten:

```js
// PASS 2 — split-into-smaller. Replaces the pre-2026-06-06 consolidation
// (which built fewer-but-taller tables and rarely succeeded). New Pass 2
// asks for a list of available whitespace gaps from dxfTopology, then
// uses planScheduleSplit to choose a per-gap rowCount in [3, capacity].
if (placedPositions.length < layout.numTables) {
  const subTableWidthG = columnWidthsG.reduce((s, w) => s + w, 0)
  const availableGaps = computeWhitespaceZones({
    polygon, mapBounds: drawingZone, buffer: mm(POLYGON_BUFFER_MM),
    tableMinWidth: subTableWidthG, scanStep: mm(SCAN_STEP_MM),
  }).filter(gap =>
    // Exclude gaps overlapping the seedPlacedBlocks (orchestrator obstacles).
    !seedPlacedBlocks.some(b => rectanglesOverlap(gap, b, mm(BLOCK_SPACING_MM)))
  )
  const headerHeightG = mm(SCHEDULE_HEADER_HEIGHT_MM)
  const { plan, residualRows } = planScheduleSplit({
    totalRows:    dataRows.length,
    availableGaps,
    tableWidth:   subTableWidthG,
    headerHeight: headerHeightG,
    rowHeight:    rH,
    minRowsPerTable: 3,
  })
  placedPositions = []
  for (const entry of plan) {
    const g = availableGaps[entry.gapIndex]
    placedPositions.push({
      x: g.x, y: g.y + g.height - (headerHeightG + entry.rowCount * rH),
      width:  subTableWidthG,
      height: headerHeightG + entry.rowCount * rH,
      rowCount: entry.rowCount,
    })
  }
  if (residualRows > 0 && placedPositions.length > 0) {
    warn('scheduleOverflow', {
      atSheetSize: sheetSize,
      recommendedSheetSize: nextLargerSheet(sheetSize),
      placedStandCount: dataRows.length - residualRows,
      missingStandCount: residualRows,
      placedTables: placedPositions.length,
      phase: 'split-residual',
    })
  }
}
```

Pass 3 (skip-polygon + skip-seedPlacedBlocks rescue) remains as the absolute fallback when Pass 2 returns an empty plan.

### PDF consumer

`pdfkitGeoPDF.js:drawScheduleOfAreasMultiTable` is rewritten around lines 9290–9530:

- Column widths come from `computeScheduleColumnWidths({ dataRows: surveyedParcels, ..., measureText: (text, fontSize) => doc.font(fontFor(fontSize)).widthOfString(text) })`. Replaces the hard-coded `[35, 60, 40, 40, 35, 50]`.
- The existing whitespace-gap enumeration (~9290-9450) returns `availableGaps`. Pass to `planScheduleSplit` with `tableWidth = sum(columnWidths)`, `headerHeight = headerHeight + titleSpacing`, `rowHeight = 15`.
- Emit each entry in `plan`: the gap chosen, the row range `dataRows[startRow .. startRow + rowCount - 1]`, the (cont'd) flag.
- `residualRows > 0` → warn + emit a "schedule continues — N stands not placed" footnote (matches DXF's `scheduleOverflow` warn payload shape).

PDF's existing fallback (single-table at fixed position even if it overlaps) stays as the absolute rescue.

### Removed/replaced behavior

- DXF's `computeScheduleLayout` `numTables` / `rowsPerTable` outputs are no longer the authoritative split — they become an initial-budget feasibility check only (does the schedule fit at all on this sheet size?). Pass 1 still tries `layout.numTables` placements at original size; Pass 2 ignores `layout.numTables` and derives the split from gap capacity.
- PDF's `_schedNeedsSplit` / `_schedNumCols` / `_schedRowsPerCol` heuristics at `pdfkitGeoPDF.js:8713-8716` are no longer the source of truth. They become a sanity check the new logic falls back to only if `planScheduleSplit` returns `{ plan: [], residualRows: totalRows }`.

## `planScheduleSplit` algorithm

```
function planScheduleSplit({ totalRows, availableGaps, tableWidth, headerHeight,
                             rowHeight, minRowsPerTable = 3 }) {
  // Rank gaps by row-capacity descending. Skip gaps narrower than tableWidth.
  const candidates = []
  for (let i = 0; i < availableGaps.length; i++) {
    const g = availableGaps[i]
    if (g.width < tableWidth) continue
    const capacity = Math.floor((g.height - headerHeight) / rowHeight)
    if (capacity < minRowsPerTable && totalRows >= minRowsPerTable) continue
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

**Properties:**

- **Greedy by gap size** — fills the largest gap first, which minimizes the number of sub-tables emitted (matches PDF's existing preference).
- **Stable row order** — `startIndex` only moves forward, so stand numbering reads top-to-bottom across all sub-tables in placement order. Surveyors expect this.
- **No partial tables (with one exception)** — every emitted table has at least `minRowsPerTable=3` data rows. The exception: when `totalRows < minRowsPerTable` (e.g., a plan with only 2 stands), the first valid gap holds all rows even though it's below the minimum.
- **Residual is explicit** — `residualRows > 0` after the loop means some stands couldn't be placed. Caller fires `scheduleOverflow` warn with `residualRows` count and falls through to Pass 3 (DXF) or the PDF emergency-rescue path.

**Edge cases:**

| Scenario | Behavior |
|---|---|
| `availableGaps` empty (polygon fills zone, OFD claims rest) | Returns `{ plan: [], residualRows: totalRows }` → caller hits Pass 3 |
| `totalRows < minRowsPerTable` (e.g., 2 stands) | First gap holds all rows; minimum applies to splits, not undersized plans |
| One huge gap that fits everything | `plan` has 1 entry, `isContinuation: false`. Same as today's single-table path |
| Many small gaps each fit exactly `minRowsPerTable` | `plan` may emit many sub-tables, each holding 3 rows. Visually dense but every stand recorded |

## `computeScheduleColumnWidths` algorithm

```
function computeScheduleColumnWidths({ dataRows, headerFontSize, bodyFontSize,
                                       measureText, padding = 4, colMinFloor = 24 }) {
  const cols = SCHEDULE_OF_AREAS.singleColumn.columns
  const widths = []
  for (const col of cols) {
    const headerTokens = String(col.label).split('\n')
    const widestHeader = Math.max(
      ...headerTokens.map(t => measureText(t, headerFontSize))
    )
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

**Behavior on typical Zimbabwean cadastral data:**

| Column | Header tokens | Widest header (6 pt) | Typical data (7 pt) | Output |
|---|---|---|---|---|
| stand | `["STAND","No."]` | "STAND" ≈ 18 pt | "1234" ≈ 11 pt | 18 + 8 = 26 pt (floor at 24) |
| area | `["AREAS","SQUARE","METRES"]` | "METRES" ≈ 21.6 pt | "2.1410Ha" ≈ 23.5 pt | 23.5 + 8 = 31.5 pt |
| diagram | `["DIAGRAM","NUMBER"]` | "DIAGRAM" ≈ 25.2 pt | "GP-12345" ≈ 22 pt | 25.2 + 8 = 33.2 pt |
| deedNumber | `["NUMBER"]` | "NUMBER" ≈ 21.6 pt | "DG-12345/2024" ≈ 36 pt | 36 + 8 = 44 pt |
| deedDate | `["DATE"]` | "DATE" ≈ 14.4 pt | "2024-01-15" ≈ 28 pt | 28 + 8 = 36 pt |
| surveyor | `["SURVEYOR-","GENERAL"]` | "SURVEYOR-" ≈ 32.4 pt | "K. Smith" ≈ 24 pt | 32.4 + 8 = 40.4 pt |

**Total tableWidth:** ~204 pt for typical data, smaller than the current fixed 260 pt sum but **grows for long deed numbers** (the most common cause of column overflow in practice).

**Text measurement injection:**

- PDF: `(text, fontSize) => { doc.fontSize(fontSize); return doc.widthOfString(text) }` — pixel-accurate font metrics.
- DXF: `(text, fontSize) => String(text).length * fontSize * 0.55` — the 0.55 charWidthRatio is the same factor used by 3-v3's STYLE width factor + `dxfLabelPlacer`. Worst case is over-estimation, meaning DXF columns are slightly wider than PDF's — never narrower (no overflow).

**Returns:** `number[]` length 6, in PDF points. Generators convert to native units at the consumer site (DXF via `PT_TO_MM_GEN`, PDF uses pt directly).

## Failure handling

| Condition | Behavior |
|---|---|
| `computeScheduleColumnWidths` called with empty `dataRows` | Returns 6 widths driven by header-only measurement. Sum is the minimum tableWidth. |
| `planScheduleSplit` finds no gap ≥ tableWidth | Returns `{plan:[], residualRows:totalRows}`. Caller emits `scheduleOverflow` and Pass 3 / PDF rescue takes over. |
| `planScheduleSplit` partially succeeds (residualRows > 0) | Plan emitted as-is. `scheduleOverflow` warn fires with phase `'split-residual'`. Surveyor sees partial schedule + warn. Pass 3 NOT triggered (some stands placed). |
| PDF's `measureText` throws (e.g., font not loaded) | Caller catches, falls back to the static `[35, 60, 40, 40, 35, 50]` widths and warns `scheduleColumnWidthsFallback`. |
| DXF's `measureText` returns NaN | Caller catches, falls back to static widths and warns. |

## Testing

### New file: `app-backend/src/services/__tests__/block-definitions-schedule.test.js`

~13 unit tests:

**`computeScheduleColumnWidths`** (6 tests):
- Returns 6 widths summing to a finite total.
- Widest header token (e.g., "DIAGRAM" in diagram column) determines column when data is short.
- Widest data value (e.g., long deedNumber) determines column when it exceeds the widest header.
- `colMinFloor` (24 pt) enforced when both header + data are narrow.
- `padding` adds `2 * padding` to each column.
- Injected `measureText` is called with `(text, fontSize)` and result is honored (mocked measurer asserts call shape).

**`planScheduleSplit`** (7 tests):
- All rows fit in one gap → `plan` has 1 entry, `isContinuation:false`, `residualRows:0`.
- Rows distributed across gaps in descending capacity order (largest gap first).
- `residualRows` tracks unplaceable rows when gaps run out.
- Gap below `minRowsPerTable` capacity is skipped.
- `totalRows < minRowsPerTable` → single entry with all rows.
- Stand row order preserved across sub-tables (`startRow` monotonically increases).
- `availableGaps` empty → returns `{ plan: [], residualRows: totalRows }`.

### Modified: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`

+3 tests, -1 test (rewrite the consolidation tests for split semantics):

- ✓ Pass 2 (new split) places multiple sub-tables in distinct whitespace zones when the polygon obstructs the original Pass 1 layout.
- ✓ Pass 2 with one tall zone + several short zones → emits one big + several small sub-tables.
- ✓ Pass 2 fails when even the largest gap is below `minRowsPerTable` → falls through to Pass 3.

Existing tests 7–9 (consolidation invariants) are rewritten or replaced for the new Pass 2 semantics.

### Modified: `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`

+1 test:

- ✓ `addScheduleTable` accepts column widths of varied length (not just the fixed 35/60/40/40/35/50). Existing tests with `columnWidths: [10, 12, 10, 10, 10, 12]` already exercise this; new test uses dynamic widths from `computeScheduleColumnWidths`.

### Modified: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

+2 tests:

- ✓ Maglas-density fixture (≥200 stands) produces NO `scheduleOverflow` with phase `'consolidation-zero-fit'` AND emits sub-tables of varied row-counts (proves split worked).
- ✓ Long-deedNumber fixture (deedNumber values of 13+ characters) produces visibly wider deedNumber column than the fixed-width baseline (proves dynamic widths in integration).

### PDF tests

Defer to plan stage. The new PDF logic mirrors the DXF; integration tests likely live alongside existing PDF tests. The plan task for "PDF integration" will inventory the existing PDF test suite structure first.

### Expected total

Baseline at branch start: 328 dxf tests.

After implementation: ~340 dxf tests (328 + 13 unit + 5 integration / schedule emitter changes − 1 rewritten consolidation test). PDF tests grow by however many parallel tests exist there.

## Risk register

- **Pass 2 fires more often.** With the new "split if Pass 1 fails" instead of "consolidate if Pass 1 fails", Pass 2 is exercised on most dense plans. The current consolidation rarely fires; integration tests built around its non-firing may break.
- **DXF text-width approximation drift.** `text.length × fontSize × 0.55` is an over-estimate for most strings but an under-estimate for very narrow strings (e.g., "1"). Worst case: DXF columns slightly wider than needed — never narrower. Tests pin the 0.55 factor.
- **Column widths shrinking total tableWidth.** Typical data produces ~204 pt total vs current 260 pt. Schedule sub-tables become narrower, freeing more whitespace for other blocks. This should HELP placement, not hurt it — but integration tests asserting specific table widths will need updating.
- **PDF font measurement requires `doc.font(...)` call before `widthOfString`.** Wrong font set → wrong measurement. The measurer wrapper must `doc.font('Helvetica-Bold')` for header text and `doc.font('Helvetica')` for body — and restore the prior font after measurement. Implementation detail; failure mode is silently miscalculated widths.
- **`computeWhitespaceZones` returns zones in arbitrary order.** `planScheduleSplit` sorts by capacity, so order doesn't matter for correctness — but tests checking zone-ranking behavior must construct fixtures with explicit capacity differences.

## File-by-file change summary

| File | Status | Net effect |
|---|---|---|
| `app-shared/block-definitions.js` | MOD | +~80 LOC (two new exported functions) |
| `app-backend/src/services/__tests__/block-definitions-schedule.test.js` | NEW | +~200 LOC (13 tests) |
| `app-backend/src/services/dxfScheduleEmitter.js` | MOD | +~60 / −~40 (Pass 2 rewrite + helpers bag wiring) |
| `app-backend/src/services/dxfGenerator.js` | MOD | +~15 (pre-emitter column-width computation + thread columnWidthsMM through orchestrator helpers) |
| `app-backend/src/services/dxfBottomZoneEmitter.js` | MOD | +~5 (forward columnWidthsMM through orchestrator → emitter helpers bag) |
| `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` | MOD | +3 / −1 tests |
| `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js` | MOD | +1 test |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | MOD | +2 tests |
| `app-backend/src/services/pdfkitGeoPDF.js` | MOD | +~80 / −~60 in `drawScheduleOfAreasMultiTable` |
| PDF test files | MOD | TBD at plan stage (inventory existing PDF tests first) |

Total: net positive ~250 LOC code + ~250 LOC tests.

## Definition of done

- All dxf tests pass (target ~340 total).
- PDF generator tests pass (count to be established at plan stage).
- Regenerated DXF on the user's Maglas 240-stand plan shows the schedule split into multiple sub-tables, none overlapping the OFD table, none overlapping the parcel polygon.
- Regenerated DXF on a plan with long deed numbers (test fixture) shows a wider deedNumber column than the fixed-width baseline.
- Regenerated PDF on the same Maglas plan matches the DXF arrangement (same number of sub-tables in roughly equivalent positions, allowing for minor whitespace-ranking differences between PDF's existing gap enumeration and DXF's `computeWhitespaceZones`).
- `git log --oneline main..feature/dxf-schedule-split-and-dynamic-cols` lists one commit per task.
- Merged to main locally via `superpowers:finishing-a-development-branch`.
- `surveypro-pdfkit-rebaseline-status.md` updated to add this sub-project as a follow-up to 3-v4 (it's an algorithm improvement, not a baseline rebaseline — placed under "follow-ups" after the main table).

# DXF Schedule of Areas — Topological Placement (Sub-project 3-v2)

**Status:** approved 2026-06-04, ready for implementation
**Branch:** `feature/dxf-schedule-of-areas-3v2`
**Predecessors:** `feature/dxf-schedule-of-areas-multi-column` (3, shipped `d1f6fcd`), 4a `46ce0e0`, 4b `90dbb4f`, 4c `4b000ba`, 4d `0799e1f`
**Successors:** sub-project #5 (multi-sheet tiling) consumes the same sheet-escalation path

## Goal

Replace the fixed bottom-left col1 strip emission of the Schedule of Areas in `dxfGenerator.js` with topology-driven placement inside the drawing zone, using 4c's `findBlockPosition`. Closes the design gap documented during sub-project 3 (the PDF places schedule sub-tables wherever drawing-zone whitespace allows; the original DXF emission used a fixed bottom strip that couldn't accommodate dense plans like the 233-parcel Maglas-Township test case).

This is the primary motivator for the entire 4-series; the four foundation modules (geometry, topology, block placer, label placer) exist so the schedule emission can use them.

## Scope

| In scope | Out of scope |
|---|---|
| New module `dxfScheduleEmitter.js` orchestrating topology placement + consolidation | Multi-sheet tiling (sub-project #5) |
| Helper extraction to `dxfScheduleHelpers.js` (mechanical move from `dxfGenerator.js`) | PDF's Pass 2 (skip-polygon grid scan) + Pass 3 (pure bounds-only) consolidation fallbacks |
| Single consolidation pre-flight (re-budget to fewer-but-taller tables) | Polygon union of all surveyed parcels (use `outsideFigureData.vertices` or `null`) |
| Sheet-size escalation via existing `scheduleOverflow` warn + `nextLargerSheet` | Topology placement for the beacon-descriptions block itself (anchor it beneath the schedule for now) |
| Bottom-zone partition: dissolve col1, expand col2/col3 to fill | Schedule pinned to specific sides (topology picks whatever fits) |
| Beacon-descriptions anchored below deepest placed sub-table | Sub-table coordinate-position assertions in the structural integration test (tolerance update only) |

## Architecture

### File structure

```
app-backend/src/services/
  dxfScheduleHelpers.js          NEW  — extracted from dxfGenerator.js; 4 helpers + SCHEDULE_HEADER_HEIGHT_MM
  dxfScheduleEmitter.js          NEW  — topological emitter; orchestrates helpers + 4c
  dxfGenerator.js                MOD  — drop helper bodies, re-import + re-export; replace C1 emission; dissolve col1 partition
  __tests__/
    dxfScheduleHelpers.test.js   RENAMED  — from dxfGenerator.scheduleOfAreas.test.js; import path swap only
    dxfScheduleEmitter.test.js   NEW  — ~18 unit tests
```

### Cycle resolution

The four #3 helpers (`extractScheduleRow`, `computeScheduleLayout`, `addScheduleTable`, `nextLargerSheet`) currently live in `dxfGenerator.js` and are imported into the new emitter. If the emitter then needed to be called from `dxfGenerator.js`, the import graph would cycle. Resolution: **extract the helpers to `dxfScheduleHelpers.js`**. The emitter imports the helpers from there; `dxfGenerator.js` imports the emitter (and re-exports the helpers so external callers and the existing helper tests don't break).

### Data flow

```
dxfGenerator.js (C1 emission site)
   │  surveyedFeatures, drawingZone, polygon, sheetSize, fonts, helpers
   ▼
dxfScheduleEmitter.emitScheduleOfAreasTopological
   │
   ├─► dxfScheduleHelpers.extractScheduleRow         (per parcel → schedule row)
   ├─► dxfScheduleHelpers.computeScheduleLayout      (zone dims → numTables, rowsPerTable, columnWidths)
   ├─► dxfBlockPlacer.findBlockPosition              (per sub-table → topology position)
   │      ├─► dxfTopology.computeWhitespaceZones    (4b)
   │      └─► dxfGeometry.rectangleOverlapsPolygon  (4a)
   ├─► [consolidation] re-budget rowsPerTable, retry findBlockPosition with taller sub-table size
   ├─► dxfScheduleHelpers.addScheduleTable           (per placed sub-table → emits DXF entities)
   └─► warn('scheduleOverflow', {...})              (when stands remain unplaced)
```

## Emitter API

```js
export function emitScheduleOfAreasTopological({
  surveyedFeatures,    // Array<feature> — caller hands in already-filtered, already-sorted parcels
  drawingZone,         // { x, y, width, height } in GROUND-metres — mapBounds for findBlockPosition
  polygon,             // Array<{x,y}> | null — outsideFigureData.vertices, null skips polygon check
  sheetSize,           // 'ISO_A2' | 'ISO_A1' | 'ISO_A0' — for overflow recommendation
  fonts,               // { hHead, hBody, rH } ground-metre text sizes
  helpers,             // { extractScheduleRow, computeScheduleLayout, addScheduleTable,
                       //   nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, mm }
  addText,             // (layer, x, y, text, height, angle?, style?) → void
  addLine,             // (layer, x1, y1, x2, y2) → void
  warn,                // (category, payload) → void
  logger,              // { info, warn, error } — diagnostic plumbing
}) → {
  placedTables: Array<{ x, y, width, height, rowCount, isContinuation }>,
  placedStandCount: number,
  missingStandCount: number,
  southmostY: number,    // ground-metre Y of the LOWEST point across all placed sub-tables —
                         // equals min(p.y) since findBlockPosition returns block bottom-y in
                         // DXF south-up coords. Caller anchors beacons at southmostY - mm(8).
                         // Equals drawingZone.y when no tables placed (overflow fallback).
}
```

`helpers.mm` is injected (not re-derived inside the emitter) so the formula `mm(x) = x * S * 0.001` stays defined in exactly one place. All other helper functions are injected for the same anti-cycle reason.

## Algorithm

```
1. dataRows = surveyedFeatures.map(extractScheduleRow)
2. layout = computeScheduleLayout({
     rowCount:         dataRows.length,
     zoneWidth:        drawingZone.width  / mm(1),    // paper-mm
     zoneHeight:       drawingZone.height / mm(1),    // paper-mm
     rowHeight:        rH / mm(1),
     headerHeight:     SCHEDULE_HEADER_HEIGHT_MM,
     currentSheetSize: sheetSize,
   })

3. // Initial-budget overflow path
   if (!layout.fits):
     emit title-only placeholder at (drawingZone.x + mm(3), drawingZone.y + drawingZone.height - mm(5))
     warn('scheduleOverflow', {
       atSheetSize:        sheetSize,
       requiredSheetSize:  layout.recommendedSheetSize,
       standCount:         dataRows.length,
       phase:              'initial-budget',
     })
     return { placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length, southmostY: drawingZone.y }

4. // Compute sub-table dimensions in GROUND-metres
   subTableWidthG  = layout.columnWidths.map(mm).reduce((s, w) => s + w, 0)
   subTableHeightG = mm(SCHEDULE_HEADER_HEIGHT_MM + layout.rowsPerTable * (rH / mm(1)) + TITLE_SPACING_MM)

5. // PASS 1 — topology placement at original size
   placedPositions = []      // accumulator for placedBlocks parameter
   for i in 0..layout.numTables-1:
     position = findBlockPosition({
       block:         { width: subTableWidthG, height: subTableHeightG },
       mapBounds:     drawingZone,
       polygon:       polygon,
       placedBlocks:  placedPositions,
       buffer:        mm(POLYGON_BUFFER_MM),
       blockSpacing:  mm(BLOCK_SPACING_MM),
       scanStep:      mm(SCAN_STEP_MM),
       tableMinWidth: subTableWidthG,
       logger,
     })
     if (position is null): break
     placedPositions.push({ ...position, width: subTableWidthG, height: subTableHeightG, rowCount: layout.rowsPerTable })

6. // PASS 2 — consolidation (only if PASS 1 didn't seat all tables)
   if (placedPositions.length < layout.numTables):
     feasible = placedPositions.length
     placedPositions = []    // discard pass-1 results; restart from empty
     if (feasible === 0):
       warn('scheduleOverflow', {
         atSheetSize: sheetSize,
         recommendedSheetSize: nextLargerSheet(sheetSize),
         placedStandCount: 0,
         missingStandCount: dataRows.length,
         placedTables: 0,
         phase: 'consolidation-zero-fit',
       })
       return { placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length, southmostY: drawingZone.y }

     rowsPerTable2    = ceil(dataRows.length / feasible)
     subTableHeight2G = mm(SCHEDULE_HEADER_HEIGHT_MM + rowsPerTable2 * (rH / mm(1)) + TITLE_SPACING_MM)
     for i in 0..feasible-1:
       position = findBlockPosition({
         block: { width: subTableWidthG, height: subTableHeight2G },
         mapBounds: drawingZone, polygon: polygon, placedBlocks: placedPositions,
         buffer: mm(POLYGON_BUFFER_MM), blockSpacing: mm(BLOCK_SPACING_MM),
         scanStep: mm(SCAN_STEP_MM), tableMinWidth: subTableWidthG, logger,
       })
       if (position is null): break
       placedPositions.push({ ...position, width: subTableWidthG, height: subTableHeight2G, rowCount: rowsPerTable2 })

7. // FINAL emission — emit each placed sub-table via addScheduleTable
   placedTables = []
   placedStandCount = 0
   southmostY = Infinity                                  // becomes drawingZone.y if no tables emit
   columnWidthsG = layout.columnWidths.map(mm)
   for (i, p) in placedPositions:
     rows = dataRows.slice(placedStandCount, placedStandCount + p.rowCount)
     if (rows.length === 0): break                        // safety: no more stands to emit
     title = (i === 0) ? 'SCHEDULE OF AREAS' : "SCHEDULE OF AREAS (cont'd)"
     // DXF south-up: findBlockPosition returns block bottom-y (LOW y); the block
     // occupies [p.y, p.y + p.height]. addScheduleTable's `y` is the title-row
     // TOP (HIGH y) — emits downward from there. So caller passes p.y + p.height.
     addScheduleTable({
       layer: 'TITLE_BLOCK',
       x: p.x, y: p.y + p.height,
       dataRows: rows,
       columnWidths: columnWidthsG,
       titleText: title,
       hHead, hBody, rH,
       addText, addLine,
     })
     placedTables.push({ ...p, rowCount: rows.length, isContinuation: i > 0 })
     placedStandCount += rows.length
     southmostY = min(southmostY, p.y)                    // lowest bottom of any sub-table

8. // Residual-overflow warn
   missingStandCount = dataRows.length - placedStandCount
   if (missingStandCount > 0):
     warn('scheduleOverflow', {
       atSheetSize: sheetSize,
       recommendedSheetSize: nextLargerSheet(sheetSize),
       placedStandCount, missingStandCount,
       placedTables: placedTables.length,
       phase: 'consolidation-residual',
     })

9. if (placedTables.length === 0): southmostY = drawingZone.y
   return { placedTables, placedStandCount, missingStandCount, southmostY }
```

### Key design choices

- **Pass 1 breaks on first failure** — matches PDF's sequential placement. Once a sub-table can't fit, later sub-tables face an even more crowded `placedBlocks` set and are unlikely to fit either; we cut the loss early and let consolidation re-budget.
- **Consolidation replays from scratch** with the taller height, doesn't reuse Pass 1 positions. A position validated for the original sub-table height may overlap the polygon at the taller height because of how the polygon intrudes into specific y bands.
- **`southmostY` return value** (= `min(p.y)` across placed sub-tables in DXF south-up coords) lets the caller anchor the beacon-descriptions block beneath the schedule without 3-v2 needing to topologically place the beacon block itself (that's a future component). Equals `drawingZone.y` when no tables were placed (overflow fallback).
- **Sheet-size escalation** uses the existing `scheduleOverflow` warn + `nextLargerSheet` machinery. When at A0, `nextLargerSheet('ISO_A0')` returns `'multi-sheet-required'` (covered by sub-project #5).

## Constants

Exported `const`s at the top of `dxfScheduleEmitter.js`:

| Constant | Value | Rationale |
|---|---|---|
| `POLYGON_BUFFER_MM` | `2.0` | Clearance from polygon edges. Tight visible gap; schedules don't crowd parcel boundaries. PDF uses 40 pt at ~A1 ≈ 14 mm but at PDF resolution — DXF in ground-metres at scale uses paper-mm semantics, where 2 mm is appropriate. |
| `BLOCK_SPACING_MM` | `3.0` | Min separation between placed sub-tables. PDF uses 10 pt ≈ 3.5 mm; 3 mm matches the codebase's existing `mm(3)` padding convention. |
| `SCAN_STEP_MM` | `2.0` | Topology + grid step resolution. PDF uses 20 pt ≈ 7 mm; finer is better for tight whitespace. 2 mm balances candidate count vs. coverage. |
| `TITLE_SPACING_MM` | `5.0` | Vertical gap between sub-table title row and header row. Included in the sub-table height calculation. Matches the existing #3 `addScheduleTable` convention. |

## Polygon contract

- The caller in `dxfGenerator.js` builds `polygon` from `ofResult.vertices` (the already-walked outside-figure vertex output used at `dxfGenerator.js:1401`) when `outsideFigureData` is present and has ≥3 vertices.
- When `outsideFigureData` is absent (single parcel, no parent property), the caller passes `null`.
- `findBlockPosition` already handles `null`/empty polygon (skips polygon check, falls back to bbox-only candidate filtering — see `dxfBlockPlacer.js:78`).
- **No polygon-union of surveyed parcels, no bbox fallback computation** in 3-v2. If `outsideFigureData` is absent the schedule has no polygon-avoidance — that's documented and acceptable; mapBounds + placedBlocks still constrain placement.

## Coordinate convention

Everything passed to `findBlockPosition` is **ground-metres**:

- `drawingZone` = `{ x: cntL, y: drawDivY, width: cntR - cntL, height: cntT - drawDivY }`. All values are already ground-metres in `dxfGenerator.js`.
- `polygon` vertices already ground-metres (`outsideFigureData.edges` carries ground coordinates).
- `block.width` / `block.height` ground-metres via `mm(paper_mm_value)`.
- `buffer`, `blockSpacing`, `scanStep` all `mm(constant)` so they scale with `S`.

`findBlockPosition` returns top-left `{x, y}` in ground-metres. `addScheduleTable` expects its `y` parameter as the TOP of the title row (the function emits downward from there); so the caller passes `position.y + position.height` to match — see step 7 of the algorithm.

## Bottom-zone partition changes

The current bottom-zone (below `drawDivY`) is partitioned into three columns:

| Column | x-range | Content |
|---|---|---|
| col1 | `cntL+mm(3)` .. `cntL+0.28·contentW` | Schedule of Areas, Beacon descriptions |
| col2 | `col1R+mm(3)` .. `col1R+0.42·contentW` | Statement, Outside Figure Data |
| col3 | `col2R+mm(3)` .. `cntR-mm(3)` | Approved, Coordinates |

With 3-v2, col1 dissolves:

- The col1L→col1R partition variables are deleted.
- The `addLine(TB, col1R, drawDivY, col1R, cntB)` vertical divider is removed.
- The col2 (Statement+OF data) zone expands to fill the freed width: new `statementL = cntL + mm(3)`, `statementR = cntL + contentW * 0.58`.
- The col3 (Approved+Coords) zone shifts left to start at the new `statementR + mm(3)`, ending at `cntR - mm(3)`.
- The `addLine(TB, col2R, drawDivY, col2R, cntB)` divider stays — now separates Statement+OF (left) from Approved (right) at the new x.
- Schedule + beacon descriptions emit in the drawing zone above `drawDivY` via topology.
- Beacon descriptions anchor at `scheduleResult.southmostY - mm(8)` (just below the bottommost placed sub-table in DXF south-up coords). On overflow (no tables placed), `southmostY === drawingZone.y` and the caller falls back to anchoring at `drawingZone.y + drawingZone.height - mm(20)` near the top of the drawing zone.

The implementation plan will enumerate every site that references `col1L`/`col1R`/`col2L`/`col2R` and substitute the new variable names. Expected ~15 references across C1 (deleted), C2 (Statement+OF data), C3 (Approved+Coords), and the coord-divider line at `dxfGenerator.js:1687`.

## Testing strategy

### `dxfScheduleHelpers.test.js` (renamed)

26 existing tests; only the import path changes (`from '../dxfGenerator.js'` → `from '../dxfScheduleHelpers.js'`). Should pass first run after the rename + helper extraction.

### `dxfScheduleEmitter.test.js` (new, ~18 tests)

Three describe blocks:

```js
describe('emitScheduleOfAreasTopological — happy path', () => {
  // 1. single sub-table fits → 1 addScheduleTable call at returned position
  // 2. numTables=3, all fit at original height → 3 placements, no consolidation, no warn
  // 3. zero stands → returns early, no warn, no emissions
  // 4. polygon=null → topology still produces positions; placement succeeds
  // 5. returned southmostY is min(p.y) across placed tables (lowest in DXF south-up); equals drawingZone.y when none placed
  // 6. cont'd titles: first 'SCHEDULE OF AREAS', subsequent "SCHEDULE OF AREAS (cont'd)"
})

describe('emitScheduleOfAreasTopological — consolidation pass', () => {
  // 7. numTables=4 but only 2 fit at original height → consolidation re-budgets to 2 taller tables, all stands placed
  // 8. consolidation re-budgets with rowsPerTable = ceil(N / feasible)
  // 9. consolidation discards pass-1 positions before retrying
  // 10. consolidation, feasible=0 → no consolidation attempted, scheduleOverflow warn with phase='consolidation-zero-fit'
  // 11. consolidation, residual stands → scheduleOverflow warn with phase='consolidation-residual'
  // 12. consolidation passes ALL stands → no warn
})

describe('emitScheduleOfAreasTopological — overflow & layout edge cases', () => {
  // 13. computeScheduleLayout returns fits:false → title placeholder emitted + warn(phase: 'initial-budget')
  // 14. warn payload shape: placedStandCount, missingStandCount, placedTables, atSheetSize, recommendedSheetSize
  // 15. recommendedSheetSize uses nextLargerSheet(sheetSize)
  // 16. polygon present with rectangle obstacle → placements avoid the polygon
  // 17. drawingZone too narrow for one sub-table → scheduleOverflow warn (initial-budget)
  // 18. logger.info called with topology/grid candidate counts (smoke for diagnostic plumbing)
})
```

Spy/recorder pattern for callbacks:

```js
const calls = { addText: [], addLine: [], warn: [] }
const addText = (...args) => calls.addText.push(args)
const addLine = (...args) => calls.addLine.push(args)
const warn    = (cat, payload) => calls.warn.push({ cat, payload })
const logger  = { info: () => {}, warn: () => {}, error: () => {} }
```

Fixture geometry uses identity `mm = (x) => x` so tests assert against raw numbers without scale conversion.

### Regression bar

```
cd app-backend && npm test -- --testPathPatterns="dxf"
```

- 210 baseline dxf tests pass (entity counts on TITLE_BLOCK/STAND_NUMBERS/DISTANCES/DIRECTIONS preserved; only schedule x/y coordinates and bottom-zone divider geometry shift)
- 26 dxfScheduleHelpers tests pass (renamed)
- 27 dxfLabelPlacer tests pass (untouched)
- ~18 new dxfScheduleEmitter tests pass
- **Total ~281**

If the structural integration test (`test(dxf): structural integration for SI 727 Schedule of Areas`, commit `342bfe8`) hardcodes schedule x-positions, it gets a tolerance update — listed as a sub-task in the implementation plan.

## Failure modes & sheet escalation

| Trigger | Action |
|---|---|
| `computeScheduleLayout.fits === false` | Emit title-only placeholder; `warn(phase:'initial-budget')` with `requiredSheetSize` from layout. |
| Pass 1 + consolidation both leave zero stands placed | `warn(phase:'consolidation-zero-fit')` with `recommendedSheetSize = nextLargerSheet(sheetSize)`. |
| Pass 1 + consolidation leave some stands unplaced | Emit what fit; `warn(phase:'consolidation-residual')` with `placedStandCount`/`missingStandCount`/`recommendedSheetSize`. |
| `sheetSize === 'ISO_A0'` and overflow occurs | `nextLargerSheet('ISO_A0') = 'multi-sheet-required'` — surfaces to the operator via warn. Actual multi-sheet emission is sub-project #5. |

## Open questions

None as of approval. All clarifying questions resolved during brainstorming:

- Bottom-zone fate → col1 dissolves; both schedule and beacons go topological (beacons anchor under schedule).
- mapBounds scope → drawing zone above `drawDivY` only.
- Polygon source → `outsideFigureData.vertices` when present, `null` otherwise.
- Failure handling → topology → consolidation → sheet-size escalation (multi-sheet deferred).
- Consolidation depth → single re-budget pass (Approach A).

## References

- Sub-project 3 (original) spec: `docs/superpowers/specs/2026-06-02-dxf-schedule-of-areas-multi-column-design.md`
- Memory: `pdfkit-block-placement-uses-topological-scan.md`
- Memory: `surveypro-pdfkit-rebaseline-status.md`
- PDF source: `pdfkitGeoPDF.js:9202-9530` (`drawScheduleOfAreasMultiTable`)
- 4c source: `app-backend/src/services/dxfBlockPlacer.js`
- Current DXF emission site (to replace): `dxfGenerator.js:1583-1656` (C1 block)

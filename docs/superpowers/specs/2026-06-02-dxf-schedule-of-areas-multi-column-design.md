# DXF Schedule of Areas — Full 6-Column SI 727 + Side-by-Side Overflow

**Date:** 2026-06-02
**Status:** Approved (design)
**Component:** `app-backend` — `services/dxfGenerator.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, 14,222 lines). This is the
**third** of six independent sub-projects in that re-baselining; the others
(outside-figure annotation — shipped, title-block SI 727 lines — shipped,
cartographic label collision avoidance, multi-sheet tiling, beacon
enrichment — deferred) get their own spec → plan → implementation cycles.

## Purpose

The DXF currently emits a 2-column Schedule of Areas (`STAND No.`,
`AREAS SQ. METRES`) in the bottom-left zone of the title block
(`dxfGenerator.js:1292-1308`). The SI 727 Seventh Schedule prescribes
a full 6-column layout (per `app-shared/block-definitions.js:11-49`):

| Col | Header               | Notes                                          |
|-----|----------------------|------------------------------------------------|
| 1   | `STAND No.`          | Primary key. Already emitted.                  |
| 2   | `AREAS SQUARE METRES`| Already emitted (header text and rounding).    |
| 3   | `DIAGRAM NUMBER`     | Missing today.                                 |
| 4   | `NUMBER` (under `DEED`) | Missing. Has a `DEED` parent header.       |
| 5   | `DATE` (under `DEED`)  | Missing. Same `DEED` parent header.          |
| 6   | `SURVEYOR-GENERAL`   | Missing.                                       |

The four missing columns are populated by Surveyor-General officials at
approval time as ownership transfers — they're meant to be **blank on
submission**, not absent from the layout. The DXF must emit the full
6-column header so the surveyor (and the SG office) sees the SI 727 form
to fill in.

The DXF also has no overflow handling. The PDF (`drawScheduleOfAreasMultiTable`
at `pdfkitGeoPDF.js:9202`) splits into side-by-side continuation tables
when the row count exceeds the single-column row budget. Past today's
`block-definitions.js:48` threshold of 50 stands, the current DXF runs
rows off the bottom of the page.

Goal: **emit the full 6-column SI 727 layout with blank cells where the
optional fields are absent; split into side-by-side continuation tables
within the bottom-left zone when the row count exceeds the single-column
budget; emit a structured `scheduleOverflow` warning (consumed by
sub-project #5) when even the multi-table layout overflows at the
current sheet size.**

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Blank cells for unpopulated optional columns | Always emit the 6-column header; populate from `parcel.properties.{diagram,deedNumber,deedDate,surveyor}` where present; render `''` otherwise. SG officials fill blanks post-approval per real-world workflow |
| Overflow strategy | Side-by-side continuation tables within the bottom-left zone (mirrors the PDF's `drawScheduleOfAreasMultiTable` shape, constrained to the DXF's pre-allocated zone) |
| Auto-escalate paper size? | **No** — out of scope. This sub-project DETECTS overflow and emits a structured warning. Sub-project #5 (multi-sheet tiling) owns the escalation/tiling pipeline |
| File structure | Approach A — extend `dxfGenerator.js` in place with three pure helpers + one rewrite of the existing schedule emission |
| Template source | Widen the existing `import { TITLE_BLOCK, formatStandRanges } from '../../../app-shared/block-definitions.js'` (added by sub-project #2) to also pull `SCHEDULE_OF_AREAS` |
| New layer | None — schedule stays on the existing `TITLE_BLOCK` layer |
| New warning category | `scheduleOverflow` — structured value `{ atSheetSize, requiredSheetSize, standCount }`, not a counter |
| Sheet ladder | New `SHEET_LADDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']` constant. `nextLargerSheet(current)` walks it; A0 returns `'multi-sheet-required'` |
| Helper return types | `extractScheduleRow` → object; `computeScheduleLayout` → object; `addScheduleTable` → number (final `y` consumed) |
| `generateDXF()` option additions | None — `sheetSize` is already destructured (added before this sub-project); used directly by `computeScheduleLayout` |
| Route changes | None — the structured warning rides in the existing `warnings.summary` payload |
| Frontend changes | None — the four new cell sources are read where present; absent values render as blank cells |
| DXF version target | R12 (AC1009) unchanged |

## Conventions (carried)

`addText(layer, x, y, str, h, rotation, style)` and `addLine(layer, x1, y1, x2, y2)`
are the existing emission primitives. Inter-line spacing is `h * 1.6` for
title-zone lines; `rH` for data-table rows. Cape Lo ground coordinates
throughout. `mm(n)` converts paper-mm to ground metres at the chosen scale.

## Architecture

Single file change: `app-backend/src/services/dxfGenerator.js`.

Four structural moves:

1. **Import widening.** Add `SCHEDULE_OF_AREAS` to the existing import
   from `app-shared/block-definitions.js` (no new import line).

2. **Three pure helpers** near the existing title-block helpers
   (`splitToWidth`, `formatSheetLabel`, `formatVideLine`,
   `formatFigureDescription`):
   - `extractScheduleRow(parcelFeature) → object`
   - `computeScheduleLayout({ rowCount, zoneWidth, zoneHeight, rowHeight, headerHeight, currentSheetSize }) → object`
   - `addScheduleTable(layer, x, y, dataRows, columnWidths, titleText, hHead, hBody, rH, addText, addLine) → number`

   `addScheduleTable` takes `addText` / `addLine` as injected dependencies
   so it can be exported and exercised in isolation.

3. **Two new constants** near `PAPER_SIZES`:
   ```js
   const SHEET_LADDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']
   const SCHEDULE_HEADER_HEIGHT_MM = 12  // shared by computeScheduleLayout's
                                         // row-budget math and addScheduleTable's
                                         // actual header emission. Drift breaks
                                         // the layout silently.
   ```
   Plus a small `nextLargerSheet(current)` helper that returns the next
   ladder entry or `'multi-sheet-required'` when already at the top.

4. **Rewrite the existing C1 SCHEDULE OF AREAS block** at
   `dxfGenerator.js:1292-1308`. The new emission flow calls
   `extractScheduleRow` per parcel, `computeScheduleLayout` once for the
   whole batch, then branches:
   - `layout.fits && numTables === 1` → single `addScheduleTable` call.
   - `layout.fits && numTables > 1` → loop, side-by-side sub-tables, each
     titled `SCHEDULE OF AREAS` (first) or `SCHEDULE OF AREAS (cont'd)`.
   - `!layout.fits` → emit only the title as a marker; record
     `warn('scheduleOverflow', { atSheetSize, requiredSheetSize, standCount })`.

5. **Warning aggregator extension** at `dxfGenerator.js:225-232`. Add a
   branch for `scheduleOverflow` that stores the structured value
   directly (same special-case treatment that `scaleFallback` and
   `nonAscii` get for boolean-valued categories). Increment
   `warnings.count` by 1.

## Components

### `extractScheduleRow(parcelFeature) → object`

Reads six fields from `parcelFeature.properties`, returning an object
whose values are all strings (never `null`/`undefined`):

| Returned key | Source | Coercion |
|---|---|---|
| `stand` | `properties.stand` | `String(x ?? '')` |
| `area` | `properties.area_m2` | `String(Math.round(x ?? 0))` |
| `diagram` | `properties.diagram` | `String(x ?? '')` |
| `deedNumber` | `properties.deedNumber` | `String(x ?? '')` |
| `deedDate` | `properties.deedDate` | `String(x ?? '')` |
| `surveyor` | `properties.surveyor` | `String(x ?? '')` |

Pure. No template reads.

### `computeScheduleLayout({ rowCount, zoneWidth, zoneHeight, rowHeight, headerHeight, currentSheetSize }) → object`

Returns one of two shapes:

```ts
type Layout =
  | { fits: true,  numTables: number, rowsPerTable: number, columnWidths: number[] }
  | { fits: false, recommendedSheetSize: 'ISO_A1' | 'ISO_A0' | 'multi-sheet-required' }
```

Algorithm:

1. `rowsPerColumn = Math.floor((zoneHeight - headerHeight) / rowHeight)`.
   Clamp to `0` if negative.
2. `singleTableWidth = sum(SCHEDULE_OF_AREAS.singleColumn.columns[].width)`.
3. If `rowCount === 0`:
   `return { fits: true, numTables: 1, rowsPerTable: 0, columnWidths: scaled to zoneWidth }`.
4. If `rowCount ≤ rowsPerColumn` AND `zoneWidth ≥ singleTableWidth / 2`:
   single-column fits. Return `{ fits: true, numTables: 1, rowsPerTable: rowCount, columnWidths }`
   where `columnWidths` is the single-column widths from block-definitions
   scaled by `zoneWidth / singleTableWidth`.
5. Otherwise compute `subTableWidth = sum(SCHEDULE_OF_AREAS.multiColumn.columns[].width)`
   and `spacing = SCHEDULE_OF_AREAS.multiColumn.columnSpacing`.
6. `maxTablesByWidth = Math.floor((zoneWidth + spacing) / (subTableWidth + spacing))`.
   Clamp to `≥ 1`.
7. `numTablesNeeded = Math.ceil(rowCount / rowsPerColumn)`.
8. If `numTablesNeeded ≤ maxTablesByWidth`:
   side-by-side fits.
   Return `{ fits: true, numTables: numTablesNeeded, rowsPerTable: rowsPerColumn, columnWidths: multiColumnWidths }`.
9. Otherwise: `recommendedSheetSize = nextLargerSheet(currentSheetSize)`.
   Return `{ fits: false, recommendedSheetSize }`.

`nextLargerSheet(current)`:
- `'ISO_A2'` → `'ISO_A1'`
- `'ISO_A1'` → `'ISO_A0'`
- `'ISO_A0'` → `'multi-sheet-required'`
- Anything else (unknown sheet size) → `'multi-sheet-required'` (defensive
  — treats unknown as already at the top of the ladder so sub-project #5
  always sees a clear signal).

Pure function; no I/O.

### `addScheduleTable(layer, x, y, dataRows, columnWidths, titleText, hHead, hBody, rH, addText, addLine) → number`

Emits one schedule sub-table. `addText` and `addLine` are passed as
parameters (the existing closures inside `generateDXF`) so the helper
can be exported and exercised by integration tests against the
`generateDXF` output.

Sequence:

1. Emit title at `(x, y)` via `addText(layer, x, y, titleText, hHead, 0, 'BOLD')`. Decrement `y` by `mm(5)`.
2. Emit first header row: column labels using each column's `label` from
   `SCHEDULE_OF_AREAS.singleColumn.columns`. `\n` in the label string
   triggers a sub-line via `hBody * 0.8` decrement.
3. Emit the `DEED` parent header centered above `deedNumber` + `deedDate`
   columns (matches the PDF's bracket above `NUMBER` / `DATE`).
4. Emit underline LINE below the header at `y - mm(2)`.
5. Decrement `y` by header-total height.
6. For each row in `dataRows`: emit one `addText` per cell at the
   cell's `x` offset and current `y`, then decrement `y` by `rH`.
7. Return final `y` (the y-coordinate consumed; caller uses it to
   position the beacon-descriptions block below the deepest sub-table).

## Data flow

```
generateDXF(options)
  └─ surveyedParcels built (existing, ~line 1175)
     └─ NEW: const dataRows = parcels.features
                .filter(/* existing outside-figure filter */)
                .map(extractScheduleRow)
     │
     └─ at the existing C1 SCHEDULE OF AREAS emission site (~line 1292):
        │
        ├─ const zoneWidth  = col1R - col1L - mm(3)
        │   const zoneHeight = (drawDivY - mm(5)) - (cntB + mm(4))
        │     [reservation for beacon-descriptions handled by addScheduleTable
        │      returning consumed y; existing code re-bases beacon descriptions
        │      from that y]
        │   const layout = computeScheduleLayout({
        │     rowCount: dataRows.length, zoneWidth, zoneHeight,
        │     rowHeight: rH, headerHeight: mm(SCHEDULE_HEADER_HEIGHT_MM),
        │     currentSheetSize: sheetSize
        │   })
        │
        ├─ if (layout.fits && layout.numTables === 1):
        │   └─ const finalY = addScheduleTable(TB, col1L, sY, dataRows,
        │        layout.columnWidths, 'SCHEDULE OF AREAS',
        │        hHead, hBody, rH, addText, addLine)
        │   └─ sY = finalY  (beacon descriptions positioned via existing code)
        │
        ├─ else if (layout.fits && layout.numTables > 1):
        │   └─ const subTableWidth = (zoneWidth - (layout.numTables - 1) * spacing)
        │                          / layout.numTables
        │   └─ let deepestY = sY
        │   └─ for i in 0..numTables-1:
        │        const rows = dataRows.slice(i * rowsPerTable,
        │                                    (i + 1) * rowsPerTable)
        │        const title = i === 0 ? 'SCHEDULE OF AREAS'
        │                              : "SCHEDULE OF AREAS (cont'd)"
        │        const subX = col1L + i * (subTableWidth + spacing)
        │        const subY = addScheduleTable(TB, subX, sY, rows,
        │                       layout.columnWidths, title, hHead, hBody,
        │                       rH, addText, addLine)
        │        deepestY = Math.min(deepestY, subY)
        │   └─ sY = deepestY
        │
        └─ else (!layout.fits):
            └─ addText(TB, col1L, sY, 'SCHEDULE OF AREAS', hHead, 0, 'BOLD')
            └─ warn('scheduleOverflow', {
                  atSheetSize: sheetSize,
                  requiredSheetSize: layout.recommendedSheetSize,
                  standCount: dataRows.length
               })
            └─ sY = sY - mm(10)  (small reservation; beacon descriptions still render below)
```

## Error handling

Three principles, mirroring sub-project #2.

**Missing per-cell data → blank cell, no warning, no throw.**
- `extractScheduleRow` returns `''` for any of the four optional fields
  (`diagram`, `deedNumber`, `deedDate`, `surveyor`) when absent. Per the
  real-world workflow, those cells are filled by SG officials at
  approval — blanks are expected at submission time.
- `properties.stand` missing → row's `stand: ''`. Defensive (the existing
  upstream filter already drops missing-stand parcels, but the helper
  itself shouldn't assume).
- `properties.area_m2` defaults to `0` (matches existing behavior).
- Non-string inputs (numeric `diagram: 1234`, `Date` objects) get
  `String()` coercion. No warning.

**Zero surveyed parcels → emit header, skip data rows.**
- `computeScheduleLayout({ rowCount: 0, … })` returns
  `{ fits: true, numTables: 1, rowsPerTable: 0, columnWidths }`. The
  emitter writes title + header + underline and returns. Surveyor sees
  the SI 727 form with no rows — correct for an empty plan.

**Layout overflow → structured warning, fail-soft render.**
- `!layout.fits` → only the title `'SCHEDULE OF AREAS'` renders.
  `warn('scheduleOverflow', { atSheetSize, requiredSheetSize, standCount })`
  records the payload. DXF still completes — no throw, no crash, just an
  incomplete schedule clearly flagged.
- `requiredSheetSize` is `'ISO_A1'` / `'ISO_A0'` / `'multi-sheet-required'`.
  Sub-project #5 consumes this and re-runs / tiles.

**Warning aggregator extension.**
- `scheduleOverflow` is a structured object, not a counter or a boolean.
  Extend the aggregator at `dxfGenerator.js:225-232` with a new branch:
  ```js
  if (category === 'scheduleOverflow') {
    warnings.summary[category] = n  // n is the structured object
  } else if (...) { ... }
  ```
  `warnings.count` still increments by `1`. The category defaults to
  `null` in the initialiser.

**Block-definition import failure → fail loud.**
- If `SCHEDULE_OF_AREAS.singleColumn` or `.multiColumn` is missing from
  the shared export, throw
  `Error('SCHEDULE_OF_AREAS missing from app-shared/block-definitions.js')`.
  Same fail-loud pattern `formatVideLine` and `formatFigureDescription` use.

**No new layer, no new warning categories beyond `scheduleOverflow`.**

## Testing

Three layers, mirroring the previous two sub-projects.

### Layer 1 — Unit tests

New file: `app-backend/src/services/__tests__/dxfGenerator.scheduleOfAreas.test.js`.

Tests run against the exported helpers directly; no DXF parsing.

**`extractScheduleRow`:**
- Full happy path: every property populated → returns all six fields as
  strings.
- Optional fields absent → corresponding cells `''`.
- `null` and `undefined` values → `''`.
- Numeric `diagram: 1234` → `'1234'` (String coercion).
- Missing `properties.stand` → `stand: ''` (defensive).
- `area_m2: 9999.7` → `area: '10000'` (rounding).
- `area_m2: 0` → `area: '0'` (NOT `''`).
- `area_m2: undefined` → `area: '0'` (matches existing default).

**`computeScheduleLayout`:**
- `rowCount: 0` → `{ fits: true, numTables: 1, rowsPerTable: 0 }`.
- Small `rowCount` that fits single-column → `{ fits: true, numTables: 1, rowsPerTable: rowCount }`.
- `rowCount` just over single-column budget at A2 → `{ fits: true, numTables: 2 }`.
- `rowCount` requiring 3 tables that fit width-wise → `{ fits: true, numTables: 3 }`.
- `rowCount` requiring more tables than the zone width can hold at A2 →
  `{ fits: false, recommendedSheetSize: 'ISO_A1' }`.
- Same scenario at A0 → `{ fits: false, recommendedSheetSize: 'multi-sheet-required' }`.
- `currentSheetSize: 'unknown'` → `{ fits: false, recommendedSheetSize: 'multi-sheet-required' }`
  (defensive fallback documented in spec).
- `columnWidths` in single mode sums to ≤ `zoneWidth`.
- `columnWidths` in multi mode sums to ≤ `subTableWidth`.
- Zero `zoneHeight` (or negative) → clamps `rowsPerColumn` to 0; for
  `rowCount > 0` returns `{ fits: false, recommendedSheetSize: ... }`.

**`nextLargerSheet`** (small, but worth one test each ladder transition):
- `'ISO_A2'` → `'ISO_A1'`.
- `'ISO_A1'` → `'ISO_A0'`.
- `'ISO_A0'` → `'multi-sheet-required'`.
- Unknown → `'multi-sheet-required'`.

**`addScheduleTable`:**
- Pure-emission tests require parsing DXF output. Cover at Layer 2.

### Layer 2 — Structural integration

Extend `dxfGenerator.integration.test.js` with a new describe block
`'dxfGenerator integration — Schedule of Areas SI 727 columns'`:

- Title block contains a `TEXT` entity with text exactly `'SCHEDULE OF AREAS'` on `TITLE_BLOCK`.
- Each of the six SI 727 column header tokens appears as a `TEXT` entity
  on `TITLE_BLOCK`: `'STAND'`, `'AREAS'`, `'DIAGRAM'`, `'NUMBER'`, `'DATE'`, `'SURVEYOR-'` (some headers are multi-line per block-definitions).
- `'DEED'` parent header is emitted as a separate `TEXT` entity.
- For the `sampleFixture` two-parcel case, both stand numbers (`'123'`, `'124'`) appear as `TEXT` entities on `TITLE_BLOCK`.
- No `TEXT` entity on `TITLE_BLOCK` contains the literal string
  `'undefined'` or `'null'` (catches the case where missing optional
  fields leak the literal `undefined` into the output).
- Side-by-side: build a synthetic fixture with N parcels chosen so
  `computeScheduleLayout` returns `numTables: 2` at the default sheet.
  Assert two title TEXTs exist (one `'SCHEDULE OF AREAS'`, one
  `"SCHEDULE OF AREAS (cont'd)"`) and both stand-number ranges appear.
- Overflow signal: build a synthetic fixture with enough parcels to
  trigger `!layout.fits` at `sheetSize: 'ISO_A2'`. Assert
  `warnings.summary.scheduleOverflow` is non-null with shape
  `{ atSheetSize: 'ISO_A2', requiredSheetSize, standCount }`.
- Clean `sampleFixture` (2 parcels, no overflow) → `warnings.count === 0`
  AND `warnings.summary.scheduleOverflow === null`.

### Layer 3 — Manual CAD verification

Add to `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`:

- 6-column header renders with correct labels — `STAND No.`, `AREAS SQUARE METRES`, `DIAGRAM NUMBER`, `DEED` parent above `NUMBER` and `DATE`, `SURVEYOR-GENERAL`.
- For a small plan, the schedule fits as a single table in the bottom-left zone with the existing beacon-descriptions block immediately below.
- For a synthetic ~100-parcel plan, the schedule splits into 2+ side-by-side sub-tables; the second is labelled `SCHEDULE OF AREAS (cont'd)`.
- For a synthetic plan that overflows at A2, the warnings response payload contains `scheduleOverflow: { atSheetSize: 'ISO_A2', requiredSheetSize: 'ISO_A1', standCount: N }`.

## Non-goals

- **Auto-escalation of sheet size.** This sub-project detects overflow
  and signals via `scheduleOverflow`. The actual re-run-with-bigger-sheet
  pipeline lives in sub-project #5 (multi-sheet tiling).
- **Multi-sheet tiling.** When even A0 can't fit the schedule, this
  sub-project emits `requiredSheetSize: 'multi-sheet-required'`. The
  tiling implementation is sub-project #5.
- **Frontend wiring of the four new fields.** This sub-project reads
  `parcel.properties.{diagram,deedNumber,deedDate,surveyor}` where
  present; absent values render as blank cells (SG officials fill those
  at approval). A separate sub-project will add Project Setup form
  inputs for the optional fields if/when surveyors want to pre-populate
  them.
- **Topological in-map placement.** The PDF's
  `drawScheduleOfAreasMultiTable` performs sophisticated topological
  scanning to fit tables inside the drawing zone with collision
  avoidance against title/scale-bar/beacon-description blocks. The DXF
  keeps the schedule in the pre-allocated bottom-left zone. CAD users
  can reposition manually after import.
- **Schedule of Areas font-size adaptive scaling.** The PDF reduces
  font size and adjusts row height based on stand count. The DXF uses
  the existing `hBody` / `rH` (fixed at the chosen scale); overflow is
  handled by side-by-side tables, not type compression.

# Shared Sheet Layout Planner (sub-project 3-v5) — Design

**Date:** 2026-06-12
**Status:** Draft (pending user review)
**Sub-project:** 3-v5 of the dxfGenerator re-baseline against pdfkitGeoPDF
**Modules touched primarily:** new `app-shared/sheetLayoutPlanner.js`, `app-backend/src/services/pdfkitGeoPDF.js`, `app-backend/src/services/dxfGenerator.js`, `app-backend/src/services/dxfBottomZoneEmitter.js`

## Goal

Establish a single source of truth for *where* the surrounding blocks of a SI 727 survey plan land on the sheet, consumed by both the PDF and DXF generators. After this sub-project, the PDF and DXF outputs use the same algorithm to position the title block, schedule of areas, outside-figure data, beacon description, scale bar, survey statement, north arrow, surveyor-general signature box, and endorsement block. The two formats remain free to render entities differently, but their arrangement is identical.

This unlocks two things: (a) any future improvement to sheet arrangement lives in one place and benefits both formats, and (b) sub-project #5 (multi-sheet tiling) becomes a planner change rather than a per-format change.

## Strategy (already settled with the user)

- **Scope = surrounding blocks only.** Parcel-internal labels (stand numbers, distance/bearing edge labels, beacon labels) stay format-specific. Polygon rendering (tick marks, parcel edges, dimension lines) stays format-specific.
- **PDF planner is the primary source.** PDF's `calculateBlockPositions` (`pdfkitGeoPDF.js:7841-8719`, 878 lines) is the battle-tested algorithm; we extract it as-is. The few DXF-specific fixes worth keeping (closed-polygon validation, endorsement-block parity) get folded in during the extraction.
- **Verification by golden-PDF snapshot.** Before any refactor, capture a snapshot of two fixture PDFs (text + position). Every implementation step must keep the snapshot green.
- **Schedule placement inherits PDF's whitespace-avoidance.** DXF's recently-shipped right-anchor schedule (`5224c80`, 2026-06-10) is intentionally dropped — DXF now picks the same spot the PDF picks. If PDF turns out to pick "any valid spot" rather than "most whitespace," that enhancement is deferred to 3-v6.

## What does not change

- The `drawX()` functions in `pdfkitGeoPDF.js` (rendering side).
- The `emitX` functions in `dxfBottomZoneEmitter.js` and `dxfGenerator.js` for non-surrounding-block geometry.
- `app-shared/block-definitions.js` block dimensions — still consumed by the planner unchanged.
- `dxfScheduleEmitter.js` Pass 1/2/3 split-into-smaller logic — still runs *within* the planner-assigned schedule slot.
- `dxfGeometry.js`, `dxfTopology.js`, `dxfBlockPlacer.js`, `dxfLabelPlacer.js`, `dxfBeaconPlacer.js`, `dxfScheduleHelpers.js` — all still used.
- Frontend code. The UI does not consume `blockPositions`.

## Architecture

### The shared planner

New module: `app-shared/sheetLayoutPlanner.js`. Exports one function:

```js
planSheetLayout({
  metadata,
  parcels,             // GeoJSON FeatureCollection of parcels
  outsideFigureData,   // { edges: [{ side, metres, direction, ... }], coordinates: [...] }
  beacons,             // GeoJSON FeatureCollection
  mapBounds,           // { x, y, width, height } in PDF points
  mapFeatureBounds,    // polygon bbox in PDF points
  scale,               // { value, label }
  extent,              // ground extent { minX, minY, maxX, maxY }
  tickMarkBounds,      // optional pre-seeded obstacle bboxes (default [])
  figureBounds,        // optional bbox of outside figure (default null)
  polyPts,             // closed polygon vertices in PDF points (default [])
  measureText,         // (str, { family, size }) → width in pt  (REQUIRED, injected)
  logger               // duck-typed { info, warn, error }
}) → {
  titleBlock:        { x, y, width, height },
  scheduleOfAreas:   { x, y, width, height, _schedNeedsSplit, _schedNumCols, _schedRowsPerCol },
  outsideFigureData: { x, y, width, height },
  beaconDescription: { x, y, width, height },
  scaleBar:          { x, y, width, height },
  surveyStatement:   { x, y, width, height },
  northArrow:        { x, y, width, height },
  sgSignature:       { x, y, width, height },
  endorsement:       { x, y, width, height },   // NEW slot — both formats emit here
  needsScaleUp:      boolean,                    // sheet/scale escalation signal
  warnings:          [...]                       // structured warn entries
}
```

All positions in **PDF points**. DXF converts to paper-mm via `PT_TO_MM = 25.4 / 72` at consumption (existing convention in `dxfScheduleHelpers.js`).

### What moves into the planner

- The body of `calculateBlockPositions` from `pdfkitGeoPDF.js:7841-8719`, renamed `planSheetLayout`.
- `calculateTitleBlockHeight` (currently in `pdfkitGeoPDF.js`, pure helper called only from the planner).
- Any other pure layout helpers called only by `calculateBlockPositions` — identified during implementation by grepping the function body.
- The `_topoPolyPts`-aware zone ranking that's already partially wired in the PDF (we already pass `polyPts` from the call site at `pdfkitGeoPDF.js:13486`).
- **From DXF:** the Pass 2 closed-polygon validation pattern from `dxfScheduleEmitter.js` — when a candidate position is validated against the polygon, the polygon is explicitly closed first (append `polyPts[0]` if not already closed). Prevents the spurious-zone bug documented in the 3-v3 sweep memory.

### What stays where it is

- **In `pdfkitGeoPDF.js`:** every `drawX()` function; the PDFKit-doc text measurement (wrapped in a thin `pdfKitMeasureText(str, font) → number` adapter passed into the planner); the Z-order collision registry; tick-mark drawing; the sheet-escalation control flow (`SHEET_ORDER`, `MAX_SHEET_UP_ATTEMPTS`); the call site at `pdfkitGeoPDF.js:13472` is replaced with `planSheetLayout({ ... })`.
- **In `dxfGenerator.js`:** all DXF entity emission; the `dxfMeasureText` adapter `(str, { family, size }) => str.length * size * 0.55` matching the 3-v3 width factor; the scale/paper/polygon setup before the planner call; a new orchestration block that iterates `blockPositions` and dispatches to the format-specific emitters with positions converted to mm.
- **In `dxfBottomZoneEmitter.js`:** the `emitX` functions (`emitOutsideFigureData`, `emitStatement`, `emitSGBox`, `emitBeaconDescriptions`) — DELETED: `placeBottomZoneBlocks`, `sizeStatement`, `sizeOFDTable`, `sizeSGBox`, `sizeBeaconDescriptions`, `fallbackCorner`. Module shrinks to a thin emit layer.
- **In `dxfScheduleEmitter.js`:** Pass 1/2/3 split-into-smaller logic unchanged; the only diff is that its `topLeft` argument is now passed in from the shared planner (via `dxfGenerator.js`) rather than computed by `placeBottomZoneBlocks`.

### Interface decisions baked in

- **`measureText` is the only injection point.** Everything else in the planner is pure geometry over inputs. PDF passes a PDFKit-backed adapter; DXF passes the 0.55-width-factor heuristic.
- **`zOrderCollisionRegistry` is dropped from the planner's interface.** It was always PDF-internal (5 layers managing parcel-internal text collisions). Pre-seeded obstacle bboxes for the planner are passed through `tickMarkBounds` only. PDF keeps using its registry for parcel-internal label work; that work was already out of the planner's scope.
- **`logger` is duck-typed.** Any object with `info`, `warn`, `error` methods works. Both formats already provide one.
- **Endorsement block becomes a `blockPositions.endorsement` slot.** Block dimensions come from `app-shared/block-definitions.js` `ENDORSEMENT_BLOCK` (already defined: 150×150 mm at `right-margin`). The planner returns the slot's top-left in PDF points. PDF's `drawEndorsementBlock(doc, mapBounds, pageWidth, pageHeight)` signature changes to `drawEndorsementBlock(doc, mapBounds, blockPositions.endorsement)` — it draws at the planner-assigned position instead of computing the position internally from `pageWidth`/`pageHeight`. DXF gets a new emitter `emitEndorsementBlock(out, mmPos.endorsement, ...)` in `dxfGenerator.js`.

## Verification

### Golden-PDF snapshot harness

Two fixtures, checked into `app-backend/src/services/__tests__/fixtures/`:

- `fixture-minimal.json` — 2-3 stands, single-column schedule, one beacon group. Catches easy regressions, runs in <2 s.
- `fixture-realistic.json` — 10-15 stands, ~20 outside-figure edges, ~30 beacons. Representative township plan. Exercises the schedule-split branch, the OFD column-fit logic, beacon-description sizing, and collision avoidance against tick marks.

Each fixture is the exact JSON input shape `_generateGeoPDFInner` consumes: `{ metadata, parcels, outsideFigureData, beacons, sheetSize, scale }`.

**Snapshot format:** Page-text-and-position dump via `pdfjs-dist`, sorted deterministically by `(page, y, x)`:

```json
[
  { "page": 1, "text": "GENERAL PLAN",      "x": 297.6, "y": 28.4, "font": "Helvetica-Bold", "size": 16 },
  { "page": 1, "text": "Maglas Township",   "x": 297.6, "y": 60.2, "font": "Helvetica-Bold", "size": 10 },
  ...
]
```

Catches block-position drift (the primary goal), font/size changes, content changes, and missing text. Does *not* catch pure-graphic regressions (lines, dashes, dot patterns) — those are out of scope for a planner refactor.

**Where it lives:**
- Test: `app-backend/src/services/__tests__/pdfkitGeoPDF.snapshot.test.js`
- Snapshot file: `app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap` (Jest-managed)
- Fixtures: `app-backend/src/services/__tests__/fixtures/fixture-minimal.json`, `fixture-realistic.json`

**Test discipline:**
1. **Task 1 of the implementation plan** adds `pdfjs-dist` as a `devDependency` in `app-backend/package.json`, writes the fixtures, generates the baseline snapshot, and commits it. This is the pre-refactor known-good.
2. **Every subsequent task** runs the snapshot test as part of its definition-of-done. A non-empty diff means the task is not done.
3. Intentional layout changes (e.g., porting DXF wins in 3-v6) update the snapshot via `jest --updateSnapshot` with a commit message explaining the diff.

**Runtime cost:** Two fixtures × full PDF generation + text extraction ≈ 5-10 s per run. Acceptable for normal `npm test`. Tagged `describe('PDF snapshot', ...)` for selective execution if needed.

### Golden-DXF snapshot harness

Same two fixtures, captured before the DXF migration and held green throughout.

- Test: `app-backend/src/services/__tests__/dxfGenerator.snapshot.test.js`
- Snapshot format: a deterministic entity-list dump from the generated DXF — `{ layer, type, position: { x, y }, content }` tuples sorted by `(layer, y, x)`. Captures text positions and primary block insertion points; does not snapshot every coordinate of every polyline (those are polygon geometry, unaffected by the planner change).
- Discipline: same as PDF snapshot — baseline captured pre-migration, then held green on every step. The expected DXF diffs are: (a) the schedule's `topLeft` shifts to wherever the PDF planner places it (instead of the DXF `placeBottomZoneBlocks` position) — its internal Pass 1/2/3 sub-tables then arrange around the new `topLeft`; (b) the OFD, statement, SG box, and beacon-description positions shift to match PDF's; (c) the new endorsement-block entities appear. Each shift is reviewed and accepted via `jest --updateSnapshot` in the relevant migration task's commit.

### PDF ↔ DXF parity test

New test `app-backend/src/services/__tests__/dxfGenerator.parity.test.js`. One test per fixture, asserting that the DXF block positions match the PDF block positions converted via `PT_TO_MM`, within 0.1 mm tolerance, on `titleBlock`, `scheduleOfAreas`, `outsideFigureData`, `beaconDescription`, `scaleBar`, `surveyStatement`, `northArrow`, `sgSignature`, `endorsement`.

The parity test is what proves the goal of the sub-project — same arrangement in both outputs.

### Planner unit tests

New `app-shared/__tests__/sheetLayoutPlanner.test.js`. Uses a fake `measureText = (str, { size }) => str.length * size * 0.55` so the tests run without either format's runtime. Covers:

- Each block's size calculation against `block-definitions.js` constants.
- Schedule split-into-smaller branch trigger (`_schedNeedsSplit = true` when `_schedSingleColHeight > _schedAvailableHeight`).
- Sheet-escalation trigger (`needsScaleUp = true` when blocks can't be placed without polygon overlap).
- Tick-mark collision avoidance — when `tickMarkBounds` overlaps a candidate position, the planner picks a different one.
- Closed-polygon validation — verifying that an open polygon input doesn't produce spurious zones near the missing closing edge (the regression captured during the schedule-split-and-dynamic-cols sub-project).
- Endorsement-block slot returned at the canonical right-margin position.

Aim: ≥80% line coverage on `sheetLayoutPlanner.js`.

## Data flow

```
                              ┌─────────────────────────────────┐
                              │  app-shared/sheetLayoutPlanner  │
                              │       planSheetLayout(...)      │
                              └────────────────┬────────────────┘
                                               │
                  ┌────────────────────────────┴─────────────────────────────┐
                  │                                                          │
       pdfKitMeasureText (PDFKit-backed)                          dxfMeasureText (0.55 width factor)
                  │                                                          │
        pdfkitGeoPDF._generateGeoPDFInner                       dxfGenerator.generateDXF
                  │                                                          │
                  ▼                                                          ▼
        blockPositions (pt)                                       blockPositions (pt)
                  │                                                          │
                  ▼                                              × PT_TO_MM ▼
        drawTitleBlock(doc, blockPositions.titleBlock, ...)       blockPositions (mm)
        drawScheduleOfAreas(doc, ..., schedule)                            │
        drawOutsideFigureData(doc, ..., ofd)                                ▼
        drawBeaconDescription(doc, ..., beaconDesc)             emitTitleBlock(out, mm.titleBlock, ...)
        drawScaleBar(doc, ..., scaleBar)                        emitScheduleOfAreasTopological(out, mm.scheduleOfAreas, ...)
        drawSurveyStatement(doc, ..., statement)                emitOutsideFigureData(out, mm.outsideFigureData, ...)
        drawNorthArrow(doc, ..., northArrow)                    emitBeaconDescriptions(out, mm.beaconDescription, ...)
        drawSurveyorGeneralSignature(doc, ..., sg)              emitScaleBar(out, mm.scaleBar, ...)
        drawEndorsementBlock(doc, ..., endorsement)             emitStatement(out, mm.surveyStatement, ...)
                                                                emitNorthArrow(out, mm.northArrow, ...)
                                                                emitSGBox(out, mm.sgSignature, ...)
                                                                emitEndorsementBlock(out, mm.endorsement, ...)
```

## Component contract changes

**`pdfkitGeoPDF.js`** — `_generateGeoPDFInner` replaces this:

```js
const blockPositions = calculateBlockPositions(
  doc, metadata, filteredParcels, outsideFigureData, filteredBeacons,
  mapBounds, mapFeatureBounds, logger, optimalScale, calculatedExtent,
  initialTickMarkBounds, zOrderCollisionRegistry, figureBounds, _topoPolyPts
);
```

with this:

```js
const pdfKitMeasureText = (str, { family, size }) =>
  doc.font(family).fontSize(size).widthOfString(str);

const blockPositions = planSheetLayout({
  metadata, parcels: filteredParcels, outsideFigureData, beacons: filteredBeacons,
  mapBounds, mapFeatureBounds, scale: optimalScale, extent: calculatedExtent,
  tickMarkBounds: initialTickMarkBounds, figureBounds, polyPts: _topoPolyPts,
  measureText: pdfKitMeasureText, logger
});
```

The 12 `drawX()` calls below the planner call site remain unchanged in shape (each still takes `blockPositions.<slot>`).

`calculateBlockPositions` is deleted from `pdfkitGeoPDF.js` after its body has been ported to `sheetLayoutPlanner.js`. `calculateTitleBlockHeight` moves to the planner module as a private helper (or stays exported from `pdfkitGeoPDF.js` only if some other call site in the PDF still uses it — confirmed during implementation).

**`dxfGenerator.js`** — replaces the current `placeBottomZoneBlocks(...)` orchestration with:

```js
const dxfMeasureText = (str, { family, size }) => str.length * size * 0.55;

const blockPositions = planSheetLayout({
  metadata, parcels, outsideFigureData, beacons,
  mapBounds: { x: 0, y: 0, width: paperW_pt, height: paperH_pt },
  mapFeatureBounds, scale, extent, tickMarkBounds, figureBounds, polyPts,
  measureText: dxfMeasureText, logger
});

const mmPos = Object.fromEntries(Object.entries(blockPositions)
  .filter(([k]) => !k.startsWith('_') && !['needsScaleUp', 'warnings'].includes(k))
  .map(([k, p]) => [k, {
    x: p.x * PT_TO_MM, y: p.y * PT_TO_MM,
    width: p.width * PT_TO_MM, height: p.height * PT_TO_MM
  }]));

emitTitleBlock(out, mmPos.titleBlock, metadata, ...);
emitScheduleOfAreasTopological(out, mmPos.scheduleOfAreas, ...);
emitOutsideFigureData(out, mmPos.outsideFigureData, outsideFigureData, ...);
emitBeaconDescriptions(out, mmPos.beaconDescription, ...);
emitScaleBar(out, mmPos.scaleBar, scale, ...);
emitStatement(out, mmPos.surveyStatement, metadata, ...);
emitNorthArrow(out, mmPos.northArrow, ...);
emitSGBox(out, mmPos.sgSignature, ...);
emitEndorsementBlock(out, mmPos.endorsement, ...);  // NEW
```

**`dxfBottomZoneEmitter.js`** — module shrinks from 8 exports + orchestrator to 4 emit-only exports (`emitOutsideFigureData`, `emitStatement`, `emitSGBox`, `emitBeaconDescriptions`). Deleted: `placeBottomZoneBlocks`, `sizeStatement`, `sizeOFDTable`, `sizeSGBox`, `sizeBeaconDescriptions`, `fallbackCorner`.

**`dxfGenerator.js`** also gains a new local function `emitEndorsementBlock(out, mmPos, ...)` that emits the title text, the column headers, the default-row content per `ENDORSEMENT_BLOCK` in `block-definitions.js`. ~50 LOC.

## Migration sequence (preview)

The implementation plan will sequence the work approximately as:

1. **Snapshot harness foundation** — add `pdfjs-dist` devDep, write the two fixtures, capture both PDF and DXF baseline snapshots, commit.
2. **Create the planner module skeleton** — `app-shared/sheetLayoutPlanner.js` with the function signature, no body yet; failing unit tests for size calcs.
3. **Lift `calculateBlockPositions` byte-for-byte** — copy the body into the new module, leave PDF calling the old function untouched. Planner unit tests pass.
4. **Decouple from PDFKit doc** — replace the inline `doc.fontSize(9).font('Helvetica'); doc.widthOfString(...)` calls with `measureText(str, { family: 'Helvetica', size: 9 })`. Planner unit tests still pass.
5. **PDF switches to the planner** — `_generateGeoPDFInner` now calls `planSheetLayout(...)` instead of `calculateBlockPositions(...)`; the old function is deleted from `pdfkitGeoPDF.js`. Golden-PDF snapshot diff must be zero.
6. **Add endorsement slot to the planner** — extend `blockPositions` shape with `endorsement: { x, y, width, height }` derived from `ENDORSEMENT_BLOCK` constants in `block-definitions.js`. `drawEndorsementBlock`'s signature changes from `(doc, mapBounds, pageWidth, pageHeight)` to `(doc, mapBounds, blockPositions.endorsement)`. Golden-PDF snapshot remains zero-diff (the endorsement renders at the same position it does today; we've just moved where the position is computed).
7. **Port closed-polygon validation** — small fix to the planner's candidate validation, asserted by a new unit test reproducing the spurious-zone bug. Snapshots unchanged on the existing fixtures (only matters at the polygon-edge boundary).
8. **DXF starts consuming the planner** — `dxfGenerator.js` calls `planSheetLayout`, builds `mmPos`, dispatches to the existing `emitX` functions (still in `dxfBottomZoneEmitter.js`). `dxfBottomZoneEmitter.placeBottomZoneBlocks` and the `sizeX`/`fallbackCorner` helpers are deleted. Golden-DXF snapshot updates expected and reviewed.
9. **DXF endorsement emit** — new `emitEndorsementBlock` in `dxfGenerator.js`. Golden-DXF snapshot updates to include the new entities; parity test asserts position matches PDF.
10. **DXF parity test** — `dxfGenerator.parity.test.js` asserts position match within tolerance on both fixtures.

Each step is a discrete commit on the implementation branch.

## Error surfaces

- **Planner returns `needsScaleUp: true`** — PDF's existing sheet/scale escalation control flow handles it (recursive `_generateGeoPDFInner` call with the next sheet size). DXF: today's behavior is no escalation; it just warns and emits what it can. 3-v5 preserves the DXF current behavior — `needsScaleUp` is logged as a warning but no escalation is attempted. Adding DXF sheet escalation is a future sub-project.
- **`measureText` returns 0 or NaN** — defensive guard inside the planner: any non-finite width measurement falls back to a conservative `str.length * size * 0.55`. Logged as a warning. Both formats' adapters should never produce this in practice.
- **Snapshot test fails on an intentional layout change** — the task that intentionally changes layout updates the snapshot via `jest --updateSnapshot` and explains the diff in the commit message.
- **Fixture project becomes stale** — the fixtures are versioned with the spec; structural changes to `_generateGeoPDFInner`'s input shape require a fixture update at the same time.

## Risks (flagged, not blocking)

- **PDF's candidate ordering may not maximize whitespace.** The user wants the schedule anchored in whitespace-rich spots. If PDF's `calculateBlockPositions` turns out to pick the first valid candidate rather than the best, the DXF schedule will land in legible-but-not-optimal positions after 3-v5. Resolution: validate against `fixture-realistic.json` during implementation; if the schedule landing is poor, port DXF's `dxfTopology.computeWhitespaceZones` ranking into the planner as part of 3-v6.
- **`pdfjs-dist` cross-platform footprint.** It pulls in canvas dependencies on some environments. Mitigation: use the text-extraction path only (no rendering), which avoids the canvas dependency.

## Acceptance criteria

1. New module `app-shared/sheetLayoutPlanner.js` exports `planSheetLayout({ ..., measureText, logger }) → blockPositions` with the shape in the Architecture section.
2. `app-shared/__tests__/sheetLayoutPlanner.test.js` exists with ≥80% line coverage on the new module, covering each block-size calc, schedule split, sheet escalation, tick-mark collision avoidance, and closed-polygon validation.
3. `pdfkitGeoPDF.snapshot.test.js` passes on both `fixture-minimal.json` and `fixture-realistic.json` against snapshots captured before the planner extraction (zero text/position drift on the bulk of the diff; the deliberate endorsement-slot diff is a single approved snapshot update).
4. `_generateGeoPDFInner` calls `planSheetLayout(...)` not `calculateBlockPositions(...)`; the old function is removed from `pdfkitGeoPDF.js`.
5. `dxfGenerator.snapshot.test.js` passes on both fixtures against snapshots captured before the DXF migration. Schedule sub-table position shifts are approved snapshot updates; everything else is zero-diff.
6. `dxfGenerator.parity.test.js` asserts DXF block positions ≈ PDF block positions × `PT_TO_MM` within 0.1 mm tolerance on `titleBlock`, `scheduleOfAreas`, `outsideFigureData`, `beaconDescription`, `scaleBar`, `surveyStatement`, `northArrow`, `sgSignature`, `endorsement` for both fixtures.
7. `dxfBottomZoneEmitter.js` no longer exports `placeBottomZoneBlocks`, `sizeStatement`, `sizeOFDTable`, `sizeSGBox`, `sizeBeaconDescriptions`, or `fallbackCorner`. Exports shrink to the four emit functions.
8. `dxfGenerator.js` emits the endorsement block via a new local `emitEndorsementBlock` function at the planner-assigned position.
9. Full DXF test suite passes; count is 334 ± 5 (a small net change reflecting the bottom-zone tests adapted in step 8 of the migration).
10. The two fixture PDFs and DXFs render visibly identical when opened side-by-side (sanity check after the snapshot test passes).

## Out of scope (deferred)

- Porting DXF's other wins into the planner (`computeWhitespaceZones` topology-zone ranking, right-anchor + shrink-to-fit schedule, Pass 3 polygon-skip rescue) — sub-project **3-v6**.
- Multi-sheet tiling — sub-project **#5**, resumed after 3-v6.
- Parcel-internal labels (stand numbers, distance/bearing edge labels, beacon labels) — separate future sub-project.
- Polygon rendering (tick marks, parcel edges, dimension lines, north grid).
- DXF sheet-size / scale escalation (today's behavior preserved: warn only, no retry).
- Frontend changes — the UI does not consume `blockPositions`.

## How this fits the bigger picture

After 3-v5, the SI 727 surrounding-block arrangement is one algorithm consumed by two renderers. The 3-v3 single-source-of-truth pattern for *dimensions* (in `app-shared/block-definitions.js`) is now joined by a single source of truth for *positions* (in `app-shared/sheetLayoutPlanner.js`).

This positions the codebase for:
- 3-v6: port DXF planning improvements into the planner — both formats benefit.
- #5: implement multi-sheet tiling as a planner change — both formats inherit it.
- A future PDF refactor (e.g., breaking up the 14k-line `pdfkitGeoPDF.js`) — the planner is already separated; remaining work is the `drawX()` rendering layer.
- A future format addition (e.g., SVG, or a different CAD format) — only new emitters needed; planner is reused.

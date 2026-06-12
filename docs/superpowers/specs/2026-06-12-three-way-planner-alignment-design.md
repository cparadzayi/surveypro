# Three-Way Planner Alignment (sub-project 3-v7) — Design

**Date:** 2026-06-12
**Status:** Draft (pending user review)
**Sub-project:** 3-v7 of the dxfGenerator re-baseline against pdfkitGeoPDF
**Modules touched primarily:** new `app-shared/sheetEscalation.js`, `app-backend/src/services/sheetLayoutPlanner.js`, `app-backend/src/services/pdfkitGeoPDF.js`, `app-backend/src/services/dxfGenerator.js`, `app-backend/src/services/dxfScheduleEmitter.js`

## Goal

Close the three remaining alignment gaps between PDF and DXF output identified during 3-v6 testing on a 240-stand Maglas plan:

1. **Column widths** — DXF computes dynamic schedule-column widths via `computeScheduleColumnWidths`; PDF uses hardcoded static widths. The planner only sees the static widths, so its schedule slot doesn't accommodate DXF's actual rendered width on plans with long deed numbers or stand designations.
2. **Paper-size escalation** — PDF re-generates at A1 or A0 when blocks can't fit clean on A2; DXF emits whatever fits at the requested paper size and accepts overlap. Dense plans end up on different paper sizes in each format.
3. **Polygon-overlap handling** — DXF's `fixedPosition` mode (added in 3-v6) emits unconditionally; PDF's renderer doesn't perform an additional overlap check either, but neither format emits a structured warning when overlap occurs. Users have no machine-readable signal that the plan needs intervention.

After 3-v7, the planner is the single decision-maker for arrangement *and* sizing, both formats feed it the same inputs, both consume its output identically, and both emit identical warnings on edge cases.

## Strategy (already settled with the user)

- **PDF migrates to dynamic column widths.** PDF's three schedule render functions (`drawScheduleOfAreas`, `drawScheduleOfAreasSingleColumn`, `drawScheduleOfAreasMultiTable`) all switch to reading widths from the planner's `scheduleColumnWidthsPt` input. The PDF snapshot will drift on existing fixtures (deed-number columns get wider where dynamic widths exceed the static 35–60 pt minimums); that drift is the proof the migration worked, reviewed and re-baselined.
- **DXF mirrors PDF's escalation.** `SHEET_ORDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']`, `MAX_SHEET_UP_ATTEMPTS = 2`. DXF re-invokes `generateDXF` recursively with the next paper size when `blockPositions.needsScaleUp` fires. Same ladder, same exhaustion semantics, same warning payload.
- **On exhaustion, both formats render anyway and warn.** Schedule is mandatory under SI 727. When even A0 doesn't accommodate the plan without polygon overlap, both formats emit at the planner-assigned position and add structured warnings. The user retains a partial-but-complete output for client review.

## What does not change

- The `drawX()` functions in `pdfkitGeoPDF.js` other than the three schedule renderers (rendering side for title, OFD, beacon-desc, statement, north arrow, SG, endorsement is unchanged).
- The `emitX` functions in `dxfBottomZoneEmitter.js` (OFD, statement, SG, beacon-description) — they already render at planner-assigned positions.
- `app-shared/block-definitions.js` — the `SCHEDULE_OF_AREAS.singleColumn.columns[].width` values remain canonical *minimums* respected by `computeScheduleColumnWidths`. No new fields needed.
- The DXF coordinate-system reconciliation (`M_TO_PT`, `PT_TO_M`) shipped in 3-v5.
- The DXF schedule emitter's `fixedPosition` mode shipped in 3-v6. We add a warning when polygon overlap is detected; the emit behavior itself is unchanged.
- Frontend code. The UI does not consume `blockPositions` or `warnings.summary` directly today.

## Architecture

### The shared escalation module

New module: `app-shared/sheetEscalation.js`. Tiny, pure:

```js
export const SHEET_ORDER = ['ISO_A2', 'ISO_A1', 'ISO_A0'];
export const MAX_SHEET_UP_ATTEMPTS = 2;

/**
 * Returns the next sheet size in the escalation ladder, or null if the current
 * sheet is already the largest or not in the ladder.
 */
export function nextSheetUp(currentSheet) {
  const idx = SHEET_ORDER.indexOf(currentSheet);
  if (idx < 0 || idx >= SHEET_ORDER.length - 1) return null;
  return SHEET_ORDER[idx + 1];
}
```

Both `pdfkitGeoPDF.js` and `dxfGenerator.js` import these. The existing PDF escalation logic at `pdfkitGeoPDF.js:13497-13559` is updated to use the imported constants (instead of its current inline definitions). DXF's new escalation block uses the same imports.

### Planner: new input `scheduleColumnWidthsPt`

`planSheetLayout` accepts an optional `scheduleColumnWidthsPt` parameter (array of 6 numbers in PDF points). When provided, the planner uses it to compute `_schedSingleColWidth`:

```js
// In sheetLayoutPlanner.js, before delegating to calculateBlockPositions:
if (Array.isArray(scheduleColumnWidthsPt) && scheduleColumnWidthsPt.length === 6) {
  // Override the static sum used inside calculateBlockPositions by mutating
  // a SCHEDULE_OF_AREAS-shaped local clone before passing through… (see
  // implementation notes below — exact mechanism depends on whether we
  // pass it as a separate arg or override the BLOCKS lookup).
}
```

**Implementation choice:** the planner wrapper currently delegates to `calculateBlockPositions(doc, ...)`. Two options for plumbing the dynamic widths through:

- **Option A (recommended):** wrap the BLOCKS reference. `calculateBlockPositions` reads `BLOCKS.SCHEDULE_OF_AREAS.singleColumn.columns`. The wrapper temporarily overrides this read by passing a localized BLOCKS clone with the dynamic widths. Concrete: pass an extra argument or use a module-level injection. Either way, the call site at `pdfkitGeoPDF.js:7841-8719` sees the new widths during planning.
- **Option B:** add a second optional parameter to `calculateBlockPositions` itself (`scheduleColumnWidthsPt`) that takes precedence over the BLOCKS lookup. More invasive — touches the lifted PDF function — but simpler to reason about.

Option B is cleaner and chosen for 3-v7. The change to `calculateBlockPositions` is a small targeted edit (5 lines: replace the `_sch.columns.reduce(...)` with `scheduleColumnWidthsPt ? scheduleColumnWidthsPt.reduce(...) : _sch.columns.reduce(...)`).

When `scheduleColumnWidthsPt` is omitted, the planner falls back to static widths — preserves backwards compatibility for unit tests that don't pass it.

### PDF integration

`pdfkitGeoPDF.js` gains one new computation in `_generateGeoPDFInner` before the `planSheetLayout` call:

```js
import { computeScheduleColumnWidths } from '../../../app-shared/block-definitions.js';

// …after filteredParcels is built, before the planner call:
const _scheduleColumnWidthsPt = computeScheduleColumnWidths({
  dataRows: filteredParcels.features.map(extractScheduleRow),
  headerFontSize: BLOCKS.SCHEDULE_OF_AREAS.singleColumn.headerFontSize,
  bodyFontSize: BLOCKS.SCHEDULE_OF_AREAS.singleColumn.fontSize,
  measureText: (str, { family, size }) => doc.font(family).fontSize(size).widthOfString(str),
});

const blockPositions = planSheetLayout({
  // …existing args…
  scheduleColumnWidthsPt: _scheduleColumnWidthsPt,
});
```

PDF needs an `extractScheduleRow` helper that produces the same shape as DXF's. Implementation: import the existing one from `dxfScheduleHelpers.js` (it's a pure function, already exported). If this creates a circular import (PDF → dxfScheduleHelpers → eventually back to PDF), move `extractScheduleRow` to `app-shared/block-definitions.js` (it's stateless and only needs the parcel properties). The implementation plan checks for the cycle and applies the move if necessary.

Then `drawScheduleOfAreasSingleColumn` and `drawScheduleOfAreasMultiTable` accept the column widths via a new argument (or via `blockPositions` extension) and use them throughout instead of the hardcoded `_sch.columns[i].width` reads.

**`drawScheduleOfAreas` dispatcher signature change:** add `scheduleColumnWidthsPt` parameter. The dispatcher is currently called from `_generateGeoPDFInner` at `pdfkitGeoPDF.js:13600`; the call site gains the new argument.

### DXF integration

`dxfGenerator.js` already computes `scheduleColumnWidthsPt`. The change is one line: pass it to `planSheetLayout`:

```js
const blockPositions = planSheetLayout({
  // …existing args…
  scheduleColumnWidthsPt,  // NEW
  measureText: plannerMeasure,
  logger,
});
```

The escalation block is new:

```js
import { SHEET_ORDER, MAX_SHEET_UP_ATTEMPTS, nextSheetUp } from '../../../app-shared/sheetEscalation.js';

// …after the planner call, before emitting:
const _sheetSizeUpAttempt = options._sheetSizeUpAttempt ?? 0;
if (blockPositions.needsScaleUp && _sheetSizeUpAttempt < MAX_SHEET_UP_ATTEMPTS) {
  const nextSheet = nextSheetUp(sheetSize);
  if (nextSheet) {
    logger.warn(`[DXF] Blocks unplaceable on ${sheetSize} — escalating to ${nextSheet} (attempt ${_sheetSizeUpAttempt + 1}/${MAX_SHEET_UP_ATTEMPTS})`);
    return generateDXF({
      ...options,
      sheetSize: nextSheet,
      _sheetSizeUpAttempt: _sheetSizeUpAttempt + 1,
    }, logger);
  }
}

if (blockPositions.needsScaleUp) {
  warn('scheduleEscalationExhausted', {
    atSheetSize: sheetSize,
    attempts: _sheetSizeUpAttempt,
    hint: 'Plan too dense for largest available paper size; some blocks may overlap the figure.',
  });
}
```

PDF gains the same `scheduleEscalationExhausted` warn payload at its existing escalation-fallthrough point in `_generateGeoPDFInner`.

### Polygon-overlap warnings

Both formats add a small check after emission. Conceptually:

```js
// For each surrounding block that has a polygon-overlapping position at the
// final paper size, emit a structured warn:
function checkAndWarnOverlap(name, position, polygon, warn) {
  if (rectangleOverlapsPolygon(positionAsRect(position), polygon, 0)) {
    warn(`${name}OverlapsPolygon`, {
      blockName: name,
      position: { x: position.x, y: position.y, width: position.width, height: position.height },
      hint: `${name} block rendered over the parcel figure; CAD viewer layer toggling may help readability.`,
    });
  }
}
```

For DXF, the check happens after each `emit*` call. The schedule emitter does its own check (Section 4) and emits `scheduleOverlapsPolygon`. The orchestrator in `dxfGenerator.js` checks each of OFD, beacon, statement, SG against `figurePolygon` and emits the equivalent.

For PDF, the equivalent check happens after each `drawX` call, with the polygon in PDF-point space (use `mapFeatureBounds.pdfPoints`). The same warning categories — both formats produce identical `warnings.summary` keys.

`warn(...)` is the existing DXF helper; PDF needs an equivalent. PDF's current generator returns warnings as a separate object in `_generateGeoPDFInner` — extend that to capture the new categories.

## Data flow

```
                            ┌────────────────────────────────────────────┐
                            │  app-shared/block-definitions.js           │
                            │  - SCHEDULE_OF_AREAS (static minimums)     │
                            │  - computeScheduleColumnWidths (existing)  │
                            └────────────────────┬───────────────────────┘
                                                 │
                            ┌────────────────────▼───────────────────────┐
                            │  app-shared/sheetEscalation.js (NEW)       │
                            │  - SHEET_ORDER                             │
                            │  - MAX_SHEET_UP_ATTEMPTS                   │
                            │  - nextSheetUp(currentSheet)               │
                            └────────────────────┬───────────────────────┘
                                                 │
                            ┌────────────────────▼───────────────────────┐
                            │  sheetLayoutPlanner.js                     │
                            │  planSheetLayout({                         │
                            │    ..., scheduleColumnWidthsPt (NEW),      │
                            │    measureText, logger                     │
                            │  })                                        │
                            └─────┬──────────────────────┬───────────────┘
                                  │                      │
        ┌─────────────────────────▼────┐  ┌──────────────▼─────────────────────────────────┐
        │  pdfkitGeoPDF.js             │  │  dxfGenerator.js                                │
        │  - computeScheduleColumnWidths │ │  - computeScheduleColumnWidths (existing)       │
        │    via doc.widthOfString (NEW)│ │  - passes to planner (NEW)                      │
        │  - passes to planner (NEW)   │  │  - on needsScaleUp: recurse via SHEET_ORDER (NEW)│
        │  - drawScheduleOfAreas* uses │  │  - on exhaustion: warn + emit anyway (NEW)      │
        │    dynamic widths (NEW)      │  │  - polygon-overlap check per block, warn (NEW)  │
        │  - existing escalation loop  │  └─────────────────────────────────────────────────┘
        │    uses shared constants (NEW)│
        │  - polygon-overlap check per │
        │    block, warn (NEW)         │
        └──────────────────────────────┘
```

## Component contract changes

**`sheetLayoutPlanner.planSheetLayout(args)`** — new optional arg `scheduleColumnWidthsPt: number[6] | undefined`. When provided, the schedule slot is sized from this array (sum) instead of static block-definition widths.

**`pdfkitGeoPDF.calculateBlockPositions(...)`** — new positional parameter `scheduleColumnWidthsPt = null` appended to the existing 14-positional-arg signature (becomes the 15th). When provided, used for `_schedSingleColWidth`. When `null`, falls back to the static sum from `BLOCKS.SCHEDULE_OF_AREAS.singleColumn.columns`. The planner wrapper at `sheetLayoutPlanner.js` reads `args.scheduleColumnWidthsPt` and forwards it as the 15th positional argument.

**`pdfkitGeoPDF.drawScheduleOfAreas(...)`** — new parameter `scheduleColumnWidthsPt`. Passes through to `drawScheduleOfAreasSingleColumn` or `drawScheduleOfAreasMultiTable`.

**`pdfkitGeoPDF.drawScheduleOfAreasSingleColumn(...)` and `drawScheduleOfAreasMultiTable(...)`** — new parameter `scheduleColumnWidthsPt`. Used for column-width-dependent rendering (column x-anchors, cell text widths, table borders). Replaces hardcoded `_sch.columns[i].width` reads.

**`dxfGenerator.generateDXF(options, logger)`** — new optional `options._sheetSizeUpAttempt` (private, used by the recursive call). Default 0.

**`dxfScheduleEmitter.emitScheduleOfAreasTopological(...)`** — no signature change. The fixedPosition branch gains an internal polygon-overlap check that emits `warn('scheduleOverlapsPolygon', ...)` when triggered.

## Migration sequence (preview)

The implementation plan will sequence the work approximately as:

1. **`sheetEscalation.js` module** — new file, three exports, unit tests. Touches: new module only.
2. **PDF escalation uses shared constants** — replace inline `SHEET_ORDER` / `MAX_SHEET_UP_ATTEMPTS` with imports. PDF behavior unchanged; this is a refactor that lets the constants live in one place.
3. **Maglas snapshot fixture** — create `sampleMaglasPlan.js` from the user's actual problem plan. Capture baseline PDF + DXF snapshots before any 3-v7 behavior change so we have a known-bad reference point.
4. **Planner accepts `scheduleColumnWidthsPt`** — extend `planSheetLayout` signature; extend `calculateBlockPositions` signature. Unit test passes a fake widths array, asserts slot width matches.
5. **PDF uses dynamic widths in planner call** — `_generateGeoPDFInner` computes the widths and forwards. Snapshot drift expected on every fixture — re-baseline at the end of this task with full visual review.
6. **PDF schedule renderers consume dynamic widths** — `drawScheduleOfAreasSingleColumn` and `drawScheduleOfAreasMultiTable` use the new widths. Snapshot drift continues to be expected; re-baseline after both renderers updated.
7. **DXF passes widths to planner** — one line in `dxfGenerator.js`. DXF snapshot drift expected (the planner now agrees with DXF on schedule width, so position calc changes). Re-baseline.
8. **DXF escalation loop** — add the recursive `generateDXF` call. Unit test passes a tiny paper size and asserts `_sheetSizeUpAttempt` increments. Verify on the Maglas snapshot — DXF should end up on A0 (same as PDF).
9. **Polygon-overlap warnings (PDF + DXF)** — add the check at each block-emission site, plumb `warn` through PDF's generator return value, extend the parity test to assert warning-set agreement.
10. **Parity test extended** — Maglas-specific assertions: schedule width equality, slot positions within 0.1 mm, warning keys match.

Each step is a discrete commit on the implementation branch.

## Error surfaces

- **Planner returns `needsScaleUp: true` at A0** — both formats render anyway, both emit `scheduleEscalationExhausted` warning. Frontend can surface to user. No data loss; the schedule is rendered, just possibly overlapping the figure.
- **`scheduleColumnWidthsPt` omitted from a planner call** — falls back to static widths. Existing unit tests continue to pass.
- **`computeScheduleColumnWidths` returns non-finite values** — defensive guard inside `computeScheduleColumnWidths` (already present per the schedule-split-and-dynamic-cols sub-project). The widths fall back to the per-column minimums.
- **PDF's `extractScheduleRow` import from `dxfScheduleHelpers.js`** — if this creates a circular import (DXF imports planner imports PDF imports DXF helpers), move `extractScheduleRow` to a third location. Implementation flags this if it occurs.
- **Maglas fixture data sensitivity** — the user's actual Maglas plan may contain client-identifying details (surveyor names, deed numbers). The fixture is sanitized (synthetic deed numbers, neutral surveyor name) so it can be checked into git.

## Risks (flagged, not blocking)

- **PDF schedule renderer regression** — `drawScheduleOfAreasMultiTable` is ~300 LOC; the column-width migration touches many lines (every `_sch.columns[i].width` becomes the dynamic width). Snapshot test is the safety net. Visual review of three snapshots (minimal, realistic, Maglas) catches anything the snapshot misses.
- **Escalation cost on dense plans** — DXF generation re-runs from scratch on each escalation step. For a 240-stand plan with two escalation steps (A2→A1→A0), generation takes ~3× longer. PDF accepts this today; DXF adopts the same trade-off. Mitigation: most plans don't escalate (only triggers on dense ones); user explicitly requested the proper fix.
- **Frontend timeout on dense plans** — the existing 300 s axios timeout (per 3-v3 sweep) probably accommodates 3× DXF generation. If not, the timeout can be extended; not a 3-v7 blocker.
- **Snapshot churn** — every PDF and DXF snapshot updates as part of 3-v7. The diff is large but reviewable. Each update is documented in the commit message of the task that triggered it.

## Acceptance criteria

1. New module `app-shared/sheetEscalation.js` exports `SHEET_ORDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']`, `MAX_SHEET_UP_ATTEMPTS = 2`, and `nextSheetUp(currentSheet)`. Both PDF and DXF import them.
2. `planSheetLayout` accepts `scheduleColumnWidthsPt` (array of 6 numbers). When provided, the schedule slot width is `sum(scheduleColumnWidthsPt)`. When omitted, falls back to static.
3. `calculateBlockPositions` accepts the same parameter; backwards-compatible default.
4. `pdfkitGeoPDF._generateGeoPDFInner` computes `scheduleColumnWidthsPt` via `computeScheduleColumnWidths` and passes it through to the planner.
5. `drawScheduleOfAreasSingleColumn` and `drawScheduleOfAreasMultiTable` render with the dynamic widths (column anchors and cell text use them).
6. `pdfkitGeoPDF.js`'s existing escalation block uses the shared `SHEET_ORDER` / `MAX_SHEET_UP_ATTEMPTS`.
7. `dxfGenerator.generateDXF` re-invokes itself recursively with the next sheet size when `blockPositions.needsScaleUp` is true; the `_sheetSizeUpAttempt` counter respects `MAX_SHEET_UP_ATTEMPTS`.
8. Both PDF and DXF emit a structured `scheduleEscalationExhausted` warning when on A0 and `needsScaleUp` still fires.
9. Both PDF and DXF emit structured `<blockName>OverlapsPolygon` warnings (one category per surrounding block — `titleBlockOverlapsPolygon`, `scheduleOfAreasOverlapsPolygon`, `outsideFigureDataOverlapsPolygon`, `beaconDescriptionOverlapsPolygon`, `surveyStatementOverlapsPolygon`, `sgSignatureOverlapsPolygon`, `endorsementOverlapsPolygon`).
10. `sampleMaglasPlan.js` fixture exists and is checked in. PDF + DXF + parity snapshot tests assert against it. The fixture's deed numbers and surveyor names are sanitized synthetic values.
11. Extended parity test passes: `pdf.scheduleOfAreas.width === dxf.scheduleOfAreas.width`, slot positions match within 0.1 mm, `warnings.summary` keys match between the two formats on every fixture.
12. Visual review: open PDF and DXF Maglas outputs side-by-side. Block top-left corners agree within 0.1 mm. Schedule sub-table widths agree within 0.1 mm. Schedule may overlap polygon on both formats (acceptable per Section 4) but overlaps in the same physical position. PDFKit-rendered text and DXF entity-rendered text will look subtly different (font hinting, kerning) — that's not regarded as divergence; only positions and sizes are asserted.

## Out of scope (deferred)

- Frontend UI surfacing of `*OverlapsPolygon` warnings (separate frontend sub-project).
- Planner-side placement quality improvements on dense plans (the `placeBlocks` engine and the perimeter-biased fallback do their best already; improving them is a different sub-project).
- Multi-sheet tiling — still sub-project #5, untouched by 3-v7.
- Parcel-internal labels (stand numbers, distance/bearing, beacon labels) — remain format-specific per 3-v5 scope.
- Endorsement column width differences — DXF reserves a 150 mm right margin; PDF doesn't reserve that space. The two intentionally remain different here since SI 727 only mandates a separate endorsement column for paper output. The endorsement *position* per the planner is harmonized; the rendering surface differs.

## How this fits the bigger picture

After 3-v7, the planner is the single authoritative decision-maker for sheet arrangement and sizing. Both PDF and DXF feed it the same inputs (dynamic column widths included), consume its outputs identically (placement + needsScaleUp), and emit identical warning payloads on edge cases. The "three-way alignment" name reflects that three previously divergent paths (PDF rendering, DXF rendering, the planner's understanding) now agree.

This positions the codebase for:
- **#5 (multi-sheet tiling):** implemented as a planner change; both formats inherit automatically. Same alignment principle.
- **Future format additions:** SVG, alternate CAD formats, etc. — implement only the emit layer; planner unchanged.
- **A future cleanup:** the dead `placeBottomZoneBlocks` orchestrator and the sizing helpers in `dxfBottomZoneEmitter.js` (referenced from no live code path after 3-v5) can be safely deleted.
- **PDF refactor:** the dynamic-widths migration removes ~30 hardcoded `_sch.columns[i].width` reads from PDF's schedule renderers, reducing coupling between renderer and block-definitions.

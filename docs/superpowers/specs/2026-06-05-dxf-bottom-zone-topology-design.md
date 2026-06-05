# DXF Bottom-Zone Topological Emission (3-v4) — Design

**Sub-project:** 3-v4 of the SurveyPro pdfkitGeoPDF re-baseline.
**Branch:** `feature/dxf-bottom-zone-topology`, from `main` at `dcf3fb3` (the #6 beacon-enrichment merge).
**Predecessors:** [3-v2 schedule topology emitter](2026-06-04-dxf-schedule-of-areas-3v2-design.md), [4c block placer](2026-06-03-dxf-block-placer-4c-design.md), [#6 beacon enrichment](2026-06-05-dxf-beacon-enrichment-design.md).

## Motivation

Two user-visible issues in the current DXF output:

1. **Stray vertical line** running from the drawing-zone divider down to the content-area bottom — at `dxfGenerator.js:1625`:
   ```js
   addLine(TB, statementR, drawDivY, statementR, cntB);
   ```
   This was the partition between the "statement" column (left) and the "approved" column (right) in the pre-3-v2 fixed bottom-zone layout. The PDF does not emit any equivalent — block borders alone separate content there — so this line breaks 1:1 PDF parity.

2. **Schedule of Areas cannot grow into the bottom half of the page.** Sub-project 3-v2 made the schedule topology-placed, but its `drawingZone` is clamped to the rectangle *above* `drawDivY` (the upper ~60% of content area). The bottom ~40% is occupied by fixed-position blocks: the Survey Date Statement, the Outside Figure Data table, and the Surveyor-General Approval Box. On dense plans (Maglas-density and similar) the schedule overflows because it can't borrow the whitespace under those fixed blocks.

The fix to both is the same architectural move: dissolve the fixed bottom-zone partition entirely and route every bottom-zone block through topology placement. The schedule's `drawingZone` then expands to the full content area, and the four neighbour blocks find their own spots in the leftover whitespace.

This continues the lineage [[pdfkit-block-placement-uses-topological-scan]] established for the PDF generator and ported in pieces through sub-projects #3, 3-v2, and 4c.

## Scope

In scope:
- Topology placement for **Survey Date Statement**, **Outside Figure Data table**, **Surveyor-General Approval Box**, **Beacon Descriptions**, and (existing) **Schedule of Areas** — all five through one orchestrator.
- Schedule's `drawingZone` expanded from above-`drawDivY`-only to the full content area `cntL..cntR × cntB..cntT`.
- Pre-seeded obstacles in the topology scan: title zone, north arrow, scale bar.
- Per-block fallback corner + warn category when topology returns no valid position.
- Removal of the obsolete bottom-zone partition variables (`statementL`, `statementR`, `approvedL`, `approvedR`) and the stray `addLine` divider.

Out of scope:
- Multi-sheet tiling (sub-project #5) — the trigger condition stays wired via `scheduleOverflow`, but actual tiling is deferred.
- Topology placement for the title zone itself (stays fixed).
- North arrow / scale bar / grid references repositioning (stay fixed; they become obstacles, not topology-placed).
- Endorsements column (lives in the right margin, outside the content area).
- Any change to PDF generation.

## Architecture

### New module: `app-backend/src/services/dxfBottomZoneEmitter.js`

Pure-function module. Imports `findBlockPosition` from `./dxfBlockPlacer.js`; imports `OUTSIDE_FIGURE_DATA`, `SURVEYOR_GENERAL_BOX`, `PT_TO_MM_GEN` from `../../../app-shared/block-definitions.js`. No DXF-string emission inside; all output goes through caller-injected `addText` / `addLine` / `addRect` callbacks.

Exported sizing functions (pure; same inputs → same `{width, height}`):

```js
sizeStatement(metadata, fonts)                      → {width, height}
sizeOFDTable(outsideFigureData, fonts, mm)          → {width, height}
sizeSGBox(mm)                                       → {width, height}
sizeBeaconDescriptions(beaconGroups, fonts, mm)     → {width, height}
```

`mm` is `helpers.mm` — the paper-millimetre → ground-metre converter at the current page scale. All returned dimensions are in ground-metres so they can feed `findBlockPosition` directly.

Returns `{width: 0, height: 0}` when the block has no content to emit (no edges, no beacon groups, no surveyor metadata). The orchestrator interprets `{0,0}` as a skip-emission signal — no topology lookup, no fallback, no warn.

Exported emit functions (side-effecting via callbacks):

```js
emitStatement(addText, position, metadata, fonts)
emitOFDTable(addText, addLine, position, outsideFigureData, fonts, centralMeridian)
emitSGBox(addText, addLine, addRect, position, fonts)
emitBeaconDescriptions(addText, position, size, beaconGroups, fonts)
```

`position` is the top-left `{x, y}` returned by `findBlockPosition` (DXF south-up: top-left has the larger `y`). Each emitter knows its own internal layout — column anchors, text baselines, divider lines — and reproduces the exact emission pattern from the current C2/C3 code in `dxfGenerator.js:1691-1801`.

Exported orchestrator:

```js
placeBottomZoneBlocks({
  contentArea,           // {x, y, width, height} — full cntL..cntR × cntB..cntT
  polygon,               // figure polygon, or null
  obstacles,             // pre-seeded placedBlocks (title, northArrow, scaleBar)
  surveyedFeatures,      // for schedule emitter
  outsideFigureData,
  beaconGroups,
  metadata,
  centralMeridian,
  sheetSize,
  fonts,                 // { hHead, hBody, rH, ofTitleH, ofBodyH, ofRowH, sgTitleH, sgBodyH, ... }
  helpers,               // schedule emitter helper bag (mm, extractScheduleRow, ...)
  addText, addLine, addRect,
  warn, logger,
})
  → { placedBlocks, scheduleResult, southmostY }
```

The orchestrator places blocks in **PDF order** (matching `pdfkitGeoPDF.js:calculateBlockPositions` at lines 8553–8581): **OFD → schedule → beacon descriptions → statement → SG box**.

Per-block loop body:
1. `size = sizeXxx(...)`
2. If `size.width === 0` → skip (no content).
3. `position = findBlockPosition({block: size, mapBounds: contentArea, polygon, placedBlocks, buffer, blockSpacing, scanStep, tableMinWidth, logger})`
4. If `position === null` → emit `warn('xxxOverflow', ...)`, set `position = fallbackCorner(blockName, size, contentArea, placedBlocks)`.
5. `emitXxx(addText, ..., position, ...)`
6. `placedBlocks.push({ ...position, ...size, name: 'xxx' })`

Schedule emission is delegated to `emitScheduleOfAreasTopological` (existing) with three new parameter values:
- `drawingZone: contentArea` (full content area, not above-`drawDivY`).
- `seedPlacedBlocks: placedBlocks` (currently-placed obstacles).
- All other parameters unchanged.

The orchestrator concatenates `scheduleResult.placedTables` into `placedBlocks` after the schedule emitter returns, so blocks placed after the schedule (beacon, statement, SG) avoid the schedule sub-tables.

### Modified module: `app-backend/src/services/dxfScheduleEmitter.js`

One new optional parameter on `emitScheduleOfAreasTopological`:

```js
emitScheduleOfAreasTopological({
  // ... existing parameters ...
  seedPlacedBlocks = [],  // NEW: external obstacles to honour in addition to placedPositions
})
```

Implementation change: every `findBlockPosition` call across Pass 1, Pass 2, and Pass 3 receives `placedBlocks: [...seedPlacedBlocks, ...placedPositions]` instead of `placedBlocks: placedPositions`. Default `[]` keeps all existing callers unchanged.

### Modified module: `app-backend/src/services/dxfGenerator.js`

Deletions:
- The four bottom-zone partition variables `statementL`, `statementR`, `approvedL`, `approvedR` (lines 1619–1622).
- The stray vertical divider line `addLine(TB, statementR, drawDivY, statementR, cntB)` (line 1625).
- The entire C2 section (Survey Date Statement + OFD table emission, lines 1691–1773).
- The entire C3 section (SG box emission, lines 1775–1801).
- The `addBeaconDescription` standalone call (lines 1684–1689).
- The current `emitScheduleOfAreasTopological` call (lines 1658–1676) — replaced by orchestrator.

Replacement: a single orchestrator call inside section C, immediately after the figure-polygon construction (line 1645). The orchestrator receives:
- `contentArea = {x: cntL, y: cntB, width: cntR - cntL, height: cntT - cntB}` — full content area.
- `polygon = figurePolygon` (existing construction unchanged).
- `obstacles` — three pre-seeded bboxes:
  - Title zone: `{x: cntL, y: titleDivY, width: cntR - cntL, height: cntT - titleDivY}`
  - North arrow: `{x: cntR - mm(15), y: cntT - mm(20), width: mm(15), height: mm(20)}`
  - Scale bar: `{x: cntR - mm(40), y: cntB + mm(15), width: mm(40), height: mm(10)}`
- `fonts`: the existing pt-converted heights (`hHead`, `hBody`, `rH`, `pt(OUTSIDE_FIGURE_DATA.titleFontSize)`, `pt(OUTSIDE_FIGURE_DATA.fontSize)`, `pt(OUTSIDE_FIGURE_DATA.rowHeight)`, `pt(SURVEYOR_GENERAL_BOX.titleFontSize)`, `pt(SURVEYOR_GENERAL_BOX.bodyFontSize)`).
- All existing values (`metadata`, `centralMeridian`, `outsideFigureData`, `options.beaconGroups`, `sheetSize`, `helpers`, `warn`, `logger`, `addText`, `addLine`, `addRect`) pass through unchanged.

`drawDivY` remains computed in `dxfGenerator.js` and is passed to the orchestrator as `statementFallbackY` — used *only* by the statement-fallback corner (see Fallback corners below). It is no longer used to clamp the schedule's drawing zone, and the line that drew it is removed.

## Fallback corners

When `findBlockPosition` returns `null`, the orchestrator falls back to a deterministic per-block corner. Convention chosen so two failures don't stack: each block has a distinct "home corner".

| Block | Home corner | Top-left anchor formula |
|---|---|---|
| OFD | bottom-left | `x = cntL + mm(3); y = cntB + mm(5) + height` |
| Schedule | (no orchestrator fallback — schedule has its own Pass 3 skip-polygon + `scheduleOverflow` warn) | n/a |
| Beacon descriptions | bottom-left, stacked above OFD | `x = cntL + mm(3); y = cntB + mm(5) + ofdHeight + mm(3) + height` (read `ofdHeight` from `placedBlocks`) |
| Statement | top-left of bottom half | `x = cntL + mm(3); y = statementFallbackY` (the old `drawDivY`; height grows downward) |
| SG box | bottom-right | `x = cntR - mm(3) - width; y = cntB + mm(5) + height` |

`statementFallbackY` is the old `drawDivY` value (still computed in `dxfGenerator.js` though no longer drawn), passed into the orchestrator strictly as the statement-fallback anchor.

The fallback corners deliberately reproduce the *pre-3-v4 fixed positions* on overflow — surveyors used to the old layout still recognize the fallback arrangement.

Warn payload shape (matches existing `scheduleOverflow`):

```js
warn('ofdOverflow', {
  blockName: 'outsideFigureData',
  blockSize: { width, height },
  contentArea: { width: cntR - cntL, height: cntT - cntB },
  obstacles: placedBlocks.length,
  hint: 'OFD table fell back to bottom-left corner; may overlap parcel figure.',
})
```

Categories: `ofdOverflow`, `beaconOverflow`, `statementOverflow`, `sgOverflow`. (`scheduleOverflow` already exists and is unchanged.)

## Sizing function specifications

### `sizeStatement(metadata, fonts)`

```
lines = []
if (metadata.date)     → lines.push({text: `Surveyed in ${metadata.date} by me`, height: fonts.hBody, gap: fonts.rH * 1.5})
if (metadata.surveyor) → lines.push({text: metadata.surveyor, height: fonts.hSub, gap: fonts.rH})
                       → lines.push({text: '(Land Surveyor, Zim)', height: fonts.hBody, gap: fonts.rH * 1.5})

if lines.length === 0 → return {width: 0, height: 0}

height = sum of (line.height for each line) + sum of (line.gap for all but last)
width  = max(line.text.length * fonts.hBody * 0.55 for each line)   // 0.55 = DXF charWidthRatio settled in 3-v3
```

### `sizeOFDTable(outsideFigureData, fonts, mm)`

The `mm` function (paper-millimetres → ground-metres at the current scale) is passed in explicitly — same `helpers.mm` the schedule emitter receives. All width/height outputs are in ground-metres.

```
edgesCount = outsideFigureData?.edges?.length || 0
if edgesCount === 0 → return {width: 0, height: 0}

widthMM = sum(OUTSIDE_FIGURE_DATA.columns[i].width) * PT_TO_MM_GEN   // 345 pt → ~121.7 mm
width   = mm(widthMM)
height  = fonts.ofTitleH                  // title row "OUTSIDE FIGURE DATA"
        + fonts.ofRowH * 0.9              // "System: Lo XX" subtitle
        + fonts.ofRowH * 0.7              // gap
        + fonts.ofRowH                    // column header row
        + fonts.ofRowH * edgesCount       // data rows
        + mm(2)                           // bottom padding for own divider lines
```

`fonts.ofTitleH` / `fonts.ofBodyH` / `fonts.ofRowH` are pre-converted into ground-metres by the caller (via `pt()`), so they slot in without further conversion.

### `sizeSGBox(mm)`

```
width  = mm(SURVEYOR_GENERAL_BOX.width  * PT_TO_MM_GEN)   // 200 pt → ~70.6 mm in ground-metres
height = mm(SURVEYOR_GENERAL_BOX.height * PT_TO_MM_GEN)   // 80 pt  → ~28.2 mm in ground-metres
```

Constant per scale (depends only on `mm`).

### `sizeBeaconDescriptions(beaconGroups, fonts)`

```
if !beaconGroups || beaconGroups.length === 0 → return {width: 0, height: 0}

lineCount = 1                              // "BEACON DESCRIPTIONS" title
          + beaconGroups.length            // 1 row per group name
          + sum(group.beacons.length)      // 1 row per beacon

width  = min(contentArea.width * 0.85, mm(180))
height = lineCount * fonts.rH * 1.2
```

The 0.85 / 180 mm cap is for topology — keep the bounding box narrow enough to fit between other blocks. The existing `addBeaconDescription` adapter handles word-wrapping inside whatever width it's given.

## Emit function specifications

Each emit function reproduces the exact output of the corresponding code section in current `dxfGenerator.js`, parameterized by `position`:

- `emitStatement(addText, position, metadata, fonts)` mirrors lines 1692–1703, treating `position.x` as the old `statementL` and `position.y` as the old `cY`.
- `emitOFDTable(addText, addLine, position, outsideFigureData, fonts, centralMeridian)` mirrors lines 1715–1773. Column anchors are computed inside the emitter using `OUTSIDE_FIGURE_DATA.columns`, `PT_TO_MM_GEN`, and the `mm` factor in `helpers`.
- `emitSGBox(addText, addLine, addRect, position, fonts)` mirrors lines 1779–1801. `position` is the top-left; `sgBoxTopY = position.y`, `sgBoxBotY = position.y - height`, `sgBoxL = position.x`, `sgBoxR = position.x + width`.
- `emitBeaconDescriptions(addText, position, size, beaconGroups, fonts)` adapts to the existing `addBeaconDescription(layer, leftX, rightX, topY, bottomY, beaconGroups)` by computing `leftX = position.x`, `rightX = position.x + size.width`, `topY = position.y`, `bottomY = position.y - size.height`.

## Testing

### New file: `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`

~16 unit tests across three describe blocks.

**Sizing functions:**
- `sizeStatement` returns `{0,0}` when neither `metadata.date` nor `metadata.surveyor` set.
- `sizeStatement` includes only the date row when `metadata.surveyor` absent.
- `sizeStatement` width tracks the longest of the three candidate lines.
- `sizeOFDTable` returns `{0,0}` when `edges` array empty.
- `sizeOFDTable` height scales linearly with `edges.length`.
- `sizeOFDTable` width sums `OUTSIDE_FIGURE_DATA.columns[i].width * PT_TO_MM_GEN`.
- `sizeSGBox` returns `SURVEYOR_GENERAL_BOX` dims scaled by `PT_TO_MM_GEN`.
- `sizeBeaconDescriptions` returns `{0,0}` when `beaconGroups` empty.
- `sizeBeaconDescriptions` height grows linearly with total beacon count across all groups.

**Emit functions:**
- Each emitter records the expected sequence of `addText`/`addLine`/`addRect` calls at the given `position`.
- Each emitter is a no-op (records nothing) when its sizer would return `{0,0}`.

**Orchestrator:**
- Places blocks in PDF order: OFD → schedule → beacon → statement → SG.
- Pre-seeded `obstacles` excluded from candidate positions (no block lands inside the title zone bbox).
- Failed OFD placement triggers `ofdOverflow` warn and falls back to bottom-left corner.
- Failed SG placement triggers `sgOverflow` warn and falls back to bottom-right corner.
- Returned `placedBlocks` contains all successfully placed blocks (count + names).

### Modified: `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`

Two new tests:

- `seedPlacedBlocks` parameter excludes candidate positions overlapping the seed.
- Default (no `seedPlacedBlocks`) behaves identically to pre-3-v4 emitter (regression).

### Modified: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

Four new tests, ~1 existing test removed.

- DXF output contains no vertical line at `x = cntL + contentW * 0.58` going from `drawDivY` to `cntB` (regression for the user's stray-line complaint).
- DXF emits all five bottom-zone blocks for a typical plan (assert presence of statement text, OFD title text, SG "Approved" text, beacon-description header, and at least one schedule sub-table).
- DXF SG box position differs between plans with/without OFD edges (proves topology placement, not a fixed coordinate).
- Schedule `placedTables` can include a sub-table below `drawDivY` when the title zone is tall and the figure polygon occupies the upper drawing region.

One existing test removed: any assertion that pins SG box to a `statementR`-derived position. (We'll grep for it during implementation; expected removal is `should place SG box at right-of-statement column` or similar.)

Expected total post-3-v4: **318 tests** (300 baseline + 16 + 2 + 4 − 1).

## Risk register

- **Title-zone bbox too tall** → no block fits in the upper half. Mitigation: title zone bbox uses `titleDivY` (the existing 20% boundary), not the actual tallest title text. The bbox is generous on plans with short titles but never under-sized.
- **Beacon descriptions narrower than the longest unwrapped line** → text overflows the cap. Mitigation: `addBeaconDescription` already word-wraps; the cap of 180 mm comfortably exceeds the longest survey-statement-line measurement seen in the existing fixtures.
- **OFD + beacon both overflow → fallback stacking collision.** Mitigation: beacon fallback reads OFD's placed bbox from `placedBlocks` and stacks above it. If OFD itself overflowed, both end up at bottom-left but beacon's `y` adds OFD's height + spacing, so they tile rather than overlap.
- **Schedule emitter with `drawingZone = contentArea` may place sub-tables in the *upper* half if the figure polygon dominates the lower half.** This is desired behaviour — the schedule is no longer artificially clamped — but visually changes layouts on plans where surveyors expect schedule at bottom. Mitigation: matches PDF (which has always placed schedules wherever they fit). Test the user's regression fixtures and accept the new layout.
- **`emitScheduleOfAreasTopological` signature change** breaks any caller passing it positionally. Mitigation: it's a single named-args call site (`dxfGenerator.js:1658`), and the new param has a default. No external callers.

## File-by-file change summary

| File | Status | Net effect |
|---|---|---|
| `app-backend/src/services/dxfBottomZoneEmitter.js` | NEW | +~350 lines |
| `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js` | NEW | +~250 lines (16 tests) |
| `app-backend/src/services/dxfScheduleEmitter.js` | MOD | +3 / −0 (seedPlacedBlocks param + concatenation) |
| `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js` | MOD | +2 tests |
| `app-backend/src/services/dxfGenerator.js` | MOD | −~120 (C2 + C3 + partition vars + stray line) / +~30 (orchestrator call + obstacle bboxes) |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | MOD | +4 / −1 tests |

Total: +~350 LOC code, +~250 LOC tests, −~120 LOC in dxfGenerator (net ≈ +480 source LOC including tests).

## Definition of done

- All 318 expected tests passing (`cd app-backend && npm test -- --testPathPatterns="dxf"`).
- Regenerated DXF on the user's "stray line" reproduction has no vertical line at the pre-3-v4 partition x-coord.
- Regenerated DXF on a dense-stand plan shows the schedule extending below `drawDivY` when whitespace there is available.
- `git log --oneline main..feature/dxf-bottom-zone-topology` lists one commit per task (matching the per-task-commit pattern from 4a/4b/4c/4d, 3-v2, 3-v3, #6).
- Merged to main locally via `superpowers:finishing-a-development-branch`.
- `MEMORY.md` and `surveypro-pdfkit-rebaseline-status.md` updated to mark 3-v4 shipped and #5 (multi-sheet tiling) as next.

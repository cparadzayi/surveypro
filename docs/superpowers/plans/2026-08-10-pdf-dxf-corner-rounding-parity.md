# PDF/DXF Corner-Rounding Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PDF's coordinate-tick corner bounds use the same scale-aware `chooseTickIntervalMetres` interval DXF already uses, instead of PDF's legacy fixed 5m/10m/50m rounding — so both formats compute identical corner coordinates for the same plan.

**Architecture:** Port DXF's `addCornerCrosses` unified-interval design into PDF's two near-duplicate tick-bound functions (`calculateTickMarkBounds`, `renderOutsideFigureTickMarks` in `pdfkitGeoPDF.js`), replacing their legacy dual grid-snap system with a single `chooseTickIntervalMetres(scaleDenominator)`-driven computation. No changes to DXF (already correct) or to tick-spacing logic (`computeGridTickPositions`, `chooseTickIntervalMetres` themselves) — only how the corner bounds fed into them are computed.

**Revision note (added after Task 1 shipped):** the original test upgrade (assert real coordinate-value parity, not just count) surfaced a *second*, separate, pre-existing PDF/DXF divergence that Task 1 was never scoped to fix — an inward "clamp to drawing area" stage that PDF only applies to the Southing (top/bottom) axis, while DXF's `addCornerCrosses` applies it to all four sides. Scope extended (confirmed with user) to add the missing Westing (left/right) clamp to PDF as Task 2.

**Revision note 2 (added after Task 2 shipped):** with Task 2 in place, the test upgrade still failed — a *third*, separate divergence: PDF's Southing (top/bottom) clamp uses one flat margin for all sides, while DXF's uses a direction-aware margin (smaller for bare-arm sides, larger for the side a label extends toward). Scope extended again (confirmed with user) to port DXF's direction-aware margin model into PDF as Task 3, pushing the original test-upgrade task to Task 4.

**Revision note 3 (final — Task 3 attempted, then reverted):** Task 3 was implemented exactly as designed, then found empirically ineffective — the real gap for the test fixture is ~73pt (a `mapBounds`/content-area sizing difference between PDF and DXF), an order of magnitude larger than any margin value Task 3's formula could produce (15-70pt). This is a materially different, broader question than tick-corner-clamp margins. **Decision (confirmed with user): stop here.** Task 3's code is reverted (not committed). Tasks 1 and 2 — both genuine, verified, task-reviewed fixes — are the shipped deliverable. Task 4 (renamed back to its original scope, now the final task) is rewritten to characterize the actual, honest current state rather than assert unreachable full parity. See the spec's "Revision note 3" for the full trace.

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`), pdfkit. No new dependencies.

## Global Constraints

- Do not modify `dxfGenerator.js` or `addCornerCrosses` — already correct, the reference implementation both Task 1 and Task 2 port from.
- Do not modify `computeGridTickPositions` or `chooseTickIntervalMetres` in `app-shared/block-definitions.js` — only their call sites' inputs change.
- Both `calculateTickMarkBounds` and `renderOutsideFigureTickMarks` must receive identical changes in every task — they must stay in sync with each other (one computes reserved bounds for collision/placement, the other draws the actual ticks).
- Do not deduplicate the two functions into one shared implementation — out of scope per the spec's rejected-alternatives section; keep them as two near-duplicate functions, both updated identically in every task.
- Task 2's new left/right clamp must not add a title-block-style secondary obstruction check — DXF's `addCornerCrosses` only checks against a single drawing-area rectangle for all four sides; matching that keeps the addition scoped to what the reference implementation actually does.

---

## Task 1: Replace PDF's legacy corner-snap with the scale-aware interval in both tick-bound functions

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` — `calculateTickMarkBounds` (~line 1555-1694) and `renderOutsideFigureTickMarks` (~line 1791-1994)
- Test: `app-backend/src/services/__tests__/tickMarkParity.test.js` (upgraded in Task 4, after Tasks 1, 2, and 3's fixes are all verified working)

**Interfaces:**
- Consumes: `chooseTickIntervalMetres(scaleDenominator)` (already imported in `pdfkitGeoPDF.js` from `app-shared/block-definitions.js`, already called later in both functions today — this task only moves the call earlier and removes the later duplicate).
- Produces: no new exports, no signature changes to either function. Both functions' returned tick-bound/tick-mark data now uses corner values computed via `chooseTickIntervalMetres` instead of the legacy 5m/10m/50m rule — this is the behavior change Task 4's tests verify (alongside Task 2 and Task 3's clamp fixes).

Read the two functions first (`calculateTickMarkBounds` starts at line 1555, `renderOutsideFigureTickMarks` at line 1791 in the current `main`) to confirm exact line numbers haven't drifted before editing — match by the content shown below, not raw line numbers, if they have.

### Change 1a: `calculateTickMarkBounds`

**Before** (locate via this exact block, currently ~line 1591-1606):

```js
  // Find grid coordinates (multiples of 50) - but keep actual polygon extent for tick placement
  const GRID_INTERVAL = 50;
  const gridY_min = Math.floor(minY / GRID_INTERVAL) * GRID_INTERVAL;
  const gridY_max = Math.ceil(maxY / GRID_INTERVAL) * GRID_INTERVAL;
  const gridX_min = Math.floor(minX / GRID_INTERVAL) * GRID_INTERVAL;
  const gridX_max = Math.ceil(maxX / GRID_INTERVAL) * GRID_INTERVAL;

  // Round Y (Westing) values to nearest multiple of 5 or 10 for clean cartographic labels
  // Use multiples of 10 when the range is large (>200m), multiples of 5 otherwise
  const _yRange = maxY - minY;
  const _ySnap  = _yRange > 200 ? 10 : 5;
  const actualY_min = Math.floor(minY / _ySnap) * _ySnap; // Round down to nearest snap
  const actualY_max = Math.ceil(maxY  / _ySnap) * _ySnap; // Round up to nearest snap
  // X (Southing) values: round to nearest multiple of 50 for clean cartographic labels
  const actualX_min = Math.floor(minX / GRID_INTERVAL) * GRID_INTERVAL; // Round down to nearest 50
  const actualX_max = Math.ceil(maxX  / GRID_INTERVAL) * GRID_INTERVAL; // Round up to nearest 50
```

**After:**

```js
  // Corner bounds snap to the same scale-aware interval used for tick
  // spacing (chooseTickIntervalMetres) — matches DXF's addCornerCrosses
  // exactly, so both formats compute the same corner coordinates for the
  // same plan. Previously this used a separate legacy 5m/10m/50m rule
  // (predating this interval system) while only using the interval for
  // spacing between ticks, not the bounds themselves — see
  // docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const actualY_min = Math.floor(minY / _tickIntervalM) * _tickIntervalM;
  const actualY_max = Math.ceil(maxY  / _tickIntervalM) * _tickIntervalM;
  const actualX_min = Math.floor(minX / _tickIntervalM) * _tickIntervalM;
  const actualX_max = Math.ceil(maxX  / _tickIntervalM) * _tickIntervalM;
```

Then, in the rest of `calculateTickMarkBounds` (the map-edge/title-block
probe-and-clamp logic, currently ~line 1608-1684), replace every use of the
now-deleted `gridY_min`/`gridY_max`/`gridX_min`/`gridX_max` with
`actualY_min`/`actualY_max`/`actualX_min`/`actualX_max` respectively, and
every use of the now-deleted `GRID_INTERVAL` constant with `_tickIntervalM`.
The exact block to change (shown here as one before/after — this is a pure
rename plus constant substitution, no other logic changes):

**Before:**

```js
  const TICK_LENGTH = 12; // Match renderOutsideFigureTickMarks()
  const MAP_EDGE_MARGIN = 30;
  const TITLE_BLOCK_CLEARANCE = 80;

  // Adjust top X for map bounds - use actual polygon extent
  let topX = actualX_min;
  let bottomX = actualX_max;

  const topPdfPoint = transformCoords(gridY_min, gridX_min, extent, mapBounds);
  if (topPdfPoint.y < mapBounds.y + MAP_EDGE_MARGIN) {
    let adjustedX = gridX_min;
    let adjustedPdfPoint = topPdfPoint;
    while (
      adjustedPdfPoint.y < mapBounds.y + MAP_EDGE_MARGIN &&
      adjustedX < gridX_max
    ) {
      adjustedX += GRID_INTERVAL;
      adjustedPdfPoint = transformCoords(
        gridY_min,
        adjustedX,
        extent,
        mapBounds
      );
    }
    topX = adjustedX;
  }

  // Adjust for title block
  if (titleBlockBounds) {
    const adjustedTopPdfPoint = transformCoords(
      gridY_min,
      topX,
      extent,
      mapBounds
    );
    if (
      adjustedTopPdfPoint.y <
      titleBlockBounds.y + titleBlockBounds.height + TITLE_BLOCK_CLEARANCE
    ) {
      let adjustedX = topX;
      let testPdfPoint = adjustedTopPdfPoint;
      while (
        testPdfPoint.y <
          titleBlockBounds.y +
            titleBlockBounds.height +
            TITLE_BLOCK_CLEARANCE &&
        adjustedX < gridX_max
      ) {
        adjustedX += GRID_INTERVAL;
        testPdfPoint = transformCoords(gridY_min, adjustedX, extent, mapBounds);
      }
      if (adjustedX < gridX_max) topX = adjustedX;
    }
  }

  // Adjust bottom X for map bounds
  const bottomPdfPoint = transformCoords(
    gridY_min,
    gridX_max,
    extent,
    mapBounds
  );
  if (bottomPdfPoint.y > mapBounds.y + mapBounds.height - MAP_EDGE_MARGIN) {
    const adjustedX = gridX_max - GRID_INTERVAL;
    const adjustedPdfPoint = transformCoords(
      gridY_min,
      adjustedX,
      extent,
      mapBounds
    );
    if (
      adjustedPdfPoint.y <=
      mapBounds.y + mapBounds.height - MAP_EDGE_MARGIN
    ) {
      bottomX = adjustedX;
    }
  }

  // Generate tick points along all 4 edges at a scale-safe interval (30cm
  // ruler compliance) instead of just the 4 corners.
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const _tickPoints = computeGridTickPositions({
    aMin: actualY_min, aMax: actualY_max, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
```

**After:**

```js
  const TICK_LENGTH = 12; // Match renderOutsideFigureTickMarks()
  const MAP_EDGE_MARGIN = 30;
  const TITLE_BLOCK_CLEARANCE = 80;

  // Adjust top X for map bounds - use actual polygon extent
  let topX = actualX_min;
  let bottomX = actualX_max;

  const topPdfPoint = transformCoords(actualY_min, actualX_min, extent, mapBounds);
  if (topPdfPoint.y < mapBounds.y + MAP_EDGE_MARGIN) {
    let adjustedX = actualX_min;
    let adjustedPdfPoint = topPdfPoint;
    while (
      adjustedPdfPoint.y < mapBounds.y + MAP_EDGE_MARGIN &&
      adjustedX < actualX_max
    ) {
      adjustedX += _tickIntervalM;
      adjustedPdfPoint = transformCoords(
        actualY_min,
        adjustedX,
        extent,
        mapBounds
      );
    }
    topX = adjustedX;
  }

  // Adjust for title block
  if (titleBlockBounds) {
    const adjustedTopPdfPoint = transformCoords(
      actualY_min,
      topX,
      extent,
      mapBounds
    );
    if (
      adjustedTopPdfPoint.y <
      titleBlockBounds.y + titleBlockBounds.height + TITLE_BLOCK_CLEARANCE
    ) {
      let adjustedX = topX;
      let testPdfPoint = adjustedTopPdfPoint;
      while (
        testPdfPoint.y <
          titleBlockBounds.y +
            titleBlockBounds.height +
            TITLE_BLOCK_CLEARANCE &&
        adjustedX < actualX_max
      ) {
        adjustedX += _tickIntervalM;
        testPdfPoint = transformCoords(actualY_min, adjustedX, extent, mapBounds);
      }
      if (adjustedX < actualX_max) topX = adjustedX;
    }
  }

  // Adjust bottom X for map bounds
  const bottomPdfPoint = transformCoords(
    actualY_min,
    actualX_max,
    extent,
    mapBounds
  );
  if (bottomPdfPoint.y > mapBounds.y + mapBounds.height - MAP_EDGE_MARGIN) {
    const adjustedX = actualX_max - _tickIntervalM;
    const adjustedPdfPoint = transformCoords(
      actualY_min,
      adjustedX,
      extent,
      mapBounds
    );
    if (
      adjustedPdfPoint.y <=
      mapBounds.y + mapBounds.height - MAP_EDGE_MARGIN
    ) {
      bottomX = adjustedX;
    }
  }

  // Generate tick points along all 4 edges at a scale-safe interval (30cm
  // ruler compliance) instead of just the 4 corners.
  const _tickPoints = computeGridTickPositions({
    aMin: actualY_min, aMax: actualY_max, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
```

(Note: the later `const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);` line is deleted — it's now the hoisted constant from Change 1a's first block.)

- [ ] **Step 1: Apply Change 1a to `calculateTickMarkBounds`**

Apply both before/after blocks above to `calculateTickMarkBounds`.

- [ ] **Step 2: Apply the identical change to `renderOutsideFigureTickMarks`**

`renderOutsideFigureTickMarks` (~line 1791) has the same code with
`logger.info(...)` calls interleaved (which stay unchanged) and slightly
different comments (e.g. "Left (smaller Y = more West)" instead of no
comment). Apply the same transformation: replace the
`GRID_INTERVAL`/`_yRange`/`_ySnap`-based corner computation with the hoisted
`_tickIntervalM`-based one (Change 1a's first before/after block, same
content), then replace every remaining `gridY_min`/`gridY_max`/`gridX_min`/`gridX_max`/`GRID_INTERVAL`
reference in the rest of the function with
`actualY_min`/`actualY_max`/`actualX_min`/`actualX_max`/`_tickIntervalM`
(Change 1a's second before/after block, same substitution pattern — the
logger calls in between are untouched, only the grid/actual variable names
and the `GRID_INTERVAL` constant change).

Additionally, update this log line (~line 1861-1863 currently):

```js
  logger.info(
    `[PDFKit] 📐 Grid tick coordinates (50m intervals): Y=[${gridY_min}, ${gridY_max}], X=[${gridX_min}, ${gridX_max}]`
  );
```

to:

```js
  logger.info(
    `[PDFKit] 📐 Grid tick coordinates (${_tickIntervalM}m intervals): Y=[${actualY_min}, ${actualY_max}], X=[${actualX_min}, ${actualX_max}]`
  );
```

Delete the later duplicate `const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);` in this function too (same as Change 1a).

- [ ] **Step 3: Verify the file still parses and existing tick tests pass**

Run: `cd app-backend && node --check src/services/pdfkitGeoPDF.js && echo SYNTAX_OK`

Expected: `SYNTAX_OK`.

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks`

Expected: PASS, all existing tests green — these tests check tick *count*/*spacing* behavior, which this change does not alter, only which corner values ticks are anchored to. If anything here fails, STOP and investigate before continuing — it means the rename/substitution wasn't purely mechanical somewhere.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js
git commit -m "fix(pdf): use scale-aware tick interval for corner bounds, matching DXF"
```

---

## Task 2: Port DXF's four-sided clamp — add the missing Westing (left/right) clamp to PDF

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` — `calculateTickMarkBounds` and `renderOutsideFigureTickMarks` (same two functions as Task 1)

**Interfaces:**
- Consumes: `transformCoords(y, x, extent, mapBounds)` (already imported in this file, from `pdfkitGeoPDF/geometry.js`), `MAP_EDGE_MARGIN` (already declared as a local const in both functions), `_tickIntervalM`, `actualY_min`/`actualY_max`/`actualX_min` (all produced by Task 1's change, already in scope).
- Produces: no new exports. The `computeGridTickPositions` call's `aMin`/`aMax` arguments change from `actualY_min`/`actualY_max` to the new `rightY`/`leftY` variables this task introduces.

- [ ] **Step 1: Write the failing test**

Add a temporary, narrowly-scoped test to `app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js` (read it first to match its existing style) that will be superseded by Task 4's broader parity test but proves this specific fix in isolation first:

```js
  test('left/right tick corners clamp inward when they would overflow the map edge (Westing axis)', async () => {
    // sharedPlan-style fixture from tickMarkParity.test.js: a figure whose
    // Y (Westing) extent, once snapped to the tick interval, would place a
    // corner tick's label past the left or right map edge. Reuse the same
    // Y0/X0/W/H shape (import or inline it — match whichever this file's
    // existing tests already do for their own fixtures).
    const { pdfBuffer } = await generateGeoPDF(sharedPlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const yLabels = (decodedText.match(/Y = [+-][\d ]+/g) || []).map(s => s.trim())
    // Before this task's fix, PDF's Y bounds were always the raw
    // actualY_min/actualY_max (97300/97800 for this fixture) — never
    // clamped. After the fix, if the left or right edge would overflow,
    // the corresponding bound steps inward by _tickIntervalM. This
    // fixture's DXF corner-cross output (already correct, unaffected by
    // this task) shows Y clamping to 97400-97700 — assert PDF now matches.
    expect(yLabels).toEqual(expect.arrayContaining(['Y = +97 400', 'Y = +97 700']))
    expect(yLabels).not.toEqual(expect.arrayContaining(['Y = +97 300']))
    expect(yLabels).not.toEqual(expect.arrayContaining(['Y = +97 800']))
  })
```

If `pdfkitGeoPDF.tickMarks.test.js` doesn't already import `generateGeoPDF`,
`extractPdfText`-equivalent helpers, or a `sharedPlan`-style fixture, either
import them from `tickMarkParity.test.js` (if exported) or inline the exact
`sharedPlan` object from `tickMarkParity.test.js` (`Y0 = 97360, X0 =
2247150, W = 370, H = 250` and its derived `parcels`/`beacons`/
`outsideFigure`/`outsideFigureData`/`sheetSize: 'ISO_A2'`/`scale: { value:
500, label: '1:500' }` — copy verbatim, it's a self-contained plan object
at the top of that file).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks -t "left/right tick corners"`

Expected: FAIL — `yLabels` still contains `'Y = +97 300'` and `'Y = +97 800'` (the un-clamped raw bounds), and does not yet contain the clamped `97400`/`97700` values, because PDF has no Westing clamp logic yet.

- [ ] **Step 3: Implement the fix**

In both `calculateTickMarkBounds` and `renderOutsideFigureTickMarks`,
insert this new block immediately after the existing Southing
(`topX`/`bottomX`) clamp logic (i.e., after the "Adjust bottom X for map
bounds" block) and before the `computeGridTickPositions` call:

```js

  // Adjust Y (Westing) bounds for map left/right edges — mirrors the X-axis
  // (Southing) clamp above, and ports DXF addCornerCrosses's four-sided
  // clamp: PDF previously had no horizontal-edge clamp at all. Larger Y
  // maps toward the LEFT page edge, smaller Y toward the RIGHT (verified
  // empirically against transformCoords — see
  // docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md).
  let leftY = actualY_max;
  let rightY = actualY_min;

  const leftPdfPoint = transformCoords(actualY_max, actualX_min, extent, mapBounds);
  if (leftPdfPoint.x < mapBounds.x + MAP_EDGE_MARGIN) {
    let adjustedY = actualY_max;
    let adjustedPdfPoint = leftPdfPoint;
    while (
      adjustedPdfPoint.x < mapBounds.x + MAP_EDGE_MARGIN &&
      adjustedY > actualY_min
    ) {
      adjustedY -= _tickIntervalM;
      adjustedPdfPoint = transformCoords(adjustedY, actualX_min, extent, mapBounds);
    }
    leftY = adjustedY;
  }

  const rightPdfPoint = transformCoords(actualY_min, actualX_min, extent, mapBounds);
  if (rightPdfPoint.x > mapBounds.x + mapBounds.width - MAP_EDGE_MARGIN) {
    let adjustedY = actualY_min;
    let adjustedPdfPoint = rightPdfPoint;
    while (
      adjustedPdfPoint.x > mapBounds.x + mapBounds.width - MAP_EDGE_MARGIN &&
      adjustedY < actualY_max
    ) {
      adjustedY += _tickIntervalM;
      adjustedPdfPoint = transformCoords(adjustedY, actualX_min, extent, mapBounds);
    }
    rightY = adjustedY;
  }
```

Then change the `computeGridTickPositions` call in both functions from:

```js
  const _tickPoints = computeGridTickPositions({
    aMin: actualY_min, aMax: actualY_max, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
```

to:

```js
  const _tickPoints = computeGridTickPositions({
    aMin: rightY, aMax: leftY, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks`

Expected: PASS — all tests in the file green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js
git commit -m "fix(pdf): add missing Westing left/right tick clamp, matching DXF's four-sided clamp"
```

---

## Task 3: Replace PDF's flat edge margin with direction-aware footprint margins, matching DXF — ATTEMPTED, REVERTED, NOT SHIPPED

**This task was implemented exactly as written below, then reverted — see
"Revision note 3" at the top of this document.** The implementation was
correct per its own design, but empirically failed to close the gap it
targeted: for the test fixture, the actual overshoot (~73pt) is far larger
than any margin value this task's formula could produce (15-70pt), because
the real gap is a `mapBounds`/content-area sizing difference between PDF
and DXF, not a margin-calibration difference. The steps below are left
intact for reference (do not execute them — this task is not part of the
shipped branch).

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` — `calculateTickMarkBounds` and `renderOutsideFigureTickMarks` (same two functions as Tasks 1 and 2)

**Interfaces:**
- Consumes: `TICK_LENGTH`, `LABEL_OFFSET`, `LABEL_CLEARANCE` (all already declared constants in both functions — `calculateTickMarkBounds` needs `LABEL_OFFSET`/`LABEL_CLEARANCE` hoisted earlier in this task, see Step 3), `transformCoords`, `mapBounds`.
- Produces: no new exports. The four edge-clamp checks (top/bottom from Task 1, left/right from Task 2) now compare against direction-aware margins instead of the flat `MAP_EDGE_MARGIN`.

- [ ] **Step 1: Write the failing test**

Add this test to `app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js` (read it first — Task 2 already added one test here using a `sharedPlan`-style fixture; reuse the same fixture pattern):

```js
  test('Southing (top/bottom) edge margins are direction-aware, matching DXF addCornerCrosses (not a flat margin)', async () => {
    // sharedPlan-style fixture (Y0=97360, X0=2247150, W=370, H=250, ISO_A2,
    // scale 1:500 — same shape Task 2's test uses). Before this task, PDF's
    // flat 30pt MAP_EDGE_MARGIN clamps away the X=2247100 tick row that
    // DXF's smaller bare-arm padMin keeps (confirmed empirically — see
    // docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md).
    // After this task, PDF's bare-arm margin (bottom/left) should be small
    // enough to keep that row too.
    const { pdfBuffer } = await generateGeoPDF(sharedPlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const xLabels = (decodedText.match(/X = [+-][\d ]+/g) || []).map(s => s.trim())
    expect(xLabels).toEqual(expect.arrayContaining(['X = +2 247 100']))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks -t "Southing.*direction-aware"`

Expected: FAIL — `xLabels` does not contain `'X = +2 247 100'` (PDF's current flat margin clamps that row away).

- [ ] **Step 3: Implement the fix**

In `calculateTickMarkBounds`, hoist `LABEL_OFFSET` and `LABEL_CLEARANCE` up
next to the existing `TICK_LENGTH`/`MAP_EDGE_MARGIN`/`TITLE_BLOCK_CLEARANCE`
declarations (currently ~line 1604-1606):

**Before:**

```js
  const TICK_LENGTH = 12; // Match renderOutsideFigureTickMarks()
  const MAP_EDGE_MARGIN = 30;
  const TITLE_BLOCK_CLEARANCE = 80;
```

**After:**

```js
  const TICK_LENGTH = 12; // Match renderOutsideFigureTickMarks()
  const MAP_EDGE_MARGIN = 30; // Retained for reference; no longer used by the 4 edge clamps below (see direction-aware margins)
  const TITLE_BLOCK_CLEARANCE = 80;
  const LABEL_OFFSET = 4; // Hoisted from the tickMarks.forEach block below — MUST match renderOutsideFigureTickMarks()
  const LABEL_CLEARANCE = 3; // Hoisted from the tickMarks.forEach block below — MUST match renderOutsideFigureTickMarks()
```

Then, further down in the same function, remove the now-redundant later
declarations of `LABEL_OFFSET` and `LABEL_CLEARANCE` inside the
`tickMarks.forEach` block (leave `FONT_SIZE` there unchanged — it's only
used for the bounds-box height, not this task's margin formula):

**Before** (inside `tickMarks.forEach`, ~line 1742-1744):

```js
    const FONT_SIZE = 7; // Tick mark coordinate labels — MUST match renderOutsideFigureTickMarks()
    const LABEL_OFFSET = 4; // Tight coupling - MUST match renderOutsideFigureTickMarks()
    const LABEL_CLEARANCE = 3; // Clearance between label and tick arm
```

**After:**

```js
    const FONT_SIZE = 7; // Tick mark coordinate labels — MUST match renderOutsideFigureTickMarks()
```

`renderOutsideFigureTickMarks` already declares `TICK_LENGTH`/`LABEL_OFFSET`/
`LABEL_CLEARANCE`/`FONT_SIZE` together near its top (~line 1866-1872) — no
hoisting needed there.

In **both** functions, immediately before the existing Southing
(`topX`/`bottomX`) clamp block (i.e., right after the `TICK_LENGTH`/
`MAP_EDGE_MARGIN`/`TITLE_BLOCK_CLEARANCE`/`LABEL_OFFSET`/`LABEL_CLEARANCE`
declarations — or, in `renderOutsideFigureTickMarks`, right after its
existing constant block), insert:

```js

  // Footprint-aware margins for the 4 edge clamps below — ports DXF
  // addCornerCrosses's per-direction padTop/padR/padMin
  // (dxfGenerator.js:922-936). PDF's Y-label always renders above the tick,
  // X-label always to the right (confirmed against this function's own
  // label-bounds code) — the same fixed-direction assumption DXF's formula
  // is built on. Previously all 4 sides used one flat MAP_EDGE_MARGIN; DXF
  // (and now PDF) uses a smaller "bare arm" margin for the two sides with
  // no label (bottom, left) and a larger "label" margin for the two sides
  // a label extends toward (top, right). Label width is estimated from the
  // actual candidate coordinate at each check, not a fixed placeholder.
  const _formatCoordForMargin = (value) => {
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString("en-US").replace(/,/g, " ");
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };
  const _CHAR_WIDTH = 4.5;
  const BARE_ARM_MARGIN = TICK_LENGTH + LABEL_CLEARANCE;
  const yLabelMargin = (yValue) =>
    TICK_LENGTH + LABEL_OFFSET + LABEL_CLEARANCE +
    `Y = ${_formatCoordForMargin(yValue)}`.length * _CHAR_WIDTH;
  const xLabelMargin = (xValue) =>
    TICK_LENGTH + LABEL_OFFSET + LABEL_CLEARANCE +
    `X = ${_formatCoordForMargin(xValue)}`.length * _CHAR_WIDTH;
```

Then substitute `MAP_EDGE_MARGIN` in the four existing edge checks (both
functions) as follows. **Top clamp** — replace every
`mapBounds.y + MAP_EDGE_MARGIN` with `mapBounds.y + yLabelMargin(actualY_min)`
(both occurrences: the initial `if` check and the `while` loop condition).
**Bottom clamp** — replace `mapBounds.y + mapBounds.height - MAP_EDGE_MARGIN`
with `mapBounds.y + mapBounds.height - BARE_ARM_MARGIN` (both occurrences).
**Left clamp** (Task 2's addition) — replace `mapBounds.x + MAP_EDGE_MARGIN`
with `mapBounds.x + BARE_ARM_MARGIN` (both occurrences: the `if` check and
the `while` loop condition). **Right clamp** (Task 2's addition) — replace
`mapBounds.x + mapBounds.width - MAP_EDGE_MARGIN` with
`mapBounds.x + mapBounds.width - Math.max(xLabelMargin(actualX_min), xLabelMargin(actualX_max))`
(both occurrences).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks`

Expected: PASS — all tests in the file green, including the new one and
Task 2's. If the new test still fails, read the actual `xLabels` array
(temporarily log it if needed) to see the real margin/clamp decision being
made — this would mean the margin formula's arithmetic doesn't match what
was estimated in the design; do not adjust the test's expected value to
force a pass without understanding why.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js
git commit -m "fix(pdf): use direction-aware footprint margins for edge clamps, matching DXF"
```

---

## Task 4: Correct the parity test to characterize the actual shipped state, full suite — AS EXECUTED (Task 3 reverted, scope stopped at Tasks 1+2)

This task's scope changed from its original design (assert full
coordinate-value parity) once Task 3 was reverted — full parity is not
reachable without fixing the separate `mapBounds`/content-area sizing gap,
which is out of scope (see "Revision note 3"). What follows documents what
was actually done, for the record — not a template to re-execute.

**Files:**
- Modified: `app-backend/src/services/__tests__/tickMarkParity.test.js`

**What changed and why:** the pre-existing count-only test
(`expect(pdfYLabels.length).toBe(dxfYLabels.length)`) was found to
**already be failing** with Tasks 1+2 in place (10 PDF vs 12 DXF), even
though it passed at the pre-Task-1 baseline. This was not a regression to
fix — it was the old test's premise being coincidental: before Tasks 1+2,
PDF's snap interval was wrong AND PDF had no Westing clamp at all; DXF's
logic was also hitting the mapBounds gap independently; the two wrongs
happened to produce equal counts for this one fixture's geometry. Tasks
1+2 make PDF's logic correct on its own terms, which is exactly why the
old coincidental count match stopped holding — the real, separate,
now-understood gap surfaced instead of staying hidden.

The test was rewritten (not restored to count-only, not pushed to full
value-parity) to assert the actual, verified, honest state:

```js
  test('PDF now uses the same scale-aware interval and clamps all 4 edges like DXF — a separate, deeper mapBounds-sizing gap remains for this fixture', async () => {
    const { pdfBuffer } = await generateGeoPDF(sharedPlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const pdfYLabels = decodedText.match(/Y = [+-][\d ]+/g) || []

    const { buffer: dxfBuffer } = generateDXF(sharedPlan, fakeLogger)
    const dxf = dxfBuffer.toString()
    const dxfLabels = []
    const parts = dxf.split(/^\s*0\s*\r?\n/m)
    for (const e of parts) {
      if (!/^\s*TEXT/.test(e)) continue
      if (!/^\s*8\r?\n\s*GRID\b/m.test(e)) continue
      const t = (e.match(/^\s*1\r?\n\s*([^\r\n]+)/m) || [])[1]
      if (t) dxfLabels.push(t.trim())
    }
    const dxfYLabels = dxfLabels.filter(t => /^Y = [+-][\d ]+$/.test(t))

    // Two real, distinct PDF/DXF gaps were found and fixed in this area
    // (see docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md):
    //   1. PDF's corner-snap interval was a legacy fixed 5m/10m/50m rule;
    //      unified with DXF's scale-aware chooseTickIntervalMetres
    //      (Task 1, commit 2685ea9).
    //   2. PDF had no left/right (Westing) edge clamp at all, unlike DXF's
    //      four-sided clamp; added (Task 2, commit 835c178).
    // A THIRD, deeper divergence was found and deliberately NOT fixed here
    // (out of scope, tracked separately): for this fixture, PDF's
    // mapBounds (the drawing rectangle) reserves less room for the same
    // figure than DXF's content area does — the snapped tick corner lands
    // outside mapBounds by ~73pt even at a ZERO clamp margin, so no
    // margin-constant tuning (attempted, then abandoned as ineffective)
    // can close it; it needs its own investigation into PDF/DXF
    // mapBounds/content-area sizing parity, a materially different,
    // broader question than tick-corner rounding.
    //
    // As a direct, measured consequence, PDF now emits 10 Y-labels vs
    // DXF's 12 for this fixture. Before Tasks 1+2, this count happened to
    // be EQUAL (both 12) — but that was coincidence, not agreement: the
    // old PDF logic (wrong snap interval, no Westing clamp at all) and
    // DXF's logic were each wrong in ways that happened to cancel out for
    // this specific geometry. Tasks 1+2 make PDF's logic correct on its
    // own terms, which is why this exact number changed — not a
    // regression, a more honest count that surfaces the real, separate,
    // now-documented gap instead of masking it.
    expect(pdfYLabels.length).toBe(10)
    expect(dxfYLabels.length).toBe(12)
  })
```

Verified passing: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js tickMarkParity pdfkitGeoPDF.tickMarks` — 3/3 (this test plus Task 2's Westing-clamp test plus the pre-existing 4-corner test).

Committed as `093f867` — `test: document the residual PDF/DXF mapBounds-sizing gap after Tasks 1+2`.

Full backend suite run and (if needed) snapshot regeneration, plus visual verification, follow the same pattern established in prior phases of this session — run once, read any snapshot diff before regenerating, visually confirm the rendered PDF looks sane. No redundant second full-suite run after any snapshot regen.

---

## Self-Review Notes

- **Spec coverage:** Design Part 1 (interval-snap unification) is applied identically to both functions in Task 1 — implemented and task-reviewed with zero findings. Design Part 2 (Westing left/right clamp) is applied identically to both functions in Task 2 — implemented and task-reviewed with zero findings. Design Part 3 (direction-aware footprint margins, Task 3) was implemented correctly per its own design but found empirically insufficient for the actual gap (a `mapBounds` sizing difference, not a margin-calibration one) — reverted, not shipped, documented in the spec's "Revision note 3" and "Out of scope" for a future, separate investigation. Task 4 closes out the branch by correcting the parity test to characterize what's actually true post-Tasks-1+2, rather than asserting something unreachable.
- **No placeholders:** every step has literal, complete code or exact before/after text.
- **Type/name consistency:** `_tickIntervalM`, `actualY_min`/`actualY_max`/`actualX_min`/`actualX_max` (Task 1) and `leftY`/`rightY` (Task 2) are used identically across both functions in each shipped task; no renamed variables between tasks. Task 3's variable names (`BARE_ARM_MARGIN`, `yLabelMargin`, `xLabelMargin`) are preserved in the reverted Task 3 section for reference only — they do not appear in the shipped code.

# PDF/DXF Corner-Rounding Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PDF's coordinate-tick corner bounds use the same scale-aware `chooseTickIntervalMetres` interval DXF already uses, instead of PDF's legacy fixed 5m/10m/50m rounding — so both formats compute identical corner coordinates for the same plan.

**Architecture:** Port DXF's `addCornerCrosses` unified-interval design into PDF's two near-duplicate tick-bound functions (`calculateTickMarkBounds`, `renderOutsideFigureTickMarks` in `pdfkitGeoPDF.js`), replacing their legacy dual grid-snap system with a single `chooseTickIntervalMetres(scaleDenominator)`-driven computation. No changes to DXF (already correct) or to tick-spacing logic (`computeGridTickPositions`, `chooseTickIntervalMetres` themselves) — only how the corner bounds fed into them are computed.

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`), pdfkit. No new dependencies.

## Global Constraints

- Do not modify `dxfGenerator.js` or `addCornerCrosses` — already correct, the reference implementation this port matches.
- Do not modify `computeGridTickPositions` or `chooseTickIntervalMetres` in `app-shared/block-definitions.js` — only their call sites' inputs change.
- Both `calculateTickMarkBounds` and `renderOutsideFigureTickMarks` must receive the identical change — they must stay in sync with each other (one computes reserved bounds for collision/placement, the other draws the actual ticks; today they already use the same legacy formula and must continue to match after this fix).
- Do not deduplicate the two functions into one shared implementation — out of scope per the spec's rejected-alternatives section; keep them as two near-duplicate functions, both updated identically.

---

## Task 1: Replace PDF's legacy corner-snap with the scale-aware interval in both tick-bound functions

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` — `calculateTickMarkBounds` (~line 1555-1694) and `renderOutsideFigureTickMarks` (~line 1791-1994)
- Test: `app-backend/src/services/__tests__/tickMarkParity.test.js` (upgraded in Task 2, after this task's fix is verified working)

**Interfaces:**
- Consumes: `chooseTickIntervalMetres(scaleDenominator)` (already imported in `pdfkitGeoPDF.js` from `app-shared/block-definitions.js`, already called later in both functions today — this task only moves the call earlier and removes the later duplicate).
- Produces: no new exports, no signature changes to either function. Both functions' returned tick-bound/tick-mark data now uses corner values computed via `chooseTickIntervalMetres` instead of the legacy 5m/10m/50m rule — this is the behavior change Task 2's tests verify.

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

## Task 2: Upgrade the parity test to real coordinate-value parity, full suite, visual verification

**Files:**
- Modify: `app-backend/src/services/__tests__/tickMarkParity.test.js`

**Interfaces:**
- Consumes: `generateGeoPDF`, `generateDXF` (already imported in the test file), the fix from Task 1.
- Produces: nothing new — test-only changes plus verification.

- [ ] **Step 1: Upgrade the test to assert coordinate-value parity, not just count**

Read `app-backend/src/services/__tests__/tickMarkParity.test.js` in full
first (it's short, ~100 lines) to confirm its current exact content before
editing.

Replace the test body (currently the `test('both formats emit the same
number of Y= coordinate labels...')` block, lines ~67-99) with:

```js
  test('both formats emit identical Y= and X= coordinate tick values for the same plan', async () => {
    const { pdfBuffer } = await generateGeoPDF(sharedPlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const pdfYLabels = (decodedText.match(/Y = [+-][\d ]+/g) || []).map(s => s.trim()).sort()
    const pdfXLabels = (decodedText.match(/X = [+-][\d ]+/g) || []).map(s => s.trim()).sort()

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
    const dxfYLabels = dxfLabels.filter(t => /^Y = [+-][\d ]+$/.test(t)).sort()
    const dxfXLabels = dxfLabels.filter(t => /^X = [+-][\d ]+$/.test(t)).sort()

    // Both formats now snap tick-corner bounds to the same scale-aware
    // chooseTickIntervalMetres(scale) interval (pdfkitGeoPDF.js's
    // calculateTickMarkBounds/renderOutsideFigureTickMarks and
    // dxfGenerator.js's addCornerCrosses), so they compute identical
    // corner coordinates for the same plan — not just the same tick
    // count. See docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md
    expect(pdfYLabels).toEqual(dxfYLabels)
    expect(pdfXLabels).toEqual(dxfXLabels)
    expect(pdfYLabels.length).toBeGreaterThan(4)
  })
```

This removes the old count-only assertion and its explanatory comment
(both superseded), and adds `X =` label extraction to both the PDF and DXF
sides (previously only `Y =` was checked).

- [ ] **Step 2: Run the test and verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js tickMarkParity`

Expected: PASS. If `pdfYLabels`/`dxfYLabels` (or the X variants) differ,
read the actual arrays (temporarily log them if needed) to see which
specific values disagree — this would mean Task 1's port has a remaining
discrepancy from DXF's `addCornerCrosses`, not a pre-existing/unrelated
issue. Do not loosen the assertion to make it pass; find and fix the actual
mismatch.

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/__tests__/tickMarkParity.test.js
git commit -m "test: upgrade PDF/DXF tick-corner parity check to real coordinate values"
```

- [ ] **Step 4: Run the full backend test suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`

Expected: PASS, 0 failures. This must include `pdfkitGeoPDF.snapshot.test.js`
(part of the default full-suite run) since tick corner values are exactly
the kind of position change that snapshot captures. If it fails: read the
diff yourself (do not trust a "pre-existing/unrelated" claim without
checking) to confirm the change is limited to tick corner/label position
values consistent with the new interval-based snap, then regenerate with:

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.snapshot -u
```

Commit the updated snapshot separately if this happens:

```bash
git add app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
git commit -m "test(pdf): update snapshot for scale-aware tick corner bounds"
```

- [ ] **Step 5: Visual verification**

Write a one-off script (outside any tracked directory, or a
`scratch_verify/` folder inside `app-backend/` deleted before finishing)
that imports `sharedPlan` from `tickMarkParity.test.js` (or reconstructs an
equivalent small fixture), calls both `generateGeoPDF` and `generateDXF` on
it, writes the PDF to a file, and logs both formats' extracted `Y =`/`X =`
tick label sets. Confirm:
- The two label sets are now identical (matching Task 2's test assertion).
- The rendered PDF's corner tick labels look sane (no visually misplaced or
  overlapping ticks) — open/read the PDF, don't just trust the warnings
  object.

Delete the one-off script before finishing (no commit needed for this step
beyond Steps 3/4's commits).

---

## Self-Review Notes

- **Spec coverage:** The design's single core change (unify corner-snap onto `chooseTickIntervalMetres`) is applied identically to both functions in Task 1, exactly as the spec requires. The spec's edge cases (scale threading already correct, no new degenerate-value risk, internal PDF self-consistency preserved, DXF untouched) are all satisfied by construction — Task 1 doesn't touch DXF, and both PDF functions get the same substitution so they can't drift apart from each other. The spec's testing section (value-parity upgrade, full suite with snapshot, visual verification) is fully covered by Task 2.
- **No placeholders:** every step has literal, complete code or exact before/after text.
- **Type/name consistency:** `_tickIntervalM`, `actualY_min`/`actualY_max`/`actualX_min`/`actualX_max` are used identically across both functions in Task 1 and referenced consistently in Task 2's test comment; no renamed variables between tasks.

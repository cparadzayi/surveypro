# Split-Schedule Escalation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the PDF generator from blanket-suppressing paper-size escalation for split (multi-sub-table) Schedule of Areas layouts, so a schedule that genuinely still overlaps the figure after the fluid placement search gets a chance to try a larger sheet — closing "sub-project B", the last known-tracked gap from the relocation-pass-figure-accuracy work.

**Architecture:** One new conditional block in `calculateBlockPositions` (`app-backend/src/services/pdfkitGeoPDF.js`), added right after the existing fluid schedule search resolves its composite bounding box. It checks that composite against the figure polygon (same helper + buffer convention as the pre-existing single-table mandatory-block check) and promotes the already-existing `needsScaleUp` flag if it overlaps. No changes to the escalation-retry loop itself, no changes to the shared `drawScheduleOfAreasMultiTable` search function, no changes to DXF.

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`), pdfkit. No new dependencies.

## Global Constraints

- Do not modify `drawScheduleOfAreasMultiTable`'s search/fallback logic (the ~800-line function itself) — deliberately out of scope per the design's rejected Approach C.
- Do not modify DXF's schedule placement or its post-emission escalation (`dxfGenerator.js`) — already working independently.
- The new check must be gated on `_schedNeedsSplit` — it must never run (or affect) the single-table schedule path, which is already correctly handled by the pre-existing mandatory-block loop.
- The new check must guard on `_collisionPolyPts?.length > 0` and `!needsScaleUp` (matching the existing pattern at `pdfkitGeoPDF.js:7150-7153` exactly) — never throw when there's no figure polygon, never redundantly re-promote or double-log when `needsScaleUp` is already `true`.
- Use buffer `2` in the `rectangleOverlapsPolygon` call — matching the existing single-table mandatory-block check's convention (`pdfkitGeoPDF.js:7133`), not the buffer-0 convention used by the final `_pdfWarnIfOverlap` warning check.

---

## Task 1: Promote `needsScaleUp` when the split-schedule composite still overlaps the figure

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` (inside `calculateBlockPositions`, right after the block ending at line 7218, before the comment currently at line 7220)
- Test: `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`

**Interfaces:**
- Consumes: `_schedNeedsSplit` (already computed earlier in the same function, boolean), `_collisionPolyPts` (already computed as `mapFeatureBounds?.pdfPoints`, array of `{x,y}` or empty), `scheduleOfAreasFinal` (already computed by the existing fluid-search block — either the search's composite `{x,y,width,height,placedTables,standsPlaced,missingStands}` or the fallback `schedulePos`), `rectangleOverlapsPolygon(rect, polygon, buffer)` (already imported in this file), `needsScaleUp` (already declared `let` earlier in the same function, at the destructuring of `placeBlocks(...)`).
- Produces: no new exports. Mutates the existing `needsScaleUp` local variable, which is already returned from `calculateBlockPositions` (line 7239) and already consumed by the existing sheet-size-escalation retry loop (`pdfkitGeoPDF.js:12165+`) — that loop requires no changes.

Current code around lines 7182-7220 (for locating the insertion point — do not modify this block, only insert after it):

```js
  let scheduleOfAreasFinal = schedulePos;
  if (_schedNeedsSplit && parcels?.features?.length > 0 && schedulePos) {
    const _allForSched = {
      titleBlock:        titleBlockPos,
      outsideFigureData: outsideFigurePos,
      scheduleOfAreas:   schedulePos,
      beaconDescription: beaconPos,
      scaleBar:          scaleBarPos,
      surveyStatement:   surveyStatementPos,
      northArrow:        northArrowPos,
      sgSignature:       sgSignaturePos,
    };
    try {
      const _schedSearch = drawScheduleOfAreasMultiTable(
        null, parcels, schedulePos.x, schedulePos.y, mapBounds,
        _schedRowsPerCol, 10, logger, _allForSched, mapFeatureBounds,
        tickMarkBounds, scale?.value ?? 500, scheduleColumnWidthsPt,
        { searchOnly: true },
      );
      if (_schedSearch?.composite && Array.isArray(_schedSearch.placedTables) && _schedSearch.placedTables.length > 0) {
        scheduleOfAreasFinal = {
          x:      _schedSearch.composite.x,
          y:      _schedSearch.composite.y,
          width:  _schedSearch.composite.width,
          height: _schedSearch.composite.height,
          placedTables: _schedSearch.placedTables,
          standsPlaced:  _schedSearch.standsPlaced,
          missingStands: _schedSearch.missingStands,
        };
        logger.info(`[PDFKit] 📊 Planner-side schedule search: ${_schedSearch.placedTables.length} sub-tables at composite (${_schedSearch.composite.x.toFixed(0)}, ${_schedSearch.composite.y.toFixed(0)}) ${_schedSearch.composite.width.toFixed(0)}×${_schedSearch.composite.height.toFixed(0)} (${_schedSearch.standsPlaced}/${_schedSearch.standsPlaced + _schedSearch.missingStands} stands)`);
      } else {
        logger.warn('[PDFKit] 📊 Planner-side schedule search returned no placedTables — falling back to engine-placed schedulePos');
      }
    } catch (e) {
      logger.warn(`[PDFKit] 📊 Planner-side schedule search threw — keeping engine-placed schedulePos. err=${e?.message}`);
    }
  }

  // ── ① Schedule balancing is applied at DRAW time by each generator (via the
```

- [ ] **Step 1: Write the failing test**

Read `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js` first (it's short, shown in full below for reference) to match its exact style. Add a new `import` for the Maglas fixture and one new test into the existing `describe` block, immediately after the `sgSignature` test:

```js
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js'
```

(add alongside the existing `sampleRealisticPlan` import at the top of the file)

```js
  test('split schedule (Maglas, 240 stands) escalates to a larger sheet instead of rendering over the figure', async () => {
    // sampleMaglasPlan's schedule splits into multiple side-by-side sub-tables
    // (isScheduleWithFluidFallback in pdfkitGeoPDF.js). Before this fix, escalation
    // was blanket-suppressed for that path on the wrong assumption that the fluid
    // search always finds a clear slot — confirmed empirically it doesn't: the
    // composite landed on ISO_A1 with zero collision avoidance (both fallback
    // tiers failed). See docs/superpowers/specs/2026-08-10-split-schedule-escalation-gate-design.md
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const result = await generateGeoPDF(sampleMaglasPlan, logger)

    expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeUndefined()
  }, 120000)
```

Note the explicit `120000` (120s) Jest timeout as the third argument — this fixture is large (240 stands) and, unlike the other tests in this file, may now trigger a real sheet-size-escalation retry (a second full generation pass), so it needs more headroom than Jest's 5s default. Match the timeout style already used for the large-fixture tests in `sheetLayoutPlanner.parity.test.js` (e.g. its `dense Maglas` test uses `120000`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap -t "split schedule"`

Expected: FAIL — `result.warnings.scheduleOfAreasOverlapsPolygon` is defined (an object with `position` `{x:155.7, y:155.7, width:1295.6, height:1250}` and a `hint` string), not `undefined`, because `needsScaleUp` is never promoted for the split-schedule path today.

- [ ] **Step 3: Implement the fix**

Insert this new block into `pdfkitGeoPDF.js`, immediately after the closing `}` of the `if (_schedNeedsSplit && parcels?.features?.length > 0 && schedulePos) { ... }` block shown above (i.e., directly before the `// ── ① Schedule balancing is applied at DRAW time by each generator` comment):

```js

  // Escalate if the fluid multi-table search still leaves the schedule
  // composite overlapping the figure. isScheduleWithFluidFallback (above)
  // blanket-suppressed this on the assumption the fluid search always finds
  // a clear slot — it doesn't: drawScheduleOfAreasMultiTable's fallback
  // tiers (bounds-only / engine-startXY) can accept an overlapping anchor
  // when no polygon-clear slot exists. Mirrors the single-table
  // mandatory-block promotion above (same buffer=2 convention).
  if (_schedNeedsSplit && _collisionPolyPts?.length > 0 && scheduleOfAreasFinal) {
    const _schedRect = {
      x: scheduleOfAreasFinal.x,
      y: scheduleOfAreasFinal.y,
      width: scheduleOfAreasFinal.width,
      height: scheduleOfAreasFinal.height,
    };
    if (rectangleOverlapsPolygon(_schedRect, _collisionPolyPts, 2) && !needsScaleUp) {
      needsScaleUp = true;
      logger.warn(
        "[PDFKit] ⚠️  Split schedule composite overlaps polygon after fluid search — promoting needsScaleUp for paper-size escalation"
      );
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap`

Expected: PASS — all 5 tests in the file green, including the new one. While running, note the log line `escalating paper size to ISO_A0` (or similar) in stdout/stderr if visible — confirms the fix actually triggered a real escalation retry, not a coincidental pass. If the test times out at 120000ms, this is a signal to investigate (do not silently raise the timeout further — read the systematic-debugging skill's guidance and find out why before changing the number).

- [ ] **Step 5: Update the file's header comment**

The file's existing top-of-file comment (lines 5-14) says sampleRealisticPlan "doesn't trigger the separate, still-open paper-size-escalation gap for SPLIT schedules... which is a different, not-yet-fixed bug." That gap is now fixed by this task. Update the comment to reflect that — change the clause `"a different, not-yet-fixed bug"` to `"a different bug, fixed separately — see the 'split schedule (Maglas...)' test below"`. Keep the rest of the comment (about `sampleRealisticPlan`'s own scenario) unchanged.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js
git commit -m "fix(pdf): promote needsScaleUp when split-schedule composite still overlaps the figure"
```

---

## Task 2: Flip the pre-existing parity test, full suite, and visual verification

**Files:**
- Modify: `app-backend/src/services/__tests__/sheetLayoutPlanner.parity.test.js` (lines 113-148 — the comment block and final two assertions of the `dense Maglas` test)

**Interfaces:**
- Consumes: nothing new — this task verifies Task 1's fix end-to-end through the pre-existing PDF↔DXF parity test, and through the full backend suite.
- Produces: nothing new — test-only changes plus verification.

- [ ] **Step 1: Update the parity test's assertion and comment**

Read `app-backend/src/services/__tests__/sheetLayoutPlanner.parity.test.js` lines 87-149 first (the full `dense Maglas` test) to see the current state precisely, since Task 1 may have changed logging behavior that shows up in this test's `console.log` output.

Replace the comment block and final two lines (currently lines 113-148, shown below) —

```js
    // Previously this asserted dense Maglas PRODUCES overlap warnings — i.e. it
    // codified the schedule-over-figure overlap as expected behaviour. Then it
    // was changed to assert the overlap was fully resolved on BOTH sides. That
    // second version was also wrong, just less obviously: it was passing
    // vacuously, not because the overlap was actually resolved.
    //
    // - DXF: genuinely resolved, and unaffected by the PDF-side fix below.
    //   DXF derives its collision polygon from `outsideFigureData` (never
    //   from the PDF-only `outsideFigure`-absent extent-bbox fallback) and
    //   post-emission escalates a pinned sheet to A0 when its emitted
    //   sub-tables would overlap (mirrors the PDF's
    //   _polyCollisionOnMandatory → needsScaleUp promotion). dxfWarnKeys is
    //   empty for this fixture — verified directly.
    //
    // - PDF: NOT actually resolved for this dense/split-schedule case — this
    //   assertion's "resolved" claim was never true, it just looked true
    //   because PDF's collision detector had a bug (see the outsideFigure
    //   extent-bbox fallback fix in pdfkitGeoPDF.js): `outsideFigure` was
    //   never populated for fixtures like this one that lack it, so
    //   `hasPoly` was always false and the polygon-collision check never ran
    //   at all — this assertion was passing because nothing was ever
    //   checked, not because there was no overlap. Now that the fallback
    //   populates a real polygon, detection genuinely runs and finds a real,
    //   pre-existing overlap: Maglas's schedule splits into multiple
    //   sub-tables at render time (isScheduleWithFluidFallback), and that
    //   fluid multi-table placement path does not yet participate in the
    //   paper-size escalation gate the way the single-table path does. This
    //   is a known, separate, not-yet-fixed limitation — tracked as
    //   "sub-project B" (the paper-size-escalation gate for SPLIT
    //   schedules) — and NOT a regression introduced by the outsideFigure
    //   fallback fix. Asserting the key IS present (rather than silently
    //   loosening/removing the check) keeps this known gap visible in the
    //   suite until sub-project B lands; flip this back to `.not.toContain`
    //   once that work fixes the split-schedule escalation gate.
    expect(dxfWarnKeys).not.toContain('scheduleOfAreasOverlapsPolygon');
    expect(pdfWarnKeys).toContain('scheduleOfAreasOverlapsPolygon'); // KNOWN GAP — sub-project B, not yet fixed
  }, 120000);
```

with:

```js
    // Previously this test tracked a known, not-yet-fixed PDF-side gap
    // ("sub-project B"): dense Maglas's schedule splits into multiple
    // sub-tables (isScheduleWithFluidFallback), and that fluid multi-table
    // placement path didn't participate in paper-size escalation the way
    // the single-table path does — so PDF could render the schedule over
    // the figure with no chance to retry at a larger sheet. Fixed in
    // pdfkitGeoPDF.js's calculateBlockPositions: the fluid search's own
    // composite result is now checked against the figure polygon, and
    // needsScaleUp is promoted if it still overlaps (see
    // docs/superpowers/specs/2026-08-10-split-schedule-escalation-gate-design.md).
    // DXF was never affected — it already resolves this independently via
    // its own post-emission escalation (dxfGenerator.js).
    expect(dxfWarnKeys).not.toContain('scheduleOfAreasOverlapsPolygon');
    expect(pdfWarnKeys).not.toContain('scheduleOfAreasOverlapsPolygon');
  }, 120000);
```

Also update the test's name on line 87 — change
`'dense Maglas: DXF resolves the schedule-over-figure overlap; PDF has a known, tracked gap (sub-project B)'`
to
`'dense Maglas: both DXF and PDF resolve the schedule-over-figure overlap'`.

- [ ] **Step 2: Run this test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetLayoutPlanner.parity`

Expected: PASS — all 6 tests in the file green (this file's tests are individually slow; the full file previously took ~360s in this session's baseline runs — do not cancel early).

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/__tests__/sheetLayoutPlanner.parity.test.js
git commit -m "test(pdf): flip sub-project B known-gap assertion now that it's fixed"
```

- [ ] **Step 4: Run the full backend test suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`

Expected: PASS, 0 failures. This must include `pdfkitGeoPDF.snapshot.test.js` (part of the default full-suite run — no filter needed) since sheet-size changes on the Maglas fixture are very likely to shift rendered text positions in that fixture's snapshot. If `pdfkitGeoPDF.snapshot.test.js`'s Maglas snapshot fails: read the diff yourself (do not just trust a "pre-existing/unrelated" claim from any automated report) to confirm the change is limited to position/font-array-reorder artifacts consistent with a sheet-size change, then regenerate with:

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.snapshot -u
```

Commit the updated snapshot separately if this happens:

```bash
git add app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
git commit -m "test(pdf): update Maglas snapshot for split-schedule sheet-size escalation"
```

- [ ] **Step 5: Visual verification**

Write a one-off script (outside any tracked directory, e.g. this session's scratchpad, or a `scratch_verify/` folder inside `app-backend/` that gets deleted before the final commit) that calls `generateGeoPDF(sampleMaglasPlan, logger)`, writes `result.pdfBuffer` to a `.pdf` file, and logs `result.sheetSize`. Open/read the PDF and confirm:
- The Schedule of Areas no longer visually overlaps the parcel figure.
- `result.sheetSize` is `ISO_A0` (expected, since `ISO_A1` was empirically shown insufficient during the design phase) — if it's something else, note it, but don't treat a different-but-still-resolved sheet size as a failure on its own.
- No other block (title block, outside figure data, beacon description, scale bar, north arrow, survey statement, sgSignature, endorsements) has shifted into an unexpected or overlapping position as a side effect.

Delete the one-off script before finishing (no commit needed for this step beyond Steps 3/4's commits).

---

## Self-Review Notes

- **Spec coverage:** The design's single code change (Task 1) and its two edge-case guards (`_schedNeedsSplit`, `_collisionPolyPts?.length > 0`, `!needsScaleUp`) are all in the Task 1 diff verbatim. The design's testing section is covered: primary acceptance criterion (Task 2, flipping the parity test), direct regression test (Task 1), full suite including snapshots (Task 2), visual verification (Task 2). Out-of-scope items (DXF, `drawScheduleOfAreasMultiTable`'s fallback tiers) are not touched by either task.
- **No placeholders:** every step has literal, complete code or exact before/after text for the test-file edits.
- **Type/name consistency:** `_schedRect`, `scheduleOfAreasFinal`, `_collisionPolyPts`, `needsScaleUp` are used identically between the design doc and both tasks; no renamed variables between tasks.

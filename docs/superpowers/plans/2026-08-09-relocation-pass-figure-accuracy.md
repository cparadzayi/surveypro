# Relocation Pass: Accurate Figure Polygon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing post-placement relocation pass in `pdfkitGeoPDF.js` so `surveyStatement` and `sgSignature` are relocated clear of the *actual* drawn figure polygon (not just tick marks, and not just the approximate planner polygon), eliminating the residual `surveyStatementOverlapsPolygon` / `sgSignatureOverlapsPolygon` warnings wherever a clear slot genuinely exists.

**Architecture:** Widen the trigger condition of the existing relocation loop (`pdfkitGeoPDF.js:12253-12314`) from "overlaps a tick mark" to "overlaps a tick mark OR the accurate figure polygon (`mapFeatureBounds.pdfPoints`)", and switch the `findBlockPosition` search itself to validate against that same accurate polygon instead of the approximate, re-centered `_polyForPlanner`. No other part of the pipeline changes — `_polyForPlanner` and everything feeding `calculateBlockPositions`/`planSheetLayout` stay untouched, per the approved design (Approach C).

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`), pdfkit. No new dependencies.

## Global Constraints

- Do not modify `_polyForPlanner`, `buildPlannerObstacles`, `_buildPlannerTransform`, or anything feeding `calculateBlockPositions`/`planSheetLayout`'s own placement decisions (`polygonForPlanner.js` is out of scope entirely).
- `scheduleOfAreas` is never added to the relocatable list — it already has its own separate, working escalation-based handling.
- The relocation pass must degrade to today's tick-only behavior when no accurate figure polygon exists (`mapFeatureBounds?.pdfPoints` missing or `< 3` points) — never throw, never skip already-correct tick-avoidance behavior.
- `_pdfWarnIfOverlap` (the final warning check, `pdfkitGeoPDF.js:12403-12422`) is not modified — it already validates against the accurate polygon, so a correctly relocated block clears its warning as a natural consequence.
- This is a known, accepted limitation, not a defect to "fix around": on `sampleRealisticPlan` at its auto-escalated ISO_A1 size, `sgSignature` (200×110) has no clear slot anywhere in `mapBounds` — the one width-sized gap (below the title block, above the figure) is 119.8pt tall but only 105.8pt usable after the 8pt block-spacing and 6pt polygon buffer are applied (needs 110pt — short by 4.2pt), and the other viable band (below the figure) is fully claimed by `beaconDescription`. Do not reduce the buffer/spacing values to force this specific fixture to fit — that trades away the margin's purpose for one fixture's geometry. The test in Task 2 asserts this residual warning explicitly, by design.

---

## Task 1: Widen the relocation pass to trigger on and search against the accurate figure polygon

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:12253-12314` (the existing relocation block)
- Test: `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js` (add cases here — it already exercises `generateGeoPDF`'s public API against `sampleRealisticPlan` and checks `warnings`)

**Interfaces:**
- Consumes: `mapFeatureBounds.pdfPoints` (already computed earlier in `_generateGeoPDFInner`, array of `{x,y}` — the accurate, as-drawn figure polygon), `rectangleOverlapsPolygon(rect, polygon, buffer)` (already imported in this file from `./pdfkitGeoPDF/geometry.js`), `rectanglesOverlap(rectA, rectB, spacing)` (already imported), `findBlockPosition(...)` (already imported from `./dxfBlockPlacer.js`).
- Produces: no new exports. `blockPositions.surveyStatement` / `blockPositions.sgSignature` (and the other relocatable block entries) get their `.x`/`.y` mutated in place, same as today — downstream drawing code (`Step 5b`, right after this block) already reads `blockPositions` for rendering, unchanged.

The current code at `pdfkitGeoPDF.js:12260-12317`:

```js
  const _tickRects = finalTickMarkBounds.map((t) => ({
    x: t.x, y: t.y, width: t.width, height: t.height,
  }));
  if (_tickRects.length > 0) {
    const _asRect = (p) =>
      p && p.width > 0 && p.height > 0
        ? { x: p.x, y: p.y, width: p.width, height: p.height }
        : null;
    // Fixed blocks (do NOT relocate) seed the obstacle set so relocations avoid them.
    const _fixedObstacles = [
      blockPositions.titleBlock,
      blockPositions.scheduleOfAreas,
      blockPositions.endorsement,
    ].map(_asRect).filter(Boolean);
    const _occupied = [..._fixedObstacles, ..._tickRects];
    const _overlapsAnyTick = (r) => _tickRects.some((t) => rectanglesOverlap(r, t, 0));
    const _relocPoly = _polyForPlanner;
    // Widest-first (matches DXF task ordering) so the hardest-to-fit blocks claim
    // whitespace before the smaller ones do.
    const _relocatable = ['outsideFigureData', 'beaconDescription', 'surveyStatement', 'sgSignature', 'scaleBar', 'northArrow']
      .map((name) => ({ name, rect: _asRect(blockPositions[name]) }))
      .filter((t) => t.rect)
      .sort((a, b) => b.rect.width - a.rect.width);
    for (const t of _relocatable) {
      if (!_overlapsAnyTick(t.rect)) {
        _occupied.push(t.rect); // already clear — keep planner slot, seed as obstacle
        continue;
      }
      const found = findBlockPosition({
        block: { width: t.rect.width, height: t.rect.height },
        mapBounds,
        polygon: _relocPoly,
        placedBlocks: _occupied,
        buffer: 6,
        blockSpacing: 8,
        scanStep: 10,
        tableMinWidth: t.rect.width,
        logger,
      });
      if (found) {
        blockPositions[t.name].x = found.x;
        blockPositions[t.name].y = found.y;
        _occupied.push({ x: found.x, y: found.y, width: t.rect.width, height: t.rect.height });
        logger.info(
          `[PDFKit] 📐 Relocated ${t.name} clear of tick marks → (${found.x.toFixed(1)}, ${found.y.toFixed(1)})`
        );
      } else {
        _occupied.push(t.rect); // no clear slot — keep planner slot (tick renderer still deflects its labels)
        logger.warn(
          `[PDFKit] ⚠️ ${t.name} overlaps a tick mark but no clear slot was found — keeping planner slot`
        );
      }
    }
  }
```

Note: exact current line numbers/whitespace may drift slightly from other work landing on `main` first — match by content (the `_tickRects` declaration through the closing `}` of the `if` block), not by line number.

- [ ] **Step 1: Write the failing test**

Add to `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`. First, read the existing file to match its import style and existing `generateGeoPDF`/fixture/logger setup exactly (it already has a working call against `sampleRealisticPlan` — reuse that pattern rather than inventing a new one). Add this test into the existing `describe` block:

```js
  test('surveyStatement relocates clear of the accurate figure polygon, not just the approximate planner polygon', async () => {
    const result = await generateGeoPDF(sampleRealisticPlan, logger);

    expect(result.warnings.surveyStatementOverlapsPolygon).toBeUndefined();
  });

  test('scheduleOfAreas is unaffected by the relocation-pass change (separate escalation-based handling)', async () => {
    const result = await generateGeoPDF(sampleRealisticPlan, logger);

    expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeUndefined();
  });
```

(If the file's existing setup builds `logger`/imports differently — e.g. a `beforeEach` that constructs a fresh logger, or a different import path for `sampleRealisticPlan` — follow the file's existing pattern instead of the sketch above. The two assertions are what matter.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap -t "surveyStatement relocates clear"`

Expected: FAIL — `result.warnings.surveyStatementOverlapsPolygon` is defined (an object with `position`/`hint`), not `undefined`, because the current relocation pass only searches against `_polyForPlanner` (the approximate, re-centered polygon) and only triggers on tick overlap.

- [ ] **Step 3: Implement the fix**

Replace the block shown above (in `pdfkitGeoPDF.js`) with:

```js
  const _tickRects = finalTickMarkBounds.map((t) => ({
    x: t.x, y: t.y, width: t.width, height: t.height,
  }));
  const _accurateFigurePoly =
    mapFeatureBounds?.pdfPoints?.length >= 3 ? mapFeatureBounds.pdfPoints : null;
  if (_tickRects.length > 0 || _accurateFigurePoly) {
    const _asRect = (p) =>
      p && p.width > 0 && p.height > 0
        ? { x: p.x, y: p.y, width: p.width, height: p.height }
        : null;
    // Fixed blocks (do NOT relocate) seed the obstacle set so relocations avoid them.
    const _fixedObstacles = [
      blockPositions.titleBlock,
      blockPositions.scheduleOfAreas,
      blockPositions.endorsement,
    ].map(_asRect).filter(Boolean);
    const _occupied = [..._fixedObstacles, ..._tickRects];
    const _overlapsAnyTick = (r) => _tickRects.some((t) => rectanglesOverlap(r, t, 0));
    const _overlapsFigure = (r) =>
      _accurateFigurePoly ? rectangleOverlapsPolygon(r, _accurateFigurePoly, 0) : false;
    const _needsRelocation = (r) => _overlapsAnyTick(r) || _overlapsFigure(r);
    // Widest-first (matches DXF task ordering) so the hardest-to-fit blocks claim
    // whitespace before the smaller ones do.
    const _relocatable = ['outsideFigureData', 'beaconDescription', 'surveyStatement', 'sgSignature', 'scaleBar', 'northArrow']
      .map((name) => ({ name, rect: _asRect(blockPositions[name]) }))
      .filter((t) => t.rect)
      .sort((a, b) => b.rect.width - a.rect.width);
    for (const t of _relocatable) {
      if (!_needsRelocation(t.rect)) {
        _occupied.push(t.rect); // already clear — keep planner slot, seed as obstacle
        continue;
      }
      const found = findBlockPosition({
        block: { width: t.rect.width, height: t.rect.height },
        mapBounds,
        polygon: _accurateFigurePoly,
        placedBlocks: _occupied,
        buffer: 6,
        blockSpacing: 8,
        scanStep: 10,
        tableMinWidth: t.rect.width,
        logger,
      });
      if (found) {
        blockPositions[t.name].x = found.x;
        blockPositions[t.name].y = found.y;
        _occupied.push({ x: found.x, y: found.y, width: t.rect.width, height: t.rect.height });
        logger.info(
          `[PDFKit] 📐 Relocated ${t.name} clear of ticks/figure → (${found.x.toFixed(1)}, ${found.y.toFixed(1)})`
        );
      } else {
        _occupied.push(t.rect); // no clear slot — keep planner slot (tick renderer still deflects its labels)
        logger.warn(
          `[PDFKit] ⚠️ ${t.name} overlaps a tick mark or the figure but no clear slot was found — keeping planner slot`
        );
      }
    }
  }
```

Exact changes from the original: (1) new `_accurateFigurePoly` constant; (2) outer `if` gate widened to `_tickRects.length > 0 || _accurateFigurePoly`; (3) `_relocPoly` removed, replaced by `_overlapsFigure`/`_needsRelocation` helpers; (4) the loop's skip-check changed from `!_overlapsAnyTick(t.rect)` to `!_needsRelocation(t.rect)`; (5) `findBlockPosition`'s `polygon:` argument changed from `_relocPoly` to `_accurateFigurePoly`; (6) both log messages reworded from "tick marks"/"a tick mark" to "ticks/figure"/"a tick mark or the figure".

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap`

Expected: PASS — both new tests green (`surveyStatementOverlapsPolygon` and `scheduleOfAreasOverlapsPolygon` both `undefined`).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js
git commit -m "fix(pdf): relocate survey-statement/sg-signature against the accurate figure polygon"
```

---

## Task 2: Characterize the known sgSignature residual gap on the dense fixture

**Files:**
- Test: `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js` (same file as Task 1)

**Interfaces:**
- Consumes: same `generateGeoPDF`/`sampleRealisticPlan`/`logger` setup as Task 1's tests, already in this file.
- Produces: nothing new — this is a characterization test only, documenting the accepted limitation described in Global Constraints so a future regression (making it worse, or accidentally making it pass) is visible either way.

- [ ] **Step 1: Write the failing test**

Add to the same file, same `describe` block, immediately after Task 1's two tests:

```js
  test(
    'sgSignature has no clear slot on sampleRealisticPlan at its auto-escalated size — ' +
      'documented limitation: the only width-sized gap (below the title block, above the ' +
      'figure) is 119.8pt tall but only 105.8pt usable after clearances, 4.2pt short of the ' +
      '110pt block height; see docs/superpowers/specs/2026-08-09-relocation-pass-figure-accuracy-design.md',
    async () => {
      const result = await generateGeoPDF(sampleRealisticPlan, logger);

      expect(result.warnings.sgSignatureOverlapsPolygon).toBeDefined();
      expect(result.warnings.sgSignatureOverlapsPolygon.position).toEqual({
        x: expect.any(Number),
        y: expect.any(Number),
        width: 200,
        height: 110,
      });
    }
  );
```

This test is written to currently PASS once Task 1's fix is in place — it is not a red/green cycle for new production code, it's a regression guard for a known, accepted gap. Skip Step 2's "must fail" requirement for this specific test; instead, in Step 2 below, confirm it passes for the *expected reason* (the quantified shortfall), not by accident.

- [ ] **Step 2: Run test and confirm it passes for the expected reason**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap`

Expected: PASS. Additionally, re-run with a temporary console spy or inspect `logger` calls to confirm the warning log reads `sgSignature overlaps a tick mark or the figure but no clear slot was found — keeping planner slot` (proves the code path taken is "searched and genuinely found nothing," not "never searched"). This is a one-off manual check, not an assertion to add to the test — the test file should not depend on log message text.

- [ ] **Step 3: Run the full pdfkitGeoPDF/sheetLayoutPlanner suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF sheetLayoutPlanner`

Expected: PASS — no regressions in the broader PDF generation or sheet-layout-planning suites (this confirms the widened trigger condition doesn't cause `outsideFigureData`, `beaconDescription`, `scaleBar`, or `northArrow` to relocate unexpectedly on other fixtures, e.g. `sampleMaglasPlan`).

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js
git commit -m "test(pdf): characterize sgSignature's known no-slot gap on the dense fixture"
```

---

## Task 3: Full backend suite and visual verification

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`

Expected: PASS, 0 failures. (Full suite takes roughly 15-20 minutes — do not cancel early; if it appears to hang past ~25 minutes, investigate rather than assuming success.)

- [ ] **Step 2: Visual verification — regenerate sampleRealisticPlan and inspect the PDF**

Write a one-off script (not committed) that calls `generateGeoPDF(sampleRealisticPlan, logger)` and writes `result.pdfBuffer` to a `.pdf` file, then open it. Confirm:
- The "Approved / For Surveyor General" (`sgSignature`) box position is unchanged from before this fix started (still at its original engine-placed slot near the top-left, per the accepted limitation) — it should NOT visually overlap a stand's grid cell any worse than before, and should not have moved to a nonsensical position.
- The survey-date statement (`surveyStatement`) box no longer renders on top of any stand's grid cell — it should appear relocated, e.g. in the gap between the title block and the figure.
- No other block (schedule of areas, beacon description, scale bar, north arrow, outside-figure-data table) has shifted to an unexpected or overlapping position.

- [ ] **Step 3: Commit any cleanup**

If the one-off verification script was accidentally created inside a tracked directory, delete it before committing (it should live outside git-tracked paths, e.g. this session's scratchpad). No commit needed if nothing tracked changed in this task.

---

## Self-Review Notes

- **Spec coverage:** All 5 numbered design changes are covered by Task 1's single diff (the changes are small and interdependent — splitting them into separate tasks would leave the code in a broken intermediate state, so they're one task per the writing-plans "task right-sizing" guidance). The design's two edge cases ("no figure at all" — degrades to tick-only, verified by the `_accurateFigurePoly` null-check already present in `_overlapsFigure`; "no clear slot exists anywhere" — Task 2 characterizes this explicitly) and its "scheduleOfAreas untouched" constraint (Task 1's second test) are all covered.
- **No placeholders:** every step has literal, complete code.
- **Type/name consistency:** `_accurateFigurePoly`, `_needsRelocation`, `_overlapsFigure` names are used identically across the Task 1 diff; no later task references a different name for the same thing.

# Block-Placement Escalation Gate Polygon Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the escalation gate that decides whether `scheduleOfAreas`/`sgSignature` need a bigger sheet — it currently checks the idealized, re-centered polygon the placement engine uses for its own candidate search, not the real figure position, so it silently under-escalates on the smaller real SI 727 paper. Thread the already-computed accurate polygon into the gate specifically, and add DXF's missing `sgSignature` escalation checkpoint. Resolve the 7 tests this branch's predecessor deliberately left as documented characterization tests.

**Architecture:** `calculateBlockPositions` (`pdfkitGeoPDF.js`, shared by PDF and DXF via the `planSheetLayout` wrapper in `sheetLayoutPlanner.js`) gains a new `accurateFigurePolygon` parameter used only by the escalation-gate collision check — the engine's own placement search keeps using the existing idealized polygon unchanged, preserving PDF/DXF placement parity. Both generators already compute their own accurate figure polygon earlier in their pipelines; this plan just wires it through. DXF separately gains a second escalation checkpoint for `sgSignature`, mirroring its existing schedule-overlap checkpoint.

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`).

## Global Constraints

- The placement engine's own candidate-search polygon (`polyPts` parameter, `mapFeatureBounds.pdfPoints` as fed to search/scoring) must NOT change — it stays the idealized, re-centered, PDF/DXF-shared polygon from `buildPlannerObstacles()`. Only the escalation-*gate* collision check changes which polygon it compares against.
- `calculateBlockPositions` is called from exactly one place: `sheetLayoutPlanner.js:81` (confirmed — grepped every reference to `calculateBlockPositions` across `app-backend/src`; all others are comments).
- Backend tests run via `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails — ESM).
- Do not touch `MAX_SHEET_UP_ATTEMPTS` (2) / `MAX_SCALE_UP_ATTEMPTS` (1) or any retry-budget constant — this fix only corrects which polygon feeds an existing decision.
- The already-accepted Maglas 240-stand characterization test (`sheetLayoutPlanner.parity.test.js`'s "3-v7 Maglas parity" test and `pdfkitGeoPDF.scheduleNoOverlap.test.js`'s "split schedule (Maglas...)" test) must continue to show genuine exhaustion — do not touch either test.

---

### Task 1: PDF escalation gate — thread the accurate polygon

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Modify: `app-backend/src/services/sheetLayoutPlanner.js`
- Modify: `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`
- Modify: `app-backend/src/services/__tests__/pdfkitGeoPDF.townshipScaleMandate.test.js`

**Interfaces:**
- `calculateBlockPositions(...)` gains a 16th, final parameter: `accurateFigurePolygon = null`.
- `planSheetLayout(args)` gains a new optional key, `args.accurateFigurePolygon`, threaded straight through to `calculateBlockPositions`. No other exported signature changes.

> **Line-number note:** Steps 2-5 make several edits within `pdfkitGeoPDF.js`. None of them change that file's line count materially before the next cited line is reached (all are same-line-count substitutions or single-line insertions near each other), but as in prior tasks on this branch, locate each edit by matching its exact quoted code snippet, not by assuming the file is untouched since your last read.

- [ ] **Step 1: Write the failing evidence — run the two PDF characterization tests to confirm today's behavior**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap pdfkitGeoPDF.townshipScaleMandate`
Expected: PASS, all tests — including the two tests asserting `warnings.scheduleOfAreasOverlapsPolygon` / `result.warnings.scheduleOfAreasOverlapsPolygon` `toBeDefined()` (they currently pass because the bug is real and currently characterized, not because anything is broken in the test file). Note the exact passing test names; you'll flip these same two assertions to the opposite expectation once the fix is confirmed working, in Step 8.

- [ ] **Step 2: Add the `accurateFigurePolygon` parameter to `calculateBlockPositions`**

In `app-backend/src/services/pdfkitGeoPDF.js`, replace lines 6384-6400:

```js
export function calculateBlockPositions(
  doc,
  metadata,
  parcels,
  outsideFigureData,
  beacons,
  mapBounds,
  mapFeatureBounds,
  logger,
  scale,
  extent,
  tickMarkBounds = [],
  zOrderCollisionRegistry = null,
  figureBounds = null,
  polyPts = [],
  scheduleColumnWidthsPt = null,   // NEW
) {
```

with:

```js
export function calculateBlockPositions(
  doc,
  metadata,
  parcels,
  outsideFigureData,
  beacons,
  mapBounds,
  mapFeatureBounds,
  logger,
  scale,
  extent,
  tickMarkBounds = [],
  zOrderCollisionRegistry = null,
  figureBounds = null,
  polyPts = [],
  scheduleColumnWidthsPt = null,
  accurateFigurePolygon = null,   // NEW: real (non-re-centered) figure polygon,
                                   // used ONLY for the escalation-gate collision
                                   // checks below, never for placement search.
) {
```

Immediately after (still inside the function, before the scale-parameter
validation that follows), add:

```js
  // The escalation gate must check against the REAL figure position, not the
  // idealized/re-centered polygon buildPlannerObstacles() hands the engine's
  // own candidate search (mapFeatureBounds.pdfPoints / polyPts stay as-is for
  // that search — changing those would reintroduce PDF/DXF placement
  // divergence). Falls back to mapFeatureBounds.pdfPoints only if no caller
  // supplies the accurate polygon (should not happen after this change).
  // See docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md.
  const _gatePolyPts = (accurateFigurePolygon && accurateFigurePolygon.length >= 3)
    ? accurateFigurePolygon
    : mapFeatureBounds?.pdfPoints;
```

- [ ] **Step 3: Point the escalation gate at `_gatePolyPts`**

Find and replace, in `app-backend/src/services/pdfkitGeoPDF.js` (currently around line 7198, inside the same function):

```js
  const _collisionPolyPts = mapFeatureBounds?.pdfPoints;
```

with:

```js
  const _collisionPolyPts = _gatePolyPts;
```

This single change covers both the general mandatory-block loop (`_polyCollisionOnMandatory`, the code immediately following this line) and the split-schedule composite check further down in the same function (confirmed both read the same `_collisionPolyPts` binding — verified via `awk 'NR==7280,NR==7320'` showing `if (_schedNeedsSplit && _collisionPolyPts?.length > 0 ...)` and `rectangleOverlapsPolygon(_schedRect, _collisionPolyPts, 2)`, no re-derivation). No second edit needed for the split-schedule check.

- [ ] **Step 4: Thread the parameter through `planSheetLayout`**

In `app-backend/src/services/sheetLayoutPlanner.js`, replace lines 54-62:

```js
export function planSheetLayout(args) {
  const {
    metadata, parcels, outsideFigureData, beacons,
    mapBounds, mapFeatureBounds, logger, scale, extent,
    tickMarkBounds = [], figureBounds = null, polyPts = [],
    zOrderCollisionRegistry = null,
    measureText,
    scheduleColumnWidthsPt = null,   // NEW
  } = args;
```

with:

```js
export function planSheetLayout(args) {
  const {
    metadata, parcels, outsideFigureData, beacons,
    mapBounds, mapFeatureBounds, logger, scale, extent,
    tickMarkBounds = [], figureBounds = null, polyPts = [],
    zOrderCollisionRegistry = null,
    measureText,
    scheduleColumnWidthsPt = null,
    accurateFigurePolygon = null,   // NEW: real figure polygon for the
                                     // escalation gate only — see
                                     // docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md
  } = args;
```

Replace lines 81-87:

```js
  const blockPositions = calculateBlockPositions(
    doc, metadata, parcels, outsideFigureData, beacons,
    mapBounds, mapFeatureBounds, logger, scale, extent,
    tickMarkBounds, zOrderCollisionRegistry,
    figureBounds, polyPtsClosed,
    scheduleColumnWidthsPt,        // NEW 15th positional arg
  );
```

with:

```js
  const blockPositions = calculateBlockPositions(
    doc, metadata, parcels, outsideFigureData, beacons,
    mapBounds, mapFeatureBounds, logger, scale, extent,
    tickMarkBounds, zOrderCollisionRegistry,
    figureBounds, polyPtsClosed,
    scheduleColumnWidthsPt,
    accurateFigurePolygon,        // NEW 16th positional arg
  );
```

Also update the JSDoc parameter list above the function (lines 38-53) to
document `accurateFigurePolygon`, e.g. add after the existing `@param {Array}
[args.polyPts=[]]` line:

```js
 * @param {Array}   [args.accurateFigurePolygon=null] - real (non-re-centered)
 *                                       figure polygon in the same PDF-point
 *                                       frame as mapBounds; used only for the
 *                                       escalation-gate collision check, not
 *                                       for placement search.
```

- [ ] **Step 5: Pass the accurate polygon from PDF's call site**

In `app-backend/src/services/pdfkitGeoPDF.js` (currently around line 12220),
find the `planSheetLayout({...})` call and add one line. Locate it by this
anchor (the `polyPts: _polyForPlanner,` line already present):

```js
    polyPts: _polyForPlanner,
    measureText: pdfKitMeasureText,
    scheduleColumnWidthsPt: _scheduleColumnWidthsPt,
  });
```

Replace with:

```js
    polyPts: _polyForPlanner,
    accurateFigurePolygon: mapFeatureBounds.pdfPoints,   // NEW — the accurate
                                                          // outer variable
                                                          // (built ~12000-12027),
                                                          // NOT mapFeatureBoundsForPlanner.
    measureText: pdfKitMeasureText,
    scheduleColumnWidthsPt: _scheduleColumnWidthsPt,
  });
```

`mapFeatureBounds` here refers to the outer-scope variable built earlier in
`_generateGeoPDFInner` from `_topoPolyPts` — **not** `mapFeatureBoundsForPlanner`
(the re-centered one already being passed as the `mapFeatureBounds:` key one
line above `polyPts:` in this same call). Both variables are in scope at this
point; verify you're referencing the correct one by checking it has a
`.pdfPoints` array whose vertices come from `transformCoords`, not from
`buildPlannerObstacles`.

- [ ] **Step 6: Run the two PDF characterization tests again — expect them to now FAIL**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap pdfkitGeoPDF.townshipScaleMandate`

Expected: the two tests asserting `scheduleOfAreasOverlapsPolygon` is
`toBeDefined()` should now **FAIL**, because the fix means the overlap no
longer occurs — read the actual failure output to confirm it fails because
the value is now `undefined` (fix working) and not for some other reason
(e.g. a thrown error, which would mean something is broken). All other tests
in both files should still pass unchanged (Maglas exhaustion test, the
`surveyStatement`/`sgSignature` relocation tests, the `general-undeveloped`
scale-mandate test).

If either target test does NOT fail as expected (i.e. still asserts overlap
present), do not proceed to Step 7 — the fix isn't taking effect for that
fixture. Re-check Steps 2-5 were applied correctly (a common mistake would be
referencing `mapFeatureBoundsForPlanner` instead of the accurate
`mapFeatureBounds` at the Step 5 call site) before escalating as blocked.

- [ ] **Step 7: Flip the two confirmed-fixed tests back to asserting no overlap**

In `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`,
replace the file's top comment block (lines 6-23) — the "no longer collides"
framing from before the sheet-size branch was largely accurate again once
this fix lands — with:

```js
// sampleRealisticPlan has 12 stands (single-table schedule — doesn't trigger
// the separate SPLIT-schedule escalation gap, isScheduleWithFluidFallback in
// pdfkitGeoPDF.js, which is a different, much denser scenario handled by the
// 'split schedule (Maglas...)' test below (that fixture genuinely exhausts
// every escalation level — see its test for the full story)) and no
// `outsideFigure` field — the exact scenario that originally reproduced the
// reported overlap bug. Checking the returned `warnings` object (not raw log
// text) reflects only the final, actually-returned attempt: escalation
// resolves the overlap on the real (smaller) SI 727 paper via the accurate-
// polygon escalation gate fix (see
// docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md),
// so scheduleOfAreasOverlapsPolygon is correctly never set in the final
// result, even though an earlier, superseded attempt may warn transiently.
```

Replace the first test (lines 24-42):

```js
describe('Schedule of Areas placement no longer collides when outsideFigure is absent', () => {
  test(
    'schedule of areas still overlaps the figure on sampleRealisticPlan under the real (smaller) ' +
      'SI 727 paper sizes — documented, accepted limitation: the one-step escalation ' +
      '(SI727_500x400→SI727_800x500) that previously cleared this fixture no longer leaves ' +
      'enough whitespace, so scheduleOfAreasOverlapsPolygon is now defined in the final ' +
      'returned result; see ' +
      'docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md',
    async () => {
      // Intentionally brittle: this fixture's actual geometry (12 stands, single-table
      // schedule) genuinely no longer escalates clear of the figure on the smaller real
      // SI 727 sheets. If block-definitions.js or the fixture's stand count changes,
      // this test breaking is expected — verify the new numbers reflect genuine
      // non-clearance (not a regression in the escalation logic itself) before
      // updating the expectation.
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const { warnings } = await generateGeoPDF(sampleRealisticPlan, logger)
      expect(warnings?.scheduleOfAreasOverlapsPolygon).toBeDefined()
    }
  )
```

with:

```js
describe('Schedule of Areas placement no longer collides when outsideFigure is absent', () => {
  test('final returned result has no scheduleOfAreas/figure overlap warning', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const { warnings } = await generateGeoPDF(sampleRealisticPlan, logger)
    expect(warnings?.scheduleOfAreasOverlapsPolygon).toBeFalsy()
  })
```

Replace the third test in the file (lines 51-64):

```js
  test(
    'scheduleOfAreas still shows the same documented real-paper overlap limitation as the ' +
      'test above, independent of the relocation-pass change (separate escalation-based ' +
      'handling) — see docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md',
    async () => {
      // Same underlying, already-documented limitation as the first test in this file —
      // this assertion exists to confirm it's not specific to how that test invokes
      // generateGeoPDF, but a property of the escalation-based scheduleOfAreas path itself.
      const logger = { info: () => {}, warn: () => {}, error: () => {} }
      const result = await generateGeoPDF(sampleRealisticPlan, logger)

      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeDefined()
    }
  )
```

with:

```js
  test('scheduleOfAreas is unaffected by the relocation-pass change (separate escalation-based handling)', async () => {
    const logger = { info: () => {}, warn: () => {}, error: () => {} }
    const result = await generateGeoPDF(sampleRealisticPlan, logger)

    expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeUndefined()
  })
```

Leave the `surveyStatement`/`sgSignature` tests (lines 44-49, 66-80) and the
Maglas split-schedule test (lines 82-106) completely untouched.

In `app-backend/src/services/__tests__/pdfkitGeoPDF.townshipScaleMandate.test.js`,
replace the first test (lines 9-27):

```js
  test(
    'general-developed plan with majority >200m2 stands is no longer forced to 1:500 and needs no ' +
      'tiling, but the schedule of areas still overlaps the figure — documented, accepted ' +
      'limitation under the real (smaller) SI 727 paper sizes (same root cause as ' +
      'pdfkitGeoPDF.scheduleNoOverlap.test.js); see ' +
      'docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md',
    async () => {
      // Intentionally brittle: this fixture's actual geometry is this test's real
      // reproduction of the known limitation. If block-definitions.js or the fixture
      // changes, this test breaking is expected — verify the new behavior reflects
      // genuine non-clearance (not a regression in the escalation logic itself) before
      // updating the expectation.
      const result = await generateGeoPDF(sampleDevelopedLargeStandsPlan, logger)
      expect(result.scale).not.toBe('1:500')
      expect(result.tileGrid).toBeFalsy()
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeDefined()
    },
    30000
  )
```

with:

```js
  test(
    'general-developed plan with majority >200m2 stands is no longer forced to 1:500 and needs no tiling',
    async () => {
      const result = await generateGeoPDF(sampleDevelopedLargeStandsPlan, logger)
      expect(result.scale).not.toBe('1:500')
      expect(result.tileGrid).toBeFalsy()
      expect(result.warnings.scheduleOfAreasOverlapsPolygon).toBeFalsy()
    },
    30000
  )
```

- [ ] **Step 8: Run both files again to confirm GREEN**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap pdfkitGeoPDF.townshipScaleMandate`
Expected: PASS, all tests, including the two flipped assertions and the
unchanged Maglas/relocation tests.

- [ ] **Step 9: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/sheetLayoutPlanner.js app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js app-backend/src/services/__tests__/pdfkitGeoPDF.townshipScaleMandate.test.js
git commit -m "fix(pdf): escalation gate checks the accurate figure polygon, not the idealized planner one"
```

---

### Task 2: DXF — thread the accurate polygon and add the `sgSignature` escalation checkpoint

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

**Interfaces:**
- Consumes: `planSheetLayout`'s new `accurateFigurePolygon` parameter from Task 1 — no further changes to `sheetLayoutPlanner.js`/`calculateBlockPositions` needed in this task.
- No new exports; `generateDXF`'s public signature and return shape (`{ buffer, warnings }`) are unchanged.

- [ ] **Step 1: Write the failing evidence — run the four target assertions to confirm today's behavior**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.integration`
Expected: PASS, all tests, including the four assertions on `warnings.count`
(`toBe(1)` at two "clean sampleFixture" tests, `toBe(1)` at a third, `toBe(3)`
at the "one bad beacon + one bad parcel" test) that were bumped by the
sheet-size branch's Task 3 fix pass to account for `sgSignatureOverlapsPolygon`
now firing. Note these pass today because the underlying bug is real and
currently characterized in the comments above each assertion (grep for "Was
toBe(0)" / "Was toBe(2)" in this file to find all four).

- [ ] **Step 2: Pass the accurate polygon from DXF's call site**

In `app-backend/src/services/dxfGenerator.js` (currently around line 2015),
find the `planSheetLayout({...})` call and add one line. Locate it by this
anchor (the `polyPts: polyPtsForPlanner,` line already present):

```js
    polyPts:           polyPtsForPlanner,
    measureText:       plannerMeasure,
    logger,
    scheduleColumnWidthsPt,
  });
```

Replace with:

```js
    polyPts:           polyPtsForPlanner,
    accurateFigurePolygon: figurePolygon,   // NEW — already computed above
                                             // (~1887-1889) from the Outside
                                             // Figure ring; may be null, which
                                             // calculateBlockPositions handles
                                             // via its own fallback.
    measureText:       plannerMeasure,
    logger,
    scheduleColumnWidthsPt,
  });
```

`figurePolygon` must already be in scope at this call site (it's used later
in the same function by `_placeClear`, the `sgSignature`/bottom-zone
relocation logic) — if it isn't yet defined at this point in the file when
you check, that's a real ordering problem to report as blocked, not work
around by moving code.

- [ ] **Step 3: Add the second DXF escalation checkpoint for `sgSignature`**

In `app-backend/src/services/dxfGenerator.js`, find the six sequential
`_warnIfOverlap(...)` calls (`_warnIfOverlap('outsideFigureData');` through
`_warnIfOverlap('northArrow');`, currently around lines 2388-2393). Insert
this new block immediately after the last one (`_warnIfOverlap('northArrow');`)
and before whatever code follows:

```js

  // Second escalation checkpoint, mirroring the schedule one above
  // (~2251-2275) but for sgSignature. Its own placement (_placeClear)
  // already searches the real figure polygon and can correctly determine
  // there's no clear slot — that failure just wasn't wired into any
  // escalation retry until now. See
  // docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md.
  if (warnings.summary.sgSignatureOverlapsPolygon
      && _sheetSizeUpAttempt < MAX_SHEET_UP_ATTEMPTS) {
    const nextSheet = nextSheetUp(normalizedSheetSize);
    if (nextSheet) {
      logger.warn(
        `[DXF] sgSignature overlaps the figure on ${normalizedSheetSize} — ` +
        `escalating to ${nextSheet} (attempt ${_sheetSizeUpAttempt + 1}/${MAX_SHEET_UP_ATTEMPTS})`
      );
      return generateDXF({
        ...options,
        sheetSize: nextSheet,
        _sheetSizeUpAttempt: _sheetSizeUpAttempt + 1,
      }, logger);
    }
  }
```

`MAX_SHEET_UP_ATTEMPTS`, `nextSheetUp`, `normalizedSheetSize`,
`_sheetSizeUpAttempt`, and `options` are all already in scope in this
function (the existing schedule escalation checkpoint at ~2251-2275 uses the
identical set) — no new imports needed.

- [ ] **Step 4: Run the four target assertions again — expect them to now FAIL**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.integration`

Expected: the four `warnings.count` assertions should now **FAIL** (actual
value lower than the currently-expected bumped value), because
`sgSignatureOverlapsPolygon` should no longer fire on `sampleFixture` once it
successfully escalates. Read each failure to confirm the actual count
matches what a full revert to pre-bump values would need (0 instead of 1,
twice; 2 instead of 3, once — confirm the exact numbers from the real output
rather than assuming). Also check the **rest** of this test file's output
(not just these four) for any new, unanticipated failure — sheet-size
escalation on `sampleFixture` could in principle shift something else this
large file asserts on (e.g. tick/entity counts calibrated for a specific
sheet size). If anything beyond the four anticipated assertions fails,
diagnose it before proceeding — don't assume it's unrelated.

- [ ] **Step 5: Flip the four confirmed-fixed assertions back**

In `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`,
apply these four changes using the actual values confirmed in Step 4 (shown
here as the expected pre-bump values; verify against your real Step 4 output
before committing to these exact numbers):

Replace (around line 443-451):

```js
  test('clean fixture produces zero warnings', () => {
    // Was toBe(0) under the old ISO_A2 substitute paper (594x420mm). Under the
    // real (smaller) SI 727 500x400mm sheet, sgSignatureOverlapsPolygon now
    // fires for this fixture (same documented block-placement whitespace
    // limitation as pdfkitGeoPDF.scheduleNoOverlap.test.js — see
    // docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md),
    // bumping the count by 1. Same root cause as the other three
    // warnings.count assertions changed in this file.
    expect(warnings.count).toBe(1)
  })
```

with:

```js
  test('clean fixture produces zero warnings', () => {
    expect(warnings.count).toBe(0)
  })
```

Replace (around line 470-473):

```js
    // Was toBe(2) under the old ISO_A2 substitute paper — the +1 is the same
    // sgSignatureOverlapsPolygon limitation noted at line ~444 above, additive
    // to this test's own 2 intentional bad-input warnings.
    expect(warnings.count).toBe(3)
```

with:

```js
    expect(warnings.count).toBe(2)
```

Replace (around line 547-551):

```js
  test('clean sampleFixture still produces zero warnings after title-block changes', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    // Was toBe(0) — same sgSignatureOverlapsPolygon limitation noted at line
    // ~444 above (real SI 727 paper, not a title-block regression).
    expect(warnings.count).toBe(1)
  })
```

with:

```js
  test('clean sampleFixture still produces zero warnings after title-block changes', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    expect(warnings.count).toBe(0)
  })
```

Replace (around line 766-771):

```js
  test('clean sampleFixture still produces zero warnings + scheduleOverflow null', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    // Was toBe(0) — same sgSignatureOverlapsPolygon limitation noted at line
    // ~444 above (real SI 727 paper, not a schedule-columns regression).
    expect(warnings.count).toBe(1)
    expect(warnings.summary.scheduleOverflow).toBeNull()
  })
```

with:

```js
  test('clean sampleFixture still produces zero warnings + scheduleOverflow null', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    expect(warnings.count).toBe(0)
    expect(warnings.summary.scheduleOverflow).toBeNull()
  })
```

- [ ] **Step 6: Run the full file again to confirm GREEN**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.integration`
Expected: PASS, all tests in the file.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "fix(dxf): thread the accurate figure polygon into the escalation gate, add sgSignature escalation checkpoint"
```

---

### Task 3: Full regression sweep

**Files:** none expected (verification only; only touch files if Step 2 or 3 below finds a real, narrowly-scoped issue).

- [ ] **Step 1: Confirm the Maglas genuinely-too-dense case is unaffected**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap sheetLayoutPlanner.parity`
Expected: PASS, all tests, with the Maglas characterization tests in both
files still reporting the exact same sheet size (`SI727_1000x800`), attempts
(`2`), and `scheduleEscalationExhausted`/`scheduleOfAreasOverlapsPolygon`
values as before this plan — a more accurate escalation gate can only
escalate *more* readily than the idealized one, never less, so an
already-exhausted case cannot newly "un-exhaust," but confirm this holds
rather than assuming it (per this plan's Global Constraints).

- [ ] **Step 2: PDF/DXF parity spot-check**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetLayoutPlanner.parity`
Expected: PASS. This suite's "same algorithm produces same titleBlock +
endorsement position" and "determinism" tests already assert PDF and DXF
agree — confirm they still do now that both pass an accurate polygon into
the same shared gate. If this reveals a genuine PDF/DXF divergence (not
already covered by Task 1/2's own test runs), diagnose before touching
anything — this would mean the two formats' accurate polygons aren't
equivalent in the way this plan's design assumed, and needs a real decision,
not a guess.

- [ ] **Step 3: Full backend suite**

Run: `cd app-backend && npm test`
Expected: PASS, all suites, zero failures. If any suite outside
`pdfkitGeoPDF.scheduleNoOverlap`, `pdfkitGeoPDF.townshipScaleMandate`,
`dxfGenerator.integration`, or `sheetLayoutPlanner.parity` fails, diagnose
whether it's a legitimate consequence of a fixture now escalating correctly
(check: does the failure trace back to a sheet-size or scale value the fix
changed?) versus a genuine regression, before touching anything.

- [ ] **Step 4: Commit any follow-up fixes from Steps 2-3**

```bash
git add -A
git commit -m "test: fix any remaining fallout from the escalation gate polygon fix"
```

(Skip this step entirely if Steps 1-3 passed clean with no changes needed.)

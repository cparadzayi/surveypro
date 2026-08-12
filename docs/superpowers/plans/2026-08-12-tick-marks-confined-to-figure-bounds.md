# Confine Tick Marks to Figure Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop coordinate-grid tick marks from being reserved up to one full interval beyond the Outside Figure's true min/max coordinates. Round tick-grid corner bounds INWARD (nearest nice interval that still falls within the figure) instead of OUTWARD, via one new shared helper replacing three independent duplicate copies of the outward-rounding logic, plus widen the interval ladder with 25/75 for better tick distribution.

**Architecture:** One new function, `computeInwardTickBounds`, added to `app-shared/block-definitions.js` next to the existing `chooseTickIntervalMetres`/`computeGridTickPositions` it composes with. PDF's two call sites (`calculateTickMarkBounds`, `renderOutsideFigureTickMarks` — both in `pdfkitGeoPDF.js`) and DXF's one call site (`addCornerCrosses` in `dxfGenerator.js`) each replace their local 4-line outward floor/ceil block with a single call to the shared helper. The pre-existing map-edge/title-block-avoidance clamp logic in each of the three call sites is untouched — it only ever walks bounds further inward, so it composes safely on top of an already-more-inward starting point.

**Tech Stack:** Node.js (ESM), Jest (`--experimental-vm-modules`).

## Global Constraints

- `computeInwardTickBounds` is axis-agnostic (`aMin/aMax/bMin/bMax`, not Y/X) — its return shape must exactly match `computeGridTickPositions`'s input shape, so callers can pass its output straight through.
- Falls back to the exact (non-rounded) `min`/`max` on an axis where `Math.ceil(min/interval)*interval > Math.floor(max/interval)*interval` (figure narrower than one interval on that axis) — never produce an inverted or empty range.
- `GRID_NICE_NUMBERS` gains `25` and `75` as *additions* to the existing ladder, in sorted order — do not remove `1, 2, 5, 200, 500, 1000, 2000, 5000, 10000`.
- Do not touch the map-edge/title-block-avoidance clamp loops in any of the three call sites (PDF: `pdfkitGeoPDF.js:1610-1721`; DXF: `dxfGenerator.js:939-948`) — only the base rounding they start from changes.
- Do not touch `computeGridTickPositions` itself — it already correctly includes exact endpoints; only what its callers pass in changes.
- Backend tests run via `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails — ESM).

---

### Task 1: Shared inward-rounding helper + wider interval ladder

**Files:**
- Modify: `app-shared/block-definitions.js`
- Test: `app-backend/src/services/__tests__/block-definitions-tickmarks.test.js` (existing file — add new test cases, don't remove existing ones)

**Interfaces:**
- Produces: `computeInwardTickBounds({ aMin, aMax, bMin, bMax, intervalM })` → `{ aMin, aMax, bMin, bMax }`, exported from `app-shared/block-definitions.js`.
- `GRID_NICE_NUMBERS` (internal, not exported) gains `25` and `75`.

- [ ] **Step 1: Write the failing tests**

Add to `app-backend/src/services/__tests__/block-definitions-tickmarks.test.js` (append after the existing `computeGridTickPositions` describe block; add the import to the existing `import { chooseTickIntervalMetres, computeGridTickPositions } from '../../../../app-shared/block-definitions.js'` line at the top of the file):

```js
import { chooseTickIntervalMetres, computeGridTickPositions, computeInwardTickBounds } from '../../../../app-shared/block-definitions.js'
```

```js
describe('computeInwardTickBounds', () => {
  test('bounds already exact multiples of the interval are unchanged', () => {
    const result = computeInwardTickBounds({ aMin: 97400, aMax: 97700, bMin: 2247200, bMax: 2247400, intervalM: 100 })
    expect(result).toEqual({ aMin: 97400, aMax: 97700, bMin: 2247200, bMax: 2247400 })
  })

  test('rounds a real (non-round) figure extent INWARD, never past the true bounds', () => {
    // The reported case: Y 97367.95-97721.38 at a 100m interval.
    const result = computeInwardTickBounds({ aMin: 97367.95, aMax: 97721.38, bMin: 2247108.68, bMax: 2247429.80, intervalM: 100 })
    expect(result).toEqual({ aMin: 97400, aMax: 97700, bMin: 2247200, bMax: 2247400 })
    // Never exceeds the true extent.
    expect(result.aMin).toBeGreaterThanOrEqual(97367.95)
    expect(result.aMax).toBeLessThanOrEqual(97721.38)
    expect(result.bMin).toBeGreaterThanOrEqual(2247108.68)
    expect(result.bMax).toBeLessThanOrEqual(2247429.80)
  })

  test('falls back to the exact min/max when the figure is smaller than one interval', () => {
    // 97420-97480 at 100m interval: ceil(97420/100)*100=97500 > floor(97480/100)*100=97400 — no round multiple fits.
    const result = computeInwardTickBounds({ aMin: 97420, aMax: 97480, bMin: 2247150, bMax: 2247180, intervalM: 100 })
    expect(result).toEqual({ aMin: 97420, aMax: 97480, bMin: 2247150, bMax: 2247180 })
  })

  test('each axis falls back independently — one axis on-grid, the other too narrow', () => {
    const result = computeInwardTickBounds({ aMin: 97400, aMax: 97700, bMin: 2247150, bMax: 2247180, intervalM: 100 })
    expect(result.aMin).toBe(97400)
    expect(result.aMax).toBe(97700)
    expect(result.bMin).toBe(2247150)
    expect(result.bMax).toBe(2247180)
  })
})

describe('GRID_NICE_NUMBERS includes 25 and 75', () => {
  test('a target that only 25m satisfies picks 25, not 10', () => {
    // At 1:100, target 30mm: maxIntervalM = (30*100)/1000 = 3... too small to
    // reach 25 — use a combination that actually lands on 25: 1:1000, target 26mm
    // -> maxIntervalM = 26. Largest candidate <=26 in the old ladder was 20;
    // with 25 added, 25 <= 26 so it wins.
    expect(chooseTickIntervalMetres(1000, 26)).toBe(25)
  })

  test('a target that only 75m satisfies picks 75, not 50', () => {
    // 1:1000, target 76mm -> maxIntervalM = 76. Old ladder's largest <=76 was 50;
    // with 75 added, 75 <= 76 so it wins.
    expect(chooseTickIntervalMetres(1000, 76)).toBe(75)
  })

  test('existing scale/target combinations from the suite above are unaffected by the 25/75 insertion', () => {
    // Re-assert the four pre-existing chooseTickIntervalMetres cases directly —
    // confirms 25/75 didn't shift any value that used to resolve to 10/20/50/100/200/500.
    expect(chooseTickIntervalMetres(500)).toBe(100)
    expect(chooseTickIntervalMetres(1500)).toBe(200)
    expect(chooseTickIntervalMetres(2500)).toBe(500)
    expect(chooseTickIntervalMetres(500, 300)).toBe(100)
    expect(chooseTickIntervalMetres(1000, 300)).toBe(200)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-tickmarks`
Expected: FAIL — `computeInwardTickBounds is not a function` (doesn't exist yet); the two new `GRID_NICE_NUMBERS` tests also fail (25/75 not yet in the ladder, so `chooseTickIntervalMetres(1000, 26)` currently returns `20`, not `25`, and `chooseTickIntervalMetres(1000, 76)` currently returns `50`, not `75`). The "unaffected" test should already pass (nothing's changed yet) — confirm it does, so you know it's a true baseline, not coincidentally broken.

- [ ] **Step 3: Add `computeInwardTickBounds`**

In `app-shared/block-definitions.js`, immediately after `computeGridTickPositions`'s closing brace (currently line 602), add:

```js

/**
 * Round a figure's true min/max INWARD to the nearest tick-interval
 * multiple on each axis, so no tick mark ever falls outside the figure's
 * actual bounds. Ticks still land on nice round numbers — they're just one
 * interval short of the figure's true extent rather than one interval
 * beyond it. Falls back to the exact min/max on an axis where the figure
 * is smaller than one interval (no round multiple strictly between min and
 * max) — still guarantees confinement, just without a round label in that
 * rare case.
 *
 * Axis-agnostic (aMin/aMax/bMin/bMax, not Y/X) like computeGridTickPositions
 * — its return shape is exactly that function's input shape, so callers can
 * pass this helper's output straight into computeGridTickPositions. Shared
 * by pdfkitGeoPDF.js (calculateTickMarkBounds, renderOutsideFigureTickMarks)
 * and dxfGenerator.js (addCornerCrosses) so all three resolve identical
 * corner bounds for the same figure — previously three independent
 * outward-rounding copies, the same class of drift risk already fixed once
 * for the rounding rule itself, see
 * docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md
 */
export function computeInwardTickBounds({ aMin, aMax, bMin, bMax, intervalM }) {
  const roundInward = (min, max) => {
    const inwardMin = Math.ceil(min / intervalM) * intervalM
    const inwardMax = Math.floor(max / intervalM) * intervalM
    return inwardMin <= inwardMax ? { min: inwardMin, max: inwardMax } : { min, max }
  }
  const a = roundInward(aMin, aMax)
  const b = roundInward(bMin, bMax)
  return { aMin: a.min, aMax: a.max, bMin: b.min, bMax: b.max }
}
```

- [ ] **Step 4: Add 25 and 75 to `GRID_NICE_NUMBERS`**

In `app-shared/block-definitions.js`, replace line 554:

```js
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
```

with:

```js
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500, 1000, 2000, 5000, 10000]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-tickmarks`
Expected: PASS (all tests, including the pre-existing ones in this file).

- [ ] **Step 6: Commit**

```bash
git add app-shared/block-definitions.js app-backend/src/services/__tests__/block-definitions-tickmarks.test.js
git commit -m "feat(tick-marks): add computeInwardTickBounds and widen the interval ladder with 25/75"
```

---

### Task 2: Wire the fix into the PDF generator

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Modify: `app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js`
- Modify: `app-backend/src/services/__tests__/tickMarkParity.test.js` (PDF side only in this task — Task 3 revisits this same file once DXF also changes)

**Interfaces:**
- Consumes: `computeInwardTickBounds` from Task 1 (`app-shared/block-definitions.js`).
- No change to `calculateTickMarkBounds`'s or `renderOutsideFigureTickMarks`'s own exported/call signatures — only their internal bounds computation changes.

- [ ] **Step 1: Run the two existing PDF tick-mark test files to record today's baseline**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks tickMarkParity`
Expected: PASS, all tests. Note the exact current output (especially `tickMarkParity.test.js`'s `pdfYLabels.length`/`dxfYLabels.length`, currently `10`/`10`) — this is your baseline to compare against after the fix, not something to assume stays the same.

- [ ] **Step 2: Update `calculateTickMarkBounds`**

In `app-backend/src/services/pdfkitGeoPDF.js`, replace lines 1592-1603:

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

with:

```js
  // Corner bounds round INWARD to the same scale-aware interval used for
  // tick spacing (chooseTickIntervalMetres) — matches DXF's
  // addCornerCrosses exactly, so both formats compute the same corner
  // coordinates for the same plan, and neither ever places a tick beyond
  // the Outside Figure's true extent (previously rounded outward, wasting
  // up to one full interval of margin on every side) — see
  // docs/superpowers/specs/2026-08-12-tick-marks-confined-to-figure-bounds-design.md
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const { aMin: actualY_min, aMax: actualY_max, bMin: actualX_min, bMax: actualX_max } =
    computeInwardTickBounds({ aMin: minY, aMax: maxY, bMin: minX, bMax: maxX, intervalM: _tickIntervalM });
```

- [ ] **Step 3: Update `renderOutsideFigureTickMarks`**

In the same file, find its own copy of the identical comment + 4-line block (currently lines 1889-1900, inside `renderOutsideFigureTickMarks`, not `calculateTickMarkBounds` — locate by the `minY`/`maxY`/`minX`/`maxX` variables computed just above it in *this* function, since both functions independently compute their own `minY`/`maxY`/`minX`/`maxX` from the same polygon coordinates). Apply the identical replacement as Step 2.

- [ ] **Step 4: Add the import**

In `app-backend/src/services/pdfkitGeoPDF.js`, find the existing named-import line from `block-definitions.js` (line 14, already imports `computeScheduleColumnWidths, layoutScheduleColumnsFixedStandArea, SCHEDULE_TARGET_WIDTH_PT, edgeDistanceMetres, classifyBeaconGroups, resolveLoSystem, snapScaleBarSegment, chooseTickIntervalMetres, computeGridTickPositions`) and add `computeInwardTickBounds` to the list.

- [ ] **Step 5: Run the two PDF tick-mark test files again — diagnose any change against the Step 1 baseline**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks tickMarkParity`

For each test, compare against the Step 1 baseline:
- If a test still passes with the same output: done, no further action for that test.
- If a test's output changed (e.g. `tickMarkParity.test.js`'s `pdfYLabels.length` is no longer `10`): read the actual new value from Jest's output, and reason through whether it's a legitimate consequence of ticks now being confined to the figure's true bounds (fewer or differently-positioned ticks is expected and correct) versus a genuine bug (e.g. an error thrown, `NaN` in a label, or a count that doesn't correspond to any sane interpretation of the fixture's geometry — if in doubt, temporarily add a `console.log` of `actualY_min/actualY_max/actualX_min/actualX_max` at the two call sites to see the real resolved bounds and check them by hand against the fixture's `Y0=97360, X0=2247150, W=370, H=250` shape and the 100m interval).
- Only update an assertion once you've confirmed the new value is legitimate. Update `tickMarkParity.test.js`'s explanatory comment (currently a detailed narrative citing prior commits/specs) to add a note for this fix, following the same pattern the comment already uses for prior changes — do not delete the existing historical narrative, append to it.

**Do not update `tickMarkParity.test.js`'s DXF-side (`dxfYLabels`) expectations in this task** — DXF hasn't been fixed yet (Task 3). If Step 5's run shows `dxfYLabels.length` unchanged at `10` (expected, since DXF's code hasn't changed), leave that assertion alone; if the PDF side now differs from the DXF side, it's fine for this one test to be temporarily red on the DXF-vs-PDF equality expectation — Task 3 resolves it. If it's simpler, split the single combined assertion into two separate `expect` calls (one for PDF, one for DXF) so Task 3's diff is cleaner — use your judgment, but leave a comment explaining the DXF side is Task 3's responsibility if you leave this test partially red.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js app-backend/src/services/__tests__/tickMarkParity.test.js
git commit -m "fix(pdf): round tick-mark corner bounds inward to the figure's true extent"
```

(If `tickMarkParity.test.js` is left with an intentionally-red DXF-comparison assertion pending Task 3, say so clearly in the commit body.)

---

### Task 3: Wire the fix into the DXF generator

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/tickMarkParity.test.js` (finish what Task 2 started — both sides now fixed)
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js` (only if the coordinate-grid-ticks tests are actually affected — see Step 1)

**Interfaces:**
- Consumes: `computeInwardTickBounds` from Task 1.
- No change to `addCornerCrosses`'s call signature.

- [ ] **Step 1: Run DXF's tick-related tests to record today's baseline**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.test tickMarkParity`
Expected: PASS for `dxfGenerator.test`'s "generateDXF — coordinate grid ticks" suite (its fixture uses a figure spanning exactly `y=50000-50200, x=2200000-2200200` — already exact multiples of its 100m interval — so outward and inward rounding should coincide and this suite should be unaffected; confirm this is genuinely true after the fix in Step 4, don't just assume it from this description). `tickMarkParity.test.js` should show whatever state Task 2 left it in (PDF side already fixed, DXF side still using old outward rounding).

- [ ] **Step 2: Update `addCornerCrosses`**

In `app-backend/src/services/dxfGenerator.js`, replace lines 924-933:

```js
    // Snap the four corners OUTWARD to a round coordinate grid so every cross
    // label is a clean multiple of a scale-driven interval — chooseTickIntervalMetres
    // picks the largest "nice" ground-metre interval (1/2/5/10/20/50/100/...) whose
    // paper spacing at this plan's scale (S) stays within a ruler-safe target, so a
    // Surveyor-General can check any adjacent pair with a standard 30cm scale ruler.
    // drawL/B are the min corners (floor/out), drawR/T the max corners (ceil/out);
    // labels = −coord, so they stay multiples too.
    const G = chooseTickIntervalMetres(S);
    let xL = Math.floor(drawL / G) * G, xR = Math.ceil(drawR / G) * G;
    let yB = Math.floor(drawB / G) * G, yT = Math.ceil(drawT / G) * G;
```

with:

```js
    // Snap the four corners INWARD to a round coordinate grid so every cross
    // label is a clean multiple of a scale-driven interval — chooseTickIntervalMetres
    // picks the largest "nice" ground-metre interval (1/2/5/10/20/25/50/75/100/...)
    // whose paper spacing at this plan's scale (S) stays within a ruler-safe
    // target, so a Surveyor-General can check any adjacent pair with a
    // standard 30cm scale ruler. Rounding inward (not outward) guarantees no
    // tick ever falls beyond the Outside Figure's true extent — see
    // docs/superpowers/specs/2026-08-12-tick-marks-confined-to-figure-bounds-design.md
    const G = chooseTickIntervalMetres(S);
    const { aMin: xL0, aMax: xR0, bMin: yB0, bMax: yT0 } =
      computeInwardTickBounds({ aMin: drawL, aMax: drawR, bMin: drawB, bMax: drawT, intervalM: G });
    let xL = xL0, xR = xR0, yB = yB0, yT = yT0;
```

(`let` is required — `xL`/`xR`/`yB`/`yT` are mutated by the existing edge-avoidance clamp loops immediately below this block, unchanged.)

- [ ] **Step 3: Add the import**

In `app-backend/src/services/dxfGenerator.js`, find the existing named-import block from `block-definitions.js` (currently listing `chooseTickIntervalMetres`, `computeGridTickPositions`, etc.) and add `computeInwardTickBounds` to it.

- [ ] **Step 4: Run DXF's tick-related tests again — diagnose against the Step 1 baseline**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.test tickMarkParity`

- `dxfGenerator.test.js`'s "coordinate grid ticks" suite: per Step 1's prediction, this fixture's bounds are already exact multiples of its interval, so this should pass unchanged. If it doesn't, diagnose why (the fixture's exact numbers, re-derive by hand, or add a temporary log) before concluding it's expected.
- `tickMarkParity.test.js`: now that both PDF and DXF round inward, re-derive whether they agree (`pdfYLabels.length === dxfYLabels.length`) — this was the whole point of sharing one helper between both formats. If they now agree, restore the single combined assertion (if Task 2 split it into two) and update the comment to note both sides are now fixed and produce matching counts. If they still disagree, that's a real, separate finding (not something this plan anticipated) — diagnose it fully (do the two formats' `drawL/R/T/B` vs PDF's `minY/maxY/minX/maxX` actually represent the same ground extent for this fixture? there may be a legitimate, different reason, like the already-documented "PDF/DXF mapBounds sizing gap" this spec explicitly left out of scope) and report it as a concern rather than forcing the assertion to match.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/tickMarkParity.test.js
git add app-backend/src/services/__tests__/dxfGenerator.test.js
git commit -m "fix(dxf): round tick-mark corner bounds inward to the figure's true extent"
```

(Second `git add` is a no-op if `dxfGenerator.test.js` needed no changes — fine either way.)

---

### Task 4: Full verification

**Files:** none expected (verification only; only touch files if a step below finds a real, narrowly-scoped issue).

- [ ] **Step 1: Repo-wide sanity check**

Run: `grep -rn "Math.floor(min" app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/dxfGenerator.js`
Expected: no remaining matches of the old outward-rounding pattern in either file's tick-mark code (the pattern `Math.floor(minY` / `Math.floor(minX` / `Math.floor(drawL` etc. should no longer appear — only `computeInwardTickBounds`'s own internal `Math.ceil`/`Math.floor` inside `block-definitions.js` should remain, which is correct and expected).

- [ ] **Step 2: Full backend suite**

Run: `cd app-backend && npm test`
Expected: PASS, all suites. If anything outside the files this plan already touched fails, diagnose whether it's a legitimate consequence of tick bounds changing (e.g. a snapshot test capturing exact rendered tick positions) before updating anything — same discipline as Tasks 2/3.

- [ ] **Step 3: Manual visual check against the originally-reported plan**

If the referenced project data is available locally
(`C:\Users\mukan\Documents\SurveyPro\Projects\MAG1_SH1_Shabani_2026-06-16\`),
regenerate its `general-developed` PDF (Stands 207-270, 340-345 Maglas
Township) through the normal app flow and visually confirm: the printed
tick Y/X range in the corner-cross labels no longer exceeds the Outside
Figure Data table's own printed Y/X range (previously Y 97300–97800 vs. the
figure's true 97367.95–97721.38 — should now show Y values strictly within
that range, e.g. 97400–97700). Note the actual before/after values observed.

- [ ] **Step 4: Commit any follow-up fixes from Steps 1-3**

```bash
git add -A
git commit -m "test: fix any remaining fallout from the inward tick-bounds rounding fix"
```

(Skip this step entirely if Steps 1-3 passed clean with no changes needed.)

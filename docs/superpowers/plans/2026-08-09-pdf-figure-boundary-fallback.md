# PDF Figure-Boundary Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Schedule of Areas (and every other collision-aware block) overlapping the survey figure when a plan has no explicit `outsideFigure` GeoJSON polygon, by wiring PDF's already-computed extent-bbox fallback (`outsideFigureBoundary`) into the one variable (`outsideFigure`) that the collision system, tick marks, and other consumers actually read.

**Architecture:** A single, surgical change in `_generateGeoPDFInner` (`app-backend/src/services/pdfkitGeoPDF.js`): change the top-of-function `options` destructuring from `const` to `let`, then — immediately after the existing extent-bbox rebuild of `outsideFigureBoundary` — synthesize a GeoJSON `outsideFigure` from that bbox whenever the real one is absent. Every downstream consumer of `outsideFigure` (10+ call sites) picks this up automatically; no other file changes. DXF is not touched — it already has an equivalent, working fallback via `outsideFigureData`.

**Tech Stack:** Node.js (ESM), Jest 30 (`--experimental-vm-modules`), PDFKit.

## Global Constraints

- PDF only — DXF is out of scope for this plan.
- The fallback must run **after** beacon inside/outside filtering (`pdfkitGeoPDF.js:10704-10801`, which must only ever see a *true* figure boundary, never a bbox) and **after** the `outsideFigureBoundary` bbox rebuild (`pdfkitGeoPDF.js:10899-10915`, which the fallback consumes).
- Never shrink or override an explicit `outsideFigure` when the caller supplied one — the fallback only fires when `outsideFigure?.features?.length` is falsy.
- Run backend tests from `app-backend` with `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails — ESM project).
- Every code change and its exact effect (all 3 fallback scenarios, and the resulting snapshot diff) in this plan has already been manually verified against the running code during planning — the numbers below (`polyVerts: 4` in all three cases) are measured, not estimated.

---

## Task 1: Wire the `outsideFigure` fallback

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Test (new): `app-backend/src/services/__tests__/pdfkitGeoPDF.outsideFigureFallback.test.js`

**Interfaces:**
- Consumes: nothing new — `generateGeoPDF` (already exported) is the test's only entry point.
- Produces: no new exports. `outsideFigure`'s reassignment is purely internal to `_generateGeoPDFInner`; every existing consumer of that variable is unaffected in shape, only in whether it now receives a real value instead of `undefined`/empty.

- [ ] **Step 1: Write the failing tests**

Create `app-backend/src/services/__tests__/pdfkitGeoPDF.outsideFigureFallback.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'

function polyVerts(logs) {
  const hit = logs.find(m => typeof m === 'object' && m.msg === '[PLANNER-INPUT] PDF → planSheetLayout')
  return hit?.polyVerts
}

function captureLogger() {
  const logs = []
  return {
    logs,
    logger: {
      info: (m) => logs.push(m),
      warn: (m) => logs.push(m),
      error: (m) => logs.push(m),
    },
  }
}

describe('generateGeoPDF — outsideFigure fallback to extent bbox', () => {
  test('no outsideFigure, has parcels + outsideFigureData: fallback populates the collision polygon', async () => {
    const { logs, logger } = captureLogger()
    await generateGeoPDF(sampleRealisticPlan, logger)
    expect(polyVerts(logs)).toBe(4)
    const fallbackLog = logs.find(m => typeof m === 'string' && m.includes('using the extent bbox as the collision-avoidance figure boundary'))
    expect(fallbackLog).toBeDefined()
  })

  test('outsideFigure present: behavior unchanged, fallback never triggers', async () => {
    const withOF = {
      ...sampleRealisticPlan,
      outsideFigure: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[50000, 2200000], [50200, 2200000], [50200, 2200150], [50000, 2200150], [50000, 2200000]]] },
          properties: {},
        }],
      },
    }
    const { logs, logger } = captureLogger()
    await generateGeoPDF(withOF, logger)
    expect(polyVerts(logs)).toBe(4)
    const fallbackLog = logs.find(m => typeof m === 'string' && m.includes('using the extent bbox as the collision-avoidance figure boundary'))
    expect(fallbackLog).toBeUndefined()
  })

  test('neither outsideFigureData nor outsideFigure, but parcels exist: still resolves via the parcels-only bbox', async () => {
    const parcelsOnly = { ...sampleRealisticPlan, outsideFigureData: undefined }
    const { logs, logger } = captureLogger()
    await generateGeoPDF(parcelsOnly, logger)
    expect(polyVerts(logs)).toBe(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.outsideFigureFallback
```

Expected: FAIL — all three tests. `polyVerts` is `0` (not `4`) for the first and third tests (measured), and the fallback log never appears for any of them since the fallback code doesn't exist yet.

- [ ] **Step 3: Make `outsideFigure` reassignable**

In `app-backend/src/services/pdfkitGeoPDF.js`, replace (around line 10603-10604):

```js
async function _generateGeoPDFInner(options, logger) {
  const {
```

with:

```js
async function _generateGeoPDFInner(options, logger) {
  let {
```

- [ ] **Step 4: Add the fallback, immediately after the extent-bbox rebuild**

In the same file, replace (around line 10899-10916):

```js
  // Rebuild outsideFigureBoundary as the bounding-box rectangle of ALL parcel geometry.
  // The 4 OFD edge endpoints form a sparse polygon that doesn't cover the full drawn
  // parcel area — blocks placed "outside" those 4 points still land on top of parcel lines.
  // Using the full extent bbox as the exclusion polygon ensures the block placement engine
  // rejects any slot that overlaps the drawn map area.
  // The bbox is a closed 5-point rectangle in geographic coords [Y, X].
  if (Number.isFinite(minY) && Number.isFinite(maxY) && Number.isFinite(minX) && Number.isFinite(maxX)) {
    outsideFigureBoundary = [
      [minY, minX],
      [maxY, minX],
      [maxY, maxX],
      [minY, maxX],
      [minY, minX], // close
    ];
    const _bboxMsg = `outsideFigureBoundary bbox: Y:${minY.toFixed(1)}-${maxY.toFixed(1)}, X:${minX.toFixed(1)}-${maxX.toFixed(1)}, pts:${outsideFigureBoundary.length}`;
    logger.info({ msg: "[PDFKit] 📐 outsideFigureBoundary rebuilt as extent bbox", bbox: _bboxMsg });
  }

  // Select appropriate page size per SI 727 Section 62
```

with:

```js
  // Rebuild outsideFigureBoundary as the bounding-box rectangle of ALL parcel geometry.
  // The 4 OFD edge endpoints form a sparse polygon that doesn't cover the full drawn
  // parcel area — blocks placed "outside" those 4 points still land on top of parcel lines.
  // Using the full extent bbox as the exclusion polygon ensures the block placement engine
  // rejects any slot that overlaps the drawn map area.
  // The bbox is a closed 5-point rectangle in geographic coords [Y, X].
  if (Number.isFinite(minY) && Number.isFinite(maxY) && Number.isFinite(minX) && Number.isFinite(maxX)) {
    outsideFigureBoundary = [
      [minY, minX],
      [maxY, minX],
      [maxY, maxX],
      [minY, maxX],
      [minY, minX], // close
    ];
    const _bboxMsg = `outsideFigureBoundary bbox: Y:${minY.toFixed(1)}-${maxY.toFixed(1)}, X:${minX.toFixed(1)}-${maxX.toFixed(1)}, pts:${outsideFigureBoundary.length}`;
    logger.info({ msg: "[PDFKit] 📐 outsideFigureBoundary rebuilt as extent bbox", bbox: _bboxMsg });
  }

  // The schedule/tick collision-avoidance polygon (mapFeatureBounds.pdfPoints,
  // fed to buildPlannerObstacles as `outsideFigure`) has historically only
  // recognized the figure via this literal `outsideFigure` GeoJSON field —
  // unlike outsideFigureBoundary above, it never fell back to the rebuilt
  // extent bbox. When outsideFigure is absent, synthesize an equivalent
  // GeoJSON Polygon from outsideFigureBoundary (the full-coverage extent
  // bbox rebuilt just above, not the sparse 4-point OFD-edges polygon) so
  // every downstream consumer of `outsideFigure` — schedule/tick-mark
  // collision avoidance, beacon filtering, map positioning — sees a real
  // figure instead of treating the whole map as empty space.
  if (!(outsideFigure?.features?.length > 0) && outsideFigureBoundary?.length >= 4) {
    outsideFigure = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [outsideFigureBoundary] },
        properties: {},
      }],
    };
    logger.info('[PDFKit] 🗺️  No outsideFigure supplied — using the extent bbox as the collision-avoidance figure boundary');
  }

  // Select appropriate page size per SI 727 Section 62
```

(Beacon inside/outside filtering at `pdfkitGeoPDF.js:10704-10801` runs *before* this point — unaffected, still only filters against a true `outsideFigure` when the caller supplied one.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.outsideFigureFallback
```

Expected: PASS — all three tests.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.outsideFigureFallback.test.js
git commit -m "fix(pdf): fall back to extent bbox when outsideFigure is absent"
```

---

## Task 2: Integration regression test + full regression + snapshot + visual verification

**Files:**
- Test (new): `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`
- Modify: `app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `generateGeoPDF` (already exported).
- Produces: nothing new — this task verifies the fix end-to-end and updates the one snapshot file that's expected to change.

- [ ] **Step 1: Write the failing integration test**

Create `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js'

// sampleRealisticPlan has 12 stands (single-table schedule — doesn't trigger
// the separate, still-open paper-size-escalation gap for SPLIT schedules,
// isScheduleWithFluidFallback in pdfkitGeoPDF.js, which is a different,
// not-yet-fixed bug) and no `outsideFigure` field — the exact scenario that
// originally reproduced the reported overlap bug.
describe('Schedule of Areas placement no longer collides when outsideFigure is absent', () => {
  test('no scheduleOfAreas collision-warning logs', async () => {
    const messages = []
    const capture = (m) => messages.push(typeof m === 'string' ? m : JSON.stringify(m))
    const logger = { info: capture, warn: capture, error: capture }
    await generateGeoPDF(sampleRealisticPlan, logger)

    const scheduleCollisions = messages.filter(m =>
      m.includes('scheduleOfAreas') &&
      (m.includes('no collision-free slot found') || (m.includes('Block') && m.includes('Polygon') && m.includes('collision')))
    )
    expect(scheduleCollisions).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it currently passes (this fixture never triggered the collision log even before the fix — verified during planning) and stays passing**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.scheduleNoOverlap
```

Expected: PASS, both before and after Task 1's change — this test is a regression guard against the collision-warning symptom ever reappearing for this scenario, not a RED/GREEN proof of Task 1's effect (Task 1's own tests already provide that, via the `polyVerts` diagnostic, which reliably distinguishes fixed from unfixed). Confirm it's green now that Task 1 is complete.

- [ ] **Step 3: Run the full backend test suite**

```bash
cd app-backend && npm test
```

Expected: mostly PASS. `pdfkitGeoPDF.snapshot.test.js` is EXPECTED to fail — Task 1's fix changes block placement for any snapshot fixture that lacks `outsideFigure` (measured during planning: all 3 of `pdfkitGeoPDF.snapshot.test.js`'s fixtures — minimal, realistic, Maglas — shift). Any OTHER failing suite is a real regression: read the failure and fix the root cause before proceeding.

- [ ] **Step 4: Update the PDF snapshot**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.snapshot -u
```

- [ ] **Step 5: Manually inspect the snapshot diff before committing it**

```bash
cd app-backend && git diff src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
```

Confirm:
- Text item positions shift (blocks now avoid the figure), but no text item's *content* changes, and no item is missing or duplicated.
- Nothing reads `NaN`, `undefined`, or looks obviously wrong.

If anything besides position shifts shows up, stop and investigate before proceeding.

- [ ] **Step 6: Re-run the full suite to confirm everything is green**

```bash
cd app-backend && npm test
```

Expected: PASS, full suite.

- [ ] **Step 7: Commit the snapshot update**

```bash
cd app-backend && git add src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
git commit -m "test(pdf): add schedule/figure no-overlap regression test, update snapshot"
```

- [ ] **Step 8: Visual verification**

Regenerate a plan resembling the original 240-stand Maglas-style repro fixture (`sampleMaglasPlan` in `app-backend/src/services/__tests__/fixtures/`) and a smaller single-table plan (`sampleRealisticPlan`) through `generateGeoPDF`, and view the resulting PDFs. For the small fixture, confirm the Schedule of Areas no longer overlaps the figure. For the large fixture, note whether overlap still occurs — sub-project B (the paper-size-escalation gate for split schedules) is a separate, not-yet-fixed issue, so some residual overlap for that specific dense case is expected and not a failure of this plan.

---

## Self-Review Notes

- **Spec coverage:** PDF-only scope (Task 1's single-file change), fallback ordering relative to beacon filtering and the bbox rebuild (Task 1 Step 4's exact insertion point), all 3 edge cases from the spec (outsideFigure present / absent-with-OFD / absent-without-OFD, all covered by Task 1's three tests), the originally-reported-bug regression (Task 2), full-suite + snapshot pass (Task 2), visual verification acknowledging sub-project B's residual scope (Task 2 Step 8).
- **Type/interface consistency:** No new exports or function signatures introduced anywhere in this plan — the entire fix is a local-variable reassignment inside an existing function, so there's no cross-task interface to keep consistent.
- **Everything in this plan was empirically verified against the running code during planning** (not just reasoned about): the exact `polyVerts` values in Task 1's three test scenarios, the fact that Task 2's chosen fixture produces zero collision-log matches even pre-fix (so the integration test is a regression guard, not a RED/GREEN proof — documented explicitly in Task 2 Step 2 so an implementer doesn't mistake a pre-passing test for a mistake), and that the PDF snapshot changes while no other suite does.

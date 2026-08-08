# Coordinate Grid Tick Marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "4 corners only" coordinate tick marks with a full grid of ticks along all 4 edges of the figure's bounding extent, spaced at a scale-safe interval so a Surveyor-General can check any adjacent pair with a standard 30cm scale ruler, in both PDF and DXF output.

**Architecture:** Two new shared functions in `app-shared/block-definitions.js` — `chooseTickIntervalMetres` (picks a round ground-metre interval whose paper spacing stays under a safety-margin target) and `computeGridTickPositions` (generates the deduplicated point list along all 4 edges of a bounding rectangle at that interval). Both `pdfkitGeoPDF.js` and `dxfGenerator.js` already have their own per-tick draw/collision/label-placement loops that are fully generic (not keyed on which corner a point is) — only the *input array* of tick points changes, from a hardcoded 4-item list to the shared helpers' output.

**Tech Stack:** Node.js (ESM), Jest 30 (`--experimental-vm-modules`), PDFKit, raw DXF text generation.

## Global Constraints

- Auto-computed interval per plan scale, target paper spacing **250mm** (not the full 300mm) — `docs/superpowers/specs/2026-08-08-coordinate-grid-tick-marks-design.md`.
- Applies to **both PDF and DXF**, all **4 edges** of the bounding extent.
- **Every** tick (corner and intermediate) gets a full `Y=`/`X=` coordinate label.
- Never draw or reserve the same `(y,x)` point twice (each of the 4 corners is the shared endpoint of two edges).
- Run backend tests from `app-backend` with `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails — ESM project).

## Note on a spec refinement found during planning

The spec anticipated needing edge-aware label-offset direction (top labels above, bottom below, etc.). Reading the full `renderOutsideFigureTickMarks` function (`pdfkitGeoPDF.js:1790-2532`) during planning found its Y/X label placement logic is **already fully polygon-relative** (`tickIsAbovePoly = pdfPoint.y < _polyCy`, `pdfkitGeoPDF.js:2268`) and never branches on which corner a tick is (`tick.name` is used only in log strings; a leftover `isTopTick` variable at `pdfkitGeoPDF.js:2024` is computed but never read). So `computeGridTickPositions` doesn't need to group points by edge for the PDF's benefit — it returns one flat, deduplicated point list. This keeps the same auto-computed-interval / 4-edges / full-labels / both-formats decisions from the spec; only the shape of one internal helper simplified.

---

## Task 1: Shared interval + tick-position helpers

**Files:**
- Modify: `app-shared/block-definitions.js`
- Test (new): `app-backend/src/services/__tests__/block-definitions-tickmarks.test.js`

**Interfaces:**
- Produces: `chooseTickIntervalMetres(scaleDenominator, targetPaperMm = 250) => number` — ground-metre interval.
- Produces: `computeGridTickPositions({ aMin, aMax, bMin, bMax, intervalM }) => {a: number, b: number}[]` — deduplicated tick points along the perimeter of the `[aMin,aMax] x [bMin,bMax]` rectangle, stepped by `intervalM` on each axis. Axis-agnostic (caller decides what `a`/`b` mean — Cape Lo Y/X for PDF, DXF ground x/y for DXF).

- [ ] **Step 1: Write the failing tests**

Create `app-backend/src/services/__tests__/block-definitions-tickmarks.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { chooseTickIntervalMetres, computeGridTickPositions } from '../../../../app-shared/block-definitions.js'

describe('chooseTickIntervalMetres', () => {
  test('1:500 scale picks 100m (200mm paper spacing)', () => {
    expect(chooseTickIntervalMetres(500)).toBe(100)
  })

  test('1:1500 scale picks 200m (133mm paper spacing)', () => {
    expect(chooseTickIntervalMetres(1500)).toBe(200)
  })

  test('1:2500 scale picks 500m (200mm paper spacing)', () => {
    expect(chooseTickIntervalMetres(2500)).toBe(500)
  })

  test('every returned interval keeps paper spacing at or under the target', () => {
    for (const scale of [250, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000]) {
      const interval = chooseTickIntervalMetres(scale)
      const paperMm = (interval * 1000) / scale
      expect(paperMm).toBeLessThanOrEqual(250)
    }
  })

  test('respects a custom targetPaperMm', () => {
    // At 1:500, 300mm target allows up to 150m; largest nice number <=150 is 100.
    expect(chooseTickIntervalMetres(500, 300)).toBe(100)
    // At 1:1000, 300mm target allows up to 300m; largest nice number <=300 is 200.
    expect(chooseTickIntervalMetres(1000, 300)).toBe(200)
  })
})

describe('computeGridTickPositions', () => {
  test('a 200x200 extent at 100m interval produces 8 unique perimeter points', () => {
    const points = computeGridTickPositions({ aMin: 50000, aMax: 50200, bMin: 2200000, bMax: 2200200, intervalM: 100 })
    // a-values: 50000, 50100, 50200 (3); b-values: 2200000, 2200100, 2200200 (3)
    // top/bottom edges (a varies, b fixed at bMin/bMax): 3 + 3 = 6
    // left/right edges (b varies, a fixed at aMin/aMax): 3 + 3 = 6
    // minus 4 shared corners = 8 unique points
    expect(points).toHaveLength(8)
    const keys = new Set(points.map(p => `${p.a},${p.b}`))
    expect(keys.size).toBe(8) // no duplicates
  })

  test('includes all 4 corners', () => {
    const points = computeGridTickPositions({ aMin: 0, aMax: 200, bMin: 0, bMax: 200, intervalM: 100 })
    const has = (a, b) => points.some(p => p.a === a && p.b === b)
    expect(has(0, 0)).toBe(true)
    expect(has(0, 200)).toBe(true)
    expect(has(200, 0)).toBe(true)
    expect(has(200, 200)).toBe(true)
  })

  test('extent narrower than one interval collapses to just the 4 corners', () => {
    const points = computeGridTickPositions({ aMin: 0, aMax: 40, bMin: 0, bMax: 40, intervalM: 100 })
    expect(points).toHaveLength(4)
  })

  test('no duplicate points when a and b ranges are unequal', () => {
    const points = computeGridTickPositions({ aMin: 0, aMax: 370, bMin: 0, bMax: 250, intervalM: 100 })
    const keys = points.map(p => `${p.a},${p.b}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-tickmarks
```

Expected: FAIL — `chooseTickIntervalMetres is not a function` / `computeGridTickPositions is not a function` (import error).

- [ ] **Step 3: Implement both functions**

In `app-shared/block-definitions.js`, add immediately after `snapScaleBarSegment` (after its closing `}` at line 501, before the `resolveLoSystem` JSDoc block):

```js
// Picks the largest "nice" round ground-metre interval whose paper spacing,
// at the given scale, stays at or under targetPaperMm. Used to space
// coordinate-grid tick marks close enough together that a Surveyor-General
// can check any adjacent pair with a standard 30cm scale ruler — unlike
// snapScaleBarSegment (smallest nice number >= half a raw segment, for the
// scale bar's own graduation), this solves the opposite constraint.
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]

export function chooseTickIntervalMetres(scaleDenominator, targetPaperMm = 250) {
  const maxIntervalM = (targetPaperMm * scaleDenominator) / 1000
  let chosen = GRID_NICE_NUMBERS[0]
  for (const n of GRID_NICE_NUMBERS) {
    if (n > maxIntervalM) break
    chosen = n
  }
  return chosen
}

// Generates tick points along all 4 edges of a bounding rectangle at a
// fixed interval, replacing "4 corners only" coordinate tick marks with
// enough intermediate points that no two adjacent ticks exceed a
// ruler-safe paper distance. Axis-agnostic: callers supply whatever two
// ground-coordinate axes they use (Cape Lo Y/X, DXF ground x/y, etc.) as
// a/b. Each of the 4 corners is the shared endpoint of two edges, so this
// dedupes by (a,b) before returning.
export function computeGridTickPositions({ aMin, aMax, bMin, bMax, intervalM }) {
  const steppedRange = (start, end, step) => {
    const vals = []
    for (let v = start; v < end; v += step) vals.push(v)
    vals.push(end)
    return vals
  }
  const aValues = steppedRange(aMin, aMax, intervalM)
  const bValues = steppedRange(bMin, bMax, intervalM)

  const seen = new Set()
  const points = []
  const addPoint = (a, b) => {
    const key = `${a},${b}`
    if (seen.has(key)) return
    seen.add(key)
    points.push({ a, b })
  }
  // Top/bottom edges: a varies, b fixed at bMin/bMax.
  for (const a of aValues) {
    addPoint(a, bMin)
    addPoint(a, bMax)
  }
  // Left/right edges: b varies, a fixed at aMin/aMax.
  for (const b of bValues) {
    addPoint(aMin, b)
    addPoint(aMax, b)
  }
  return points
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js block-definitions-tickmarks
```

Expected: PASS — all tests in `block-definitions-tickmarks.test.js`.

- [ ] **Step 5: Commit**

```bash
git add app-shared/block-definitions.js app-backend/src/services/__tests__/block-definitions-tickmarks.test.js
git commit -m "feat(tick-marks): add chooseTickIntervalMetres and computeGridTickPositions helpers"
```

---

## Task 2: PDF — wire `calculateTickMarkBounds` (Pass 1/2 reservation)

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`

**Interfaces:**
- Consumes: `chooseTickIntervalMetres`, `computeGridTickPositions` from Task 1.
- Produces: no new exports — `calculateTickMarkBounds`'s return shape (array of bounds objects) is unchanged, just longer than 4 entries now.

- [ ] **Step 1: Add the new imports**

In `app-backend/src/services/pdfkitGeoPDF.js`, update the import at line 14 from:

```js
import { computeScheduleColumnWidths, layoutScheduleColumnsFixedStandArea, SCHEDULE_TARGET_WIDTH_PT, edgeDistanceMetres, classifyBeaconGroups, resolveLoSystem, snapScaleBarSegment } from "../../../app-shared/block-definitions.js";
```

to:

```js
import { computeScheduleColumnWidths, layoutScheduleColumnsFixedStandArea, SCHEDULE_TARGET_WIDTH_PT, edgeDistanceMetres, classifyBeaconGroups, resolveLoSystem, snapScaleBarSegment, chooseTickIntervalMetres, computeGridTickPositions } from "../../../app-shared/block-definitions.js";
```

- [ ] **Step 2: Add a `scaleDenominator` parameter to `calculateTickMarkBounds`**

In `app-backend/src/services/pdfkitGeoPDF.js`, replace (around line 1555):

```js
function calculateTickMarkBounds(
  outsideFigure,
  extent,
  mapBounds,
  logger,
  titleBlockBounds = null
) {
```

with:

```js
function calculateTickMarkBounds(
  outsideFigure,
  extent,
  mapBounds,
  logger,
  titleBlockBounds = null,
  scaleDenominator = 500
) {
```

- [ ] **Step 3: Replace the hardcoded 4-corner array**

In the same function, replace (around line 1685-1691):

```js
  // Calculate bounds for all 4 tick marks at ROUNDED polygon corners
  const tickMarks = [
    { name: "top-left",     y: actualY_min, x: topX },    // NW corner (Y rounded down)
    { name: "top-right",    y: actualY_max, x: topX },    // NE corner (Y rounded up)
    { name: "bottom-left",  y: actualY_min, x: bottomX }, // SW corner (Y rounded down)
    { name: "bottom-right", y: actualY_max, x: bottomX }, // SE corner (Y rounded up)
  ];
```

with:

```js
  // Generate tick points along all 4 edges at a scale-safe interval (30cm
  // ruler compliance) instead of just the 4 corners.
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const _tickPoints = computeGridTickPositions({
    aMin: actualY_min, aMax: actualY_max, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
  const tickMarks = _tickPoints.map((pt, i) => ({ name: `grid-${i}`, y: pt.a, x: pt.b }));
```

(The rest of the function — the `tickMarks.forEach(...)` loop below — is unchanged; it already computes bounds generically per point.)

- [ ] **Step 4: Thread `scaleDenominator` through all 3 call sites**

In the same file, find the three `calculateTickMarkBounds(` call sites (search confirms exactly 3: around lines 11918, 12084, 12203).

Replace (around line 11918):

```js
  const initialTickMarkBounds = calculateTickMarkBounds(
    outsideFigure,
    calculatedExtent,
    mapBounds,  // Use full drawing area within margins
    logger,
    null
  );
```

with:

```js
  const initialTickMarkBounds = calculateTickMarkBounds(
    outsideFigure,
    calculatedExtent,
    mapBounds,  // Use full drawing area within margins
    logger,
    null,
    scale?.value ?? 500
  );
```

Replace (around line 12084):

```js
  const _plannerTickBounds = calculateTickMarkBounds(
    outsideFigure,
    calculatedExtent,
    mapBounds,
    logger
  );
```

with:

```js
  const _plannerTickBounds = calculateTickMarkBounds(
    outsideFigure,
    calculatedExtent,
    mapBounds,
    logger,
    null,
    scale?.value ?? 500
  );
```

Replace (around line 12203):

```js
  const finalTickMarkBounds = calculateTickMarkBounds(
    outsideFigure,
    calculatedExtent,
    mapBounds,  // Use full drawing area within margins
    logger,
    blockPositions.titleBlock
  );
```

with:

```js
  const finalTickMarkBounds = calculateTickMarkBounds(
    outsideFigure,
    calculatedExtent,
    mapBounds,  // Use full drawing area within margins
    logger,
    blockPositions.titleBlock,
    scale?.value ?? 500
  );
```

- [ ] **Step 5: Sanity-check with a quick manual run**

```bash
cd app-backend && node --experimental-vm-modules -e "
import('./src/services/pdfkitGeoPDF.js').then(async ({ generateGeoPDF }) => {
  const { sampleMaglasPlan } = await import('./src/services/__tests__/fixtures/sampleMaglasPlan.js');
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const { pdfBuffer } = await generateGeoPDF(sampleMaglasPlan, logger);
  console.log('generated ok, bytes:', pdfBuffer.length);
});
"
```

Expected: prints `generated ok, bytes: <number>` with no thrown error. (Full behavioral verification comes in Task 3's tests, once the render path is wired too — Pass 1/2 reservation alone isn't independently visible in output yet.)

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js
git commit -m "feat(pdf): generate grid tick points for calculateTickMarkBounds, not just 4 corners"
```

---

## Task 3: PDF — wire `renderOutsideFigureTickMarks` (actual draw pass) + tests

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Test (new): `app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js`

**Interfaces:**
- Consumes: `chooseTickIntervalMetres`, `computeGridTickPositions` (already imported in Task 2).
- Produces: no new exports — `renderOutsideFigureTickMarks`'s return shape (array of `{name, capeLo, pdf, bounds}`) is unchanged, just longer than 4 entries now. `generateGeoPDF` is already exported and is what the new test drives.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

// A figure sized like the real Shabani plan that motivated this feature:
// 1:500 scale, ~370m x 250m extent. At 4-corners-only, the shorter edge
// alone (250m -> 50cm on paper) already exceeds a 30cm ruler.
const Y0 = 97360, X0 = 2247150, W = 370, H = 250
const ring = [[Y0, X0], [Y0 + W, X0], [Y0 + W, X0 + H], [Y0, X0 + H], [Y0, X0]]
const shabaniLikePlan = {
  metadata: { designation: 'Stand 1 Test', township: 'T', district: 'D', standCount: 1, standRange: '1', beaconSequence: 'ABCDA', date: '2026-06-15', centralMeridian: 31 },
  parcels: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { stand: '1', area_m2: W * H } }] },
  beacons: { type: 'FeatureCollection', features: ring.slice(0, 4).map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { name: 'ABCD'[i], pointId: 'ABCD'[i] } })) },
  outsideFigure: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: W.toFixed(3), direction: '90°00\'00"', y: Y0 + W, x: X0 },
      { side: 'BC', metres: H.toFixed(3), direction: '0°00\'00"', y: Y0 + W, x: X0 + H },
      { side: 'CD', metres: W.toFixed(3), direction: '270°00\'00"', y: Y0, x: X0 + H },
      { side: 'DA', metres: H.toFixed(3), direction: '180°00\'00"', y: Y0, x: X0 },
    ],
    coordinates: ring.slice(0, 4).map((c, i) => ({ name: 'ABCD'[i], y: c[0], x: c[1] })),
  },
  sheetSize: 'ISO_A2', scale: { value: 500, label: '1:500' },
}

describe('renderOutsideFigureTickMarks — grid compliance', () => {
  test('emits more than 4 tick marks for a figure whose extent exceeds ruler range', async () => {
    const { pdfBuffer } = await generateGeoPDF(shabaniLikePlan, fakeLogger)
    const dxfLikeText = pdfBuffer.toString('latin1')
    // Every tick label follows "Y = <sign><digits with spaces>"; count occurrences.
    const yLabels = dxfLikeText.match(/Y = [+-][\d ]+/g) || []
    expect(yLabels.length).toBeGreaterThan(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks
```

Expected: FAIL — `renderOutsideFigureTickMarks` still hardcodes exactly 4 corners, so `yLabels.length` is 4, not `> 4`.

- [ ] **Step 3: Add a `scaleDenominator` parameter to `renderOutsideFigureTickMarks`**

In `app-backend/src/services/pdfkitGeoPDF.js`, replace (around line 1790):

```js
function renderOutsideFigureTickMarks(
  doc,
  outsideFigure,
  extent,
  mapBounds,
  collisionDetector,
  logger,
  titleBlockBounds = null,
  blockPositions = null,
  polygonPdfPoints = []
) {
```

with:

```js
function renderOutsideFigureTickMarks(
  doc,
  outsideFigure,
  extent,
  mapBounds,
  collisionDetector,
  logger,
  titleBlockBounds = null,
  blockPositions = null,
  polygonPdfPoints = [],
  scaleDenominator = 500
) {
```

- [ ] **Step 4: Replace the hardcoded 4-corner array**

In the same function, replace (around line 1985-1990):

```js
  const tickMarks = [
    { name: "top-left", y: actualY_min, x: topX }, // Actual NW corner (adjusted for title block)
    { name: "top-right", y: actualY_max, x: topX }, // Actual NE corner (adjusted for title block)
    { name: "bottom-left", y: actualY_min, x: bottomX }, // Actual SW corner (adjusted for map bounds)
    { name: "bottom-right", y: actualY_max, x: bottomX }, // Actual SE corner (adjusted for map bounds)
  ];
```

with:

```js
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const _tickPoints = computeGridTickPositions({
    aMin: actualY_min, aMax: actualY_max, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
  const tickMarks = _tickPoints.map((pt, i) => ({ name: `grid-${i}`, y: pt.a, x: pt.b }));
```

(The `tickMarks.forEach(...)` loop below — collision checks, cross drawing, Y/X label placement — is unchanged; it's already generic per point, keyed only by position, not corner name.)

- [ ] **Step 5: Thread `scaleDenominator` through the call site**

Replace (around line 12400):

```js
  const tickMarks = renderOutsideFigureTickMarks(
    doc,
    outsideFigure,
    calculatedExtent,
    mapBounds,  // Use full drawing area within margins
    collisionDetector,
    logger,
    blockPositions.titleBlock,
    blockPositions,
    _topoPolyPts  // Polygon PDF points for label collision avoidance
  );
```

with:

```js
  const tickMarks = renderOutsideFigureTickMarks(
    doc,
    outsideFigure,
    calculatedExtent,
    mapBounds,  // Use full drawing area within margins
    collisionDetector,
    logger,
    blockPositions.titleBlock,
    blockPositions,
    _topoPolyPts,  // Polygon PDF points for label collision avoidance
    scale?.value ?? 500
  );
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF.tickMarks
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js
git commit -m "feat(pdf): render grid tick marks along all 4 edges instead of 4 corners"
```

---

## Task 4: DXF — wire `addCornerCrosses` + update existing exact-count tests

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.test.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

**Interfaces:**
- Consumes: `chooseTickIntervalMetres`, `computeGridTickPositions` from Task 1.
- Produces: no new exports — `addCornerCrosses`'s return shape (array of reserved bounds) is unchanged, just longer than 4 entries now.

- [ ] **Step 1: Add the new imports**

In `app-backend/src/services/dxfGenerator.js`, update the import block (lines 23-36) from:

```js
import {
  TITLE_BLOCK,
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  formatStandRanges,
  computeScheduleColumnWidths,
  layoutScheduleColumnsFixedStandArea,
  SCHEDULE_TARGET_WIDTH_PT,
  edgeDistanceMetres,
  classifyBeaconGroups,
  snapScaleBarSegment,
  resolveLoSystem,
} from '../../../app-shared/block-definitions.js'
```

to:

```js
import {
  TITLE_BLOCK,
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  formatStandRanges,
  computeScheduleColumnWidths,
  layoutScheduleColumnsFixedStandArea,
  SCHEDULE_TARGET_WIDTH_PT,
  edgeDistanceMetres,
  classifyBeaconGroups,
  snapScaleBarSegment,
  resolveLoSystem,
  chooseTickIntervalMetres,
  computeGridTickPositions,
} from '../../../app-shared/block-definitions.js'
```

- [ ] **Step 2: Update the existing exact-4-corner unit test to expect the new grid behavior**

In `app-backend/src/services/__tests__/dxfGenerator.test.js`, this fixture (200m x 200m extent, 1:500 scale) will produce `chooseTickIntervalMetres(500) = 100` once Step 4 below lands, giving 3 grid values per axis (0, 100, 200 relative) and 8 unique perimeter points (matches the `block-definitions-tickmarks.test.js` "200x200 at 100m interval" case from Task 1). Replace the test at line 341-361:

```js
  test('renders 4 corner reference crosses with Y = / X = coordinate labels (PDF parity)', () => {
    // Ports the PDF's renderOutsideFigureTickMarks: a "+" at each of the figure's
    // four coordinate corners (8 arm LINEs) labelled "Y = <westing>" / "X = <southing>"
    // — same format as the PDF (explicit +/- sign, space-grouped thousands).
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 4 crosses × 2 arms = 8 GRID LINEs.
    expect(entityCount(dxf, 'LINE', 'GRID')).toBe(8)
    // Collect GRID-layer TEXT labels.
    const labels = []
    const parts = dxf.split(/^\s*0\s*\r?\n/m)
    for (const e of parts) {
      if (!/^\s*TEXT/.test(e)) continue
      if (!/^\s*8\r?\n\s*GRID\b/m.test(e)) continue
      const t = (e.match(/^\s*1\r?\n\s*([^\r\n]+)/m) || [])[1]
      if (t) labels.push(t.trim())
    }
    // Each cross has a "Y = +N" and an "X = +N" label → 4 of each.
    expect(labels.filter(t => /^Y = [+-][\d ]+$/.test(t))).toHaveLength(4)
    expect(labels.filter(t => /^X = [+-][\d ]+$/.test(t))).toHaveLength(4)
  })
```

with:

```js
  test('renders grid reference crosses along all 4 edges with Y = / X = coordinate labels (PDF parity)', () => {
    // Ports the PDF's renderOutsideFigureTickMarks: a "+" at each grid point
    // around the figure's perimeter (not just the 4 corners), each labelled
    // "Y = <westing>" / "X = <southing>" — same format as the PDF (explicit
    // +/- sign, space-grouped thousands). This fixture is a 200m x 200m
    // extent at 1:500, so chooseTickIntervalMetres picks a 100m interval —
    // 3 grid values per axis, 8 unique perimeter points (see
    // block-definitions-tickmarks.test.js for the general-case math).
    const { buffer } = generateDXF(opts, fakeLogger)
    const dxf = buffer.toString()
    // 8 crosses × 2 arms = 16 GRID LINEs.
    expect(entityCount(dxf, 'LINE', 'GRID')).toBe(16)
    // Collect GRID-layer TEXT labels.
    const labels = []
    const parts = dxf.split(/^\s*0\s*\r?\n/m)
    for (const e of parts) {
      if (!/^\s*TEXT/.test(e)) continue
      if (!/^\s*8\r?\n\s*GRID\b/m.test(e)) continue
      const t = (e.match(/^\s*1\r?\n\s*([^\r\n]+)/m) || [])[1]
      if (t) labels.push(t.trim())
    }
    // Each cross has a "Y = +N" and an "X = +N" label → 8 of each.
    expect(labels.filter(t => /^Y = [+-][\d ]+$/.test(t))).toHaveLength(8)
    expect(labels.filter(t => /^X = [+-][\d ]+$/.test(t))).toHaveLength(8)
  })
```

- [ ] **Step 3: Update the existing exact-8-entity integration test to expect the new grid behavior**

In `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`, the `'still emits the full set of corner crosses (8 LINEs + 8 TEXT)'` test (line 611-615) uses a fixture with map-edge inward-clamping (a 90m x 160m figure at 1:500 on A2 — chosen specifically to force some corners to clamp inward). The exact final grid-point count after clamping isn't hand-verifiable from the spec alone (the inward-clamp loop can shift `xL/xR/yB/yT` before the grid is generated), so this test is updated to a relational assertion instead of a hardcoded count — still precise, just not coupled to the clamping arithmetic. Replace:

```js
  test('still emits the full set of corner crosses (8 LINEs + 8 TEXT)', () => {
    const dxf = generateDXF(tallPlan, fakeLogger).buffer.toString()
    expect(entityCount(dxf, 'LINE', 'GRID')).toBe(8)
    expect(entityCount(dxf, 'TEXT', 'GRID')).toBe(8)
  })
```

with:

```js
  test('emits a full grid of crosses (more than just 4 corners) with matching LINE/TEXT counts', () => {
    const dxf = generateDXF(tallPlan, fakeLogger).buffer.toString()
    const lineCount = entityCount(dxf, 'LINE', 'GRID')
    const textCount = entityCount(dxf, 'TEXT', 'GRID')
    // Each cross = 2 arm LINEs + 2 coordinate-label TEXTs, so both counts are
    // always even and equal to each other.
    expect(lineCount).toBeGreaterThan(8) // more than the old 4-corners-only count
    expect(lineCount % 2).toBe(0)
    expect(textCount).toBe(lineCount)
  })
```

- [ ] **Step 4: Run both updated test files to verify they fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.test dxfGenerator.integration
```

Expected: FAIL — `addCornerCrosses` still hardcodes exactly 4 corners, so the updated assertions (16 LINEs/8+8 labels; `lineCount > 8`) don't match the still-old 8-LINE/4+4-label output.

- [ ] **Step 5: Replace the local G-interval snap and hardcoded corners array**

In `addCornerCrosses` (around line 906-935), replace:

```js
    const G = Math.max(drawR - drawL, drawT - drawB) > 1000 ? 100 : 50;
    let xL = Math.floor(drawL / G) * G, xR = Math.ceil(drawR / G) * G;
    let yB = Math.floor(drawB / G) * G, yT = Math.ceil(drawT / G) * G;
```

with:

```js
    const G = chooseTickIntervalMetres(S);
    let xL = Math.floor(drawL / G) * G, xR = Math.ceil(drawR / G) * G;
    let yB = Math.floor(drawB / G) * G, yT = Math.ceil(drawT / G) * G;
```

(`S` is the enclosing `generateDXF` scale denominator, already in scope at this call site — same variable used a few lines below for `mm()`/`pt()` helpers.)

Then, still in the same function, replace:

```js
    const corners = [
      { x: xL, y: yT }, { x: xR, y: yT },
      { x: xL, y: yB }, { x: xR, y: yB },
    ];
```

with:

```js
    const _tickPoints = computeGridTickPositions({ aMin: xL, aMax: xR, bMin: yB, bMax: yT, intervalM: G });
    const corners = _tickPoints.map(pt => ({ x: pt.a, y: pt.b }));
```

(The rest of the function — the `for (const c of corners) { ... }` draw loop — is unchanged; it already draws generically per point.)

- [ ] **Step 6: Run both test files again to verify they pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.test dxfGenerator.integration
```

Expected: PASS — both updated tests, plus everything else in those two files unaffected.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.test.js app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(dxf): render grid reference crosses along all 4 edges instead of 4 corners"
```

---

## Task 5: PDF ↔ DXF parity test

**Files:**
- Test (new): `app-backend/src/services/__tests__/tickMarkParity.test.js`

**Interfaces:**
- Consumes: `generateGeoPDF` (`pdfkitGeoPDF.js`), `generateDXF` (`dxfGenerator.js`) — both already exported.
- Produces: nothing new — this task only verifies PDF and DXF agree on tick *count* for the same input, the same way `dxfGenerator.integration.test.js`'s existing `'SCHEDULE_OF_AREAS columns match what the PDF drawer hardcodes'`-style tests check PDF/DXF agreement elsewhere in this codebase.

- [ ] **Step 1: Write the test**

Create `app-backend/src/services/__tests__/tickMarkParity.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { generateDXF } from '../dxfGenerator.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

const Y0 = 97360, X0 = 2247150, W = 370, H = 250
const ring = [[Y0, X0], [Y0 + W, X0], [Y0 + W, X0 + H], [Y0, X0 + H], [Y0, X0]]
const sharedPlan = {
  metadata: { designation: 'Stand 1 Test', township: 'T', district: 'D', standCount: 1, standRange: '1', beaconSequence: 'ABCDA', date: '2026-06-15', centralMeridian: 31 },
  parcels: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { stand: '1', area_m2: W * H } }] },
  beacons: { type: 'FeatureCollection', features: ring.slice(0, 4).map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { name: 'ABCD'[i], pointId: 'ABCD'[i] } })) },
  outsideFigure: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: W.toFixed(3), direction: '90°00\'00"', y: Y0 + W, x: X0 },
      { side: 'BC', metres: H.toFixed(3), direction: '0°00\'00"', y: Y0 + W, x: X0 + H },
      { side: 'CD', metres: W.toFixed(3), direction: '270°00\'00"', y: Y0, x: X0 + H },
      { side: 'DA', metres: H.toFixed(3), direction: '180°00\'00"', y: Y0, x: X0 },
    ],
    coordinates: ring.slice(0, 4).map((c, i) => ({ name: 'ABCD'[i], y: c[0], x: c[1] })),
  },
  sheetSize: 'ISO_A2', scale: { value: 500, label: '1:500' },
}

describe('tick mark count parity between PDF and DXF', () => {
  test('both formats emit the same number of Y= coordinate labels for the same plan', async () => {
    const { pdfBuffer } = await generateGeoPDF(sharedPlan, fakeLogger)
    const pdfYLabels = (pdfBuffer.toString('latin1').match(/Y = [+-][\d ]+/g) || []).length

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
    const dxfYLabels = dxfLabels.filter(t => /^Y = [+-][\d ]+$/.test(t)).length

    expect(pdfYLabels).toBe(dxfYLabels)
    expect(pdfYLabels).toBeGreaterThan(4)
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js tickMarkParity
```

Expected: PASS. If it fails with a count mismatch, that means PDF and DXF disagree on `scale?.value`/`S` or on how `topX`/`bottomX` vs `xL`/`xR` get computed for this fixture — re-check Tasks 2-4's threading of `scaleDenominator`/`S` before assuming the shared helpers themselves are wrong (they're already covered by Task 1's unit tests).

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/__tests__/tickMarkParity.test.js
git commit -m "test(tick-marks): assert PDF/DXF tick-count parity for the same plan"
```

---

## Task 6: Full regression pass + visual verification

**Files:**
- Modify: `app-backend/src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap` (regenerated, not hand-edited)
- Modify: `app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing new — this task only verifies and updates snapshots.

- [ ] **Step 1: Run the full backend test suite**

```bash
cd app-backend && npm test
```

Expected: mostly PASS. `dxfGenerator.snapshot.test.js` and `pdfkitGeoPDF.snapshot.test.js` are EXPECTED to fail — any fixture with an `outsideFigure`/`outsideFigureData` polygon now emits more `Y=`/`X=` TEXT entities at shifted positions. Any OTHER failing suite should be treated as a real regression: read the failure and fix the root cause before proceeding. Do not weaken an assertion just to force it green.

- [ ] **Step 2: Update both snapshots**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfGenerator.snapshot pdfkitGeoPDF.snapshot -u
```

- [ ] **Step 3: Manually inspect both snapshot diffs before committing them**

```bash
cd app-backend && git diff src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
```

Confirm:
- New `Y = ...` / `X = ...` TEXT entities appear along the figure's edges, not just at the 4 corners.
- No unrelated text item (title block, schedule, beacon labels, outside figure data) changed position or content.
- No label reads `NaN`, `undefined`, or is missing its `+`/`-` sign or space-grouped thousands.

If anything besides new intermediate tick labels shows up, stop and investigate before proceeding.

- [ ] **Step 4: Re-run the full suite to confirm everything is green**

```bash
cd app-backend && npm test
```

Expected: PASS, full suite.

- [ ] **Step 5: Regenerate the real Shabani plan and visually confirm**

Using the same route/flow that produced
`general-developed-STANDS_207-279_340-345_MAGLAS_TOWNSHIP_OF_SHABANI_MINE_SURFA.pdf`,
regenerate that plan's PDF and DXF outputs. Open the PDF and confirm:
- Tick marks with `Y=`/`X=` labels now appear at multiple points along all 4
  edges of the figure, not just the 4 corners.
- Adjacent tick marks along any edge are close enough on paper to check with
  a 30cm ruler at the plan's stated scale (for this 1:500 plan, adjacent
  ticks should be ~10cm apart on paper, well under 30cm).
- No tick label overlaps the title block, schedule of areas, or other data
  tables.
- Coordinate values on the labels are clean round numbers.

- [ ] **Step 6: Commit the snapshot updates**

```bash
cd app-backend && git add src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap
git commit -m "test(tick-marks): update PDF/DXF snapshots for grid tick marks"
```

---

## Self-Review Notes

- **Spec coverage:** Auto-computed interval per scale (Task 1), 250mm target (Task 1, default param), both PDF and DXF (Tasks 2/3 and 4), all 4 edges (Task 1's `computeGridTickPositions`, consumed by both), full `Y=`/`X=` label on every tick (Tasks 2/3/4 reuse the existing per-point label-drawing code unchanged, so every point gets both labels). Testing plan from the spec is covered: unit tests (Task 1), integration tests with count + parity assertions (Tasks 3 and 5), full-suite + snapshot pass (Task 6), visual verification against the real Shabani plan (Task 6 Step 5).
- **Type/interface consistency:** `computeGridTickPositions({aMin,aMax,bMin,bMax,intervalM}) => {a,b}[]` is used identically in Task 2 (PDF Pass 1/2), Task 3 (PDF render), and Task 4 (DXF), each mapping `{a,b}` back to its own domain-specific field names (`y`/`x` for PDF, `x`/`y` for DXF) right at the call site.
- **Dead code note:** `isTopTick` (`pdfkitGeoPDF.js:2024`) remains unused after this plan — pre-existing dead code, not introduced by this work, left untouched per scope.

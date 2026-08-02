# Beacon Comparison Sketch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a graphical, scaled beacon-comparison sketch (SI 727 s.67(5)) to the Found Beacons Assessment report, showing every beacon pair as a black ray annotated with historical/survey distance and swing, with failing figures circled in red.

**Architecture:** Carry the already-live `edgeCompliance()` result (from `si727.js`, already computed by `surveyAdjustmentStore.js` on every comparison run) through the save path into `BeaconComparisonConfig`, add a small pure geometry/scale module for the sketch layout, and render it with jsPDF vector calls in the same shared renderer (`beaconComparisonSection.ts`) both report callers already use — so the sketch appears automatically in both the inline Report on Survey and the standalone Beacon Comparison Report with no change to either caller.

**Tech Stack:** Vue 3 + TypeScript, Vitest, jsPDF 3.0.4 (frontend only — no backend changes).

## Global Constraints

- All work is in `app-frontend`. Run tests with `npm test` or a filtered file, e.g.
  `npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`.
- jsPDF documents in this codebase use **millimetres** as the unit throughout
  (`new jsPDF({ unit: 'mm', ... })`) — every coordinate/size in new code is in mm, matching
  `BeaconComparisonCursor`'s existing fields (`margin`, `lineHeight`, `pageWidth`, `pageHeight`,
  `y`).
- Colour convention (matches this file's existing tabulation table): historical/original data
  is **black** (`setTextColor(0, 0, 0)`); current-survey data is **red**
  (`setTextColor(220, 0, 0)` — the same RGB this codebase already uses for red elsewhere, e.g.
  `calculations-part1.ts`'s `setDrawColor(220, 0, 0)`).
- **Ray lines are always plain black.** Pass/fail is shown only by circling the failing
  figure(s) in red — never by recolouring the ray itself.
- `formatDMS(dd)` (from `app-frontend/src/utils/surveyMath.js`) wraps its input into `[0,360)`
  before formatting — it does not preserve the sign of a negative swing. This matches the
  *existing*, already-shipped behaviour of the interactive Edge Compliance tab
  (`CompareView.vue` calls `formatDMS(result.edges.summary.meanSwingDeg)` the same way), so
  the sketch's swing display is consistent with what a surveyor already sees in that tab —
  this is not a new bug being introduced.
- End every task by committing. Commit messages end with the repo's trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Carry `edgeCompliance` through the save path

**Files:**
- Modify: `app-frontend/src/types/cadastral.ts` (`BeaconComparisonConfig` interface, ~line 283-309)
- Modify: `app-frontend/src/composables/useFoundBeaconsComparison.ts`
- Test: `app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts`

**Interfaces:**
- Consumes: nothing new (the `edgeCompliance()`/`surveyAdjustmentStore.js` computation already
  exists and is not touched by this task).
- Produces:
  - `BeaconComparisonConfig.edgeCompliance?: { surveyClass: 'B' | 'C'; rows: EdgeRow[]; summary: EdgeSummary }`
    (replaces the unused `interBeaconChecks` field), where
    `EdgeRow = { from: string; to: string; dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean; brgH: number; brgS: number; dirDiffSec: number; dirAllowSec: number; dirOk: boolean; pass: boolean }`
    and `EdgeSummary = { totalLines: number; distPass: number; dirPass: number; bothPass: number; meanScale: number | null; meanSwingDeg: number | null }`.
  - `EngineResult` (in `useFoundBeaconsComparison.ts`) gains `edges?: { rows: EdgeRow[]; summary: EdgeSummary }` and `surveyClass?: 'B' | 'C'` — matching `surveyAdjustmentStore.js`'s own `result.edges`/`result.surveyClass` shape exactly (sibling fields, not nested).
  - `buildComparisonConfig(points, result, opts)` populates `edgeCompliance` from `result.edges`/`result.surveyClass` when both are present; omits the field otherwise (undefined `result`, or a `result` with no `edges`).

- [ ] **Step 1: Write the failing tests**

Append to `app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts`:

```ts
describe('buildComparisonConfig — edgeCompliance carry-through', () => {
  const edgeRow = {
    from: '86B', to: '87A', dH: 67.19, dS: 67.21, dDiff: 0.02, dAllow: 0.05, distOk: true,
    brgH: 130.5, brgS: 130.502, dirDiffSec: 7.2, dirAllowSec: 45.0, dirOk: true, pass: true,
  }
  const edgeSummary = { totalLines: 1, distPass: 1, dirPass: 1, bothPass: 1, meanScale: 1.0003, meanSwingDeg: 0.002 }

  it('populates edgeCompliance from result.edges + result.surveyClass when present', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [{ id: 1, name: '86B', finalStatus: 'ACCEPT' as const }, { id: 2, name: '87A', finalStatus: 'ACCEPT' as const }],
      edges: { rows: [edgeRow], summary: edgeSummary },
      surveyClass: 'B',
    })
    expect(cfg.edgeCompliance).toEqual({ surveyClass: 'B', rows: [edgeRow], summary: edgeSummary })
  })

  it('omits edgeCompliance when result has no edges', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [{ id: 1, name: '86B', finalStatus: 'ACCEPT' as const }],
    })
    expect(cfg.edgeCompliance).toBeUndefined()
  })

  it('omits edgeCompliance when result is null', () => {
    const cfg = buildComparisonConfig(points, null)
    expect(cfg.edgeCompliance).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/useFoundBeaconsComparison.test.ts`
Expected: FAIL — `cfg.edgeCompliance` is `undefined` in the first test (property doesn't exist
yet on the return value), so `toEqual` fails; TypeScript will also flag `edges`/`surveyClass`
as unknown properties on the `EngineResult`-shaped object literal until Step 3 lands.

- [ ] **Step 3: Update the type**

In `app-frontend/src/types/cadastral.ts`, replace:

```ts
  /** Inter-beacon checks (for sketch method) */
  interBeaconChecks?: {
    beaconPair: [string, string]; // e.g., ["85c", "84a"]
    originalDistance?: number;
    newDistance?: number;
    distanceDifference?: number;
    originalBearing?: number;
    newBearing?: number;
    bearingDifference?: number;
  }[];
```

with:

```ts
  /** SI 727 s.67(5) inter-beacon (edge) compliance — distance AND direction/swing checks for
   *  every pair of accepted beacons. Source of truth for the comparison sketch. Populated
   *  from si727.js's edgeCompliance(), already computed by every comparison run. */
  edgeCompliance?: {
    surveyClass: 'B' | 'C';
    rows: Array<{
      from: string; to: string;
      dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean;
      brgH: number; brgS: number; dirDiffSec: number; dirAllowSec: number; dirOk: boolean;
      pass: boolean;
    }>;
    summary: {
      totalLines: number; distPass: number; dirPass: number; bothPass: number;
      meanScale: number | null; meanSwingDeg: number | null;
    };
  };
```

- [ ] **Step 4: Update `useFoundBeaconsComparison.ts`**

Replace the `EngineResult` interface:

```ts
export interface EngineResult {
  pts: Array<{ id: number; name: string; finalStatus: 'ACCEPT' | 'REJECT' }>
  /** Posteriori unit-weight standard error from the Helmert adjustment (metres). */
  adj?: { stats?: { s0?: number } }
}
```

with:

```ts
export interface EdgeRow {
  from: string; to: string
  dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean
  brgH: number; brgS: number; dirDiffSec: number; dirAllowSec: number; dirOk: boolean
  pass: boolean
}
export interface EdgeSummary {
  totalLines: number; distPass: number; dirPass: number; bothPass: number
  meanScale: number | null; meanSwingDeg: number | null
}
export interface EngineResult {
  pts: Array<{ id: number; name: string; finalStatus: 'ACCEPT' | 'REJECT' }>
  /** Posteriori unit-weight standard error from the Helmert adjustment (metres). */
  adj?: { stats?: { s0?: number } }
  /** SI 727 s.67(5) inter-beacon edge compliance (si727.js's edgeCompliance() result). */
  edges?: { rows: EdgeRow[]; summary: EdgeSummary }
  surveyClass?: 'B' | 'C'
}
```

In `buildComparisonConfig`, add the `edgeCompliance` field to the returned object:

```ts
export function buildComparisonConfig(
  points: StorePoint[],
  result: EngineResult | null,
  opts: { method?: 'tabulation' | 'sketch' | 'both'; toleranceThreshold?: number } = {},
): BeaconComparisonConfig {
  const rejected = (result?.pts ?? []).filter((r) => r.finalStatus === 'REJECT').map((r) => r.name)
  const conclusion = rejected.length === 0
    ? 'From the above comparison, I adopt the positions of all found beacons.'
    : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}, ${rejected.length === 1 ? 'flagged as an outlier' : 'flagged as outliers'} by the Section 67(5) W-test.`
  const s0 = result?.adj?.stats?.s0
  const adjustmentSummary =
    '4-parameter Helmert least-squares, W-test data snooping @ 99% confidence'
    + (typeof s0 === 'number' && Number.isFinite(s0) ? `, posteriori σ₀ = ${s0.toFixed(4)} m` : '')
  return {
    method: opts.method ?? 'tabulation',
    currentSRNumber: '',
    toleranceThreshold: opts.toleranceThreshold ?? 0.02,
    adjustmentSummary,
    conclusion,
    ...(result?.edges ? {
      edgeCompliance: {
        surveyClass: result.surveyClass ?? 'B',
        rows: result.edges.rows,
        summary: result.edges.summary,
      },
    } : {}),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/useFoundBeaconsComparison.test.ts`
Expected: PASS (existing 7 tests + 3 new).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/types/cadastral.ts app-frontend/src/composables/useFoundBeaconsComparison.ts app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts
git commit -m "feat(beacon-comparison): carry SI 727 edge compliance through to the saved assessment

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pure sketch layout helpers

**Files:**
- Create: `app-frontend/src/utils/beaconComparisonSketchLayout.ts`
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts`

**Interfaces:**
- Consumes: nothing (pure geometry, no imports beyond what it defines).
- Produces:
  - `computeExtent(points: Array<{y: number, x: number}>) -> {minY, maxY, minX, maxX}`
  - `pickSketchScale(extent, areaMm: {width, height}) -> {denom: number, label: string}`
  - `makeSketchTransform(extent, areaMm, denom, originMm: {x, y}) -> (pt: {y, x}) => {mmX, mmY}`
  - `midpointOffset(a: {mmX, mmY}, b: {mmX, mmY}, offsetMm: number, side?: 1 | -1) -> {mmX, mmY}`

- [ ] **Step 1: Write the failing tests**

```ts
// app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts
import { describe, it, expect } from 'vitest'
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset } from '../beaconComparisonSketchLayout'

describe('computeExtent', () => {
  it('returns the min/max Y and X across all points', () => {
    const ext = computeExtent([{ y: 10, x: 100 }, { y: 30, x: 80 }, { y: 20, x: 120 }])
    expect(ext).toEqual({ minY: 10, maxY: 30, minX: 80, maxX: 120 })
  })

  it('handles a single point (zero extent, no crash)', () => {
    expect(computeExtent([{ y: 5, x: 5 }])).toEqual({ minY: 5, maxY: 5, minX: 5, maxX: 5 })
  })
})

describe('pickSketchScale', () => {
  it('picks the smallest ladder denominator whose ground extent fits the area', () => {
    // 20m x 20m extent; at 1:100 that's 200mm x 200mm — too big for a 150x100mm area.
    // At 1:200 that's 100mm x 100mm — fits.
    const extent = { minY: 0, maxY: 20, minX: 0, maxX: 20 }
    const { denom, label } = pickSketchScale(extent, { width: 150, height: 100 })
    expect(denom).toBe(200)
    expect(label).toBe('1 : 200')
  })

  it('falls back to the largest ladder denominator when nothing fits', () => {
    const extent = { minY: 0, maxY: 100000, minX: 0, maxX: 100000 }
    const { denom } = pickSketchScale(extent, { width: 150, height: 100 })
    expect(denom).toBe(5000) // largest rung on the ladder
  })

  it('does not divide by zero for a degenerate (zero-width) extent', () => {
    const extent = { minY: 5, maxY: 5, minX: 0, maxX: 20 }
    expect(() => pickSketchScale(extent, { width: 150, height: 100 })).not.toThrow()
  })
})

describe('makeSketchTransform', () => {
  it('maps the extent corners into the area, north-up and east-right, centred', () => {
    const extent = { minY: 0, maxY: 10, minX: 0, maxX: 10 } // 10m x 10m
    const denom = 100 // 1:100 -> 10m = 100mm exactly the area size
    const areaMm = { width: 100, height: 100 }
    const origin = { x: 20, y: 30 }
    const tf = makeSketchTransform(extent, areaMm, denom, origin)
    // Most-west (maxY) -> left edge; most-east (minY) -> right edge (east-right convention).
    const west = tf({ y: 10, x: 0 })  // maxY, minX
    const east = tf({ y: 0, x: 0 })   // minY, minX
    expect(west.mmX).toBeCloseTo(origin.x, 6)
    expect(east.mmX).toBeCloseTo(origin.x + 100, 6)
    // North up: X is Southing (larger X = further south), and jsPDF's own Y already
    // increases downward — mapping X directly to mmY with no flip means minX (the
    // NORTHERNMOST point, smallest Southing) lands at the smallest mmY (top of the
    // area), and maxX (southernmost) lands at the largest mmY (bottom). That is
    // "north at the top", matching how a surveyor reads a plan.
    const northMost = tf({ y: 0, x: 0 })  // x = minX
    const southMost = tf({ y: 0, x: 10 }) // x = maxX
    expect(northMost.mmY).toBeCloseTo(origin.y, 6)
    expect(southMost.mmY).toBeCloseTo(origin.y + 100, 6)
  })

  it('centres a smaller extent within a larger area', () => {
    const extent = { minY: 0, maxY: 5, minX: 0, maxX: 5 } // 5m x 5m
    const denom = 100 // -> 50mm x 50mm drawing
    const areaMm = { width: 100, height: 100 } // 50mm of slack each axis -> 25mm each side
    const origin = { x: 0, y: 0 }
    const tf = makeSketchTransform(extent, areaMm, denom, origin)
    const center = tf({ y: 2.5, x: 2.5 })
    expect(center.mmX).toBeCloseTo(50, 6)
    expect(center.mmY).toBeCloseTo(50, 6)
  })
})

describe('midpointOffset', () => {
  it('offsets perpendicular to the ray, at the requested distance, from the true midpoint', () => {
    const a = { mmX: 0, mmY: 0 }
    const b = { mmX: 10, mmY: 0 } // horizontal ray
    const p = midpointOffset(a, b, 2, 1)
    // Perpendicular to a horizontal ray is vertical; midpoint x stays 5.
    expect(p.mmX).toBeCloseTo(5, 6)
    expect(Math.abs(p.mmY)).toBeCloseTo(2, 6)
  })

  it('side=-1 offsets to the opposite side from side=1', () => {
    const a = { mmX: 0, mmY: 0 }
    const b = { mmX: 10, mmY: 0 }
    const p1 = midpointOffset(a, b, 2, 1)
    const p2 = midpointOffset(a, b, 2, -1)
    expect(p1.mmY).toBeCloseTo(-p2.mmY, 6)
  })

  it('does not divide by zero for coincident points', () => {
    const p = { mmX: 3, mmY: 4 }
    expect(() => midpointOffset(p, p, 2)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: FAIL — `Cannot find module '../beaconComparisonSketchLayout'`.

- [ ] **Step 3: Write the implementation**

```ts
// app-frontend/src/utils/beaconComparisonSketchLayout.ts
/**
 * Pure geometry/scale helpers for the SI 727 s.67(5) beacon comparison sketch. No jsPDF
 * import — the drawing calls live in beaconComparisonSection.ts; this module only computes
 * positions in millimetres.
 *
 * Coordinate convention matches the rest of this app (Cape Lo Y=Westing, X=Southing):
 * east-right (most-west Y maps left, most-east Y maps right), north-up (increasing
 * Southing X maps down the page in ground terms, but since jsPDF's own Y axis already
 * increases downward the same way this app's PDF pages do, mapping X directly to mmY
 * with no flip keeps "north up" — i.e. the LOWEST X value ends up at the TOP of the
 * sketch area, matching how a surveyor reads north as up on a plan).
 */

export interface ExtentM { minY: number; maxY: number; minX: number; maxX: number }
export interface AreaMm { width: number; height: number }
export interface PointMm { mmX: number; mmY: number }

const SCALE_LADDER = [100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000]

export function computeExtent(points: Array<{ y: number; x: number }>): ExtentM {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const p of points) {
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
  }
  return { minY, maxY, minX, maxX }
}

export function pickSketchScale(extent: ExtentM, areaMm: AreaMm): { denom: number; label: string } {
  const widthM = extent.maxY - extent.minY
  const heightM = extent.maxX - extent.minX
  const fits = (denom: number) =>
    (widthM / denom) * 1000 <= areaMm.width && (heightM / denom) * 1000 <= areaMm.height
  const denom = SCALE_LADDER.find(fits) ?? SCALE_LADDER[SCALE_LADDER.length - 1]
  return { denom, label: `1 : ${denom}` }
}

export function makeSketchTransform(
  extent: ExtentM, areaMm: AreaMm, denom: number, originMm: { x: number; y: number },
): (pt: { y: number; x: number }) => PointMm {
  const widthM = extent.maxY - extent.minY || 1
  const heightM = extent.maxX - extent.minX || 1
  const drawWmm = (widthM / denom) * 1000
  const drawHmm = (heightM / denom) * 1000
  const ox = originMm.x + (areaMm.width - drawWmm) / 2
  const oy = originMm.y + (areaMm.height - drawHmm) / 2
  return (pt) => ({
    mmX: ox + ((extent.maxY - pt.y) / widthM) * drawWmm,
    mmY: oy + ((pt.x - extent.minX) / heightM) * drawHmm,
  })
}

export function midpointOffset(a: PointMm, b: PointMm, offsetMm: number, side: 1 | -1 = 1): PointMm {
  const dx = b.mmX - a.mmX, dy = b.mmY - a.mmY
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  const mx = (a.mmX + b.mmX) / 2, my = (a.mmY + b.mmY) / 2
  return { mmX: mx + nx * offsetMm * side, mmY: my + ny * offsetMm * side }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonSketchLayout.ts app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts
git commit -m "feat(beacon-comparison): pure layout helpers for the comparison sketch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: The sketch renderer, wired into the shared comparison block

**Files:**
- Modify: `app-frontend/src/utils/beaconComparisonSection.ts`
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`

**Interfaces:**
- Consumes: `computeExtent`, `pickSketchScale`, `makeSketchTransform`, `midpointOffset` (Task 2);
  `formatDMS` from `app-frontend/src/utils/surveyMath.js`; `checkPageBreak` (already private in
  this file); `BeaconComparisonConfig.edgeCompliance` (Task 1).
- Produces: no new exports — `renderBeaconComparisonSketch` is module-private, called only from
  `renderBeaconComparison` (already exported, already the shared entry point both report
  callers use).

- [ ] **Step 1: Write the failing tests**

Append to `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`. First, extend the
shared fixture with a second beacon and an `edgeCompliance` block (add this near the top of the
file, after the existing `makeReportData` function, as a second helper so the existing tests'
fixture stays untouched):

```ts
function makeReportDataWithEdges(): ReportOnSurveyData {
  const base = makeReportData();
  base.beacons = [
    ...base.beacons,
    {
      beaconId: '86B',
      status: 'found',
      currentCoordinates: { y: 50060.2, x: 2200050.3 },
      originalData: { coordinates: { y: 50060.19, x: 2200050.28 }, srNumber: 'SR 21/2016', source: 'previous-survey' },
      discrepancy: { dy: 0.01, dx: 0.02, distance: 0.022 },
    },
  ];
  base.beaconComparison!.edgeCompliance = {
    surveyClass: 'B',
    rows: [
      {
        from: '85c', to: '86B', dH: 67.19, dS: 67.21, dDiff: 0.02, dAllow: 0.05, distOk: true,
        brgH: 130.5, brgS: 130.502, dirDiffSec: 7.2, dirAllowSec: 45.0, dirOk: true, pass: true,
      },
    ],
    summary: { totalLines: 1, distPass: 1, dirPass: 1, bothPass: 1, meanScale: 1.0003, meanSwingDeg: 0.002 },
  };
  return base;
}

function makeReportDataWithFailingEdge(): ReportOnSurveyData {
  const data = makeReportDataWithEdges();
  data.beaconComparison!.edgeCompliance!.rows[0] = {
    ...data.beaconComparison!.edgeCompliance!.rows[0],
    distOk: false, dirOk: false, pass: false,
  };
  return data;
}
```

Then append the test cases:

```ts
describe('renderBeaconComparisonSketch (via renderBeaconComparison)', () => {
  it('renders the sketch heading, scale caption, beacon names and distance figures when edgeCompliance is present', () => {
    const { written } = renderCapturing(makeReportDataWithEdges());
    expect(written).toContain('BEACON COMPARISON SKETCH');
    expect(written.some((w) => w.startsWith('Scale 1 : '))).toBe(true);
    expect(written).toContain('85c');
    expect(written).toContain('86B');
    expect(written).toContain('67.190'); // historical distance
    expect(written).toContain('67.210'); // survey distance
    expect(written.some((w) => /SI 727 Class B/.test(w))).toBe(true);
  });

  it('does nothing (no crash, no sketch heading) when edgeCompliance is absent', () => {
    const { written } = renderCapturing(makeReportData());
    expect(written).not.toContain('BEACON COMPARISON SKETCH');
  });

  it('does nothing when edgeCompliance has zero rows', () => {
    const data = makeReportDataWithEdges();
    data.beaconComparison!.edgeCompliance!.rows = [];
    const { written } = renderCapturing(data);
    expect(written).not.toContain('BEACON COMPARISON SKETCH');
  });

  it('still renders (no crash) when a failing edge is present, distinct from the passing case', () => {
    const { written } = renderCapturing(makeReportDataWithFailingEdge());
    expect(written).toContain('BEACON COMPARISON SKETCH');
    expect(written).toContain('67.190');
    expect(written).toContain('67.210');
  });

  it('advances the cursor past the tabulation position', () => {
    const { cursor: cursorWithSketch } = renderCapturing(makeReportDataWithEdges());
    const { cursor: cursorWithoutSketch } = renderCapturing(makeReportData());
    expect(cursorWithSketch.y).toBeGreaterThan(cursorWithoutSketch.y);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`
Expected: FAIL — `renderBeaconComparisonSketch` doesn't exist yet, so `'BEACON COMPARISON
SKETCH'` never appears in `written`.

- [ ] **Step 3: Add the import and the sketch renderer**

At the top of `app-frontend/src/utils/beaconComparisonSection.ts`, add:

```ts
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset } from './beaconComparisonSketchLayout';
import { formatDMS } from './surveyMath.js';
```

Add this function after `renderBeaconComparisonTable` (and before the closing of the file, or
anywhere at module scope — it is called from `renderBeaconComparison` below):

```ts
const SKETCH_HEIGHT_MM = 140;
const RED: [number, number, number] = [220, 0, 0];
const BLACK: [number, number, number] = [0, 0, 0];

function renderBeaconComparisonSketch(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData,
): void {
  const comparison = reportData.beaconComparison;
  const ec = comparison?.edgeCompliance;
  if (!ec || ec.rows.length === 0) return;

  // Resolve each ray endpoint to its beacon's HISTORICAL position — the ray geometry is the
  // nominal network; the actual discrepancy is expressed entirely through the annotations.
  const byName = new Map<string, { y: number; x: number }>();
  for (const b of reportData.beacons || []) {
    if (b.originalData?.coordinates) byName.set(b.beaconId, b.originalData.coordinates);
  }
  const names = new Set<string>();
  for (const row of ec.rows) { names.add(row.from); names.add(row.to); }
  const points = Array.from(names)
    .map((name) => ({ name, pt: byName.get(name) }))
    .filter((p): p is { name: string; pt: { y: number; x: number } } => !!p.pt);
  if (points.length < 2) return;

  checkPageBreak(cursor, SKETCH_HEIGHT_MM + 20);

  const areaWidth = cursor.pageWidth - cursor.margin * 2;
  const extent = computeExtent(points.map((p) => p.pt));
  const areaMm = { width: areaWidth, height: SKETCH_HEIGHT_MM - 20 };
  const { denom, label } = pickSketchScale(extent, areaMm);

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(10);
  cursor.doc.setTextColor(...BLACK);
  cursor.doc.text('BEACON COMPARISON SKETCH', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(8);
  cursor.doc.text(`Scale ${label}`, cursor.margin, cursor.y);

  // North arrow, top-right of the sketch band.
  const naX = cursor.pageWidth - cursor.margin - 8;
  const naYTop = cursor.y - 3;
  const naYBottom = naYTop + 10;
  cursor.doc.setDrawColor(...BLACK);
  cursor.doc.setLineWidth(0.2);
  cursor.doc.line(naX, naYBottom, naX, naYTop);
  cursor.doc.line(naX - 1.5, naYTop + 3, naX, naYTop);
  cursor.doc.line(naX + 1.5, naYTop + 3, naX, naYTop);
  cursor.doc.setFontSize(6);
  cursor.doc.text('N', naX + 2, naYTop + 1);

  cursor.y += cursor.lineHeight;
  const sketchTop = cursor.y;
  const originMm = { x: cursor.margin, y: sketchTop };
  const transform = makeSketchTransform(extent, areaMm, denom, originMm);
  const positioned = new Map(points.map((p) => [p.name, transform(p.pt)]));

  // Rays — always plain black, drawn before annotations so text sits on top.
  cursor.doc.setDrawColor(...BLACK);
  cursor.doc.setLineWidth(0.2);
  for (const row of ec.rows) {
    const a = positioned.get(row.from);
    const b = positioned.get(row.to);
    if (!a || !b) continue;
    cursor.doc.line(a.mmX, a.mmY, b.mmX, b.mmY);
  }

  // Beacon circles + outward-offset name labels.
  const cx = points.reduce((s, p) => s + (positioned.get(p.name)?.mmX ?? 0), 0) / points.length;
  const cy = points.reduce((s, p) => s + (positioned.get(p.name)?.mmY ?? 0), 0) / points.length;
  cursor.doc.setFontSize(8);
  cursor.doc.setTextColor(...BLACK);
  for (const p of points) {
    const pos = positioned.get(p.name)!;
    cursor.doc.setDrawColor(...BLACK);
    cursor.doc.circle(pos.mmX, pos.mmY, 1.5, 'S');
    let ux = pos.mmX - cx, uy = pos.mmY - cy;
    const ulen = Math.hypot(ux, uy) || 1;
    ux /= ulen; uy /= ulen;
    cursor.doc.text(p.name, pos.mmX + ux * 4, pos.mmY + uy * 4);
  }

  // Per-ray annotations: historical distance (black), survey distance (red), swing (black),
  // stacked beside the ray midpoint, alternating sides to reduce overlap in a dense network.
  cursor.doc.setFontSize(6);
  ec.rows.forEach((row, idx) => {
    const a = positioned.get(row.from);
    const b = positioned.get(row.to);
    if (!a || !b) return;
    const side: 1 | -1 = idx % 2 === 0 ? 1 : -1;
    const base = midpointOffset(a, b, 2.5, side);

    const histText = row.dH.toFixed(3);
    const survText = row.dS.toFixed(3);
    const swingText = formatDMS(row.dirDiffSec / 3600);

    cursor.doc.setTextColor(...BLACK);
    cursor.doc.text(histText, base.mmX, base.mmY);
    cursor.doc.setTextColor(...RED);
    cursor.doc.text(survText, base.mmX, base.mmY + 2.2);
    cursor.doc.setTextColor(...BLACK);
    cursor.doc.text(swingText, base.mmX, base.mmY + 4.4);

    if (!row.distOk) {
      const w = cursor.doc.getTextWidth(survText);
      cursor.doc.setDrawColor(...RED);
      cursor.doc.setLineWidth(0.15);
      cursor.doc.ellipse(base.mmX + w / 2, base.mmY + 2.2 - 1, w / 2 + 1, 1.8, 'S');
    }
    if (!row.dirOk) {
      const w = cursor.doc.getTextWidth(swingText);
      cursor.doc.setDrawColor(...RED);
      cursor.doc.setLineWidth(0.15);
      cursor.doc.ellipse(base.mmX + w / 2, base.mmY + 4.4 - 1, w / 2 + 1, 1.8, 'S');
    }
  });

  cursor.y = sketchTop + areaMm.height + 6;

  cursor.doc.setTextColor(...BLACK);
  cursor.doc.setFontSize(8);
  cursor.doc.text('Black = historical, Red = current survey, Circled = outside SI 727 tolerance', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight;

  const s = ec.summary;
  cursor.doc.text(
    `SI 727 Class ${ec.surveyClass} · ${s.bothPass} of ${s.totalLines} lines pass both checks`,
    cursor.margin, cursor.y,
  );
  cursor.y += cursor.lineHeight + 3;
}
```

- [ ] **Step 4: Call it from `renderBeaconComparison`**

Find this line near the end of the exported `renderBeaconComparison` function (before the
`conclusion` block):

```ts
  if (comparison.method === 'tabulation' || comparison.method === 'both') {
    renderBeaconComparisonTable(cursor, reportData);
  }
```

Add the sketch call immediately after it:

```ts
  if (comparison.method === 'tabulation' || comparison.method === 'both') {
    renderBeaconComparisonTable(cursor, reportData);
  }

  renderBeaconComparisonSketch(cursor, reportData);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`
Expected: PASS (existing 7 tests + 5 new).

- [ ] **Step 6: Run the full frontend suite to confirm no regressions**

Run: `cd app-frontend && npm test`
Expected: all suites green. (The pre-existing `coordinate-list` and `parcelDetection` suite
failures noted in this repo's history are unrelated to this change; any OTHER failure is a
regression to investigate.)

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonSection.ts app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts
git commit -m "feat(beacon-comparison): render the SI 727 s.67(5) comparison sketch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Data carry-through from the already-live `edgeCompliance()` result → Task 1. ✓
- Pure scale/transform/offset helpers, page-fit auto-scale → Task 2. ✓
- All-pairs rays, always black → Task 3 (rays drawn once, colour never changes per-row). ✓
- Historical distance black / survey distance red, swing shown per ray → Task 3. ✓
- Failing figures circled in red (distance and/or direction independently) → Task 3
  (`!row.distOk` / `!row.dirOk` branches, each its own ellipse). ✓
- Always rendered alongside tabulation, no method picker → Task 3 Step 4 (unconditional call,
  no `method` guard). ✓
- North arrow, "Scale 1 : N" caption, legend, SI 727 class + pass-count summary → Task 3. ✓
- No backend changes, no new UI control → confirmed; no such files appear in any task. ✓

**Placeholder scan:** No TBD/TODO; every step has complete, runnable code.

**Type/signature consistency:** `EdgeRow`/`EdgeSummary` field names are identical across
Task 1's type definition, `EngineResult`, and `BeaconComparisonConfig.edgeCompliance`, and
Task 3 consumes exactly those field names (`row.dH`, `row.dS`, `row.distOk`, `row.dirOk`,
`row.dirDiffSec`, `ec.surveyClass`, `ec.summary.bothPass`, `ec.summary.totalLines`) with no
renaming. `pickSketchScale`/`makeSketchTransform`/`midpointOffset`/`computeExtent` signatures
defined in Task 2 are used identically in Task 3.

**Scope check:** Single, focused frontend feature — 3 tasks, proportionate to the change
(one data-plumbing task, one pure-math task, one rendering task). No decomposition into
separate plans needed.

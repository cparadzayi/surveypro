# Beacon Sketch Paper Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SI 727 §67(5) comparison sketch (`beaconAdjustmentReport.js`) automatically choose the smallest ISO paper size and best orientation that renders every ray and every annotation with zero overlaps (ray-vs-annotation and annotation-vs-annotation), escalating A4→A3→A2→A1→A0 and falling back to the least-bad candidate only if even A0 can't reach zero.

**Architecture:** The sketch's layout math (scale selection, beacon positions, ray curves, annotation placement) moves out of `addEdgeComplianceSketch` into a new pure, page-size-agnostic function, `computeSketchLayout`, in `beaconComparisonSketchLayout.ts`. `addEdgeComplianceSketch` calls it once per candidate (page size × orientation) as a cheap dry run — no jsPDF page or drawing involved — keeps the lowest-violation result, and only then draws the winning candidate's already-computed geometry for real.

**Tech Stack:** Vue 3 + TypeScript/JS frontend, jsPDF 3, Vitest.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-04-beacon-sketch-paper-sizing-design.md`.
- Paper ladder: ISO A4 → A3 → A2 → A1 → A0, both orientations at each size (10 candidates total), smallest sheet first. Standard ISO mm dimensions: A4 210×297, A3 297×420, A2 420×594, A1 594×841, A0 841×1189.
- Colours/curves/annotation text format are all already shipped and unaffected by this plan — do not change them, only *where* they end up drawn.
- Scope: only `beaconComparisonSketchLayout.ts`, `beaconAdjustmentReport.js`, and their test files. No DXF work (a separate, later sub-project).
- No general graph-layout/crossing-minimisation algorithm — placement stays the existing deterministic, sequential, greedy nearest-clear-spot search, just with a second exclusion set (prior annotations) added to it.

---

### Task 1: `rectsOverlap` + extend `findClearAnchor` to also avoid prior annotations

**Files:**
- Modify: `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (add `rectsOverlap` after `polylineIntersectsRect`, currently ending at line 134; extend `findClearAnchor`, currently lines 144-157)
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (append)

**Interfaces:**
- Consumes: existing `RectMm`, `PointMm`, `boxAtAnchor`, `polylineIntersectsRect`, `midpointOffset` (same file).
- Produces: `rectsOverlap(r1: RectMm, r2: RectMm): boolean` (exported). `findClearAnchor`'s signature gains one new **trailing, defaulted** parameter: `otherRects: RectMm[] = []` — appended *after* the existing `maxOffsetMm = 30` parameter, not inserted earlier, so every existing positional call site and test keeps working unchanged. Used by Task 2's `computeSketchLayout`.

- [ ] **Step 1: Write the failing tests**

Append to `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (update the import line first):

```ts
import {
  computeExtent, pickSketchScale, makeSketchTransform, midpointOffset,
  sampleCubicBezier, curveControlPoints, boxAtAnchor, pointInRect,
  segmentsIntersect, polylineIntersectsRect, findClearAnchor, computeDrawSizeMm,
  rectsOverlap,
} from '../beaconComparisonSketchLayout'
```

Then append at the end of the file:

```ts
describe('rectsOverlap', () => {
  it('detects overlapping rectangles', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 15, y1: 15 })).toBe(true)
  })

  it('returns false for rectangles that do not touch', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 20, y0: 20, x1: 30, y1: 30 })).toBe(false)
  })

  it('treats exactly touching edges as overlapping (inclusive boundary)', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(true)
  })
})

describe('findClearAnchor with otherRects', () => {
  it('avoids a previously-placed annotation rectangle even when no ray polyline blocks it', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    // Sits exactly where the minimum-offset (offset=3, side=1) anchor's box would land
    // (boxAtAnchor((5,3), 2, 2) === {x0:4, y0:0.8, x1:8, y1:6}) -- no ray polylines
    // involved at all, so this can only be avoided via the new otherRects exclusion set.
    const blockingRect = { x0: 4, y0: 0.8, x1: 8, y1: 6 }
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [], 2.5, 30, [blockingRect])
    expect(anchor.mmY).toBeGreaterThan(3)
  })

  it('still works with otherRects omitted (existing callers unaffected)', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [], 2.5, 30)
    expect(anchor.mmY).toBeCloseTo(3, 6)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: FAIL — `rectsOverlap` is not exported, and `findClearAnchor` called with 10 arguments doesn't yet honour the 10th.

- [ ] **Step 3: Implement**

In `app-frontend/src/utils/beaconComparisonSketchLayout.ts`, add this new function right after `polylineIntersectsRect` (currently ending at line 134), before the `findClearAnchor` comment block:

```ts
export function rectsOverlap(r1: RectMm, r2: RectMm): boolean {
  return r1.x0 <= r2.x1 && r2.x0 <= r1.x1 && r1.y0 <= r2.y1 && r2.y0 <= r1.y1
}
```

Then replace the existing `findClearAnchor` function (lines 144-157) with:

```ts
// Searches outward from ray a->b, starting at minOffsetMm on the preferred side, in
// stepMm increments up to maxOffsetMm, then retries the same range on the opposite side,
// for the first anchor whose text bounding box (boxWidthMm x boxHeightMm) clears every
// polyline in otherPolylines AND every rectangle in otherRects (previously-placed
// annotations, when supplied). Falls back to the minimum offset on the preferred side if
// no clear position is found (a documented best-effort limit for pathologically dense
// clusters of near-coincident edges) -- deliberately the closest position to the ray it
// labels, not the farthest tried, so a mislabeled-looking annotation still sits next to
// its own ray rather than floating unattached near an unrelated one.
export function findClearAnchor(
  a: PointMm, b: PointMm, side: 1 | -1, minOffsetMm: number,
  boxWidthMm: number, boxHeightMm: number, otherPolylines: PointMm[][],
  stepMm = 2.5, maxOffsetMm = 30, otherRects: RectMm[] = [],
): PointMm {
  for (const trySide of [side, (side * -1) as 1 | -1]) {
    for (let offset = minOffsetMm; offset <= maxOffsetMm; offset += stepMm) {
      const anchor = midpointOffset(a, b, offset, trySide)
      const rect = boxAtAnchor(anchor, boxWidthMm, boxHeightMm)
      const clearOfRays = !otherPolylines.some((poly) => polylineIntersectsRect(poly, rect))
      const clearOfRects = !otherRects.some((other) => rectsOverlap(rect, other))
      if (clearOfRays && clearOfRects) return anchor
    }
  }
  return midpointOffset(a, b, minOffsetMm, side)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonSketchLayout.ts app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts
git commit -m "feat(beacon-comparison): add rectsOverlap, extend findClearAnchor to avoid prior annotations"
```

---

### Task 2: `computeSketchLayout` — pure, page-size-agnostic sketch geometry

**Files:**
- Modify: `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (append after `findClearAnchor`)
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (append)

**Interfaces:**
- Consumes: `computeExtent`, `pickSketchScale`, `computeDrawSizeMm`, `makeSketchTransform`, `curveControlPoints`, `sampleCubicBezier`, `findClearAnchor` (extended, Task 1), `boxAtAnchor`, `polylineIntersectsRect`, `rectsOverlap` (Task 1) — all same file.
- Produces (exported): `SketchEdgeGeom`, `SketchAnnotationPlacement`, `SketchLayoutResult` interfaces, and
  `computeSketchLayout(points, edgeSpecs, boxOrigin, maxAreaMm, measureText): SketchLayoutResult`.
  Consumed by Task 3 (`addEdgeComplianceSketch`), both for cheap paper-size trials and for
  the final real render (same call, same result reused for both).

- [ ] **Step 1: Write the failing tests**

Append to `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (update the import line):

```ts
import {
  computeExtent, pickSketchScale, makeSketchTransform, midpointOffset,
  sampleCubicBezier, curveControlPoints, boxAtAnchor, pointInRect,
  segmentsIntersect, polylineIntersectsRect, findClearAnchor, computeDrawSizeMm,
  rectsOverlap, computeSketchLayout,
} from '../beaconComparisonSketchLayout'
```

Then append:

```ts
describe('computeSketchLayout', () => {
  const measureText = (s: string) => s.length * 1.2
  const line1 = '10.000 -> 10.000 (+0.000)'
  const line2 = "0°00'00.0\" -> 0°00'00.0\" (0°00'00.0\")"

  it('reports zero violations for a small, well-spaced network', () => {
    const points = [
      { name: 'A', pt: { y: 0, x: 0 } },
      { name: 'B', pt: { y: 100, x: 0 } },
      { name: 'C', pt: { y: 50, x: 100 } },
    ]
    const edgeSpecs = [
      { from: 'A', to: 'B', line1, line2 },
      { from: 'A', to: 'C', line1, line2 },
      { from: 'B', to: 'C', line1, line2 },
    ]
    const layout = computeSketchLayout(points, edgeSpecs, { x: 0, y: 0 }, { width: 400, height: 400 }, measureText)
    expect(layout.violations).toBe(0)
    expect(layout.edgeGeom.every((g) => g !== null)).toBe(true)
    expect(layout.annotations.every((ann) => ann !== null)).toBe(true)
    expect(layout.positioned.size).toBe(3)
  })

  it('reports a nonzero violation count for a dense, over-crowded network', () => {
    const N = 15
    const points = Array.from({ length: N }, (_, i) => ({
      name: `P${i}`,
      pt: { y: (i % 5) * 20, x: Math.floor(i / 5) * 20 },
    }))
    const edgeSpecs: Array<{ from: string; to: string; line1: string; line2: string }> = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) edgeSpecs.push({ from: points[i].name, to: points[j].name, line1, line2 })
    }
    // 105 all-pairs edges/annotations squeezed into a 150x110mm candidate area -- far too
    // little room for every annotation to clear every ray and every other annotation.
    const layout = computeSketchLayout(points, edgeSpecs, { x: 0, y: 0 }, { width: 150, height: 110 }, measureText)
    expect(layout.violations).toBeGreaterThan(0)
  })

  it('positions edgeGeom/annotations null for a row referencing an unknown beacon name', () => {
    const points = [{ name: 'A', pt: { y: 0, x: 0 } }, { name: 'B', pt: { y: 10, x: 0 } }]
    const edgeSpecs = [{ from: 'A', to: 'MISSING', line1, line2 }]
    const layout = computeSketchLayout(points, edgeSpecs, { x: 0, y: 0 }, { width: 200, height: 200 }, measureText)
    expect(layout.edgeGeom[0]).toBeNull()
    expect(layout.annotations[0]).toBeNull()
    expect(layout.violations).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: FAIL — `computeSketchLayout` is not exported.

- [ ] **Step 3: Implement**

Append to `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (after `findClearAnchor`):

```ts
export interface SketchEdgeGeom {
  a: PointMm
  b: PointMm
  side: 1 | -1
  bowMm: number
  cp1: PointMm
  cp2: PointMm
  polyline: PointMm[]
}

export interface SketchAnnotationPlacement {
  anchor: PointMm
  rect: RectMm
}

export interface SketchLayoutResult {
  denom: number
  label: string
  boxX: number
  boxYtop: number
  boxW: number
  boxH: number
  pad: number
  positioned: Map<string, PointMm>
  edgeGeom: Array<SketchEdgeGeom | null>
  annotations: Array<SketchAnnotationPlacement | null>
  violations: number
}

const SKETCH_PAD = 16
const SKETCH_CHROME_H = 24
const SKETCH_LINE_GAP = 2.2
const SKETCH_BOX_HEIGHT = SKETCH_LINE_GAP + 3.0

// Computes the full geometry for one comparison-sketch render attempt -- beacon
// positions, per-ray curves, and every annotation's collision-avoiding placement --
// entirely independent of any real page: boxOrigin is given rather than assumed, and
// text widths come from an injected measureText callback rather than a live jsPDF
// instance. This lets a caller cheaply try several candidate page sizes (see
// docs/superpowers/plans/2026-08-04-beacon-sketch-paper-sizing.md) before committing to
// one and drawing it for real, since this function itself never draws anything.
export function computeSketchLayout(
  points: Array<{ name: string; pt: { y: number; x: number } }>,
  edgeSpecs: Array<{ from: string; to: string; line1: string; line2: string }>,
  boxOrigin: { x: number; y: number },
  maxAreaMm: AreaMm,
  measureText: (s: string) => number,
): SketchLayoutResult {
  const boxX = boxOrigin.x, boxYtop = boxOrigin.y
  const extent = computeExtent(points.map((p) => p.pt))
  const { denom, label } = pickSketchScale(extent, {
    width: maxAreaMm.width - 2 * SKETCH_PAD,
    height: maxAreaMm.height - 2 * SKETCH_PAD - SKETCH_CHROME_H,
  })
  const drawSize = computeDrawSizeMm(extent, denom)
  const boxW = Math.min(maxAreaMm.width, drawSize.width + 2 * SKETCH_PAD)
  const boxH = Math.max(60, Math.min(maxAreaMm.height, drawSize.height + 2 * SKETCH_PAD + SKETCH_CHROME_H))

  const areaMm = { width: boxW - 2 * SKETCH_PAD, height: boxH - 2 * SKETCH_PAD - SKETCH_CHROME_H }
  const originMm = { x: boxX + SKETCH_PAD, y: boxYtop + SKETCH_PAD }
  const transform = makeSketchTransform(extent, areaMm, denom, originMm)
  const positioned = new Map(points.map((p) => [p.name, transform(p.pt)]))

  const edgeGeom: Array<SketchEdgeGeom | null> = edgeSpecs.map((spec, idx) => {
    const a = positioned.get(spec.from), b = positioned.get(spec.to)
    if (!a || !b) return null
    const side: 1 | -1 = idx % 2 === 0 ? 1 : -1
    const length = Math.hypot(b.mmX - a.mmX, b.mmY - a.mmY)
    const bowMm = Math.min(4 + 3 * (idx % 3), length * 0.35)
    const { cp1, cp2 } = curveControlPoints(a, b, bowMm, side)
    return { a, b, side, bowMm, cp1, cp2, polyline: sampleCubicBezier(a, cp1, cp2, b, 10) }
  })

  let violations = 0
  const placedRects: RectMm[] = []
  const annotations: Array<SketchAnnotationPlacement | null> = edgeSpecs.map((spec, idx) => {
    const geom = edgeGeom[idx]
    if (!geom) return null
    const boxWidth = Math.max(measureText(spec.line1), measureText(spec.line2))
    const otherPolylines = edgeGeom
      .filter((g, i) => g && i !== idx)
      .map((g) => (g as SketchEdgeGeom).polyline)
    const anchor = findClearAnchor(
      geom.a, geom.b, geom.side, geom.bowMm + 1.5, boxWidth, SKETCH_BOX_HEIGHT,
      otherPolylines, 1.25, 60, placedRects,
    )
    const rect = boxAtAnchor(anchor, boxWidth, SKETCH_BOX_HEIGHT)
    const clear = !otherPolylines.some((poly) => polylineIntersectsRect(poly, rect)) &&
      !placedRects.some((other) => rectsOverlap(rect, other))
    if (!clear) violations++
    placedRects.push(rect)
    return { anchor, rect }
  })

  return { denom, label, boxX, boxYtop, boxW, boxH, pad: SKETCH_PAD, positioned, edgeGeom, annotations, violations }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: PASS (all tests, existing + new). If the "dense, over-crowded network" test unexpectedly reports 0 violations, increase `N` (e.g. to 20) and/or shrink the candidate area slightly until it reliably reports a positive count — the fixture only needs to be *clearly* over-capacity, the exact count doesn't matter.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonSketchLayout.ts app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts
git commit -m "feat(beacon-comparison): add computeSketchLayout, a pure page-size-agnostic sketch geometry function"
```

---

### Task 3: Paper-size escalation loop in `addEdgeComplianceSketch`

**Files:**
- Modify: `app-frontend/src/utils/beaconAdjustmentReport.js` (imports at line 7; `addEdgeComplianceSketch`, currently lines 369-525)
- Test: `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts` (`renderCapturing`'s `save` patch and return value; two new tests)

**Interfaces:**
- Consumes: `computeSketchLayout` (Task 2, `beaconComparisonSketchLayout.ts`).
- Produces: no new exports — `addEdgeComplianceSketch`'s externally-visible behaviour (drawn content, colours, text) is unchanged for any fixture that already fit at A4; only *which page size/orientation* gets chosen is new, observable behaviour.

- [ ] **Step 1: Update the failing tests**

In `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts`, replace the `save` patch (inside `renderCapturing`, currently `(jsPDF.API as any).save = function () { return this; };`) with:

```ts
  // jsPDF's own save() writes to the DOM in a browser; under Vitest's default environment
  // it may throw or no-op. Stub it so the report-generation call completes without a real
  // download, matching how this file is actually invoked (CompareView.vue's button handler
  // doesn't await anything after calling it either). It also runs with the sketch page
  // still "current" (addFooters only revisits pages via setPage(), ending on the last one
  // added -- the sketch page -- so this is the right moment to read its real, chosen size.
  (jsPDF.API as any).save = function () {
    sketchPageW = this.internal.pageSize.getWidth();
    sketchPageH = this.internal.pageSize.getHeight();
    return this;
  };
```

Add the two new captured variables near the top of `renderCapturing`, alongside the other `let` declarations (after `let lastMoveTo = { x: 0, y: 0 };`):

```ts
  let sketchPageW = 0, sketchPageH = 0;
```

Update the function's final `return` statement from:
```ts
  return { written, textsColored: textsColoredOnSketch, curves, ellipses };
```
to:
```ts
  return { written, textsColored: textsColoredOnSketch, curves, ellipses, sketchPageW, sketchPageH };
```

Then append two new tests, in a new `describe` block at the end of the file:

```ts
describe('addEdgeComplianceSketch paper size selection', () => {
  it('stays on A4 portrait for a sparse network that already fits collision-free', () => {
    const { sketchPageW, sketchPageH } = renderCapturing(makeResult());
    expect(sketchPageW).toBeCloseTo(210, 0);
    expect(sketchPageH).toBeCloseTo(297, 0);
  });

  it('escalates beyond A4 for a dense, real-world-scale network', () => {
    const N = 12;
    const names = Array.from({ length: N }, (_, i) => `P${i + 1}`);
    const pts = names.map((name, i) => {
      const yH = 50000 + (i % 4) * 80 + i * 3, xH = 2200000 + Math.floor(i / 4) * 90 + i * 5;
      return {
        id: i + 1, name, yH, xH, yS: yH + 0.07, xS: xH - 0.05,
        dY: 0.07, dX: -0.05, vY: 0.01, vX: -0.01, resDist: 0.014, resBrg: 90, wMax: 0.8, finalStatus: 'ACCEPT',
        yT: yH + 0.035, xT: xH - 0.025, tvY: 0.01, tvX: -0.01, tResid: 0.014, tBrg: 90, rY: 0.82, rX: 0.82,
      };
    });
    const rows: any[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dH = Math.hypot(b.yH - a.yH, b.xH - a.xH);
        const dS = Math.hypot(b.yS - a.yS, b.xS - a.xS);
        const brgH = (Math.atan2(b.yH - a.yH, b.xH - a.xH) * 180 / Math.PI + 360) % 360;
        const brgS = (Math.atan2(b.yS - a.yS, b.xS - a.xS) * 180 / Math.PI + 360) % 360;
        const dirDiffSec = ((brgS - brgH + 540) % 360 - 180) * 3600;
        rows.push({
          from: a.name, to: b.name, dH, dS, dDiff: dS - dH, dAllow: 0.05,
          distOk: Math.abs(dS - dH) <= 0.05,
          brgH, brgS, dirDiffSec, dirAllowSec: 30,
          dirOk: Math.abs(dirDiffSec) <= 30,
          pass: false,
        });
      }
    }
    const result = {
      adj: {
        params: { TY: 0.07, TX: -0.05, scale: 1.0001, ppm: 100, rotDeg: 0.001, se: { TY: 0.01, TX: 0.01, scale: 1e-4, ppm: 10, rotSec: 5 } },
        stats: { sig0: 0.01, s0: 0.02, DOF: 2, chi2: 3, chi2L: 0.1, chi2U: 6 },
      },
      pts,
      log: [{ iter: 1, n: pts.length, s0: 0.02, chi2: 3, chi2L: 0.1, chi2U: 6 }],
      converged: true,
      loo: { rows: [], rmsLoo: 0.01, maxLoo: 0.02, note: null },
      edges: {
        rows,
        summary: {
          totalLines: rows.length,
          distPass: rows.filter((r) => r.distOk).length,
          dirPass: rows.filter((r) => r.dirOk).length,
          bothPass: rows.filter((r) => r.distOk && r.dirOk).length,
          meanScale: 1.0, meanSwingDeg: 0,
        },
      },
      surveyClass: 'B',
    };
    const { sketchPageW, sketchPageH } = renderCapturing(result);
    // A4 portrait is 210x297mm, A4 landscape is 297x210mm -- this network (12 points, 66
    // all-pairs edges) is dense enough that neither orientation fits collision-free, so
    // the chosen sheet must be a larger ISO size (A3 or beyond) in at least one dimension.
    expect(Math.max(sketchPageW, sketchPageH)).toBeGreaterThan(297);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: FAIL — `sketchPageW`/`sketchPageH` are `0` for every test (production code still always calls `addPage('a4', 'portrait')` unconditionally, and the new paper-size tests fail their assertions).

- [ ] **Step 3: Rewrite `addEdgeComplianceSketch`**

In `app-frontend/src/utils/beaconAdjustmentReport.js`, replace the import line (line 7):

```js
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset, sampleCubicBezier, curveControlPoints, findClearAnchor, computeDrawSizeMm } from '@/utils/beaconComparisonSketchLayout'
```

with (only `computeSketchLayout` is still referenced directly in this file — every other import in that line was used exclusively inside the method being rewritten below):

```js
import { computeSketchLayout } from '@/utils/beaconComparisonSketchLayout'
```

Add a module-level constant, near the top of the file, right after `const NAVY = [30, 58, 92]`:

```js
// Standard ISO A-series page dimensions in mm, matching jsPDF's own built-in page-format
// table exactly (confirmed against jspdf/dist/jspdf.node.js's pageFormats constant) --
// used to evaluate paper-size candidates before any real page exists.
const SHEET_LADDER = [
  ['a4', 210, 297], ['a3', 297, 420], ['a2', 420, 594], ['a1', 594, 841], ['a0', 841, 1189],
]
const SHEET_CANDIDATES = SHEET_LADDER.flatMap(([fmt, pw, ph]) => [
  { fmt, orientation: 'portrait', w: pw, h: ph },
  { fmt, orientation: 'landscape', w: ph, h: pw },
])
```

Then replace the entire `addEdgeComplianceSketch` method (currently lines 369-525, from `addEdgeComplianceSketch(result) {` through its closing `}`) with:

```js
  addEdgeComplianceSketch(result) {
    const edges = result.edges
    if (!edges || !edges.rows.length) return

    const byName = {}
    for (const p of result.pts) byName[p.name] = { y: p.yH, x: p.xH }
    const names = new Set()
    for (const row of edges.rows) { names.add(row.from); names.add(row.to) }
    const points = Array.from(names)
      .map((name) => ({ name, pt: byName[name] }))
      .filter((p) => !!p.pt)
    if (points.length < 2) return

    // Build every annotation's text once, up front -- text-width measurement (needed to
    // size each annotation's collision box) only depends on the currently-set font/size,
    // never on page dimensions, so this is identical across every paper-size candidate
    // below and the eventual real render; no need to rebuild it per candidate.
    this.doc.setFontSize(5.5)
    const edgeSpecs = edges.rows.map((row) => {
      const histText = row.dH.toFixed(3), survText = row.dS.toFixed(3)
      const distDiffText = `(${f3s(row.dDiff)})`
      const brgHText = formatDMS(row.brgH), brgSText = formatDMS(row.brgS)
      const dirDiffText = `(${formatSignedDMS(row.dirDiffSec / 3600)})`
      return {
        from: row.from, to: row.to,
        line1: `${histText} -> ${survText} ${distDiffText}`,
        line2: `${brgHText} -> ${brgSText} ${dirDiffText}`,
        histText, survText, distDiffText, brgHText, brgSText, dirDiffText,
      }
    })
    const measureText = (s) => this.doc.getTextWidth(s)

    // The title always lands at the same offset regardless of which page size is
    // eventually chosen (sectionTitle's own +5 advance is fixed), so the box's
    // page-relative origin is known before any page exists -- every candidate below
    // shares this same origin; only the available width/height budget changes.
    const boxOrigin = { x: this.margin, y: this.margin + 5 }

    // Try the ISO paper ladder smallest-first, both orientations at each size, and keep
    // the first candidate that renders every ray and every annotation collision-free (or,
    // failing that by A0, whichever candidate came closest). Nothing here touches a real
    // jsPDF page or draws anything -- computeSketchLayout is pure. See
    // docs/superpowers/specs/2026-08-04-beacon-sketch-paper-sizing-design.md.
    let best = null
    for (const c of SHEET_CANDIDATES) {
      const maxAreaMm = { width: c.w - 2 * this.margin, height: c.h - boxOrigin.y - 40 }
      const layout = computeSketchLayout(points, edgeSpecs, boxOrigin, maxAreaMm, measureText)
      if (!best || layout.violations < best.layout.violations) best = { fmt: c.fmt, orientation: c.orientation, layout }
      if (layout.violations === 0) break
    }

    this.doc.addPage(best.fmt, best.orientation); this.y = this.margin
    this.sectionTitle('Comparison Sketch — SI 727 §67(5)')

    const pageW = this.doc.internal.pageSize.getWidth()
    const { denom, label, boxX, boxYtop, boxW, boxH, pad, positioned, edgeGeom, annotations } = best.layout
    this.doc.setDrawColor(120); this.doc.setLineWidth(0.3); this.doc.rect(boxX, boxYtop, boxW, boxH)

    // Rays -- curved (cubic Bezier), always plain black, drawn before annotations so text
    // sits on top. Geometry (control points, sampled polyline) was already computed by
    // computeSketchLayout during the trial above; drawing it here does no new math.
    this.doc.setDrawColor(0, 0, 0); this.doc.setLineWidth(0.25)
    edgeGeom.forEach((geom) => {
      if (!geom) return
      this.doc.moveTo(geom.a.mmX, geom.a.mmY)
      this.doc.curveTo(geom.cp1.mmX, geom.cp1.mmY, geom.cp2.mmX, geom.cp2.mmY, geom.b.mmX, geom.b.mmY)
      this.doc.stroke()
    })

    // Beacon points + outward-offset name labels.
    const cx = points.reduce((s, p) => s + (positioned.get(p.name)?.mmX ?? 0), 0) / points.length
    const cy = points.reduce((s, p) => s + (positioned.get(p.name)?.mmY ?? 0), 0) / points.length
    this.doc.setFontSize(7); this.doc.setTextColor(20, 20, 20)
    for (const p of points) {
      const pos = positioned.get(p.name)
      this.doc.setDrawColor(0, 0, 0)
      this.doc.circle(pos.mmX, pos.mmY, 1.3, 'S')
      let ux = pos.mmX - cx, uy = pos.mmY - cy
      const ulen = Math.hypot(ux, uy) || 1
      ux /= ulen; uy /= ulen
      this.doc.text(p.name, pos.mmX + ux * 3.5, pos.mmY + uy * 3.5)
    }

    // Per-ray annotations: anchors were already found (avoiding every ray and every
    // earlier annotation) by computeSketchLayout during the trial above -- just draw the
    // colour-coded text at them. old/historical black, new/survey red, arrow grey, and
    // the parenthesised difference black when within SI 727 tolerance, red when outside.
    const ARROW_GREY = [130, 130, 130], BLACK = [0, 0, 0], RED = [220, 0, 0]
    const LINE_GAP = 2.2
    this.doc.setFontSize(5.5)
    edges.rows.forEach((row, idx) => {
      const ann = annotations[idx]
      const spec = edgeSpecs[idx]
      if (!ann) return
      this._drawColoredLine(ann.anchor.mmX, ann.anchor.mmY, [
        { text: spec.histText, color: BLACK },
        { text: ' -> ', color: ARROW_GREY },
        { text: spec.survText, color: RED },
        { text: ' ' + spec.distDiffText, color: row.distOk ? BLACK : RED },
      ])
      this._drawColoredLine(ann.anchor.mmX, ann.anchor.mmY + LINE_GAP, [
        { text: spec.brgHText, color: BLACK },
        { text: ' -> ', color: ARROW_GREY },
        { text: spec.brgSText, color: RED },
        { text: ' ' + spec.dirDiffText, color: row.dirOk ? BLACK : RED },
      ])
    })

    // Tick-marked scale bar (bottom-left), matching addDisplacementPlot's own style.
    const mmPerM = 1000 / denom
    const barM = scaleBarMetres(mmPerM, 40), barMm = barM * mmPerM
    const sbx = boxX + pad, sby = boxYtop + boxH - 8
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.5)
    this.doc.line(sbx, sby, sbx + barMm, sby)
    this.doc.line(sbx, sby - 1.2, sbx, sby + 1.2)
    this.doc.line(sbx + barMm, sby - 1.2, sbx + barMm, sby + 1.2)
    this.doc.setFontSize(7); this.doc.setTextColor(40)
    this.doc.text('0', sbx, sby + 4); this.doc.text(`${barM} m`, sbx + barMm, sby + 4, { align: 'right' })

    // South arrow (bottom-right), matching addDisplacementPlot's own style.
    const ax = boxX + boxW - pad - 4
    const ay0 = boxYtop + boxH - pad - 16, ay1 = boxYtop + boxH - pad
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.6); this.doc.line(ax, ay0, ax, ay1)
    this._arrowhead(ax, ay0, ax, ay1, false, [40, 40, 40])
    this.doc.setFontSize(8); this.doc.setTextColor(40); this.doc.text('S', ax, ay1 + 4, { align: 'center' })

    // Callout + SI 727 summary under the box.
    this.y = boxYtop + boxH + 6
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(60)
    this.doc.text(
      `Scale ${label}. Black = historical, Red = current survey. Differences black = within SI 727 tolerance, red = outside.`,
      this.margin, this.y, { maxWidth: pageW - 2 * this.margin })
    this.y += 6
    const s = edges.summary
    this.doc.setTextColor(20)
    this.doc.text(
      `SI 727 Class ${result.surveyClass || 'B'} · ${s.bothPass} of ${s.totalLines} lines pass both checks`,
      this.margin, this.y)
    this.y += 12
  }
```

- [ ] **Step 4: Run the full test file to verify everything passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: PASS — all tests, including the 8 pre-existing ones (their assertions are about drawn colours/text/curve-count/no-throw, none of which depend on the specific page size chosen, so this refactor should not change their outcomes) and the 2 new paper-size tests.

- [ ] **Step 5: Run the full frontend suite to check for regressions**

Run: `cd app-frontend && npx vitest run`
Expected: PASS, with the same pre-existing, unrelated failures as before this plan (`parcelDetection.test.ts`, `coordinate-list.test.ts`) and no new ones.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/beaconAdjustmentReport.js app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts
git commit -m "feat(beacon-comparison): auto-select sketch paper size/orientation for a collision-free layout"
```

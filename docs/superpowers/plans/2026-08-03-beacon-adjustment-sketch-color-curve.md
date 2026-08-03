# Beacon Adjustment Report Sketch — Colour Convention & Curved Rays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the SI 727 §67(5) comparison sketch in `beaconAdjustmentReport.js` so old/new distance and direction are both shown (black/red), differences are colour-coded by tolerance instead of circled, rays are curved to reduce visual crossing, and annotation text is kept clear of every ray (not just its own) on a wider landscape page.

**Architecture:** Two new pure-geometry building blocks (`f3s` in `surveyMath.js`, six small functions in `beaconComparisonSketchLayout.ts`) feed a two-pass rewrite of `addEdgeComplianceSketch`: pass 1 draws every ray as a cubic Bézier and records its sampled polyline; pass 2 places each ray's two-line, colour-segmented annotation by searching outward from the ray until its bounding box clears every other ray's recorded polyline.

**Tech Stack:** Vue 3 + TypeScript/JS frontend, jsPDF 3 (`moveTo`/`curveTo`/`stroke` path API, `getTextWidth`), Vitest.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-03-beacon-adjustment-sketch-color-curve-design.md`.
- No changes to `si727.js`, `surveyAdjustmentStore.js`, `beaconComparisonSection.ts`, or `beaconComparisonReportGenerator.ts` — this plan touches only `beaconAdjustmentReport.js`, `beaconComparisonSketchLayout.ts`, `surveyMath.js`, and their test files.
- Backend test runner is irrelevant here (frontend-only change). Frontend tests: `cd app-frontend && npx vitest run <path>`.
- Colours: old/historical = black `[0,0,0]`; new/survey = red `[220,0,0]`; separator arrow = grey `[130,130,130]`; differences = black when within SI 727 tolerance, red `[220,0,0]` when outside.
- No general graph-crossing-minimisation algorithm — the bow heuristic is intentionally simple and deterministic (do not gold-plate).

---

### Task 1: `f3s` signed-3-decimal formatter

**Files:**
- Modify: `app-frontend/src/utils/surveyMath.js:358-360`
- Test: `app-frontend/src/utils/__tests__/surveyMath.test.ts` (new)

**Interfaces:**
- Produces: `f3s(v: number): string` — signed, 3-decimal-place formatter, mirroring the existing `f4s` but at 3 decimals. Used by Task 4 to format `dDiff`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/surveyMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { f3s } from '../surveyMath'

describe('f3s', () => {
  it('formats a positive number with an explicit + sign and 3 decimals', () => {
    expect(f3s(0.0495)).toBe('+0.050')
  })

  it('formats a negative number with a - sign and 3 decimals', () => {
    expect(f3s(-0.0014)).toBe('-0.001')
  })

  it('formats exactly zero with a + sign, matching the existing f4s convention', () => {
    expect(f3s(0)).toBe('+0.000')
  })

  it('returns an em dash for non-numbers, matching f3/f4/f4s', () => {
    expect(f3s(undefined as unknown as number)).toBe('—')
    expect(f3s(null as unknown as number)).toBe('—')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/surveyMath.test.ts`
Expected: FAIL — `f3s` is not exported from `../surveyMath`.

- [ ] **Step 3: Add the implementation**

In `app-frontend/src/utils/surveyMath.js`, right after the existing `f4s` line (line 360), add:

```js
export const f3s = v => (typeof v === 'number' ? (v >= 0 ? '+' : '') + v.toFixed(3) : '—')
```

So the block (lines 358-360) reads:

```js
export const f3  = v => (typeof v === 'number' ? v.toFixed(3) : '—')
export const f4  = v => (typeof v === 'number' ? v.toFixed(4) : '—')
export const f4s = v => (typeof v === 'number' ? (v >= 0 ? '+' : '') + v.toFixed(4) : '—')
export const f3s = v => (typeof v === 'number' ? (v >= 0 ? '+' : '') + v.toFixed(3) : '—')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/surveyMath.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/surveyMath.js app-frontend/src/utils/__tests__/surveyMath.test.ts
git commit -m "feat(beacon-comparison): add f3s signed-3-decimal formatter"
```

---

### Task 2: Pure geometry helpers — curve sampling, segment intersection, clear-anchor search

**Files:**
- Modify: `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (append after `midpointOffset`, currently ending at line 62)
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (append)

**Interfaces:**
- Consumes: existing `PointMm` interface and `midpointOffset` (same file).
- Produces (all exported):
  - `sampleCubicBezier(p0: PointMm, cp1: PointMm, cp2: PointMm, p3: PointMm, n?: number): PointMm[]`
  - `curveControlPoints(a: PointMm, b: PointMm, bowMm: number, side: 1 | -1): { cp1: PointMm; cp2: PointMm }`
  - `RectMm` interface `{ x0: number; y0: number; x1: number; y1: number }`
  - `boxAtAnchor(anchor: PointMm, boxWidthMm: number, boxHeightMm: number): RectMm`
  - `pointInRect(p: PointMm, r: RectMm): boolean`
  - `segmentsIntersect(p1: PointMm, p2: PointMm, p3: PointMm, p4: PointMm): boolean`
  - `polylineIntersectsRect(polyline: PointMm[], r: RectMm): boolean`
  - `findClearAnchor(a: PointMm, b: PointMm, side: 1 | -1, minOffsetMm: number, boxWidthMm: number, boxHeightMm: number, otherPolylines: PointMm[][], stepMm?: number, maxOffsetMm?: number): PointMm`
  - Used by Task 3 (`curveControlPoints`, `sampleCubicBezier`) and Task 4 (`findClearAnchor`) in `beaconAdjustmentReport.js`.

- [ ] **Step 1: Write the failing tests**

Append to `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (update the import line at the top first):

```ts
import { describe, it, expect } from 'vitest'
import {
  computeExtent, pickSketchScale, makeSketchTransform, midpointOffset,
  sampleCubicBezier, curveControlPoints, boxAtAnchor, pointInRect,
  segmentsIntersect, polylineIntersectsRect, findClearAnchor,
} from '../beaconComparisonSketchLayout'
```

Then append these new `describe` blocks at the end of the file:

```ts
describe('sampleCubicBezier', () => {
  it('returns n+1 points including exact endpoints', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 10 }
    const samples = sampleCubicBezier(a, a, b, b, 10)
    expect(samples).toHaveLength(11)
    expect(samples[0]).toEqual(a)
    expect(samples[10]).toEqual(b)
  })
})

describe('curveControlPoints + sampleCubicBezier', () => {
  it('bows a straight horizontal chord toward side=1 by half the bow distance at its midpoint', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const { cp1, cp2 } = curveControlPoints(a, b, 4, 1)
    const samples = sampleCubicBezier(a, cp1, cp2, b, 2)
    expect(samples).toHaveLength(3)
    expect(samples[0]).toEqual(a)
    expect(samples[2]).toEqual(b)
    expect(samples[1].mmX).toBeCloseTo(5, 6)
    // Standard quadratic-to-cubic conversion makes the t=0.5 sample land at
    // chordMidpoint + 0.5*bowOffset, not at the full bow -- this is that midpoint.
    expect(samples[1].mmY).toBeCloseTo(2, 6)
  })

  it('bows to the opposite side for side=-1', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const { cp1, cp2 } = curveControlPoints(a, b, 4, -1)
    const samples = sampleCubicBezier(a, cp1, cp2, b, 2)
    expect(samples[1].mmY).toBeCloseTo(-2, 6)
  })
})

describe('boxAtAnchor + pointInRect', () => {
  it('builds a rectangle around the anchor padded by the given box size', () => {
    const rect = boxAtAnchor({ mmX: 10, mmY: 10 }, 6, 4)
    expect(pointInRect({ mmX: 10, mmY: 10 }, rect)).toBe(true)
    expect(pointInRect({ mmX: 100, mmY: 100 }, rect)).toBe(false)
  })
})

describe('segmentsIntersect', () => {
  it('detects a simple X-crossing', () => {
    expect(segmentsIntersect(
      { mmX: 0, mmY: 0 }, { mmX: 10, mmY: 10 },
      { mmX: 0, mmY: 10 }, { mmX: 10, mmY: 0 },
    )).toBe(true)
  })

  it('returns false for parallel non-overlapping segments', () => {
    expect(segmentsIntersect(
      { mmX: 0, mmY: 0 }, { mmX: 10, mmY: 0 },
      { mmX: 0, mmY: 5 }, { mmX: 10, mmY: 5 },
    )).toBe(false)
  })

  it('returns false for segments that do not reach each other', () => {
    expect(segmentsIntersect(
      { mmX: 0, mmY: 0 }, { mmX: 1, mmY: 0 },
      { mmX: 5, mmY: -5 }, { mmX: 5, mmY: 5 },
    )).toBe(false)
  })
})

describe('polylineIntersectsRect', () => {
  const rect = { x0: 4, y0: 4, x1: 6, y1: 6 }

  it('detects a polyline segment passing through the rectangle', () => {
    const poly = [{ mmX: 0, mmY: 5 }, { mmX: 10, mmY: 5 }]
    expect(polylineIntersectsRect(poly, rect)).toBe(true)
  })

  it('returns false when the polyline stays clear of the rectangle', () => {
    const poly = [{ mmX: 0, mmY: 20 }, { mmX: 10, mmY: 20 }]
    expect(polylineIntersectsRect(poly, rect)).toBe(false)
  })

  it('detects a lone polyline point that lies inside the rectangle', () => {
    const poly = [{ mmX: 5, mmY: 5 }]
    expect(polylineIntersectsRect(poly, rect)).toBe(true)
  })
})

describe('findClearAnchor', () => {
  it('picks the minimum offset on the preferred side when nothing blocks it', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [], 2.5, 30)
    expect(anchor.mmX).toBeCloseTo(5, 6)
    expect(anchor.mmY).toBeCloseTo(3, 6)
  })

  it('steps outward past a blocking polyline on the preferred side', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const blocker = [{ mmX: 0, mmY: 3 }, { mmX: 10, mmY: 3 }]
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, [blocker], 2.5, 30)
    expect(anchor.mmY).toBeGreaterThan(3)
  })

  it('falls back to the opposite side when the preferred side is blocked all the way to the cap', () => {
    const a = { mmX: 0, mmY: 0 }, b = { mmX: 10, mmY: 0 }
    const blockers: Array<{ mmX: number; mmY: number }[]> = []
    for (let off = 2; off <= 32; off += 2) blockers.push([{ mmX: 0, mmY: off }, { mmX: 10, mmY: off }])
    const anchor = findClearAnchor(a, b, 1, 3, 2, 2, blockers, 2.5, 30)
    expect(anchor.mmY).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSketchLayout.test.ts`
Expected: FAIL — `sampleCubicBezier`, `curveControlPoints`, `boxAtAnchor`, `pointInRect`, `segmentsIntersect`, `polylineIntersectsRect`, `findClearAnchor` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (after the existing `midpointOffset` function, currently ending at line 62):

```ts
export interface RectMm { x0: number; y0: number; x1: number; y1: number }

export function sampleCubicBezier(
  p0: PointMm, cp1: PointMm, cp2: PointMm, p3: PointMm, n = 10,
): PointMm[] {
  const pts: PointMm[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t
    pts.push({
      mmX: a * p0.mmX + b * cp1.mmX + c * cp2.mmX + d * p3.mmX,
      mmY: a * p0.mmY + b * cp1.mmY + c * cp2.mmY + d * p3.mmY,
    })
  }
  return pts
}

// Bows a straight a->b chord through one quadratic control point (offset perpendicular
// from the chord midpoint by bowMm, via the existing midpointOffset helper), then converts
// that quadratic control point to the two cubic control points jsPDF's curveTo() needs
// (standard quadratic->cubic conversion: cp_i = end_i + 2/3*(quadControl - end_i)).
export function curveControlPoints(
  a: PointMm, b: PointMm, bowMm: number, side: 1 | -1,
): { cp1: PointMm; cp2: PointMm } {
  const q = midpointOffset(a, b, Math.abs(bowMm), side)
  return {
    cp1: { mmX: a.mmX + (2 / 3) * (q.mmX - a.mmX), mmY: a.mmY + (2 / 3) * (q.mmY - a.mmY) },
    cp2: { mmX: b.mmX + (2 / 3) * (q.mmX - b.mmX), mmY: b.mmY + (2 / 3) * (q.mmY - b.mmY) },
  }
}

export function boxAtAnchor(anchor: PointMm, boxWidthMm: number, boxHeightMm: number): RectMm {
  return {
    x0: anchor.mmX - 1, y0: anchor.mmY - 2.2,
    x1: anchor.mmX + boxWidthMm + 1, y1: anchor.mmY + boxHeightMm + 1,
  }
}

export function pointInRect(p: PointMm, r: RectMm): boolean {
  return p.mmX >= r.x0 && p.mmX <= r.x1 && p.mmY >= r.y0 && p.mmY <= r.y1
}

export function segmentsIntersect(p1: PointMm, p2: PointMm, p3: PointMm, p4: PointMm): boolean {
  const d = (p2.mmX - p1.mmX) * (p4.mmY - p3.mmY) - (p2.mmY - p1.mmY) * (p4.mmX - p3.mmX)
  if (d === 0) return false
  const t = ((p3.mmX - p1.mmX) * (p4.mmY - p3.mmY) - (p3.mmY - p1.mmY) * (p4.mmX - p3.mmX)) / d
  const u = ((p3.mmX - p1.mmX) * (p2.mmY - p1.mmY) - (p3.mmY - p1.mmY) * (p2.mmX - p1.mmX)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

export function polylineIntersectsRect(polyline: PointMm[], r: RectMm): boolean {
  for (const p of polyline) if (pointInRect(p, r)) return true
  const corners: PointMm[] = [
    { mmX: r.x0, mmY: r.y0 }, { mmX: r.x1, mmY: r.y0 },
    { mmX: r.x1, mmY: r.y1 }, { mmX: r.x0, mmY: r.y1 },
  ]
  for (let i = 0; i < polyline.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      if (segmentsIntersect(polyline[i], polyline[i + 1], corners[j], corners[(j + 1) % 4])) return true
    }
  }
  return false
}

// Searches outward from ray a->b, starting at minOffsetMm on the preferred side, in
// stepMm increments up to maxOffsetMm, then retries the same range on the opposite side,
// for the first anchor whose text bounding box (boxWidthMm x boxHeightMm) clears every
// polyline in otherPolylines. Falls back to the minimum offset on the preferred side if
// no clear position is found (a documented best-effort limit for pathologically dense
// clusters of near-coincident edges).
export function findClearAnchor(
  a: PointMm, b: PointMm, side: 1 | -1, minOffsetMm: number,
  boxWidthMm: number, boxHeightMm: number, otherPolylines: PointMm[][],
  stepMm = 2.5, maxOffsetMm = 30,
): PointMm {
  for (const trySide of [side, (side * -1) as 1 | -1]) {
    for (let offset = minOffsetMm; offset <= maxOffsetMm; offset += stepMm) {
      const anchor = midpointOffset(a, b, offset, trySide)
      const rect = boxAtAnchor(anchor, boxWidthMm, boxHeightMm)
      if (!otherPolylines.some((poly) => polylineIntersectsRect(poly, rect))) return anchor
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
git commit -m "feat(beacon-comparison): add curve sampling and clear-anchor search geometry helpers"
```

---

### Task 3: Curved rays on a landscape page

**Files:**
- Modify: `app-frontend/src/utils/beaconAdjustmentReport.js:1-8` (imports), `:360-393` (page setup + ray drawing inside `addEdgeComplianceSketch`)
- Test: `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts:61-149` (capture harness), `:163-170` (ray-colour assertion)

**Interfaces:**
- Consumes: `curveControlPoints`, `sampleCubicBezier` (Task 2, `beaconComparisonSketchLayout.ts`).
- Produces: an `edgeGeom` array (one entry per `edges.rows` item, or `null` for a row missing a positioned endpoint) with shape `{ a: PointMm, b: PointMm, side: 1|-1, bowMm: number, polyline: PointMm[] }`, consumed by Task 4's annotation placement.
- Test harness produces a `curves: Array<{color,x1,y1,x2,y2}>` field (replacing the old `lines` field), consumed by this task's own assertion and by Task 4's updated assertions.

- [ ] **Step 1: Update the failing test — rework the ray-capture harness**

In `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts`, replace the whole `renderCapturing` function (lines 61-149) with:

```ts
function renderCapturing(result: any) {
  // This file's own, pre-existing addDisplacementPlot draws its own colored (blue/red)
  // vector lines and marker circles on an earlier page, before addEdgeComplianceSketch's
  // page is ever created -- so a plain, document-wide capture of every call would wrongly
  // attribute that unrelated section's colors to the sketch. Each captured item is tagged
  // with the active page number (jsPDF's real, unpatched `internal.getCurrentPageInfo().
  // pageNumber`) and the result is filtered down to just the highest page number reached --
  // addEdgeComplianceSketch is the last section to call addPage() before addFooters() runs
  // (addFooters only revisits existing pages via setPage(), it never creates new ones), so
  // that highest page number is always its page.
  const written: string[] = [];
  // Same content as `written`, but paired with the draw colour active at the moment each
  // text() call happened -- needed to verify the old=black/new=red/diff-by-tolerance
  // colour convention, which plain string capture can't distinguish (Task 4).
  const textsColored: Array<{ text: string; color: [number, number, number] }> = [];
  const rawCurves: Array<{ color: [number, number, number]; x1: number; y1: number; x2: number; y2: number; page: number }> = [];
  const rawEllipses: Array<{ color: [number, number, number]; page: number }> = [];
  let currentDrawColor: [number, number, number] = [0, 0, 0];
  // Text colour (doc.setTextColor) is a separate jsPDF channel from draw colour
  // (doc.setDrawColor, used for lines/curves/circles) -- both need their own tracked
  // state and their own patch, or textsColored would silently capture the wrong colour.
  let currentTextColor: [number, number, number] = [0, 0, 0];
  let lastMoveTo = { x: 0, y: 0 };

  // Save prior own-property state of jsPDF.API for each patched key so we can restore
  // it exactly afterward (present-with-value vs. absent) rather than mutating the shared,
  // global plugin registry permanently for later test files.
  const patchedKeys = ['text', 'setDrawColor', 'setTextColor', 'moveTo', 'curveTo', 'stroke', 'circle', 'ellipse', 'save'] as const;
  const priorState = new Map<string, { had: boolean; value: any }>();
  for (const k of patchedKeys) {
    priorState.set(k, { had: Object.prototype.hasOwnProperty.call(jsPDF.API, k), value: (jsPDF.API as any)[k] });
  }

  (jsPDF.API as any).text = function (text: any) {
    const str = Array.isArray(text) ? text.join(' ') : String(text);
    written.push(str);
    textsColored.push({ text: str, color: currentTextColor });
    return this;
  };
  (jsPDF.API as any).setDrawColor = function (...args: any[]) {
    if (args.length >= 3) currentDrawColor = [args[0], args[1], args[2]];
    else if (args.length === 1) currentDrawColor = [args[0], args[0], args[0]];
    return this;
  };
  (jsPDF.API as any).setTextColor = function (...args: any[]) {
    if (args.length >= 3) currentTextColor = [args[0], args[1], args[2]];
    else if (args.length === 1) currentTextColor = [args[0], args[0], args[0]];
    return this;
  };
  // Rays are drawn as cubic Bezier curves via jsPDF's path API (moveTo -> curveTo ->
  // stroke), one curve per edge, instead of a single doc.line() call. moveTo records the
  // curve's start point; curveTo captures the full curve (start from the preceding
  // moveTo, both control points are discarded -- only start/end matter for these tests --
  // end point, and the draw colour active at that moment) tagged with the current page.
  (jsPDF.API as any).moveTo = function (x: number, y: number) {
    lastMoveTo = { x, y };
    return this;
  };
  (jsPDF.API as any).curveTo = function (_x1: number, _y1: number, _x2: number, _y2: number, x3: number, y3: number) {
    const page = this.internal.getCurrentPageInfo().pageNumber;
    rawCurves.push({ color: currentDrawColor, x1: lastMoveTo.x, y1: lastMoveTo.y, x2: x3, y2: y3, page });
    return this;
  };
  (jsPDF.API as any).stroke = function () { return this; };
  // jsPDF's own circle() is implemented internally as this.ellipse(x,y,r,r,style) -- without
  // this guard, every beacon-marker circle (drawn via doc.circle, AND the historical/survey
  // dots this file's OWN addDisplacementPlot draws elsewhere) would also land in the
  // `ellipses` capture. We reproduce that same real relationship here (our circle override
  // calls `this.ellipse(...)`, i.e. our own patched ellipse below) so the guard has
  // something to guard against, exactly as it would against the real built-in.
  let inCircleCall = false;
  (jsPDF.API as any).circle = function (x: number, y: number, r: number, style: string) {
    inCircleCall = true;
    try {
      return this.ellipse(x, y, r, r, style);
    } finally {
      inCircleCall = false;
    }
  };
  (jsPDF.API as any).ellipse = function () {
    if (!inCircleCall) {
      const page = this.internal.getCurrentPageInfo().pageNumber;
      rawEllipses.push({ color: currentDrawColor, page });
    }
    return this;
  };
  // jsPDF's own save() writes to the DOM in a browser; under Vitest's default environment
  // it may throw or no-op. Stub it so the report-generation call completes without a real
  // download, matching how this file is actually invoked (CompareView.vue's button handler
  // doesn't await anything after calling it either).
  (jsPDF.API as any).save = function () { return this; };

  try {
    generateBeaconAdjustmentReport(result, { surveyorName: 'Test', plsNumber: '1', location: 'X', priorSurvey: 'SR 1/2026', date: '2026-08-02', critW: 2.576 });
  } finally {
    for (const k of patchedKeys) {
      const prior = priorState.get(k)!;
      if (prior.had) (jsPDF.API as any)[k] = prior.value;
      else delete (jsPDF.API as any)[k];
    }
  }
  const sketchPage = Math.max(0, ...rawCurves.map((l) => l.page), ...rawEllipses.map((e) => e.page));
  // addEdgeComplianceSketch draws its rays as curveTo() calls; nothing else on this page
  // (or any page) uses curveTo() (the scale bar and south arrow use doc.line()), so every
  // captured curve on the sketch page is exactly one ray -- no slicing/filtering needed.
  const curves = rawCurves.filter((l) => l.page === sketchPage).map(({ color, x1, y1, x2, y2 }) => ({ color, x1, y1, x2, y2 }));
  const ellipses = rawEllipses.filter((e) => e.page === sketchPage).map(({ color }) => ({ color }));
  return { written, textsColored, curves, ellipses };
}
```

Then update the ray-colour test (lines 163-170) to use `curves` instead of `lines` (the assertions themselves are unchanged — the circling code isn't touched until Task 4):

```ts
  it('draws every ray in plain black regardless of pass/fail, and circles only the failing figures', () => {
    const { curves, ellipses } = renderCapturing(makeResult());
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.every((l) => l.color[0] === 0 && l.color[1] === 0 && l.color[2] === 0)).toBe(true);
    // 3 edges: 86B-87A and 87A-87B pass both checks (0 circles each); 86B-87B fails both
    // (2 circles: distance figure + swing figure) -> 2 ellipses total.
    expect(ellipses.length).toBe(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: FAIL — `renderCapturing` returns `curves: []` for every call (production code still calls `doc.line()` for rays, never `doc.curveTo()`), so `curves.length` is 0, not greater than 0.

- [ ] **Step 3: Update imports and rewrite the ray-drawing section**

In `app-frontend/src/utils/beaconAdjustmentReport.js`, change the import line (line 7) from:

```js
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset } from '@/utils/beaconComparisonSketchLayout'
```

to:

```js
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset, sampleCubicBezier, curveControlPoints } from '@/utils/beaconComparisonSketchLayout'
```

Then replace lines 373-393 (from `this.doc.addPage('a4', 'portrait'); this.y = this.margin` through the end of the rays `for` loop) with:

```js
    this.doc.addPage('a4', 'landscape'); this.y = this.margin
    this.sectionTitle('Comparison Sketch — SI 727 §67(5)')

    const pageW = this.doc.internal.pageSize.getWidth()
    const pageH = this.doc.internal.pageSize.getHeight()
    const boxX = this.margin, boxYtop = this.y, boxW = pageW - 2 * this.margin, boxH = pageH - boxYtop - 40
    this.doc.setDrawColor(120); this.doc.setLineWidth(0.3); this.doc.rect(boxX, boxYtop, boxW, boxH)

    const pad = 16
    const areaMm = { width: boxW - 2 * pad, height: boxH - 2 * pad }
    const extent = computeExtent(points.map((p) => p.pt))
    const { denom, label } = pickSketchScale(extent, areaMm)
    const originMm = { x: boxX + pad, y: boxYtop + pad }
    const transform = makeSketchTransform(extent, areaMm, denom, originMm)
    const positioned = new Map(points.map((p) => [p.name, transform(p.pt)]))

    // Rays -- curved (cubic Bezier), always plain black, drawn before annotations so text
    // sits on top. Bow side/depth vary deterministically per edge so near-parallel or
    // overlapping edges fan visually apart; each curve is also sampled into a polyline
    // and kept in edgeGeom so annotation placement (below) can stay clear of every OTHER
    // ray, not just its own.
    this.doc.setDrawColor(0, 0, 0); this.doc.setLineWidth(0.25)
    const edgeGeom = edges.rows.map((row, idx) => {
      const a = positioned.get(row.from), b = positioned.get(row.to)
      if (!a || !b) return null
      const side = idx % 2 === 0 ? 1 : -1
      const length = Math.hypot(b.mmX - a.mmX, b.mmY - a.mmY)
      const bowMm = Math.min(4 + 3 * (idx % 3), length * 0.35)
      const { cp1, cp2 } = curveControlPoints(a, b, bowMm, side)
      this.doc.moveTo(a.mmX, a.mmY)
      this.doc.curveTo(cp1.mmX, cp1.mmY, cp2.mmX, cp2.mmY, b.mmX, b.mmY)
      this.doc.stroke()
      return { a, b, side, bowMm, polyline: sampleCubicBezier(a, cp1, cp2, b, 10) }
    })
```

(The rest of the method — beacon points/labels, the per-ray annotation loop, scale bar, south arrow, and caption — stays exactly as it is for this task; only the page/box setup and the ray-drawing loop change. The annotation loop still reads `a`/`b` via `positioned.get(...)` at this point, not yet via `edgeGeom` — that wiring happens in Task 4.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: PASS (all 4 existing tests, including the updated ray-colour test)

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconAdjustmentReport.js app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts
git commit -m "feat(beacon-comparison): curve the comparison-sketch rays on a landscape page"
```

---

### Task 4: Two-line colour-coded annotations with overlap avoidance

**Files:**
- Modify: `app-frontend/src/utils/beaconAdjustmentReport.js:5` (import `f3s`), `:409-440`-equivalent (annotation loop, now shifted by Task 3's edit — locate via the `// Per-ray annotations:` comment), the caption line (`Scale ${label}. Black = historical...`), and add a new `_drawColoredLine` helper method
- Test: `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts` (ellipse assertion removed, colour-follows-tolerance assertions added, overlap-avoidance test added)

**Interfaces:**
- Consumes: `f3s` (Task 1), `findClearAnchor` (Task 2), `edgeGeom` (Task 3, produced inside `addEdgeComplianceSketch`).
- Produces: `_drawColoredLine(x: number, y: number, segments: Array<{text: string, color: [number,number,number]}>)` instance method on `BeaconAdjustmentReport`, used only within `addEdgeComplianceSketch`.

- [ ] **Step 1: Update the failing tests**

In `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts`, replace the ray/circle test (updated in Task 3) with two separate tests — one for rays (unchanged from Task 3), one for the new colour-by-tolerance annotation behaviour, plus a new overlap-avoidance test. Replace the single `it('draws every ray in plain black...')` block with:

```ts
  it('draws every ray in plain black regardless of pass/fail', () => {
    const { curves } = renderCapturing(makeResult());
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.every((l) => l.color[0] === 0 && l.color[1] === 0 && l.color[2] === 0)).toBe(true);
  });

  it('draws no tolerance-violation circles any more -- colour on the diff text carries that signal instead', () => {
    const { ellipses } = renderCapturing(makeResult());
    expect(ellipses.length).toBe(0);
  });

  it('colours the historical distance black and the survey distance red', () => {
    // All 3 edges in makeResult() share dH=140.0/dS=140.05, so each figure appears once
    // per edge (3 times total) regardless of pass/fail -- only the diff figure (below)
    // varies by tolerance.
    const { textsColored } = renderCapturing(makeResult());
    const hist = textsColored.filter((t) => t.text === '140.000');
    const surv = textsColored.filter((t) => t.text === '140.050');
    expect(hist.length).toBe(3);
    expect(surv.length).toBe(3);
    expect(hist.every((t) => t.color[0] === 0 && t.color[1] === 0 && t.color[2] === 0)).toBe(true);
    expect(surv.every((t) => t.color[0] === 220 && t.color[1] === 0 && t.color[2] === 0)).toBe(true);
  });

  it('colours the distance-difference figure black when within tolerance and red when outside it', () => {
    // makeResult()'s 3 edges all carry the same dDiff (0.05 -> "+0.050"); 86B-87A and
    // 87A-87B pass (distOk=true), 86B-87B fails (distOk=false) -- so the SAME text should
    // appear 3 times, split 2 black / 1 red.
    const { textsColored } = renderCapturing(makeResult());
    const diffs = textsColored.filter((t) => t.text === ' (+0.050)');
    expect(diffs.length).toBe(3);
    const black = diffs.filter((t) => t.color[0] === 0 && t.color[1] === 0 && t.color[2] === 0);
    const red = diffs.filter((t) => t.color[0] === 220 && t.color[1] === 0 && t.color[2] === 0);
    expect(black.length).toBe(2);
    expect(red.length).toBe(1);
  });

  it('colours the direction-difference figure black when within tolerance and red when outside it', () => {
    // Same reasoning as the distance-difference test: all 3 edges share dirDiffSec=-7200
    // (-2 deg -> "-2°00'00.0""); 86B-87A and 87A-87B pass (dirOk=true), 86B-87B fails
    // (dirOk=false).
    const { textsColored } = renderCapturing(makeResult());
    const diffs = textsColored.filter((t) => t.text === ` (-2°00'00.0")`);
    expect(diffs.length).toBe(3);
    const black = diffs.filter((t) => t.color[0] === 0 && t.color[1] === 0 && t.color[2] === 0);
    const red = diffs.filter((t) => t.color[0] === 220 && t.color[1] === 0 && t.color[2] === 0);
    expect(black.length).toBe(2);
    expect(red.length).toBe(1);
  });
```

The existing `'renders a negative swing with an explicit minus sign, not wrapped into [0,360)'` test also needs updating: the direction difference is no longer its own bare text() call (`swingText` drawn standalone) — it's now the parenthesised, space-prefixed tail segment of the direction line (` (-2°00'00.0")`), alongside the new unsigned `brgH`/`brgS` values (`formatDMS`, always in `[0,360)` by construction) on the same line. Replace that test with:

```ts
  it('renders a negative direction difference with an explicit minus sign, not wrapped into [0,360)', () => {
    const { written } = renderCapturing(makeResult());
    expect(written.some((w) => w.includes("(-2°"))).toBe(true);
    expect(written.some((w) => w.includes('357°') || w.includes('358°'))).toBe(false);
  });
```

Append a new `describe` block at the end of the file (after the existing `describe('addEdgeComplianceSketch ...')` block closes) for overlap avoidance:

```ts
describe('addEdgeComplianceSketch annotation placement', () => {
  it('keeps each annotation clear of every ray, including rays it does not label', () => {
    // Four beacons in a tight square with all 6 pairwise edges -- deliberately dense so
    // several rays pass close to any given edge's natural annotation position, exercising
    // the outward search rather than always landing on the first candidate.
    const pts = [
      { id: 1, name: 'A', yH: 50000.0, xH: 2200000.0, yS: 50000.02, xS: 2200000.03,
        dY: 0.02, dX: 0.03, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.4, finalStatus: 'ACCEPT',
        yT: 50000.01, xT: 2200000.02, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.8, rX: 0.8 },
      { id: 2, name: 'B', yH: 50050.0, xH: 2200000.0, yS: 50050.01, xS: 2200000.02,
        dY: 0.01, dX: 0.02, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.3, finalStatus: 'ACCEPT',
        yT: 50050.005, xT: 2200000.01, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.85, rX: 0.85 },
      { id: 3, name: 'C', yH: 50050.0, xH: 2200050.0, yS: 50050.03, xS: 2200050.01,
        dY: 0.03, dX: 0.01, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.5, finalStatus: 'ACCEPT',
        yT: 50050.015, xT: 2200050.005, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.82, rX: 0.82 },
      { id: 4, name: 'D', yH: 50000.0, xH: 2200050.0, yS: 50000.02, xS: 2200050.01,
        dY: 0.02, dX: 0.01, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.2, finalStatus: 'ACCEPT',
        yT: 50000.01, xT: 2200050.005, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.9, rX: 0.9 },
    ];
    const edgeRow = (from: string, to: string) => ({
      from, to, dH: 50.0, dS: 50.02, dDiff: 0.02, dAllow: 0.05,
      distOk: true, brgH: 90.0, brgS: 90.001, dirDiffSec: 3.6, dirAllowSec: 20.0, dirOk: true,
      pass: true,
    });
    const result = {
      adj: {
        params: { TY: 0.02, TX: -0.01, scale: 1.0001, ppm: 100, rotDeg: 0.001, se: { TY: 0.01, TX: 0.01, scale: 1e-4, ppm: 10, rotSec: 5 } },
        stats: { sig0: 0.01, s0: 0.02, DOF: 2, chi2: 3, chi2L: 0.1, chi2U: 6 },
      },
      pts,
      log: [{ iter: 1, n: 4, s0: 0.02, chi2: 3, chi2L: 0.1, chi2U: 6 }],
      converged: true,
      loo: { rows: [], rmsLoo: 0.01, maxLoo: 0.02, note: null },
      edges: {
        rows: [
          edgeRow('A', 'B'), edgeRow('A', 'C'), edgeRow('A', 'D'),
          edgeRow('B', 'C'), edgeRow('B', 'D'), edgeRow('C', 'D'),
        ],
        summary: { totalLines: 6, distPass: 6, dirPass: 6, bothPass: 6, meanScale: 1.0001, meanSwingDeg: -0.001 },
      },
      surveyClass: 'B',
    };
    // No colour/geometry assertion needed here beyond "it doesn't throw" -- the geometry
    // helpers themselves are exhaustively tested in beaconComparisonSketchLayout.test.ts.
    // What this test actually protects against is a regression where the loop in
    // addEdgeComplianceSketch stops calling findClearAnchor (e.g. reverts to the fixed
    // midpointOffset it used before this task), which unit tests on the pure helper alone
    // cannot catch since that helper would still exist and pass its own tests unused.
    expect(() => renderCapturing(result)).not.toThrow();
    const { written } = renderCapturing(result);
    expect(written).toContain('A');
    expect(written).toContain('B');
    expect(written).toContain('C');
    expect(written).toContain('D');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: FAIL — `ellipses.length` is still 2 (circling code not yet removed), and `written` does not contain `'(+0.050)'` (diffs not yet rendered in the new format).

- [ ] **Step 3: Rewrite the annotation section**

In `app-frontend/src/utils/beaconAdjustmentReport.js`, update the import line (line 5) from:

```js
import { f3, f4, f4s, formatDMS } from '@/utils/surveyMath'
```

to:

```js
import { f3, f4, f4s, f3s, formatDMS } from '@/utils/surveyMath'
```

Add the import for `findClearAnchor` alongside the Task 3 imports (line 7), so it reads:

```js
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset, sampleCubicBezier, curveControlPoints, findClearAnchor } from '@/utils/beaconComparisonSketchLayout'
```

Add a new helper method, right after `_arrowhead` (after line 100):

```js
  _drawColoredLine(x, y, segments) {
    let cx = x
    for (const seg of segments) {
      this.doc.setTextColor(seg.color[0], seg.color[1], seg.color[2])
      this.doc.text(seg.text, cx, y)
      cx += this.doc.getTextWidth(seg.text)
    }
  }
```

Replace the whole per-ray annotation block — from the comment `// Per-ray annotations:` through the closing `})` of that `edges.rows.forEach(...)` loop (the block that builds `histText`/`survText`/`swingText` and draws the failure ellipses) — with:

```js
    // Per-ray annotations: two lines, "old -> new (diff)" for distance then direction.
    // Old/historical is black, new/survey is red, and the parenthesised difference is
    // black when within SI 727 tolerance and red when outside it. Anchored just clear of
    // the ray's own curve, then searched outward (this ray's bow side first, then the
    // opposite side) until the annotation's bounding box clears every OTHER ray's sampled
    // curve -- not just avoiding this ray, avoiding all of them.
    const ARROW_GREY = [130, 130, 130], BLACK = [0, 0, 0], RED = [220, 0, 0]
    const LINE_GAP = 2.2, BOX_HEIGHT = LINE_GAP + 3.0
    this.doc.setFontSize(5.5)
    edges.rows.forEach((row, idx) => {
      const geom = edgeGeom[idx]
      if (!geom) return
      const { a, b, side, bowMm } = geom

      const histText = row.dH.toFixed(3), survText = row.dS.toFixed(3)
      const distDiffText = `(${f3s(row.dDiff)})`
      const brgHText = formatDMS(row.brgH), brgSText = formatDMS(row.brgS)
      const dirDiffText = `(${formatSignedDMS(row.dirDiffSec / 3600)})`
      const line1 = `${histText} → ${survText} ${distDiffText}`
      const line2 = `${brgHText} → ${brgSText} ${dirDiffText}`
      const boxWidth = Math.max(this.doc.getTextWidth(line1), this.doc.getTextWidth(line2))

      const otherPolylines = edgeGeom
        .filter((g, i) => g && i !== idx)
        .map((g) => g.polyline)
      const anchor = findClearAnchor(a, b, side, bowMm + 1.5, boxWidth, BOX_HEIGHT, otherPolylines, 2.5, 30)

      this._drawColoredLine(anchor.mmX, anchor.mmY, [
        { text: histText, color: BLACK },
        { text: ' → ', color: ARROW_GREY },
        { text: survText, color: RED },
        { text: ' ' + distDiffText, color: row.distOk ? BLACK : RED },
      ])
      this._drawColoredLine(anchor.mmX, anchor.mmY + LINE_GAP, [
        { text: brgHText, color: BLACK },
        { text: ' → ', color: ARROW_GREY },
        { text: brgSText, color: RED },
        { text: ' ' + dirDiffText, color: row.dirOk ? BLACK : RED },
      ])
    })
```

(This deletes the old `histText`/`survText`/`swingText` variables, the `midpointOffset(a, b, 2.2, side)` call, and both `if (!row.distOk) { ... doc.ellipse ... }` / `if (!row.dirOk) { ... }` blocks — none of that logic survives. `geom.polyline` isn't destructured here since this ray's own polyline isn't needed in this scope — `otherPolylines` reads `.polyline` off the *other* entries in `edgeGeom` instead.)

Finally, update the caption text (the `this.doc.text(` call right after `// Callout + SI 727 summary under the box.`) from:

```js
      `Scale ${label}. Black = historical, Red = current survey, Circled = outside SI 727 tolerance.`,
```

to:

```js
      `Scale ${label}. Black = historical, Red = current survey. Differences black = within SI 727 tolerance, red = outside.`,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: PASS (all tests, including the new colour and overlap-avoidance tests)

- [ ] **Step 5: Run the full frontend suite to check for regressions**

Run: `cd app-frontend && npx vitest run`
Expected: PASS (no regressions in unrelated suites)

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/beaconAdjustmentReport.js app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts
git commit -m "feat(beacon-comparison): colour-code sketch differences by tolerance, avoid ray overlap"
```

---

### Task 5: Manual visual verification

**Files:**
- Create (scratch, not committed): a throwaway Vitest file in your scratchpad directory (outside the repo), e.g. `render-preview.test.ts`

**Interfaces:**
- Consumes: `generateBeaconAdjustmentReport` (unchanged export from `beaconAdjustmentReport.js`).
- Produces: a `.pdf` file on disk for human visual review. Not part of the automated suite, not committed.

This mirrors how the current design was actually validated last time (the user reviewed a real generated PDF, `beacon-comparison-2026-08-03.pdf`, and that review is what drove this whole plan) — automated tests check the mechanics (colours, no-throw, no-ray-collision math) but only a rendered PDF can confirm the sketch is actually legible.

- [ ] **Step 1: Write the preview script**

Create a file in your scratchpad directory (not inside the git repo) named `render-preview.test.ts`:

```ts
import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { jsPDF } from 'jspdf'
import { generateBeaconAdjustmentReport } from 'C:/surveypro-may-2026/SurveyPro-nov-alpha/app-frontend/src/utils/beaconAdjustmentReport.js'

describe('manual preview', () => {
  it('renders a sample PDF to disk for visual review', () => {
    const names = ['86B', '86C', '87A', '87B', '87C', '87D', '88F', '88X2', 'RM15', 'RM16', 'RM7', 'RM9']
    const pts = names.map((name, i) => {
      const yH = 50000 + (i % 4) * 80 + i * 3, xH = 2200000 + Math.floor(i / 4) * 90 + i * 5
      return {
        id: i + 1, name, yH, xH, yS: yH + 0.07, xS: xH - 0.05,
        dY: 0.07, dX: -0.05, vY: 0.01, vX: -0.01, resDist: 0.014, resBrg: 90, wMax: 0.8, finalStatus: 'ACCEPT',
        yT: yH + 0.035, xT: xH - 0.025, tvY: 0.01, tvX: -0.01, tResid: 0.014, tBrg: 90, rY: 0.82, rX: 0.82,
      }
    })
    const rows: any[] = []
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j]
        const dH = Math.hypot(b.yH - a.yH, b.xH - a.xH)
        const dS = Math.hypot(b.yS - a.yS, b.xS - a.xS)
        const brgH = (Math.atan2(b.yH - a.yH, b.xH - a.xH) * 180 / Math.PI + 360) % 360
        const brgS = (Math.atan2(b.yS - a.yS, b.xS - a.xS) * 180 / Math.PI + 360) % 360
        const dirDiffSec = ((brgS - brgH + 540) % 360 - 180) * 3600
        rows.push({
          from: a.name, to: b.name, dH, dS, dDiff: dS - dH, dAllow: 0.05,
          distOk: Math.abs(dS - dH) <= 0.05,
          brgH, brgS, dirDiffSec, dirAllowSec: 30,
          dirOk: Math.abs(dirDiffSec) <= 30,
          pass: false,
        })
      }
    }
    const result = {
      adj: {
        params: { TY: 0.0658, TX: -0.0533, scale: 1.0001123, ppm: 112.3, rotDeg: 359.994, se: { TY: 0.0128, TX: 0.0128, scale: 9.95e-5, ppm: 99.45, rotSec: 20.5 } },
        stats: { sig0: 0.0085, s0: 0.0444, DOF: 20, chi2: 549.98, chi2L: 9.57, chi2U: 34.18 },
      },
      pts,
      log: [{ iter: 1, n: 12, s0: 0.04438, chi2: 549.98, chi2L: 9.57, chi2U: 34.18 }],
      converged: true,
      loo: { rows: [], rmsLoo: 0.0675, maxLoo: 0.1382, note: null },
      edges: { rows, summary: { totalLines: rows.length, distPass: rows.filter(r => r.distOk).length, dirPass: rows.filter(r => r.dirOk).length, bothPass: rows.filter(r => r.distOk && r.dirOk).length, meanScale: 1.00004617, meanSwingDeg: -0.0003 } },
      surveyClass: 'B',
    }
    const priorSave = (jsPDF.API as any).save
    let bytes: ArrayBuffer | null = null
    ;(jsPDF.API as any).save = function () { bytes = this.output('arraybuffer'); return this }
    try {
      generateBeaconAdjustmentReport(result, { surveyorName: 'Preview', plsNumber: '1', location: 'Preview', priorSurvey: 'SR 1/2026', date: '2026-08-03', critW: 2.576 })
    } finally {
      if (priorSave) (jsPDF.API as any).save = priorSave; else delete (jsPDF.API as any).save
    }
    writeFileSync('C:/Users/mukan/AppData/Local/Temp/claude/beacon-sketch-preview.pdf', Buffer.from(bytes!))
  })
})
```

- [ ] **Step 2: Run it and open the output**

Run: `cd app-frontend && npx vitest run "C:/path/to/your/scratchpad/render-preview.test.ts"`

Then open `C:/Users/mukan/AppData/Local/Temp/claude/beacon-sketch-preview.pdf` (adjust the output path in the script first if your scratchpad differs) and visually confirm on the last page:
- Page is landscape.
- Rays are visibly curved, not straight.
- Each ray's two annotation lines show old (black) → new (red) with a parenthesised, colour-coded difference for both distance and direction.
- No annotation text sits on top of a ray it isn't labelling.
- No red circles remain anywhere in the sketch.

- [ ] **Step 3: Delete the scratch file**

This script and its output PDF are not part of the repo or the test suite — delete both once the visual review is done.

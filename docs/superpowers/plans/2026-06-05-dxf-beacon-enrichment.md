# DXF Beacon Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the DXF generator's beacon labeling to full parity with the PDF generator — POI-directed inside placement, tight outside placement, edge-anchored fallback, splay-group iteration, collision detection, scale-dependent fonts + logarithmic symbol sizing, leader lines, and deferred-circle z-order.

**Architecture:** One new pure module `dxfBeaconPlacer.js` (7 exports + 1 factory) wired into `dxfGenerator.js`'s beacon emission loop. Module ports the relevant `pdfkitGeoPDF.js` helpers verbatim with two DXF adaptations (`charWidthRatio = 0.55`, baseline-left anchor) following the 4d module shape exactly.

**Tech Stack:** Node.js ESM, Jest 30 with `--experimental-vm-modules`, existing 4a primitives from `dxfGeometry.js`.

---

## Task 1: Module skeleton + sizing helpers + collision registry

Mechanical: file scaffold, two scalar functions, one factory. No placement logic yet. After this task, 269 dxf tests pass (266 baseline + 3 new).

**Files:**
- Create: `app-backend/src/services/dxfBeaconPlacer.js`
- Create: `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`

- [ ] **Step 1.1: Write the failing tests**

Write `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`:

```js
/**
 * Unit tests for the DXF beacon placer.
 * Run with:  cd app-backend && npm run test -- dxfBeaconPlacer
 */
import { describe, test, expect } from '@jest/globals'
import {
  pickBeaconFontSize,
  computeBeaconRadius,
  createCollisionRegistry,
} from '../dxfBeaconPlacer.js'

describe('pickBeaconFontSize — PDF tier switch', () => {
  test('scale 500 → 6 pt', () => {
    expect(pickBeaconFontSize(500)).toBe(6)
  })
  test('scale 1000 → 6.5 pt', () => {
    expect(pickBeaconFontSize(1000)).toBe(6.5)
  })
  test('scale 2000 → 7 pt', () => {
    expect(pickBeaconFontSize(2000)).toBe(7)
  })
  test('scale 5000 → 7.5 pt (catch-all)', () => {
    expect(pickBeaconFontSize(5000)).toBe(7.5)
  })
  test('boundary case scale 501 → 6.5 pt', () => {
    expect(pickBeaconFontSize(501)).toBe(6.5)
  })
})

describe('computeBeaconRadius — logarithmic with PDF clamp', () => {
  // Base case: at scale 500 → baseRadiusMM × 1.0 = 0.75 mm,
  // = 2.13 pt; not clamped, returns ~0.75 mm.
  test('scale 500 → ~0.75 mm', () => {
    const r = computeBeaconRadius(500)
    expect(r).toBeGreaterThan(0.74)
    expect(r).toBeLessThan(0.76)
  })
  test('monotone non-decreasing in scale', () => {
    const r500  = computeBeaconRadius(500)
    const r1000 = computeBeaconRadius(1000)
    const r5000 = computeBeaconRadius(5000)
    expect(r1000).toBeGreaterThanOrEqual(r500)
    expect(r5000).toBeGreaterThanOrEqual(r1000)
  })
  test('clamped at PDF 1.8-3.0 pt window', () => {
    // 1.8 pt ≈ 0.635 mm, 3.0 pt ≈ 1.058 mm.
    const huge = computeBeaconRadius(100000)
    expect(huge).toBeGreaterThanOrEqual(0.63)
    expect(huge).toBeLessThanOrEqual(1.06)
  })
})

describe('createCollisionRegistry', () => {
  test('empty registry: no collisions, size 0', () => {
    const r = createCollisionRegistry()
    expect(r.size).toBe(0)
    expect(r.hasCollision({ x: 0, y: 0, width: 10, height: 10 })).toBe(false)
  })
  test('add then check overlapping rect → true', () => {
    const r = createCollisionRegistry()
    r.add({ x: 0, y: 0, width: 10, height: 10 })
    expect(r.hasCollision({ x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(r.size).toBe(1)
  })
  test('add then check non-overlapping rect → false', () => {
    const r = createCollisionRegistry()
    r.add({ x: 0, y: 0, width: 10, height: 10 })
    expect(r.hasCollision({ x: 50, y: 50, width: 10, height: 10 })).toBe(false)
  })
  test('padding catches edge-touching rects; 0 padding does not', () => {
    const r = createCollisionRegistry()
    r.add({ x: 0, y: 0, width: 10, height: 10 })
    // Rect at (11, 0) — 1 unit gap. padding=1 catches it; padding=0 does not.
    expect(r.hasCollision({ x: 11, y: 0, width: 5, height: 5 }, 1)).toBe(true)
    expect(r.hasCollision({ x: 11, y: 0, width: 5, height: 5 }, 0)).toBe(false)
  })
  test('all returns shallow copy of stored rects', () => {
    const r = createCollisionRegistry()
    r.add({ x: 1, y: 1, width: 1, height: 1 })
    r.add({ x: 2, y: 2, width: 1, height: 1 })
    const snapshot = r.all
    expect(snapshot.length).toBe(2)
    snapshot.push({ x: 99, y: 99, width: 1, height: 1 })   // mutate the snapshot
    expect(r.size).toBe(2)                                  // original unchanged
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: module-not-found error (Jest shows this as a failed suite). The module file doesn't exist yet.

- [ ] **Step 1.3: Create the module with sizing helpers + collision registry**

Write `app-backend/src/services/dxfBeaconPlacer.js`:

```js
/**
 * DXF beacon placer — pure functions for beacon label placement.
 * Matches the PDF generator's renderBeacons logic at pdfkitGeoPDF.js:4564
 * + helpers placeSuffixLabelPOIDirected (:5504), tryTightFullBeaconLabelPosition
 * (:400), and the splay-detection block (:4693-4711).
 *
 * Two DXF adaptations documented in the function headers:
 *   1. charWidthRatio = 0.55 used for label-width estimation (DXF can't query
 *      a rendered font width like the PDF's doc.widthOfString).
 *   2. Returned positions are the DXF baseline-left insertion point — the caller
 *      passes them directly to addText (no PDF-style width/2, height/2 subtraction).
 *
 * No DXF dependencies, no module state, no I/O. Pure math.
 */

import {
  isPointInPolygon,
  rectanglesOverlap,
  rectangleOverlapsPolygon,
  pointToLineDistance,
} from './dxfGeometry.js'

const PT_PER_MM = 1 / 0.352778   // ≈ 2.835

/**
 * PDF tier switch for beacon font size in points.
 * Matches pdfkitGeoPDF.js:4800-4807.
 */
export function pickBeaconFontSize(scaleValue) {
  if (scaleValue <= 500)  return 6
  if (scaleValue <= 1000) return 6.5
  if (scaleValue <= 2000) return 7
  return 7.5
}

/**
 * PDF logarithmic beacon radius in paper-mm, clamped to 1.8-3.0 pt.
 * Matches pdfkitGeoPDF.js:4629-4636.
 *
 *   baseRadiusMM × (1 + 0.15·log10(max(500, scaleValue) / 500))
 *   clamped to 1.8-3.0 pt
 */
export function computeBeaconRadius(scaleValue) {
  const baseRadiusMM = 0.75
  const scaleFactor  = 1 + 0.15 * Math.log10(Math.max(500, scaleValue) / 500)
  let rPt = baseRadiusMM * PT_PER_MM * scaleFactor
  rPt = Math.max(1.8, Math.min(3.0, rPt))
  return rPt * 0.352778   // back to mm
}

/**
 * Lightweight bbox collision tracker. No spatial index — linear scan suffices
 * for ~600 typical beacon labels per plan.
 *
 * API:
 *   add(rect)                    — record a placed bbox
 *   hasCollision(rect, padding)  — does any registered rect overlap (with padding gap)?
 *   size                         — getter, current count
 *   all                          — getter, shallow copy of stored rects (for tests)
 */
export function createCollisionRegistry() {
  const rects = []
  return {
    add(rect) { rects.push(rect) },
    hasCollision(rect, padding = 1) {
      for (const r of rects) {
        if (rectanglesOverlap(rect, r, padding)) return true
      }
      return false
    },
    get size() { return rects.length },
    get all() { return rects.slice() },
  }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: `Tests: 14 passed, 14 total`.

(The actual count: 5 pickBeaconFontSize + 3 computeBeaconRadius + 5 createCollisionRegistry = 13. The earlier estimate of "3 unit tests" in the decomposition was rough — we actually need these granular cases.)

- [ ] **Step 1.5: Run the wider dxf suite (no regression)**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 279 passed, 279 total` (266 baseline + 13 new).

- [ ] **Step 1.6: Commit**

```bash
git add app-backend/src/services/dxfBeaconPlacer.js
git add app-backend/src/services/__tests__/dxfBeaconPlacer.test.js
git commit -m "feat(dxf): beacon placer module + sizing + collision registry (#6 Task 1)"
```

---

## Task 2: Splay grouping + angular ordering

Pure proximity scan + sort. Will be consumed by Task 6's integration via BFS to assemble connected components.

**Files:**
- Modify: `app-backend/src/services/dxfBeaconPlacer.js`
- Modify: `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`

- [ ] **Step 2.1: Append failing tests**

Append to `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`:

```js
import { groupSplayBeacons, orderSplayGroupByAngle } from '../dxfBeaconPlacer.js'

describe('groupSplayBeacons', () => {
  test('two beacons within proximity → both appear with each other in neighbor lists', () => {
    const positions = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 5, y: 0 }],
    ])
    // proximityFloor = 10, beaconRadius = 1. Threshold = max(10, 6) = 10.
    // Distance A-B = 5 < 10 → close pair.
    const map = groupSplayBeacons(positions, 1, 10)
    expect(map.get('A')).toBeDefined()
    expect(map.get('B')).toBeDefined()
    expect(map.get('A').map(n => n.name)).toEqual(['B'])
    expect(map.get('B').map(n => n.name)).toEqual(['A'])
  })

  test('beacons farther than threshold are absent from the map', () => {
    const positions = new Map([
      ['A', { x: 0,    y: 0 }],
      ['B', { x: 1000, y: 0 }],
    ])
    const map = groupSplayBeacons(positions, 1, 10)
    expect(map.size).toBe(0)
  })

  test('proximityFloor wins when beaconRadius·6 is smaller', () => {
    // beaconRadius·6 = 6; proximityFloor = 10. Threshold = 10.
    // Pair at distance 8 is close.
    const positions = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 8, y: 0 }],
    ])
    const map = groupSplayBeacons(positions, 1, 10)
    expect(map.size).toBe(2)
  })

  test('beaconRadius·6 wins when proximityFloor is smaller', () => {
    // beaconRadius·6 = 60; proximityFloor = 5. Threshold = 60.
    // Pair at distance 50 is close.
    const positions = new Map([
      ['A', { x: 0,  y: 0 }],
      ['B', { x: 50, y: 0 }],
    ])
    const map = groupSplayBeacons(positions, 10, 5)
    expect(map.size).toBe(2)
  })

  test('neighbor entries include distance + position for caller introspection', () => {
    const positions = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 3, y: 4 }],   // distance 5
    ])
    const map = groupSplayBeacons(positions, 1, 10)
    const [neighbor] = map.get('A')
    expect(neighbor.name).toBe('B')
    expect(neighbor.distance).toBeCloseTo(5, 6)
    expect(neighbor.pos).toEqual({ x: 3, y: 4 })
  })
})

describe('orderSplayGroupByAngle', () => {
  test('three beacons around a centroid → clockwise from angle 0', () => {
    // Centroid of A(10,0), B(0,10), C(-10,0) is at (0, ~3.33).
    // Angles from centroid:
    //   A is at (10, -3.33) → atan2(-3.33, 10) ≈ -0.32 rad (right + down)
    //   B is at (0, 6.67)   → atan2(6.67, 0)   = π/2 ≈ 1.57 rad
    //   C is at (-10, -3.33) → atan2(-3.33, -10) ≈ -2.82 rad
    // Sorted ascending: C, A, B.
    const ordered = orderSplayGroupByAngle([
      { name: 'A', pos: { x:  10, y:  0 } },
      { name: 'B', pos: { x:   0, y: 10 } },
      { name: 'C', pos: { x: -10, y:  0 } },
    ])
    expect(ordered.map(m => m.name)).toEqual(['C', 'A', 'B'])
  })

  test('single-member group → unchanged', () => {
    const single = [{ name: 'X', pos: { x: 0, y: 0 } }]
    expect(orderSplayGroupByAngle(single)).toEqual(single)
  })

  test('empty group → empty result', () => {
    expect(orderSplayGroupByAngle([])).toEqual([])
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: ImportError (or "groupSplayBeacons is not a function") for the new test cases.

- [ ] **Step 2.3: Append the implementations**

Append to `app-backend/src/services/dxfBeaconPlacer.js`:

```js
/**
 * Splay-group detection — pure proximity scan.
 * Matches pdfkitGeoPDF.js:4693-4711 with the threshold floor supplied by the
 * caller (so the function is unit-agnostic; the DXF integration layer
 * converts the PDF's 18 pt floor to ground-metres via mm(18 * PT_TO_MM_GEN)).
 *
 * Threshold = max(proximityFloor, beaconRadius × 6).
 *
 * Returns a Map<beaconName, Array<{name, distance, pos}>>. The Map contains
 * an entry ONLY for beacons that have at least one close neighbor. Solo
 * beacons (no close neighbors) are absent from the map.
 *
 * Each entry holds the DIRECT close neighbors of that beacon (per-beacon
 * neighbor view, NOT the full connected component). The integration layer
 * stitches components via BFS over this map.
 */
export function groupSplayBeacons(beaconPositions, beaconRadius, proximityFloor) {
  const threshold = Math.max(proximityFloor, beaconRadius * 6)
  const map = new Map()
  for (const [name1, p1] of beaconPositions) {
    const close = []
    for (const [name2, p2] of beaconPositions) {
      if (name1 === name2) continue
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < threshold) close.push({ name: name2, distance: d, pos: p2 })
    }
    if (close.length > 0) map.set(name1, close)
  }
  return map
}

/**
 * Order a splay group's members clockwise from angle 0 around the group's
 * centroid. Integration uses this to place labels in a deterministic angular
 * sequence so each placer call sees only the already-placed members in the
 * collision registry.
 */
export function orderSplayGroupByAngle(members) {
  if (members.length <= 1) return members.slice()
  const cx = members.reduce((s, m) => s + m.pos.x, 0) / members.length
  const cy = members.reduce((s, m) => s + m.pos.y, 0) / members.length
  const withAngle = members.map(m => ({
    ...m,
    _angle: Math.atan2(m.pos.y - cy, m.pos.x - cx),
  }))
  withAngle.sort((a, b) => a._angle - b._angle)
  return withAngle.map(({ _angle, ...rest }) => rest)
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: `Tests: 21 passed, 21 total` (13 from Task 1 + 8 new).

- [ ] **Step 2.5: Run the wider dxf suite (no regression)**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 287 passed, 287 total`.

- [ ] **Step 2.6: Commit**

```bash
git add app-backend/src/services/dxfBeaconPlacer.js
git add app-backend/src/services/__tests__/dxfBeaconPlacer.test.js
git commit -m "feat(dxf): groupSplayBeacons + orderSplayGroupByAngle (#6 Task 2)"
```

---

## Task 3: POI-directed inside placement

Verbatim port of `pdfkitGeoPDF.js:placeSuffixLabelPOIDirected` (`:5504-5597`) with DXF adaptations.

**Files:**
- Modify: `app-backend/src/services/dxfBeaconPlacer.js`
- Modify: `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`

- [ ] **Step 3.1: Append failing tests**

Append to the test file:

```js
import { placeSuffixLabelPOIDirected } from '../dxfBeaconPlacer.js'
import { createCollisionRegistry as makeReg } from '../dxfBeaconPlacer.js'

describe('placeSuffixLabelPOIDirected', () => {
  // Standard 100×100 square parcel for most tests
  const square = [
    { x: 0,   y: 0   },
    { x: 100, y: 0   },
    { x: 100, y: 100 },
    { x: 0,   y: 100 },
  ]

  test('beacon at corner, no obstacles → position inside polygon, on interior bisector', () => {
    const result = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },   // SW corner
      polygon: square,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: makeReg(),
    })
    // Label TOP-LEFT should be at cx-5, cy-3 where (cx, cy) is the center.
    // Center should be inside the square (and toward upper-right since SW corner's
    // bisector points NE into the parcel).
    const cx = result.x + 5
    const cy = result.y + 3
    expect(cx).toBeGreaterThan(0)
    expect(cy).toBeGreaterThan(0)
    expect(cx).toBeLessThan(100)
    expect(cy).toBeLessThan(100)
    // NE bias: both should be > 0 (interior direction from SW corner)
    expect(cx).toBeGreaterThan(1)
    expect(cy).toBeGreaterThan(1)
  })

  test('collision: registered label at primary POI position → returns alternative', () => {
    const reg = makeReg()
    // First placement
    const first = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },
      polygon: square,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: reg,
    })
    reg.add({ x: first.x, y: first.y, width: 10, height: 6 })
    // Second placement should pick a different position (perturbation or
    // larger distance), still inside the polygon.
    const second = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },
      polygon: square,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: reg,
    })
    const sameSpot = Math.abs(first.x - second.x) < 0.01 && Math.abs(first.y - second.y) < 0.01
    expect(sameSpot).toBe(false)
    // Second is still inside the polygon
    const cx2 = second.x + 5
    const cy2 = second.y + 3
    expect(cx2).toBeGreaterThan(0)
    expect(cy2).toBeGreaterThan(0)
    expect(cx2).toBeLessThan(100)
    expect(cy2).toBeLessThan(100)
  })

  test('degenerate polygon (<3 unique vertices) → centroid fallback', () => {
    // Two-vertex "polygon" — degenerate.
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const result = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },
      polygon: line,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: makeReg(),
    })
    // Centroid of the two-point "polygon" = (50, 0). Label center = (50, 0),
    // top-left = (45, -3).
    expect(result.x).toBeCloseTo(45, 3)
    expect(result.y).toBeCloseTo(-3, 3)
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer" -t "placeSuffixLabelPOIDirected"`
Expected: ImportError on `placeSuffixLabelPOIDirected`.

- [ ] **Step 3.3: Append the implementation**

Append to `app-backend/src/services/dxfBeaconPlacer.js`:

```js
/**
 * INTERNAL helper: shoelace centroid (also used by the integration layer's
 * fallback paths). Same algorithm as in 4d's dxfLabelPlacer.
 */
function shoelaceCentroid(polygon) {
  let twiceArea = 0, cx = 0, cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[i]
    const p1 = polygon[(i + 1) % polygon.length]
    const cross = p0.x * p1.y - p1.x * p0.y
    twiceArea += cross
    cx += (p0.x + p1.x) * cross
    cy += (p0.y + p1.y) * cross
  }
  const sixArea = 3 * twiceArea
  if (Math.abs(sixArea) < 1e-12) {
    let sx = 0, sy = 0
    for (const p of polygon) { sx += p.x; sy += p.y }
    return { x: sx / polygon.length, y: sy / polygon.length }
  }
  return { x: cx / sixArea, y: cy / sixArea }
}

/**
 * POI-directed inside placement.
 *
 * Port of pdfkitGeoPDF.js:5504-5597 with two DXF adaptations:
 *   1. Uses caller-supplied labelWidth (DXF can't call doc.widthOfString;
 *      the integration layer estimates via `labelText.length * fontHeight *
 *      0.55`, matching the charWidthRatio constant used by 4d).
 *   2. Returns the label's top-left insertion point — caller passes
 *      directly to addText without any subtraction.
 *
 * Algorithm (paraphrased from the PDF):
 *   1. Find the ring vertex closest to beaconPos.
 *   2. Compute the interior bisector at that corner; orient toward centroid.
 *   3. Try increasing offset distances along the bisector with angle
 *      perturbations. Each candidate must (a) have its center inside the
 *      polygon, and (b) not collide with any rect in the registry.
 *   4. Fallback to centroid when all candidates fail.
 */
export function placeSuffixLabelPOIDirected({
  beaconPos, polygon, labelWidth, labelHeight, beaconRadius, registry,
}) {
  // Deduplicate closing vertex if present
  const n = polygon.length
  const last = polygon[n - 1]
  const first = polygon[0]
  const isClosed = last && first &&
    Math.abs(last.x - first.x) < 0.001 && Math.abs(last.y - first.y) < 0.001
  const ring = isClosed ? polygon.slice(0, -1) : polygon
  const rn = ring.length

  // Centroid fallback for degenerate cases
  if (rn < 3) {
    const c = shoelaceCentroid(ring)
    return { x: c.x - labelWidth / 2, y: c.y - labelHeight / 2 }
  }

  // Find closest ring vertex to beacon
  let beaconIdx = -1
  let minDist = Infinity
  for (let i = 0; i < rn; i++) {
    const dx = ring[i].x - beaconPos.x
    const dy = ring[i].y - beaconPos.y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < minDist) { minDist = d; beaconIdx = i }
  }

  // Interior bisector at that corner
  let intX = 0, intY = 1   // fallback direction
  const B = ring[beaconIdx]
  const P = ring[(beaconIdx - 1 + rn) % rn]
  const N = ring[(beaconIdx + 1) % rn]
  const v1x = P.x - B.x, v1y = P.y - B.y
  const v2x = N.x - B.x, v2y = N.y - B.y
  const len1 = Math.sqrt(v1x * v1x + v1y * v1y)
  const len2 = Math.sqrt(v2x * v2x + v2y * v2y)
  if (len1 > 0.001 && len2 > 0.001) {
    const u1x = v1x / len1, u1y = v1y / len1
    const u2x = v2x / len2, u2y = v2y / len2
    let bx = u1x + u2x, by = u1y + u2y
    const bLen = Math.sqrt(bx * bx + by * by)
    if (bLen < 0.001) {
      // 180° straight corner — use perpendicular to one edge
      bx = -u1y
      by =  u1x
    } else {
      bx /= bLen
      by /= bLen
    }
    // Orient toward interior: dot with (centroid - B) should be positive
    const centroid = shoelaceCentroid(ring)
    const dot = bx * (centroid.x - B.x) + by * (centroid.y - B.y)
    intX = dot >= 0 ? bx : -bx
    intY = dot >= 0 ? by : -by
  }

  // Minimum clearance: beacon circle + half label height + 1 unit gap
  const dMin = beaconRadius + labelHeight / 2 + 1

  // Candidate validator
  const polygonPts = ring   // already in {x, y} shape
  const tryPos = (cx, cy) => {
    if (!isPointInPolygon({ x: cx, y: cy }, polygonPts)) return false
    if (registry.hasCollision(
      { x: cx - labelWidth / 2, y: cy - labelHeight / 2, width: labelWidth, height: labelHeight },
      1,
    )) return false
    return true
  }

  const distances    = [dMin, dMin * 1.3, dMin * 1.7, dMin * 2.2, dMin * 3.0, dMin * 4.0]
  const perturbsDeg  = [0, 10, -10, 20, -20, 30, -30, 45, -45]

  for (const dist of distances) {
    for (const pd of perturbsDeg) {
      const rad = pd * Math.PI / 180
      const cosP = Math.cos(rad), sinP = Math.sin(rad)
      const dx = intX * cosP - intY * sinP
      const dy = intX * sinP + intY * cosP
      const cx = beaconPos.x + dx * dist
      const cy = beaconPos.y + dy * dist
      if (tryPos(cx, cy)) {
        return { x: cx - labelWidth / 2, y: cy - labelHeight / 2 }
      }
    }
  }

  // Fallback: centroid (caller's leader-distance check decides whether to draw a leader)
  const centroid = shoelaceCentroid(ring)
  return { x: centroid.x - labelWidth / 2, y: centroid.y - labelHeight / 2 }
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: `Tests: 24 passed, 24 total` (21 from prior tasks + 3 new).

- [ ] **Step 3.5: Run the wider dxf suite**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 290 passed, 290 total`.

- [ ] **Step 3.6: Commit**

```bash
git add app-backend/src/services/dxfBeaconPlacer.js
git add app-backend/src/services/__tests__/dxfBeaconPlacer.test.js
git commit -m "feat(dxf): placeSuffixLabelPOIDirected (#6 Task 3)"
```

---

## Task 4: Tight outside placement

Port of `pdfkitGeoPDF.js:400-446`. Two candidates: right, then left.

**Files:**
- Modify: `app-backend/src/services/dxfBeaconPlacer.js`
- Modify: `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`

- [ ] **Step 4.1: Append failing tests**

Append to the test file:

```js
import { tryTightFullBeaconLabelPosition } from '../dxfBeaconPlacer.js'

describe('tryTightFullBeaconLabelPosition', () => {
  test('beacon left of parcel → returns right candidate; left would be inside parcel', () => {
    const parcel = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    const result = tryTightFullBeaconLabelPosition({
      beaconPos: { x: -5, y: 25 },   // outside left edge
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1, padding: 0.5,
      incidentPolygons: [parcel],
      registry: createCollisionRegistry(),
    })
    expect(result).not.toBeNull()
    expect(result.position).toBe('right')
    // 'right' x = beacon.x + radius + padding = -5 + 1 + 0.5 = -3.5
    expect(result.x).toBeCloseTo(-3.5, 3)
    // y centered = beacon.y - h/2 = 25 - 3 = 22
    expect(result.y).toBeCloseTo(22, 3)
  })

  test('both sides blocked by registry → returns null', () => {
    const parcel = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    const reg = createCollisionRegistry()
    // Block both right and left of beacon at (60, 25)
    reg.add({ x: 61, y: 22, width: 10, height: 6 })   // covers right candidate
    reg.add({ x: 49, y: 22, width: 10, height: 6 })   // covers left candidate
    const result = tryTightFullBeaconLabelPosition({
      beaconPos: { x: 60, y: 25 },
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 0.5, padding: 0.5,
      incidentPolygons: [parcel],
      registry: reg,
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer" -t "tryTightFullBeaconLabelPosition"`
Expected: ImportError on the new export.

- [ ] **Step 4.3: Append the implementation**

Append to `app-backend/src/services/dxfBeaconPlacer.js`:

```js
/**
 * INTERNAL helper: returns true iff the rect lies entirely outside every
 * polygon in the list. Wraps 4a's rectangleOverlapsPolygon (inverted).
 */
function isRectOutsidePolygons(rect, polygons) {
  for (const poly of polygons) {
    if (rectangleOverlapsPolygon(rect, poly, 0)) return false
  }
  return true
}

/**
 * Tight outside placement — two candidates only: right then left.
 *
 * Port of pdfkitGeoPDF.js:400-446. Returns the chosen label's top-left
 * insertion point + which side it was placed on, or null when both sides
 * fail validation.
 *
 * A candidate passes when (a) the bbox lies outside every incidentPolygon
 * (via 4a's rectangleOverlapsPolygon, inverted), and (b) the registry
 * reports no collision.
 */
export function tryTightFullBeaconLabelPosition({
  beaconPos, labelWidth, labelHeight, beaconRadius, padding,
  incidentPolygons, registry,
}) {
  const baseY = beaconPos.y - labelHeight / 2
  const candidates = [
    {
      name: 'right',
      x: beaconPos.x + beaconRadius + padding,
      y: baseY,
    },
    {
      name: 'left',
      x: beaconPos.x - beaconRadius - padding - labelWidth,
      y: baseY,
    },
  ]

  for (const c of candidates) {
    const rect = { x: c.x, y: c.y, width: labelWidth, height: labelHeight }
    if (
      Array.isArray(incidentPolygons) && incidentPolygons.length > 0 &&
      !isRectOutsidePolygons(rect, incidentPolygons)
    ) continue
    if (registry.hasCollision(rect, 1)) continue
    return { x: c.x, y: c.y, position: c.name }
  }

  return null
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: `Tests: 26 passed, 26 total` (24 + 2 new).

- [ ] **Step 4.5: Run the wider dxf suite**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 292 passed, 292 total`.

- [ ] **Step 4.6: Commit**

```bash
git add app-backend/src/services/dxfBeaconPlacer.js
git add app-backend/src/services/__tests__/dxfBeaconPlacer.test.js
git commit -m "feat(dxf): tryTightFullBeaconLabelPosition (#6 Task 4)"
```

---

## Task 5: Edge-anchored outside placement

Adapted port — PDF version is more complex; this is a simpler edge-anchor with walk-along fallback.

**Files:**
- Modify: `app-backend/src/services/dxfBeaconPlacer.js`
- Modify: `app-backend/src/services/__tests__/dxfBeaconPlacer.test.js`

- [ ] **Step 5.1: Append failing tests**

Append to the test file:

```js
import { calculateFullBeaconLabelOutsideOnEdge } from '../dxfBeaconPlacer.js'

describe('calculateFullBeaconLabelOutsideOnEdge', () => {
  test('beacon at center of top edge of a square → label sits outside (above) that edge', () => {
    const square = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    const result = calculateFullBeaconLabelOutsideOnEdge({
      beaconPos: { x: 25, y: 50 },   // on top edge
      incidentPolygons: [square],
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: createCollisionRegistry(),
    })
    expect(result).not.toBeNull()
    // Outward normal of top edge (y=50) points in +y direction.
    // Center = foot + outwardNormal × (1 + 3 + 1) = (25, 50) + (0, 5) = (25, 55).
    // Top-left = (20, 52).
    const cx = result.x + 5
    const cy = result.y + 3
    expect(cx).toBeCloseTo(25, 3)
    expect(cy).toBeGreaterThan(50)
  })

  test('no incident polygons → null', () => {
    const result = calculateFullBeaconLabelOutsideOnEdge({
      beaconPos: { x: 0, y: 0 },
      incidentPolygons: [],
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: createCollisionRegistry(),
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer" -t "calculateFullBeaconLabelOutsideOnEdge"`
Expected: ImportError.

- [ ] **Step 5.3: Append the implementation**

Append to `app-backend/src/services/dxfBeaconPlacer.js`:

```js
/**
 * Edge-anchored outside placement (fallback after tryTightFullBeaconLabelPosition).
 *
 * Adapted port — PDF's calculateFullBeaconLabelOutsideOnEdge has additional
 * scale-aware logic; this DXF version finds the nearest polygon edge across all
 * incidentPolygons, computes its outward normal, and places the label bbox so
 * its CENTER sits at `foot + outwardNormal · (beaconRadius + labelHeight/2 + 1)`.
 *
 * If the chosen position fails validation (overlaps an incident polygon or
 * collides with the registry), walk along the edge in both directions in
 * labelWidth/4 steps up to 2·labelWidth, retrying. Returns null when nothing fits.
 *
 * Returns the label's top-left insertion point or null.
 */
export function calculateFullBeaconLabelOutsideOnEdge({
  beaconPos, incidentPolygons, labelWidth, labelHeight, beaconRadius, registry,
}) {
  if (!Array.isArray(incidentPolygons) || incidentPolygons.length === 0) {
    return null
  }

  // 1. Find the nearest polygon edge across all incidentPolygons.
  let nearestEdge = null
  let nearestPoly = null
  let nearestDist = Infinity
  for (const poly of incidentPolygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const d = pointToLineDistance(beaconPos, a, b)
      if (d < nearestDist) {
        nearestDist = d
        nearestEdge = { a, b }
        nearestPoly = poly
      }
    }
  }
  if (!nearestEdge) return null

  const { a, b } = nearestEdge
  // 2. Project beacon onto the edge to get the foot point.
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edgeLen = Math.sqrt(dx * dx + dy * dy)
  if (edgeLen < 1e-6) return null
  const ux = dx / edgeLen
  const uy = dy / edgeLen
  const t = ((beaconPos.x - a.x) * ux + (beaconPos.y - a.y) * uy)
  // Clamp t into the segment [0, edgeLen]
  const tClamped = Math.max(0, Math.min(edgeLen, t))
  const footX = a.x + ux * tClamped
  const footY = a.y + uy * tClamped

  // 3. Outward normal of the edge — pick the direction that lies outside the polygon.
  // Edge tangent (u). Two candidate normals: (-uy, ux) and (uy, -ux).
  let nx = -uy, ny = ux
  // Test midpoint + tiny step in (nx, ny). If inside the polygon, flip.
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const step = Math.max(1e-3, edgeLen * 0.001)
  const probe = { x: midX + nx * step, y: midY + ny * step }
  if (isPointInPolygon(probe, nearestPoly)) {
    nx = -nx; ny = -ny
  }

  // 4. Primary placement: center = foot + outwardNormal × offset
  const offset = beaconRadius + labelHeight / 2 + 1
  const placeAt = (cx, cy) => ({
    x: cx - labelWidth / 2,
    y: cy - labelHeight / 2,
  })
  const validate = (rect) => {
    if (!isRectOutsidePolygons(rect, incidentPolygons)) return false
    if (registry.hasCollision(rect, 1)) return false
    return true
  }

  const tryCenter = (cx, cy) => {
    const tl = placeAt(cx, cy)
    const rect = { x: tl.x, y: tl.y, width: labelWidth, height: labelHeight }
    return validate(rect) ? tl : null
  }

  const primary = tryCenter(footX + nx * offset, footY + ny * offset)
  if (primary) return primary

  // 5. Walk along the edge in both directions; labelWidth/4 step up to 2·labelWidth.
  const walkStep = labelWidth / 4
  const maxWalk = labelWidth * 2
  for (let s = walkStep; s <= maxWalk; s += walkStep) {
    for (const sign of [+1, -1]) {
      const wx = footX + ux * sign * s + nx * offset
      const wy = footY + uy * sign * s + ny * offset
      const tl = tryCenter(wx, wy)
      if (tl) return tl
    }
  }

  return null
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `cd app-backend && npm test -- --testPathPatterns="dxfBeaconPlacer"`
Expected: `Tests: 28 passed, 28 total` (26 + 2 new).

- [ ] **Step 5.5: Run the wider dxf suite**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 294 passed, 294 total`.

- [ ] **Step 5.6: Commit**

```bash
git add app-backend/src/services/dxfBeaconPlacer.js
git add app-backend/src/services/__tests__/dxfBeaconPlacer.test.js
git commit -m "feat(dxf): calculateFullBeaconLabelOutsideOnEdge (#6 Task 5)"
```

---

## Task 6: Integration into dxfGenerator.js

The big task. Six in-place changes to wire the new module into the existing beacon emission section.

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`

- [ ] **Step 6.1: Add the import**

Find the existing imports near the top of `app-backend/src/services/dxfGenerator.js`. Add a new import line after the existing `dxfLabelPlacer` import:

```js
import {
  placeSuffixLabelPOIDirected,
  tryTightFullBeaconLabelPosition,
  calculateFullBeaconLabelOutsideOnEdge,
  pickBeaconFontSize,
  computeBeaconRadius,
  groupSplayBeacons,
  orderSplayGroupByAngle,
  createCollisionRegistry,
} from './dxfBeaconPlacer.js'
```

- [ ] **Step 6.2: Swap the fixed sizing for scale-aware sizing**

Find these three lines (around `dxfGenerator.js:482-484`):

```js
  const beaconRadius = ptToGround(1.5, S);
  const beaconLabelHeight = ptToGround(6, S);
  const beaconLabelOffset = beaconRadius + ptToGround(1, S);
```

Replace with:

```js
  // PDF-parity sizing (#6 Task 6.2). Replaces fixed pt(1.5)/pt(6)/pt(1)+radius
  // with scale-aware values matching pdfkitGeoPDF.js:renderBeacons:4629-4636
  // (logarithmic radius, 1.8-3.0 pt clamp) and :4800-4807 (font tier switch).
  const beaconFontSizePt  = pickBeaconFontSize(S);
  const beaconLabelHeight = ptToGround(beaconFontSizePt, S);     // ground-metres
  const beaconRadiusMM    = computeBeaconRadius(S);              // paper-mm
  const beaconRadius      = mmToGround(beaconRadiusMM, S);       // ground-metres
  const beaconLabelOffset = beaconRadius + mmToGround(1, S);     // legacy fallback offset (used when all placers fail)
```

- [ ] **Step 6.3: Replace the labelDecision body and delete the helpers**

Find this block (currently around `dxfGenerator.js:1207-1280` — exact lines vary):

```js
  // Helper: decide displayLabel + position for one beacon.
  // Returns null when the label should be suppressed (no text emitted).
  const beaconLabelInsideOffset = beaconRadius + mmToGround(1.5, S); // toward centroid
  const labelDecision = (beaconName, pt) => {
    if (!beaconName) return null;

    // PRIORITY 1: UI-supplied label.
    const uiLabel = beaconLabelMap.get(beaconName);
    if (uiLabel) {
      if (uiLabel.labelType === 'suppressed') return null;
      const text = String(uiLabel.text || '');
      if (!text) return null;
      if (uiLabel.isInsideParcel && uiLabel.displayInParcel != null) {
        const poly = parcelById.get(String(uiLabel.displayInParcel));
        if (poly) return placeInsideParcel(pt, poly, text);
      }
      return placeOutsideParcel(pt, text);
    }

    // PRIORITY 2: pattern-matched fallback (matches PDF:4855-4951).
    const m = beaconName.match(/^(\d+)([A-Za-z]+)$/);
    if (m) {
      const prefix = m[1];
      const suffix = m[2].toUpperCase();
      const poly = parcelByStand.get(prefix);
      if (poly) return placeInsideParcel(pt, poly, suffix);
    }
    // Control beacons (no numeric prefix) or unmatched: full name outside.
    return placeOutsideParcel(pt, beaconName);
  };

  // Place a label INSIDE a parcel: project from the beacon toward the parcel's
  // centroid by `beaconLabelInsideOffset`. Keeps the label adjacent to its
  // beacon while orienting it into the parcel's interior.
  function placeInsideParcel(pt, poly, text) {
    const centroid = shoelaceCentroid(poly);
    let dx = centroid.x - pt.x;
    let dy = centroid.y - pt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return placeOutsideParcel(pt, text);
    dx /= len; dy /= len;
    return { x: pt.x + dx * beaconLabelInsideOffset, y: pt.y + dy * beaconLabelInsideOffset, text };
  }

  // Place a label OUTSIDE the parcel: small (+x, +y) offset from beacon.
  // Matches the existing pre-3-v2 convention and the PDF's `closeOffset` fallback.
  function placeOutsideParcel(pt, text) {
    return { x: pt.x + beaconLabelOffset, y: pt.y + beaconLabelOffset, text };
  }
```

Replace the entire block with:

```js
  // Helper: decide displayLabel + which parcel polygon to use for inside
  // placement. Returns null when the label should be suppressed.
  // Position computation is the placer's job — done downstream in the beacon
  // emission loop using the new dxfBeaconPlacer module.
  const labelDecision = (beaconName) => {
    if (!beaconName) return null;

    // PRIORITY 1: UI-supplied label.
    const uiLabel = beaconLabelMap.get(beaconName);
    if (uiLabel) {
      if (uiLabel.labelType === 'suppressed') return null;
      const text = String(uiLabel.text || '');
      if (!text) return null;
      if (uiLabel.isInsideParcel && uiLabel.displayInParcel != null) {
        const polygon = parcelById.get(String(uiLabel.displayInParcel));
        if (polygon) return { text, isInsideParcel: true, polygon };
      }
      return { text, isInsideParcel: false, polygon: null };
    }

    // PRIORITY 2: pattern-matched fallback (matches PDF:4855-4951).
    const m = beaconName.match(/^(\d+)([A-Za-z]+)$/);
    if (m) {
      const polygon = parcelByStand.get(m[1]);
      if (polygon) return { text: m[2].toUpperCase(), isInsideParcel: true, polygon };
    }
    return { text: beaconName, isInsideParcel: false, polygon: null };
  };
```

- [ ] **Step 6.4: Add pre-loop setup and refactor the beacon loop**

Find the existing beacon loop (currently around `dxfGenerator.js:1281-1330`). The loop iterates `beacons.features`, computes the beacon pt, filters via `ofPolygon` buffer, emits the circle, emits the label.

Replace the loop and add pre-loop setup. Replace this block:

```js
  if (beacons?.features) {
    for (const feature of beacons.features) {
      const rc = feature.geometry?.coordinates;
      if (!Array.isArray(rc) || rc.length < 2) continue;

      // Guard: skip beacons with NaN/Infinity coords or unreasonable magnitudes
      const [byRaw, bxRaw] = rc;
      if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
          || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) {
        logger.warn(`[DXF] dropped beacon ${feature.properties?.pointId || '<unnamed>'}: bad coords`)
        warn('beacons')
        continue
      }

      const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

      // Filter: only beacons within outside figure + 2m buffer
      if (ofPolygon && !isWithinPolygonBuffer(pt.x, pt.y, ofPolygon, BEACON_BUFFER)) {
        beaconsSkipped++;
        continue;
      }

      trackPt(pt);
      const beaconType = feature.properties?.type || 'placed'
      const beaconDiameter = mmToGround(2.4, S)
      addBeaconSymbol('BEACONS', pt.x, pt.y, beaconType, beaconDiameter);
      const name = feature.properties?.pointId
                || feature.properties?.name
                || feature.properties?.beacon_name
                || '';
      const decision = labelDecision(name, pt);
      if (decision) {
        addText('BEACON_LABELS', decision.x, decision.y, decision.text, beaconLabelHeight);
      }
      beaconCount++;
    }
  }
```

with the new setup-plus-loop:

```js
  // ── Pre-loop setup (#6 Task 6.4) ───────────────────────────────────────────
  // Map beaconName → DXF position, used by splay detection + incidentParcels lookup.
  const beaconPositions = new Map();
  if (beacons?.features) {
    for (const f of beacons.features) {
      const rc = f.geometry?.coordinates;
      if (!Array.isArray(rc) || rc.length < 2) continue;
      const [byRaw, bxRaw] = rc;
      if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
          || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) continue;
      const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      const name = f.properties?.pointId || f.properties?.name || f.properties?.beacon_name;
      if (name) beaconPositions.set(name, pt);
    }
  }

  // For each beacon, find the parcel polygons whose vertex matches the beacon.
  // Used by tryTightFullBeaconLabelPosition and calculateFullBeaconLabelOutsideOnEdge.
  const incidentParcelsByBeacon = new Map();
  for (const [name, pt] of beaconPositions) {
    const inc = [];
    if (parcels?.features) {
      for (const f of parcels.features) {
        if (f.properties?.isOutsideFigure) continue;
        const coords = f.geometry?.coordinates?.[0];
        if (!Array.isArray(coords) || coords.length < 4) continue;
        const poly = coords.slice(0, -1).map(c => capeLoToDxfSouthUp(c[0], c[1]));
        if (poly.some(p => Math.abs(p.x - pt.x) < 0.01 && Math.abs(p.y - pt.y) < 0.01)) {
          inc.push(poly);
        }
      }
    }
    if (inc.length > 0) incidentParcelsByBeacon.set(name, inc);
  }

  // Splay groups + iteration order (deterministic across runs).
  const PT_TO_MM_GEN = 25.4 / 72;
  const proximityFloorG = mmToGround(18 * PT_TO_MM_GEN, S);
  const splayMap = groupSplayBeacons(beaconPositions, beaconRadius, proximityFloorG);
  const iterationOrder = computeBeaconIterationOrder(beacons?.features || [], beaconPositions, splayMap);

  const registry = createCollisionRegistry();
  const deferredCircles = [];
  const LEADER_THRESHOLD = beaconRadius * 3;

  // ── Beacon emission loop (#6 Task 6.4) ─────────────────────────────────────
  for (const feature of iterationOrder) {
    const rc = feature.geometry?.coordinates;
    if (!Array.isArray(rc) || rc.length < 2) continue;

    const [byRaw, bxRaw] = rc;
    if (!Number.isFinite(byRaw) || !Number.isFinite(bxRaw)
        || Math.abs(byRaw) > 1e7 || Math.abs(bxRaw) > 1e7) {
      logger.warn(`[DXF] dropped beacon ${feature.properties?.pointId || '<unnamed>'}: bad coords`);
      warn('beacons');
      continue;
    }
    const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

    // Filter: only beacons within outside figure + 2m buffer.
    if (ofPolygon && !isWithinPolygonBuffer(pt.x, pt.y, ofPolygon, BEACON_BUFFER)) {
      beaconsSkipped++;
      continue;
    }

    trackPt(pt);
    const beaconType = feature.properties?.type || 'placed';
    const beaconDiameter = beaconRadius * 2;

    // Defer the beacon symbol — emitted after all labels so circles sit on top.
    deferredCircles.push({ x: pt.x, y: pt.y, type: beaconType, diameter: beaconDiameter });
    beaconCount++;

    const name = feature.properties?.pointId
              || feature.properties?.name
              || feature.properties?.beacon_name
              || '';
    if (!name) continue;
    const decision = labelDecision(name);
    if (!decision) continue;

    const labelText    = decision.text;
    const labelWidth   = labelText.length * beaconLabelHeight * 0.55;
    const labelHeightG = beaconLabelHeight * 1.2;

    let labelPos;
    if (decision.isInsideParcel && decision.polygon) {
      labelPos = placeSuffixLabelPOIDirected({
        beaconPos: pt, polygon: decision.polygon,
        labelWidth, labelHeight: labelHeightG,
        beaconRadius, registry,
      });
    } else {
      const incident = incidentParcelsByBeacon.get(name) || [];
      const padding  = mmToGround(0.8, S);
      labelPos =
        tryTightFullBeaconLabelPosition({
          beaconPos: pt, labelWidth, labelHeight: labelHeightG,
          beaconRadius, padding, incidentPolygons: incident, registry,
        })
        || calculateFullBeaconLabelOutsideOnEdge({
          beaconPos: pt, incidentPolygons: incident,
          labelWidth, labelHeight: labelHeightG,
          beaconRadius, registry,
        })
        || {
          x: pt.x + beaconLabelOffset,
          y: pt.y + beaconLabelOffset,
        };
    }

    registry.add({ x: labelPos.x, y: labelPos.y, width: labelWidth, height: labelHeightG });
    addText('BEACON_LABELS', labelPos.x, labelPos.y, labelText, beaconLabelHeight);

    // Leader line: emit when label center is farther than LEADER_THRESHOLD from beacon.
    const lcx = labelPos.x + labelWidth / 2;
    const lcy = labelPos.y + labelHeightG / 2;
    if (Math.hypot(lcx - pt.x, lcy - pt.y) > LEADER_THRESHOLD) {
      const angle       = Math.atan2(pt.y - lcy, pt.x - lcx);
      const beaconEdgeX = pt.x - Math.cos(angle) * beaconRadius;
      const beaconEdgeY = pt.y - Math.sin(angle) * beaconRadius;
      const closestX    = Math.max(labelPos.x, Math.min(pt.x, labelPos.x + labelWidth));
      const closestY    = Math.max(labelPos.y, Math.min(pt.y, labelPos.y + labelHeightG));
      addLine('BEACON_LABELS', beaconEdgeX, beaconEdgeY, closestX, closestY);
    }
  }

  // ── Deferred-circle z-order: emit beacon symbols AFTER all labels ──────────
  for (const c of deferredCircles) {
    addBeaconSymbol('BEACONS', c.x, c.y, c.type, c.diameter);
  }
```

- [ ] **Step 6.5: Add the iteration-order helper function**

The integration code references `computeBeaconIterationOrder`. Add this helper inline in `generateDXF` (right before the `if (beacons?.features) {` setup block — anywhere in the function scope works since it's hoisted). Insert it just above `// ── 4. Beacons (filtered to outside figure + 2m buffer) ──`:

```js
  /**
   * Walk splay components via BFS, order each by angle, return a flat list
   * of beacon features in emission order. Solo beacons (not in any splay
   * group) appear in their original input order.
   */
  function computeBeaconIterationOrder(features, beaconPositions, splayMap) {
    const beaconsByName = new Map(features.map(f => {
      const n = f.properties?.pointId || f.properties?.name || f.properties?.beacon_name;
      return [n, f];
    }));
    const emitted = new Set();
    const order = [];
    for (const f of features) {
      const name = f.properties?.pointId || f.properties?.name || f.properties?.beacon_name;
      if (!name || emitted.has(name)) continue;
      const neighbors = splayMap.get(name);
      if (!neighbors || neighbors.length === 0) {
        order.push(f);
        emitted.add(name);
        continue;
      }
      // BFS across splayMap to gather the full connected component.
      const component = new Set([name]);
      const queue = [name];
      while (queue.length) {
        const cur = queue.shift();
        for (const n of (splayMap.get(cur) || [])) {
          if (!component.has(n.name)) { component.add(n.name); queue.push(n.name); }
        }
      }
      // Order by angle around component centroid.
      const members = [...component].map(n => ({ name: n, pos: beaconPositions.get(n) }));
      for (const m of orderSplayGroupByAngle(members)) {
        const feat = beaconsByName.get(m.name);
        if (feat) order.push(feat);
        emitted.add(m.name);
      }
    }
    return order;
  }
```

- [ ] **Step 6.6: Run the wider dxf suite — find any regressions**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`

Expected: most tests pass. **Two existing tests may need adjustment** due to the new scale-aware sizing:

- Any test asserting on exact beacon circle radius (group code 40 on BEACONS layer) — adjust to the new computed value.
- Any test asserting on exact beacon label height — adjust to the new `ptToGround(pickBeaconFontSize(S), S)` value.

For each failing test, examine the failure, update the expected value to match the new formula, and re-run. If the failure looks structural (not a numeric shift), investigate before changing the test — it may be a real regression.

Expected final pass count: 294 tests (266 baseline + 28 placer module tests).

- [ ] **Step 6.7: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js
git commit -m "feat(dxf): integrate dxfBeaconPlacer into dxfGenerator (#6 Task 6)"
```

---

## Task 7: Add 5 new integration tests

Lock in the high-level behaviors that the unit tests don't cover.

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

- [ ] **Step 7.1: Locate the existing beacon-labeling describe block**

Find the `describe('dxfGenerator integration — beacon labeling', () => { ... })` block in `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. It currently contains 3 tests (pattern-match suffix, UI labelType=full, UI labelType=suppressed) shipped in 3-v3.

- [ ] **Step 7.2: Append the 5 new tests inside that describe block (before its closing brace)**

```js
  test('beacon symbols emit AFTER all labels (deferred-circle z-order)', () => {
    const r = generateDXF(sampleFixture, fakeLogger)
    const dxf = r.buffer.toString()
    // Find the last TEXT entity on BEACON_LABELS and the first CIRCLE entity on BEACONS.
    // The first CIRCLE must come AFTER the last TEXT.
    const lines = dxf.split('\n')
    let lastBeaconLabelIdx = -1
    let firstBeaconCircleIdx = -1
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].trim() === 'TEXT') {
        // Find this entity's layer
        for (let j = i + 1; j < Math.min(i + 30, lines.length - 1); j++) {
          if (lines[j].trim() === '8' && lines[j + 1].trim() === 'BEACON_LABELS') {
            lastBeaconLabelIdx = i
            break
          }
          if (lines[j].trim() === '1') break  // hit the text content — no layer match
        }
      }
      if (lines[i].trim() === 'CIRCLE' && firstBeaconCircleIdx === -1) {
        for (let j = i + 1; j < Math.min(i + 30, lines.length - 1); j++) {
          if (lines[j].trim() === '8' && lines[j + 1].trim() === 'BEACONS') {
            firstBeaconCircleIdx = i
            break
          }
        }
      }
    }
    expect(lastBeaconLabelIdx).toBeGreaterThan(-1)
    expect(firstBeaconCircleIdx).toBeGreaterThan(-1)
    expect(firstBeaconCircleIdx).toBeGreaterThan(lastBeaconLabelIdx)
  })

  test('beacon radius scales with scale (logarithmic, clamped)', () => {
    const small = generateDXF({ ...sampleFixture, scale: '1:500' }, fakeLogger)
    const large = generateDXF({ ...sampleFixture, scale: '1:5000' }, fakeLogger)
    // Extract the first CIRCLE radius (group code 40) on BEACONS layer
    const radiusOf = (dxf) => {
      const lines = dxf.split('\n')
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() !== 'CIRCLE') continue
        let layer = null, r = null
        for (let j = i + 1; j < Math.min(i + 30, lines.length - 1); j++) {
          if (lines[j].trim() === '8') layer = lines[j + 1].trim()
          if (lines[j].trim() === '40') { r = parseFloat(lines[j + 1]); break }
        }
        if (layer === 'BEACONS') return r
      }
      return null
    }
    const r500  = radiusOf(small.buffer.toString())
    const r5000 = radiusOf(large.buffer.toString())
    expect(r500).not.toBeNull()
    expect(r5000).not.toBeNull()
    // r5000 > r500 (logarithmic growth) AND r5000 <= 3pt clamp (in ground-m at S=5000).
    expect(r5000).toBeGreaterThan(r500)
    // 3 pt at S=5000: 3 * 5000 * 0.000352778 ≈ 5.29 m ground
    expect(r5000).toBeLessThanOrEqual(5.29 + 0.01)
  })

  test('beacon font size scales with scale (PDF tier switch)', () => {
    const small  = generateDXF({ ...sampleFixture, scale: '1:500' }, fakeLogger)
    const medium = generateDXF({ ...sampleFixture, scale: '1:1500' }, fakeLogger)
    // Extract the first TEXT height (group code 40) on BEACON_LABELS layer.
    const heightOf = (dxf) => {
      const lines = dxf.split('\n')
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() !== 'TEXT') continue
        let layer = null, h = null
        for (let j = i + 1; j < Math.min(i + 30, lines.length - 1); j++) {
          if (lines[j].trim() === '8') layer = lines[j + 1].trim()
          if (lines[j].trim() === '40') { h = parseFloat(lines[j + 1]); break }
        }
        if (layer === 'BEACON_LABELS') return h
      }
      return null
    }
    const h500  = heightOf(small.buffer.toString())
    const h1500 = heightOf(medium.buffer.toString())
    expect(h500).not.toBeNull()
    expect(h1500).not.toBeNull()
    // 1:500 uses font 6 pt → h500 = 6 * 500 * 0.000352778 ≈ 1.058 m ground
    // 1:1500 uses font 7 pt → h1500 = 7 * 1500 * 0.000352778 ≈ 3.704 m ground
    expect(h500).toBeCloseTo(1.058, 1)
    expect(h1500).toBeCloseTo(3.704, 1)
  })

  test('leader line emitted when label-to-beacon distance exceeds threshold', () => {
    // Force the POI placer to fall back to centroid by using a very small parcel
    // with the beacon at one corner — the centroid is far from the beacon.
    // Then verify an extra LINE entity appears on BEACON_LABELS layer.
    const tinyParcelFixture = {
      ...sampleFixture,
      parcels: { type: 'FeatureCollection', features: [{
        type: 'Feature',
        properties: { stand: '999', id: 999 },
        geometry: { type: 'Polygon', coordinates: [[
          [50000, 2200000], [50001, 2200000], [50001, 2200001], [50000, 2200001], [50000, 2200000],
        ]]},
      }]},
      beacons: { type: 'FeatureCollection', features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [50000, 2200000] },
        properties: { pointId: '999A' },
      }]},
    }
    const r = generateDXF(tinyParcelFixture, fakeLogger)
    const dxf = r.buffer.toString()
    // Count LINE entities on BEACON_LABELS layer
    expect(entityCount(dxf, 'LINE', 'BEACON_LABELS')).toBeGreaterThan(0)
  })

  test('splay group iteration order is deterministic across runs', () => {
    // Build a fixture with 3 close beacons + 1 isolated.
    const splayFixture = {
      ...sampleFixture,
      beacons: { type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [50000.0, 2200000.0] }, properties: { pointId: 'A1' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [50000.5, 2200000.5] }, properties: { pointId: 'A2' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [50001.0, 2200000.0] }, properties: { pointId: 'A3' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [60000.0, 2210000.0] }, properties: { pointId: 'B1' } },
      ]},
    }
    const run1 = generateDXF(splayFixture, fakeLogger).buffer.toString()
    const run2 = generateDXF(splayFixture, fakeLogger).buffer.toString()
    // Both runs must produce identical output (deterministic emission order).
    expect(run1).toBe(run2)
  })
```

- [ ] **Step 7.3: Run the dxf suite**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`
Expected: `Tests: 299 passed, 299 total` (294 from previous tasks + 5 new).

- [ ] **Step 7.4: Commit**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): 5 integration tests for beacon enrichment (#6 Task 7) — sub-project #6 complete"
```

---

## Post-implementation

After Task 7 commits:

1. Re-run the full dxf suite once more to confirm a clean green: `cd app-backend && npm test -- --testPathPatterns="dxf"` → expect ~299 passing.
2. Invoke `superpowers:finishing-a-development-branch` to handle the merge / PR / discard decision.
3. After merge, update memory:
   - Mark sub-project #6 as ✅ shipped in `surveypro-pdfkit-rebaseline-status.md`.
   - Move sub-project #5 to "next" in the table.

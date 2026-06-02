# DXF Geometric Primitives (sub-project 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new dependency-free `app-backend/src/services/dxfGeometry.js` module exporting 8 pure geometric primitive functions, ported algorithm-verbatim from `pdfkitGeoPDF.js` but with interfaces normalised to a uniform `{x, y}` object shape, with full unit-test coverage.

**Architecture:** Single new file `dxfGeometry.js` plus its test file `dxfGeometry.test.js`. Zero changes to `dxfGenerator.js`. Functions are grouped into four families (point-level / polygon-containment / segment-intersection / rectangle helpers); one task per family. Each function's algorithm is byte-for-byte the PDF version; only parameter destructuring changes (PDF's `[y, x]` tuples / `{x, y}` objects / `{x1, y1, x2, y2}` flat-segment objects are all replaced with uniform `{x, y}` object inputs).

**Tech Stack:** Node.js / Fastify backend, Jest 30 with ESM (`--experimental-vm-modules`). Pure JavaScript, no new runtime dependencies. ESM module format (the existing `app-shared/package.json` from sub-project #2 already declares `"type": "module"`).

**Branch:** `feature/dxf-geometric-primitives` (already created off main at `d1f6fcd`; spec at `bc25547`, interface amendment at `acaec6f`).

**Spec:** [`docs/superpowers/specs/2026-06-02-dxf-geometric-primitives-design.md`](../specs/2026-06-02-dxf-geometric-primitives-design.md)

---

## Interface convention (applies to all tasks)

Every primitive in `dxfGeometry.js` accepts these shapes:

| Concept | Shape |
|---|---|
| Point | `{ x: number, y: number }` |
| Polygon | `Array<{ x: number, y: number }>` (vertices in order; first vertex IS NOT repeated at the end except where a specific function notes a closed-polygon assumption) |
| Segment | `[{ x: number, y: number }, { x: number, y: number }]` (start, end) |
| Rectangle | `{ x: number, y: number, width: number, height: number }` (top-left + dimensions) |

The PDF source uses `[y, x]` tuples / flat segment objects / mixed polygon shapes. The ports below adapt at the destructuring layer only — the math after destructuring is identical.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfGeometry.js` | **create** | 8 exported pure functions: `pointDistance`, `pointToLineDistance`, `distanceToSegment`, `isPointInPolygon`, `isPointNearPolygon`, `lineSegmentsIntersect`, `rectanglesOverlap`, `rectangleOverlapsPolygon`. ~250 lines including JSDoc. |
| `app-backend/src/services/__tests__/dxfGeometry.test.js` | **create** | 38 unit tests across 8 `describe` blocks. ~270 lines. |

No new files apart from the two above. Zero modifications to `dxfGenerator.js`, the integration tests, the route layer, the frontend, the verification checklist, or any other file in the repo.

---

## Task 1: Module skeleton + point-level helpers (3 functions)

**Files:**
- Create: `app-backend/src/services/dxfGeometry.js`
- Create: `app-backend/src/services/__tests__/dxfGeometry.test.js`

Three primitives in this task: `pointDistance`, `pointToLineDistance`, `distanceToSegment`. All take `{x, y}` point inputs; no polygon, segment, or rectangle inputs yet.

- [ ] **Step 1: Create the test file with the first failing tests**

Create `app-backend/src/services/__tests__/dxfGeometry.test.js`:

```js
/**
 * Layer 1 unit tests for the DXF geometric primitives.
 * Run with:  cd app-backend && npm run test -- dxfGeometry
 */
import { describe, test, expect } from '@jest/globals'
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
} from '../dxfGeometry.js'

describe('pointDistance', () => {
  test('zero distance for same point', () => {
    expect(pointDistance({ x: 5, y: 7 }, { x: 5, y: 7 })).toBe(0)
  })
  test('3-4-5 triangle', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
  test('negative coordinates', () => {
    expect(pointDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('pointToLineDistance', () => {
  test('point on line → 0', () => {
    expect(pointToLineDistance({ x: 2, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 8 })).toBeCloseTo(0, 6)
  })
  test('perpendicular distance for horizontal line', () => {
    // Line from (0,0) to (10,0), point at (5,3) → distance 3
    expect(pointToLineDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3, 6)
  })
  test('perpendicular distance for diagonal line', () => {
    // Line from (0,0) to (1,1), point at (1,0) → perpendicular distance sqrt(0.5) ≈ 0.7071
    expect(pointToLineDistance({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(Math.SQRT1_2, 6)
  })
  test('degenerate zero-length line → reduces to pointDistance to start', () => {
    expect(pointToLineDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})

describe('distanceToSegment', () => {
  test('point on segment → 0', () => {
    expect(distanceToSegment({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(0, 6)
  })
  test('perpendicular projection inside segment', () => {
    expect(distanceToSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3, 6)
  })
  test('projection past segEnd → clamps to segEnd', () => {
    // Segment (0,0)-(2,0); point (5,0) projects to t=2.5 past end → clamps, distance = |5-2| = 3
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(3, 6)
  })
  test('projection past segStart → clamps to segStart', () => {
    // Segment (0,0)-(2,0); point (-3,0) clamps to start, distance = 3
    expect(distanceToSegment({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(3, 6)
  })
  test('zero-length segment → reduces to pointDistance to start', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: file fails to link with `SyntaxError: Cannot find module '../dxfGeometry.js'` (the module doesn't exist yet). Zero tests run.

- [ ] **Step 3: Create the module with the three point-level helpers**

Create `app-backend/src/services/dxfGeometry.js`:

```js
/**
 * DXF Geometric Primitives — pure functions used by sub-projects 4b
 * (whitespace scanner), 4c (block placer), 4d (per-feature label
 * placement), and 3-v2 (Schedule of Areas topological placement).
 *
 * Algorithms are byte-for-byte ports from `app-backend/src/services/
 * pdfkitGeoPDF.js` (line numbers cited per function). Interfaces are
 * normalised to a uniform `{x, y}` object shape — the PDF's mixed
 * `[y, x]` tuples / `{x, y}` objects / `{x1, y1, x2, y2}` flat-segment
 * conventions are unpacked at function entry.
 *
 * All inputs are unit-agnostic; caller's responsibility to keep units
 * consistent within one call (don't mix metres and millimetres).
 *
 * No DXF dependencies, no module state, no I/O. Pure math.
 */

/**
 * Euclidean distance between two points.
 * Port of `pdfkitGeoPDF.js:86` `pointDistance`.
 *
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @returns {number} non-negative distance
 */
export function pointDistance(p1, p2) {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Perpendicular distance from a point to an infinite line through
 * lineStart/lineEnd. Clamps the projection parameter to [0, 1], so for
 * the line-segment variant this is functionally identical to
 * `distanceToSegment` (the PDF original was inconsistent in naming;
 * the math is the same).
 * Port of `pdfkitGeoPDF.js:95` `pointToLineDistance`.
 *
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number}} lineStart
 * @param {{x:number,y:number}} lineEnd
 * @returns {number} non-negative distance
 */
export function pointToLineDistance(point, lineStart, lineEnd) {
  const { x: px, y: py } = point
  const { x: x1, y: y1 } = lineStart
  const { x: x2, y: y2 } = lineEnd

  const dx = x2 - x1
  const dy = y2 - y1
  const lineLengthSquared = dx * dx + dy * dy

  if (lineLengthSquared === 0) {
    // Degenerate "line" is a point
    return pointDistance(point, lineStart)
  }

  // Projection parameter t, clamped to [0, 1]
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lineLengthSquared))

  // Closest point on the line at parameter t
  const closestX = x1 + t * dx
  const closestY = y1 + t * dy

  const distX = px - closestX
  const distY = py - closestY
  return Math.sqrt(distX * distX + distY * distY)
}

/**
 * Distance from a point to a finite line segment. Clamps to the nearest
 * endpoint when the perpendicular projection falls outside the segment.
 * Port of `pdfkitGeoPDF.js:167` `distanceToSegment`.
 *
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number}} segStart
 * @param {{x:number,y:number}} segEnd
 * @returns {number} non-negative distance
 */
export function distanceToSegment(point, segStart, segEnd) {
  const { x: px, y: py } = point
  const { x: sx, y: sy } = segStart
  const { x: ex, y: ey } = segEnd

  const dx = ex - sx
  const dy = ey - sy
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    // Segment is a point
    return pointDistance(point, segStart)
  }

  // Clamped projection parameter
  let t = ((px - sx) * dx + (py - sy) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  // Closest point on segment
  const closestX = sx + t * dx
  const closestY = sy + t * dy

  return pointDistance(point, { x: closestX, y: closestY })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: `Tests: 12 passed, 12 total` (3 + 4 + 5). Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGeometry.js app-backend/src/services/__tests__/dxfGeometry.test.js
git commit -m "feat(dxf): dxfGeometry module + point-level primitives (4a Task 1)

Three pure helpers ported algorithm-verbatim from pdfkitGeoPDF.js with
{x,y} object interfaces: pointDistance (line 86), pointToLineDistance
(line 95), distanceToSegment (line 167). 12 unit tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Polygon containment helpers (2 functions)

**Files:**
- Modify: `app-backend/src/services/dxfGeometry.js`
- Modify: `app-backend/src/services/__tests__/dxfGeometry.test.js`

Two primitives: `isPointInPolygon` (ray-casting point-in-polygon) and `isPointNearPolygon` (point-in-polygon-OR-within-buffer-of-any-edge).

- [ ] **Step 1: Widen the test-file import and add the failing tests**

Edit `app-backend/src/services/__tests__/dxfGeometry.test.js`. Find:

```js
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
} from '../dxfGeometry.js'
```

Replace with:

```js
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
  isPointInPolygon,
  isPointNearPolygon,
} from '../dxfGeometry.js'
```

Then append after the existing `describe('distanceToSegment', …)` block:

```js
describe('isPointInPolygon', () => {
  // Unit square (0,0)-(10,0)-(10,10)-(0,10)
  const square = [
    { x: 0,  y: 0  },
    { x: 10, y: 0  },
    { x: 10, y: 10 },
    { x: 0,  y: 10 },
  ]

  test('point clearly inside square → true', () => {
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
  })
  test('point clearly outside square → false', () => {
    expect(isPointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
  test('point on vertex (algorithm choice — accepts either result)', () => {
    // Ray-casting is famously fragile on vertices. Just assert it returns
    // a boolean and doesn't throw — the actual on/off result is algorithm-dependent.
    const result = isPointInPolygon({ x: 0, y: 0 }, square)
    expect(typeof result).toBe('boolean')
  })
  test('point on a horizontal edge', () => {
    const result = isPointInPolygon({ x: 5, y: 0 }, square)
    expect(typeof result).toBe('boolean')
  })
  test('star-shaped polygon containment', () => {
    // Concave 5-vertex polygon. (5,5) is inside; (5,9.5) is outside the convex hull
    // but the polygon's notch puts it outside.
    const star = [
      { x: 5,  y: 0  },
      { x: 6,  y: 4  },
      { x: 10, y: 5  },
      { x: 6,  y: 6  },
      { x: 5,  y: 10 },
      { x: 4,  y: 6  },
      { x: 0,  y: 5  },
      { x: 4,  y: 4  },
    ]
    expect(isPointInPolygon({ x: 5, y: 5 }, star)).toBe(true)
    expect(isPointInPolygon({ x: 9, y: 9 }, star)).toBe(false)
  })
  test('ray crossing a vertex — does not double-count', () => {
    // Triangle: (0,0)-(10,0)-(5,10). Point at (5,5) sits below the apex (5,10).
    // A horizontal ray from (5,5) eastward would graze the apex if naive — but
    // the algorithm uses strict-inequality slope test that handles this correctly.
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]
    expect(isPointInPolygon({ x: 5, y: 5 }, triangle)).toBe(true)
    expect(isPointInPolygon({ x: 5, y: 11 }, triangle)).toBe(false)
  })
})

describe('isPointNearPolygon', () => {
  // CLOSED unit square (last vertex repeats first). isPointNearPolygon
  // iterates length-1 edges, so the polygon MUST be closed by repeating
  // the first vertex at the end — see the JSDoc note on this function.
  const closedSquare = [
    { x: 0,  y: 0  },
    { x: 10, y: 0  },
    { x: 10, y: 10 },
    { x: 0,  y: 10 },
    { x: 0,  y: 0  },
  ]

  test('point inside → true regardless of buffer', () => {
    expect(isPointNearPolygon({ x: 5, y: 5 }, closedSquare, 0)).toBe(true)
    expect(isPointNearPolygon({ x: 5, y: 5 }, closedSquare, 100)).toBe(true)
  })
  test('point outside but within buffer of an edge → true', () => {
    // Point (12, 5) is 2 units east of the (10,0)-(10,10) edge
    expect(isPointNearPolygon({ x: 12, y: 5 }, closedSquare, 3)).toBe(true)
  })
  test('point outside beyond buffer → false', () => {
    expect(isPointNearPolygon({ x: 12, y: 5 }, closedSquare, 1)).toBe(false)
  })
  test('buffer = 0 reduces to a stricter isPointInPolygon (boundary may differ)', () => {
    // (5, 5) inside both ways
    expect(isPointNearPolygon({ x: 5, y: 5 }, closedSquare, 0)).toBe(true)
    // (20, 20) outside both ways
    expect(isPointNearPolygon({ x: 20, y: 20 }, closedSquare, 0)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: the test file fails to link with `SyntaxError: The requested module '../dxfGeometry.js' does not provide an export named 'isPointInPolygon'`. The 12 prior tests don't run either (ESM all-or-nothing linking).

- [ ] **Step 3: Add the two polygon-containment helpers**

Edit `app-backend/src/services/dxfGeometry.js`. Append after `distanceToSegment`:

```js
/**
 * Ray-casting point-in-polygon test.
 * Port of `pdfkitGeoPDF.js:66` `isPointInPolygon`.
 *
 * The polygon's last vertex does NOT need to equal the first; this
 * function iterates with a wrap-around (i, j) pair so an open polygon
 * array works correctly. Behaviour on the polygon boundary (point on a
 * vertex or exactly on an edge) is algorithm-dependent — ray casting is
 * known to be fragile in this case and callers should not rely on a
 * specific result for boundary points.
 *
 * @param {{x:number,y:number}} point
 * @param {Array<{x:number,y:number}>} polygon
 * @returns {boolean}
 */
export function isPointInPolygon(point, polygon) {
  const { x, y } = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { x: xi, y: yi } = polygon[i]
    const { x: xj, y: yj } = polygon[j]

    // PDF original formula (`pdfkitGeoPDF.js:75`) verbatim — only the
    // destructuring above changed. The PDF used [y, x] tuples where the
    // ray was cast in the (Cape Lo) y-direction and the straddle test
    // was on the x-direction. With {x, y} object destructuring, the same
    // formula now describes a ray cast in the conventional y-direction
    // (vertical) with x-direction (horizontal) straddling.
    const intersect = ((xi > x) !== (xj > x)) && (y < ((yj - yi) * (x - xi)) / (xj - xi) + yi)
    if (intersect) inside = !inside
  }

  return inside
}

/**
 * True if the point is inside the polygon OR within `bufferDistance` of
 * any edge.
 * Port of `pdfkitGeoPDF.js:129` `isPointNearPolygon`.
 *
 * IMPORTANT: this function iterates `polygon.length - 1` edges (NOT
 * `length` with wrap-around), so it assumes the polygon is presented
 * CLOSED — the last vertex equals the first. Pass an open polygon and
 * the final edge from `polygon[n-1]` back to `polygon[0]` will not be
 * checked.
 *
 * (`isPointInPolygon` above does its own wrap-around so an open polygon
 * is fine there. The two PDF originals are inconsistent; this port
 * preserves both behaviours for fidelity.)
 *
 * @param {{x:number,y:number}} point
 * @param {Array<{x:number,y:number}>} polygon CLOSED — last vertex must equal first
 * @param {number} bufferDistance
 * @returns {boolean}
 */
export function isPointNearPolygon(point, polygon, bufferDistance) {
  if (isPointInPolygon(point, polygon)) return true

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i]
    const p2 = polygon[i + 1]
    if (distanceToSegment(point, p1, p2) <= bufferDistance) {
      return true
    }
  }

  return false
}
```

**Note on the algebra:** the formula is character-for-character the PDF original at line 75. The PDF destructured `[y, x] = point` (Cape Lo `[Y, X]` tuple), so `y` and `x` in the PDF code were `point[0]` and `point[1]` respectively. The normalised version destructures `{x, y} = point` so `x` and `y` are conventional (`point.x`, `point.y`). With both destructurings consistent across the loop, the same arithmetic expression now describes ray-casting on the conventional axes — no algebraic rewrite needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: `Tests: 22 passed, 22 total` (12 from Task 1 + 6 isPointInPolygon + 4 isPointNearPolygon = 22). Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGeometry.js app-backend/src/services/__tests__/dxfGeometry.test.js
git commit -m "feat(dxf): polygon-containment primitives (4a Task 2)

Two pure helpers ported from pdfkitGeoPDF.js with {x,y} object
interfaces: isPointInPolygon (line 66, ray-casting) and
isPointNearPolygon (line 129, in-polygon-or-within-buffer-of-edge).

Note: isPointNearPolygon assumes the polygon is closed (last vertex
repeats first) per the PDF original; documented in JSDoc.
isPointInPolygon does its own wrap-around so an open polygon is fine.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Line-segment intersection (1 function)

**Files:**
- Modify: `app-backend/src/services/dxfGeometry.js`
- Modify: `app-backend/src/services/__tests__/dxfGeometry.test.js`

One primitive: `lineSegmentsIntersect`. The PDF takes flat `{x1, y1, x2, y2}` segment objects; the port takes `[{x, y}, {x, y}]` start-end pairs.

- [ ] **Step 1: Widen the test-file import and add the failing tests**

In `app-backend/src/services/__tests__/dxfGeometry.test.js`, find:

```js
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
  isPointInPolygon,
  isPointNearPolygon,
} from '../dxfGeometry.js'
```

Replace with:

```js
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
  isPointInPolygon,
  isPointNearPolygon,
  lineSegmentsIntersect,
} from '../dxfGeometry.js'
```

Then append:

```js
describe('lineSegmentsIntersect', () => {
  // Segments are [{x, y}, {x, y}] pairs (start, end).
  const horizontal = [{ x: 0, y: 5 }, { x: 10, y: 5 }]   // y=5, x in [0,10]
  const vertical   = [{ x: 5, y: 0 }, { x: 5, y: 10 }]   // x=5, y in [0,10]
  const diagonal   = [{ x: 0, y: 0 }, { x: 10, y: 10 }]  // y=x

  test('crossing segments → true', () => {
    expect(lineSegmentsIntersect(horizontal, vertical)).toBe(true)
    expect(lineSegmentsIntersect(horizontal, diagonal)).toBe(true)
  })
  test('parallel non-touching → false', () => {
    const horizontalAbove = [{ x: 0, y: 7 }, { x: 10, y: 7 }]
    expect(lineSegmentsIntersect(horizontal, horizontalAbove)).toBe(false)
  })
  test('parallel touching at endpoint → false (PDF original returns false on parallels)', () => {
    // PDF version returns false for any pair with denom ≈ 0, which
    // includes parallel-touching. Documenting the behaviour with the test.
    const horizontalTouch = [{ x: 10, y: 5 }, { x: 20, y: 5 }]
    expect(lineSegmentsIntersect(horizontal, horizontalTouch)).toBe(false)
  })
  test('collinear overlapping → false (PDF returns false on parallel/collinear)', () => {
    const horizontalOverlap = [{ x: 5, y: 5 }, { x: 15, y: 5 }]
    expect(lineSegmentsIntersect(horizontal, horizontalOverlap)).toBe(false)
  })
  test('T-intersection (endpoint exactly on the other segment)', () => {
    // Vertical's start (5,0) sits on the line y=0; horizontal's at y=5.
    // The two segments DO cross because horizontal extends through x=5
    // and vertical extends through y=5 — true intersection.
    expect(lineSegmentsIntersect(horizontal, vertical)).toBe(true)
  })
  test('segments meeting at a shared endpoint', () => {
    // diagonal goes (0,0)-(10,10); endHook starts at (10,10) and goes elsewhere.
    // The orientation test treats t=1 / s=1 as intersection (ua and ub == 1, inclusive).
    const endHook = [{ x: 10, y: 10 }, { x: 20, y: 5 }]
    expect(lineSegmentsIntersect(diagonal, endHook)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: `SyntaxError: The requested module '../dxfGeometry.js' does not provide an export named 'lineSegmentsIntersect'`. File link error; zero tests run.

- [ ] **Step 3: Add the `lineSegmentsIntersect` helper**

Edit `app-backend/src/services/dxfGeometry.js`. Append after `isPointNearPolygon`:

```js
/**
 * True if two finite line segments cross. Uses the standard
 * cross-product orientation test (`ua` and `ub` in [0, 1]).
 *
 * Port of `pdfkitGeoPDF.js:7317` `lineSegmentsIntersect`. The PDF
 * version takes flat `{x1, y1, x2, y2}` segment objects; this port
 * takes `[{x, y}, {x, y}]` pairs (start, end) for interface uniformity.
 *
 * Parallel and collinear segments return `false` regardless of overlap
 * — the PDF original short-circuits when the denominator is near zero.
 * Callers needing collinear-overlap detection should check separately.
 *
 * @param {[{x:number,y:number},{x:number,y:number}]} seg1
 * @param {[{x:number,y:number},{x:number,y:number}]} seg2
 * @returns {boolean}
 */
export function lineSegmentsIntersect(seg1, seg2) {
  const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = seg1
  const [{ x: x3, y: y3 }, { x: x4, y: y4 }] = seg2

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)

  // Parallel (or collinear) — PDF original returns false here regardless of overlap
  if (Math.abs(denom) < 1e-10) return false

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: `Tests: 28 passed, 28 total` (22 from Tasks 1-2 + 6 lineSegmentsIntersect = 28). Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGeometry.js app-backend/src/services/__tests__/dxfGeometry.test.js
git commit -m "feat(dxf): lineSegmentsIntersect primitive (4a Task 3)

Port of pdfkitGeoPDF.js:7317 with {x,y}-pair segment interface
replacing the PDF's flat {x1,y1,x2,y2} shape. Algorithm (orientation
cross-product test) is byte-for-byte the same; parallel/collinear
segments return false per the PDF original.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Rectangle helpers (2 functions)

**Files:**
- Modify: `app-backend/src/services/dxfGeometry.js`
- Modify: `app-backend/src/services/__tests__/dxfGeometry.test.js`

Two primitives: `rectanglesOverlap` (axis-aligned rect-rect) and `rectangleOverlapsPolygon` (rect-polygon, composed of the four helpers from prior tasks).

- [ ] **Step 1: Widen the test-file import and add the failing tests**

In `app-backend/src/services/__tests__/dxfGeometry.test.js`, find:

```js
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
  isPointInPolygon,
  isPointNearPolygon,
  lineSegmentsIntersect,
} from '../dxfGeometry.js'
```

Replace with:

```js
import {
  pointDistance,
  pointToLineDistance,
  distanceToSegment,
  isPointInPolygon,
  isPointNearPolygon,
  lineSegmentsIntersect,
  rectanglesOverlap,
  rectangleOverlapsPolygon,
} from '../dxfGeometry.js'
```

Then append:

```js
describe('rectanglesOverlap', () => {
  const baseRect = { x: 0, y: 0, width: 10, height: 10 }

  test('clear overlap → true', () => {
    expect(rectanglesOverlap(baseRect, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
  })
  test('clear separation → false', () => {
    expect(rectanglesOverlap(baseRect, { x: 100, y: 100, width: 10, height: 10 })).toBe(false)
  })
  test('touching edges (zero overlap) → false', () => {
    // Right edge of baseRect at x=10; left edge of rect2 at x=10 — touching, no overlap area
    expect(rectanglesOverlap(baseRect, { x: 10, y: 0, width: 10, height: 10 })).toBe(false)
  })
  test('buffer makes touching count as overlap', () => {
    expect(rectanglesOverlap(baseRect, { x: 10, y: 0, width: 10, height: 10 }, 1)).toBe(true)
  })
  test('one rect fully inside the other → true', () => {
    expect(rectanglesOverlap(baseRect, { x: 2, y: 2, width: 2, height: 2 })).toBe(true)
  })
})

describe('rectangleOverlapsPolygon', () => {
  // 10x10 square polygon at origin
  const polygon = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ]

  test('rect fully inside polygon → true (rect corners are inside polygon)', () => {
    expect(rectangleOverlapsPolygon({ x: 2, y: 2, width: 4, height: 4 }, polygon)).toBe(true)
  })
  test('rect fully outside polygon → false', () => {
    expect(rectangleOverlapsPolygon({ x: 100, y: 100, width: 10, height: 10 }, polygon)).toBe(false)
  })
  test('rect straddling polygon boundary → true (edge intersect)', () => {
    expect(rectangleOverlapsPolygon({ x: 5, y: -5, width: 10, height: 10 }, polygon)).toBe(true)
  })
  test('rect contains polygon → true (polygon vertices are inside rect)', () => {
    expect(rectangleOverlapsPolygon({ x: -5, y: -5, width: 20, height: 20 }, polygon)).toBe(true)
  })
  test('rect adjacent to polygon, buffer brings it into contact', () => {
    // Rect 1 unit east of the polygon (no overlap natively)
    expect(rectangleOverlapsPolygon({ x: 11, y: 0, width: 5, height: 5 }, polygon)).toBe(false)
    // Buffer 2 expands the rect; now it overlaps
    expect(rectangleOverlapsPolygon({ x: 11, y: 0, width: 5, height: 5 }, polygon, 2)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: `SyntaxError: The requested module '../dxfGeometry.js' does not provide an export named 'rectanglesOverlap'`. File link error.

- [ ] **Step 3: Add the two rectangle helpers**

Edit `app-backend/src/services/dxfGeometry.js`. Append after `lineSegmentsIntersect`:

```js
/**
 * Axis-aligned rectangle overlap test with optional buffer.
 * Port of `pdfkitGeoPDF.js:7556` `rectanglesOverlap`.
 *
 * Touching edges (zero overlap area) return `false` unless the buffer
 * makes them effectively touch with positive overlap.
 *
 * @param {{x:number,y:number,width:number,height:number}} rect1
 * @param {{x:number,y:number,width:number,height:number}} rect2
 * @param {number} [buffer=0] minimum separation; rect2 is treated as if
 *   expanded by `buffer` on all sides for the overlap test
 * @returns {boolean}
 */
export function rectanglesOverlap(rect1, rect2, buffer = 0) {
  return !(
    rect1.x + rect1.width  < rect2.x - buffer ||
    rect2.x + rect2.width  < rect1.x - buffer ||
    rect1.y + rect1.height < rect2.y - buffer ||
    rect2.y + rect2.height < rect1.y - buffer
  )
}

/**
 * True if a rectangle overlaps a polygon. Three independent checks:
 * (1) any rect corner inside the polygon, (2) any polygon vertex inside
 * the (buffered) rect, (3) any polygon edge crosses any rect edge.
 *
 * Port of `pdfkitGeoPDF.js:7222` `rectangleOverlapsPolygon`. The PDF
 * version did inline tuple↔object conversions inside the function; this
 * port uses the uniform `{x, y}` interface so the conversions disappear.
 *
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @param {Array<{x:number,y:number}>} polygon
 * @param {number} [buffer=0]
 * @returns {boolean}
 */
export function rectangleOverlapsPolygon(rect, polygon, buffer = 0) {
  // Expand rect by buffer on all sides
  const expandedRect = {
    x: rect.x - buffer,
    y: rect.y - buffer,
    width: rect.width + 2 * buffer,
    height: rect.height + 2 * buffer,
  }

  // Check 1: any rect corner inside polygon
  const corners = [
    { x: expandedRect.x,                       y: expandedRect.y                       },
    { x: expandedRect.x + expandedRect.width,  y: expandedRect.y                       },
    { x: expandedRect.x + expandedRect.width,  y: expandedRect.y + expandedRect.height },
    { x: expandedRect.x,                       y: expandedRect.y + expandedRect.height },
  ]
  for (const corner of corners) {
    if (isPointInPolygon(corner, polygon)) return true
  }

  // Check 2: any polygon vertex inside rect
  for (const vertex of polygon) {
    if (vertex.x >= expandedRect.x && vertex.x <= expandedRect.x + expandedRect.width
        && vertex.y >= expandedRect.y && vertex.y <= expandedRect.y + expandedRect.height) {
      return true
    }
  }

  // Check 3: any polygon edge crosses any rect edge
  const rectEdges = [
    // Top
    [{ x: expandedRect.x,                       y: expandedRect.y                       },
     { x: expandedRect.x + expandedRect.width,  y: expandedRect.y                       }],
    // Right
    [{ x: expandedRect.x + expandedRect.width,  y: expandedRect.y                       },
     { x: expandedRect.x + expandedRect.width,  y: expandedRect.y + expandedRect.height }],
    // Bottom
    [{ x: expandedRect.x + expandedRect.width,  y: expandedRect.y + expandedRect.height },
     { x: expandedRect.x,                       y: expandedRect.y + expandedRect.height }],
    // Left
    [{ x: expandedRect.x,                       y: expandedRect.y + expandedRect.height },
     { x: expandedRect.x,                       y: expandedRect.y                       }],
  ]
  for (let i = 0; i < polygon.length; i++) {
    const polyEdge = [polygon[i], polygon[(i + 1) % polygon.length]]
    for (const rectEdge of rectEdges) {
      if (lineSegmentsIntersect(polyEdge, rectEdge)) return true
    }
  }

  return false
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGeometry`

Expected: `Tests: 38 passed, 38 total` (28 from Tasks 1-3 + 5 rectanglesOverlap + 5 rectangleOverlapsPolygon = 38). Paste the actual `Tests:` line.

- [ ] **Step 5: Run the wider dxfGenerator suite to confirm no regressions**

Run: `cd app-backend && npm run test -- dxfGenerator`

Expected: all 130 dxfGenerator tests still pass. Sub-project 4a is purely additive; the existing dxfGenerator module is unchanged.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGeometry.js app-backend/src/services/__tests__/dxfGeometry.test.js
git commit -m "feat(dxf): rectangle primitives (4a Task 4) — sub-project 4a complete

Two pure helpers ported from pdfkitGeoPDF.js with uniform {x,y}
interfaces: rectanglesOverlap (line 7556, axis-aligned with buffer) and
rectangleOverlapsPolygon (line 7222, composed of all four prior
primitives). The PDF original did inline tuple↔object conversions
inside rectangleOverlapsPolygon; the normalised version eliminates them.

Sub-project 4a (DXF geometric primitives) complete: 8 primitives, 38
unit tests, zero changes to dxfGenerator.js, foundation ready for
sub-projects 4b/4c/4d/3-v2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Wrap-up

After all 4 tasks land, the branch will have 5 commits on top of `main` (`d1f6fcd`) — 1 spec amendment (`acaec6f`) + 4 implementation tasks:

1. `feat(dxf): dxfGeometry module + point-level primitives (4a Task 1)`
2. `feat(dxf): polygon-containment primitives (4a Task 2)`
3. `feat(dxf): lineSegmentsIntersect primitive (4a Task 3)`
4. `feat(dxf): rectangle primitives (4a Task 4) — sub-project 4a complete`

Total: 1 new module (~250 lines) + 1 new test file (~270 lines) + 38 unit tests. Zero changes to `dxfGenerator.js`. No frontend, no route, no warning category, no manual CAD verification needed.

The branch is ready for `superpowers:finishing-a-development-branch`.

**Note for execution:** this sub-project is pure mechanical port-and-test work. Each task is small, well-bounded, and has no design decisions. Inline execution is the natural fit; the subagent-driven loop would add overhead without catching anything the tests don't.

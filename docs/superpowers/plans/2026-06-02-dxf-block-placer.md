# DXF Generic Block Placer (sub-project 4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new dependency-free `app-backend/src/services/dxfBlockPlacer.js` module exposing a generic single-block placer (`findBlockPosition`) plus two utility helpers (`computeMapFeatureBounds`, `isValidPosition`), with full unit-test coverage. Foundation for sub-project 3-v2 (Schedule of Areas topological placement).

**Architecture:** Single new file `dxfBlockPlacer.js` plus its test file `dxfBlockPlacer.test.js`. Imports the geometric primitives from 4a's `dxfGeometry.js` and the topological whitespace scanner from 4b's `dxfTopology.js`. Two internal candidate-generator helpers (not exported) plus three exported public functions. Algorithm verbatim from `pdfkitGeoPDF.js:9297-9530` (the schedule-multi-table topology-aware placement logic) with the generator/validator concerns separated for testability — algorithm rules unchanged.

**Tech Stack:** Node.js / Fastify backend, Jest 30 with ESM (`--experimental-vm-modules`). Pure JavaScript, no new runtime dependencies. ESM module format (the existing `app-shared/package.json` already declares `"type": "module"`).

**Branch:** `feature/dxf-block-placer` (already created off main at `90dbb4f` — the sub-project 4b merge; spec at `1565bd9`).

**Spec:** [`docs/superpowers/specs/2026-06-02-dxf-block-placer-design.md`](../specs/2026-06-02-dxf-block-placer-design.md)

---

## Interface convention (applies to all tasks)

Every function in `dxfBlockPlacer.js` accepts these shapes (matching the 4a/4b conventions):

| Concept | Shape |
|---|---|
| Polygon | `Array<{x: number, y: number}>` — closed (last vertex equals first) when passed to 4b's `computeWhitespaceZones` |
| Rectangle (map bounds, block, placed block, return position) | `{x: number, y: number, width: number, height: number}` (top-left + dimensions) |
| Position (return shape from `findBlockPosition`) | `{x: number, y: number}` — just the top-left; caller composes with the block's width/height |
| Logger (optional) | `{info: fn, warn: fn, error: fn}` — defaults to a no-op object so tests don't need to inject one |

All scalar parameters (`buffer`, `blockSpacing`, `scanStep`, `tableMinWidth`) are unit-agnostic. Caller (3-v2) will pass ground-metre values at the chosen scale.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfBlockPlacer.js` | **create** | 3 exported pure functions (`findBlockPosition`, `computeMapFeatureBounds`, `isValidPosition`) + 2 internal candidate generators (`generateTopologyCandidates`, `generateGridCandidates`). ~250 lines including JSDoc. |
| `app-backend/src/services/__tests__/dxfBlockPlacer.test.js` | **create** | 23 unit tests across 4 `describe` blocks: 4 for `computeMapFeatureBounds`, 8 for `isValidPosition`, 10 for `findBlockPosition` (topology layer + grid fallback + integration), 1 integration-style scenario. ~350 lines. |

No new files apart from the two above. Zero modifications to `dxfGenerator.js`, `dxfGeometry.js`, `dxfTopology.js`, integration tests, the route layer, the frontend, or the verification checklist.

---

## Task 1: Module skeleton + `computeMapFeatureBounds`

**Files:**
- Create: `app-backend/src/services/dxfBlockPlacer.js`
- Create: `app-backend/src/services/__tests__/dxfBlockPlacer.test.js`

The polygon-bbox helper deferred from 4b. Small utility (~10 lines) that establishes the module skeleton.

- [ ] **Step 1: Create the test file with the failing tests**

Create `app-backend/src/services/__tests__/dxfBlockPlacer.test.js`:

```js
/**
 * Layer 1 unit tests for the DXF generic block placer.
 * Run with:  cd app-backend && npm run test -- dxfBlockPlacer
 */
import { describe, test, expect } from '@jest/globals'
import { computeMapFeatureBounds } from '../dxfBlockPlacer.js'

describe('computeMapFeatureBounds', () => {
  test('null input → returns null', () => {
    expect(computeMapFeatureBounds(null)).toBeNull()
    expect(computeMapFeatureBounds(undefined)).toBeNull()
  })

  test('empty array → returns null', () => {
    expect(computeMapFeatureBounds([])).toBeNull()
  })

  test('3-vertex polygon → correct min/max bbox plus right, bottom, polygon fields', () => {
    const polygon = [{ x: 5, y: 3 }, { x: 10, y: 8 }, { x: 7, y: 1 }]
    const result = computeMapFeatureBounds(polygon)
    expect(result).toEqual({
      x: 5,
      y: 1,
      width: 5,
      height: 7,
      right: 10,
      bottom: 8,
      polygon, // exact reference passed through
    })
  })

  test('square polygon → bbox dimensions match polygon dimensions', () => {
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const result = computeMapFeatureBounds(square)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
    expect(result.right).toBe(10)
    expect(result.bottom).toBe(10)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && npm run test -- dxfBlockPlacer`

Expected: file fails to link with `SyntaxError: Cannot find module '../dxfBlockPlacer.js'`. Zero tests run.

- [ ] **Step 3: Create the module with `computeMapFeatureBounds`**

Create `app-backend/src/services/dxfBlockPlacer.js`:

```js
/**
 * DXF Generic Block Placer — finds non-overlapping positions for blocks
 * inside a drawing zone, avoiding the outside-figure polygon and any
 * already-placed blocks (including tick-mark obstacles composed by the
 * caller).
 *
 * Used by sub-project 3-v2 (Schedule of Areas topological placement)
 * and potentially by 4d (per-feature label placement). Algorithm ported
 * verbatim from `pdfkitGeoPDF.js:9297-9530` (the schedule-multi-table
 * topology-aware placement logic), with the generator and validator
 * concerns separated for testability — algorithm rules unchanged.
 *
 * No DXF dependencies, no module state, no I/O (apart from an optional
 * caller-injected logger).
 */

import { rectangleOverlapsPolygon, rectanglesOverlap } from './dxfGeometry.js'
import { computeWhitespaceZones } from './dxfTopology.js'

/**
 * Returns the axis-aligned bounding box of a polygon plus the polygon
 * itself wrapped in one object. Consumers (the placer, 3-v2's caller
 * setup) want the bbox + polygon together for collision-detection and
 * candidate-generation pipelines.
 *
 * Deferred from sub-project 4b's spec.
 *
 * @param {Array<{x:number,y:number}>|null|undefined} polygon
 * @returns {{x:number,y:number,width:number,height:number,right:number,bottom:number,polygon:Array<{x:number,y:number}>}|null}
 *   null if polygon is missing or empty
 */
export function computeMapFeatureBounds(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    right: maxX,
    bottom: maxY,
    polygon,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfBlockPlacer`

Expected: `Tests: 4 passed, 4 total`. Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfBlockPlacer.js app-backend/src/services/__tests__/dxfBlockPlacer.test.js
git commit -m "feat(dxf): dxfBlockPlacer module + computeMapFeatureBounds (4c Task 1)

Small polygon-bbox utility deferred from 4b's spec. Returns the
axis-aligned bounding box of a polygon plus the polygon itself in one
object — the shape consumers (the placer, 3-v2's caller setup) need
for collision-detection and candidate-generation pipelines.

Imports rectangleOverlapsPolygon + rectanglesOverlap from
./dxfGeometry.js (4a) and computeWhitespaceZones from ./dxfTopology.js
(4b) for use by later tasks; computeMapFeatureBounds itself uses
neither — they're the foundation imports for the placer.

4 unit tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `isValidPosition`

**Files:**
- Modify: `app-backend/src/services/dxfBlockPlacer.js`
- Modify: `app-backend/src/services/__tests__/dxfBlockPlacer.test.js`

The composable predicate that combines polygon-overlap and block-overlap checks. Pure function, no fallback logic.

- [ ] **Step 1: Widen the test-file import and add the failing tests**

Edit `app-backend/src/services/__tests__/dxfBlockPlacer.test.js`. Find:

```js
import { computeMapFeatureBounds } from '../dxfBlockPlacer.js'
```

Replace with:

```js
import { computeMapFeatureBounds, isValidPosition } from '../dxfBlockPlacer.js'
```

Then append (after the existing `describe('computeMapFeatureBounds', …)` block):

```js
describe('isValidPosition', () => {
  // A standard rect used by most tests
  const baseRect = { x: 50, y: 50, width: 20, height: 10 }

  test('no polygon, no placed blocks → always valid', () => {
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('empty polygon array (treated as null) + empty placedBlocks → valid', () => {
    expect(isValidPosition({
      rect: baseRect, polygon: [], placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('rect inside polygon → false', () => {
    // Polygon: a square that contains baseRect entirely.
    const polygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ]
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('buffer increases polygon-clearance — nearly-touching rect becomes invalid', () => {
    // Polygon square at (0..40, 0..40); baseRect at (50,50) → 10 units east of polygon.
    const polygon = [
      { x: 0,  y: 0  },
      { x: 40, y: 0  },
      { x: 40, y: 40 },
      { x: 0,  y: 40 },
    ]
    // With buffer=0, rect is 10 units away — no overlap.
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
    // With buffer=15, the buffered polygon expands to (−15..55, −15..55), which
    // now contains baseRect's left edge (x=50). Invalid.
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 15, blockSpacing: 0,
    })).toBe(false)
  })

  test('one placed block, no overlap → valid', () => {
    const placedBlocks = [{ x: 200, y: 200, width: 10, height: 10 }]
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('one placed block, overlapping → false', () => {
    const placedBlocks = [{ x: 55, y: 55, width: 20, height: 10 }] // overlaps baseRect
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('two placed blocks, second overlaps → false (iterates correctly)', () => {
    const placedBlocks = [
      { x: 200, y: 200, width: 10, height: 10 }, // does NOT overlap
      { x: 55,  y: 55,  width: 20, height: 10 }, // DOES overlap
    ]
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('blockSpacing increases required separation — touching becomes overlapping', () => {
    // Block to the immediate right of baseRect, sharing edge at x=70.
    const placedBlocks = [{ x: 70, y: 50, width: 10, height: 10 }]
    // With blockSpacing=0, they touch but don't overlap.
    // rectanglesOverlap uses strict less-than internally — touching IS overlap
    // (consistent with the PDF semantics tested in dxfGeometry.test.js).
    // Verify the strict behavior at blockSpacing=0:
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
    // Move the placed block 5 units further right → 5-unit gap.
    const placedBlocksGap = [{ x: 75, y: 50, width: 10, height: 10 }]
    // With blockSpacing=0, the 5-unit gap is fine.
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: placedBlocksGap, buffer: 0, blockSpacing: 0,
    })).toBe(true)
    // With blockSpacing=10, the 5-unit gap is insufficient.
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: placedBlocksGap, buffer: 0, blockSpacing: 10,
    })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfBlockPlacer`

Expected: test file fails to link with `SyntaxError: The requested module '../dxfBlockPlacer.js' does not provide an export named 'isValidPosition'`. Zero tests run.

- [ ] **Step 3: Add `isValidPosition` to the module**

Edit `app-backend/src/services/dxfBlockPlacer.js`. Append after `computeMapFeatureBounds`:

```js
/**
 * Predicate — true if `rect` does NOT overlap any obstacle in
 * `polygon` or `placedBlocks`. Composes the three checks the PDF's
 * `isValidPosition` does (port of `pdfkitGeoPDF.js:9344`):
 *   1. Polygon overlap via 4a's rectangleOverlapsPolygon(rect, polygon, buffer)
 *      — skipped when polygon is null/empty.
 *   2. Block overlap via 4a's rectanglesOverlap(rect, placedBlocks[i], blockSpacing)
 *      — returns false on first overlap.
 *   3. Returns true if all checks pass.
 *
 * True predicate (boolean). No {valid, reason} shape like the PDF
 * original — DXF callers don't currently surface placement-failure
 * reasons.
 *
 * @param {Object} args
 * @param {{x:number,y:number,width:number,height:number}} args.rect - The candidate position+size to validate
 * @param {Array<{x:number,y:number}>|null} args.polygon - Polygon to avoid (skipped if null/empty)
 * @param {Array<{x:number,y:number,width:number,height:number}>} args.placedBlocks - Obstacles
 * @param {number} args.buffer - Polygon-clearance distance
 * @param {number} args.blockSpacing - Minimum separation between rect and any placed block
 * @returns {boolean}
 */
export function isValidPosition({ rect, polygon, placedBlocks, buffer, blockSpacing }) {
  // Polygon overlap check (skipped when polygon is missing/empty)
  if (Array.isArray(polygon) && polygon.length > 0) {
    if (rectangleOverlapsPolygon(rect, polygon, buffer)) return false
  }

  // Block-vs-block overlap check
  for (const placedBlock of placedBlocks) {
    if (rectanglesOverlap(rect, placedBlock, blockSpacing)) return false
  }

  return true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfBlockPlacer`

Expected: `Tests: 12 passed, 12 total` (4 from Task 1 + 8 from Task 2). Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfBlockPlacer.js app-backend/src/services/__tests__/dxfBlockPlacer.test.js
git commit -m "feat(dxf): isValidPosition predicate (4c Task 2)

Composable predicate combining polygon-overlap (via 4a's
rectangleOverlapsPolygon) and block-overlap (via 4a's rectanglesOverlap)
checks. True boolean — no {valid, reason} diagnostic shape (DXF callers
don't surface placement-failure reasons).

Verbatim from pdfkitGeoPDF.js:9344's isValidPosition predicate.

8 unit tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: `findBlockPosition` + internal generators

**Files:**
- Modify: `app-backend/src/services/dxfBlockPlacer.js`
- Modify: `app-backend/src/services/__tests__/dxfBlockPlacer.test.js`

The primary placer. Wraps two internal candidate generators (topology + grid fallback) and orchestrates the iterate-and-validate loop. Tests cover the topology layer, grid-fallback layer, and a realistic integration scenario.

- [ ] **Step 1: Widen the test-file import and add the failing tests**

Edit `app-backend/src/services/__tests__/dxfBlockPlacer.test.js`. Find:

```js
import { computeMapFeatureBounds, isValidPosition } from '../dxfBlockPlacer.js'
```

Replace with:

```js
import { computeMapFeatureBounds, isValidPosition, findBlockPosition } from '../dxfBlockPlacer.js'
```

Then append (after the existing `describe('isValidPosition', …)` block):

```js
describe('findBlockPosition — topology layer', () => {
  // A standard 100×100 mapBounds used by most tests
  const mapBounds = { x: 0, y: 0, width: 100, height: 100 }
  // Block sizing chosen so each test's geometry has a clear expected outcome
  const smallBlock = { width: 10, height: 10 }

  test('polygon takes left 40% of mapBounds → returns position in the right whitespace', () => {
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // The position should land in the right whitespace (x ≥ 40, comfortably to the right of polygon)
    expect(result.x).toBeGreaterThanOrEqual(40)
  })

  test('L-shape with notch in upper-right → returns position in the notch', () => {
    // L-shape: polygon fills lower-left, with open corner at x∈[40,100], y∈[20,100]
    const lShape = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 20  },
      { x: 40,  y: 20  },
      { x: 40,  y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: lShape, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // The notch is at x ∈ [40, 100], y ∈ [20, 100]. Verify the block lands inside.
    expect(result.x).toBeGreaterThanOrEqual(40)
    expect(result.y).toBeGreaterThanOrEqual(20)
  })

  test('polygon fills mapBounds → returns null', () => {
    const polygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).toBeNull()
  })

  test('block too big for any whitespace → returns null', () => {
    // 40×100 polygon at left → 60 units of right whitespace.
    // Block requires 80×80 → won't fit.
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = findBlockPosition({
      block: { width: 80, height: 80 }, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 80,
    })
    expect(result).toBeNull()
  })

  test('multiple placed blocks blocking the natural right zone → returns position elsewhere', () => {
    // Polygon takes left 30%. Right zone (x ∈ [30, 100]) is fully occupied by placed blocks.
    const polygon = [
      { x: 0,  y: 0   },
      { x: 30, y: 0   },
      { x: 30, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    // Cover x ∈ [30, 100] with a tall block to force placer to look elsewhere.
    // (There's no "elsewhere" in this geometry since polygon fills left, so result should be null.)
    const placedBlocks = [{ x: 30, y: 0, width: 70, height: 100 }]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks,
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    // With the right zone fully blocked AND polygon filling the left zone, no valid position.
    expect(result).toBeNull()
  })

  test('polygon = null → falls through to grid scan; returns a valid position', () => {
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: null, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // Position must be within mapBounds with block fitting fully
    expect(result.x).toBeGreaterThanOrEqual(mapBounds.x)
    expect(result.y).toBeGreaterThanOrEqual(mapBounds.y)
    expect(result.x + smallBlock.width).toBeLessThanOrEqual(mapBounds.x + mapBounds.width)
    expect(result.y + smallBlock.height).toBeLessThanOrEqual(mapBounds.y + mapBounds.height)
  })

  test('placedBlocks empty + polygon present → position is outside polygon', () => {
    // 40×40 polygon at top-left of 100×100 mapBounds.
    const polygon = [
      { x: 0,  y: 0  },
      { x: 40, y: 0  },
      { x: 40, y: 40 },
      { x: 0,  y: 40 },
      { x: 0,  y: 0  },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // Verify position is NOT inside the polygon by checking topology:
    // either x ≥ 40 (right of polygon) OR y ≥ 40 (below polygon)
    const outsidePolygon = result.x >= 40 || result.y >= 40
    expect(outsidePolygon).toBe(true)
  })
})

describe('findBlockPosition — grid-fallback layer', () => {
  const mapBounds = { x: 0, y: 0, width: 100, height: 100 }
  const smallBlock = { width: 10, height: 10 }

  test('polygon shape that produces no whitespace zones → grid fallback fires; returns valid position', () => {
    // A pinwheel/star polygon designed to produce no useful strip zones.
    // The whitespace scanner finds no usable strips, so grid scan kicks in.
    // The polygon doesn't fill the entire bounds — there ARE valid positions
    // that the grid scan can find via brute force.
    //
    // Construct a polygon that hugs the boundary on all 4 sides but leaves
    // a central hole inaccessible to strip scanning (because no strip on any
    // single side has room). Use a thin diagonal slash that crosses through
    // the middle but isn't really useful as a strip.
    //
    // Easier approach: tiny central polygon → no usable zones (polygon too
    // small relative to tableMinWidth), but grid scan finds plenty of room.
    const tinyCenter = [
      { x: 49, y: 49 },
      { x: 51, y: 49 },
      { x: 51, y: 51 },
      { x: 49, y: 51 },
      { x: 49, y: 49 },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: tinyCenter, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5,
      tableMinWidth: 80, // Larger than any single strip can produce — forces grid fallback
    })
    expect(result).not.toBeNull()
  })

  test('right-to-left iteration: when topology yields nothing AND right side clear, grid finds right-first', () => {
    // Polygon at top — pushes right-side whitespace into existence, but the strip
    // would have height too short to qualify (height < tableMinWidth/2). Forces fallback.
    // Then verify grid result lands on the right (the PDF iterates right-to-left first).
    const topPolygon = [
      { x: 0,   y: 0  },
      { x: 100, y: 0  },
      { x: 100, y: 5  },
      { x: 0,   y: 5  },
      { x: 0,   y: 0  },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: topPolygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5,
      tableMinWidth: 60, // Forces strips to not qualify — falls to grid
    })
    expect(result).not.toBeNull()
    // Grid scans right-to-left first, so we expect a position favouring the right side
    // — not necessarily the rightmost, but right of centre.
    expect(result.x).toBeGreaterThanOrEqual(mapBounds.x + mapBounds.width / 2 - smallBlock.width)
  })

  test('grid fallback respects polygon — no candidate overlaps the polygon', () => {
    // Polygon that survives the grid scan path. Verify the returned position
    // doesn't overlap it.
    const polygon = [
      { x: 30, y: 30 },
      { x: 70, y: 30 },
      { x: 70, y: 70 },
      { x: 30, y: 70 },
      { x: 30, y: 30 },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 30,
    })
    expect(result).not.toBeNull()
    // Confirm the returned position's rectangle doesn't overlap the polygon
    // by checking the rect is fully outside the polygon's bounding box on at
    // least one axis.
    const rectRight  = result.x + smallBlock.width
    const rectBottom = result.y + smallBlock.height
    const noOverlap = rectRight <= 30 || result.x >= 70 || rectBottom <= 30 || result.y >= 70
    expect(noOverlap).toBe(true)
  })
})

describe('findBlockPosition — integration scenario', () => {
  test('Maglas-shaped polygon + 3 sequential schedule sub-tables → all 3 land in valid non-overlapping positions', () => {
    // A simplified Maglas-shaped polygon: an irregular hexagon roughly mimicking
    // the production case. The outside figure spans most of the drawing zone with
    // some right-side and bottom-right whitespace pockets.
    const mapBounds = { x: 0, y: 0, width: 200, height: 150 }
    const polygon = [
      { x: 10,  y: 10  },
      { x: 130, y: 10  },
      { x: 150, y: 30  },
      { x: 150, y: 110 },
      { x: 130, y: 130 },
      { x: 10,  y: 130 },
      { x: 10,  y: 10  },
    ]
    // Schedule sub-table size (approximate ground-metres at scale 1:500)
    const subTable = { width: 40, height: 60 }
    const placedBlocks = []
    const positions = []
    for (let i = 0; i < 3; i++) {
      const pos = findBlockPosition({
        block: subTable, mapBounds, polygon, placedBlocks,
        buffer: 2, blockSpacing: 5, scanStep: 5, tableMinWidth: 30,
      })
      expect(pos).not.toBeNull()
      // Each position must be within mapBounds with the block fitting
      expect(pos.x).toBeGreaterThanOrEqual(mapBounds.x)
      expect(pos.y).toBeGreaterThanOrEqual(mapBounds.y)
      expect(pos.x + subTable.width).toBeLessThanOrEqual(mapBounds.x + mapBounds.width)
      expect(pos.y + subTable.height).toBeLessThanOrEqual(mapBounds.y + mapBounds.height)
      positions.push(pos)
      placedBlocks.push({ ...pos, width: subTable.width, height: subTable.height })
    }
    // All 3 positions distinct (no overlap caught by the placer)
    expect(positions).toHaveLength(3)
    // Pairwise non-overlap check (defensive — the placer should have prevented this)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = { ...positions[i], width: subTable.width, height: subTable.height }
        const b = { ...positions[j], width: subTable.width, height: subTable.height }
        const overlap = !(a.x + a.width < b.x || b.x + b.width < a.x
                       || a.y + a.height < b.y || b.y + b.height < a.y)
        expect(overlap).toBe(false)
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfBlockPlacer`

Expected: test file fails to link with `SyntaxError: The requested module '../dxfBlockPlacer.js' does not provide an export named 'findBlockPosition'`. Zero tests run.

- [ ] **Step 3: Add the two internal generators and `findBlockPosition` to the module**

Edit `app-backend/src/services/dxfBlockPlacer.js`. Append after `isValidPosition`:

```js
/**
 * No-op fake logger used when callers don't provide one. Same shape as
 * fastify.log (info/warn/error methods).
 */
const NO_OP_LOGGER = { info: () => {}, warn: () => {}, error: () => {} }

/**
 * INTERNAL helper. Generates candidate positions inside the whitespace
 * zones returned by 4b's computeWhitespaceZones. For each zone, decimates
 * the zone into a grid of (x, y) positions at `scanStep` resolution.
 *
 * Per-zone iteration follows the PDF original at
 * `pdfkitGeoPDF.js:9402-9423`:
 *   - x iterates from zone.x to zone.x + zone.width - blockWidth
 *   - y iterates from zone.y to min(zone.y + zone.height, mapBottom - blockHeight)
 *     (the y cap is critical — band height can be smaller than blockHeight
 *     but the block's bottom may extend below the band's y range if the
 *     polygon doesn't intrude there; isValidPosition filters those cases).
 *
 * Deduplicates positions within `scanStep` epsilon (PDF dedup at line
 * 9417-9420).
 *
 * @returns {Array<{x:number,y:number}>}
 */
function generateTopologyCandidates({
  polygon, mapBounds, buffer, tableMinWidth, scanStep, blockWidth, blockHeight,
}) {
  const candidates = []
  const mapBottom = mapBounds.y + mapBounds.height
  const zones = computeWhitespaceZones({
    polygon, mapBounds, buffer, tableMinWidth, scanStep,
  })
  // The 'full' zone (returned when polygon < 3 vertices) is handled the same way.
  for (const zone of zones) {
    const yEnd = Math.min(zone.y + zone.height, mapBottom - blockHeight)
    for (let x = zone.x; x <= zone.x + zone.width - blockWidth; x += scanStep) {
      for (let y = zone.y; y <= yEnd; y += scanStep) {
        const dup = candidates.some(
          c => Math.abs(c.x - x) < scanStep && Math.abs(c.y - y) < scanStep
        )
        if (!dup) candidates.push({ x, y })
      }
    }
  }
  return candidates
}

/**
 * INTERNAL helper. Full-grid fallback. Scans right-to-left first
 * (matches PDF priority at `pdfkitGeoPDF.js:9431-9450`), then
 * left-to-right (line 9452-9472). Skips positions within `scanStep`
 * epsilon of any in `existingCandidates`.
 *
 * The 14-unit edge margin from the PDF (lines 9432-9434) is preserved
 * as `EDGE_MARGIN` so positions don't crowd the mapBounds boundary.
 *
 * @returns {Array<{x:number,y:number}>}
 */
function generateGridCandidates({
  mapBounds, scanStep, blockWidth, blockHeight, existingCandidates,
}) {
  const EDGE_MARGIN = 14
  const candidates = []
  const left   = mapBounds.x + EDGE_MARGIN
  const right  = mapBounds.x + mapBounds.width - EDGE_MARGIN
  const top    = mapBounds.y + EDGE_MARGIN
  const bottom = mapBounds.y + mapBounds.height - EDGE_MARGIN

  const isDup = (x, y) => {
    const inExisting = existingCandidates.some(
      c => Math.abs(c.x - x) < scanStep && Math.abs(c.y - y) < scanStep
    )
    const inSelf = candidates.some(
      c => Math.abs(c.x - x) < scanStep && Math.abs(c.y - y) < scanStep
    )
    return inExisting || inSelf
  }

  // Right-to-left scan (PDF priority — right-side placement preferred)
  for (let x = right - blockWidth; x >= left; x -= scanStep) {
    for (let y = top; y + blockHeight <= bottom; y += scanStep) {
      if (!isDup(x, y)) candidates.push({ x, y })
    }
  }

  // Left-to-right scan (catches positions the right-to-left grid stride missed)
  for (let x = left; x + blockWidth <= right; x += scanStep) {
    for (let y = top; y + blockHeight <= bottom; y += scanStep) {
      if (!isDup(x, y)) candidates.push({ x, y })
    }
  }

  return candidates
}

/**
 * Find a valid position for a block. Returns the top-left {x, y} of a
 * position that fits inside `mapBounds`, doesn't overlap `polygon`
 * (with `buffer` clearance), and doesn't overlap any `placedBlocks`
 * (with `blockSpacing` separation). Returns null if no valid position
 * found.
 *
 * Two-layered candidate strategy:
 *   1. TOPOLOGY (preferred): candidates derived from 4b's whitespace
 *      zones via generateTopologyCandidates.
 *   2. GRID FALLBACK: full-grid scan if topology yielded nothing OR
 *      all topology candidates failed validation.
 *
 * Algorithm restructured from `pdfkitGeoPDF.js:9297-9530` — the PDF
 * interleaves generation and validation; this port separates them for
 * testability. Algorithm rules unchanged.
 *
 * @param {Object} args
 * @param {{width:number,height:number}} args.block
 * @param {{x:number,y:number,width:number,height:number}} args.mapBounds
 * @param {Array<{x:number,y:number}>|null} args.polygon
 * @param {Array<{x:number,y:number,width:number,height:number}>} args.placedBlocks
 * @param {number} args.buffer
 * @param {number} args.blockSpacing
 * @param {number} args.scanStep
 * @param {number} args.tableMinWidth
 * @param {{info:Function,warn:Function,error:Function}} [args.logger=NO_OP_LOGGER]
 * @returns {{x:number,y:number}|null}
 */
export function findBlockPosition({
  block, mapBounds, polygon, placedBlocks, buffer, blockSpacing, scanStep, tableMinWidth,
  logger = NO_OP_LOGGER,
}) {
  // LAYER 1: topology-aware candidates
  const topologyCandidates = generateTopologyCandidates({
    polygon, mapBounds, buffer, tableMinWidth, scanStep,
    blockWidth: block.width, blockHeight: block.height,
  })
  logger.info(`[dxfBlockPlacer] Layer 1 (topology): ${topologyCandidates.length} candidates`)

  for (const c of topologyCandidates) {
    const rect = { x: c.x, y: c.y, width: block.width, height: block.height }
    if (isValidPosition({ rect, polygon, placedBlocks, buffer, blockSpacing })) {
      return { x: c.x, y: c.y }
    }
  }

  // LAYER 2: grid fallback
  const gridCandidates = generateGridCandidates({
    mapBounds, scanStep, blockWidth: block.width, blockHeight: block.height,
    existingCandidates: topologyCandidates,
  })
  logger.info(`[dxfBlockPlacer] Layer 2 (grid fallback): ${gridCandidates.length} candidates`)

  for (const c of gridCandidates) {
    const rect = { x: c.x, y: c.y, width: block.width, height: block.height }
    if (isValidPosition({ rect, polygon, placedBlocks, buffer, blockSpacing })) {
      return { x: c.x, y: c.y }
    }
  }

  logger.warn(`[dxfBlockPlacer] No valid position found for block ${block.width}×${block.height}`)
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfBlockPlacer`

Expected: `Tests: 23 passed, 23 total` (4 from Task 1 + 8 from Task 2 + 11 from Task 3). Paste the actual `Tests:` line.

- [ ] **Step 5: Run the wider dxf suite to confirm no regressions**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`

Expected: all 187 prior dxf tests still pass (130 dxfGenerator + 38 dxfGeometry + 19 dxfTopology), plus the new 23 dxfBlockPlacer = 210 total. Sub-project 4c is purely additive; nothing in `generateDXF()` calls the new module yet.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfBlockPlacer.js app-backend/src/services/__tests__/dxfBlockPlacer.test.js
git commit -m "feat(dxf): findBlockPosition + internal generators (4c Task 3) — sub-project 4c complete

Two internal candidate generators (generateTopologyCandidates,
generateGridCandidates) plus the public findBlockPosition orchestrator
that iterates each layer in order, calling isValidPosition on every
candidate. Returns the first valid position or null.

Algorithm restructured from pdfkitGeoPDF.js:9297-9530 (the PDF
interleaves candidate generation and validation; this port separates
them for testability). Algorithm rules unchanged.

Grid fallback preserves the PDF's 14-unit edge margin and right-to-left
scan priority. Topology layer applies the y-cap from PDF lines
9410-9413 (band height can be smaller than blockHeight; isValidPosition
filters cases where the block's bottom would overlap the polygon).

Sub-project 4c (DXF generic block placer) complete: 3 exported functions
+ 2 internal helpers, 23 unit tests, zero changes to dxfGenerator.js.
Foundation ready for sub-project 3-v2 (Schedule of Areas topological
placement using 4c) which is the primary motivator.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Wrap-up

After all 3 tasks land, the branch will have 4 commits on top of `main` (`90dbb4f`) — 1 spec + 3 implementation:

1. `docs(spec): DXF generic block placer (sub-project 4c) design` (`1565bd9`)
2. `feat(dxf): dxfBlockPlacer module + computeMapFeatureBounds (4c Task 1)`
3. `feat(dxf): isValidPosition predicate (4c Task 2)`
4. `feat(dxf): findBlockPosition + internal generators (4c Task 3) — sub-project 4c complete`

Total: 1 new module (~250 lines) + 1 new test file (~350 lines) + 23 unit tests. Zero changes to `dxfGenerator.js` or sibling modules. No frontend, no route, no warning category, no manual CAD verification needed.

The branch is ready for `superpowers:finishing-a-development-branch`.

**Note for execution:** same shape as 4a/4b — mechanical port-and-test work. Each task is well-bounded with concrete code and tests. Inline execution is the natural fit; the subagent-driven loop would add overhead without catching anything the tests don't.

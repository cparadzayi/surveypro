# DXF Topological Whitespace Scanner (sub-project 4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new dependency-free `app-backend/src/services/dxfTopology.js` module exporting 2 pure functions (`computePolygonProfile`, `computeWhitespaceZones`), ported algorithm-verbatim from `pdfkitGeoPDF.js` but with interfaces normalised to a uniform `{x, y}` polygon shape and a named-argument signature for the public function, with full unit-test coverage.

**Architecture:** Single new file `dxfTopology.js` plus its test file `dxfTopology.test.js`. Zero changes to `dxfGenerator.js`. Two tasks: Task 1 ports `computePolygonProfile` (the polygon-boundary sampler); Task 2 ports `computeWhitespaceZones` (the strip scanner that consumes the profile).

**Tech Stack:** Node.js / Fastify backend, Jest 30 with ESM (`--experimental-vm-modules`). Pure JavaScript, no new runtime dependencies. ESM module format (the existing `app-shared/package.json` from sub-project #2 already declares `"type": "module"`).

**Branch:** `feature/dxf-whitespace-scanner` (already created off main at `46ce0e0` — the sub-project 4a merge; spec at `3846345`).

**Spec:** [`docs/superpowers/specs/2026-06-02-dxf-whitespace-scanner-design.md`](../specs/2026-06-02-dxf-whitespace-scanner-design.md)

---

## Interface convention (applies to all tasks)

Every function in `dxfTopology.js` accepts these shapes (matching 4a's convention):

| Concept | Shape |
|---|---|
| Polygon | `Array<{x: number, y: number}>` — closed (last vertex equals first); `computePolygonProfile` iterates `length - 1` edges |
| Map bounds | `{x: number, y: number, width: number, height: number}` (top-left + dimensions) |
| Zone (output) | `{x, y, width, height, side: 'right'\|'left'\|'bottom'\|'top'\|'full', area: number}` |

The PDF source uses `{x, y}` polygon vertices already (no tuple/object mixup like 4a had). The interface adaptation here is just argument normalisation: `computeWhitespaceZones` takes a named-argument object instead of positional arguments; the PDF's `scaleDenominator` parameter (used only for `groundWidthM` annotation) is dropped.

---

## Verbatim-port fidelity note (from the spec)

The PDF's band-flush logic in `computeWhitespaceZones` uses `Math.min(bandMinRight, rx)` for the right strip (and analogous reductions for the other three sides). The variable name and comment suggest a "most conservative" boundary, but the actual reduction picks the polygon edge closest to the zone — which can produce zones that overlap the polygon when the band's `rightAt[y]` varies significantly across its y-extent. In practice the bands form only where `rightAt` is roughly constant, so the issue rarely surfaces.

This plan ports the PDF's reduction literally. If a future test discovers a real-world miss-placement caused by this, it's a separate fix in a follow-up sub-project; here we preserve fidelity to the production algorithm.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfTopology.js` | **create** | 2 exported pure functions: `computePolygonProfile`, `computeWhitespaceZones`. ~200 lines including JSDoc. |
| `app-backend/src/services/__tests__/dxfTopology.test.js` | **create** | 18 unit tests across 2 `describe` blocks (8 for profile, 10 for zones). ~300 lines. |

No new files apart from the two above. Zero modifications to `dxfGenerator.js`, `dxfGeometry.js`, integration tests, the route layer, the frontend, the verification checklist, or any other file in the repo.

---

## Task 1: Module skeleton + `computePolygonProfile`

**Files:**
- Create: `app-backend/src/services/dxfTopology.js`
- Create: `app-backend/src/services/__tests__/dxfTopology.test.js`

Ports `pdfkitGeoPDF.js:9021`. Walks each polygon edge and samples it at integer multiples of `scanStep`, recording for each sampled coordinate the most-extreme x or y at that slice.

- [ ] **Step 1: Create the test file with the failing tests**

Create `app-backend/src/services/__tests__/dxfTopology.test.js`:

```js
/**
 * Layer 1 unit tests for the DXF topological whitespace scanner.
 * Run with:  cd app-backend && npm run test -- dxfTopology
 */
import { describe, test, expect } from '@jest/globals'
import { computePolygonProfile } from '../dxfTopology.js'

describe('computePolygonProfile', () => {
  test('empty polygon → all 4 dictionaries empty', () => {
    const result = computePolygonProfile([], 10)
    expect(result.rightAt).toEqual({})
    expect(result.leftAt).toEqual({})
    expect(result.bottomAt).toEqual({})
    expect(result.topAt).toEqual({})
  })

  test('single vertex (no edges) → all dictionaries empty', () => {
    const result = computePolygonProfile([{ x: 5, y: 5 }], 10)
    expect(result.rightAt).toEqual({})
    expect(result.leftAt).toEqual({})
    expect(result.bottomAt).toEqual({})
    expect(result.topAt).toEqual({})
  })

  test('axis-aligned closed 10×10 rectangle → rightAt[y]=10, leftAt[y]=0 for all sampled y', () => {
    // Vertices closed: (0,0),(10,0),(10,10),(0,10),(0,0)
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const { rightAt, leftAt } = computePolygonProfile(square, 2)
    // Y values 0, 2, 4, 6, 8, 10 should all see rightAt = 10 and leftAt = 0
    for (const y of [0, 2, 4, 6, 8, 10]) {
      expect(rightAt[y]).toBe(10)
      expect(leftAt[y]).toBe(0)
    }
  })

  test('axis-aligned closed 10×10 rectangle → topAt[x]=0, bottomAt[x]=10 for all sampled x', () => {
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const { topAt, bottomAt } = computePolygonProfile(square, 2)
    for (const x of [0, 2, 4, 6, 8, 10]) {
      expect(topAt[x]).toBe(0)
      expect(bottomAt[x]).toBe(10)
    }
  })

  test('diagonal edge — sampling interpolates correctly', () => {
    // Open 2-vertex "polygon" (just one edge from (0,0) to (10,10))
    const edge = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    const { rightAt, bottomAt } = computePolygonProfile(edge, 2)
    // At each sampled y in [0, 10], x = y (since y = x on the diagonal)
    for (const y of [0, 2, 4, 6, 8, 10]) {
      expect(rightAt[y]).toBe(y)
    }
    // At each sampled x in [0, 10], y = x
    for (const x of [0, 2, 4, 6, 8, 10]) {
      expect(bottomAt[x]).toBe(x)
    }
  })

  test('step alignment — keys are multiples of scanStep', () => {
    // Edge from y=3 to y=47, scanStep=10 → samples at y=10, 20, 30, 40
    const edge = [{ x: 5, y: 3 }, { x: 5, y: 47 }]
    const { rightAt } = computePolygonProfile(edge, 10)
    expect(Object.keys(rightAt).map(Number).sort((a, b) => a - b)).toEqual([10, 20, 30, 40])
  })

  test('open polygon — final edge from last vertex back to first is NOT iterated', () => {
    // Open square: 4 vertices, last does NOT repeat first.
    // Iterated edges: [0→1] bottom, [1→2] right, [2→3] top. (3 edges total.)
    // The MISSING closing edge is the LEFT side: (0,10) back to (0,0).
    // If the closing edge were iterated, leftAt[5] would be min(0, 10) = 0.
    // Since it's NOT iterated, only the right side (10,0)→(10,10) contributes to leftAt[5],
    // so leftAt[5] = 10. This is a sharp test — the result depends on whether
    // the closing edge is iterated.
    const openSquare = [
      { x: 0,  y: 0  },  // bottom-left
      { x: 10, y: 0  },  // bottom-right
      { x: 10, y: 10 },  // top-right
      { x: 0,  y: 10 },  // top-left (NOT followed by (0,0))
    ]
    const { leftAt } = computePolygonProfile(openSquare, 5)
    expect(leftAt[5]).toBe(10)
  })

  test('L-shape (concave) — rightAt varies with y, reflecting the notch', () => {
    // L-shape with notch in upper-right (open corner at x∈[10,20], y∈[5,15]):
    // Closed outline: (0,0),(20,0),(20,5),(10,5),(10,15),(0,15),(0,0)
    // At y=0..5 (lower arm), polygon's right edge is at x=20 (max edge contribution).
    // At y=5..15 (upper arm), polygon's right edge drops to x=10.
    const lShape = [
      { x: 0,  y: 0  },
      { x: 20, y: 0  },
      { x: 20, y: 5  },
      { x: 10, y: 5  },
      { x: 10, y: 15 },
      { x: 0,  y: 15 },
      { x: 0,  y: 0  },
    ]
    const { rightAt } = computePolygonProfile(lShape, 5)
    // Below the notch: edge (20,0)→(20,5) contributes x=20 at y=0,5
    expect(rightAt[0]).toBe(20)
    expect(rightAt[5]).toBe(20)
    // Above the notch: only edge (10,5)→(10,15) contributes x=10
    expect(rightAt[10]).toBe(10)
    expect(rightAt[15]).toBe(10)
  })

  test('two edges crossing the same y slice — rightAt takes the max', () => {
    // Two parallel vertical edges, one at x=5 and one at x=15, both crossing y=10
    const polygon = [
      { x: 5,  y: 0  },
      { x: 5,  y: 20 },
      { x: 15, y: 20 },
      { x: 15, y: 0  },
      { x: 5,  y: 0  },
    ]
    const { rightAt, leftAt } = computePolygonProfile(polygon, 10)
    // At y=10, both vertical edges contribute. rightAt = max(5, 15) = 15.
    expect(rightAt[10]).toBe(15)
    expect(leftAt[10]).toBe(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && npm run test -- dxfTopology`

Expected: file fails to link with `SyntaxError: Cannot find module '../dxfTopology.js'` (the module doesn't exist yet). Zero tests run.

- [ ] **Step 3: Create the module with `computePolygonProfile`**

Create `app-backend/src/services/dxfTopology.js`:

```js
/**
 * DXF Topological Whitespace Scanner — pure functions used by
 * sub-projects 4c (block placer), 4d (per-feature label placement),
 * and 3-v2 (Schedule of Areas topological placement).
 *
 * Algorithms are byte-for-byte ports from `app-backend/src/services/
 * pdfkitGeoPDF.js` (line numbers cited per function). Interfaces are
 * normalised to a uniform `{x, y}` object shape (matching 4a's
 * dxfGeometry.js convention) and a named-argument signature for the
 * public `computeWhitespaceZones` function.
 *
 * All inputs are unit-agnostic; caller's responsibility to keep units
 * consistent within one call. When called from sub-project 4c, units
 * will be ground metres at the chosen scale.
 *
 * No DXF dependencies, no module state, no I/O. Pure math.
 *
 * Verbatim-port fidelity note: the PDF's band-flush logic in
 * `computeWhitespaceZones` uses Math.min/max reductions that pick the
 * polygon edge closest to the zone (not the most conservative one).
 * This can produce zones that overlap the polygon when the band's
 * `rightAt[y]` varies significantly. In practice the bands form only
 * where the profile is roughly constant, so the issue rarely surfaces.
 * Preserved verbatim for fidelity to the production PDF.
 */

/**
 * Walks each polygon edge and samples it at integer multiples of
 * `scanStep`, recording for each sampled coordinate the most-extreme
 * x or y at that slice. Returns 4 dictionaries:
 *   - rightAt[y] = rightmost x of polygon at horizontal slice y
 *   - leftAt[y]  = leftmost x at slice y
 *   - bottomAt[x] = bottommost y at vertical slice x (max — y increases downward in PDF convention)
 *   - topAt[x]    = topmost y at slice x (min)
 *
 * Port of `pdfkitGeoPDF.js:9021`. Algorithm verbatim; interface
 * normalised to `{x, y}` polygon vertices (the PDF version already
 * used `{x, y}` objects so no destructuring change was needed).
 *
 * CLOSED-POLYGON ASSUMPTION: iterates `polygon.length - 1` edges, so
 * the polygon must be presented closed (last vertex equals first). An
 * open polygon will silently miss its final closing edge. Same
 * convention as `isPointNearPolygon` in 4a's dxfGeometry.js.
 *
 * @param {Array<{x:number,y:number}>} polygon - Closed polygon vertices
 * @param {number} scanStep - Sampling resolution (must be > 0)
 * @returns {{rightAt: Object, leftAt: Object, bottomAt: Object, topAt: Object}}
 *   Dictionaries keyed by integer multiples of scanStep.
 */
export function computePolygonProfile(polygon, scanStep) {
  const rightAt = {}, leftAt = {}, bottomAt = {}, topAt = {}

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i], p2 = polygon[i + 1]

    // Horizontal profiles (rightAt / leftAt) — sample at y intervals
    if (Math.abs(p2.y - p1.y) > 0.001) {
      const yMin = Math.min(p1.y, p2.y)
      const yMax = Math.max(p1.y, p2.y)
      for (let y = Math.ceil(yMin / scanStep) * scanStep; y <= yMax; y += scanStep) {
        const t = (y - p1.y) / (p2.y - p1.y)
        const x = p1.x + t * (p2.x - p1.x)
        rightAt[y] = Math.max(rightAt[y] ?? -Infinity, x)
        leftAt[y]  = Math.min(leftAt[y]  ??  Infinity, x)
      }
    }

    // Vertical profiles (bottomAt / topAt) — sample at x intervals
    if (Math.abs(p2.x - p1.x) > 0.001) {
      const xMin = Math.min(p1.x, p2.x)
      const xMax = Math.max(p1.x, p2.x)
      for (let x = Math.ceil(xMin / scanStep) * scanStep; x <= xMax; x += scanStep) {
        const t = (x - p1.x) / (p2.x - p1.x)
        const y = p1.y + t * (p2.y - p1.y)
        bottomAt[x] = Math.max(bottomAt[x] ?? -Infinity, y)
        topAt[x]    = Math.min(topAt[x]    ??  Infinity, y)
      }
    }
  }
  return { rightAt, leftAt, bottomAt, topAt }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfTopology`

Expected: `Tests: 9 passed, 9 total`. Paste the actual `Tests:` line.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfTopology.js app-backend/src/services/__tests__/dxfTopology.test.js
git commit -m "feat(dxf): dxfTopology module + computePolygonProfile (4b Task 1)

Port of pdfkitGeoPDF.js:9021 with {x,y} polygon vertex interface
(unchanged from PDF — already used objects, not tuples). Walks each
polygon edge sampling at multiples of scanStep, recording the
most-extreme x or y at each slice. Returns 4 dictionaries:
rightAt, leftAt, bottomAt, topAt.

Closed-polygon assumption documented in JSDoc (same convention as
isPointNearPolygon in 4a's dxfGeometry.js).

9 unit tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `computeWhitespaceZones`

**Files:**
- Modify: `app-backend/src/services/dxfTopology.js`
- Modify: `app-backend/src/services/__tests__/dxfTopology.test.js`

Ports `pdfkitGeoPDF.js:9070`. The strip scanner that consumes the profile dictionaries from Task 1 and emits whitespace zone rectangles.

- [ ] **Step 1: Widen the test-file import and add the failing tests**

Edit `app-backend/src/services/__tests__/dxfTopology.test.js`. Find:

```js
import { computePolygonProfile } from '../dxfTopology.js'
```

Replace with:

```js
import { computePolygonProfile, computeWhitespaceZones } from '../dxfTopology.js'
```

Then append (after the existing `describe('computePolygonProfile', …)` block):

```js
describe('computeWhitespaceZones', () => {
  // A standard 100×100 map bounds used by most tests.
  const mapBounds = { x: 0, y: 0, width: 100, height: 100 }

  test('empty polygon → returns one full-bounds zone with side="full"', () => {
    const result = computeWhitespaceZones({
      polygon: [], mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      x: 0, y: 0, width: 100, height: 100, side: 'full', area: 10000,
    })
  })

  test('null polygon → same full-bounds zone special case', () => {
    const result = computeWhitespaceZones({
      polygon: null, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0].side).toBe('full')
  })

  test('polygon with < 3 vertices → full-bounds zone special case', () => {
    const result = computeWhitespaceZones({
      polygon: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0].side).toBe('full')
  })

  test('polygon flush against right edge → no right zone, but may produce other side zones', () => {
    // 100×100 polygon filling the entire mapBounds → no whitespace anywhere
    const fullPolygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon: fullPolygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    // No zone with usable width on any side
    expect(result.filter(z => z.side === 'right')).toHaveLength(0)
    expect(result.filter(z => z.side === 'left')).toHaveLength(0)
  })

  test('polygon inset on the right → at least one right zone with width≈right margin', () => {
    // 40×100 polygon at left edge of 100×100 mapBounds → 60 units of right whitespace
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    const rightZones = result.filter(z => z.side === 'right')
    expect(rightZones.length).toBeGreaterThanOrEqual(1)
    // The band should span the full y range and have width ≈ 60
    const biggestRight = rightZones.reduce((a, b) => a.area > b.area ? a : b)
    expect(biggestRight.width).toBeCloseTo(60, 0)
    expect(biggestRight.x).toBeCloseTo(40, 0)
  })

  test('L-shape with notch in upper-right → at least one right zone in the notch', () => {
    // Same L as the Task 1 test — notch at x∈[40,100], y∈[20,100]
    const lShape = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 20  },
      { x: 40,  y: 20  },
      { x: 40,  y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon: lShape, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    const rightZones = result.filter(z => z.side === 'right')
    expect(rightZones.length).toBeGreaterThanOrEqual(1)
    // Notch zone: x ≈ 40, width ≈ 60
    const notchZone = rightZones.find(z => Math.abs(z.x - 40) < 1)
    expect(notchZone).toBeDefined()
    expect(notchZone.width).toBeCloseTo(60, 0)
  })

  test('tableMinWidth larger than any available band → returns empty array', () => {
    // 40×100 polygon at left → 60 units of right whitespace
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 999, scanStep: 5,
    })
    expect(result).toEqual([])
  })

  test('zones sorted by side preference (right, bottom, left, top), then area descending', () => {
    // Small polygon in the center leaves whitespace on multiple sides.
    // 20×20 polygon at (40, 40) inside a 100×100 mapBounds.
    const polygon = [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
      { x: 40, y: 40 },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    // All sides should produce at least one zone. Check sort: right < bottom < left < top by sideOrder.
    const sideOrder = { right: 0, bottom: 1, left: 2, top: 3 }
    for (let i = 1; i < result.length; i++) {
      const prev = sideOrder[result[i - 1].side]
      const curr = sideOrder[result[i].side]
      expect(prev).toBeLessThanOrEqual(curr)
      // Within same side, area descending
      if (prev === curr) {
        expect(result[i - 1].area).toBeGreaterThanOrEqual(result[i].area)
      }
    }
  })

  test('buffer parameter increases required clear distance', () => {
    // 90×100 polygon at left → 10 units of right whitespace
    const polygon = [
      { x: 0,  y: 0   },
      { x: 90, y: 0   },
      { x: 90, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    // At buffer=0, tableMinWidth=10 → zone fits (width = 10)
    const zonesNoBuf = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(zonesNoBuf.filter(z => z.side === 'right').length).toBeGreaterThanOrEqual(1)
    // At buffer=5, available width drops to 5; tableMinWidth=10 → no right zone
    const zonesWithBuf = computeWhitespaceZones({
      polygon, mapBounds, buffer: 5, tableMinWidth: 10, scanStep: 5,
    })
    expect(zonesWithBuf.filter(z => z.side === 'right')).toHaveLength(0)
  })

  test('bottom-strip height heuristic — narrow strips with height < tableMinWidth/2 are filtered', () => {
    // Polygon filling most of the height — bottom margin is only 5 units.
    // tableMinWidth = 20 → tableMinWidth/2 = 10 → bottom strip needs height ≥ 10.
    // With 5-unit margin, bottom strip should be filtered out.
    const polygon = [
      { x: 0,   y: 0  },
      { x: 100, y: 0  },
      { x: 100, y: 95 },
      { x: 0,   y: 95 },
      { x: 0,   y: 0  },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 20, scanStep: 5,
    })
    expect(result.filter(z => z.side === 'bottom')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfTopology`

Expected: file fails to link with `SyntaxError: The requested module '../dxfTopology.js' does not provide an export named 'computeWhitespaceZones'`. Zero tests run.

- [ ] **Step 3: Add `computeWhitespaceZones` to the module**

Edit `app-backend/src/services/dxfTopology.js`. Append after `computePolygonProfile`:

```js
/**
 * Derive rectangular whitespace zones from the polygon's boundary
 * profile. For each directional strip (right / left / bottom / top),
 * consecutive scan lines where available width ≥ tableMinWidth are
 * grouped into a conservative rectangle.
 *
 * Topology-aware: an L-shaped polygon exposes its open corner as a
 * valid zone, whereas a simple bounding-box approach would exclude
 * that corner entirely.
 *
 * Port of `pdfkitGeoPDF.js:9070`. The PDF version takes positional
 * arguments + a `scaleDenominator` for groundWidthM annotation; this
 * port uses a named-argument object and drops groundWidthM (redundant
 * when inputs are already in ground units).
 *
 * Verbatim-port fidelity note: the band-flush reductions
 * (Math.min(bandMinRight, rx) on the right strip, Math.max(bandMaxLeft,
 * lx) on the left, etc.) pick the polygon edge closest to the zone
 * rather than the most conservative one. When `rightAt[y]` varies
 * significantly within a band, the emitted zone may overlap the
 * polygon at high-rightAt y values. In practice the bands form only
 * where the profile is roughly constant, so the issue rarely surfaces.
 *
 * @param {Object} args
 * @param {Array<{x:number,y:number}>} args.polygon - Closed polygon; if null/empty/<3 vertices, returns full-bounds zone
 * @param {{x:number,y:number,width:number,height:number}} args.mapBounds - The rectangular region within which to find whitespace
 * @param {number} args.buffer - Minimum clear distance between zone edge and polygon
 * @param {number} args.tableMinWidth - Minimum zone width to be considered usable
 * @param {number} args.scanStep - Sampling resolution (passed through to computePolygonProfile)
 * @returns {Array<{x:number,y:number,width:number,height:number,side:string,area:number}>}
 *   Zones sorted by side preference (right, bottom, left, top) then area descending.
 */
export function computeWhitespaceZones({
  polygon, mapBounds, buffer, tableMinWidth, scanStep,
}) {
  const mLeft   = mapBounds.x
  const mRight  = mapBounds.x + mapBounds.width
  const mTop    = mapBounds.y
  const mBottom = mapBounds.y + mapBounds.height

  if (!polygon || polygon.length < 3) {
    return [{
      x: mLeft, y: mTop, width: mapBounds.width, height: mapBounds.height,
      side: 'full', area: mapBounds.width * mapBounds.height,
    }]
  }

  const profile = computePolygonProfile(polygon, scanStep)
  const zones   = []

  // Align scan starts to multiples of scanStep so they hit the same keys
  // computePolygonProfile wrote (which also samples at ceil(coord/step)*step).
  const yStart = Math.ceil(mTop / scanStep) * scanStep
  const xStart = Math.ceil(mLeft / scanStep) * scanStep

  // RIGHT strip — scan y top→bottom; available x = rightAt[y]+buffer → mRight
  {
    let bandStart = null, bandMinRight = Infinity
    const flush = (yEnd) => {
      if (bandStart === null) return
      const x = bandMinRight + buffer
      const w = mRight - x
      if (w >= tableMinWidth) {
        zones.push({
          x, y: bandStart, width: w, height: yEnd - bandStart,
          side: 'right', area: w * (yEnd - bandStart),
        })
      }
      bandStart = null
      bandMinRight = Infinity
    }
    for (let y = yStart; y <= mBottom; y += scanStep) {
      const rx = profile.rightAt[y]
      if (rx == null || rx + buffer >= mRight - tableMinWidth) { flush(y); continue }
      const avail = mRight - (rx + buffer)
      if (avail < tableMinWidth) { flush(y); continue }
      if (bandStart === null) bandStart = y
      bandMinRight = Math.min(bandMinRight, rx)  // PDF verbatim — see fidelity note
    }
    flush(mBottom)
  }

  // LEFT strip — scan y top→bottom; available x = mLeft → leftAt[y]-buffer
  {
    let bandStart = null, bandMaxLeft = -Infinity
    const flush = (yEnd) => {
      if (bandStart === null) return
      const right = bandMaxLeft - buffer
      const w = right - mLeft
      if (w >= tableMinWidth) {
        zones.push({
          x: mLeft, y: bandStart, width: w, height: yEnd - bandStart,
          side: 'left', area: w * (yEnd - bandStart),
        })
      }
      bandStart = null
      bandMaxLeft = -Infinity
    }
    for (let y = yStart; y <= mBottom; y += scanStep) {
      const lx = profile.leftAt[y]
      if (lx == null || lx - buffer <= mLeft + tableMinWidth) { flush(y); continue }
      const avail = (lx - buffer) - mLeft
      if (avail < tableMinWidth) { flush(y); continue }
      if (bandStart === null) bandStart = y
      bandMaxLeft = Math.max(bandMaxLeft, lx)  // PDF verbatim
    }
    flush(mBottom)
  }

  // BOTTOM strip — scan x left→right; available y = bottomAt[x]+buffer → mBottom
  {
    let bandStart = null, bandMinBottom = Infinity
    const flush = (xEnd) => {
      if (bandStart === null) return
      const y = bandMinBottom + buffer
      const h = mBottom - y
      if (h >= tableMinWidth / 2 && xEnd - bandStart >= tableMinWidth) {
        zones.push({
          x: bandStart, y, width: xEnd - bandStart, height: h,
          side: 'bottom', area: (xEnd - bandStart) * h,
        })
      }
      bandStart = null
      bandMinBottom = Infinity
    }
    for (let x = xStart; x <= mRight; x += scanStep) {
      const by = profile.bottomAt[x]
      if (by == null || by + buffer >= mBottom) { flush(x); continue }
      if (bandStart === null) bandStart = x
      bandMinBottom = Math.min(bandMinBottom, by)  // PDF verbatim
    }
    flush(mRight)
  }

  // TOP strip — scan x left→right; available y = mTop → topAt[x]-buffer
  {
    let bandStart = null, bandMaxTop = -Infinity
    const flush = (xEnd) => {
      if (bandStart === null) return
      const bottom = bandMaxTop - buffer
      const h = bottom - mTop
      if (h >= tableMinWidth / 2 && xEnd - bandStart >= tableMinWidth) {
        zones.push({
          x: bandStart, y: mTop, width: xEnd - bandStart, height: h,
          side: 'top', area: (xEnd - bandStart) * h,
        })
      }
      bandStart = null
      bandMaxTop = -Infinity
    }
    for (let x = xStart; x <= mRight; x += scanStep) {
      const ty = profile.topAt[x]
      if (ty == null || ty - buffer <= mTop) { flush(x); continue }
      if (bandStart === null) bandStart = x
      bandMaxTop = Math.max(bandMaxTop, ty)  // PDF verbatim
    }
    flush(mRight)
  }

  // Sort: right preferred (SI 727 natural block side), then by area descending
  const sideOrder = { right: 0, bottom: 1, left: 2, top: 3 }
  return zones
    .filter(z => z.width > 0 && z.height > 0)
    .sort((a, b) => {
      const d = (sideOrder[a.side] ?? 9) - (sideOrder[b.side] ?? 9)
      return d !== 0 ? d : b.area - a.area
    })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfTopology`

Expected: `Tests: 19 passed, 19 total` (9 from Task 1 + 10 from Task 2). Paste the actual `Tests:` line.

- [ ] **Step 5: Run the wider dxf suite to confirm no regressions**

Run: `cd app-backend && npm test -- --testPathPatterns="dxf"`

Expected: all 168 prior dxf tests still pass (130 dxfGenerator + 38 dxfGeometry), plus the new 19 dxfTopology = 187 total. Sub-project 4b is purely additive; nothing in `generateDXF()` calls the new module yet.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfTopology.js app-backend/src/services/__tests__/dxfTopology.test.js
git commit -m "feat(dxf): computeWhitespaceZones (4b Task 2) — sub-project 4b complete

Port of pdfkitGeoPDF.js:9070 with named-argument signature
({polygon, mapBounds, buffer, tableMinWidth, scanStep}) replacing the
PDF's positional form. groundWidthM annotation dropped (redundant when
inputs are already in ground units). Algorithm verbatim — band-flush
reductions preserve the PDF's Math.min/max choices that pick the
polygon edge closest to the zone (documented fidelity note in JSDoc).

Topology-aware: an L-shaped polygon's open corner is captured as a
valid right-strip whitespace zone, not excluded as it would be by a
naïve bounding-box approach.

Sub-project 4b (DXF topological whitespace scanner) complete: 2 pure
functions, 19 unit tests, zero changes to dxfGenerator.js. Foundation
ready for sub-project 4c (block placer) which consumes the zones.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Wrap-up

After both tasks land, the branch will have 3 commits on top of `main` (`46ce0e0`) — 1 spec commit + 2 implementation commits:

1. `docs(spec): DXF topological whitespace scanner (sub-project 4b) design` (`3846345`)
2. `feat(dxf): dxfTopology module + computePolygonProfile (4b Task 1)`
3. `feat(dxf): computeWhitespaceZones (4b Task 2) — sub-project 4b complete`

Total: 1 new module (~220 lines) + 1 new test file (~330 lines) + 19 unit tests. Zero changes to `dxfGenerator.js`. No frontend, no route, no warning category, no manual CAD verification needed.

The branch is ready for `superpowers:finishing-a-development-branch`.

**Note for execution:** this sub-project is pure mechanical port-and-test work, same shape as 4a. Each task is small, well-bounded, and has no design decisions. Inline execution is the natural fit; the subagent-driven loop would add overhead without catching anything the tests don't.

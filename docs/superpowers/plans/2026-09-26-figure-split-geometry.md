# Figure Split Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a primary outside figure and a polyline drawn through road space, produce the two parts it divides the figure into and the new points it creates — or refuse, naming any stand the cut would slice.

**Architecture:** One new pure module, `app-shared/figureSplit.js`, holding the geometry primitives and the split rule. No I/O, no rendering, no map. Both the eventual UI and both renderers consume it, which is why it lives in `app-shared` alongside `beaconName.js` and `trigName.js`. A small change to the frontend beacon-status vocabulary adds the `-` provenance the new points carry.

**Tech Stack:** Plain ES modules (`app-shared` is `"type": "module"`). Jest for the shared module (run from `app-backend`), Vitest for the frontend change.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md`

## Global Constraints

- **Coordinate convention:** every point in this module is `{ y, x }` in Lo metres — `y` easting, `x` southing — matching `coordinate_points` rows. Never `{ x, y }` PDF points. The outputs become Coordinate List rows, so converting at this boundary is where mistakes would hide.
- **Snap tolerance: 0.10 m** (spec Decision 12).
- **New points round to 2 decimal places**, once, at creation (spec Decision 13).
- **New points carry provenance `-`** — neither found nor placed (spec Decision 6).
- **Public places are exempt** from the straddle refusal (spec Decision 7).
- `app-shared` modules are tested from `app-backend` via
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`.
  Bare `npx jest` fails on ESM.

## What this plan does NOT cover

Three further plans follow, each from the same spec:

1. **Per-sheet derivation** — parcels, schedule, servitude statement, OFD table, lettering, Seventh Schedule wording, geographic sheet ordering.
2. **Multi-sheet rendering** — PDF pages via `generateTiledGeoPDF`, one DXF per sheet.
3. **The interactive split tool** — drawing the polyline on the map.

This plan produces a tested library function and one vocabulary change. Nothing user-visible moves.

## File Structure

| File | Responsibility |
| --- | --- |
| `app-shared/figureSplit.js` (create) | Geometry primitives and the split rule. The only new production file. |
| `app-backend/src/services/__tests__/figureSplit-shared.test.js` (create) | Its tests, following the `beaconName-shared.test.js` convention. |
| `app-frontend/src/utils/beaconStatus.ts` (modify) | Add `-` to `BeaconProvenance`. |
| `app-frontend/src/utils/__tests__/beaconStatus.test.ts` (modify) | Cover it. |

---

### Task 1: The `-` provenance

A point defined by a click is neither found nor placed. The Surveyor-General's
form heads that column "F = Found P = Placed"; `-` is what says "defined".

**Files:**
- Modify: `app-frontend/src/utils/beaconStatus.ts`
- Test: `app-frontend/src/utils/__tests__/beaconStatus.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BeaconProvenance` now includes `'-'`. `parseBeaconStatus('-')` returns a status whose `provenance` is `'-'` and whose `kind` is `null`.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/beaconStatus.test.ts`:

```typescript
describe('the "-" provenance', () => {
  it('reads a bare dash as neither found nor placed', () => {
    const s = parseBeaconStatus('-')
    expect(s.provenance).toBe('-')
    expect(s.kind).toBeNull()
  })

  it('reads a dash alongside a kind, as the slash form allows', () => {
    const s = parseBeaconStatus('WS/-')
    expect(s.kind).toBe('WS')
    expect(s.provenance).toBe('-')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/beaconStatus.test.ts
```

Expected: FAIL — `provenance` is `null`, not `'-'`, because the parser does not recognise the token.

- [ ] **Step 3: Add the token**

In `app-frontend/src/utils/beaconStatus.ts`, extend the provenance type and
whatever set or branch the parser uses to recognise `F`, `FN` and `P`. The type
becomes:

```typescript
/** How the mark came to be there: the F/P column. `-` is neither — the point
 *  was defined (a split vertex), not surveyed, so the column shows a dash. */
export type BeaconProvenance = 'F' | 'FN' | 'P' | '-';
```

Add `'-'` wherever `'P'` is listed as a recognised provenance token, so both the
bare form and the `WS/-` slash form parse.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/beaconStatus.test.ts
```

Expected: PASS, with every pre-existing test in that file still passing. If any
existing test broke, the token was added somewhere that changed how `F`/`P`
parse — undo and add it only to the recognised-token list.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconStatus.ts app-frontend/src/utils/__tests__/beaconStatus.test.ts
git commit -m "feat(beacons): a '-' provenance for points that were defined, not surveyed"
```

---

### Task 2: Geometry primitives

Three primitives, written here because none is exported anywhere today.
`rectangleOverlapsPolygon` exists in three separate copies — do not add a fourth
by importing one of them; these are different operations.

**Files:**
- Create: `app-shared/figureSplit.js`
- Test: `app-backend/src/services/__tests__/figureSplit-shared.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `projectOnSegment(a, b, p) -> { point: {y,x}, t: number, distance: number }` — `t` clamped to `[0,1]`.
  - `segmentIntersection(p1, p2, p3, p4) -> {y,x} | null` — proper crossings only; collinear overlap returns `null`.
  - `pointInRing(ring, p) -> boolean` — ray casting; a point exactly on an edge is **not** inside.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/figureSplit-shared.test.js`:

```javascript
/**
 * app-shared/figureSplit.js — the outside-figure split rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
 */
import { describe, test, expect } from '@jest/globals'
import {
  projectOnSegment, segmentIntersection, pointInRing,
} from '../../../../app-shared/figureSplit.js'

const P = (y, x) => ({ y, x })

describe('projectOnSegment', () => {
  test('drops a perpendicular onto the segment', () => {
    const r = projectOnSegment(P(0, 0), P(10, 0), P(4, 3))
    expect(r.point.y).toBeCloseTo(4, 9)
    expect(r.point.x).toBeCloseTo(0, 9)
    expect(r.t).toBeCloseTo(0.4, 9)
    expect(r.distance).toBeCloseTo(3, 9)
  })

  test('clamps past either end rather than running off the segment', () => {
    expect(projectOnSegment(P(0, 0), P(10, 0), P(-5, 0)).t).toBe(0)
    expect(projectOnSegment(P(0, 0), P(10, 0), P(99, 0)).t).toBe(1)
  })

  test('a zero-length segment reports its own endpoint', () => {
    const r = projectOnSegment(P(3, 3), P(3, 3), P(5, 3))
    expect(r.point).toEqual(P(3, 3))
    expect(r.distance).toBeCloseTo(2, 9)
  })
})

describe('segmentIntersection', () => {
  test('finds a proper crossing', () => {
    expect(segmentIntersection(P(0, 0), P(10, 10), P(0, 10), P(10, 0)))
      .toEqual({ y: 5, x: 5 })
  })

  test('parallel and collinear segments do not cross', () => {
    expect(segmentIntersection(P(0, 0), P(10, 0), P(0, 5), P(10, 5))).toBeNull()
    expect(segmentIntersection(P(0, 0), P(10, 0), P(5, 0), P(15, 0))).toBeNull()
  })

  test('segments that stop short of each other do not cross', () => {
    expect(segmentIntersection(P(0, 0), P(4, 0), P(5, -5), P(5, 5))).toBeNull()
  })
})

describe('pointInRing', () => {
  const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]

  test('inside is inside, outside is outside', () => {
    expect(pointInRing(square, P(5, 5))).toBe(true)
    expect(pointInRing(square, P(15, 5))).toBe(false)
  })

  test('a point on the edge is not inside', () => {
    expect(pointInRing(square, P(0, 5))).toBe(false)
    expect(pointInRing(square, P(10, 10))).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: FAIL — `Cannot find module '../../../../app-shared/figureSplit.js'`.

- [ ] **Step 3: Write the module**

Create `app-shared/figureSplit.js`:

```javascript
/**
 * Splitting the primary outside figure into the parts that become sheets.
 *
 * Every point here is { y, x } in Lo metres -- y easting, x southing -- the same
 * shape a coordinate_points row carries. The outputs become Coordinate List
 * rows, so there is deliberately no conversion at this boundary.
 *
 * See docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md
 */

/** Perpendicular projection of p onto segment a-b, clamped to the segment. */
export function projectOnSegment(a, b, p) {
  const dy = b.y - a.y
  const dx = b.x - a.x
  const len2 = dy * dy + dx * dx
  let t = len2 === 0 ? 0 : ((p.y - a.y) * dy + (p.x - a.x) * dx) / len2
  if (t < 0) t = 0
  if (t > 1) t = 1
  const point = { y: a.y + t * dy, x: a.x + t * dx }
  const ey = p.y - point.y
  const ex = p.x - point.x
  return { point, t, distance: Math.sqrt(ey * ey + ex * ex) }
}

/**
 * Where two segments properly cross, or null. Collinear overlap returns null:
 * a cut that runs ALONG a boundary edge is not a crossing of it, and treating
 * it as one would let a cut enter and leave at the same place.
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1y = p2.y - p1.y, d1x = p2.x - p1.x
  const d2y = p4.y - p3.y, d2x = p4.x - p3.x
  const denom = d1y * d2x - d1x * d2y
  if (denom === 0) return null                    // parallel or collinear
  const sy = p3.y - p1.y, sx = p3.x - p1.x
  const t = (sy * d2x - sx * d2y) / denom
  const u = (sy * d1x - sx * d1y) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { y: p1.y + t * d1y, x: p1.x + t * d1x }
}

/** Ray casting. A point exactly on an edge is NOT inside -- the split rule
 *  needs "strictly inside", and an endpoint sits on the boundary by design. */
export function pointInRing(ring, p) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (onSegment(a, b, p)) return false
    const straddles = (a.x > p.x) !== (b.x > p.x)
    if (!straddles) continue
    const cut = ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y
    if (p.y < cut) inside = !inside
  }
  return inside
}

const ON_SEGMENT_EPS = 1e-9

function onSegment(a, b, p) {
  const cross = (b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y)
  if (Math.abs(cross) > ON_SEGMENT_EPS) return false
  const withinY = Math.min(a.y, b.y) - ON_SEGMENT_EPS <= p.y && p.y <= Math.max(a.y, b.y) + ON_SEGMENT_EPS
  const withinX = Math.min(a.x, b.x) - ON_SEGMENT_EPS <= p.x && p.x <= Math.max(a.x, b.x) + ON_SEGMENT_EPS
  return withinY && withinX
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app-shared/figureSplit.js app-backend/src/services/__tests__/figureSplit-shared.test.js
git commit -m "feat(split): geometry primitives for the outside-figure split"
```

---

### Task 3: Resolving an endpoint onto the boundary

A click near the boundary must land exactly **on** it. Left approximate, the two
resulting figures fail to close against each other at the one place they must
meet. Within 0.10 m of an existing vertex the endpoint snaps to that vertex
instead, so a cut starting at a known beacon reuses it rather than inventing a
duplicate point a centimetre away.

**Files:**
- Modify: `app-shared/figureSplit.js`
- Test: `app-backend/src/services/__tests__/figureSplit-shared.test.js`

**Interfaces:**
- Consumes: `projectOnSegment` from Task 2.
- Produces: `resolveEndpoint(ring, p, tolerance = 0.10) -> { kind: 'vertex', index, point } | { kind: 'edge', index, point }`. For `kind: 'edge'`, `index` is the index of the ring vertex the edge **starts** at. `point` is rounded to 2 dp.

- [ ] **Step 1: Write the failing test**

Append to `figureSplit-shared.test.js`:

```javascript
describe('resolveEndpoint', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a click near a vertex snaps to that vertex', () => {
    const r = resolveEndpoint(square, P(100.04, 0.03))
    expect(r.kind).toBe('vertex')
    expect(r.index).toBe(1)
    expect(r.point).toEqual(P(100, 0))
  })

  test('a click near an edge lands exactly on that edge', () => {
    const r = resolveEndpoint(square, P(40, 0.07))
    expect(r.kind).toBe('edge')
    expect(r.index).toBe(0)          // the edge from vertex 0 to vertex 1
    expect(r.point).toEqual(P(40, 0))
  })

  test('the landed point is rounded to 2 dp, once, here', () => {
    const r = resolveEndpoint(square, P(33.333333, 0.004))
    expect(r.point).toEqual(P(33.33, 0))
  })

  test('a click well inside still resolves to the nearest boundary', () => {
    // The tool should not let this happen, but the rule must be total.
    const r = resolveEndpoint(square, P(50, 20))
    expect(r.kind).toBe('edge')
    expect(r.point).toEqual(P(50, 0))
  })
})
```

Add `resolveEndpoint` to the import list at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: FAIL — `does not provide an export named 'resolveEndpoint'`.

- [ ] **Step 3: Implement it**

Append to `app-shared/figureSplit.js`:

```javascript
/** Spec Decision 12: a cut vertex within this of a boundary snaps onto it. */
export const SNAP_TOLERANCE_M = 0.10

/** Spec Decision 13: points the cut creates are stated to 2 dp. Rounded once,
 *  here, so the outside-figure table, the Calculations pages and the
 *  Coordinate List cannot disagree in the last digit. */
export function roundPoint(p) {
  return { y: Math.round(p.y * 100) / 100, x: Math.round(p.x * 100) / 100 }
}

/**
 * Put an endpoint exactly on the ring: on a vertex when it is within tolerance
 * of one, otherwise on the nearest edge.
 */
export function resolveEndpoint(ring, p, tolerance = SNAP_TOLERANCE_M) {
  let best = null
  for (let i = 0; i < ring.length; i++) {
    const v = ring[i]
    const dy = p.y - v.y, dx = p.x - v.x
    const d = Math.sqrt(dy * dy + dx * dx)
    if (best === null || d < best.d) best = { d, i }
  }
  if (best && best.d <= tolerance) {
    return { kind: 'vertex', index: best.i, point: roundPoint(ring[best.i]) }
  }

  let edge = null
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const r = projectOnSegment(a, b, p)
    if (edge === null || r.distance < edge.r.distance) edge = { i, r }
  }
  return { kind: 'edge', index: edge.i, point: roundPoint(edge.r.point) }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add app-shared/figureSplit.js app-backend/src/services/__tests__/figureSplit-shared.test.js
git commit -m "feat(split): land a cut endpoint exactly on the figure boundary"
```

---

### Task 4: The interior must stay inside

The spec's invariant is that the polyline's interior lies strictly inside the
figure, so the cut crosses the boundary exactly twice — once at each endpoint.
Checking the interior directly is equivalent and easier to report on than
counting crossings.

**Files:**
- Modify: `app-shared/figureSplit.js`
- Test: `app-backend/src/services/__tests__/figureSplit-shared.test.js`

**Interfaces:**
- Consumes: `pointInRing`, `segmentIntersection` from Task 2.
- Produces: `interiorStaysInside(ring, polyline) -> { ok: true } | { ok: false, reason: 'vertex-outside' | 'edge-crosses', at: {y,x} }`. `polyline` is the full point list including both resolved endpoints.

- [ ] **Step 1: Write the failing test**

Append to `figureSplit-shared.test.js`:

```javascript
describe('interiorStaysInside', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a straight chord across the middle is fine', () => {
    expect(interiorStaysInside(square, [P(0, 50), P(100, 50)]).ok).toBe(true)
  })

  test('a bent cut following a road is fine', () => {
    const cut = [P(0, 50), P(40, 50), P(40, 70), P(100, 70)]
    expect(interiorStaysInside(square, cut).ok).toBe(true)
  })

  test('a cut that wanders outside is refused', () => {
    const cut = [P(0, 50), P(50, 150), P(100, 50)]
    const r = interiorStaysInside(square, cut)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('vertex-outside')
    expect(r.at).toEqual(P(50, 150))
  })

  test('a cut that leaves and re-enters is refused even with both ends on the ring', () => {
    // Four crossings, not two: it would cut the figure into three parts.
    const cut = [P(0, 50), P(50, -10), P(100, 50)]
    expect(interiorStaysInside(square, cut).ok).toBe(false)
  })
})
```

Add `interiorStaysInside` to the import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: FAIL — `does not provide an export named 'interiorStaysInside'`.

- [ ] **Step 3: Implement it**

Append to `app-shared/figureSplit.js`:

```javascript
/**
 * The split invariant: both endpoints sit on the ring (resolveEndpoint saw to
 * that) and everything between them stays strictly inside. A polyline that
 * satisfies this crosses the boundary exactly twice, which is what makes one
 * cut yield exactly two parts.
 */
export function interiorStaysInside(ring, polyline) {
  for (let i = 1; i < polyline.length - 1; i++) {
    if (!pointInRing(ring, polyline[i])) {
      return { ok: false, reason: 'vertex-outside', at: polyline[i] }
    }
  }
  // Interior segments -- those with neither end on the boundary -- must not
  // touch the ring at all. The first and last segments legitimately end on it.
  for (let s = 0; s < polyline.length - 1; s++) {
    const a = polyline[s]
    const b = polyline[s + 1]
    const firstOrLast = s === 0 || s === polyline.length - 2
    for (let i = 0; i < ring.length; i++) {
      const r1 = ring[i]
      const r2 = ring[(i + 1) % ring.length]
      const hit = segmentIntersection(a, b, r1, r2)
      if (!hit) continue
      if (firstOrLast && (near(hit, a) || near(hit, b))) continue
      return { ok: false, reason: 'edge-crosses', at: hit }
    }
  }
  return { ok: true }
}

const TOUCH_EPS = 1e-6

function near(p, q) {
  return Math.abs(p.y - q.y) < TOUCH_EPS && Math.abs(p.x - q.x) < TOUCH_EPS
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add app-shared/figureSplit.js app-backend/src/services/__tests__/figureSplit-shared.test.js
git commit -m "feat(split): hold the cut's interior inside the figure"
```

---

### Task 5: Refuse and name the stands a cut would slice

Spec Decision 7. Public places are exempt — a cut runs down a road by design,
and once roads are digitised the rule would otherwise refuse every split.

**Files:**
- Modify: `app-shared/figureSplit.js`
- Test: `app-backend/src/services/__tests__/figureSplit-shared.test.js`

**Interfaces:**
- Consumes: `segmentIntersection`, `pointInRing` from Task 2.
- Produces: `standsCrossedBy(polyline, stands) -> string[]` — the `name` of each stand the polyline enters, in input order, excluding any stand with `isPublicPlace: true`. A stand is `{ name, ring, isPublicPlace? }`.

- [ ] **Step 1: Write the failing test**

Append to `figureSplit-shared.test.js`:

```javascript
describe('standsCrossedBy', () => {
  const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]
  const stands = [
    { name: '1686', ring: box(0, 0, 10, 10) },
    { name: '1687', ring: box(20, 0, 30, 10) },
    { name: 'Road', ring: box(10, 0, 20, 10), isPublicPlace: true },
  ]

  test('a cut down the road slices nothing', () => {
    expect(standsCrossedBy([P(0, 15), P(40, 15)], stands)).toEqual([])
  })

  test('a cut through a stand names it', () => {
    expect(standsCrossedBy([P(5, -5), P(5, 15)], stands)).toEqual(['1686'])
  })

  test('a cut through several names them all, in order', () => {
    expect(standsCrossedBy([P(-5, 5), P(40, 5)], stands)).toEqual(['1686', '1687'])
  })

  test('the road it runs through is never named, exempt by rule', () => {
    const through = standsCrossedBy([P(12, -5), P(18, 15)], stands)
    expect(through).not.toContain('Road')
  })

  test('a cut lying wholly inside one stand still names it', () => {
    expect(standsCrossedBy([P(2, 2), P(8, 8)], stands)).toEqual(['1686'])
  })
})
```

Add `standsCrossedBy` to the import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: FAIL — `does not provide an export named 'standsCrossedBy'`.

- [ ] **Step 3: Implement it**

Append to `app-shared/figureSplit.js`:

```javascript
/**
 * Every stand the cut enters. Spec Decision 7: the split is refused and these
 * are named, because silently slicing a stand across two sheets is the kind of
 * error that reaches the Surveyor-General. Public places are exempt -- the cut
 * runs down a road on purpose.
 */
export function standsCrossedBy(polyline, stands) {
  const hit = []
  for (const stand of stands ?? []) {
    if (!stand || stand.isPublicPlace || !Array.isArray(stand.ring)) continue
    if (crossesRing(polyline, stand.ring) || insideRing(polyline, stand.ring)) {
      hit.push(stand.name)
    }
  }
  return hit
}

function crossesRing(polyline, ring) {
  for (let s = 0; s < polyline.length - 1; s++) {
    for (let i = 0; i < ring.length; i++) {
      const r1 = ring[i]
      const r2 = ring[(i + 1) % ring.length]
      if (segmentIntersection(polyline[s], polyline[s + 1], r1, r2)) return true
    }
  }
  return false
}

/** A cut that never touches the stand's edges but lies wholly within it. */
function insideRing(polyline, ring) {
  return polyline.some((p) => pointInRing(ring, p))
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add app-shared/figureSplit.js app-backend/src/services/__tests__/figureSplit-shared.test.js
git commit -m "feat(split): refuse a cut that would slice a stand, and name it"
```

---

### Task 6: `splitFigure` — the whole rule

Assembles Tasks 3–5 and walks the ring to build the two parts. The two parts
share the cut: it is the last side of one and the first of the other, which is
why both sheets list the same new points under different letters.

**Files:**
- Modify: `app-shared/figureSplit.js`
- Test: `app-backend/src/services/__tests__/figureSplit-shared.test.js`

**Interfaces:**
- Consumes: `resolveEndpoint`, `interiorStaysInside`, `standsCrossedBy`, `roundPoint`.
- Produces:
  `splitFigure({ ring, polyline, stands = [], tolerance = SNAP_TOLERANCE_M }) -> { ok: true, parts: [ring, ring], newPoints: [{y,x}] } | { ok: false, error: 'straddles-stands' | 'interior-outside' | 'degenerate', stands?: string[], at?: {y,x} }`
  `newPoints` are the points the cut created that were not already ring vertices, in the order they appear along the cut.

- [ ] **Step 1: Write the failing test**

Append to `figureSplit-shared.test.js`:

```javascript
describe('splitFigure', () => {
  const square = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]

  test('a straight chord yields two parts that share the cut', () => {
    const r = splitFigure({ ring: square, polyline: [P(50, 0), P(50, 100)] })
    expect(r.ok).toBe(true)
    expect(r.parts).toHaveLength(2)
    for (const part of r.parts) {
      expect(part).toContainEqual(P(50, 0))
      expect(part).toContainEqual(P(50, 100))
    }
  })

  test('the two parts between them hold every original vertex', () => {
    const r = splitFigure({ ring: square, polyline: [P(50, 0), P(50, 100)] })
    const all = [...r.parts[0], ...r.parts[1]]
    for (const v of square) expect(all).toContainEqual(v)
  })

  test('the points the cut created are reported, and are new', () => {
    const r = splitFigure({ ring: square, polyline: [P(50, 0), P(50, 100)] })
    expect(r.newPoints).toEqual([P(50, 0), P(50, 100)])
  })

  test('an endpoint snapped to a corner creates no new point there', () => {
    const r = splitFigure({ ring: square, polyline: [P(0, 0.02), P(50, 100)] })
    expect(r.ok).toBe(true)
    expect(r.newPoints).toEqual([P(50, 100)])
  })

  test('a bent cut keeps its bends in both parts', () => {
    const cut = [P(0, 50), P(40, 50), P(40, 70), P(100, 70)]
    const r = splitFigure({ ring: square, polyline: cut })
    expect(r.ok).toBe(true)
    for (const part of r.parts) {
      expect(part).toContainEqual(P(40, 50))
      expect(part).toContainEqual(P(40, 70))
    }
  })

  test('a cut slicing a stand is refused, naming it', () => {
    const stands = [{ name: '1686', ring: [P(40, 40), P(60, 40), P(60, 60), P(40, 60)] }]
    const r = splitFigure({ ring: square, polyline: [P(50, 0), P(50, 100)], stands })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('straddles-stands')
    expect(r.stands).toEqual(['1686'])
  })

  test('a cut wandering outside is refused', () => {
    const r = splitFigure({ ring: square, polyline: [P(0, 50), P(50, 150), P(100, 50)] })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('interior-outside')
  })

  test('both endpoints on the same edge is degenerate, not a split', () => {
    const r = splitFigure({ ring: square, polyline: [P(30, 0), P(60, 0)] })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('degenerate')
  })
})
```

Add `splitFigure` to the import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: FAIL — `does not provide an export named 'splitFigure'`.

- [ ] **Step 3: Implement it**

Append to `app-shared/figureSplit.js`:

```javascript
/**
 * Divide a figure in two along a cut.
 *
 * The cut's endpoints are landed on the boundary first, so the parts always
 * close against each other. Both parts carry the cut: it is the last side of
 * one and the first of the other, which is why the same new points appear in
 * both sheets' outside-figure tables, lettered independently.
 */
export function splitFigure({ ring, polyline, stands = [], tolerance = SNAP_TOLERANCE_M }) {
  const startRaw = polyline[0]
  const endRaw = polyline[polyline.length - 1]
  const start = resolveEndpoint(ring, startRaw, tolerance)
  const end = resolveEndpoint(ring, endRaw, tolerance)

  // Both ends on the same edge, or on the same vertex, cuts nothing off.
  const sameEdge = start.kind === 'edge' && end.kind === 'edge' && start.index === end.index
  const sameVertex = start.kind === 'vertex' && end.kind === 'vertex' && start.index === end.index
  if (sameEdge || sameVertex) return { ok: false, error: 'degenerate' }

  const interior = polyline.slice(1, -1).map(roundPoint)
  const cut = [start.point, ...interior, end.point]

  const sliced = standsCrossedBy(cut, stands)
  if (sliced.length > 0) return { ok: false, error: 'straddles-stands', stands: sliced }

  const inside = interiorStaysInside(ring, cut)
  if (!inside.ok) return { ok: false, error: 'interior-outside', at: inside.at }

  const partA = [...cut, ...walk(ring, end, start)]
  const partB = [...reversed(cut), ...walk(ring, start, end)]

  const isNew = (p) => !ring.some((v) => near(roundPoint(v), p))
  return { ok: true, parts: [partA, partB], newPoints: cut.filter(isNew) }
}

function reversed(points) {
  return points.slice().reverse()
}

/**
 * The ring vertices strictly between two resolved endpoints, walking forward.
 * An endpoint on an edge leaves that edge's start vertex behind it; an endpoint
 * on a vertex is itself the boundary and is not repeated.
 */
function walk(ring, from, to) {
  const n = ring.length
  const first = from.kind === 'vertex' ? (from.index + 1) % n : (from.index + 1) % n
  const stop = to.kind === 'vertex' ? to.index : (to.index + 1) % n
  const out = []
  for (let k = 0, i = first; k <= n; k++, i = (i + 1) % n) {
    if (i === stop) break
    out.push(ring[i])
  }
  if (to.kind === 'vertex') out.push(ring[to.index])
  return out
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```

Expected: PASS, 29 tests.

If `walk` misplaces a vertex, the failing test will be "the two parts between
them hold every original vertex" — read which vertex is missing and check the
`first`/`stop` indices for that endpoint kind, rather than adjusting the
assertion.

- [ ] **Step 5: Commit**

```bash
git add app-shared/figureSplit.js app-backend/src/services/__tests__/figureSplit-shared.test.js
git commit -m "feat(split): divide the outside figure in two along a cut"
```

---

## Verification before handing on

- [ ] **Full shared-module suite**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureSplit-shared
```
Expected: 29 passed.

- [ ] **Nothing else disturbed.** This plan adds a module nothing imports yet and
  one token to a union type, so no rendering can change. Confirm it:

```bash
cd app-frontend && npx vitest run
```
Expected: the suite's existing count, all passing.

- [ ] **No line-ending noise**, which this repo is prone to:

```bash
diff <(git diff --numstat HEAD~6) <(git diff --ignore-cr-at-eol --numstat HEAD~6)
```
Expected: no output.

## Self-review notes

Checked against the spec:

- Decisions 3, 4 (the invariant, snap/cross endpoints) — Tasks 3 and 4.
- Decision 6 (`-` provenance) — Task 1.
- Decision 7 (refuse and name, public places exempt) — Task 5.
- Decision 12 (0.10 m snap) — Task 3, `SNAP_TOLERANCE_M`.
- Decision 13 (2 dp, rounded once) — Task 3, `roundPoint`, called only at
  endpoint resolution and on interior vertices in Task 6.
- Decisions 1, 2, 5, 8, 9, 10, 11 are rendering, derivation and naming concerns —
  they belong to the three later plans and are listed under "What this plan does
  NOT cover".

Spec Part 7 lists "a stand touching the cut" as a test case. That case is
removed by construction rather than tested here: Decision 12 snaps a cut vertex
onto a boundary within tolerance, so a stand cannot be left touching. The
later per-sheet derivation plan should still assert parcel assignment for a
stand whose edge coincides with the cut.

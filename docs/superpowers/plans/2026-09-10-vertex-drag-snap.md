# Parcel Vertex Drag-to-Snap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a surveyor click a parcel on the MapLibre area map, drag one of its vertex markers onto an existing point, and have every parcel that shared that beacon re-reference it, recompute, and persist together.

**Architecture:** All the decision logic — the snap index, candidate filtering, nearest-hit, the substitution, and the cascade pre-flight — lives in a new pure module `vertexSnap.ts` with no MapLibre and no Vue in it, so it can be unit-tested (this repo has no component harness). `MapLibreAreaView.vue` supplies the gesture (raw `mousedown`/`mousemove`/`mouseup` on a new `vertices-circle` layer — MapLibre has no vertex-drag primitive) and reuses the multi-parcel machinery already built for the 2026-06-10 point-edit work: `findAffectedParcels`, the affected-parcels confirm modal, and `rebuildAffectedParcels`, whose mutation union gains a third kind. The click-to-insert vertex-edit flow is deleted, not kept alongside.

**Tech Stack:** Vue 3 + TypeScript, Vitest, MapLibre GL, proj4 (via `utils/coordinateTransform`), axios.

**Spec:** `docs/superpowers/specs/2026-09-10-vertex-drag-snap-design.md`

## Global Constraints

- Branch off `main`: `feat/vertex-drag-snap`. **Never push to `origin/main`** — that remote is an unrelated project. Local `main` tracks `origin/nov-alpha`; push only with `git push origin HEAD:nov-alpha`, and only if asked.
- Frontend tests: `cd app-frontend && npx vitest run` (Vitest, `globals: true`, `environment: 'node'`, alias `@` → `./src`). **Measured baseline on `main` @ `977ae56` (2026-09-11): 53 files, 656 tests, 0 failures.** Every task must leave that number growing, never shrinking.
- **Every task runs the FULL frontend suite before committing**, not just its own file.
- **No `@vue/test-utils` and no `vue-tsc` in this repo.** Never write a component-mounting test. Logic goes in a plain `.ts` and is tested there; `npm run build` compiles `.vue` but does NOT type-check it. Tasks 3–6 are `.vue` work with **no automated coverage** — each carries an explicit manual browser checklist that is part of the task, not optional.
- **A drag is a re-reference, never a coordinate change** (spec decision 1). The dragged vertex's entry is replaced by the snap target's stored `{ id, y, x, status, description }`, copied verbatim. `wgs84ToCape` must never be called on the drag path, and `PUT /coordinate-points/:id` must never be called. The "LOSSLESS DATA FLOW" precision at `MapLibreAreaView.vue:4539` stays intact.
- **Substitute in place, by index** (decision 2). Never delete-then-append: that rotates the ring and changes the traverse order `areaCompute` builds its residuals and edge list from.
- **Snap radius is 12 screen pixels**, not ground metres (decision 3). No candidate under the cursor on release = cancel, no write.
- **Divergence tolerance is 0,5 m** — the same figure `repairParcelBeaconNames` (`:1604`) re-matches on.
- **All-or-nothing.** Any cascade blocker means zero writes (decision 6/7). A parcel that cannot be rebuilt is never silently skipped — a parcel left behind is exactly the non-coincident boundary this feature exists to prevent (decision 5).
- **Partial write failure is reported loudly, not prevented.** There is no transactional batch endpoint and building one is out of scope (spec Resolved decision 2). A failure after at least one success gets a blocking dialog naming which parcels were written and which were not. Do not degrade this into a console warning, and do not re-open the batch-endpoint question.
- **No backend change, no migration, no new endpoint** (decision 9).
- The `auto_generate_metadata` trigger **does not exist on any schema** — confirmed by a live `pg_trigger` query on 2026-09-11 (spec Resolved decision 1). No mitigation is needed anywhere in this plan.
- Both servers are assumed running for manual verification: backend `http://127.0.0.1:3050`, frontend `http://localhost:5173`.

## Deviations from the spec

Six, each deliberate. Everything else in the spec stands as written.

1. **`eligibleCandidates(index, parcel)` drops the spec's `draggedIndex` parameter.** Excluding *every* vertex the edited parcel lists already subsumes excluding the dragged one, so the parameter would be unused — dead weight a reviewer would rightly flag.
2. **`rebuildAffectedParcels` re-reads the parcel rows fresh from the database** instead of taking a snapshot captured at confirm time. This is not gold-plating: `editPanelHandler` runs `handlePointRename` *between* the confirm and the rebuild (`:1317` then `:1396`), and that rename rewrites `cape_lo_points` names in the DB (`:1559-1588`). A snapshot taken before the rename would no longer contain `mutation.name`, and every combined rename+coordinate edit would silently no-op. Today the code dodges this by reading `savedParcels`, which `handlePointRename` syncs in memory; decision 5 forbids depending on `savedParcels`, so the fresh read is what replaces it.
3. **`findAffectedParcels` gains a `capeLoPoints` field** on each returned item. It already reads `metadata.cape_lo_points` to do its test (`:1261`) and throws the value away; returning it lets `planCascade` run its pre-flight with no second fetch. Nothing else changes about it.
4. **`requireAffectedParcelsConfirm` is split** into `showAffectedParcelsConfirm(pointName, parcels, intent)` (modal only) plus the existing fetch-then-show wrapper, so the drag path — which already holds the list — does not fetch it a third time. Existing callers are untouched.
5. **`describeCascadeOutcome` is added to `vertexSnap.ts`** and tested. The spec mandates the partial-failure dialog's *behaviour* but lists no coverage for it; the repo's convention (`buildLodgementWarnings` in the 2026-09-10 record-composition plan) is that warning copy is logic and lives in a tested `.ts`.
6. **The `id` feature property must be added in THREE feature builders, not one.** The spec cites only `refreshParcelsFromDatabase` (`:4337`), but the `parcels` source is also fed by the initial render inside `initializeMap` (`:2655`) and by the rename re-render in `confirmParcelRename` (`:1234`). Miss either and clicking a parcel does nothing until something triggers a refresh. `addCompletedParcelToMap` (`:5269`) is deliberately **not** changed: a just-computed, not-yet-saved parcel has no DB id, and it must not be selectable for a cascade until it is persisted.

## File Structure

| File | Responsibility |
|---|---|
| `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts` *(new)* | The whole feature's decision logic: snap index, candidate filtering, nearest-hit, substitution, cascade pre-flight, outcome copy. No MapLibre, no Vue |
| `app-frontend/src/views/modules/cadastral-standard/__tests__/vertexSnap.test.ts` *(new)* | Index/precedence/divergence, eligibility, nearest-not-first, substitution purity, blockers |
| `app-frontend/src/views/modules/cadastral-standard/__tests__/vertexCascade.test.ts` *(new)* | Multi-parcel write set, the coincidence invariant, outcome reporting |
| `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` *(modify)* | Parcel selection, the `vertices-circle` layer, the drag gesture, `commitVertexDrag`, the `'substitute'` mutation kind, and the deletion of the retired flow |

All line numbers below are as of `main` @ `977ae56`. Anchor on the function or template text, not the number — earlier tasks in this plan shift them.

---

### Task 1: `vertexSnap.ts` — the snap index, the substitution, the pre-flight

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/vertexSnap.test.ts`

**Interfaces:**
- Consumes: nothing. This module imports nothing at all.
- Produces: `SnapCandidate`, `VertexPoint`, `CascadeParcel`, `SnapIndex`, `ScreenPoint`, `CascadeWrite`, `CascadeBlocker`, `CascadePlan`, `SNAP_RADIUS_PX`, `buildSnapIndex`, `eligibleCandidates`, `nearestCandidate`, `applySubstitution`, `planCascade`. Tasks 2–5 depend on these exact names and shapes.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/vertexSnap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildSnapIndex,
  eligibleCandidates,
  nearestCandidate,
  applySubstitution,
  planCascade,
  SNAP_RADIUS_PX,
  type SnapCandidate,
  type VertexPoint,
  type CascadeParcel,
} from '../vertexSnap'

const v = (id: string, y: number, x: number, extra: Partial<VertexPoint> = {}): VertexPoint =>
  ({ id, y, x, ...extra })

const parcel = (id: number, designation: string, points: any): CascadeParcel =>
  ({ id, designation, points })

const target: SnapCandidate = { id: 'X9', y: 5, x: 5, status: 'F', description: 'trig X9', source: 'coordinate-point' }

describe('buildSnapIndex', () => {
  it('unions project coordinate points with every saved parcel vertex', () => {
    const index = buildSnapIndex(
      [{ id: 'A1', y: 97500, x: 2247700 }],
      [parcel(1, 'STAND 207', [v('A1', 97500, 2247700), v('B2', 97600, 2247800)])]
    )
    expect(index.candidates.map(c => c.id).sort()).toEqual(['A1', 'B2'])
  })

  it('lets coordinate_points win where a name is in both', () => {
    const index = buildSnapIndex(
      [{ id: 'A1', y: 97500, x: 2247700, description: 'from the beacon row' }],
      [parcel(1, 'STAND 207', [v('A1', 97500.2, 2247700.1, { description: 'from the parcel' })])]
    )
    const a1 = index.candidates.find(c => c.id === 'A1')!
    expect(a1.y).toBe(97500)
    expect(a1.description).toBe('from the beacon row')
    expect(a1.source).toBe('coordinate-point')
  })

  it('badges a parcel-only name, which cannot be cross-checked against a beacon row', () => {
    // The stale-name case repairParcelBeaconNames exists for. Still a legal target.
    const index = buildSnapIndex([], [parcel(1, 'STAND 207', [v('GHOST', 1, 2)])])
    expect(index.candidates).toHaveLength(1)
    expect(index.candidates[0].source).toBe('parcel-vertex')
  })

  it('reports a name whose two copies differ by more than the 0,5 m repair tolerance', () => {
    const index = buildSnapIndex(
      [{ id: 'A1', y: 97500, x: 2247700 }],
      [parcel(1, 'STAND 207', [v('A1', 97500, 2247703)])]
    )
    expect(index.divergent).toEqual([{ id: 'A1', distanceM: 3 }])
  })

  it('stays silent inside the 0,5 m tolerance', () => {
    const index = buildSnapIndex(
      [{ id: 'A1', y: 97500, x: 2247700 }],
      [parcel(1, 'STAND 207', [v('A1', 97500, 2247700.4)])]
    )
    expect(index.divergent).toEqual([])
  })

  it('reports a divergent name once however many parcels repeat it', () => {
    const index = buildSnapIndex(
      [{ id: 'A1', y: 97500, x: 2247700 }],
      [
        parcel(1, 'STAND 207', [v('A1', 97500, 2247703)]),
        parcel(2, 'STAND 208', [v('A1', 97500, 2247705)]),
      ]
    )
    expect(index.divergent.map(d => d.id)).toEqual(['A1'])
  })

  it('skips entries with no name or unusable coordinates', () => {
    const index = buildSnapIndex(
      [{ id: 'NAN', y: Number.NaN, x: 2247700 }, { id: '', y: 1, x: 2 }, { id: 'NULLY', y: null, x: 2 }],
      [parcel(1, 'STAND 207', [v('B2', 97600, 2247800), { id: 'JUNK', y: 'oops', x: 1 } as any])]
    )
    expect(index.candidates.map(c => c.id)).toEqual(['B2'])
  })

  it('tolerates empty and missing inputs', () => {
    expect(buildSnapIndex([], [])).toEqual({ candidates: [], divergent: [] })
    expect(buildSnapIndex(null as any, null as any)).toEqual({ candidates: [], divergent: [] })
  })
})

describe('eligibleCandidates', () => {
  const index = buildSnapIndex(
    [
      { id: 'A1', y: 0, x: 0 },
      { id: 'B2', y: 0, x: 10 },
      { id: 'C3', y: 10, x: 10 },
      { id: 'D4', y: 10, x: 0 },
      { id: 'FREE', y: 20, x: 20 },
    ],
    []
  )

  it('excludes every vertex the edited parcel already lists, the dragged one included', () => {
    // A parcel may not list a beacon twice (MapLibreAreaView.vue:3721).
    const subject = parcel(1, 'STAND 207', [v('A1', 0, 0), v('B2', 0, 10), v('C3', 10, 10)])
    expect(eligibleCandidates(index, subject).map(c => c.id).sort()).toEqual(['D4', 'FREE'])
  })

  it('offers everything when the parcel has no readable vertices', () => {
    expect(eligibleCandidates(index, parcel(2, 'X', null)).map(c => c.id)).toHaveLength(5)
  })
})

describe('nearestCandidate', () => {
  const cands: SnapCandidate[] = [
    { id: 'NEAR', y: 0, x: 0, source: 'coordinate-point' },
    { id: 'NEARER', y: 0, x: 0, source: 'coordinate-point' },
    { id: 'FAR', y: 0, x: 0, source: 'coordinate-point' },
  ]
  const screen: Record<string, { x: number; y: number }> = {
    NEAR: { x: 108, y: 100 },
    NEARER: { x: 104, y: 100 },
    FAR: { x: 300, y: 100 },
  }
  const project = (c: SnapCandidate) => screen[c.id]

  it('picks the NEAREST, not the first one under the radius', () => {
    // findBeaconNameBySpatialMatch returns the FIRST match under its tolerance
    // (utils/beaconNameMatch.ts:20). That is wrong for a drag target.
    expect(nearestCandidate(cands, { x: 100, y: 100 }, project, 12)?.id).toBe('NEARER')
  })

  it('returns null when nothing is inside the radius', () => {
    expect(nearestCandidate(cands, { x: 500, y: 500 }, project, 12)).toBeNull()
  })

  it('counts a candidate exactly on the radius as a hit', () => {
    expect(nearestCandidate([cands[0]], { x: 96, y: 100 }, project, 12)?.id).toBe('NEAR')
  })

  it('rejects a candidate one pixel past the radius', () => {
    expect(nearestCandidate([cands[0]], { x: 95, y: 100 }, project, 12)).toBeNull()
  })

  it('ignores a candidate the projection cannot place', () => {
    const broken = (c: SnapCandidate) => (c.id === 'NEARER' ? null : screen[c.id])
    expect(nearestCandidate(cands, { x: 100, y: 100 }, broken, 12)?.id).toBe('NEAR')
  })

  it('defaults to the 12 px radius the gesture is specified in', () => {
    expect(SNAP_RADIUS_PX).toBe(12)
    expect(nearestCandidate([cands[0]], { x: 100, y: 100 }, project)?.id).toBe('NEAR')
  })

  it('returns null for an empty candidate list', () => {
    expect(nearestCandidate([], { x: 0, y: 0 }, project, 12)).toBeNull()
  })
})

describe('applySubstitution', () => {
  const ring = [v('A1', 0, 0, { description: 'old A' }), v('B2', 0, 10), v('C3', 10, 10), v('D4', 10, 0)]

  it('replaces in place, preserving ring order and length', () => {
    expect(applySubstitution(ring, 1, target).map(p => p.id)).toEqual(['A1', 'X9', 'C3', 'D4'])
  })

  it('copies the target values verbatim — a drag never derives coordinates', () => {
    expect(applySubstitution(ring, 1, target)[1]).toEqual({
      id: 'X9', y: 5, x: 5, status: 'F', description: 'trig X9',
    })
  })

  it('does not carry the replaced vertex description over', () => {
    expect(applySubstitution(ring, 0, target)[0].description).toBe('trig X9')
  })

  it('does not mutate its input', () => {
    const before = JSON.stringify(ring)
    applySubstitution(ring, 2, target)
    expect(JSON.stringify(ring)).toBe(before)
  })

  it('throws rather than silently no-op on an out-of-range index', () => {
    expect(() => applySubstitution(ring, 9, target)).toThrow(/out of range/i)
    expect(() => applySubstitution(ring, -1, target)).toThrow(/out of range/i)
  })
})

describe('planCascade', () => {
  const square = (first: string) => [v(first, 0, 0), v('B2', 0, 10), v('C3', 10, 10), v('D4', 10, 0)]

  it('plans one write per affected parcel when nothing blocks', () => {
    const plan = planCascade('A1', target, [
      parcel(11, 'STAND 207', square('A1')),
      parcel(12, 'STAND 208', [v('A1', 0, 0), v('E5', 0, -10), v('F6', 10, -10)]),
    ])
    expect(plan.blockers).toEqual([])
    expect(plan.writes.map(w => w.parcelId)).toEqual([11, 12])
  })

  it('blocks when a sharing parcel already lists the target', () => {
    // Decision 7: substituting would list the same corner twice, and collapsing the
    // pair instead would silently delete a corner from a NEIGHBOURING parcel.
    const plan = planCascade('A1', target, [
      parcel(11, 'STAND 207', square('A1')),
      parcel(12, 'STAND 208', [v('A1', 0, 0), v('X9', 5, 5), v('F6', 10, -10)]),
    ])
    expect(plan.writes).toEqual([])
    expect(plan.blockers).toHaveLength(1)
    expect(plan.blockers[0].designation).toBe('STAND 208')
    expect(plan.blockers[0].reason).toMatch(/already uses beacon "X9"/)
  })

  it('blocks a parcel whose ring has fewer than 3 vertices', () => {
    const plan = planCascade('A1', target, [parcel(11, 'STAND 207', [v('A1', 0, 0), v('B2', 0, 10)])])
    expect(plan.writes).toEqual([])
    expect(plan.blockers[0].reason).toMatch(/at least 3/)
  })

  it('blocks a parcel with no readable cape_lo_points', () => {
    for (const points of [null, undefined, [], 'nonsense']) {
      const plan = planCascade('A1', target, [parcel(11, 'STAND 207', points)])
      expect(plan.writes).toEqual([])
      expect(plan.blockers[0].reason).toMatch(/missing or unreadable/)
    }
  })

  it('blocks a parcel holding a vertex with no name or no usable coordinates', () => {
    // Never silently drop it: dropping one would shrink a ring behind the surveyor's back.
    const plan = planCascade('A1', target, [
      parcel(11, 'STAND 207', [v('A1', 0, 0), { id: 'B2', y: 'oops', x: 10 }, v('C3', 10, 10)]),
    ])
    expect(plan.writes).toEqual([])
    expect(plan.blockers[0].reason).toMatch(/unusable/)
  })

  it('blocks a parcel that no longer lists the dragged beacon', () => {
    const plan = planCascade('A1', target, [parcel(11, 'STAND 207', square('ZZ'))])
    expect(plan.writes).toEqual([])
    expect(plan.blockers[0].reason).toMatch(/no longer lists beacon "A1"/)
  })

  it('reports every blocker at once and still writes nothing', () => {
    const plan = planCascade('A1', target, [
      parcel(11, 'STAND 207', square('A1')),
      parcel(12, 'STAND 208', [v('A1', 0, 0), v('X9', 5, 5), v('F6', 10, -10)]),
      parcel(13, 'STAND 209', null),
    ])
    expect(plan.writes).toEqual([])
    expect(plan.blockers.map(b => b.designation)).toEqual(['STAND 208', 'STAND 209'])
  })

  it('plans nothing for an empty affected list', () => {
    expect(planCascade('A1', target, [])).toEqual({ writes: [], blockers: [] })
  })

  it('treats a drop on the dragged beacon itself as a silent no-op', () => {
    const self: SnapCandidate = { id: 'A1', y: 0, x: 0, source: 'coordinate-point' }
    expect(planCascade('A1', self, [parcel(11, 'STAND 207', square('A1'))]))
      .toEqual({ writes: [], blockers: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/vertexSnap.test.ts`
Expected: FAIL — "Failed to resolve import ../vertexSnap".

- [ ] **Step 3: Write minimal implementation**

Create `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts`:

```ts
/**
 * Vertex drag-to-snap: the whole feature's decision logic, with no MapLibre and no
 * Vue in it so it can be unit-tested (this repo has no component-mounting harness).
 *
 * A drag is a RE-REFERENCE, never a coordinate change. The dragged vertex's entry is
 * replaced by the snap target's stored { id, y, x, status, description }, copied
 * verbatim; the cursor only selects a target, it never supplies coordinates. See
 * docs/superpowers/specs/2026-09-10-vertex-drag-snap-design.md decision 1.
 */

/** A point a dragged vertex may be dropped onto. Coordinates are Cape Lo, verbatim. */
export interface SnapCandidate {
  /** Beacon name — the value stored as cape_lo_points[].id. Unique per project. */
  id: string
  y: number
  x: number
  status?: string
  description?: string
  /** 'parcel-vertex' means there is no coordinate_points row to cross-check against. */
  source: 'coordinate-point' | 'parcel-vertex'
}

/** One cape_lo_points entry, as stored in land_parcels.metadata. */
export interface VertexPoint {
  id: string
  y: number
  x: number
  status?: string
  description?: string
}

/** A parcel as the cascade sees it: a DB id, a name for messages, and its ring. */
export interface CascadeParcel {
  id: number
  designation: string
  points: VertexPoint[] | null | undefined
}

export interface SnapIndex {
  /** Every snappable point, one per name. */
  candidates: SnapCandidate[]
  /** Names held by BOTH a coordinate point and a parcel vertex, further apart than the tolerance. */
  divergent: Array<{ id: string; distanceM: number }>
}

/** A screen-space point, in CSS pixels. Matches MapLibre's Point. */
export interface ScreenPoint {
  x: number
  y: number
}

export interface CascadeWrite {
  parcelId: number
  designation: string
  points: VertexPoint[]
}

export interface CascadeBlocker {
  designation: string
  reason: string
}

export interface CascadePlan {
  writes: CascadeWrite[]
  blockers: CascadeBlocker[]
}

/**
 * Snap radius, in SCREEN PIXELS rather than ground metres. A pixel radius is what
 * makes the gesture honest: at any zoom the surveyor can see what they are about to
 * hit. Precision is unaffected — the committed numbers are the target's own.
 */
export const SNAP_RADIUS_PX = 12

/** Past this, a name's two copies disagree. Same figure repairParcelBeaconNames re-matches on. */
const DIVERGENCE_TOLERANCE_M = 0.5

function coord(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Normalise one raw entry, or null when it has no name or no usable coordinates. */
function readVertex(raw: any): VertexPoint | null {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  const y = coord(raw?.y)
  const x = coord(raw?.x)
  if (!id || y === null || x === null) return null
  return { id, y, x, status: raw.status, description: raw.description }
}

/**
 * Candidate set = project coordinate points ∪ every saved parcel's vertices, keyed by
 * name, coordinate_points winning where a name is in both. A parcel-only name stays a
 * legal target but is badged, because it cannot be cross-checked against a beacon row.
 */
export function buildSnapIndex(coordinatePoints: any[], parcels: CascadeParcel[]): SnapIndex {
  const byName = new Map<string, SnapCandidate>()
  const divergent: Array<{ id: string; distanceM: number }> = []
  const reported = new Set<string>()

  for (const raw of coordinatePoints || []) {
    const point = readVertex(raw)
    if (!point) continue
    byName.set(point.id, { ...point, source: 'coordinate-point' })
  }

  for (const parcel of parcels || []) {
    const points = Array.isArray(parcel?.points) ? parcel.points : []
    for (const raw of points) {
      const point = readVertex(raw)
      if (!point) continue
      const existing = byName.get(point.id)
      if (!existing) {
        byName.set(point.id, { ...point, source: 'parcel-vertex' })
        continue
      }
      // coordinate_points wins. A parcel copy that disagrees is REPORTED, so the UI
      // can warn, rather than silently preferring one set of numbers over the other.
      if (existing.source !== 'coordinate-point' || reported.has(point.id)) continue
      const distanceM = Math.hypot(point.y - existing.y, point.x - existing.x)
      if (distanceM > DIVERGENCE_TOLERANCE_M) {
        divergent.push({ id: point.id, distanceM })
        reported.add(point.id)
      }
    }
  }

  return { candidates: Array.from(byName.values()), divergent }
}

/**
 * Candidates the edited parcel may legally snap to: everything it does not already
 * list. Excluding every one of its own vertices subsumes excluding the dragged one,
 * which is why no vertex index is needed here.
 */
export function eligibleCandidates(index: SnapIndex, parcel: CascadeParcel): SnapCandidate[] {
  const used = new Set<string>()
  for (const raw of Array.isArray(parcel?.points) ? parcel.points : []) {
    const point = readVertex(raw)
    if (point) used.add(point.id)
  }
  return (index?.candidates || []).filter(c => !used.has(c.id))
}

/**
 * The candidate under the cursor, or null past the radius.
 *
 * `project` is injected (it is `map.project` in the view) so this module stays
 * map-free and testable. Strictly nearest, unlike findBeaconNameBySpatialMatch,
 * which returns the FIRST point under its tolerance (utils/beaconNameMatch.ts:20).
 */
export function nearestCandidate(
  candidates: SnapCandidate[],
  cursorPx: ScreenPoint,
  project: (candidate: SnapCandidate) => ScreenPoint | null | undefined,
  radiusPx: number = SNAP_RADIUS_PX
): SnapCandidate | null {
  let best: SnapCandidate | null = null
  let bestD2 = Infinity
  for (const candidate of candidates || []) {
    const pt = project(candidate)
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue
    const dx = pt.x - cursorPx.x
    const dy = pt.y - cursorPx.y
    const d2 = dx * dx + dy * dy
    if (d2 < bestD2) {
      bestD2 = d2
      best = candidate
    }
  }
  return best !== null && bestD2 <= radiusPx * radiusPx ? best : null
}

/**
 * Replace points[index] with the candidate's own stored values. Pure.
 *
 * In place, by index: delete-then-append would rotate the ring and change the
 * traverse order areaCompute builds its residuals and edge list from (decision 2).
 * The candidate's fields are copied verbatim and the replaced vertex's fields are
 * dropped — carrying the old description over would attach it to a different beacon.
 */
export function applySubstitution(
  points: VertexPoint[],
  index: number,
  candidate: SnapCandidate
): VertexPoint[] {
  if (!Array.isArray(points) || index < 0 || index >= points.length) {
    throw new RangeError(
      `applySubstitution: index ${index} is out of range for ${Array.isArray(points) ? points.length : 0} vertices`
    )
  }
  const next = points.slice()
  next[index] = {
    id: candidate.id,
    y: candidate.y,
    x: candidate.x,
    status: candidate.status,
    description: candidate.description,
  }
  return next
}

/**
 * The pre-flight. Decides, before anything is written, whether every parcel sharing
 * the dragged beacon can take the substitution.
 *
 * All-or-nothing: any blocker means zero writes. A parcel left behind is exactly the
 * non-coincident boundary this feature exists to prevent (decisions 5 and 6).
 */
export function planCascade(
  fromName: string,
  candidate: SnapCandidate,
  affected: CascadeParcel[]
): CascadePlan {
  const writes: CascadeWrite[] = []
  const blockers: CascadeBlocker[] = []

  // Dropping a vertex back onto itself is a no-op, not an error. The caller reads
  // "no writes and no blockers" as a cancel.
  if (!candidate?.id || candidate.id === fromName) return { writes, blockers }

  for (const parcel of affected || []) {
    const designation = parcel?.designation || `parcel ${parcel?.id}`

    const raw = Array.isArray(parcel?.points) ? parcel.points : null
    if (!raw || raw.length === 0) {
      blockers.push({ designation, reason: 'its stored vertex list (cape_lo_points) is missing or unreadable' })
      continue
    }

    const read = raw.map(readVertex)
    if (read.some(p => p === null)) {
      blockers.push({ designation, reason: 'it holds a vertex with no name or unusable coordinates' })
      continue
    }
    const points = read as VertexPoint[]

    if (points.length < 3) {
      blockers.push({ designation, reason: `it lists only ${points.length} vertices — a parcel needs at least 3` })
      continue
    }

    const index = points.findIndex(p => p.id === fromName)
    if (index === -1) {
      blockers.push({ designation, reason: `it no longer lists beacon "${fromName}"` })
      continue
    }

    if (points.some((p, i) => i !== index && p.id === candidate.id)) {
      blockers.push({
        designation,
        reason: `it already uses beacon "${candidate.id}" — substituting would list the same corner twice`,
      })
      continue
    }

    writes.push({ parcelId: parcel.id, designation, points: applySubstitution(points, index, candidate) })
  }

  return blockers.length > 0 ? { writes: [], blockers } : { writes, blockers }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/vertexSnap.test.ts`
Expected: PASS.

Then the full suite:
Run: `cd app-frontend && npx vitest run`
Expected: PASS — 656 + the new tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts app-frontend/src/views/modules/cadastral-standard/__tests__/vertexSnap.test.ts
git commit -m "feat(vertex-snap): add the pure snap index, substitution and cascade pre-flight"
```

---

### Task 2: The cascade — `'substitute'` joins the mutation union

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts` (append `CascadeOutcome` + `describeCascadeOutcome`)
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — `rebuildAffectedParcels` (`:4717-4801`)
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/vertexCascade.test.ts`

**Interfaces:**
- Consumes: `planCascade`, `applySubstitution`, `SnapCandidate`, `VertexPoint` (Task 1).
- Produces: `CascadeOutcome { written: string[]; failed: Array<{ designation: string; message: string }> }` and `describeCascadeOutcome(outcome): string | null` from `vertexSnap.ts`; `rebuildAffectedParcels(affected, mutation)` now accepts `{ kind: 'substitute'; name: string; replacement: SnapCandidate }` and **returns `Promise<CascadeOutcome>`** instead of `Promise<void>`.

**Automated coverage:** the `.ts` half (the plan's write set, the coincidence invariant, the outcome copy) is fully tested. The `.vue` half — `rebuildAffectedParcels` — has **none**, per this repo's convention. Its manual regression check is Step 5 and is mandatory: this task changes how the *existing* point-edit and point-delete paths resolve their parcels.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/vertexCascade.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  planCascade,
  describeCascadeOutcome,
  type SnapCandidate,
  type VertexPoint,
  type CascadeParcel,
} from '../vertexSnap'

const v = (id: string, y: number, x: number): VertexPoint => ({ id, y, x })
const parcel = (id: number, designation: string, points: VertexPoint[]): CascadeParcel =>
  ({ id, designation, points })

/** The beacon being dragged away from, and the peg it is dropped on. */
const FROM = 'PEG_14'
const TO: SnapCandidate = {
  id: 'PEG_22',
  y: 97581.234,
  x: 2247733.567,
  status: 'P',
  description: 'iron peg',
  source: 'coordinate-point',
}

/** Three parcels meeting at PEG_14 — the shared-corner case this feature exists for. */
const threeSharers = (): CascadeParcel[] => [
  parcel(101, 'STAND 207', [v(FROM, 0, 0), v('B', 0, 10), v('C', 10, 10), v('D', 10, 0)]),
  parcel(102, 'STAND 208', [v('E', 0, -10), v(FROM, 0, 0), v('D', 10, 0), v('F', 10, -10)]),
  parcel(103, 'Outside Figure', [v('G', -10, 0), v('H', -10, 10), v('B', 0, 10), v(FROM, 0, 0)]),
]

describe('the cascade write set', () => {
  it('writes every parcel that shares the beacon, the edited one included', () => {
    // findAffectedParcels returns the edited parcel too, so the edited parcel and its
    // sharers go down ONE path -- requirement 4 by construction, not by a second branch.
    const plan = planCascade(FROM, TO, threeSharers())
    expect(plan.blockers).toEqual([])
    expect(plan.writes.map(w => w.designation)).toEqual(['STAND 207', 'STAND 208', 'Outside Figure'])
  })

  it('writes exactly one parcel when only one holds the beacon', () => {
    const plan = planCascade(FROM, TO, [threeSharers()[0]])
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0].parcelId).toBe(101)
  })

  it('lands the SAME coordinates in every parcel — the coincidence invariant', () => {
    const plan = planCascade(FROM, TO, threeSharers())
    const landed = plan.writes.map(w => w.points.find(p => p.id === TO.id))
    expect(landed).toHaveLength(3)
    for (const point of landed) {
      expect(point).toEqual({ id: 'PEG_22', y: 97581.234, x: 2247733.567, status: 'P', description: 'iron peg' })
    }
  })

  it('substitutes at each parcel\'s own index, leaving ring order untouched', () => {
    const plan = planCascade(FROM, TO, threeSharers())
    expect(plan.writes[0].points.map(p => p.id)).toEqual(['PEG_22', 'B', 'C', 'D'])
    expect(plan.writes[1].points.map(p => p.id)).toEqual(['E', 'PEG_22', 'D', 'F'])
    expect(plan.writes[2].points.map(p => p.id)).toEqual(['G', 'H', 'B', 'PEG_22'])
  })

  it('leaves every other vertex of every parcel untouched', () => {
    const before = threeSharers()
    const plan = planCascade(FROM, TO, before)
    plan.writes.forEach((write, i) => {
      const original = before[i].points!
      expect(write.points).toHaveLength(original.length)
      write.points.forEach((p, j) => {
        if (original[j].id === FROM) return
        expect(p).toEqual(original[j])
      })
    })
  })

  it('writes nothing at all when ONE of three parcels blocks', () => {
    // All-or-nothing: a parcel left behind is the non-coincident boundary this
    // feature exists to prevent.
    const parcels = threeSharers()
    parcels[1].points = [v('E', 0, -10), v(FROM, 0, 0), v('PEG_22', 1, 1)]
    const plan = planCascade(FROM, TO, parcels)
    expect(plan.writes).toEqual([])
    expect(plan.blockers.map(b => b.designation)).toEqual(['STAND 208'])
  })
})

describe('describeCascadeOutcome', () => {
  it('says nothing when every parcel was written', () => {
    expect(describeCascadeOutcome({ written: ['STAND 207', 'STAND 208'], failed: [] })).toBeNull()
  })

  it('names the inconsistency in those terms when a write failed after a success', () => {
    // There is no cross-parcel transaction (spec Resolved decision 2), so the
    // surveyor must be told the boundaries now disagree -- never a console warning.
    const message = describeCascadeOutcome({
      written: ['STAND 207'],
      failed: [{ designation: 'STAND 208', message: 'Request failed with status code 500' }],
    })!
    expect(message).toMatch(/PARTIAL UPDATE/)
    expect(message).toMatch(/STAND 207/)
    expect(message).toMatch(/STAND 208 — Request failed with status code 500/)
    expect(message).toMatch(/Re-run/i)
  })

  it('says plainly that nothing was written when no parcel succeeded', () => {
    const message = describeCascadeOutcome({
      written: [],
      failed: [{ designation: 'STAND 207', message: 'no longer exists in the database' }],
    })!
    expect(message).not.toMatch(/PARTIAL UPDATE/)
    expect(message).toMatch(/boundaries are unchanged/)
    expect(message).toMatch(/STAND 207 — no longer exists in the database/)
  })

  it('lists every failure, not just the first', () => {
    const message = describeCascadeOutcome({
      written: ['A'],
      failed: [{ designation: 'B', message: 'x' }, { designation: 'C', message: 'y' }],
    })!
    expect(message).toMatch(/B — x/)
    expect(message).toMatch(/C — y/)
  })

  it('tolerates a malformed outcome without throwing', () => {
    expect(describeCascadeOutcome({} as any)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/vertexCascade.test.ts`
Expected: FAIL — `describeCascadeOutcome is not a function`. (The `planCascade` blocks should already pass — they exercise Task 1.)

- [ ] **Step 3: Add the outcome type and its copy**

Append to `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts`:

```ts
/** What actually happened when the plan was executed, parcel by parcel. */
export interface CascadeOutcome {
  /** Designations written successfully. */
  written: string[]
  /** Designations that were not written, with why. */
  failed: Array<{ designation: string; message: string }>
}

/**
 * The blocking-dialog text for a cascade that did not fully succeed, or null when it
 * did. Lives here rather than in the view so the wording is tested.
 *
 * Each parcel is its own PUT and there is no cross-parcel transaction (a batch
 * endpoint is deliberately out of scope this pass). If a write fails after at least
 * one succeeded, the boundaries are now inconsistent and the surveyor must be told in
 * exactly those terms.
 */
export function describeCascadeOutcome(outcome: CascadeOutcome): string | null {
  const failed = outcome?.failed ?? []
  if (failed.length === 0) return null

  const written = outcome?.written ?? []
  const lines = failed.map(f => `  • ${f.designation} — ${f.message}`).join('\n')

  if (written.length === 0) {
    return (
      `No parcel was updated.\n\n` +
      `The drag could not be applied to:\n${lines}\n\n` +
      `Nothing was written, so the boundaries are unchanged.`
    )
  }

  return (
    `PARTIAL UPDATE — the shared boundary is now inconsistent.\n\n` +
    `Updated (${written.length}): ${written.join(', ')}\n` +
    `NOT updated (${failed.length}):\n${lines}\n\n` +
    `Those parcels no longer share the same corner. Re-run the same drag to finish it, ` +
    `or fix the parcels above before generating any plan from this record.`
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/vertexCascade.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `rebuildAffectedParcels` in the view**

In `MapLibreAreaView.vue`, add to the import block near line 914:

```ts
import {
  buildSnapIndex,
  eligibleCandidates,
  nearestCandidate,
  applySubstitution,
  planCascade,
  describeCascadeOutcome,
  SNAP_RADIUS_PX,
  type SnapCandidate,
  type VertexPoint,
  type CascadeOutcome,
} from './vertexSnap';
```

(`buildSnapIndex`, `eligibleCandidates`, `nearestCandidate`, `planCascade`, `describeCascadeOutcome` and `SNAP_RADIUS_PX` are consumed in Tasks 4 and 5. Import them now so the import block is written once.)

Replace the whole of `rebuildAffectedParcels` (`:4705-4801`, doc comment included) with:

```ts
/**
 * Rebuild affected parcels after a point edit, delete, or drag-to-snap substitution.
 *
 * Unlike recomputeAllParcels (which only refreshes residuals using stale
 * cape_lo_points), this rewrites each affected parcel's geometry and cape_lo_points
 * to reflect the point mutation, then re-runs the area computation.
 *
 *  - edit:       replaces the matching point's y/x/description
 *  - delete:     removes the matching point
 *  - substitute: replaces the matching point IN PLACE with another beacon, verbatim
 *
 * Returns a per-parcel outcome. Callers that care about a partial cascade (the drag
 * path) render it with describeCascadeOutcome; the point edit/delete paths ignore it
 * and behave exactly as before.
 */
async function rebuildAffectedParcels(
  affectedParcels: Array<{ id: number; stand: string; designation: string }>,
  mutation:
    | { kind: 'edit'; name: string; y?: number; x?: number; description?: string }
    | { kind: 'delete'; name: string }
    | { kind: 'substitute'; name: string; replacement: SnapCandidate }
): Promise<CascadeOutcome> {
  const outcome: CascadeOutcome = { written: [], failed: [] };
  if (affectedParcels.length === 0) return outcome;

  console.log(`[PointEdit] 🔧 Rebuilding ${affectedParcels.length} affected parcel(s) for ${mutation.kind} of "${mutation.name}"...`);

  // Resolve each parcel from the DATABASE ROWS, keyed by id.
  //
  // Not savedParcels: its key is `designation || stand` at :4193 and `stand ||
  // designation` at :5598, and a miss there used to `continue` silently -- leaving a
  // sharing parcel behind, which is the exact non-coincident boundary this path
  // exists to prevent.
  //
  // Fresh, not snapshotted at confirm time: editPanelHandler runs handlePointRename
  // between the confirm and this call, and that rename rewrites cape_lo_points names
  // in the DB. A snapshot taken before it would no longer contain mutation.name and
  // every combined rename+coordinate edit would silently no-op.
  const projectId = workflowState?.projectInfo?.projectId;
  let rows = new Map<number, any>();
  try {
    if (!projectId) throw new Error('no project loaded');
    const fresh = await listLandParcels(Number(projectId));
    rows = new Map(fresh.map((p: any) => [p.id, p]));
  } catch (err: any) {
    const message = `could not be re-read from the database (${err?.response?.data?.error || err?.message || 'unknown error'})`;
    for (const af of affectedParcels) outcome.failed.push({ designation: af.designation, message });
    console.error('[PointEdit] ❌ Could not re-read parcels before rebuilding:', err);
    return outcome;
  }

  for (const af of affectedParcels) {
    try {
      const parcel = rows.get(af.id);
      if (!parcel) throw new Error('no longer exists in the database');

      const existingPoints: VertexPoint[] = parcel.metadata?.cape_lo_points || [];

      let newPoints: VertexPoint[];
      if (mutation.kind === 'edit') {
        newPoints = existingPoints.map(p => {
          if (p.id !== mutation.name) return p;
          return {
            ...p,
            ...(mutation.y !== undefined && { y: mutation.y }),
            ...(mutation.x !== undefined && { x: mutation.x }),
            ...(mutation.description !== undefined && { description: mutation.description }),
          };
        });
      } else if (mutation.kind === 'delete') {
        newPoints = existingPoints.filter(p => p.id !== mutation.name);
      } else {
        const idx = existingPoints.findIndex(p => p.id === mutation.name);
        if (idx === -1) throw new Error(`no longer lists beacon "${mutation.name}"`);
        // In place, by index. planCascade already pre-flighted this, but the ring is
        // re-read here, so a parcel that changed under us fails loudly instead of
        // being written from a stale plan.
        newPoints = applySubstitution(existingPoints, idx, mutation.replacement);
      }

      if (newPoints.length < 3) {
        throw new Error(`only ${newPoints.length} vertices would remain after ${mutation.kind}`);
      }

      const areaResult = await areaCompute({
        points: newPoints.map(p => ({ y: p.y, x: p.x, id: p.id, name: p.id })),
        includeResiduals: true,
        roundMetersDecimals: 2,
        roundHectaresDecimals: 4,
      });

      const closureError = Math.sqrt(
        (areaResult.residuals?.sumDy || 0) ** 2 + (areaResult.residuals?.sumDx || 0) ** 2
      );

      const coordinates = newPoints.map(p => [p.x, p.y]);
      coordinates.push(coordinates[0]);
      const geometry = {
        type: 'Polygon',
        coordinates: [coordinates],
        crs: { type: 'name', properties: { name: 'EPSG:22291' } },
      } as any;

      const perimeter = newPoints.reduce((sum, p, i) => {
        const next = newPoints[(i + 1) % newPoints.length];
        return sum + Math.sqrt((next.y - p.y) ** 2 + (next.x - p.x) ** 2);
      }, 0);
      const closureRatio = perimeter / (closureError || 0.001);

      const stampedAt = new Date().toISOString();
      const updatedMetadata = {
        ...parcel.metadata,
        points_count: newPoints.length,
        closure_ratio: `1:${Math.round(closureRatio).toLocaleString()}`,
        closure_error_m: closureError,
        residuals: areaResult.residuals,
        cape_lo_points: newPoints.map(p => ({
          id: p.id, y: p.y, x: p.x, status: p.status, description: p.description,
        })),
        point_edit_rebuilt_at: stampedAt,
        ...(mutation.kind === 'substitute' && { vertex_drag_snap_at: stampedAt }),
      };

      await updateLandParcel(parcel.id, { geom: geometry, metadata: updatedMetadata });
      outcome.written.push(af.designation);
      console.log(`[PointEdit] ✅ Rebuilt ${af.designation}`);
    } catch (err: any) {
      console.error(`[PointEdit] ❌ Failed to rebuild ${af.designation}:`, err);
      outcome.failed.push({
        designation: af.designation,
        message: err?.response?.data?.error || err?.message || 'unknown error',
      });
    }
  }

  await refreshParcelsFromDatabase();
  return outcome;
}
```

`area_m2` / `area_ha` / `perimeter_m` are generated columns (`migrations/040.do.sql:108-110`) and are never sent — `services/spatial.ts:376` already strips them. The hardcoded `EPSG:22291` is inert: `LandParcel.update` re-derives the SRID from the project's central meridian (`models/landParcel.js:113-122`) and ignores the GeoJSON `crs` member.

**Two behaviour changes to be aware of, both intended:**
- a parcel that would drop below 3 vertices, or that is missing from the DB, is now an `outcome.failed` entry instead of a `console.warn` + `continue`. Existing callers ignore the return value, so what the surveyor sees on the edit/delete paths is unchanged.
- `rebuildAffectedParcels` now makes one `listLandParcels` call of its own. That is the price of decision 5 and of the rename hazard above.

- [ ] **Step 6: Verify — automated, then manually in the running app**

Run: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

Run: `cd app-frontend && npm run build`
Expected: build succeeds. (It compiles `.vue` but does not type-check it — a green build is not a type check.)

**Manual regression, required — this task touched the live point-edit path:**

1. Open a project with at least two parcels sharing a beacon, in the Area Computation (MapLibre) view.
2. Click a shared peg → **Edit Coordinates** → change Y by 1 m → confirm the affected-parcels dialog. Both parcels' cards show a new area and closure ratio, and the map redraws. *(This is the path that would break if the fresh re-read were wrong.)*
3. Repeat with a **rename + coordinate change in one save**. The beacon's new name appears on the map and both parcels still recompute. *(This is the rename hazard the fresh read exists for — if the parcels do not recompute, the re-read is being done too early.)*
4. Click a shared peg → **Delete Point** → confirm. The beacon disappears from every parcel that used it and those parcels recompute.
5. Cancel each of those dialogs once and confirm nothing changes.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts app-frontend/src/views/modules/cadastral-standard/__tests__/vertexCascade.test.ts app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(vertex-snap): add the substitute cascade kind and drive it off DB rows"
```

---

### Task 3: Selecting a parcel

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — state near `:1979`, `initializeMap` after `:2569`, and the three feature builders at `:1234`, `:2655`, `:4337`

**Interfaces:**
- Consumes: `VertexPoint` (Task 1).
- Produces: `selectedParcelId: Ref<number | null>`, `selectedParcel: ComputedRef<any | null>`, `selectedParcelPoints: ComputedRef<VertexPoint[]>`, `applySelectionPaint()`, `visibleSelectionLayers()`. Tasks 4 and 5 read all of these.

**No automated test.** There is no component harness and no map in jsdom; everything testable here already lives in `vertexSnap.ts`. Verification is Step 5 and is part of the task.

- [ ] **Step 1: Add the selection state**

In `<script setup>`, immediately after the vertex-editing state block at `:1979-1986` (that block is deleted in Task 6; leave it alone for now):

```ts
// ── Vertex drag-to-snap ───────────────────────────────────────────────────────
// A drag is a RE-REFERENCE, never a coordinate change: the dragged vertex is
// replaced by the snap target's stored values, copied verbatim. See
// docs/superpowers/specs/2026-09-10-vertex-drag-snap-design.md.
const selectedParcelId = ref<number | null>(null);   // DB id, never a designation
const draggingVertexIndex = ref<number | null>(null);
const snapCandidate = ref<SnapCandidate | null>(null);
const dragChipPx = ref<{ x: number; y: number } | null>(null);
const dragDivergent = ref<Map<string, number>>(new Map());

/** The selected parcel's DB row, resolved BY ID -- never through a savedParcels key. */
const selectedParcel = computed<any | null>(() => {
  if (selectedParcelId.value === null) return null;
  return (Array.from(savedParcels.value.values()) as any[])
    .find(p => p.id === selectedParcelId.value) ?? null;
});

/** The selected parcel's stored ring. Empty when nothing is selected. */
const selectedParcelPoints = computed<VertexPoint[]>(
  () => (selectedParcel.value?.metadata?.cape_lo_points as VertexPoint[]) || []
);

/** Layers a click may land on without clearing the selection. */
function visibleSelectionLayers(): string[] {
  return ['parcels-fill', 'vertices-circle'].filter(id => !!map?.getLayer(id));
}

/**
 * Re-apply the selected-parcel paint.
 *
 * A MapLibre paint expression cannot read a Vue ref, so the expression is rebuilt
 * every time the selection changes. The status `match` branches are copied from the
 * layer definitions so an unselected parcel keeps exactly its existing colours.
 */
function applySelectionPaint() {
  if (!map || !map.getLayer('parcels-fill') || !map.getLayer('parcels-outline')) return;
  const id = selectedParcelId.value ?? -1;
  map.setPaintProperty('parcels-fill', 'fill-opacity', ['case', ['==', ['get', 'id'], id], 0.6, 0.4]);
  map.setPaintProperty('parcels-outline', 'line-width', ['case', ['==', ['get', 'id'], id], 5, 3]);
  map.setPaintProperty('parcels-outline', 'line-color', [
    'case',
    ['==', ['get', 'id'], id], '#dc2626',
    ['match', ['get', 'status'],
      'draft', '#f59e0b',
      'finalized', '#1d4ed8',
      'approved', '#059669',
      '#6b7280'],
  ]);
}

watch(selectedParcelId, () => applySelectionPaint());
```

- [ ] **Step 2: Put the DB id on every parcel feature**

The `parcels` source is fed from three places. **All three need `id`** — miss one and clicking a parcel does nothing until something else triggers a refresh.

In `confirmParcelRename`, at `:1234`, replace the properties object:

```ts
          properties: { id: dbParcel.id, designation: parcelName, area: areaDisplay, status: dbParcel.status || 'draft' }
```

In `initializeMap`, at `:2655-2661`, add `id` as the first property:

```ts
            properties: {
              id: dbParcel.id,
              designation: parcelName,
              area: areaDisplay,
              status: dbParcel.status || 'draft',
              closureRatio: dbParcel.metadata?.closure_ratio,
              closureError: typeof dbParcel.closure_error_m === 'number' ? dbParcel.closure_error_m.toFixed(3) : '0.000'
            }
```

In `refreshParcelsFromDatabase`, at `:4337-4343`, the same:

```ts
        properties: {
          id: dbParcel.id,
          designation: parcelName,
          area: areaDisplay,
          status: dbParcel.status || 'draft',
          closureRatio: dbParcel.metadata?.closure_ratio,
          closureError: typeof dbParcel.closure_error_m === 'number' ? dbParcel.closure_error_m.toFixed(3) : '0.000'
        }
```

Leave `addCompletedParcelToMap` (`:5269`) alone. A just-computed, unsaved parcel has no DB id and must not be selectable for a cascade until it is persisted; it becomes selectable after the auto-save and refresh.

- [ ] **Step 3: Wire the click handlers**

In `initializeMap`, immediately after `parcelsSource = map.getSource('parcels') as maplibregl.GeoJSONSource;` (`:2569`):

```ts
    // Click a parcel to select it for vertex editing. This is the entry point that
    // replaces the retired 🔺 buttons -- there was no parcel click handler before.
    map.on('click', 'parcels-fill', (e) => {
      if (isDrawing.value) return;                 // drawing a new parcel owns the map
      if (!e.features || e.features.length === 0) return;
      const id = Number(e.features[0].properties?.id);
      if (!Number.isFinite(id)) {
        console.warn('[VertexDrag] Parcel feature carries no usable id property');
        return;
      }
      selectedParcelId.value = selectedParcelId.value === id ? null : id;
      console.log(`[VertexDrag] Selected parcel id ${selectedParcelId.value ?? '(none)'}`);
    });

    // Clicking bare ground clears the selection. MapLibre fires both the layer
    // handler and this one for the same click, so re-query rather than assume order.
    map.on('click', (e) => {
      if (draggingVertexIndex.value !== null) return;
      const hits = map!.queryRenderedFeatures(e.point, { layers: visibleSelectionLayers() });
      if (hits.length === 0) selectedParcelId.value = null;
    });

    map.on('mouseenter', 'parcels-fill', () => {
      if (map && !isDrawing.value) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'parcels-fill', () => {
      if (map && !isDrawing.value && draggingVertexIndex.value === null) map.getCanvas().style.cursor = '';
    });
```

- [ ] **Step 4: Clear the selection when Esc is pressed**

In `handleKeyPress` (`:6789`), add the new branch **before** the existing drawing branch:

```ts
function handleKeyPress(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedParcelId.value !== null && !isDrawing.value) {
    selectedParcelId.value = null;
    return;
  }
  if (e.key === 'Escape' && isDrawing.value) {
    if (selectedPoints.value.length >= 3) {
      completePolygon();
    } else {
      cancelDrawing();
    }
  }
}
```

- [ ] **Step 5: Verify — automated, then manually in the running app**

Run: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

Run: `cd app-frontend && npm run build`
Expected: build succeeds.

**Manual, required:**

1. Open a project with several saved parcels in the Area Computation (MapLibre) view.
2. Hover a parcel → the cursor becomes a pointer. Click it → its fill darkens and its outline turns red and thickens. Every other parcel keeps its status colour.
3. Click a second parcel → the highlight moves. Click the same parcel again → it deselects.
4. Click bare ground → the selection clears.
5. Press **Esc** with a parcel selected → it clears.
6. Start **Draw Parcel** and click over an existing parcel → **nothing is selected**; the click still adds the beacon to the drawing.
7. Rename a parcel, then click it → it still selects (proving the rename re-render carries `id`).
8. Reload the page and click a parcel **before** doing anything else → it selects (proving the initial render carries `id`).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(vertex-snap): select a parcel by clicking it on the map"
```

---

### Task 4: The vertex markers and the drag gesture

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — `initializeMap` (after the `parcels-labels` layer, `:2567`), new functions beside `updateTempPolygon` (`:4928`), the template's map overlay area (beside the drawing status bar, `:324`), and `handleKeyPress`

**Interfaces:**
- Consumes: `selectedParcel`, `selectedParcelPoints`, `draggingVertexIndex`, `snapCandidate`, `dragChipPx`, `dragDivergent` (Task 3); `buildSnapIndex`, `eligibleCandidates`, `nearestCandidate`, `applySubstitution`, `SNAP_RADIUS_PX` (Task 1).
- Produces: `renderSelectedVertices(overrideLngLat?)`, `beginVertexDrag(index)`, `moveVertexDrag(point, lngLat)`, `endVertexDrag()`, `cancelVertexDrag()`, `previewDragToCursor(lngLat)`, `snapCandidateDivergence`. Task 5 replaces one line inside `endVertexDrag`.

**No automated test.** The drag gesture is `mousedown`/`mousemove`/`mouseup` on a MapLibre layer; there is no component harness and no map in jsdom. Step 6 is the coverage.

- [ ] **Step 1: Add the vertices source and layer**

Beside the existing source handles at `:2044-2046`:

```ts
let verticesSource: maplibregl.GeoJSONSource | null = null;
```

In `initializeMap`, immediately after the `parcels-labels` layer is added (`:2567`) and before `parcelsSource = ...`:

```ts
    // Vertex markers for the selected parcel. Added AFTER parcels-labels so the
    // markers always sit on top and stay grabbable.
    map.addSource('vertices', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'vertices-circle',
      type: 'circle',
      source: 'vertices',
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['get', 'dragging'], '#dc2626', '#ffffff'],
        'circle-stroke-color': '#dc2626',
        'circle-stroke-width': 3
      }
    });

    verticesSource = map.getSource('vertices') as maplibregl.GeoJSONSource;
```

- [ ] **Step 2: Render the markers**

Add beside `updateTempPolygon` (`:4928`):

```ts
/**
 * Draw the selected parcel's vertices. `overrideLngLat` moves the dragged marker to
 * the cursor -- DISPLAY ONLY. No Cape Lo value is ever derived from it.
 */
function renderSelectedVertices(overrideLngLat?: { lng: number; lat: number }) {
  if (!map || !verticesSource) return;

  const points = selectedParcelPoints.value;
  if (points.length === 0) {
    verticesSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const wgs84 = capeLoArrayToWGS84(points.map(p => ({ id: p.id, x: p.x, y: p.y })), loZone);

  verticesSource.setData({
    type: 'FeatureCollection',
    features: wgs84.map((w, index) => {
      const dragging = index === draggingVertexIndex.value;
      const coordinates = dragging && overrideLngLat
        ? [overrideLngLat.lng, overrideLngLat.lat]
        : [w.lng, w.lat];
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates },
        properties: { index, id: points[index].id, dragging }
      };
    })
  });
}

watch([selectedParcelId, selectedParcelPoints], () => renderSelectedVertices());
```

- [ ] **Step 3: Add the drag gesture**

Directly below `renderSelectedVertices`:

```ts
/** Candidates and their screen projections, snapshotted once per drag. */
let dragCandidates: SnapCandidate[] = [];
const dragLngLatById = new Map<string, [number, number]>();

/** How far the hovered candidate's two stored copies disagree, or null. */
const snapCandidateDivergence = computed<number | null>(() =>
  snapCandidate.value ? (dragDivergent.value.get(snapCandidate.value.id) ?? null) : null
);

function beginVertexDrag(index: number) {
  const parcel = selectedParcel.value;
  const points = selectedParcelPoints.value;
  if (!parcel || !Number.isFinite(index) || index < 0 || index >= points.length) return;

  // Candidate set = project coordinate points ∪ every saved parcel's vertices,
  // minus everything this parcel already lists.
  const snapIndex = buildSnapIndex(
    coordinatePoints.value as any[],
    (Array.from(savedParcels.value.values()) as any[]).map(p => ({
      id: p.id,
      designation: p.designation || p.stand,
      points: p.metadata?.cape_lo_points || []
    }))
  );
  const eligible = eligibleCandidates(snapIndex, {
    id: parcel.id,
    designation: parcel.designation || parcel.stand,
    points
  });

  // Project once per drag, not per mousemove: capeLoArrayToWGS84 is a proj4 call
  // per point, and mousemove fires at frame rate.
  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const wgs84 = capeLoArrayToWGS84(eligible.map(c => ({ id: c.id, x: c.x, y: c.y })), loZone);
  dragLngLatById.clear();
  eligible.forEach((c, i) => dragLngLatById.set(c.id, [wgs84[i].lng, wgs84[i].lat]));
  dragCandidates = eligible;
  dragDivergent.value = new Map(snapIndex.divergent.map(d => [d.id, d.distanceM]));

  draggingVertexIndex.value = index;
  snapCandidate.value = null;
  if (map) map.getCanvas().style.cursor = 'grabbing';
  console.log(`[VertexDrag] ✊ Dragging "${points[index].id}" — ${eligible.length} candidate(s)`);
}

function moveVertexDrag(point: { x: number; y: number }, lngLat: { lng: number; lat: number }) {
  const index = draggingVertexIndex.value;
  if (index === null || !map) return;

  snapCandidate.value = nearestCandidate(
    dragCandidates,
    { x: point.x, y: point.y },
    (candidate) => {
      const lngLatPair = dragLngLatById.get(candidate.id);
      return lngLatPair ? map!.project(lngLatPair) : null;
    },
    SNAP_RADIUS_PX
  );
  dragChipPx.value = { x: point.x, y: point.y };

  renderSelectedVertices(lngLat);
  if (snapCandidate.value) {
    // Snapped: preview the REAL substituted ring through the existing helper.
    updateTempPolygon(applySubstitution(selectedParcelPoints.value, index, snapCandidate.value));
  } else {
    previewDragToCursor(lngLat);
  }
}

/**
 * Rubber-band the two incident edges to the cursor while nothing is under it.
 *
 * Drawn straight in WGS84 rather than through updateTempPolygon, which needs Cape Lo
 * points: turning the cursor into Cape Lo is exactly the coordinate-deriving path
 * decision 1 forbids. This LineString is display only and is never persisted.
 */
function previewDragToCursor(lngLat: { lng: number; lat: number }) {
  const index = draggingVertexIndex.value;
  const points = selectedParcelPoints.value;
  if (!map || !tempPolygonSource || index === null || points.length < 3) return;

  const loZone = workflowState?.projectInfo?.centralMeridian || 31;
  const prev = points[(index - 1 + points.length) % points.length];
  const next = points[(index + 1) % points.length];
  const [a, b] = capeLoArrayToWGS84(
    [{ id: prev.id, x: prev.x, y: prev.y }, { id: next.id, x: next.x, y: next.y }],
    loZone
  );

  tempPolygonSource.setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[a.lng, a.lat], [lngLat.lng, lngLat.lat], [b.lng, b.lat]]
      }
    }]
  });
}

function endVertexDrag() {
  if (draggingVertexIndex.value === null) return;
  if (snapCandidate.value) {
    // TASK 5 REPLACES THIS LINE with: void commitVertexDrag();
    console.log(`[VertexDrag] would commit → "${snapCandidate.value.id}"`);
    cancelVertexDrag();
  } else {
    console.log('[VertexDrag] Released with no candidate — cancelled, nothing written');
    cancelVertexDrag();
  }
}

/** Drop the gesture and every trace of it. Writes nothing. */
function cancelVertexDrag() {
  draggingVertexIndex.value = null;
  snapCandidate.value = null;
  dragChipPx.value = null;
  dragCandidates = [];
  dragLngLatById.clear();
  dragDivergent.value = new Map();
  updateTempPolygon([]);
  if (map) map.getCanvas().style.cursor = '';
  renderSelectedVertices();
}
```

- [ ] **Step 4: Register the raw handlers**

In `initializeMap`, after the parcel click handlers added in Task 3:

```ts
    // MapLibre has no vertex-drag primitive, so the gesture is assembled from raw
    // handlers. e.preventDefault() on the layer mousedown is what suppresses the
    // map pan for the duration of the drag.
    map.on('mouseenter', 'vertices-circle', () => {
      if (map && draggingVertexIndex.value === null) map.getCanvas().style.cursor = 'grab';
    });
    map.on('mouseleave', 'vertices-circle', () => {
      if (map && draggingVertexIndex.value === null) map.getCanvas().style.cursor = '';
    });

    map.on('mousedown', 'vertices-circle', (e) => {
      if (!e.features || e.features.length === 0) return;
      e.preventDefault();
      beginVertexDrag(Number(e.features[0].properties?.index));
    });
    map.on('mousemove', (e) => {
      if (draggingVertexIndex.value !== null) moveVertexDrag(e.point, e.lngLat);
    });
    map.on('mouseup', () => endVertexDrag());

    // Field use is on tablets: the same path, single touch only.
    map.on('touchstart', 'vertices-circle', (e) => {
      if (!e.features || e.features.length === 0) return;
      if (e.points.length !== 1) return;
      e.preventDefault();
      beginVertexDrag(Number(e.features[0].properties?.index));
    });
    map.on('touchmove', (e) => {
      if (draggingVertexIndex.value === null) return;
      if (e.points.length !== 1) return;
      e.preventDefault();
      moveVertexDrag(e.points[0], e.lngLat);
    });
    map.on('touchend', () => endVertexDrag());
```

And in `handleKeyPress`, add the drag branch **above** the selection branch from Task 3:

```ts
  if (e.key === 'Escape' && draggingVertexIndex.value !== null) {
    cancelVertexDrag();
    return;
  }
```

- [ ] **Step 5: Add the hover chip**

In the template, immediately after the Drawing Status Bar block (`:324-347`):

```html
      <!-- Drag hover chip: what releasing here will do. Nothing is written until mouseup. -->
      <div
        v-if="draggingVertexIndex !== null && dragChipPx"
        class="absolute z-40 pointer-events-none px-2 py-1 rounded text-xs shadow-lg whitespace-nowrap"
        :class="snapCandidate ? 'bg-red-600 text-white font-semibold' : 'bg-gray-900/90 text-gray-100'"
        :style="{ left: `${dragChipPx.x + 14}px`, top: `${dragChipPx.y - 10}px` }"
      >
        <template v-if="snapCandidate">
          ⤵ snap to <strong>{{ snapCandidate.id }}</strong>
          <span v-if="snapCandidate.source === 'parcel-vertex'" class="ml-1 font-normal opacity-90">
            (parcel vertex — no beacon record)
          </span>
          <span v-if="snapCandidateDivergence !== null" class="ml-1 font-normal opacity-90">
            ⚠ differs from the beacon record by {{ snapCandidateDivergence.toFixed(2) }} m
          </span>
        </template>
        <template v-else>release to cancel — no point within snap range</template>
      </div>
```

- [ ] **Step 6: Verify — automated, then manually in the running app**

Run: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

Run: `cd app-frontend && npm run build`
Expected: build succeeds.

**Manual, required:**

1. Select a parcel → white-with-red vertex markers appear **on that parcel only**. Deselect → they disappear.
2. Hover a marker → cursor `grab`. Press and hold → cursor `grabbing`, and **the map does not pan**.
3. Drag over empty ground → the marker follows the cursor, the two incident edges rubber-band to it, and the chip reads "release to cancel — no point within snap range".
4. Drag within ~12 px of a peg → the chip turns red and names the peg; the preview line jumps to the peg. Move 20 px away → it reverts to the cancel chip. The snap distance is the same on screen at every zoom level.
5. Drag near a **cluster** of pegs → the chip names the nearest one, and it changes as the cursor crosses the midpoint between two.
6. Drag onto one of the parcel's **own** vertices → no snap ever offers (a parcel may not list a beacon twice).
7. Release with a candidate → the console logs `would commit → "<name>"` and **nothing is written** (Task 5 supplies the write).
8. Release with no candidate, and separately press **Esc** mid-drag → the markers snap back to their stored positions and the preview line clears.
9. On a touch device or browser touch emulation, repeat 2–4 with one finger. A two-finger gesture still pans and zooms the map.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(vertex-snap): add vertex markers and the drag gesture"
```

---

### Task 5: `commitVertexDrag` — the cascade, gated by the existing confirm

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — `findAffectedParcels` (`:1253`), `requireAffectedParcelsConfirm` (`:1273`), new `commitVertexDrag` beside the drag functions, one line in `endVertexDrag`

**Interfaces:**
- Consumes: `planCascade`, `describeCascadeOutcome`, `applySubstitution` (Tasks 1–2); `rebuildAffectedParcels` with `kind: 'substitute'` (Task 2); the drag state (Tasks 3–4).
- Produces: `findAffectedParcels` items gain `capeLoPoints: any[]`; new `showAffectedParcelsConfirm(pointName, parcels, intent): Promise<void>`; new `substitutionWouldCross(points, index, candidate): boolean`; new `commitVertexDrag(): Promise<void>`.

**No automated test.** Every decision this function makes is already covered by `vertexSnap.test.ts` and `vertexCascade.test.ts`; what is left is orchestration and dialogs. Step 6 is the coverage.

- [ ] **Step 1: Return the vertex list from `findAffectedParcels`**

It already reads `cape_lo_points` to run its test and throws the value away. Returning it lets the pre-flight run with no second fetch. Replace `:1253-1271`:

```ts
async function findAffectedParcels(
  pointName: string
): Promise<Array<{ id: number; stand: string; designation: string; capeLoPoints: any[] }>> {
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) return [];
  const parcels = await listLandParcels(Number(projectId));
  const out: Array<{ id: number; stand: string; designation: string; capeLoPoints: any[] }> = [];
  for (const p of parcels) {
    const capeLoPoints: any[] = (p.metadata as any)?.cape_lo_points ?? [];
    if (capeLoPoints.some(v => v?.id === pointName)) {
      out.push({
        id: p.id,
        stand: p.stand,
        designation: (p as any).designation ?? p.stand,
        // Carried so planCascade can pre-flight without a second listLandParcels call.
        capeLoPoints,
      });
    }
  }
  return out;
}
```

The narrower `Array<{ id; stand; designation }>` annotations at `:1300`, `:1413` and on `rebuildAffectedParcels`'s parameter stay as they are — TypeScript accepts the wider value, and neither path reads the new field.

- [ ] **Step 2: Split the confirm so the drag path does not refetch**

Replace `requireAffectedParcelsConfirm` (`:1273-1283`) with the pair:

```ts
/**
 * Show the affected-parcels gate for an ALREADY-FETCHED list. Resolves on Proceed,
 * rejects with Error('cancelled') on Cancel. Split out of
 * requireAffectedParcelsConfirm so a caller holding the list does not refetch it.
 */
async function showAffectedParcelsConfirm(
  pointName: string,
  parcels: Array<{ id: number; stand: string; designation: string }>,
  intent: 'edit' | 'delete'
): Promise<void> {
  if (parcels.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    affectedParcelsConfirm.value = { pointName, parcels, intent, resolve, reject };
  });
}

async function requireAffectedParcelsConfirm(
  pointName: string,
  intent: 'edit' | 'delete'
): Promise<Array<{ id: number; stand: string; designation: string; capeLoPoints: any[] }>> {
  const parcels = await findAffectedParcels(pointName);
  await showAffectedParcelsConfirm(pointName, parcels, intent);
  return parcels;
}
```

- [ ] **Step 3: Add the self-intersection check and the commit**

Add beside the drag functions from Task 4:

```ts
/**
 * Would the SUBSTITUTED ring cross itself?
 *
 * This is the correct use of the generatePolygon self-intersection test: the ring is
 * complete and in order. The retired insert mode had to skip it (:3730-3737) only
 * because wouldCreateIntersection tests an APPEND and false-positives on insertion.
 */
function substitutionWouldCross(points: VertexPoint[], index: number, candidate: SnapCandidate): boolean {
  try {
    const ring = applySubstitution(points, index, candidate);
    const { generatePolygon } = useParcelGeometry();
    const allPoints = ring.map(p => ({
      pointId: p.id,
      y: p.y,
      x: p.x,
      status: p.status || 'PEG',
      description: p.description || '',
      surveyDate: new Date().toISOString().split('T')[0],
      fieldBookPage: '',
      calculationsPage: 0,
      adjustment: { isDuplicate: false, observationCount: 1, method: 'gps' as const }
    }));
    const result = generatePolygon(ring.map(p => p.id), allPoints);
    return result ? result.validation.selfIntersections > 0 : false;
  } catch (err) {
    // A check that cannot run must not block a legitimate edit; the cascade's own
    // blockers and the closure figures still guard the write.
    console.warn('[VertexDrag] Self-intersection check could not run; allowing the commit:', err);
    return false;
  }
}

/**
 * Commit a drag: re-reference the beacon in EVERY parcel that shares it.
 *
 * findAffectedParcels returns the edited parcel too (it contains the beacon), so the
 * edited parcel and its sharers go down ONE path -- requirement 4 is satisfied by
 * construction rather than by a second code path that could drift. The Outside Figure
 * is an ordinary land_parcels row and cascades like any other parcel.
 */
async function commitVertexDrag() {
  const index = draggingVertexIndex.value;
  const candidate = snapCandidate.value;
  const parcel = selectedParcel.value;
  const points = selectedParcelPoints.value;
  const draggedName = index !== null ? points[index]?.id : undefined;

  if (index === null || !candidate || !parcel || !draggedName) {
    cancelVertexDrag();
    return;
  }

  // Clear the gesture UI now; every write below is still gated.
  draggingVertexIndex.value = null;
  snapCandidate.value = null;
  dragChipPx.value = null;
  dragCandidates = [];
  dragLngLatById.clear();
  updateTempPolygon([]);
  if (map) map.getCanvas().style.cursor = '';
  renderSelectedVertices();

  isComputing.value = true;
  try {
    const affected = await findAffectedParcels(draggedName);
    if (affected.length === 0) {
      alert(`Beacon "${draggedName}" is not listed by any saved parcel, so there is nothing to update.`);
      return;
    }

    const plan = planCascade(
      draggedName,
      candidate,
      affected.map(a => ({ id: a.id, designation: a.designation, points: a.capeLoPoints }))
    );

    if (plan.blockers.length > 0) {
      alert(
        `Cannot move "${draggedName}" to "${candidate.id}".\n\n` +
        plan.blockers.map(b => `  • ${b.designation} — ${b.reason}`).join('\n') +
        `\n\nNothing has been written.`
      );
      return;
    }
    if (plan.writes.length === 0) return;   // dropped on itself: silent no-op

    if (substitutionWouldCross(points, index, candidate)) {
      alert(
        `Cannot move "${draggedName}" to "${candidate.id}" — the parcel boundary would cross itself.\n\n` +
        `Cadastral survey regulation: parcel boundaries must not cross themselves.`
      );
      return;
    }

    try {
      await showAffectedParcelsConfirm(draggedName, affected, 'edit');
    } catch (e: any) {
      if (e?.message === 'cancelled') {
        console.log('[VertexDrag] Cancelled at the affected-parcels gate — nothing written');
        return;
      }
      throw e;
    }

    const outcome = await rebuildAffectedParcels(affected, {
      kind: 'substitute',
      name: draggedName,
      replacement: candidate,
    });

    const problem = describeCascadeOutcome(outcome);
    if (problem) {
      alert(problem);
    } else {
      console.log(`[VertexDrag] ✅ "${draggedName}" → "${candidate.id}" in ${outcome.written.length} parcel(s): ${outcome.written.join(', ')}`);
    }
  } catch (err: any) {
    console.error('[VertexDrag] ❌ Failed to commit the drag:', err);
    alert(`Failed to move the vertex: ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
  } finally {
    isComputing.value = false;
    renderSelectedVertices();
  }
}
```

- [ ] **Step 4: Hook it up**

In `endVertexDrag`, replace the Task 4 placeholder:

```ts
function endVertexDrag() {
  if (draggingVertexIndex.value === null) return;
  if (snapCandidate.value) {
    void commitVertexDrag();
  } else {
    console.log('[VertexDrag] Released with no candidate — cancelled, nothing written');
    cancelVertexDrag();
  }
}
```

- [ ] **Step 5: Confirm nothing derives coordinates from the cursor**

Run: `cd app-frontend && npx vitest run` — expected PASS, 0 failures.
Run: `cd app-frontend && npm run build` — expected success.

Then prove decision 1 holds by inspection:

```bash
grep -n "wgs84ToCape\|updateCoordinatePoint" app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
```

Expected: **no hit inside any of `beginVertexDrag`, `moveVertexDrag`, `previewDragToCursor`, `endVertexDrag`, `commitVertexDrag`, or `substitutionWouldCross`.** `updateCoordinatePoint` appears only in `editPanelHandler`/`confirmBeaconSave`; `wgs84ToCape` should not appear in this file at all. A hit inside the drag path means the gesture is deriving coordinates and must be fixed before committing.

- [ ] **Step 6: Verify manually in the running app**

On a project with **at least two parcels sharing a boundary**:

1. Select a parcel, drag one of its shared corners onto another peg, release. The affected-parcels dialog lists **every** parcel that used the beacon, including the one you dragged on.
2. Press **Proceed**. Both parcels redraw with the corner in the same place, and both cards show a new area and closure ratio.
3. Repeat and press **Cancel** → nothing is written. Reload to confirm the old corner is still there.
4. Drag onto a beacon the **neighbouring** parcel already uses → blocked, the neighbour is named, nothing is written and no dialog appears.
5. Drag a corner onto a peg that would fold the boundary over itself → blocked with the self-intersection message.
6. Drag and release over empty ground → nothing changes and **no network request fires** (watch the Network tab).
7. Reload the view → the moved corner persists in **both** parcels.
8. Confirm in the DB (or by re-opening the parcel) that the moved vertex carries the target beacon's own `y`/`x` **to the full stored precision**, not a value that round-tripped through the map.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(vertex-snap): commit a drag as a cascading re-reference across every sharing parcel"
```

---

### Task 6: Retire the click-to-insert vertex-edit flow

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — template `:117`, `:145-210`, `:324-347`, `:416-423`, `:488-495`; script `:1979-1986`, `:3729-3744`, `:4361-4522`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. `handlePointClick` survives for **drawing new parcels only** and gets simpler.

**No automated test.** This is a deletion; the coverage is the full suite staying green, the build compiling, and Step 5's manual sweep.

**What this removes, stated plainly:** the only UI for dropping a vertex from a saved parcel without deleting the beacon. Deleting the beacon itself still removes it from every parcel it appears in (`deletePanelHandler:1412` → `rebuildAffectedParcels` `'delete'`). A per-parcel vertex removal is Out of scope in the spec, not smuggled in here.

- [ ] **Step 1: Delete the template**

- `:117` — change `v-if="isDrawing && !isEditingVertices"` to `v-if="isDrawing"`.
- `:145-210` — delete the whole `<!-- Vertex-editing controls -->` block, from the comment through the `❌ Cancel Edit` button's closing `</div>`.
- `:324-347` — in the Drawing Status Bar, drop every `isEditingVertices` / `insertAfterIndex` branch so it reads:

```html
      <!-- Drawing Status Bar (bottom, non-obstructive) -->
      <div
        v-if="isDrawing"
        class="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-3 py-1.5 z-30 text-xs bg-gray-900/80"
      >
        <span class="font-semibold text-white whitespace-nowrap">✏️ Drawing</span>
        <span class="text-white/70">·</span>
        <span class="text-white/90">
          {{ selectedPoints.length }} pt{{ selectedPoints.length !== 1 ? 's' : '' }} selected
        </span>
        <span class="text-white/50">·</span>
        <span class="text-white/70">
          Click pegs to build polygon · click start to close · <kbd class="bg-white/20 px-1 rounded">ESC</kbd> to finish
        </span>
        <span class="flex-1"></span>
        <span v-if="selectedPoints.length < 3" class="text-yellow-300 text-xs">min 3 pts</span>
      </div>
```

- `:416-423` and `:488-495` — delete both 🔺 buttons entirely (the `<button @click="startEditingVertices(...)">` elements in the saved-parcels panel and the computed-parcels panel). Editing is entered by clicking the parcel on the map now.

- [ ] **Step 2: Delete the state**

Remove `:1979-1986` in full — the `// Vertex-editing state` comment, `isEditingVertices`, `editingParcelDesignation`, `editingParcelDbId`, `insertAfterIndex`, and `setInsertAfter`. Keep the drag state block added in Task 3.

- [ ] **Step 3: Simplify `handlePointClick`**

Replace `:3729-3748` (the carve-out and the insert branch) with:

```ts
  // REFINEMENT 2: Prevent self-intersecting polygons
  if (wouldCreateIntersection(point)) {
    console.warn('[MapLibre] ⚠️ Would create crossing polygon');
    alert(`Cannot add point ${point.id} - it would create a self-intersecting polygon!\n\nCadastral survey regulation: Parcel boundaries must not cross themselves.`);
    return;
  }

  selectedPoints.value.push(point);
  console.log(`[MapLibre] 📍 Point selected: ${point.id} (${selectedPoints.value.length} total)`);
```

The `isInsertingMidSequence` carve-out dies with the flow it existed for: `wouldCreateIntersection` tests an **append**, and `handlePointClick` now only ever appends.

- [ ] **Step 4: Delete the four functions**

Remove `:4361-4522` in full: the `// VERTEX EDITING` banner comment, `startEditingVertices`, `cancelVertexEdit`, `removeVertexByIndex`, and `commitVertexEdit` (including their doc comments). `refreshParcelsFromDatabase` above and `autoSaveParcel` below both stay.

- [ ] **Step 5: Verify nothing still references the retired flow**

```bash
grep -n "isEditingVertices\|insertAfterIndex\|editingParcelDesignation\|editingParcelDbId\|setInsertAfter\|removeVertexByIndex\|commitVertexEdit\|cancelVertexEdit\|startEditingVertices" app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
```

Expected: **no output.**

```bash
grep -rn "startEditingVertices\|commitVertexEdit" app-frontend/src
```

Expected: no output outside `AreaComputationView.vue`, which is the deprecated Leaflet viewer and is deliberately not touched by this work.

Run: `cd app-frontend && npx vitest run` — expected PASS, 0 failures.
Run: `cd app-frontend && npm run build` — expected success. A missing identifier in the template surfaces here, so a green build matters more in this task than in the others.

**Manual, required:**

1. The saved-parcels and computed-parcels panels no longer show a 🔺 button; ✏️ Rename and 🗑️ Delete still work.
2. **Draw Parcel** still works end to end: click pegs, watch the preview, click the start peg to close, and confirm the polygon computes and saves.
3. Drawing a polygon that would cross itself is still refused with the self-intersection alert.
4. **Esc** while drawing still completes (≥3 points) or cancels (<3).
5. The drawing status bar reads "✏️ Drawing" with no editing branches, and the toolbar shows no vertex-editing panel.
6. Selecting a parcel and dragging a vertex still works exactly as it did after Task 5.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "refactor(vertex-snap): retire the click-to-insert vertex edit flow"
```

---

### Task 7: Full verification

**Files:** none — this task changes nothing. If it uncovers a defect, fix it in the task that owns the code and re-run this one.

- [ ] **Step 1: Run every suite**

```bash
cd app-frontend && npx vitest run
```

Expected: PASS, 0 failures, and the total **above** the 656 baseline by the count of the new `vertexSnap` and `vertexCascade` tests.

```bash
cd app-frontend && npm run build
```

Expected: success.

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

Expected: PASS. Nothing in this plan touches the backend; a failure here is pre-existing and should be confirmed against `main` before being attributed to this branch.

- [ ] **Step 2: Confirm the regression net still reads `cape_lo_points` the same way**

```bash
cd app-frontend && npx vitest run src/services/__tests__/parcelDetection.test.ts src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts src/views/modules/cadastral-standard/__tests__/workingPlanSpec.test.ts
```

Expected: PASS. These three read `cape_lo_points` and are the guard on its shape, which this work rewrites on every cascade.

- [ ] **Step 3: Walk the spec's manual checklist**

On a project with **at least two parcels sharing a boundary**:

1. Click a parcel → vertex markers appear on that parcel only.
2. Drag a vertex onto a peg → the chip names the target → release → both parcels redraw with the corner in the same place; both cards show a new area and closure ratio.
3. Drag and release over empty ground → nothing changes, no request fires.
4. Drag onto a beacon the neighbouring parcel already uses → blocked, the parcel is named, nothing is written.
5. Cancel the affected-parcels dialog → nothing is written; a reload confirms it.
6. Reload the view → the moved corner persists in both parcels.

- [ ] **Step 4: Walk the point-edit regressions one more time**

`rebuildAffectedParcels` is shared, so re-check what Task 2 changed under it:

7. Edit a shared beacon's coordinates → every parcel using it recomputes.
8. Rename **and** move a beacon in one save → every parcel using it recomputes under the new name.
9. Delete a shared beacon → it disappears from every parcel that used it.

- [ ] **Step 5: Commit any fixes**

If Steps 1–4 were clean there is nothing to commit. Otherwise fix in place and commit with a message naming what failed:

```bash
git add -A
git commit -m "fix(vertex-snap): <what the verification pass caught>"
```

---

## Verification checklist

```bash
cd app-frontend && npx vitest run          # > 656 passing, 0 failures
cd app-frontend && npm run build           # compiles
cd app-backend  && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

| Behaviour | Expected |
|---|---|
| Click a parcel | it highlights; its vertices appear; no other parcel's do |
| Drag onto a peg within 12 px | chip names it; release cascades to every sharing parcel |
| Drag onto empty ground | cancel; no request, no write |
| Drag onto a beacon a sharer already uses | blocked, sharer named, nothing written |
| Drag that would fold the boundary | blocked with the self-intersection message |
| Cancel the affected-parcels dialog | nothing written |
| One write fails after another succeeded | blocking dialog names written and not-written parcels |
| Committed coordinates | the target beacon's own stored values, verbatim |
| 🔺 buttons, vertex-edit panel, insert mode | gone |
| Draw Parcel, point edit, point delete | unchanged |

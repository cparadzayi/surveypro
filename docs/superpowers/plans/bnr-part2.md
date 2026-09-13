
### Task 2: `beaconReconcile.ts` — the pure planner

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts` — export `readVertex` (`:85`)
- Create: `app-frontend/src/views/modules/cadastral-standard/beaconReconcile.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts`

**Interfaces:**
- Consumes: `readVertex(raw): VertexPoint | null` and `VertexPoint` from `./vertexSnap`; `geoJsonToCapeLoPoint` from `../../../utils/coordinateTransform` (the loader's conversion, `:4285`).
- Produces (Tasks 4 and 5 depend on these exact names):
  - constants `RECONCILE_TOLERANCE_M = 0.5`, `COINCIDENCE_M = 0.001`
  - types `Beacon`, `VertexOutcome`, `BlockReason`, `RingSource`, `ParcelPlan`, `ReconciliationPlan`, `VertexRename`, `RingRead`, `BeaconNamePlan`, `ReconcileSummary`, `PropagationPlan`
  - `toBeacons(rows): Beacon[]`
  - `matchVertex(vertex, beacons, tolM?, index?): VertexOutcome`
  - `readRing(row): RingRead | null`
  - `ringMatchesGeom(points, geom): boolean`, `edgesMatchRing(edges, points): boolean`
  - `patchParcelMetadata(metadata, source, renames: VertexRename[]): Record<string, any>` — returns the SAME reference when nothing changes
  - `planParcel(row, beacons, tolM?): ParcelPlan`
  - `planReconciliation(parcelRows, beaconRows, tolM?): ReconciliationPlan`
  - `summarise(beaconPlan, parcelPlan): ReconcileSummary`, `formatSummary(summary): string`
  - `planRenamePropagation(parcelRows, from, to): PropagationPlan`

No Vue, no network, no MapLibre in this module.

- [ ] **Step 1: Export `readVertex`**

In `vertexSnap.ts`, change `function readVertex(raw: any): VertexPoint | null {` (`:85`) to:

```ts
export function readVertex(raw: any): VertexPoint | null {
```

Nothing else in `vertexSnap.ts` changes in this task.

- [ ] **Step 2: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  toBeacons,
  matchVertex,
  readRing,
  ringMatchesGeom,
  edgesMatchRing,
  patchParcelMetadata,
  planParcel,
  planReconciliation,
  summarise,
  formatSummary,
  planRenamePropagation,
  RECONCILE_TOLERANCE_M,
  type Beacon,
} from '../beaconReconcile'
import type { VertexPoint } from '../vertexSnap'

const v = (id: string, y: number, x: number, extra: Record<string, any> = {}): VertexPoint & Record<string, any> =>
  ({ id, y, x, ...extra })

/** GeoJSON stores [x, y]; geoJsonToCapeLoPoint reads y = c[1], x = c[0]. Closed ring. */
const geomOf = (points: Array<{ y: number; x: number }>) => ({
  type: 'Polygon',
  coordinates: [[...points.map(p => [p.x, p.y]), [points[0].x, points[0].y]]],
})

/** Edges shaped like edge-computation.js:55-56 / :93-94, with non-trivial numbers. */
const edgesOf = (points: Array<{ id: string; y: number; x: number }>) =>
  points.map((p, i) => {
    const q = points[(i + 1) % points.length]
    return {
      index: i + 1,
      from: { y: p.y, x: p.x, id: p.id, name: p.id },
      to: { y: q.y, x: q.x, id: q.id, name: q.id },
      dy: 0.001 * (i + 1),
      dx: -0.002 * (i + 1),
      distance: 10.0004,
      distanceRounded: 10,
      bearingDeg: 90 * i,
      directionDMS: `${90 * i}°00'00"`,
    }
  })

const SQUARE = [v('1620', 0, 0), v('B', 0, 10), v('C', 10, 10), v('D', 10, 0)]

const row = (id: number, designation: string, points: any[], metadata: Record<string, any> = {}): any => ({
  id,
  stand: designation,
  designation,
  geom: geomOf(points),
  metadata: {
    cape_lo_points: points,
    residuals: { edges: edgesOf(points), sumDy: 0.01, sumDx: -0.02 },
    closure_ratio: '1:12,345',
    points_count: points.length,
    ...metadata,
  },
})

const beacons = (...list: Array<[string, number, number]>): Beacon[] =>
  list.map(([name, y, x]) => ({ name, y, x }))

/** Every name-bearing key removed, recursively — what decision 3 says must be identical. */
function stripNames(value: any): any {
  if (Array.isArray(value)) return value.map(stripNames)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !['id', 'name', 'description'].includes(k))
        .map(([k, val]) => [k, stripNames(val)])
    )
  }
  return value
}

describe('toBeacons', () => {
  it('reads coordinate_points rows by name, skipping unusable ones', () => {
    expect(toBeacons([
      { id: 1, name: '2474A', y: '10.5', x: 20 },
      { id: 2, name: '', y: 1, x: 2 },
      { id: 3, name: 'BAD', y: null, x: 2 },
    ])).toEqual([{ name: '2474A', y: 10.5, x: 20 }])
    expect(toBeacons(null as any)).toEqual([])
  })
})

describe('matchVertex', () => {
  it('picks the NEAREST beacon, not the first under the tolerance', () => {
    const out = matchVertex(v('1620', 0, 0), beacons(['FAR', 0, 0.4], ['NEAR', 0, 0.003]), 0.3, 2)
    expect(out).toEqual({ kind: 'rename', index: 2, from: '1620', to: 'NEAR', distanceM: expect.closeTo(0.003, 6) })
  })

  it('is ambiguous when a second beacon is also within tolerance, candidates nearest first', () => {
    const out = matchVertex(v('1620', 0, 0), beacons(['FAR', 0, 0.41], ['NEAR', 0, 0.003]), RECONCILE_TOLERANCE_M)
    expect(out.kind).toBe('ambiguous')
    if (out.kind !== 'ambiguous') return
    expect(out.candidates.map(c => c.name)).toEqual(['NEAR', 'FAR'])
  })

  it('is unmatched past the tolerance, reporting the nearest distance', () => {
    expect(matchVertex(v('1620', 0, 0), beacons(['X', 0, 3], ['Y', 0, 5]))).toEqual(
      { kind: 'unmatched', index: 0, id: '1620', nearestM: 3 }
    )
    expect(matchVertex(v('1620', 0, 0), [])).toEqual({ kind: 'unmatched', index: 0, id: '1620', nearestM: null })
  })

  it('is unchanged when the nearest beacon already has the vertex name', () => {
    expect(matchVertex(v('2474A', 0, 0), beacons(['2474A', 0, 0.002]))).toEqual(
      { kind: 'unchanged', index: 0, id: '2474A', distanceM: expect.closeTo(0.002, 6) }
    )
  })

  it('counts a beacon exactly on the tolerance as a match', () => {
    expect(matchVertex(v('1620', 0, 0), beacons(['EDGE', 0, 0.5])).kind).toBe('rename')
  })
})

describe('readRing', () => {
  it('reads cape_lo_points when present', () => {
    const ring = readRing(row(1, '1425', SQUARE))
    expect(ring?.source).toBe('cape_lo_points')
    expect(ring?.points.map(p => p.id)).toEqual(['1620', 'B', 'C', 'D'])
  })

  it('otherwise zips the geom exterior ring BY INDEX with vertices[].id', () => {
    const r = { id: 2, stand: 'Q', geom: geomOf(SQUARE), metadata: { vertices: [{ id: 'P' }, { id: 'Q' }, { id: 'R' }, { id: 'S' }] } }
    const ring = readRing(r)
    expect(ring?.source).toBe('vertices')
    expect(ring?.points.map(p => [p.id, p.y, p.x])).toEqual([['P', 0, 0], ['Q', 0, 10], ['R', 10, 10], ['S', 10, 0]])
  })

  it('parses a geom delivered as a JSON string', () => {
    const r = { id: 2, geom: JSON.stringify(geomOf(SQUARE)), metadata: { vertices: SQUARE.map(p => ({ id: p.id })) } }
    expect(readRing(r)?.points).toHaveLength(4)
  })

  it('is null when the vertex labels do not line up with the ring, or a vertex is unreadable', () => {
    expect(readRing({ id: 3, geom: geomOf(SQUARE), metadata: { vertices: [{ id: 'P' }] } })).toBeNull()
    expect(readRing({ id: 4, geom: null, metadata: { cape_lo_points: [v('A', 0, 0), { id: 'B', y: 'oops', x: 1 }, v('C', 1, 1)] } })).toBeNull()
    expect(readRing({ id: 5, geom: geomOf(SQUARE), metadata: {} })).toBeNull()
  })
})

describe('guards', () => {
  it('ringMatchesGeom: equal counts, every vertex on a distinct ring vertex within 1 mm', () => {
    expect(ringMatchesGeom(SQUARE, geomOf(SQUARE))).toBe(true)
    expect(ringMatchesGeom([SQUARE[2], SQUARE[3], SQUARE[0], SQUARE[1]], geomOf(SQUARE))).toBe(true)
    expect(ringMatchesGeom(SQUARE.slice(0, 3), geomOf(SQUARE))).toBe(false)
    expect(ringMatchesGeom([v('1620', 0, 0.002), ...SQUARE.slice(1)], geomOf(SQUARE))).toBe(false)
    expect(ringMatchesGeom([SQUARE[0], SQUARE[0], SQUARE[2], SQUARE[3]], geomOf(SQUARE))).toBe(false)
    expect(ringMatchesGeom(SQUARE, null)).toBe(false)
  })

  it('edgesMatchRing: vacuous without residuals, strict with them', () => {
    expect(edgesMatchRing(undefined, SQUARE)).toBe(true)
    expect(edgesMatchRing([], SQUARE)).toBe(true)
    expect(edgesMatchRing(edgesOf(SQUARE), SQUARE)).toBe(true)
    expect(edgesMatchRing(edgesOf(SQUARE).slice(0, 3), SQUARE)).toBe(false)
    expect(edgesMatchRing(edgesOf([SQUARE[1], SQUARE[2], SQUARE[3], SQUARE[0]]), SQUARE)).toBe(false)
  })
})

describe('patchParcelMetadata', () => {
  const metadata = row(1, '1425', [
    v('1620', 0, 0, { description: '1620' }), v('B', 0, 10, { description: 'iron peg' }), v('C', 10, 10), v('D', 10, 0),
  ]).metadata

  it('renames cape_lo_points[i], applying the description rule (decision 8)', () => {
    const out = patchParcelMetadata(metadata, 'cape_lo_points', [
      { index: 0, from: '1620', to: '2474A', y: 0, x: 0 },
      { index: 1, from: 'B', to: '2474B', y: 0, x: 10 },
    ])
    expect(out.cape_lo_points[0]).toMatchObject({ id: '2474A', description: '2474A' })
    expect(out.cape_lo_points[1]).toMatchObject({ id: '2474B', description: 'iron peg' })
  })

  it('renames edges[i].from AND edges[i-1].to, wrapping at index 0', () => {
    const out = patchParcelMetadata(metadata, 'cape_lo_points', [{ index: 0, from: '1620', to: '2474A', y: 0, x: 0 }])
    expect(out.residuals.edges[0].from).toMatchObject({ id: '2474A', name: '2474A' })
    expect(out.residuals.edges[3].to).toMatchObject({ id: '2474A', name: '2474A' })
    expect(out.residuals.edges[0].to.id).toBe('B')
    expect(out.residuals.edges[3].from.id).toBe('D')
  })

  it('renames vertices[i] for a vertices-sourced parcel', () => {
    const out = patchParcelMetadata({ vertices: [{ id: 'P' }, { id: 'Q' }, { id: 'R' }] }, 'vertices', [
      { index: 2, from: 'R', to: '2474C', y: 10, x: 10 },
    ])
    expect(out.vertices.map((x: any) => x.id)).toEqual(['P', 'Q', '2474C'])
  })

  it('renames only the Outside Figure points[] entries that coincide with the vertex', () => {
    const of = { ...metadata, points: [v('1620', 0, 0), v('1620', 50, 50), v('B', 0, 10)] }
    const out = patchParcelMetadata(of, 'cape_lo_points', [{ index: 0, from: '1620', to: '2474A', y: 0, x: 0 }])
    expect(out.points.map((p: any) => p.id)).toEqual(['2474A', '1620', 'B'])
  })

  it('does not mutate its input, and returns the same reference when nothing changes', () => {
    const before = JSON.stringify(metadata)
    patchParcelMetadata(metadata, 'cape_lo_points', [{ index: 0, from: '1620', to: '2474A', y: 0, x: 0 }])
    expect(JSON.stringify(metadata)).toBe(before)
    expect(patchParcelMetadata(metadata, 'cape_lo_points', [{ index: 1, from: 'B', to: 'B', y: 0, x: 10 }])).toBe(metadata)
    expect(patchParcelMetadata(metadata, 'cape_lo_points', [])).toBe(metadata)
  })
})

describe('planParcel', () => {
  const current = beacons(['2474A', 0, 0.003], ['B', 0, 10], ['C', 10, 10], ['D', 10, 0])

  it('plans a write for a stale ring name', () => {
    const plan = planParcel(row(1, '1425', SQUARE), current)
    expect(plan.blocked).toBeUndefined()
    expect(plan.metadata?.cape_lo_points[0].id).toBe('2474A')
    expect(plan.outcomes[0]).toMatchObject({ kind: 'rename', from: '1620', to: '2474A' })
  })

  it('plans a write when the ring is current but residuals still carry the old name', () => {
    // The old handlePointRename (:1606-1635) renamed cape_lo_points and left residuals stale.
    const r = row(1, '1425', SQUARE)
    r.metadata.cape_lo_points = [v('2474A', 0, 0), ...SQUARE.slice(1)]
    const plan = planParcel(r, current)
    expect(plan.metadata?.residuals.edges[0].from.id).toBe('2474A')
    expect(plan.metadata?.residuals.edges[3].to.name).toBe('2474A')
    expect(plan.outcomes[0]).toMatchObject({ kind: 'rename', index: 0, from: '1620', to: '2474A' })
  })

  it('writes nothing for a parcel that is already correct', () => {
    const plan = planParcel(row(1, '1425', [v('2474A', 0, 0), ...SQUARE.slice(1)]), current)
    expect(plan.metadata).toBeUndefined()
    expect(plan.blocked).toBeUndefined()
  })

  it('leaves an unmatched vertex alone while renaming the rest', () => {
    const plan = planParcel(row(1, '1425', SQUARE), beacons(['2474A', 0, 0.003], ['B', 0, 10], ['C', 10, 10]))
    expect(plan.outcomes[3].kind).toBe('unmatched')
    expect(plan.metadata?.cape_lo_points.map((p: any) => p.id)).toEqual(['2474A', 'B', 'C', 'D'])
  })

  it('blocks an ambiguous vertex, naming the candidates and distances', () => {
    const plan = planParcel(row(1, '1425', SQUARE), [...current, { name: '2474Z', y: 0, x: 0.2 }])
    expect(plan.metadata).toBeUndefined()
    expect(plan.blocked?.reason).toBe('ambiguous')
    expect(plan.blocked?.detail).toMatch(/vertex 1 \("1620"\).*2474A \(0\.003 m\).*2474Z \(0\.200 m\)/)
  })

  it('blocks two vertices resolving to one beacon (decision 7)', () => {
    // P and Q each have exactly one beacon within 0.5 m — the same one.
    const r = row(1, '1425', [v('P', 0, 0), v('Q', 0, 0.2), v('C', 10, 10), v('D', 10, 0)])
    expect(planParcel(r, beacons(['2474A', 0, 0.1], ['C', 10, 10], ['D', 10, 0])).blocked).toEqual({
      reason: 'duplicate-vertex',
      detail: 'vertices 1 and 2 both resolve to beacon "2474A"',
    })
  })

  it('blocks when cape_lo_points is not the geom ring (decision 4)', () => {
    const r = row(1, '1425', SQUARE)
    r.geom = geomOf([v('x', 0, 0), v('x', 0, 20), v('x', 20, 20), v('x', 20, 0)])
    expect(planParcel(r, current).blocked?.reason).toBe('ring-not-geom')
  })

  it('blocks when the edges do not match the ring (decision 3)', () => {
    const r = row(1, '1425', SQUARE)
    r.metadata.residuals.edges = edgesOf([SQUARE[1], SQUARE[2], SQUARE[3], SQUARE[0]])
    expect(planParcel(r, current).blocked).toEqual({
      reason: 'edges-not-ring',
      detail: 'consistency data does not match its vertex list — recompute this parcel first',
    })
  })

  it('blocks fewer than 3 vertices, an unreadable vertex list, and misaligned vertex labels', () => {
    expect(planParcel(row(1, '1425', SQUARE.slice(0, 2)), current).blocked?.reason).toBe('too-few-points')
    expect(planParcel({ id: 2, stand: 'X', geom: null, metadata: {} }, current).blocked?.reason).toBe('unreadable-vertex')
    expect(planParcel({ id: 3, stand: 'Y', geom: geomOf(SQUARE), metadata: { vertices: [{ id: 'P' }] } }, current).blocked?.reason)
      .toBe('ring-not-geom')
  })

  it('plans a vertices-sourced (QGIS) parcel, which is its own geom by construction', () => {
    const r = { id: 9, stand: '1426', geom: geomOf(SQUARE), metadata: { vertices: SQUARE.map(p => ({ id: p.id })) } }
    expect(planParcel(r, current).metadata?.vertices[0].id).toBe('2474A')
  })
})

describe('the names-only invariant (decision 3)', () => {
  it('a patched parcel differs from its input ONLY in name strings — every number identical', () => {
    const r = row(1, '1425', [v('1620', 0, 0, { description: '1620', status: 'P' }), v('B', 0, 10), v('C', 10, 10), v('D', 10, 0)], {
      points: [v('1620', 0, 0), v('B', 0, 10)],
      area_note: 'kept',
    })
    const plan = planParcel(r, beacons(['2474A', 0, 0.003], ['2474B', 0, 10], ['C', 10, 10], ['D', 10, 0]))
    expect(plan.metadata).toBeDefined()
    expect(stripNames(plan.metadata)).toEqual(stripNames(r.metadata))
    expect(plan.metadata!.closure_ratio).toBe('1:12,345')
    expect(plan.metadata!.residuals.sumDy).toBe(0.01)
    expect(plan.metadata!.residuals.edges.map((e: any) => [e.dy, e.dx, e.distance, e.directionDMS]))
      .toEqual(r.metadata.residuals.edges.map((e: any) => [e.dy, e.dx, e.distance, e.directionDMS]))
  })
})

describe('planReconciliation', () => {
  const beaconRows = [
    { id: 1, name: '2474A', y: 0, x: 0 }, { id: 2, name: 'B', y: 0, x: 10 },
    { id: 3, name: 'C', y: 10, x: 10 }, { id: 4, name: 'D', y: 10, x: 0 },
  ]

  it('a blocked parcel never blocks its neighbours', () => {
    const blocked = row(2, '1426', SQUARE)
    blocked.metadata.residuals.edges = []
    blocked.metadata.cape_lo_points = SQUARE.slice(0, 2)
    const plan = planReconciliation([row(1, '1425', SQUARE), blocked, row(3, '1427', [v('2474A', 0, 0), ...SQUARE.slice(1)])], beaconRows)
    expect(plan.writes.map(p => p.designation)).toEqual(['1425'])
    expect(plan.blocked.map(p => p.designation)).toEqual(['1426'])
    expect(plan.unchanged.map(p => p.designation)).toEqual(['1427'])
  })

  it('honours the post-rename beacon list from planNameNormalization().after', () => {
    // Parcels must be named with the names that will exist once phase A1 has run.
    const plan = planReconciliation([row(1, '1425', [v('2474a', 0, 0), ...SQUARE.slice(1)])], beaconRows)
    expect(plan.writes[0].metadata?.cape_lo_points[0].id).toBe('2474A')
  })
})

describe('summarise', () => {
  const beaconPlan = {
    renames: [{ id: 1, from: '2474a', to: '2474A' }],
    collisions: [{ from: '2475b', existing: '2475B' }],
    after: [],
  }

  it('lists beacon renames, collisions, parcel renames with distances, and blocked parcels', () => {
    const parcelPlan = planReconciliation(
      [row(1, '1425', SQUARE), { id: 2, stand: '1426', geom: null, metadata: {} }],
      [{ name: '2474A', y: 0, x: 0.003 }, { name: 'B', y: 0, x: 10 }, { name: 'C', y: 10, x: 10 }, { name: 'D', y: 10, x: 0 }]
    )
    const summary = summarise(beaconPlan, parcelPlan)
    expect(summary.hasWork).toBe(true)
    const text = formatSummary(summary)
    expect(text).toMatch(/"2474a" → "2474A"/)
    expect(text).toMatch(/"2475b" — "2475B" already exists/)
    expect(text).toMatch(/1425: "1620" → "2474A" \(0\.003 m\)/)
    expect(text).toMatch(/1426 — /)
    expect(text).toMatch(/0 parcel\(s\) need no change/)
  })

  it('has no work when nothing would be written', () => {
    expect(summarise({ renames: [], collisions: [], after: [] }, { writes: [], blocked: [], unchanged: [] }).hasWork).toBe(false)
  })
})

describe('planRenamePropagation (Resolved #3)', () => {
  it('patches every snapshot of the exact old name in every parcel whose ring lists it', () => {
    const plan = planRenamePropagation([row(1, '1425', SQUARE), row(2, '1426', [v('X', 50, 50), v('Y', 50, 60), v('Z', 60, 60)])], '1620', '2474A')
    expect(plan.blocked).toEqual([])
    expect(plan.writes.map(w => w.parcelId)).toEqual([1])
    const md = plan.writes[0].metadata
    expect(md.cape_lo_points[0].id).toBe('2474A')
    expect(md.residuals.edges[0].from.id).toBe('2474A')
    expect(md.residuals.edges[3].to.id).toBe('2474A')
  })

  it('is name-keyed: needs no geom', () => {
    const r = row(1, '1425', SQUARE)
    r.geom = null
    expect(planRenamePropagation([r], '1620', '2474A').writes).toHaveLength(1)
  })

  it('reports, not writes, a listing parcel whose residuals do not match its ring', () => {
    const r = row(1, '1425', SQUARE)
    r.metadata.residuals.edges = edgesOf([SQUARE[1], SQUARE[2], SQUARE[3], SQUARE[0]])
    const plan = planRenamePropagation([r], '1620', '2474A')
    expect(plan.writes).toEqual([])
    expect(plan.blocked).toEqual([{ designation: '1425', detail: 'consistency data does not match its vertex list — recompute this parcel first' }])
  })

  it('is a no-op for an identity rename or an empty name', () => {
    expect(planRenamePropagation([row(1, '1425', SQUARE)], '1620', '1620')).toEqual({ writes: [], blocked: [] })
    expect(planRenamePropagation([row(1, '1425', SQUARE)], '', '2474A')).toEqual({ writes: [], blocked: [] })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts`
Expected: FAIL — "Failed to resolve import ../beaconReconcile".

- [ ] **Step 4: Write the implementation**

Create `app-frontend/src/views/modules/cadastral-standard/beaconReconcile.ts`:

```ts
/**
 * Beacon name reconciliation: the pure planner. No Vue, no network, no MapLibre.
 *
 * A parcel's saved area/consistency data (land_parcels.metadata) carries beacon
 * names as snapshots. After a rename or a CSV re-import those snapshots go stale.
 * This module derives each vertex's name from ITS OWN POSITION against the current
 * coordinate_points and patches names in place. It never re-runs areaCompute and
 * never produces geom: the numbers are name-independent (edge-computation.js copies
 * names, never reads them), and a repair about names must not rewrite old parcels'
 * dy/dx/directions. See docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md.
 */
import { readVertex, type VertexPoint } from './vertexSnap'
import { geoJsonToCapeLoPoint } from '../../../utils/coordinateTransform'

/** Same figure as repairParcelBeaconNames (:1685), the loader (:4273), diagram/beaconName.js:8. */
export const RECONCILE_TOLERANCE_M = 0.5

/** Guards: a stored copy of a vertex is "the same vertex" only within 1 mm. */
export const COINCIDENCE_M = 0.001

export interface Beacon {
  name: string
  y: number
  x: number
}

export type VertexOutcome =
  | { kind: 'unchanged'; index: number; id: string; distanceM: number }
  | { kind: 'rename'; index: number; from: string; to: string; distanceM: number }
  | { kind: 'ambiguous'; index: number; id: string; candidates: Array<{ name: string; distanceM: number }> }
  | { kind: 'unmatched'; index: number; id: string; nearestM: number | null }

export type BlockReason =
  | 'ambiguous'
  | 'duplicate-vertex'
  | 'too-few-points'
  | 'ring-not-geom'
  | 'edges-not-ring'
  | 'unreadable-vertex'

export type RingSource = 'cape_lo_points' | 'vertices'

export interface ParcelPlan {
  parcelId: number
  designation: string
  source: RingSource
  outcomes: VertexOutcome[]
  blocked?: { reason: BlockReason; detail: string }
  /** The patched metadata — present only when there is a write. */
  metadata?: Record<string, any>
}

export interface ReconciliationPlan {
  writes: ParcelPlan[]
  blocked: ParcelPlan[]
  unchanged: ParcelPlan[]
}

/** Name every snapshot at ring index `index` as `to`. `y`/`x` locate Outside Figure points. */
export interface VertexRename {
  index: number
  from: string
  to: string
  y: number
  x: number
}

export interface RingRead {
  source: RingSource
  points: VertexPoint[]
}

/** The shape app-shared/beaconName.js planNameNormalization() returns. */
export interface BeaconNamePlan {
  renames: Array<{ id: number | string; from: string; to: string }>
  collisions: Array<{ from: string; existing: string }>
  after: any[]
}

export interface ReconcileSummary {
  hasWork: boolean
  sections: Array<{ heading: string; lines: string[] }>
}

export interface PropagationPlan {
  writes: Array<{ parcelId: number; designation: string; metadata: Record<string, any> }>
  blocked: Array<{ designation: string; detail: string }>
}

const EDGES_NOT_RING = 'consistency data does not match its vertex list — recompute this parcel first'

/** coordinate_points rows → beacons, keyed by NAME (the row id is the DB id). */
export function toBeacons(rows: any[]): Beacon[] {
  const out: Beacon[] = []
  for (const row of rows || []) {
    const point = readVertex({ id: row?.name, y: row?.y, x: row?.x })
    if (point) out.push({ name: point.id, y: point.y, x: point.x })
  }
  return out
}

/**
 * Strictly nearest beacon. A SECOND beacon also within tolerance makes the vertex
 * ambiguous (decision 6 / Resolved #2 — no pick-one dialog).
 */
export function matchVertex(
  vertex: VertexPoint,
  beacons: Beacon[],
  tolM: number = RECONCILE_TOLERANCE_M,
  index = 0
): VertexOutcome {
  const within: Array<{ name: string; distanceM: number }> = []
  let nearestM: number | null = null
  for (const beacon of beacons || []) {
    const distanceM = Math.hypot(beacon.y - vertex.y, beacon.x - vertex.x)
    if (nearestM === null || distanceM < nearestM) nearestM = distanceM
    if (distanceM <= tolM) within.push({ name: beacon.name, distanceM })
  }
  if (within.length === 0) return { kind: 'unmatched', index, id: vertex.id, nearestM }
  within.sort((a, b) => a.distanceM - b.distanceM)
  if (within.length > 1) return { kind: 'ambiguous', index, id: vertex.id, candidates: within }
  const [hit] = within
  return hit.name === vertex.id
    ? { kind: 'unchanged', index, id: vertex.id, distanceM: hit.distanceM }
    : { kind: 'rename', index, from: vertex.id, to: hit.name, distanceM: hit.distanceM }
}

/** The geom exterior ring as Cape Lo {y, x}, closing duplicate dropped. [] when unreadable. */
function exteriorRing(rawGeom: any): Array<{ y: number; x: number }> {
  let geom = rawGeom
  if (typeof geom === 'string') {
    try {
      geom = JSON.parse(geom)
    } catch {
      return []
    }
  }
  let coords: any[] = []
  if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) coords = geom.coordinates[0]
  else if (geom?.type === 'MultiPolygon' && Array.isArray(geom.coordinates?.[0]?.[0])) coords = geom.coordinates[0][0]
  if (coords.some(c => !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1]))) return []
  // Same conversion as the loader (:4285): GeoJSON [0] → x, [1] → y.
  const ring = coords.map(c => {
    const p = geoJsonToCapeLoPoint(c as [number, number])
    return { y: p.y, x: p.x }
  })
  if (ring.length > 1) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first.y === last.y && first.x === last.x) ring.pop()
  }
  return ring
}

/**
 * The parcel's named ring: cape_lo_points when non-empty; otherwise the geom ring
 * zipped BY INDEX with vertices[].id, as :6232-6242 reads it. Null when neither is
 * readable, a vertex has no name or coordinates, or the labels do not line up.
 */
export function readRing(row: any): RingRead | null {
  const metadata = row?.metadata ?? {}
  const cape = metadata.cape_lo_points
  if (Array.isArray(cape) && cape.length > 0) {
    const points = cape.map(readVertex)
    return points.some(p => p === null) ? null : { source: 'cape_lo_points', points: points as VertexPoint[] }
  }
  const vertices = metadata.vertices
  const ring = exteriorRing(row?.geom ?? row?.geometry)
  if (!Array.isArray(vertices) || vertices.length === 0 || vertices.length !== ring.length) return null
  const points = vertices.map((label: any, i: number) => readVertex({ id: label?.id, y: ring[i].y, x: ring[i].x }))
  return points.some(p => p === null) ? null : { source: 'vertices', points: points as VertexPoint[] }
}

/** Decision 4: every vertex coincides (1 mm) with a DISTINCT geom ring vertex, equal counts. */
export function ringMatchesGeom(points: VertexPoint[], geom: any): boolean {
  const ring = exteriorRing(geom)
  if (!Array.isArray(points) || ring.length === 0 || ring.length !== points.length) return false
  const used = new Set<number>()
  return points.every(p => {
    const j = ring.findIndex((r, k) => !used.has(k) && Math.hypot(r.y - p.y, r.x - p.x) <= COINCIDENCE_M)
    if (j === -1) return false
    used.add(j)
    return true
  })
}

function coincides(a: any, b: { y: number; x: number }): boolean {
  const y = Number(a?.y)
  const x = Number(a?.x)
  return Number.isFinite(y) && Number.isFinite(x) && Math.hypot(y - b.y, x - b.x) <= COINCIDENCE_M
}

/**
 * Decision 3: edges[i] runs points[i] → points[(i+1) % N], within 1 mm. This is what
 * makes a positional name patch safe. No residuals → vacuously true.
 */
export function edgesMatchRing(edges: unknown, points: VertexPoint[]): boolean {
  if (!Array.isArray(edges) || edges.length === 0) return true
  const n = points.length
  if (edges.length !== n) return false
  return edges.every((edge: any, i: number) => coincides(edge?.from, points[i]) && coincides(edge?.to, points[(i + 1) % n]))
}

function replaceAt<T>(list: T[], i: number, fn: (item: T) => T): T[] {
  const item = list[i]
  const updated = fn(item)
  if (updated === item) return list
  const copy = list.slice()
  copy[i] = updated
  return copy
}

/** Rename one stored vertex entry. Decision 8: description follows only when it equalled the old id. */
function renameEntry(entry: any, to: string): any {
  if (!entry || typeof entry !== 'object' || entry.id === to) return entry
  return { ...entry, id: to, ...(entry.description === entry.id && { description: to }) }
}

function renameEndpoint(edge: any, end: 'from' | 'to', to: string): any {
  const endpoint = edge?.[end]
  if (!endpoint || typeof endpoint !== 'object') return edge
  const hasName = 'name' in endpoint
  if (endpoint.id === to && (!hasName || endpoint.name === to)) return edge
  return { ...edge, [end]: { ...endpoint, id: to, ...(hasName && { name: to }) } }
}

/**
 * Pure. Returns new metadata with every name-bearing snapshot at each renamed index
 * set to `to`: cape_lo_points[i] or vertices[i] (per source), residuals.edges[i].from
 * and edges[(i-1+N)%N].to, and Outside Figure points[] entries coinciding with the
 * vertex. Nothing else changes — no number, no other key. Returns the SAME reference
 * when nothing changed. Callers must have checked edgesMatchRing.
 */
export function patchParcelMetadata(
  metadata: Record<string, any>,
  source: RingSource,
  renames: VertexRename[]
): Record<string, any> {
  const base = metadata ?? {}
  if (!Array.isArray(renames) || renames.length === 0) return base
  let next = base
  const set = (key: string, value: any) => {
    if (next === base) next = { ...base }
    next[key] = value
  }

  const ringKey = source === 'cape_lo_points' ? 'cape_lo_points' : 'vertices'
  if (Array.isArray(base[ringKey])) {
    let list = base[ringKey]
    for (const r of renames) {
      if (r.index < 0 || r.index >= list.length) continue
      list = replaceAt(list, r.index, (entry: any) =>
        source === 'cape_lo_points' ? renameEntry(entry, r.to) : entry?.id === r.to ? entry : { ...entry, id: r.to }
      )
    }
    if (list !== base[ringKey]) set(ringKey, list)
  }

  const edges = base.residuals?.edges
  if (Array.isArray(edges) && edges.length > 0) {
    const n = edges.length
    let list = edges
    for (const r of renames) {
      if (r.index < 0 || r.index >= n) continue
      list = replaceAt(list, r.index, (edge: any) => renameEndpoint(edge, 'from', r.to))
      list = replaceAt(list, (r.index - 1 + n) % n, (edge: any) => renameEndpoint(edge, 'to', r.to))
    }
    if (list !== edges) set('residuals', { ...base.residuals, edges: list })
  }

  if (Array.isArray(base.points)) {
    let list = base.points
    for (const r of renames) {
      for (let k = 0; k < list.length; k++) {
        if (!coincides(list[k], r)) continue
        list = replaceAt(list, k, (entry: any) => renameEntry(entry, r.to))
      }
    }
    if (list !== base.points) set('points', list)
  }

  return next
}

/** Every stored name string at ring index `index` (ring, both edge endpoints, OF points). */
function namesAt(metadata: Record<string, any>, source: RingSource, index: number, at: { y: number; x: number }): string[] {
  const names: string[] = []
  const push = (value: unknown) => names.push(typeof value === 'string' ? value : '')
  const ring = source === 'cape_lo_points' ? metadata?.cape_lo_points : metadata?.vertices
  push(ring?.[index]?.id)
  const edges = metadata?.residuals?.edges
  if (Array.isArray(edges) && edges.length > 0) {
    const n = edges.length
    for (const endpoint of [edges[index]?.from, edges[(index - 1 + n) % n]?.to]) {
      if (!endpoint || typeof endpoint !== 'object') continue
      push(endpoint.id)
      if ('name' in endpoint) push(endpoint.name)
    }
  }
  for (const point of Array.isArray(metadata?.points) ? metadata.points : []) {
    if (coincides(point, at)) push(point?.id)
  }
  return names
}

/** Reads the ring, applies the guards and decisions 6-8, produces `blocked` or `metadata`. */
export function planParcel(row: any, beacons: Beacon[], tolM: number = RECONCILE_TOLERANCE_M): ParcelPlan {
  const metadata = row?.metadata ?? {}
  const designation = String(row?.designation || row?.stand || `parcel ${row?.id}`)
  const hasCape = Array.isArray(metadata.cape_lo_points) && metadata.cape_lo_points.length > 0
  const base: ParcelPlan = { parcelId: row?.id, designation, source: hasCape ? 'cape_lo_points' : 'vertices', outcomes: [] }
  const block = (reason: BlockReason, detail: string, outcomes: VertexOutcome[] = []): ParcelPlan =>
    ({ ...base, outcomes, blocked: { reason, detail } })

  const ring = readRing(row)
  if (!ring) {
    const labels = Array.isArray(metadata.vertices) ? metadata.vertices.length : 0
    const ringLength = exteriorRing(row?.geom ?? row?.geometry).length
    if (!hasCape && labels > 0 && labels !== ringLength) {
      return block('ring-not-geom', `its ${labels} vertex labels do not line up with the ${ringLength} vertices of its geometry`)
    }
    return block('unreadable-vertex', 'it has no readable vertex list (a vertex with no name or unusable coordinates, or neither cape_lo_points nor vertex labels)')
  }
  if (ring.points.length < 3) {
    return block('too-few-points', `it lists only ${ring.points.length} vertices — a parcel needs at least 3`)
  }
  if (ring.source === 'cape_lo_points' && !ringMatchesGeom(ring.points, row?.geom ?? row?.geometry)) {
    return block('ring-not-geom', 'its stored vertex list does not match its geometry — recompute or re-digitise this parcel first')
  }
  if (!edgesMatchRing(metadata.residuals?.edges, ring.points)) return block('edges-not-ring', EDGES_NOT_RING)

  const outcomes = ring.points.map((p, i) => matchVertex(p, beacons, tolM, i))

  const ambiguous = outcomes.filter((o): o is Extract<VertexOutcome, { kind: 'ambiguous' }> => o.kind === 'ambiguous')
  if (ambiguous.length > 0) {
    const detail = ambiguous
      .map(o => `vertex ${o.index + 1} ("${o.id}") is within ${tolM} m of ${o.candidates.map(c => `${c.name} (${c.distanceM.toFixed(3)} m)`).join(', ')}`)
      .join('; ')
    return block('ambiguous', detail, outcomes)
  }

  const firstIndexOf = new Map<string, number>()
  for (const o of outcomes) {
    const name = o.kind === 'rename' ? o.to : o.kind === 'unchanged' ? o.id : null
    if (name === null) continue
    const seen = firstIndexOf.get(name)
    if (seen !== undefined) {
      return block('duplicate-vertex', `vertices ${seen + 1} and ${o.index + 1} both resolve to beacon "${name}"`, outcomes)
    }
    firstIndexOf.set(name, o.index)
  }

  // Patch EVERY matched index, not only stale ring names: residuals can be stale while
  // cape_lo_points is current (the old handlePointRename left exactly that behind).
  const renames: VertexRename[] = []
  for (const o of outcomes) {
    const at = ring.points[o.index]
    if (o.kind === 'rename') renames.push({ index: o.index, from: o.from, to: o.to, y: at.y, x: at.x })
    if (o.kind === 'unchanged') renames.push({ index: o.index, from: o.id, to: o.id, y: at.y, x: at.x })
  }
  const patched = patchParcelMetadata(metadata, ring.source, renames)
  if (JSON.stringify(patched) === JSON.stringify(metadata)) return { ...base, source: ring.source, outcomes }

  const reported: VertexOutcome[] = outcomes.map(o => {
    if (o.kind !== 'unchanged') return o
    const stale = namesAt(metadata, ring.source, o.index, ring.points[o.index]).find(n => n !== o.id)
    return stale === undefined ? o : { kind: 'rename', index: o.index, from: stale, to: o.id, distanceM: o.distanceM }
  })
  return { ...base, source: ring.source, outcomes: reported, metadata: patched }
}

/** One pass over every parcel. A blocked parcel never blocks its neighbours. */
export function planReconciliation(
  parcelRows: any[],
  beaconRows: any[],
  tolM: number = RECONCILE_TOLERANCE_M
): ReconciliationPlan {
  const beacons = toBeacons(beaconRows)
  const plan: ReconciliationPlan = { writes: [], blocked: [], unchanged: [] }
  for (const row of parcelRows || []) {
    const parcel = planParcel(row, beacons, tolM)
    if (parcel.blocked) plan.blocked.push(parcel)
    else if (parcel.metadata) plan.writes.push(parcel)
    else plan.unchanged.push(parcel)
  }
  return plan
}

/** The confirm dialog's content, as sections so the modal can render a scrollable list. */
export function summarise(beaconPlan: BeaconNamePlan, parcelPlan: ReconciliationPlan): ReconcileSummary {
  const sections: ReconcileSummary['sections'] = []
  const renames = beaconPlan?.renames ?? []
  const collisions = beaconPlan?.collisions ?? []
  const writes = parcelPlan?.writes ?? []
  const blocked = parcelPlan?.blocked ?? []

  if (renames.length > 0) {
    sections.push({ heading: `Beacon names to capitalise (${renames.length})`, lines: renames.map(r => `"${r.from}" → "${r.to}"`) })
  }
  if (collisions.length > 0) {
    sections.push({
      heading: `Beacon names left as they are — the capitalised name already exists (${collisions.length})`,
      lines: collisions.map(c => `"${c.from}" — "${c.existing}" already exists; rename or delete one of them by hand`),
    })
  }
  if (writes.length > 0) {
    sections.push({
      heading: `Parcels to update (${writes.length})`,
      lines: writes.flatMap(p =>
        p.outcomes.flatMap(o => (o.kind === 'rename' ? [`${p.designation}: "${o.from}" → "${o.to}" (${o.distanceM.toFixed(3)} m)`] : []))
      ),
    })
  }
  if (blocked.length > 0) {
    sections.push({
      heading: `Parcels that will NOT be updated (${blocked.length})`,
      lines: blocked.map(p => `${p.designation} — ${p.blocked!.detail}`),
    })
  }
  sections.push({ heading: 'Already correct', lines: [`${parcelPlan?.unchanged?.length ?? 0} parcel(s) need no change`] })

  return { hasWork: renames.length > 0 || writes.length > 0, sections }
}

/** Plain-text form of a summary, for alert() and the console. */
export function formatSummary(summary: ReconcileSummary): string {
  return (summary?.sections ?? []).map(s => [s.heading, ...s.lines.map(l => `  • ${l}`)].join('\n')).join('\n\n')
}

/**
 * Resolved #3: a rename finishes its own propagation. For the exact old → new name,
 * patch every parcel whose RING lists the old name. Name-keyed, so no geom guard is
 * needed; the residual edges are patched by position, so edgesMatchRing still is.
 */
export function planRenamePropagation(parcelRows: any[], from: string, to: string): PropagationPlan {
  const plan: PropagationPlan = { writes: [], blocked: [] }
  if (!from || !to || from === to) return plan

  for (const row of parcelRows || []) {
    const metadata = row?.metadata ?? {}
    const ringIds = [
      ...(Array.isArray(metadata.cape_lo_points) ? metadata.cape_lo_points : []),
      ...(Array.isArray(metadata.vertices) ? metadata.vertices : []),
    ].map((entry: any) => entry?.id)
    if (!ringIds.includes(from)) continue

    const designation = String(row?.designation || row?.stand || `parcel ${row?.id}`)
    const ring = readRing(row)
    if (!ring) {
      plan.blocked.push({ designation, detail: 'its vertex list could not be read — fix this parcel, then run 🔧 Repair Beacon Names' })
      continue
    }
    if (!edgesMatchRing(metadata.residuals?.edges, ring.points)) {
      plan.blocked.push({ designation, detail: EDGES_NOT_RING })
      continue
    }

    const renames: VertexRename[] = ring.points.flatMap((p, index) =>
      p.id === from ? [{ index, from, to, y: p.y, x: p.x }] : []
    )
    const patched = patchParcelMetadata(metadata, ring.source, renames)
    if (patched !== metadata) plan.writes.push({ parcelId: row.id, designation, metadata: patched })
  }
  return plan
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts`
Expected: PASS.

Run: `cd app-frontend && npx vitest run`
Expected: baseline + the new tests, 0 new failures. `vertexSnap.test.ts` and `vertexCascade.test.ts` stay green (only `export` was added to `vertexSnap.ts`).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts app-frontend/src/views/modules/cadastral-standard/beaconReconcile.ts app-frontend/src/views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts
git commit -m "feat(beacon-names): add the position-keyed reconciliation planner"
```

---

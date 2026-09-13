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
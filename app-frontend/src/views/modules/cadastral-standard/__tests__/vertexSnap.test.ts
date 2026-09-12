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

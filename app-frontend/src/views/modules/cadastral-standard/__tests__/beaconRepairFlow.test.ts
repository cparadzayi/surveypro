import { describe, test, expect } from 'vitest'
import {
  renamePointList,
  renameWorkflowCopies,
  executeRepair,
  propagateRename,
  describeRepairResult,
  buildBeaconRepairPlan,
  runBeaconRepair,
  type RepairDeps,
} from '../beaconRepairFlow'

/** The persisted step_data shapes (spec Part 2; used by A2). */
const CSV_POINTS = [
  { id: '2474a', y: 1, x: 2, status: 'P', description: 'peg', survey_date: '2026-01-01' },
  { id: '1464', y: 3, x: 4, status: 'F', description: 'town', survey_date: '2026-01-01' },
]
const ADJUSTED = [{ id: '2474a', y: 1, x: 2 }, { id: '1464', y: 3, x: 4 }, { id: '99a', y: 5, x: 6 }]

function deps(overrides: Partial<RepairDeps> = {}): RepairDeps & { calls: any[] } {
  const calls: any[] = []
  const record = (name: keyof RepairDeps, args: unknown[]) => {
    if (name === 'executeA1') calls.push(['a1', args[0]])
    else if (name === 'executeA2') calls.push(['a2', args[0]])
    else if (name === 'updateParcels') calls.push(['b', (args[0] as any[]).map(w => w.parcelId)])
    else if (name === 'refresh') calls.push(['refresh'])
  }
  const wrap = <K extends keyof RepairDeps>(key: K): RepairDeps[K] => {
    const override = overrides[key]
    return (async (...args: any[]) => {
      record(key, args)
      if (override) return (override as any)(...args)
      switch (key) {
        case 'executeA1': return { ok: true, renamed: (args[0] as any[]).length }
        case 'executeA2': return { ok: true, failed: [] }
        case 'updateParcels': return { written: (args[0] as any[]).map(w => String(w.parcelId)), failed: [] }
        default: return undefined
      }
    }) as RepairDeps[K]
  }
  return {
    executeA1: wrap('executeA1'),
    executeA2: wrap('executeA2'),
    updateParcels: wrap('updateParcels'),
    refresh: wrap('refresh'),
    calls,
  }
}

describe('renamePointList', () => {
  test('re-ids every matching entry, leaves the rest and the input untouched', () => {
    const input = [{ id: '2474a', y: 1 }, { id: '1464', y: 3 }]
    const out = renamePointList(input, '2474a', '2474A')
    expect(out).toEqual([{ id: '2474A', y: 1 }, { id: '1464', y: 3 }])
    expect(input[0].id).toBe('2474a')
  })
  test('identity when nothing matches; undefined input is safe', () => {
    expect(renamePointList([{ id: '1464' }], '2474a', '2474A')).toEqual([{ id: '1464' }])
    expect(renamePointList(undefined, 'a', 'A')).toEqual([])
  })
})

describe('renameWorkflowCopies', () => {
  test('renames csv-import.points and calculations-part1.adjusted_coordinates', () => {
    const copies = renameWorkflowCopies(
      { 'csv-import': { points: CSV_POINTS }, 'calculations-part1': { adjusted_coordinates: ADJUSTED } },
      [{ from: '2474a', to: '2474A' }, { from: '99a', to: '99A' }]
    )
    expect(copies).toHaveLength(2)
    expect(copies.find(c => c.step === 'csv-import')?.metadata.points[0].id).toBe('2474A')
    const calc = copies.find(c => c.step === 'calculations-part1')!
    expect(calc.metadata.adjusted_coordinates.map((p: any) => p.id)).toEqual(['2474A', '1464', '99A'])
  })
  test('omits a step that did not change', () => {
    const copies = renameWorkflowCopies(
      { 'csv-import': { points: CSV_POINTS } },
      [{ from: 'nonexistent', to: 'NOPE' }]
    )
    expect(copies).toEqual([])
  })
  test('emits only the keys that exist; empty step_data is safe', () => {
    expect(renameWorkflowCopies({}, [{ from: 'a', to: 'A' }])).toEqual([])
    expect(renameWorkflowCopies(undefined, [])).toEqual([])
  })
})

describe('executeRepair', () => {
  const beaconPlan = (renames = [{ id: 7, from: '2474a', to: '2474A' }]) => ({
    renames, collisions: [], after: [], // BeaconNamePlan shape
  })

  test('orders A1 → A2 → B and refreshes once', async () => {
    const d = deps()
    const parcelPlan = { writes: [{ parcelId: 101, designation: 'STAND 1', metadata: { cape_lo_points: [] } }], blocked: [], unchanged: [] }
    const outcome = await executeRepair(beaconPlan() as any, parcelPlan as any, d)
    expect((d as any).calls).toEqual([
      ['a1', [{ id: 7, from: '2474a', to: '2474A' }]],
      ['a2', [{ id: 7, from: '2474a', to: '2474A' }]],
      ['b', [101]],
      ['refresh'],
    ])
    expect(outcome.phase).toBe('complete')
    expect(outcome.a1Renamed).toBe(1)
  })

  test('an A1 failure stops the repair — no A2, no B, no refresh', async () => {
    const d = deps({ executeA1: async () => ({ ok: false, error: 'plan changed — re-run' }) })
    const outcome = await executeRepair(beaconPlan() as any, { writes: [{ parcelId: 101, designation: 'STAND 1', metadata: {} }], blocked: [], unchanged: [] } as any, d)
    expect(outcome.phase).toBe('a1-failed')
    expect((d as any).calls).toEqual([['a1', [{ id: 7, from: '2474a', to: '2474A' }]]])
    expect(outcome.error).toMatch(/re-run/i)
    expect(describeRepairResult(outcome)).toMatch(/nothing else was written/i)
  })

  test('no renames skips A1 and A2, still runs B', async () => {
    const d = deps()
    const outcome = await executeRepair(
      beaconPlan([]) as any,
      { writes: [{ parcelId: 101, designation: 'STAND 1', metadata: {} }], blocked: [], unchanged: [] } as any,
      d
    )
    expect((d as any).calls.filter(c => c[0].startsWith('a'))).toEqual([])
    expect(outcome.phase).toBe('complete')
  })

  test('a partial phase-B failure is reported loudly, not prevented', async () => {
    const d = deps({
      updateParcels: async writes => ({ written: ['STAND 1'], failed: [{ designation: 'STAND 2', message: 'Request failed with status code 500' }] }),
    })
    const outcome = await executeRepair(
      beaconPlan([]) as any,
      { writes: [
        { parcelId: 101, designation: 'STAND 1', metadata: {} },
        { parcelId: 102, designation: 'STAND 2', metadata: {} },
      ], blocked: [], unchanged: [] } as any,
      d
    )
    const text = describeRepairResult(outcome)
    expect(text).toMatch(/PARTIAL UPDATE/)
    expect(text).toMatch(/STAND 1/)
    expect(text).toMatch(/STAND 2 — Request failed with status code 500/)
    expect(text).toMatch(/Re-run/i)
  })
})

describe('buildBeaconRepairPlan + runBeaconRepair (shared button/self-heal orchestration)', () => {
  const v = (id: string, y: number, x: number, extra: Record<string, any> = {}): any => ({ id, y, x, ...extra })
  const geomOf = (points: Array<{ y: number; x: number }>) => ({
    type: 'Polygon',
    coordinates: [[...points.map(p => [p.x, p.y]), [points[0].x, points[0].y]]],
  })
  const edgesOf = (points: Array<{ id: string; y: number; x: number }>) =>
    points.map((p, i) => {
      const q = points[(i + 1) % points.length]
      return {
        index: i + 1,
        from: { y: p.y, x: p.x, id: p.id, name: p.id },
        to: { y: q.y, x: q.x, id: q.id, name: q.id },
        dy: 0.001 * (i + 1), dx: -0.002 * (i + 1),
        distance: 10.0004, distanceRounded: 10, bearingDeg: 90 * i, directionDMS: `${90 * i}°00'00"`,
      }
    })
  const PARCEL_POINTS = [v('2474a', 0, 0), v('B', 0, 10), v('C', 10, 10), v('D', 10, 0)]
  const row = (id: number, designation: string, points: any[], metadata: Record<string, any> = {}): any => ({
    id, stand: designation, designation, geom: geomOf(points),
    metadata: {
      cape_lo_points: points,
      residuals: { edges: edgesOf(points), sumDy: 0.01, sumDx: -0.02 },
      ...metadata,
    },
  })
  const NORMALISED_DB_POINTS = [
    { id: 1, name: '2474A', y: 0, x: 0 }, { id: 2, name: 'B', y: 0, x: 10 },
    { id: 3, name: 'C', y: 10, x: 10 }, { id: 4, name: 'D', y: 10, x: 0 },
  ]

  test('post-merge: beacon names already normalised, parcel metadata still stale → B-only plan', () => {
    const staleParcel = row(101, 'STAND 1', PARCEL_POINTS)
    const plan = buildBeaconRepairPlan([staleParcel], NORMALISED_DB_POINTS)
    expect(plan.beaconPlan.renames).toEqual([]) // the merge normalised the beacon table
    expect(plan.summary.hasWork).toBe(true)     // but the parcel still says 2474a
    expect(plan.parcelPlan.writes[0].designation).toBe('STAND 1')
    expect(plan.parcelPlan.writes[0].metadata.cape_lo_points[0].id).toBe('2474A')
  })

  test('button scenario: stale beacon name flows into a parcel rename plan too', () => {
    const plan = buildBeaconRepairPlan(
      [row(101, 'STAND 1', PARCEL_POINTS)],
      NORMALISED_DB_POINTS.map(p => (p.name === '2474A' ? { ...p, name: '2474a' } : p))
    )
    expect(plan.beaconPlan.renames).toEqual([{ id: 1, from: '2474a', to: '2474A' }])
    expect(plan.summary.hasWork).toBe(true)
  })

  test('clean project → no work', () => {
    const plan = buildBeaconRepairPlan(
      [row(101, 'STAND 1', PARCEL_POINTS.map(p => (p.id === '2474a' ? { ...p, id: '2474A' } : p)))],
      NORMALISED_DB_POINTS
    )
    expect(plan.summary.hasWork).toBe(false)
    expect(plan.parcelPlan.writes).toEqual([])
  })

  test('runBeaconRepair on a no-beacon-rename plan runs ONLY phase B, then refreshes', async () => {
    const d = deps()
    const plan = buildBeaconRepairPlan([row(101, 'STAND 1', PARCEL_POINTS)], NORMALISED_DB_POINTS)
    const outcome = await runBeaconRepair(plan, d)
    expect((d as any).calls).toEqual([['b', [101]], ['refresh']])
    expect(outcome.phase).toBe('complete')
  })

  test('runBeaconRepair stops on an A1 failure, exactly like the button', async () => {
    const d = deps({ executeA1: async () => ({ ok: false, error: 'plan changed — re-run' }) })
    const plan = buildBeaconRepairPlan(
      [row(101, 'STAND 1', PARCEL_POINTS)],
      NORMALISED_DB_POINTS.map(p => (p.name === '2474A' ? { ...p, name: '2474a' } : p))
    )
    const outcome = await runBeaconRepair(plan, d)
    expect(outcome.phase).toBe('a1-failed')
    expect((d as any).calls.filter(c => c[0].startsWith('a'))).toEqual([['a1', [{ id: 1, from: '2474a', to: '2474A' }]]])
    expect(describeRepairResult(outcome)).toMatch(/nothing else was written/i)
  })
})

describe('propagateRename', () => {
  test('patches every parcel that lists the old name, metadata only (Resolved #3)', async () => {
    const rows = [
      { id: 101, designation: 'STAND 1', metadata: { cape_lo_points: [{ id: '2474a', y: 1, x: 2 }] } },
      { id: 102, designation: 'STAND 2', metadata: { cape_lo_points: [{ id: '1464', y: 9, x: 9 }] } },
    ]
    const updated: any[] = []
    const { written, failed } = await propagateRename(rows, '2474a', '2474A', {
      updateParcel: async (parcelId, patch) => { updated.push([parcelId, patch]) },
    })
    expect(written).toEqual(['STAND 1'])
    expect(failed).toEqual([])
    expect(updated[0][0]).toBe(101)
    expect(updated[0][1].metadata.cape_lo_points[0].id).toBe('2474A')
    expect(updated[0][1].metadata.cape_lo_points[0].y).toBe(1)
  })

  test('a parcel whose edges do not match its ring is reported as blocked, not silently skipped', async () => {
    const rows = [
      { id: 101, designation: 'STAND 1', metadata: { cape_lo_points: [{ id: '2474a', y: 1, x: 2 }], residuals: { edges: [{ from: { id: 'X', y: 9, x: 9 }, to: { id: 'Y', y: 8, x: 8 } }] } } },
    ]
    const { written, failed } = await propagateRename(rows, '2474a', '2474A', {
      updateParcel: async () => { throw new Error('should not be called') },
    })
    expect(written).toEqual([])
    expect(failed).toEqual([{ designation: 'STAND 1', message: 'blocked — consistency data does not match its vertex list — recompute this parcel first' }])
  })
})
import { describe, test, expect } from 'vitest'
import { planCoordinateRefresh, refreshWorkflowCoordinateCopies } from '../parcelSnapshotRefresh'

/** A beacon-linked parcel: geometry ring + cape_lo_points stored in the same order. */
function parcel(id: number, designation: string, ring: Array<[number, number]>, capes: any[], extra = {}) {
  const coordinates = [...ring.map(([y, x]) => [x, y]), ring.length > 0 ? [ring[0][1], ring[0][0]] : []]
  return {
    id,
    designation,
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    metadata: { cape_lo_points: capes, residuals: { edges: [] } },
    ...extra,
  }
}

/** Registry row shape as returned by listCoordinatePoints. */
const reg = (name: string, y: number, x: number) => ({ id: name, name, y, x })

describe('planCoordinateRefresh', () => {
  test('rebuilds each vertex from the fresh registry by NAME (coordinates move, ids kept)', () => {
    const plan = planCoordinateRefresh(
      [parcel(1, 'STAND 1', [[10, 20], [30, 40], [50, 60]], [
        { id: 'A', y: 10, x: 20 }, { id: 'B', y: 30, x: 40 }, { id: 'C', y: 50, x: 60 },
      ])],
      [reg('A', 11, 21), reg('B', 31, 41), reg('C', 50, 60)]
    )
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0]).toMatchObject({ parcelId: 1, designation: 'STAND 1' })
    expect(plan.writes[0].points).toEqual([
      { id: 'A', y: 11, x: 21 },
      { id: 'B', y: 31, x: 41 },
      { id: 'C', y: 50, x: 60 },
    ])
    expect(plan.blocked).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  test('skips a parcel whose vertices are already current', () => {
    const plan = planCoordinateRefresh(
      [parcel(1, 'STAND 1', [[10, 20], [30, 40]], [
        { id: 'A', y: 10, x: 20 }, { id: 'B', y: 30, x: 40 },
      ])],
      [reg('A', 10, 20), reg('B', 30, 40)]
    )
    expect(plan.writes).toEqual([])
    expect(plan.skipped).toEqual(['STAND 1'])
  })

  test('blocks a parcel whose vertex name no longer exists in the registry', () => {
    const plan = planCoordinateRefresh(
      [parcel(1, 'STAND 1', [[10, 20], [30, 40]], [{ id: 'A', y: 10, x: 20 }, { id: 'B', y: 30, x: 40 }])],
      [reg('A', 10, 20)]
    )
    expect(plan.writes).toEqual([])
    expect(plan.blocked).toEqual([
      { designation: 'STAND 1', detail: expect.stringContaining('"B"') },
    ])
  })

  test('skips parcels without a beacon-linked ring or with a mismatched ring length', () => {
    const noCapes = { ...parcel(1, 'STAND 1', [[10, 20], [30, 40]], []), geometry: {} }
    const mismatched = parcel(2, 'STAND 2', [[10, 20], [30, 40], [50, 60]], [{ id: 'A' }])
    const plan = planCoordinateRefresh([noCapes, mismatched], [reg('A', 1, 2)])
    expect(plan.writes).toEqual([])
    expect(plan.skipped).toEqual(['STAND 1', 'STAND 2'])
    expect(plan.blocked).toEqual([])
  })

  test('skips orphaned parcels entirely', () => {
    const plan = planCoordinateRefresh(
      [parcel(1, 'STAND 1', [[10, 20], [30, 40], [50, 60]], [
        { id: 'A', y: 10, x: 20 }, { id: 'B', y: 30, x: 40 }, { id: 'C', y: 50, x: 60 },
      ], { parcel_status: 'orphaned' })],
      [reg('A', 11, 21), reg('B', 31, 41), reg('C', 51, 61)]
    )
    expect(plan.writes).toEqual([])
    expect(plan.skipped).toEqual([])
    expect(plan.blocked).toEqual([])
  })

  test('is safe with empty inputs', () => {
    const plan = planCoordinateRefresh([], [])
    expect(plan).toEqual({ writes: [], skipped: [], blocked: [] })
  })
})

describe('refreshWorkflowCoordinateCopies', () => {
  test('updates y/x on calculations-part1.adjusted_coordinates by id', () => {
    const copies = refreshWorkflowCoordinateCopies(
      { 'calculations-part1': { adjusted_coordinates: [{ id: 'A', y: 10, x: 20 }, { id: 'B', y: 30, x: 40 }] } },
      [reg('A', 11, 21), reg('B', 30, 40)]
    )
    expect(copies).toHaveLength(1)
    expect(copies[0]).toEqual({
      step: 'calculations-part1',
      metadata: { adjusted_coordinates: [{ id: 'A', y: 11, x: 21 }, { id: 'B', y: 30, x: 40 }] },
    })
  })

  test('returns [] when nothing changed, coordinates are missing, or step absent', () => {
    const current = { 'calculations-part1': { adjusted_coordinates: [{ id: 'A', y: 10, x: 20 }] } }
    expect(refreshWorkflowCoordinateCopies(current, [reg('A', 10, 20)])).toEqual([])
    expect(refreshWorkflowCoordinateCopies(current, [])).toEqual([])
    expect(refreshWorkflowCoordinateCopies({}, [reg('A', 11, 21)])).toEqual([])
    expect(refreshWorkflowCoordinateCopies(undefined, [])).toEqual([])
  })

  test('keeps csv-import.points untouched (raw import snapshot)', () => {
    const copies = refreshWorkflowCoordinateCopies(
      {
        'csv-import': { points: [{ id: 'A', y: 10, x: 20 }] },
        'calculations-part1': { adjusted_coordinates: [{ id: 'A', y: 10, x: 20 }] },
      },
      [reg('A', 11, 21)]
    )
    expect(copies).toHaveLength(1)
    expect(copies[0].step).toBe('calculations-part1')
  })
})
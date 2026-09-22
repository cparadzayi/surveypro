/**
 * A (cache invalidation): every coordinate-point mutation must clear the shared
 * read cache so getCoordinatePointsForProject() refetches on the next read.
 *
 * Regression: getCoordinatePointsForProject cached per project in a module-level
 * Map that had NO callers of its clear (bnr-part7.md). After a CSV re-import or
 * a point edit, later generations served STALE coordinates. Moving the store to
 * services/coordinatePointCache and clearing it inside every mutation in
 * services/spatial.ts fixed the freshness; this test pins that contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '../api'
import { getCoordinatePointsForProject, clearCoordinatePointsCache } from '../../utils/parcelMetadataComputer'
import {
  createCoordinatePoint,
  renameCoordinatePoint,
  updateCoordinatePoint,
  batchCreateCoordinatePoints,
  deleteCoordinatePoint,
  deleteCoordinatePointByName,
  normalizeCoordinatePointNames,
} from '../spatial'

const point = (id: string | number, name: string, y: number, x: number) => ({ id, name, y, x })

function seedCache(projectId: number) {
  ;(api.get as any).mockReset()
  ;(api.get as any).mockResolvedValue({
    data: { ok: true, data: [point(1, 'A', 10, 20), point(2, 'B', 30, 40)] },
  })
  return getCoordinatePointsForProject(projectId)
}

describe('coordinate-point mutations clear the shared cache', () => {
  beforeEach(() => {
    clearCoordinatePointsCache()
    vi.clearAllMocks()
  })

  it('createCoordinatePoint invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.post as any).mockResolvedValue({ data: { ok: true, data: point(3, 'C', 50, 60) } })
    await createCoordinatePoint({ project_id: 1, name: 'C', y: 50, x: 60 })

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('renameCoordinatePoint invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.patch as any).mockResolvedValue({ data: { ok: true, data: point(1, 'Z', 10, 20) } })
    await renameCoordinatePoint(1, 'A', 'Z')

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('normalizeCoordinatePointNames invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.post as any).mockResolvedValue({ data: { ok: true, data: { renamed: 1 } } })
    await normalizeCoordinatePointNames(1, [{ id: 1, from: 'A', to: 'Z' }])

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('updateCoordinatePoint invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.put as any).mockResolvedValue({ data: { ok: true, data: point(1, 'A', 11, 21) } })
    await updateCoordinatePoint(1, { y: 11, x: 21 })

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('batchCreateCoordinatePoints invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.post as any).mockResolvedValue({ data: { ok: true, data: [point(3, 'C', 50, 60)], count: 1, conflicts: [] } })
    await batchCreateCoordinatePoints(1, [{ name: 'C', y: 50, x: 60 }])

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('deleteCoordinatePoint invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.delete as any).mockResolvedValue({ data: { ok: true } })
    await deleteCoordinatePoint(1)

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('deleteCoordinatePointByName invalidates a seeded cache', async () => {
    await seedCache(1)
    ;(api.delete as any).mockResolvedValue({ data: { ok: true, deleted: 1 } })
    await deleteCoordinatePointByName(1, 'A')

    ;(api.get as any).mockClear()
    await getCoordinatePointsForProject(1)
    expect(api.get).toHaveBeenCalled()
  })

  it('a read alone serves the cache and does NOT refetch', async () => {
    await seedCache(1)
    ;(api.get as any).mockClear()
    const points = await getCoordinatePointsForProject(1)
    expect(points).toHaveLength(2)
    expect(api.get).not.toHaveBeenCalled()
  })
})
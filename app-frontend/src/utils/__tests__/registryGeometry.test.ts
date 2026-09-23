import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bankersRound, shoelaceAreaYX, computeRegistryAreaM2, computeParcelRegistryArea, snapOuterRingToRegistry } from '../registryGeometry'
import { computeCapeLoPointsFromGeometry } from '../parcelMetadataComputer'

vi.mock('../parcelMetadataComputer', () => ({
  computeCapeLoPointsFromGeometry: vi.fn(async (parcel: any) => {
    // Mirrors the real matcher: registry co-ords for matched vertices (87D here),
    // geometry co-ords + sequential fallback name otherwise.
    const ring = parcel.geom.coordinates[0]
    const fallback = ['A', 'B', 'C', 'D']
    return ring.slice(0, -1).map((c: number[], i: number) => ({
      id: i === 2 ? '87D' : `${parcel.stand}${fallback[i]}`,
      y: i === 2 ? -85729.990 : c[1],
      x: i === 2 ? 2144164.800 : c[0],
      status: 'P',
    }))
  }),
}))

// Brackenhurst September 2026, parcel 403 — the parcel whose re-import moved
// beacon 87D ~5cm while the digitized geometry kept the pre-import position.
// Values cross-checked against backend computeAreaConsistency.
const GEOM_RING_403 = [
  [2144076.45, -85723.4], [2144120.22, -85774.38],
  [2144164.76, -85729.94], [2144117.41, -85682.52],
  [2144076.45, -85723.4],
]

describe('bankersRound', () => {
  it('rounds half to even', () => {
    expect(bankersRound(0.5, 0)).toBe(0)
    expect(bankersRound(1.5, 0)).toBe(2)
    expect(bankersRound(2.5, 0)).toBe(2)
    expect(bankersRound(2.675, 2)).toBe(2.68)
  })
})

describe('computeRegistryAreaM2', () => {
  it('matches the backend area for the pre-import geometry ring', () => {
    expect(computeRegistryAreaM2(GEOM_RING_403)).toBeCloseTo(4046.8896, 3)
  })

  it('matches the backend area for the registry-snapped ring (~4048.6566)', async () => {
    const snap = await snapOuterRingToRegistry({ geom: { coordinates: [GEOM_RING_403] }, stand: '403' }, [{} as any])
    expect(snap).not.toBeNull()
    expect(computeRegistryAreaM2(snap!.ring)).toBeCloseTo(4048.6566, 3)
  })
})

describe('computeParcelRegistryArea', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the registry ring when snap succeeds', async () => {
    const parcel = { id: 403, stand: '403', geom: { coordinates: [GEOM_RING_403] }, area_m2: 4046.8896 }
    expect(await computeParcelRegistryArea(parcel, [{} as any])).toBeCloseTo(4048.6566, 3)
  })

  it('falls back to stored area_m2 when there is no registry or geometry', async () => {
    expect(await computeParcelRegistryArea({ id: 403, stand: '403', geom: null, area_m2: 4046.8896 }, [])).toBe(4046.8896)
    expect(await computeParcelRegistryArea({ id: 403, stand: '403', geom: { coordinates: [GEOM_RING_403] }, area_m2: 4046.8896 }, []))
      .toBe(4046.8896)
  })

  it('returns a closed ring whose vertex count matches the source ring', async () => {
    const parcel = { id: 403, stand: '403', geom: { coordinates: [GEOM_RING_403] }, area_m2: 4046.8896 }
    const snap = (await snapOuterRingToRegistry(parcel, [{} as any]))!
    expect(snap.ring.length).toBe(GEOM_RING_403.length)
    expect(snap.ring[0]).toEqual(snap.ring[snap.ring.length - 1])
  })
})
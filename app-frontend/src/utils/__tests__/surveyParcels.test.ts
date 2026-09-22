import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  asBaseMapParcel,
  digitizedPoints,
  vertexLabelPoints,
  parcelFromBaseRecord,
  storedAreaResult,
  loadBaseMapParcels,
  computeBaseMapStandLabels,
  computeBaseMapBeaconLabels,
  snapshotEdgesStale,
} from '../surveyParcels'

vi.mock('../../services/spatial', () => ({
  listLandParcels: vi.fn(),
  listCoordinatePoints: vi.fn(),
}))

vi.mock('../../services/compute', () => ({
  areaCompute: vi.fn(),
}))

import { listLandParcels } from '../../services/spatial'
import { areaCompute } from '../../services/compute'

const ring = [
  [100, 100], [110, 100], [110, 110], [100, 110], [100, 100],
] as [number, number][]

const record = {
  id: 7,
  stand: '1620',
  designation: '1620',
  project_id: 1,
  area_m2: 174,
  area_ha: 0.0174,
  geom: { type: 'Polygon', coordinates: [ring] },
  metadata: {
    residuals: { edges: [{ index: 0 }] },
    closure: { ratioFormatted: '1:42000' },
  },
}

const digitized = [
  { id: '1', y: 100, x: 100, status: 'P' },
  { id: '2', y: 100, x: 110, status: 'P' },
  { id: '3', y: 110, x: 110, status: 'P' },
  { id: '4', y: 110, x: 100, status: 'P' },
]

const areaResponse = {
  ok: true,
  area: { signed_m2: 100, abs_m2: 100, meters_rounded: 100, hectares_rounded: 0.01, display: { square_meters: 100, unit: 'm2' } },
  centroid: { y: 105, x: 105 },
  residuals: { edges: [{ index: 0 }] },
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(areaCompute as ReturnType<typeof vi.fn>).mockResolvedValue(areaResponse)
})

describe('asBaseMapParcel', () => {
  it('normalizes geom, stand, designation and numeric areas', () => {
    const p = asBaseMapParcel({ stand: '9', designation: null, geometry: { type: 'Polygon', coordinates: [] }, area_m2: '250.5', area_ha: '0.025', extra: 'kept' })
    expect(p.geom).toBe(p.geometry)
    expect(p.stand).toBe('9')
    expect(p.designation).toBe('9')
    expect(p.area_m2).toBe(250.5)
    expect(p.area_ha).toBe(0.025)
    expect(p.extra).toBe('kept')
  })
})

describe('digitizedPoints', () => {
  it('returns stored cape_lo_points verbatim when the ring matches', () => {
    const pts = digitizedPoints({ ...record, metadata: { ...record.metadata, cape_lo_points: digitized } })
    expect(pts).toHaveLength(4)
    expect(pts[0]).toMatchObject({ id: '1', y: 100, x: 100, status: 'P' })
  })

  it('returns [] when the stored points are stale vs the ring', () => {
    const stale = digitized.slice(0, 3)
    expect(digitizedPoints({ ...record, metadata: { ...record.metadata, cape_lo_points: stale } })).toEqual([])
  })

  it('returns [] when there are no stored points', () => {
    expect(digitizedPoints(record)).toEqual([])
  })

  it('returns stored points verbatim when the registry still agrees with them', () => {
    const registry = [
      { name: '1', y: 100, x: 100 },
      { name: '2', y: 100, x: 110 },
      { name: '3', y: 110, x: 110 },
      { name: '4', y: 110, x: 100 },
    ]
    const pts = digitizedPoints({ ...record, metadata: { ...record.metadata, cape_lo_points: digitized } }, registry)
    expect(pts.map((pt) => pt.id)).toEqual(['1', '2', '3', '4'])
  })

  it('returns [] when a stored beacon moved (>0.5m) in the registry (re-import correction)', () => {
    const registry = [
      { name: '1', y: 101, x: 100 },
      { name: '2', y: 100, x: 110 },
      { name: '3', y: 110, x: 110 },
      { name: '4', y: 110, x: 100 },
    ]
    const pts = digitizedPoints({ ...record, metadata: { ...record.metadata, cape_lo_points: digitized } }, registry)
    expect(pts).toEqual([])
  })

  it('returns [] when a stored beacon was renamed and its vertex now resolves to a registry point (87DNew case)', () => {
    const staleNames = [
      { id: 'SD6', y: 100, x: 100, status: 'P' },
      { id: 'SD2', y: 100, x: 110, status: 'P' },
      { id: '87DNew', y: 110, x: 110, status: 'P' },
      { id: 'SD3', y: 110, x: 100, status: 'P' },
    ]
    const registry = [
      { name: 'SD6', y: 100, x: 100 },
      { name: 'SD2', y: 100, x: 110 },
      { name: '87D', y: 110, x: 110 },
      { name: 'SD3', y: 110, x: 100 },
    ]
    const pts = digitizedPoints({ ...record, metadata: { ...record.metadata, cape_lo_points: staleNames } }, registry)
    expect(pts).toEqual([])
  })

  it('keeps a stored beacon whose name is unregistered and has no registry point on its vertex', () => {
    const legitUnregistered = [
      { id: '1', y: 100, x: 100, status: 'P' },
      { id: 'NEW', y: 100, x: 110, status: 'P' },
      { id: '3', y: 110, x: 110, status: 'P' },
      { id: '4', y: 110, x: 100, status: 'P' },
    ]
    const registry = [
      { name: '1', y: 100, x: 100 },
      { name: '3', y: 110, x: 110 },
      { name: '4', y: 110, x: 100 },
    ]
    const pts = digitizedPoints({ ...record, metadata: { ...record.metadata, cape_lo_points: legitUnregistered } }, registry)
    expect(pts.map((pt) => pt.id)).toEqual(['1', 'NEW', '3', '4'])
  })
})

describe('vertexLabelPoints', () => {
  it('builds beacon-named points from metadata.vertices and the ring', () => {
    const pts = vertexLabelPoints({
      ...record,
      metadata: { vertices: [{ id: '1463A' }, { id: '1462A' }, { id: '1463C' }, { id: '1464C' }] },
    } as any)
    expect(pts.map((p) => p.id)).toEqual(['1463A', '1462A', '1463C', '1464C'])
    expect(pts[0]).toMatchObject({ y: 100, x: 100 })
  })

  it('returns [] without vertices labels', () => {
    expect(vertexLabelPoints(record)).toEqual([])
  })
})

describe('parcelFromBaseRecord', () => {
  it('prefers the digitized beacon sequence (single source of truth)', async () => {
    const rec = { ...record, metadata: { ...record.metadata, cape_lo_points: digitized } }
    const p = await parcelFromBaseRecord(rec, [])
    expect(p).not.toBeNull()
    expect(p!.points.map((pt) => pt.id)).toEqual(['1', '2', '3', '4'])
    expect(areaCompute).toHaveBeenCalledWith(
      expect.objectContaining({
        points: expect.arrayContaining([
          { y: 100, x: 100, id: '1', name: '1' },
          { y: 100, x: 110, id: '2', name: '2' },
        ]),
        includeResiduals: true,
      })
    )
    expect(p!.areaResult).toBe(areaResponse)
  })

  it('stale stored points fall through to geometry matching', async () => {
    const rec = { ...record, metadata: { ...record.metadata, cape_lo_points: digitized.slice(0, 2) } }
    const coordinatePoints = [
      { name: 'MP1', y: 100, x: 100 },
      { name: 'MP2', y: 100, x: 110 },
      { name: 'MP3', y: 110, x: 110 },
      { name: 'MP4', y: 110, x: 100 },
    ]
    const p = await parcelFromBaseRecord(rec, coordinatePoints)
    expect(p!.points.map((pt) => pt.id)).toEqual(['MP1', 'MP2', 'MP3', 'MP4'])
  })

  it('returns null when no points are derivable', async () => {
    const p = await parcelFromBaseRecord({ ...record, geom: null } as any, [])
    expect(p).toBeNull()
  })

  it('falls back to stored area when areaCompute fails', async () => {
    ;(areaCompute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const p = await parcelFromBaseRecord({ ...record, metadata: { ...record.metadata, cape_lo_points: digitized } }, [])
    expect(p!.areaResult.area.abs_m2).toBe(174)
    expect(p!.areaResult.residuals).toEqual({ edges: [{ index: 0 }] })
  })

  it('prefers metadata.vertices before spatial matching', async () => {
    const rec = {
      ...record,
      metadata: { vertices: [{ id: '1463A' }, { id: '1462A' }, { id: '1463C' }, { id: '1464C' }] },
    } as any
    const p = await parcelFromBaseRecord(rec, [])
    expect(p!.points.map((pt) => pt.id)).toEqual(['1463A', '1462A', '1463C', '1464C'])
  })
})

describe('snapshotEdgesStale', () => {
  it('is false without a registry or when edges match the registry', () => {
    expect(snapshotEdgesStale([{ from: { id: 'A', y: 1, x: 2 }, to: { id: 'B', y: 3, x: 4 } }], [])).toBe(false)
    const edges = [{ from: { id: 'A', y: 1, x: 2 }, to: { id: 'B', y: 3, x: 4 } }]
    const registry = [
      { name: 'A', y: 1, x: 2 },
      { name: 'B', y: 3, x: 4 },
    ]
    expect(snapshotEdgesStale(edges, registry)).toBe(false)
  })

  it('is true when an edge end names a beacon missing from the registry', () => {
    const edges = [{ from: { id: '87DNew', y: 1, x: 2 }, to: { id: 'B', y: 3, x: 4 } }]
    const registry = [
      { name: '87D', y: 1, x: 2 },
      { name: 'B', y: 3, x: 4 },
    ]
    expect(snapshotEdgesStale(edges, registry)).toBe(true)
  })

  it('is true when an edge end moved >0.5m in the registry', () => {
    const edges = [{ from: { id: 'A', y: 1, x: 2 }, to: { id: 'B', y: 3, x: 4 } }]
    const registry = [
      { name: 'A', y: 1.9, x: 2 },
      { name: 'B', y: 3, x: 4 },
    ]
    expect(snapshotEdgesStale(edges, registry)).toBe(true)
  })
})

describe('storedAreaResult', () => {
  it('derives display from ha/m2 thresholds', () => {
    const r = storedAreaResult(record)
    expect(r.area.abs_m2).toBe(174)
    expect(r.residuals).toEqual({ edges: [{ index: 0 }] })
    expect(r.closure).toEqual({ ratioFormatted: '1:42000' })
  })
})

describe('loadBaseMapParcels', () => {
  it('loads and normalizes every row through the shared loader', async () => {
    ;(listLandParcels as ReturnType<typeof vi.fn>).mockResolvedValue([record])
    const rows = await loadBaseMapParcels(1)
    expect(listLandParcels).toHaveBeenCalledWith(1)
    expect(rows[0].stand).toBe('1620')
    expect(rows[0].geom).toBeTruthy()
  })
})

describe('computeBaseMapStandLabels', () => {
  it('places one label at the ring centroid in Cape Lo', () => {
    const labels = computeBaseMapStandLabels([record])
    expect(labels).toEqual([{ parcelId: 7, stand: '1620', centroid: { y: 105, x: 105 } }])
  })

  it('skips parcels without a stand or geometry', () => {
    expect(computeBaseMapStandLabels([{ ...record, stand: '' }, { ...record, geom: null } as any])).toEqual([])
  })
})

describe('computeBaseMapBeaconLabels', () => {
  it('prefers digitized cape_lo_points names and aggregates shared beacons', async () => {
    const recA = { ...record, metadata: { ...record.metadata, cape_lo_points: digitized } }
    const recB = {
      ...record,
      id: 8,
      stand: '1621',
      geom: { type: 'Polygon', coordinates: [[[100, 100], [100, 90], [110, 90], [110, 100], [100, 100]]] },
      metadata: {
        ...record.metadata,
        cape_lo_points: [
          { id: '1', y: 100, x: 100, status: 'P' },
          { id: '5', y: 100, x: 90, status: 'P' },
          { id: '6', y: 110, x: 90, status: 'P' },
          { id: '4', y: 110, x: 100, status: 'P' },
        ],
      },
    }
    const labels = await computeBaseMapBeaconLabels([recA, recB], [])
    const shared = labels.find((l) => l.name === '1')
    expect(shared).toBeTruthy()
    expect(shared!.parcelIds).toEqual([7, 8])
    expect(shared!.x).toBe(100)
    expect(shared!.y).toBe(100)
    expect(labels).toHaveLength(6)
  })

  it('falls back to geometry/registry matching without digitized points', async () => {
    const coordinatePoints = [
      { name: 'MP1', y: 100, x: 100 },
      { name: 'MP2', y: 100, x: 110 },
      { name: 'MP3', y: 110, x: 110 },
      { name: 'MP4', y: 110, x: 100 },
    ]
    const labels = await computeBaseMapBeaconLabels([record], coordinatePoints)
    expect(labels.map((l) => l.name).sort()).toEqual(['MP1', 'MP2', 'MP3', 'MP4'])
  })

  it('uses vertex labels ahead of spatial matching', async () => {
    const rec = {
      ...record,
      metadata: { vertices: [{ id: '1463A' }, { id: '1462A' }, { id: '1463C' }, { id: '1464C' }] },
    } as any
    const labels = await computeBaseMapBeaconLabels([rec], [])
    expect(labels.map((l) => l.name)).toEqual(['1463A', '1462A', '1463C', '1464C'])
  })
})
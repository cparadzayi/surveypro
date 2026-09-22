/**
 * Shared base-map parcel helpers.
 *
 * The digitized map (MapLibre) is the single source of truth for the base map.
 * Servitudes, Survey Plan, and every area/consistency PDF derive their parcels
 * from the same `land_parcels` rows and through the same conversion, so they can
 * never diverge from the digital parcels:
 *
 *   1. `metadata.cape_lo_points` — the beacon sequence the digitized map saved,
 *      trusted only while it still matches the polygon ring (stale detection).
 *   2. `metadata.vertices` — beacon labels for QGIS-imported shared beacons.
 *   3. `computeCapeLoPointsFromGeometry` — on-the-fly spatial matching for
 *      geometry-only / legacy rows.
 *
 * Area & residuals are recomputed through the shared areaCompute API, so every
 * downstream stage reports identical values.
 */

import { geoJsonToCapeLoPoint } from './coordinateTransform'
import { computeCapeLoPointsFromGeometry, type CapeLoPoint } from './parcelMetadataComputer'
import { listLandParcels } from '../services/spatial'
import { areaCompute } from '../services/compute'

export interface BaseMapParcel {
  id?: string | number
  stand?: string
  designation?: string | null
  geom?: any
  geometry?: any
  area_m2?: number
  area_ha?: number
  metadata?: any
  [key: string]: any
}

export interface SurveyParcel {
  id?: string | number
  designation: string
  points: CapeLoPoint[]
  areaResult?: any
  geometry?: any
  metadata?: any
}

/** Normalize a `land_parcels` row to the shared base-map parcel shape. */
export function asBaseMapParcel(p: any): BaseMapParcel {
  return {
    ...p,
    geom: p?.geom ?? p?.geometry ?? null,
    stand: p?.stand ?? p?.designation ?? null,
    designation: p?.designation ?? p?.stand ?? null,
    area_m2: Number.isFinite(Number(p?.area_m2)) ? Number(p.area_m2) : 0,
    area_ha: Number.isFinite(Number(p?.area_ha)) ? Number(p.area_ha) : 0,
  }
}

/** Load the project base map (the digitized-parcel table) through one loader. */
export async function loadBaseMapParcels(projectId: string | number): Promise<BaseMapParcel[]> {
  const rows = await listLandParcels(projectId)
  return rows.map(asBaseMapParcel)
}

/** The digitized beacon sequence the map saved, when it still matches the ring. */
export function digitizedPoints(record: BaseMapParcel): CapeLoPoint[] {
  const stored = Array.isArray(record?.metadata?.cape_lo_points) ? record.metadata.cape_lo_points : []
  if (!stored.length) return []
  const ring = record.geom?.coordinates?.[0]
  const vertexCount = Array.isArray(ring) && ring.length >= 4 ? ring.length - 1 : 0
  if (vertexCount > 0 && stored.length !== vertexCount) {
    console.warn(
      `[SurveyParcels] ⚠️ Stale cape_lo_points for ${record.stand ?? record.id} ` +
        `(stored ${stored.length} vs ring ${vertexCount}) - falling back to geometry`
    )
    return []
  }
  return stored.map((pt: any) => ({
    id: pt.id,
    y: pt.y,
    x: pt.x,
    status: pt.status || 'P',
    description: pt.description || '',
  }))
}

/** Beacon-named points from QGIS `metadata.vertices` (shared beacons). */
export function vertexLabelPoints(record: BaseMapParcel): CapeLoPoint[] {
  const vertices = Array.isArray(record?.metadata?.vertices) ? record.metadata.vertices : []
  const coords = record.geom?.coordinates?.[0]
  if (!vertices.length || !Array.isArray(coords)) return []
  const points: CapeLoPoint[] = []
  vertices.forEach((vertex: any, i: number) => {
    const coord = coords[i]
    if (!coord) return
    const clp = geoJsonToCapeLoPoint(coord, vertex?.id)
    points.push({
      id: clp.id ?? String(vertex.id),
      y: clp.y,
      x: clp.x,
      status: 'P',
      description: `Beacon ${vertex.id}`,
    })
  })
  return points
}

/** DB-stored area fallback (area_m2 / area_ha + residuals from the save). */
export function storedAreaResult(record: BaseMapParcel): any {
  const areaM2 = Number(record.area_m2) || 0
  const areaHa = Number(record.area_ha) || 0
  return {
    ok: true,
    area: {
      signed_m2: areaM2,
      abs_m2: areaM2,
      meters_rounded: Number(areaM2.toFixed(2)),
      hectares_rounded: Number(areaHa.toFixed(4)),
      display: areaHa >= 1
        ? { hectares: areaHa, unit: 'ha' as const }
        : { square_meters: areaM2, unit: 'm2' as const },
    },
    centroid: { y: 0, x: 0 },
    residuals: record.metadata?.residuals || { edges: [] },
    closure: record.metadata?.closure,
  }
}

export interface BaseMapStandLabel {
  parcelId?: string | number
  stand: string
  centroid: { y: number; x: number } // Cape Lo
}

export interface BaseMapBeaconLabel {
  name: string
  y: number
  x: number
  parcelIds: (string | number)[]
}

/** Stand-centroid labels in Cape Lo, one per parcel ring. */
export function computeBaseMapStandLabels(parcels: BaseMapParcel[]): BaseMapStandLabel[] {
  const labels: BaseMapStandLabel[] = []
  for (const p of parcels) {
    if (!p.stand) continue
    const ring = p.geom?.coordinates?.[0]
    if (!Array.isArray(ring) || ring.length < 4) continue
    const pts = ring.slice(0, -1)
    if (!pts.length) continue
    const x = pts.reduce((sum, c) => sum + c[0], 0) / pts.length
    const y = pts.reduce((sum, c) => sum + c[1], 0) / pts.length
    labels.push({ parcelId: p.id, stand: p.stand, centroid: { y, x } })
  }
  return labels
}

/**
 * Vertex beacon-name labels in Cape Lo, sourced from the digitized map first
 * (`metadata.cape_lo_points` verbatim when fresh), QGIS vertex labels next, and
 * geometry matching to the coordinate registry last. Deduplicated by name at a
 * coordinate so a shared beacon cites every parcel it belongs to.
 */
export async function computeBaseMapBeaconLabels(
  parcels: BaseMapParcel[],
  coordinatePoints?: any[]
): Promise<BaseMapBeaconLabel[]> {
  const byKey = new Map<string, BaseMapBeaconLabel>()
  for (const p of parcels) {
    if (!p.geom) continue
    let pts = digitizedPoints(p)
    if (!pts.length) pts = vertexLabelPoints(p)
    if (!pts.length) pts = await computeCapeLoPointsFromGeometry(asBaseMapParcel(p), coordinatePoints)
    for (const pt of pts) {
      if (!pt.id) continue
      const key = `${pt.id}:${pt.x.toFixed(3)}:${pt.y.toFixed(3)}`
      const existing = byKey.get(key)
      if (existing) {
        if (p.id != null && !existing.parcelIds.includes(p.id)) existing.parcelIds.push(p.id)
        continue
      }
      byKey.set(key, { name: pt.id, y: pt.y, x: pt.x, parcelIds: p.id != null ? [p.id] : [] })
    }
  }
  return Array.from(byKey.values())
}

/**
 * Build a survey parcel from its base-map record. The digitized map is the
 * source of truth: `metadata.cape_lo_points` verbatim when fresh, beacon labels
 * for QGIS vertices next, on-the-fly geometry matching last. Area & residuals
 * are recomputed for a consistent comparison against every other stage.
 */
export async function parcelFromBaseRecord(
  record: BaseMapParcel,
  coordinatePoints?: any[]
): Promise<SurveyParcel | null> {
  const designation = record.stand ?? record.designation ?? String(record.id)
  const digitized = digitizedPoints(record)
  const labelled = digitized.length ? [] : vertexLabelPoints(record)
  const points = digitized.length
    ? digitized
    : labelled.length
      ? labelled
      : await computeCapeLoPointsFromGeometry(asBaseMapParcel({ ...record, stand: designation }), coordinatePoints)

  if (!points.length) {
    console.warn(`[SurveyParcels] ⚠️ No points derivable for ${designation} - skipping`)
    return null
  }

  let areaResult: any = null
  try {
    areaResult = await areaCompute({
      points: points.map((pt) => ({ y: pt.y, x: pt.x, id: pt.id, name: pt.id })),
      includeResiduals: true,
      roundMetersDecimals: 2,
      roundHectaresDecimals: 4,
    })
  } catch (error) {
    console.error(`[SurveyParcels] ❌ Failed to recompute area for ${designation}:`, error)
  }

  return {
    id: record.id ?? undefined,
    designation,
    points,
    areaResult: areaResult || storedAreaResult(record),
    geometry: record.geom ?? record.geometry ?? null,
    metadata: record.metadata ?? null,
  }
}
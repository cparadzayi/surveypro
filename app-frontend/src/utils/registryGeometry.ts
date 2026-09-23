/**
 * Registry-aware parcel geometry.
 *
 * A CSV re-import updates the coordinate registry (coordinate_points) but can
 * leave the digitized parcel geometry — and its metadata snapshots — at
 * pre-import positions. The plan/PDF generators that the Surveyor General
 * checks derive everything from the registry ("single source of truth", see
 * parcelMetadataComputer), so every other consumer must snap to it too.
 *
 * The area math here mirrors the backend `computeAreaConsistency` exactly:
 * co-ordinates are first rounded to the lodged centimetre precision (two
 * decimals, banker's) and the area then falls out of the shoelace formula, so
 * development can compare frontend figures 1:1 against /compute/area and the
 * plan PDFs.
 */

import { computeCapeLoPointsFromGeometry, type CapeLoPoint } from '@/utils/parcelMetadataComputer'
import { asBaseMapParcel } from '@/utils/surveyParcels'

/** Banker's rounding (round half to even) — Zimbabwe SGO convention. Mirrors
 *  backend `bankersRound` in app-backend/src/utils/zim-geo.js. */
export function bankersRound(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals)
  const n = value * factor
  const f = Math.floor(n)
  const r = n - f
  if (Math.abs(r - 0.5) < 1e-12) {
    // exactly half: round to even
    return (f % 2 === 0 ? f : f + 1) / factor
  }
  return Math.round(n) / factor
}

/** Signed shoelace area for a polygon of {y, x} Cape Lo points (open or closed).
 *  Mirrors backend `shoelaceAreaYX`. */
export function shoelaceAreaYX(points: Array<{ y: number; x: number }>): number {
  if (!Array.isArray(points) || points.length < 3) return 0
  const pts = points[0].y === points[points.length - 1].y && points[0].x === points[points.length - 1].x
    ? points
    : [...points, points[0]]
  let sum = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    sum += (a.y * b.x - b.y * a.x)
  }
  return 0.5 * sum // signed
}

export interface RegistrySnap {
  /** Closed outer ring in GeoJSON [Southing, Westing] order (registry co-ords). */
  ring: number[][]
  /** Per-vertex registry points (id = registry beacon name when matched). */
  points: CapeLoPoint[]
}

/**
 * Snap a parcel's outer ring to the live coordinate registry. Vertices within
 * the matching tolerance take the registry beacon's post-import co-ordinates
 * and name; unmatched vertices keep their geometry position and a sequential
 * fallback name. Returns null (caller keeps the stored ring) when the parcel
 * has no usable ring or no registry to match against.
 */
export async function snapOuterRingToRegistry(
  parcel: any,
  coordinatePoints: any[],
): Promise<RegistrySnap | null> {
  const coords = parcel?.geom?.coordinates
  const ring = Array.isArray(coords) ? coords[0] : undefined
  if (!Array.isArray(ring) || ring.length < 4) return null
  if (!Array.isArray(coordinatePoints) || coordinatePoints.length === 0) return null

  const points = await computeCapeLoPointsFromGeometry(asBaseMapParcel(parcel), coordinatePoints)
  if (!Array.isArray(points) || points.length === 0 || points.length !== ring.length - 1) return null

  const snapped = points.map(p => [p.x, p.y] as [number, number])
  snapped.push([snapped[0][0], snapped[0][1]])
  return { ring: snapped, points }
}

/**
 * Area of a GeoJSON outer ring ([Southing, Westing]) exactly as the backend
 * computes it: co-ordinates rounded to two decimals (banker's), then shoelace.
 */
export function computeRegistryAreaM2(ring: number[][]): number {
  const pts = ring.slice(0, -1).map(([southing, westing]) => ({
    y: bankersRound(Number(westing) || 0, 2),
    x: bankersRound(Number(southing) || 0, 2),
  }))
  return Math.abs(shoelaceAreaYX(pts))
}

/**
 * Registry-derived area for a parcel, falling back to the stored `area_m2`
 * when there is nothing to snap against.
 */
export async function computeParcelRegistryArea(parcel: any, coordinatePoints: any[]): Promise<number> {
  const snap = await snapOuterRingToRegistry(parcel, coordinatePoints)
  if (snap) return computeRegistryAreaM2(snap.ring)
  return Number(parcel?.area_m2) || 0
}
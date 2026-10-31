/**
 * The sheets a stored cut divides the outside figure into, for any screen that
 * needs them (the Plan to render them, the Boundaries screens to tag them).
 * One derivation, so every screen sees the same parts.
 */
import { buildSheetPayloads, type StandInput, type SheetPayload } from '@/utils/sheetPayloads'
import { readCuts } from '@/utils/cutStorage'
import type { PartyWallStatementRow } from '@/utils/servitudeStatement'

export interface StoredSheetsInput {
  /** The parcel designated Outside Figure, or null. */
  outsideFigureParcel: any | null
  /** Its Cape Lo ring ({y,x,id}); null when it has none. */
  outsideFigureRing: Array<{ x: number; y: number; id?: string }> | null
  parcels: any[]
  servitudeRows?: PartyWallStatementRow[]
  /** Names already in use, so a point the cut creates avoids them. */
  takenNames?: string[]
}

/** undefined when there is no stored cut, or it no longer splits cleanly (the plan
 *  then renders as one sheet: the cut is the surveyor's to redraw). */
export function deriveStoredSheets(input: StoredSheetsInput): SheetPayload[] | undefined {
  const { outsideFigureParcel, outsideFigureRing } = input
  const storedCuts = outsideFigureParcel ? readCuts(outsideFigureParcel.metadata) : []
  if (!outsideFigureParcel || !outsideFigureRing || storedCuts.length === 0) return undefined
  const ring = outsideFigureRing.map(p => ({ y: p.y, x: p.x, id: p.id }))
  const stands: StandInput[] = []
  for (const p of input.parcels) {
    if (p.id === outsideFigureParcel.id) continue
    const pts = ((p.metadata?.cape_lo_points as any[]) || [])
      .map((pt: any) => ({ y: Number(pt.y), x: Number(pt.x) }))
      .filter((pt: any) => Number.isFinite(pt.y) && Number.isFinite(pt.x))
    if (pts.length < 3) continue
    // The SAME property set the single-sheet exporter puts on a parcel: the schedule
    // of areas draws its Area column from `area_m2`.
    stands.push({
      name: p.designation || p.stand || String(p.id),
      ring: pts,
      stand: p.stand,
      area_m2: p.area_m2,
      area_ha: Number.isFinite(Number(p.area_m2)) ? (Number(p.area_m2) / 10000).toFixed(4) : undefined,
      description: p.description || '',
      id: p.id,
      isOutsideFigure: false,
    })
  }
  // A stored cut is an ENHANCEMENT: whatever goes wrong deriving it, the surveyor
  // still gets a single-sheet plan.
  try {
    const built = buildSheetPayloads({
      ring,
      polylines: storedCuts.map(c => c.vertices),
      stands,
      servitudeRows: input.servitudeRows,
      takenNames: input.takenNames,
    })
    if (built.ok) return built.sheets
    console.warn('[storedSheets] Stored cut no longer splits cleanly; rendering as one sheet:', built.error)
  } catch (err: any) {
    console.warn('[storedSheets] Could not derive sheets from the stored cut; rendering as one sheet:', err?.message ?? err)
  }
  return undefined
}

/** The parcel designated the Outside Figure, by any of the markers the digitizer and
 *  older imports have used. */
export function findOutsideFigureParcel(parcels: any[]): any | null {
  return parcels.find(p =>
    p.designation?.toLowerCase().includes('outside figure') ||
    p.designation?.toLowerCase().includes('outside_figure') ||
    p.designation?.toLowerCase().includes('outsidefigure') ||
    p.stand?.toLowerCase().includes('outside figure') ||
    p.stand?.toLowerCase().includes('outside_figure') ||
    p.stand?.toLowerCase() === 'of' ||
    p.description?.toLowerCase().includes('outside figure') ||
    p.metadata?.isOutsideFigure === true ||
    p.metadata?.is_outside_figure === true ||
    p.is_outside_figure === true,
  ) ?? null
}

/** The Outside Figure's Cape Lo ring ({x,y,id}), closed, or null. The point's own
 *  name rides along: the figure's vertices are real, named beacons. */
export function outsideFigureCapeLoRing(parcel: any | null): Array<{ x: number; y: number; id?: string }> | null {
  const points = parcel?.metadata?.cape_lo_points
  if (!Array.isArray(points) || points.length < 3) return null
  const ring = points
    .map((p: any) => ({ x: Number(p.x), y: Number(p.y), id: p.id != null ? String(p.id) : undefined }))
    .filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (ring.length < 3) return null
  const first = ring[0], last = ring[ring.length - 1]
  if (first.x !== last.x || first.y !== last.y) ring.push({ x: first.x, y: first.y, id: first.id })
  return ring
}

/**
 * Choose the diagram subject parcel from the fill-layer features hit by a map
 * click. MapLibre's `queryRenderedFeatures` returns hits top-to-bottom, but the
 * topmost hit is wrong for diagram picking:
 *   1. The Outside Figure is a large polygon enclosing the stands, so it is hit
 *      almost everywhere — it must never be selected.
 *   2. When real stands overlap, the surveyor means the *specific* (smaller)
 *      parcel, not whichever happened to be painted last.
 * So we drop the Outside Figure and pick the smallest-area candidate, breaking
 * ties by render order (first hit wins).
 */
export interface PickableParcel {
  id: string | number
  area_m2?: number
}

/** Extract the parcel id from a `parcel-<id>-fill` layer id (ids may contain dashes). */
export function parseParcelLayerId(layerId: string): string | null {
  const m = /^parcel-(.+)-fill$/.exec(layerId)
  return m ? m[1] : null
}

export function pickDiagramSubjectId(
  hitLayerIds: string[],
  parcels: PickableParcel[],
  outsideFigureId: string | number | null,
): string | number | null {
  const ofKey = outsideFigureId == null ? null : String(outsideFigureId)
  const byId = new Map(parcels.map(p => [String(p.id), p]))

  const candidates: PickableParcel[] = []
  for (const layerId of hitLayerIds) {
    const parsed = parseParcelLayerId(layerId)
    if (parsed == null) continue
    if (ofKey != null && parsed === ofKey) continue
    const parcel = byId.get(parsed)
    if (parcel) candidates.push(parcel)
  }
  if (candidates.length === 0) return null

  // Smallest measured area wins; unknown/zero area is deprioritised so a real
  // small stand is preferred. Ties keep the first (topmost) hit.
  let best = candidates[0]
  let bestArea = Number(best.area_m2) || Infinity
  for (let i = 1; i < candidates.length; i++) {
    const area = Number(candidates[i].area_m2) || Infinity
    if (area < bestArea) {
      best = candidates[i]
      bestArea = area
    }
  }
  return best.id
}

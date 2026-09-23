/**
 * The parcels a survey designation may state.
 *
 * A survey designation (the running title on the general plan, work plan,
 * cover letter, coordinate list and dispensation certificate) states the land
 * that was surveyed into the Area & Consistency data. Two parcels are fixed
 * exceptions and must never appear in a designation, no matter what data they
 * carry:
 *
 *  - the remainder of a subdivided portion, conventionally lettered REM,
 *    REM./ or REMAINDER. It is not a lodged stand; the sheet draws it as the
 *    remaining extent and the figure description states it instead.
 *  - the computing Outside Figure pseudo-parcel, which exists only to
 *    encapsulate the new stands.
 *
 * One filtered list feeds every designation document so the cover letter, the
 * coordinate list and the plan title blocks cannot drift apart — one saying
 * "STANDS 403 - 405" while another quietly appends ", REM".
 *
 * The remainder matcher mirrors the anchored regex in workingPlanSpec, so the
 * work plan's remaining-extent handling and the designation list can never
 * disagree about which parcel is the remainder.
 */

const REMAINDER_NAME = /^(rem|rem\.|rem\.?\/|remainder|outside[\s_]*figure)$/i

/** True when the parcel is the remainder of a subdivision (or the Outside
 *  Figure pseudo-parcel that stands in for one), by designation or stand. */
export function isRemainderParcel(p: any): boolean {
  return [p?.designation, p?.stand].some((v) => REMAINDER_NAME.test(String(v ?? '').trim()))
}

/** True when the parcel name mentions the computing Outside Figure pseudo-parcel. */
export function isOutsideFigureParcel(p: any): boolean {
  const joined = `${String(p?.stand ?? '')} ${String(p?.designation ?? '')}`.trim()
  return joined.toLowerCase().includes('outside figure')
}

/** True when the parcel carries Area & Consistency computed data —
 *  `metadata.residuals.edges` and/or `metadata.cape_lo_points`, the keys the
 *  Area & Consistency step writes. Parcels with no `metadata` at all (e.g.
 *  schedule-row shapes that omit it) are assumed part of the survey set rather
 *  than dropped, so a paginated list can never blank its designation.
 */
export function hasAreaConsistencyData(p: any): boolean {
  const m = p?.metadata
  if (!m) return true
  return Array.isArray(m?.residuals?.edges) || Array.isArray(m?.cape_lo_points)
}

/** The stand names a designation may state, deduplicated and kept in parcel
 *  order. Only parcels in the Area & Consistency data are eligible, with the
 *  remainder and the Outside Figure excluded.
 */
export function designationStandNames(parcels: any[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const p of parcels || []) {
    const name = String(p?.stand ?? p?.designation ?? '').trim()
    if (!name) continue
    if (isOutsideFigureParcel(p)) continue
    if (isRemainderParcel(p)) continue
    if (!hasAreaConsistencyData(p)) continue
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}
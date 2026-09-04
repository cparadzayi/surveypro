export type SideRole = 'contiguous' | 'road' | 'servitude'

export interface SideAnnotation {
  side: string
  role: SideRole
  label?: string
  widthM?: number
  /** Where a road leads at each end of the side. The SG examination docket
   *  accepts "road names, widths OR destinations", and the Fifth Schedule's
   *  road sign letters the destination at each end. `From` is the side's
   *  first-letter vertex, `To` the second -- same convention as `end`. */
  destinationFrom?: string
  destinationTo?: string
  /** Set on role:'servitude' entries that are a derived mirror of a Servitude record. */
  servitudeId?: string
  /** contiguous only: which terminal(s) the abutment offset sits at.
   *  'from' = first-letter vertex (A of 'AB'), 'to' = second (B), 'both' = whole side.
   *  Absent ⇒ 'both' (back-compat with data saved before this field existed). */
  end?: 'from' | 'to' | 'both'
}

export interface SubjectSide {
  side: string
  from: string
  to: string
  a: [number, number]
  b: [number, number]
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A..Z then AA, AB… — mirrors the backend diagram letterAt(). */
export function letterAt(i: number): string {
  if (i < 26) return LETTERS[i]
  return LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]
}

/**
 * One entry per subject boundary side. Letters are assigned by ring index (matching
 * the backend deriveSubjectGeometry), so `side:'AB'` is the same edge the renderer
 * resolves. Drops a trailing closing-duplicate point. `a`/`b` carry the input ring's
 * coordinates (pass a WGS84-transformed ring to draw the map layer).
 */
export function subjectSides(ring: [number, number][]): SubjectSide[] {
  if (!Array.isArray(ring) || ring.length < 3) return []
  const first = ring[0]
  const last = ring[ring.length - 1]
  const pts = last && first && last[0] === first[0] && last[1] === first[1]
    ? ring.slice(0, -1)
    : ring.slice()
  if (pts.length < 3) return []
  const sides: SubjectSide[] = []
  for (let i = 0; i < pts.length; i++) {
    const from = letterAt(i)
    const to = letterAt((i + 1) % pts.length)
    sides.push({ side: `${from}${to}`, from, to, a: pts[i], b: pts[(i + 1) % pts.length] })
  }
  return sides
}

/** Replace the entry for `ann.side` if present, else append. One annotation per
 *  side for every role (contiguous included): a side carries a single centred label,
 *  and its `end` only controls where the abutment stub(s) are drawn. Returns a new array. */
export function upsertAnnotation(list: SideAnnotation[], ann: SideAnnotation): SideAnnotation[] {
  const out = list.filter((a) => a.side !== ann.side)
  out.push(ann)
  return out
}

/** Drop the entry for `side`. Returns a new array. */
export function removeAnnotation(list: SideAnnotation[], side: string): SideAnnotation[] {
  return list.filter((a) => a.side !== side)
}

/** The list for a subject id (string or number), or [] (incl. null id). */
export function annotationsForSubject(
  map: Record<string, SideAnnotation[]>,
  subjectId: string | number | null,
): SideAnnotation[] {
  if (subjectId == null) return []
  return map?.[String(subjectId)] ?? []
}

/** New map with `subjectId` set to `list` (immutable). */
export function withSubjectAnnotations(
  map: Record<string, SideAnnotation[]>,
  subjectId: string | number,
  list: SideAnnotation[],
): Record<string, SideAnnotation[]> {
  return { ...map, [String(subjectId)]: list }
}

/** Coerce a loaded value into a per-subject map: drop non-array entries; {} if not an object. */
export function hydrateAnnotationsMap(raw: unknown): Record<string, SideAnnotation[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, SideAnnotation[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v as SideAnnotation[]
  }
  return out
}

/** Clamp of the scalar projection of `p` onto segment `pa→pb`, as t ∈ [0,1] from pa.
 *  Points are screen-space [x, y]. Degenerate (zero-length) segment returns 0. */
export function fractionAlongSide(
  pa: [number, number],
  pb: [number, number],
  p: [number, number],
): number {
  const dx = pb[0] - pa[0], dy = pb[1] - pa[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return 0
  const t = ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / len2
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Map a click fraction to a contiguous `end`: outer thirds → nearest terminal,
 *  middle third → both. Boundaries (1/3, 2/3) fall in the middle band. */
export function endFromFraction(t: number): 'from' | 'to' | 'both' {
  if (t < 1 / 3) return 'from'
  if (t > 2 / 3) return 'to'
  return 'both'
}

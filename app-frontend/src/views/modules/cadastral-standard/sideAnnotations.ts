export type SideRole = 'contiguous' | 'road' | 'servitude'

export interface SideAnnotation {
  side: string
  role: SideRole
  label?: string
  widthM?: number
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

/** Replace the entry for `ann.side` if present, else append. Returns a new array. */
export function upsertAnnotation(list: SideAnnotation[], ann: SideAnnotation): SideAnnotation[] {
  const out = list.filter((a) => a.side !== ann.side)
  out.push(ann)
  return out
}

/** Drop the entry for `side`. Returns a new array. */
export function removeAnnotation(list: SideAnnotation[], side: string): SideAnnotation[] {
  return list.filter((a) => a.side !== side)
}

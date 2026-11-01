/** The surveyor's name for a point the cut creates, held with the point's own coordinates. */
export interface CutPointName {
  y: number
  x: number
  name: string
}

export interface StoredCut {
  vertices: Array<{ y: number; x: number }>
  /**
   * Names the surveyor gave to points of this cut (where it meets the figure, or a bend in it). Keyed by
   * coordinate rather than index: the coordinates are rounded once when the cut is drawn, so they identify
   * the point however the sheets are re-derived. A point with no entry takes the automatic C1, C2, ...
   */
  pointNames?: CutPointName[]
}

function isCutPointName(n: unknown): n is CutPointName {
  if (typeof n !== 'object' || n === null) return false
  const v = n as { y?: unknown; x?: unknown; name?: unknown }
  return isFiniteLoPoint(n) && typeof v.name === 'string' && v.name.trim() !== ''
}

function isFiniteLoPoint(p: unknown): p is { y: number; x: number } {
  if (typeof p !== 'object' || p === null) return false
  const v = p as { y?: unknown; x?: unknown }
  return typeof v.y === 'number' && Number.isFinite(v.y) && typeof v.x === 'number' && Number.isFinite(v.x)
}

function isStoredCut(c: unknown): c is StoredCut {
  if (typeof c !== 'object' || c === null) return false
  const v = (c as { vertices?: unknown }).vertices
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    v.every((p) => isFiniteLoPoint(p))
  )
}

/**
 * A cut must survive a page reload and the renderers read it. Spec Decision 10
 * is emphatic that sheet numbers are DERIVED, never stored -- and the same
 * reasoning applies here: store the cut the surveyor drew and nothing computed
 * from it. Parts, sheet numbers, letters and created-point names are all
 * re-derived, so they can never go stale against the figure.
 *
 * Metadata is stored JSON arriving from a database, so it can be anything. A
 * malformed cut must never stop a plan being generated: invalid entries are
 * dropped, not thrown.
 */
export function readCuts(projectMetadata: unknown): StoredCut[] {
  if (typeof projectMetadata !== 'object' || projectMetadata === null) return []
  const figureCuts = (projectMetadata as { figureCuts?: unknown }).figureCuts
  if (!Array.isArray(figureCuts)) return []
  return figureCuts.filter(isStoredCut).map((c) => {
    const names = (c as { pointNames?: unknown }).pointNames
    const valid = Array.isArray(names) ? names.filter(isCutPointName).map((n) => ({ y: n.y, x: n.x, name: n.name.trim() })) : []
    return valid.length > 0 ? { vertices: c.vertices, pointNames: valid } : { vertices: c.vertices }
  })
}

export function writeCuts(projectMetadata: object, cuts: StoredCut[]): object {
  return { ...projectMetadata, figureCuts: cuts }
}
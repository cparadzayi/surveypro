export interface StoredCut {
  vertices: Array<{ y: number; x: number }>
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
  return figureCuts.filter(isStoredCut)
}

export function writeCuts(projectMetadata: object, cuts: StoredCut[]): object {
  return { ...projectMetadata, figureCuts: cuts }
}
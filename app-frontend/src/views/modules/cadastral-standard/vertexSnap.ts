/**
 * Vertex drag-to-snap: the whole feature's decision logic, with no MapLibre and no
 * Vue in it so it can be unit-tested (this repo has no component-mounting harness).
 *
 * A drag is a RE-REFERENCE, never a coordinate change. The dragged vertex's entry is
 * replaced by the snap target's stored { id, y, x, status, description }, copied
 * verbatim; the cursor only selects a target, it never supplies coordinates. See
 * docs/superpowers/specs/2026-09-10-vertex-drag-snap-design.md decision 1.
 */

/** A point a dragged vertex may be dropped onto. Coordinates are Cape Lo, verbatim. */
export interface SnapCandidate {
  /** Beacon name — the value stored as cape_lo_points[].id. Unique per project. */
  id: string
  y: number
  x: number
  status?: string
  description?: string
  /** 'parcel-vertex' means there is no coordinate_points row to cross-check against. */
  source: 'coordinate-point' | 'parcel-vertex'
}

/** One cape_lo_points entry, as stored in land_parcels.metadata. */
export interface VertexPoint {
  id: string
  y: number
  x: number
  status?: string
  description?: string
}

/** A parcel as the cascade sees it: a DB id, a name for messages, and its ring. */
export interface CascadeParcel {
  id: number
  designation: string
  points: VertexPoint[] | null | undefined
}

export interface SnapIndex {
  /** Every snappable point, one per name. */
  candidates: SnapCandidate[]
  /** Names held by BOTH a coordinate point and a parcel vertex, further apart than the tolerance. */
  divergent: Array<{ id: string; distanceM: number }>
}

/** A screen-space point, in CSS pixels. Matches MapLibre's Point. */
export interface ScreenPoint {
  x: number
  y: number
}

export interface CascadeWrite {
  parcelId: number
  designation: string
  points: VertexPoint[]
}

export interface CascadeBlocker {
  designation: string
  reason: string
}

export interface CascadePlan {
  writes: CascadeWrite[]
  blockers: CascadeBlocker[]
}

/**
 * Snap radius, in SCREEN PIXELS rather than ground metres. A pixel radius is what
 * makes the gesture honest: at any zoom the surveyor can see what they are about to
 * hit. Precision is unaffected — the committed numbers are the target's own.
 */
export const SNAP_RADIUS_PX = 12

/** Past this, a name's two copies disagree. Same figure repairParcelBeaconNames re-matches on. */
const DIVERGENCE_TOLERANCE_M = 0.5

function coord(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Normalise one raw entry, or null when it has no name or no usable coordinates. */
function readVertex(raw: any): VertexPoint | null {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  const y = coord(raw?.y)
  const x = coord(raw?.x)
  if (!id || y === null || x === null) return null
  return { id, y, x, status: raw.status, description: raw.description }
}

/**
 * Candidate set = project coordinate points ∪ every saved parcel's vertices, keyed by
 * name, coordinate_points winning where a name is in both. A parcel-only name stays a
 * legal target but is badged, because it cannot be cross-checked against a beacon row.
 */
export function buildSnapIndex(coordinatePoints: any[], parcels: CascadeParcel[]): SnapIndex {
  const byName = new Map<string, SnapCandidate>()
  const divergent: Array<{ id: string; distanceM: number }> = []
  const reported = new Set<string>()

  for (const raw of coordinatePoints || []) {
    const point = readVertex(raw)
    if (!point) continue
    byName.set(point.id, { ...point, source: 'coordinate-point' })
  }

  for (const parcel of parcels || []) {
    const points = Array.isArray(parcel?.points) ? parcel.points : []
    for (const raw of points) {
      const point = readVertex(raw)
      if (!point) continue
      const existing = byName.get(point.id)
      if (!existing) {
        byName.set(point.id, { ...point, source: 'parcel-vertex' })
        continue
      }
      // coordinate_points wins. A parcel copy that disagrees is REPORTED, so the UI
      // can warn, rather than silently preferring one set of numbers over the other.
      if (existing.source !== 'coordinate-point' || reported.has(point.id)) continue
      const distanceM = Math.hypot(point.y - existing.y, point.x - existing.x)
      if (distanceM > DIVERGENCE_TOLERANCE_M) {
        divergent.push({ id: point.id, distanceM })
        reported.add(point.id)
      }
    }
  }

  return { candidates: Array.from(byName.values()), divergent }
}

/**
 * Candidates the edited parcel may legally snap to: everything it does not already
 * list. Excluding every one of its own vertices subsumes excluding the dragged one,
 * which is why no vertex index is needed here.
 */
export function eligibleCandidates(index: SnapIndex, parcel: CascadeParcel): SnapCandidate[] {
  const used = new Set<string>()
  for (const raw of Array.isArray(parcel?.points) ? parcel.points : []) {
    const point = readVertex(raw)
    if (point) used.add(point.id)
  }
  return (index?.candidates || []).filter(c => !used.has(c.id))
}

/**
 * The candidate under the cursor, or null past the radius.
 *
 * `project` is injected (it is `map.project` in the view) so this module stays
 * map-free and testable. Strictly nearest, unlike findBeaconNameBySpatialMatch,
 * which returns the FIRST point under its tolerance (utils/beaconNameMatch.ts:20).
 */
export function nearestCandidate(
  candidates: SnapCandidate[],
  cursorPx: ScreenPoint,
  project: (candidate: SnapCandidate) => ScreenPoint | null | undefined,
  radiusPx: number = SNAP_RADIUS_PX
): SnapCandidate | null {
  let best: SnapCandidate | null = null
  let bestD2 = Infinity
  for (const candidate of candidates || []) {
    const pt = project(candidate)
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue
    const dx = pt.x - cursorPx.x
    const dy = pt.y - cursorPx.y
    const d2 = dx * dx + dy * dy
    if (d2 < bestD2) {
      bestD2 = d2
      best = candidate
    }
  }
  return best !== null && bestD2 <= radiusPx * radiusPx ? best : null
}

/**
 * Replace points[index] with the candidate's own stored values. Pure.
 *
 * In place, by index: delete-then-append would rotate the ring and change the
 * traverse order areaCompute builds its residuals and edge list from (decision 2).
 * The candidate's fields are copied verbatim and the replaced vertex's fields are
 * dropped — carrying the old description over would attach it to a different beacon.
 */
export function applySubstitution(
  points: VertexPoint[],
  index: number,
  candidate: SnapCandidate
): VertexPoint[] {
  if (!Array.isArray(points) || index < 0 || index >= points.length) {
    throw new RangeError(
      `applySubstitution: index ${index} is out of range for ${Array.isArray(points) ? points.length : 0} vertices`
    )
  }
  const next = points.slice()
  next[index] = {
    id: candidate.id,
    y: candidate.y,
    x: candidate.x,
    status: candidate.status,
    description: candidate.description,
  }
  return next
}

/**
 * The pre-flight. Decides, before anything is written, whether every parcel sharing
 * the dragged beacon can take the substitution.
 *
 * All-or-nothing: any blocker means zero writes. A parcel left behind is exactly the
 * non-coincident boundary this feature exists to prevent (decisions 5 and 6).
 */
export function planCascade(
  fromName: string,
  candidate: SnapCandidate,
  affected: CascadeParcel[]
): CascadePlan {
  const writes: CascadeWrite[] = []
  const blockers: CascadeBlocker[] = []

  // Dropping a vertex back onto itself is a no-op, not an error. The caller reads
  // "no writes and no blockers" as a cancel.
  if (!candidate?.id || candidate.id === fromName) return { writes, blockers }

  for (const parcel of affected || []) {
    const designation = parcel?.designation || `parcel ${parcel?.id}`

    const raw = Array.isArray(parcel?.points) ? parcel.points : null
    if (!raw || raw.length === 0) {
      blockers.push({ designation, reason: 'its stored vertex list (cape_lo_points) is missing or unreadable' })
      continue
    }

    const read = raw.map(readVertex)
    if (read.some(p => p === null)) {
      blockers.push({ designation, reason: 'it holds a vertex with no name or unusable coordinates' })
      continue
    }
    const points = read as VertexPoint[]

    if (points.length < 3) {
      blockers.push({ designation, reason: `it lists only ${points.length} vertices — a parcel needs at least 3` })
      continue
    }

    const index = points.findIndex(p => p.id === fromName)
    if (index === -1) {
      blockers.push({ designation, reason: `it no longer lists beacon "${fromName}"` })
      continue
    }

    if (points.some((p, i) => i !== index && p.id === candidate.id)) {
      blockers.push({
        designation,
        reason: `it already uses beacon "${candidate.id}" — substituting would list the same corner twice`,
      })
      continue
    }

    writes.push({ parcelId: parcel.id, designation, points: applySubstitution(points, index, candidate) })
  }

  return blockers.length > 0 ? { writes: [], blockers } : { writes, blockers }
}

/** What actually happened when the plan was executed, parcel by parcel. */
export interface CascadeOutcome {
  /** Designations written successfully. */
  written: string[]
  /** Designations that were not written, with why. */
  failed: Array<{ designation: string; message: string }>
}

/**
 * The blocking-dialog text for a cascade that did not fully succeed, or null when it
 * did. Lives here rather than in the view so the wording is tested.
 *
 * Each parcel is its own PUT and there is no cross-parcel transaction (a batch
 * endpoint is deliberately out of scope this pass). If a write fails after at least
 * one succeeded, the boundaries are now inconsistent and the surveyor must be told in
 * exactly those terms.
 */
export function describeCascadeOutcome(outcome: CascadeOutcome): string | null {
  const failed = outcome?.failed ?? []
  if (failed.length === 0) return null

  const written = outcome?.written ?? []
  const lines = failed.map(f => `  • ${f.designation} — ${f.message}`).join('\n')

  if (written.length === 0) {
    return (
      `No parcel was updated.\n\n` +
      `The drag could not be applied to:\n${lines}\n\n` +
      `Nothing was written, so the boundaries are unchanged.`
    )
  }

  return (
    `PARTIAL UPDATE — the shared boundary is now inconsistent.\n\n` +
    `Updated (${written.length}): ${written.join(', ')}\n` +
    `NOT updated (${failed.length}):\n${lines}\n\n` +
    `Those parcels no longer share the same corner. Re-run the same drag to finish it, ` +
    `or fix the parcels above before generating any plan from this record.`
  )
}

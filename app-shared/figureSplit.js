/**
 * Splitting the primary outside figure into the parts that become sheets.
 *
 * Every point here is { y, x } in Lo metres -- y easting, x southing -- the same
 * shape a coordinate_points row carries. The outputs become Coordinate List
 * rows, so there is deliberately no conversion at this boundary.
 *
 * See docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md
 */

/** Perpendicular projection of p onto segment a-b, clamped to the segment. */
export function projectOnSegment(a, b, p) {
  const dy = b.y - a.y
  const dx = b.x - a.x
  const len2 = dy * dy + dx * dx
  let t = len2 === 0 ? 0 : ((p.y - a.y) * dy + (p.x - a.x) * dx) / len2
  if (t < 0) t = 0
  if (t > 1) t = 1
  const point = { y: a.y + t * dy, x: a.x + t * dx }
  const ey = p.y - point.y
  const ex = p.x - point.x
  return { point, t, distance: Math.sqrt(ey * ey + ex * ex) }
}

/**
 * Where two segments meet, or null. Collinear overlap returns null: a cut that
 * runs ALONG a boundary edge is not a crossing of it, and treating it as one
 * would let a cut enter and leave at the same place.
 *
 * Contact AT an endpoint counts -- the parameter bounds are inclusive, so a
 * T-junction, and a touch exactly on a ring vertex, both return that point
 * rather than null. This is deliberate and load-bearing in two directions:
 *
 *   A cut is MEANT to end on the boundary, by snapping to an outside-figure
 *   point or by crossing out of the figure. `interiorStaysInside` allows that
 *   only because the touch is reported and it can then see the hit is at the
 *   cut's own first or last vertex.
 *
 *   An INTERIOR segment touching the ring is a violation, and the touch a real
 *   cut produces is most often exactly on a ring vertex. Excluding endpoints
 *   would return null for BOTH edges meeting at that vertex, so the violation
 *   would be missed and a bad cut accepted.
 *
 * Every caller uses the result as an existence test rather than a count, so a
 * vertex touch reporting against both of its adjacent edges costs nothing.
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1y = p2.y - p1.y, d1x = p2.x - p1.x
  const d2y = p4.y - p3.y, d2x = p4.x - p3.x
  const denom = d1y * d2x - d1x * d2y
  if (denom === 0) return null                    // parallel or collinear
  const sy = p3.y - p1.y, sx = p3.x - p1.x
  const t = (sy * d2x - sx * d2y) / denom
  const u = (sy * d1x - sx * d1y) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { y: p1.y + t * d1y, x: p1.x + t * d1x }
}

/**
 * Ray casting. A point exactly on an edge is NOT inside -- the split rule needs
 * "strictly inside", and an endpoint sits on the boundary by design. That is not
 * a property of ray casting: it comes from the explicit on-edge check below,
 * which runs against every edge, not just the one the ray happens to meet.
 *
 * `ring` is expected OPEN -- the first vertex not repeated at the end -- since
 * the loop already pairs the last vertex with the first. THIS function tolerates
 * a closed ring (the repeated vertex makes a degenerate edge that straddles
 * nothing and is skipped), but the module does not: `resolveEndpoint`, `walk`
 * and `enclosedArea` all assume open. Do not read this paragraph as a promise
 * about `splitFigure` -- it normalises its own input instead, see `openRing`.
 */
export function pointInRing(ring, p) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (onSegment(a, b, p)) return false
    const straddles = (a.x > p.x) !== (b.x > p.x)
    if (!straddles) continue
    const cut = ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y
    if (p.y < cut) inside = !inside
  }
  return inside
}

const ON_SEGMENT_EPS = 1e-9

function onSegment(a, b, p) {
  const cross = (b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y)
  if (Math.abs(cross) > ON_SEGMENT_EPS) return false
  const withinY = Math.min(a.y, b.y) - ON_SEGMENT_EPS <= p.y && p.y <= Math.max(a.y, b.y) + ON_SEGMENT_EPS
  const withinX = Math.min(a.x, b.x) - ON_SEGMENT_EPS <= p.x && p.x <= Math.max(a.x, b.x) + ON_SEGMENT_EPS
  return withinY && withinX
}

/** Spec Decision 12: a cut vertex within this of a boundary snaps onto it. */
export const SNAP_TOLERANCE_M = 0.10

/** Spec Decision 13: points the cut creates are stated to 2 dp. */
const ROUND_DP = 2
const ROUND_SCALE = 10 ** ROUND_DP

/** Spec Decision 13: points the cut creates are stated to 2 dp. Rounded once,
 *  here, so the outside-figure table, the Calculations pages and the
 *  Coordinate List cannot disagree in the last digit. */
export function roundPoint(p) {
  return { y: Math.round(p.y * ROUND_SCALE) / ROUND_SCALE, x: Math.round(p.x * ROUND_SCALE) / ROUND_SCALE }
}

/**
 * How far `roundPoint` can move a point: half a quantum on each axis, so
 * `hypot(0,005, 0,005)` -- about 7 mm at 2 dp.
 *
 * This is DERIVED from the rounding rather than chosen, because the two being
 * picked independently is what broke the module. An endpoint is projected onto
 * a boundary edge and then rounded, which lifts it off that edge -- and on a
 * skew side, often to the OUTSIDE of the figure. Any check asking "is this
 * boundary crossing the cut's own endpoint?" must therefore allow at least this
 * much, or it refuses the cut the surveyor correctly drew. It stays an order of
 * magnitude below Decision 12's 0,10 m snap, so it cannot act as a snap.
 */
const ROUNDING_SLOP_M = Math.hypot(1 / (2 * ROUND_SCALE), 1 / (2 * ROUND_SCALE))

/**
 * Put an endpoint exactly on the ring: on a vertex when it is within tolerance
 * of one, otherwise on the nearest edge.
 *
 * A snapped vertex is returned VERBATIM, not rounded. Snapping reuses an
 * existing beacon rather than creating a point, and Decision 13's 2 dp is for
 * points the cut invents. Rounding a surveyed vertex here would state it to 2 dp
 * in the part rings while the Coordinate List states it to 3 -- precisely the
 * disagreement that rounding once is meant to prevent -- and `splitFigure` puts
 * this point straight into the part ring, where a rounded copy would sit beside
 * the walk's unrounded original for the same beacon.
 *
 * Only the 'edge' result is a new point, so only it is rounded.
 */
export function resolveEndpoint(ring, p, tolerance = SNAP_TOLERANCE_M) {
  let best = null
  for (let i = 0; i < ring.length; i++) {
    const v = ring[i]
    const dy = p.y - v.y, dx = p.x - v.x
    const d = Math.sqrt(dy * dy + dx * dx)
    if (best === null || d < best.d) best = { d, i }
  }
  if (best && best.d <= tolerance) {
    return { kind: 'vertex', index: best.i, point: ring[best.i] }
  }

  let edge = null
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const r = projectOnSegment(a, b, p)
    if (edge === null || r.distance < edge.r.distance) edge = { i, r }
  }
  return { kind: 'edge', index: edge.i, point: roundPoint(edge.r.point) }
}

/**
 * The split invariant: both endpoints sit on the ring (resolveEndpoint saw to
 * that) and everything between them stays strictly inside. A polyline that
 * satisfies this crosses the boundary exactly twice, which is what makes one
 * cut yield exactly two parts.
 */
export function interiorStaysInside(ring, polyline) {
  for (let i = 1; i < polyline.length - 1; i++) {
    if (!pointInRing(ring, polyline[i])) {
      return { ok: false, reason: 'vertex-outside', at: polyline[i] }
    }
  }
  // Interior segments -- those with neither end on the boundary -- must not
  // touch the ring at all. The first and last segments legitimately end on it.
  for (let s = 0; s < polyline.length - 1; s++) {
    const a = polyline[s]
    const b = polyline[s + 1]
    const firstOrLast = s === 0 || s === polyline.length - 2
    for (let i = 0; i < ring.length; i++) {
      const r1 = ring[i]
      const r2 = ring[(i + 1) % ring.length]
      const hit = segmentIntersection(a, b, r1, r2)
      if (!hit) continue
      if (firstOrLast && (atEndpoint(hit, a) || atEndpoint(hit, b))) continue
      return { ok: false, reason: 'edge-crosses', at: hit }
    }
  }
  return { ok: true }
}

/** Numerical noise only. NOT a geometric tolerance -- see ROUNDING_SLOP_M. */
const TOUCH_EPS = 1e-6

/** Exact-to-precision equality, for comparing two already-rounded points. */
function near(p, q) {
  return Math.abs(p.y - q.y) < TOUCH_EPS && Math.abs(p.x - q.x) < TOUCH_EPS
}

/**
 * Whether a boundary crossing IS the cut's own endpoint `p`, allowing for the
 * fact that `p` was rounded after being projected onto the boundary.
 *
 * The slop is the geometric excursion the rounding can introduce; TOUCH_EPS is
 * the floating-point noise floor on top of it. Using `near` here -- a 1 micron
 * per-axis test against a point that rounding may have moved 7 mm -- refused
 * roughly half of all ordinary cuts on any skew boundary, and no test saw it
 * because every fixture ring was axis-aligned, where the rounding is a no-op.
 */
function atEndpoint(hit, p) {
  return Math.hypot(hit.y - p.y, hit.x - p.x) <= ROUNDING_SLOP_M + TOUCH_EPS
}

/**
 * Every stand the cut enters. Spec Decision 7: the split is refused and these
 * are named, because silently slicing a stand across two sheets is the kind of
 * error that reaches the Surveyor-General. Public places are exempt -- the cut
 * runs down a road on purpose.
 *
 * "Enters" means the cut's PATH goes through the stand, and the two tests below
 * are exhaustive for that. A connected path cannot reach a region's interior
 * without crossing its boundary, so either the path meets the ring
 * (`crossesRing`) or it began inside it (`insideRing`). There is no third way in.
 *
 * A stand merely ENCLOSED by a loop in the cut is deliberately not named. It is
 * not sliced: it lies wholly within one of the two parts, so refusing that split
 * would be a false alarm. A cut that loops like that has a different problem --
 * it self-intersects, which `splitFigure`'s ring walk cannot represent -- and
 * that belongs to the validity of the cut, not to this rule. A review read the
 * enclosing case as a detection gap; it is not one, and the test named for it
 * holds this answer in place.
 *
 * `isPublicPlace` must be exactly `true`. Truthiness would let a stringified
 * "false" out of a CSV import exempt a real stand, which fails OPEN: a sliced
 * stand reaching the Surveyor-General unannounced. Requiring the boolean fails
 * closed instead -- a road whose flag arrives as "true" is merely named, which
 * is visible and fixable.
 */
export function standsCrossedBy(polyline, stands) {
  const hit = []
  for (const stand of stands ?? []) {
    if (!stand) continue
    if (stand.isPublicPlace === true) continue

    // A stand we cannot check is not a stand we have cleared. Skipping it here
    // would make "unreadable ring" indistinguishable from "verified clear" in a
    // rule whose whole purpose is to refuse, so it is named instead.
    if (!Array.isArray(stand.ring) || stand.ring.length < 3) {
      hit.push(stand.name)
      continue
    }

    if (crossesRing(polyline, stand.ring) || insideRing(polyline, stand.ring)) {
      hit.push(stand.name)
    }
  }
  return hit
}

function crossesRing(polyline, ring) {
  for (let s = 0; s < polyline.length - 1; s++) {
    for (let i = 0; i < ring.length; i++) {
      const r1 = ring[i]
      const r2 = ring[(i + 1) % ring.length]
      if (segmentIntersection(polyline[s], polyline[s + 1], r1, r2)) return true
    }
  }
  return false
}

/** A cut that never touches the stand's edges but lies wholly within it. */
function insideRing(polyline, ring) {
  return polyline.some((p) => pointInRing(ring, p))
}

/**
 * Divide a figure in two along a cut.
 *
 * The cut's endpoints are landed on the boundary first, so the parts always
 * close against each other. Both parts carry the cut: it is the last side of
 * one and the first of the other, which is why the same new points appear in
 * both sheets' outside-figure tables, lettered independently.
 *
 * Returns `{ ok: true, parts: [ring, ring], newPoints: [{y,x}] }` or
 * `{ ok: false, error: 'self-intersecting' | 'straddles-stands' | 'interior-outside' | 'degenerate', stands?: string[], at?: {y,x} }`.
 *
 * Checked in this order: degenerate (both ends land in the same place) before
 * a `cut` even exists to check further against; self-intersecting (the cut
 * crosses itself, so `walk`'s ring construction below could not represent the
 * result even if every other rule passed) before the stands and interior
 * checks, both of which assume a simple path.
 */
export function splitFigure({ ring, polyline, stands = [], tolerance = SNAP_TOLERANCE_M }) {
  // A ring needs three vertices to enclose anything, and a cut needs two ends.
  // resolveEndpoint deliberately carries no guard for this -- a valid figure
  // always has a real ring -- so it is caught here, as a refusal rather than
  // the TypeError it used to raise from inside the projection loop.
  if (!Array.isArray(polyline) || polyline.length < 2) return { ok: false, error: 'degenerate' }
  ring = openRing(ring)
  if (ring === null || ring.length < 3) return { ok: false, error: 'degenerate' }

  const startRaw = polyline[0]
  const endRaw = polyline[polyline.length - 1]
  const start = atVertexPrecision(ring, resolveEndpoint(ring, startRaw, tolerance))
  const end = atVertexPrecision(ring, resolveEndpoint(ring, endRaw, tolerance))

  // Both ends on the same edge, or on the same vertex, cuts nothing off.
  const sameEdge = start.kind === 'edge' && end.kind === 'edge' && start.index === end.index
  const sameVertex = start.kind === 'vertex' && end.kind === 'vertex' && start.index === end.index
  if (sameEdge || sameVertex) return { ok: false, error: 'degenerate' }

  const interior = polyline.slice(1, -1).map(roundPoint)
  const cut = [start.point, ...interior, end.point]

  if (selfIntersects(cut)) return { ok: false, error: 'self-intersecting' }

  // The cut must be shown to lie within THIS figure before asking what it
  // slices. Reversed, a cut that wanders outside could be refused as
  // 'straddles-stands', naming a stand that is not in this figure at all,
  // while the real fault is that the cut left it.
  const inside = interiorStaysInside(ring, cut)
  if (!inside.ok) return { ok: false, error: 'interior-outside', at: inside.at }

  const sliced = standsCrossedBy(cut, stands)
  if (sliced.length > 0) return { ok: false, error: 'straddles-stands', stands: sliced }

  const partA = [...cut, ...walk(ring, end, start)]
  const partB = [...reversed(cut), ...walk(ring, start, end)]

  // A cut can land on two different edges and still enclose nothing -- running
  // along a boundary that carries an intermediate beacon, for instance, where
  // the two landings and the vertex between them are collinear. The kind+index
  // guard above cannot see that, because the indices differ. Area can.
  if (enclosedArea(partA) <= AREA_EPS_M2 || enclosedArea(partB) <= AREA_EPS_M2) {
    return { ok: false, error: 'degenerate' }
  }

  // The points the cut created, in the order they appear along the cut: an
  // endpoint resolved onto an EDGE is new -- the cut put it there. One resolved
  // onto a VERTEX is an existing beacon reused, not new. Every interior vertex
  // is new: interiorStaysInside already refused any interior vertex that is
  // not strictly inside the ring, and a ring vertex sits on the boundary, so
  // an interior vertex can never coincide with one.
  //
  // This is deliberately not decided by geometric comparison against the
  // ring. resolveEndpoint returns a snapped vertex UNROUNDED -- it is an
  // existing beacon, not a new point -- so comparing a rounded cut point
  // against unrounded ring vertices with a tight epsilon would misclassify a
  // real beacon, surveyed to 3 dp, as new, and hand it a `-` provenance row it
  // never earned.
  const newPoints = []
  if (start.kind === 'edge') newPoints.push(start.point)
  newPoints.push(...interior)
  if (end.kind === 'edge') newPoints.push(end.point)

  return { ok: true, parts: [partA, partB], newPoints }
}

function reversed(points) {
  return points.slice().reverse()
}

/**
 * True if any two non-adjacent segments of `points` intersect. Adjacent
 * segments share an endpoint by construction -- segment i ends exactly where
 * segment i+1 begins -- and segmentIntersection's bounds are INCLUSIVE, so a
 * naive all-pairs loop would report every adjacent pair as a "crossing" at
 * their shared point. Only non-adjacent pairs are checked.
 */
function selfIntersects(points) {
  const segments = points.length - 1
  for (let i = 0; i < segments; i++) {
    for (let j = i + 1; j < segments; j++) {
      if (j === i + 1) continue // adjacent: shares an endpoint by construction
      if (segmentIntersection(points[i], points[i + 1], points[j], points[j + 1])) return true
    }
  }
  return false
}

/**
 * The ring vertices strictly between two resolved endpoints, walking forward.
 * An endpoint on an edge leaves that edge's start vertex behind it; an endpoint
 * on a vertex is itself the boundary and is not repeated.
 */
/**
 * The ring as this module wants it: open, with the first vertex not repeated.
 *
 * A GeoJSON ring is always closed -- RFC 7946 repeats the first position -- and
 * the outside figure is stored as GeoJSON, so a closed ring is the DEFAULT thing
 * a caller has in hand. Left closed it produced a duplicated vertex and a
 * zero-length side in the part ring, which would have been lodged in the
 * outside-figure data table. Normalising here rather than refusing means no
 * caller has to remember to strip it; forgetting once is all it would take.
 *
 * The returned array holds the caller's own point OBJECTS, so identity
 * comparison against `newPoints` still works.
 */
function openRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (!first || !last) return null
  return near(roundPoint(first), roundPoint(last)) ? ring.slice(0, -1) : ring
}

/**
 * Treat an edge landing that has come out numerically ON a ring vertex as the
 * vertex it lands on.
 *
 * `projectOnSegment` clamps, so a click in the exterior wedge beyond a convex
 * corner projects onto the corner itself, and rounding to 2 dp then makes it
 * equal to that vertex whenever the ring is stated to 2 dp. Left as an edge
 * landing it breaks two things at once: `walk` starts from `index + 1`, which is
 * that same vertex, so the part ring carries the corner twice with a zero-length
 * side between; and `newPoints` reports an existing beacon as created, which
 * would lodge a `-` provenance row for a mark that was surveyed.
 *
 * This is not snapping by distance, and it does not widen Decision 12's 0,10 m.
 * It is deduplication at the precision we lodge: two points that are the same
 * number on the plan are one point, and the one that already exists wins. The
 * promoted result carries the vertex's own unrounded coordinate, exactly as a
 * snap within tolerance would.
 */
function atVertexPrecision(ring, resolved) {
  if (resolved.kind !== 'edge') return resolved
  const n = ring.length
  for (const index of [resolved.index, (resolved.index + 1) % n]) {
    if (near(roundPoint(ring[index]), resolved.point)) {
      return { kind: 'vertex', index, point: ring[index] }
    }
  }
  return resolved
}

/** Below this a part encloses nothing. A real sliver -- 10 mm by 100 m -- is a
 *  square metre, six orders of magnitude above it. */
const AREA_EPS_M2 = 1e-6

/** Shoelace, unsigned. The ring is open, so the last vertex closes to the first. */
function enclosedArea(points) {
  let twice = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    twice += points[j].y * points[i].x - points[i].y * points[j].x
  }
  return Math.abs(twice) / 2
}

function walk(ring, from, to) {
  const n = ring.length
  // A vertex endpoint IS ring[index]; an edge endpoint lies on the edge
  // leaving ring[index]. Either way, the next ring vertex forward is index + 1.
  const first = (from.index + 1) % n
  const stop = to.kind === 'vertex' ? to.index : (to.index + 1) % n
  const out = []
  for (let k = 0, i = first; k <= n; k++, i = (i + 1) % n) {
    if (i === stop) break
    out.push(ring[i])
  }
  return out
}

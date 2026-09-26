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
 * the loop already pairs the last vertex with the first. A closed ring still
 * works: the repeated vertex makes one degenerate edge, which straddles nothing
 * and is skipped.
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

/** Spec Decision 13: points the cut creates are stated to 2 dp. Rounded once,
 *  here, so the outside-figure table, the Calculations pages and the
 *  Coordinate List cannot disagree in the last digit. */
export function roundPoint(p) {
  return { y: Math.round(p.y * 100) / 100, x: Math.round(p.x * 100) / 100 }
}

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
      if (firstOrLast && (near(hit, a) || near(hit, b))) continue
      return { ok: false, reason: 'edge-crosses', at: hit }
    }
  }
  return { ok: true }
}

const TOUCH_EPS = 1e-6

function near(p, q) {
  return Math.abs(p.y - q.y) < TOUCH_EPS && Math.abs(p.x - q.x) < TOUCH_EPS
}

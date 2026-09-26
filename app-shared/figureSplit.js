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
 * Where two segments properly cross, or null. Collinear overlap returns null:
 * a cut that runs ALONG a boundary edge is not a crossing of it, and treating
 * it as one would let a cut enter and leave at the same place.
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

/** Ray casting. A point exactly on an edge is NOT inside -- the split rule
 *  needs "strictly inside", and an endpoint sits on the boundary by design. */
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

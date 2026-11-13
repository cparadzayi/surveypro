/**
 * The order a figure's data is stated in: from the NORTHMOST point, clockwise as seen on the plan (north up),
 * back to the starting point.
 *
 * Cape Lo: Y = westing, X = southing (X grows southward), so the northmost point has the SMALLEST X. A map
 * point (east, north) is (-Y, -X), a half turn of (Y, X), which keeps the sense of rotation: a ring that is
 * counter-clockwise in (Y, X) is counter-clockwise on the plan. The shoelace sum below, with Y across and X up,
 * is therefore positive for a counter-clockwise ring and negative for a clockwise one.
 *
 * Two points level with one another (within TIE_M) are both "northmost"; the western one (larger Y) starts, so
 * the walk goes east along the top.
 *
 * Pure geometry on { y, x } points; nothing here knows what the points are for. Callers reorder their own
 * records with the returned `order`.
 */
export const TIE_M = 0.005

/** Signed area of the ring in (Y across, X up): negative = clockwise on the plan. */
function signedArea(points) {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.y * b.x - b.y * a.x
  }
  return s / 2
}

/** Index of the northmost point (smallest X; the western one if level). */
export function northmostIndex(points) {
  let best = 0
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    const q = points[best]
    if (p.x < q.x - TIE_M || (Math.abs(p.x - q.x) <= TIE_M && p.y > q.y)) best = i
  }
  return best
}

/**
 * How to walk `points` so that it starts at the northmost point and runs clockwise.
 * `order` holds indices into `points`; `reversed` says the ring was counter-clockwise, so the walk runs
 * backwards through it. A ring of fewer than three points is returned as it is.
 */
export function northClockwiseOrder(points) {
  const n = Array.isArray(points) ? points.length : 0
  const identity = Array.from({ length: n }, (_, i) => i)
  if (n < 3) return { order: identity, reversed: false }
  const start = northmostIndex(points)
  const reversed = signedArea(points) > 0
  const order = identity.map((k) => (reversed ? (start - k + n) % n : (start + k) % n))
  return { order, reversed }
}

/** The points themselves, in that order. */
export function northClockwise(points) {
  const { order } = northClockwiseOrder(points)
  return order.map((i) => points[i])
}

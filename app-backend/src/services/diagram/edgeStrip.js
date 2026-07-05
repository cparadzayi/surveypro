/**
 * Outward strip quad for a boundary edge, in PDF-point space.
 *
 * Given edge p1→p2 and the figure `centroid`, returns the 4-point quad formed by
 * the edge and a parallel offset by `widthPt` on the side AWAY from the centroid,
 * so road/servitude strips sit OUTSIDE the figure. All points are `[x, y]`.
 */
export function edgeStrip(p1, p2, widthPt, centroid) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  const [cx, cy] = centroid
  const ex = x2 - x1
  const ey = y2 - y1
  const len = Math.hypot(ex, ey) || 1
  // Unit normal (perpendicular to the edge).
  let nx = -ey / len
  let ny = ex / len
  // Flip the normal if it points toward the centroid (we want outward).
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const towardWithN = (mx + nx - cx) ** 2 + (my + ny - cy) ** 2
  const withoutN = (mx - cx) ** 2 + (my - cy) ** 2
  if (towardWithN < withoutN) { nx = -nx; ny = -ny }
  return [
    [x1, y1],
    [x2, y2],
    [x2 + nx * widthPt, y2 + ny * widthPt],
    [x1 + nx * widthPt, y1 + ny * widthPt],
  ]
}

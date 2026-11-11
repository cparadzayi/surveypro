/**
 * Where to put a stand number inside an irregular parcel.
 *
 * The centroid is the right place for a convex or near-convex stand and both renderers anchor
 * there, but for a chevron, an L, a horseshoe or a stand with a notch it can fall in the notch,
 * on an edge, or beside it, and the label then sits on a boundary line or out of the stand.
 * Checking that the label's four corners are inside the polygon is not enough either: an edge can
 * cross the label between two inside corners.
 *
 * So the label is treated as the rectangle it occupies and the question asked is geometric:
 * "which positions hold this rectangle wholly inside the stand, and which of them stands furthest
 * from every boundary line?" The centroid is kept whenever it already clears every edge by
 * `minClearance`, so well-behaved stands are untouched and only the awkward ones move.
 *
 * Unit-agnostic (points in the PDF, ground metres in the DXF) and orientation-agnostic: the
 * polygon is just x/y, and the label rectangle is axis-aligned.
 */

const EPS = 1e-9

function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Distance from point (px,py) to segment a-b. */
function distPointSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 < EPS ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * How far the axis-aligned rectangle centred on (cx, cy) stands clear of the polygon's boundary,
 * or -1 when it is not wholly inside (a corner outside, or an edge cutting through it).
 */
export function rectClearance(poly, cx, cy, w, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  for (const c of corners) if (!pointInPolygon(c.x, c.y, poly)) return -1
  if (!pointInPolygon(cx, cy, poly)) return -1
  let clear = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    // an edge with an endpoint inside the rectangle, or crossing one of its sides, cuts the label
    if ((a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1) || (b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1)) return -1
    for (let k = 0; k < 4; k++) if (segmentsCross(a, b, corners[k], corners[(k + 1) % 4])) return -1
    // distance from the segment to the rectangle: no intersection, so it is the least of the
    // segment's ends to the rectangle and the rectangle's corners to the segment
    for (const p of [a, b]) {
      const dx = Math.max(x0 - p.x, 0, p.x - x1), dy = Math.max(y0 - p.y, 0, p.y - y1)
      clear = Math.min(clear, Math.hypot(dx, dy))
    }
    for (const c of corners) clear = Math.min(clear, distPointSegment(c.x, c.y, a, b))
    if (clear <= 0) return -1
  }
  return clear
}

/**
 * Find the position for a w x h label inside `polygon`.
 *
 * @param {object} args
 * @param {Array<{x:number,y:number}>} args.polygon  open ring (last vertex does not repeat the first)
 * @param {number} args.width   label width
 * @param {number} args.height  label height
 * @param {{x:number,y:number}} [args.anchor]  preferred position (the centroid); kept when it clears
 * @param {number} [args.minClearance]  clear space wanted round the label on every side
 * @param {number} [args.maxClearance]  clearance beyond this is not worth walking away from the anchor for
 * @returns {{x:number,y:number,clearance:number}|null}  null when the rectangle fits nowhere
 */
export function findLabelSpot({ polygon, width, height, anchor = null, minClearance = 0, maxClearance = Infinity }) {
  if (!Array.isArray(polygon) || polygon.length < 3 || !(width > 0) || !(height > 0)) return null

  if (anchor) {
    const c = rectClearance(polygon, anchor.x, anchor.y, width, height)
    if (c >= Math.max(minClearance, EPS)) return { x: anchor.x, y: anchor.y, clearance: c }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const span = Math.max(maxX - minX, maxY - minY)
  // grid fine enough to find a pocket a label wide, never more than ~100 steps a side
  let step = Math.max(Math.min(width, height) / 4, span / 100)
  const ax = anchor?.x ?? (minX + maxX) / 2, ay = anchor?.y ?? (minY + maxY) / 2

  let best = null
  const consider = (x, y) => {
    if (!pointInPolygon(x, y, polygon)) return   // cheap reject before the full rectangle test
    const c = rectClearance(polygon, x, y, width, height)
    if (c <= 0) return
    const score = Math.min(c, maxClearance)
    const dist = Math.hypot(x - ax, y - ay)
    if (!best || score > best.score + 1e-6 || (Math.abs(score - best.score) <= 1e-6 && dist < best.dist)) {
      best = { x, y, clearance: c, score, dist }
    }
  }
  for (let y = minY + height / 2; y <= maxY - height / 2 + EPS; y += step) {
    for (let x = minX + width / 2; x <= maxX - width / 2 + EPS; x += step) consider(x, y)
  }
  if (!best) return null
  // refine round the best cell, twice at a finer step
  for (let pass = 0; pass < 2; pass++) {
    const cx = best.x, cy = best.y
    step /= 4
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) consider(cx + dx * step, cy + dy * step)
  }
  return { x: best.x, y: best.y, clearance: best.clearance }
}

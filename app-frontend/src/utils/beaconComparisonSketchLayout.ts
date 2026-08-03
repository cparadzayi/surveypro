/**
 * Pure geometry/scale helpers for the SI 727 s.67(5) beacon comparison sketch. No jsPDF
 * import — the drawing calls live in beaconComparisonSection.ts; this module only computes
 * positions in millimetres.
 *
 * Coordinate convention matches the rest of this app (Cape Lo Y=Westing, X=Southing):
 * east-right (most-west Y maps left, most-east Y maps right), north-up (increasing
 * Southing X maps down the page in ground terms, but since jsPDF's own Y axis already
 * increases downward the same way this app's PDF pages do, mapping X directly to mmY
 * with no flip keeps "north up" — i.e. the LOWEST X value ends up at the TOP of the
 * sketch area, matching how a surveyor reads north as up on a plan).
 */

export interface ExtentM { minY: number; maxY: number; minX: number; maxX: number }
export interface AreaMm { width: number; height: number }
export interface PointMm { mmX: number; mmY: number }

const SCALE_LADDER = [100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000]

export function computeExtent(points: Array<{ y: number; x: number }>): ExtentM {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const p of points) {
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
  }
  return { minY, maxY, minX, maxX }
}

export function pickSketchScale(extent: ExtentM, areaMm: AreaMm): { denom: number; label: string } {
  const widthM = extent.maxY - extent.minY
  const heightM = extent.maxX - extent.minX
  const fits = (denom: number) =>
    (widthM / denom) * 1000 <= areaMm.width && (heightM / denom) * 1000 <= areaMm.height
  const denom = SCALE_LADDER.find(fits) ?? SCALE_LADDER[SCALE_LADDER.length - 1]
  return { denom, label: `1 : ${denom}` }
}

export function makeSketchTransform(
  extent: ExtentM, areaMm: AreaMm, denom: number, originMm: { x: number; y: number },
): (pt: { y: number; x: number }) => PointMm {
  const widthM = extent.maxY - extent.minY || 1
  const heightM = extent.maxX - extent.minX || 1
  const drawWmm = (widthM / denom) * 1000
  const drawHmm = (heightM / denom) * 1000
  const ox = originMm.x + (areaMm.width - drawWmm) / 2
  const oy = originMm.y + (areaMm.height - drawHmm) / 2
  return (pt) => ({
    mmX: ox + ((extent.maxY - pt.y) / widthM) * drawWmm,
    mmY: oy + ((pt.x - extent.minX) / heightM) * drawHmm,
  })
}

export function midpointOffset(a: PointMm, b: PointMm, offsetMm: number, side: 1 | -1 = 1): PointMm {
  const dx = b.mmX - a.mmX, dy = b.mmY - a.mmY
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len
  const mx = (a.mmX + b.mmX) / 2, my = (a.mmY + b.mmY) / 2
  return { mmX: mx + nx * offsetMm * side, mmY: my + ny * offsetMm * side }
}

export interface RectMm { x0: number; y0: number; x1: number; y1: number }

export function sampleCubicBezier(
  p0: PointMm, cp1: PointMm, cp2: PointMm, p3: PointMm, n = 10,
): PointMm[] {
  const pts: PointMm[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t
    pts.push({
      mmX: a * p0.mmX + b * cp1.mmX + c * cp2.mmX + d * p3.mmX,
      mmY: a * p0.mmY + b * cp1.mmY + c * cp2.mmY + d * p3.mmY,
    })
  }
  return pts
}

// Bows a straight a->b chord through one quadratic control point (offset perpendicular
// from the chord midpoint by bowMm, via the existing midpointOffset helper), then converts
// that quadratic control point to the two cubic control points jsPDF's curveTo() needs
// (standard quadratic->cubic conversion: cp_i = end_i + 2/3*(quadControl - end_i)).
export function curveControlPoints(
  a: PointMm, b: PointMm, bowMm: number, side: 1 | -1,
): { cp1: PointMm; cp2: PointMm } {
  const q = midpointOffset(a, b, Math.abs(bowMm), side)
  return {
    cp1: { mmX: a.mmX + (2 / 3) * (q.mmX - a.mmX), mmY: a.mmY + (2 / 3) * (q.mmY - a.mmY) },
    cp2: { mmX: b.mmX + (2 / 3) * (q.mmX - b.mmX), mmY: b.mmY + (2 / 3) * (q.mmY - b.mmY) },
  }
}

export function boxAtAnchor(anchor: PointMm, boxWidthMm: number, boxHeightMm: number): RectMm {
  return {
    x0: anchor.mmX - 1, y0: anchor.mmY - 2.2,
    x1: anchor.mmX + boxWidthMm + 1, y1: anchor.mmY + boxHeightMm + 1,
  }
}

export function pointInRect(p: PointMm, r: RectMm): boolean {
  return p.mmX >= r.x0 && p.mmX <= r.x1 && p.mmY >= r.y0 && p.mmY <= r.y1
}

export function segmentsIntersect(p1: PointMm, p2: PointMm, p3: PointMm, p4: PointMm): boolean {
  const d = (p2.mmX - p1.mmX) * (p4.mmY - p3.mmY) - (p2.mmY - p1.mmY) * (p4.mmX - p3.mmX)
  if (d === 0) return false
  const t = ((p3.mmX - p1.mmX) * (p4.mmY - p3.mmY) - (p3.mmY - p1.mmY) * (p4.mmX - p3.mmX)) / d
  const u = ((p3.mmX - p1.mmX) * (p2.mmY - p1.mmY) - (p3.mmY - p1.mmY) * (p2.mmX - p1.mmX)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

export function polylineIntersectsRect(polyline: PointMm[], r: RectMm): boolean {
  for (const p of polyline) if (pointInRect(p, r)) return true
  const corners: PointMm[] = [
    { mmX: r.x0, mmY: r.y0 }, { mmX: r.x1, mmY: r.y0 },
    { mmX: r.x1, mmY: r.y1 }, { mmX: r.x0, mmY: r.y1 },
  ]
  for (let i = 0; i < polyline.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      if (segmentsIntersect(polyline[i], polyline[i + 1], corners[j], corners[(j + 1) % 4])) return true
    }
  }
  return false
}

// Searches outward from ray a->b, starting at minOffsetMm on the preferred side, in
// stepMm increments up to maxOffsetMm, then retries the same range on the opposite side,
// for the first anchor whose text bounding box (boxWidthMm x boxHeightMm) clears every
// polyline in otherPolylines. Falls back to the minimum offset on the preferred side if
// no clear position is found (a documented best-effort limit for pathologically dense
// clusters of near-coincident edges).
export function findClearAnchor(
  a: PointMm, b: PointMm, side: 1 | -1, minOffsetMm: number,
  boxWidthMm: number, boxHeightMm: number, otherPolylines: PointMm[][],
  stepMm = 2.5, maxOffsetMm = 30,
): PointMm {
  for (const trySide of [side, (side * -1) as 1 | -1]) {
    for (let offset = minOffsetMm; offset <= maxOffsetMm; offset += stepMm) {
      const anchor = midpointOffset(a, b, offset, trySide)
      const rect = boxAtAnchor(anchor, boxWidthMm, boxHeightMm)
      if (!otherPolylines.some((poly) => polylineIntersectsRect(poly, rect))) return anchor
    }
  }
  return midpointOffset(a, b, minOffsetMm, side)
}

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

// The ground extent's drawn size in mm at a given scale denominator, independent of
// whatever area it will be centred within. Used both by makeSketchTransform (to compute
// its centring offset) and by callers that want to size a bounding box tightly around the
// content itself, rather than always filling a fixed, possibly ill-fitting area.
export function computeDrawSizeMm(extent: ExtentM, denom: number): AreaMm {
  const widthM = extent.maxY - extent.minY || 1
  const heightM = extent.maxX - extent.minX || 1
  return { width: (widthM / denom) * 1000, height: (heightM / denom) * 1000 }
}

export function makeSketchTransform(
  extent: ExtentM, areaMm: AreaMm, denom: number, originMm: { x: number; y: number },
): (pt: { y: number; x: number }) => PointMm {
  const widthM = extent.maxY - extent.minY || 1
  const heightM = extent.maxX - extent.minX || 1
  const { width: drawWmm, height: drawHmm } = computeDrawSizeMm(extent, denom)
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

export function rectsOverlap(r1: RectMm, r2: RectMm): boolean {
  return r1.x0 <= r2.x1 && r2.x0 <= r1.x1 && r1.y0 <= r2.y1 && r2.y0 <= r1.y1
}

// Searches outward from ray a->b, starting at minOffsetMm on the preferred side, in
// stepMm increments up to maxOffsetMm, then retries the same range on the opposite side,
// for the first anchor whose text bounding box (boxWidthMm x boxHeightMm) clears every
// polyline in otherPolylines AND every rectangle in otherRects (previously-placed
// annotations, when supplied). Falls back to the minimum offset on the preferred side if
// no clear position is found (a documented best-effort limit for pathologically dense
// clusters of near-coincident edges) -- deliberately the closest position to the ray it
// labels, not the farthest tried, so a mislabeled-looking annotation still sits next to
// its own ray rather than floating unattached near an unrelated one.
export function findClearAnchor(
  a: PointMm, b: PointMm, side: 1 | -1, minOffsetMm: number,
  boxWidthMm: number, boxHeightMm: number, otherPolylines: PointMm[][],
  stepMm = 2.5, maxOffsetMm = 30, otherRects: RectMm[] = [],
): PointMm {
  for (const trySide of [side, (side * -1) as 1 | -1]) {
    for (let offset = minOffsetMm; offset <= maxOffsetMm; offset += stepMm) {
      const anchor = midpointOffset(a, b, offset, trySide)
      const rect = boxAtAnchor(anchor, boxWidthMm, boxHeightMm)
      const clearOfRays = !otherPolylines.some((poly) => polylineIntersectsRect(poly, rect))
      const clearOfRects = !otherRects.some((other) => rectsOverlap(rect, other))
      if (clearOfRays && clearOfRects) return anchor
    }
  }
  return midpointOffset(a, b, minOffsetMm, side)
}

export interface SketchEdgeGeom {
  a: PointMm
  b: PointMm
  side: 1 | -1
  bowMm: number
  cp1: PointMm
  cp2: PointMm
  polyline: PointMm[]
}

export interface SketchAnnotationPlacement {
  anchor: PointMm
  rect: RectMm
}

export interface SketchLayoutResult {
  denom: number
  label: string
  boxX: number
  boxYtop: number
  boxW: number
  boxH: number
  pad: number
  positioned: Map<string, PointMm>
  edgeGeom: Array<SketchEdgeGeom | null>
  annotations: Array<SketchAnnotationPlacement | null>
  violations: number
}

const SKETCH_PAD = 16
const SKETCH_CHROME_H = 24
const SKETCH_LINE_GAP = 2.2
const SKETCH_BOX_HEIGHT = SKETCH_LINE_GAP + 3.0

// Computes the full geometry for one comparison-sketch render attempt -- beacon
// positions, per-ray curves, and every annotation's collision-avoiding placement --
// entirely independent of any real page: boxOrigin is given rather than assumed, and
// text widths come from an injected measureText callback rather than a live jsPDF
// instance. This lets a caller cheaply try several candidate page sizes (see
// docs/superpowers/plans/2026-08-04-beacon-sketch-paper-sizing.md) before committing to
// one and drawing it for real, since this function itself never draws anything.
export function computeSketchLayout(
  points: Array<{ name: string; pt: { y: number; x: number } }>,
  edgeSpecs: Array<{ from: string; to: string; line1: string; line2: string }>,
  boxOrigin: { x: number; y: number },
  maxAreaMm: AreaMm,
  measureText: (s: string) => number,
): SketchLayoutResult {
  const boxX = boxOrigin.x, boxYtop = boxOrigin.y
  const extent = computeExtent(points.map((p) => p.pt))
  const { denom, label } = pickSketchScale(extent, {
    width: maxAreaMm.width - 2 * SKETCH_PAD,
    height: maxAreaMm.height - 2 * SKETCH_PAD - SKETCH_CHROME_H,
  })
  const drawSize = computeDrawSizeMm(extent, denom)
  const boxW = Math.min(maxAreaMm.width, drawSize.width + 2 * SKETCH_PAD)
  const boxH = Math.max(60, Math.min(maxAreaMm.height, drawSize.height + 2 * SKETCH_PAD + SKETCH_CHROME_H))

  const areaMm = { width: boxW - 2 * SKETCH_PAD, height: boxH - 2 * SKETCH_PAD - SKETCH_CHROME_H }
  const originMm = { x: boxX + SKETCH_PAD, y: boxYtop + SKETCH_PAD }
  const transform = makeSketchTransform(extent, areaMm, denom, originMm)
  const positioned = new Map(points.map((p) => [p.name, transform(p.pt)]))

  const edgeGeom: Array<SketchEdgeGeom | null> = edgeSpecs.map((spec, idx) => {
    const a = positioned.get(spec.from), b = positioned.get(spec.to)
    if (!a || !b) return null
    const side: 1 | -1 = idx % 2 === 0 ? 1 : -1
    const length = Math.hypot(b.mmX - a.mmX, b.mmY - a.mmY)
    const bowMm = Math.min(4 + 3 * (idx % 3), length * 0.35)
    const { cp1, cp2 } = curveControlPoints(a, b, bowMm, side)
    return { a, b, side, bowMm, cp1, cp2, polyline: sampleCubicBezier(a, cp1, cp2, b, 10) }
  })

  let violations = 0
  const placedRects: RectMm[] = []
  const annotations: Array<SketchAnnotationPlacement | null> = edgeSpecs.map((spec, idx) => {
    const geom = edgeGeom[idx]
    if (!geom) return null
    const boxWidth = Math.max(measureText(spec.line1), measureText(spec.line2))
    const otherPolylines = edgeGeom
      .filter((g, i) => g && i !== idx)
      .map((g) => (g as SketchEdgeGeom).polyline)
    const anchor = findClearAnchor(
      geom.a, geom.b, geom.side, geom.bowMm + 1.5, boxWidth, SKETCH_BOX_HEIGHT,
      otherPolylines, 1.25, 60, placedRects,
    )
    const rect = boxAtAnchor(anchor, boxWidth, SKETCH_BOX_HEIGHT)
    const clear = !otherPolylines.some((poly) => polylineIntersectsRect(poly, rect)) &&
      !placedRects.some((other) => rectsOverlap(rect, other))
    if (!clear) violations++
    placedRects.push(rect)
    return { anchor, rect }
  })

  return { denom, label, boxX, boxYtop, boxW, boxH, pad: SKETCH_PAD, positioned, edgeGeom, annotations, violations }
}

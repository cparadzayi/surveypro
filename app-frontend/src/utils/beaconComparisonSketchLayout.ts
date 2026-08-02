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

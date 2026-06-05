/**
 * DXF beacon placer — pure functions for beacon label placement.
 * Matches the PDF generator's renderBeacons logic at pdfkitGeoPDF.js:4564
 * + helpers placeSuffixLabelPOIDirected (:5504), tryTightFullBeaconLabelPosition
 * (:400), and the splay-detection block (:4693-4711).
 *
 * Two DXF adaptations documented in the function headers:
 *   1. charWidthRatio = 0.55 used for label-width estimation (DXF can't query
 *      a rendered font width like the PDF's doc.widthOfString).
 *   2. Returned positions are the DXF baseline-left insertion point — the caller
 *      passes them directly to addText (no PDF-style width/2, height/2 subtraction).
 *
 * No DXF dependencies, no module state, no I/O. Pure math.
 */

import {
  isPointInPolygon,
  rectanglesOverlap,
  rectangleOverlapsPolygon,
  pointToLineDistance,
} from './dxfGeometry.js'

const PT_PER_MM = 1 / 0.352778   // ≈ 2.835

/**
 * PDF tier switch for beacon font size in points.
 * Matches pdfkitGeoPDF.js:4800-4807.
 */
export function pickBeaconFontSize(scaleValue) {
  if (scaleValue <= 500)  return 6
  if (scaleValue <= 1000) return 6.5
  if (scaleValue <= 2000) return 7
  return 7.5
}

/**
 * PDF logarithmic beacon radius in paper-mm, clamped to 1.8-3.0 pt.
 * Matches pdfkitGeoPDF.js:4629-4636.
 *
 *   baseRadiusMM × (1 + 0.15·log10(max(500, scaleValue) / 500))
 *   clamped to 1.8-3.0 pt
 */
export function computeBeaconRadius(scaleValue) {
  const baseRadiusMM = 0.75
  const scaleFactor  = 1 + 0.15 * Math.log10(Math.max(500, scaleValue) / 500)
  let rPt = baseRadiusMM * PT_PER_MM * scaleFactor
  rPt = Math.max(1.8, Math.min(3.0, rPt))
  return rPt * 0.352778   // back to mm
}

/**
 * Lightweight bbox collision tracker. No spatial index — linear scan suffices
 * for ~600 typical beacon labels per plan.
 *
 * API:
 *   add(rect)                    — record a placed bbox
 *   hasCollision(rect, padding)  — does any registered rect overlap (with padding gap)?
 *   size                         — getter, current count
 *   all                          — getter, shallow copy of stored rects (for tests)
 */
export function createCollisionRegistry() {
  const rects = []
  return {
    add(rect) { rects.push(rect) },
    hasCollision(rect, padding = 1) {
      for (const r of rects) {
        if (rectanglesOverlap(rect, r, padding)) return true
      }
      return false
    },
    get size() { return rects.length },
    get all() { return rects.slice() },
  }
}

/**
 * Splay-group detection — pure proximity scan.
 * Matches pdfkitGeoPDF.js:4693-4711 with the threshold floor supplied by the
 * caller (so the function is unit-agnostic; the DXF integration layer
 * converts the PDF's 18 pt floor to ground-metres via mm(18 * PT_TO_MM_GEN)).
 *
 * Threshold = max(proximityFloor, beaconRadius × 6).
 *
 * Returns a Map<beaconName, Array<{name, distance, pos}>>. The Map contains
 * an entry ONLY for beacons that have at least one close neighbor. Solo
 * beacons (no close neighbors) are absent from the map.
 *
 * Each entry holds the DIRECT close neighbors of that beacon (per-beacon
 * neighbor view, NOT the full connected component). The integration layer
 * stitches components via BFS over this map.
 */
export function groupSplayBeacons(beaconPositions, beaconRadius, proximityFloor) {
  const threshold = Math.max(proximityFloor, beaconRadius * 6)
  const map = new Map()
  for (const [name1, p1] of beaconPositions) {
    const close = []
    for (const [name2, p2] of beaconPositions) {
      if (name1 === name2) continue
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < threshold) close.push({ name: name2, distance: d, pos: p2 })
    }
    if (close.length > 0) map.set(name1, close)
  }
  return map
}

/**
 * Order a splay group's members clockwise from angle 0 around the group's
 * centroid. Integration uses this to place labels in a deterministic angular
 * sequence so each placer call sees only the already-placed members in the
 * collision registry.
 */
export function orderSplayGroupByAngle(members) {
  if (members.length <= 1) return members.slice()
  const cx = members.reduce((s, m) => s + m.pos.x, 0) / members.length
  const cy = members.reduce((s, m) => s + m.pos.y, 0) / members.length
  const withAngle = members.map(m => ({
    ...m,
    _angle: Math.atan2(m.pos.y - cy, m.pos.x - cx),
  }))
  withAngle.sort((a, b) => a._angle - b._angle)
  return withAngle.map(({ _angle, ...rest }) => rest)
}

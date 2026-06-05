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

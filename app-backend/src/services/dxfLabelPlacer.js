/**
 * DXF Per-Feature Label Placer — finds smart positions for stand
 * numbers and edge labels (distance + direction) inside parcel
 * polygons.
 *
 * Used by `dxfGenerator.js` in the parcel emission block. Algorithms
 * ported verbatim from `pdfkitGeoPDF.js:1136-1225` (stand labels),
 * `:4321-4427` (edge labels), and `:6038-6070` (fit-in-parcel utility),
 * with two DXF adaptations:
 *   1. Rendered string width is estimated via `charWidthRatio = 0.55`
 *      (DXF can't query rendered width like the PDF's doc.widthOfString).
 *   2. Returned `{x, y}` positions are the DXF baseline-left insertion
 *      point — the caller passes them directly to `addText` without
 *      any PDF-style width/2 or height/2 subtraction.
 *
 * No DXF emission inside this module — pure position-computation.
 * No module state, no I/O. Pure math.
 */

import { isPointInPolygon } from './dxfGeometry.js'

/**
 * True if a label's bounding box fits inside the polygon's bounding box
 * minus the given padding on all sides. Cheap bbox check — doesn't do
 * per-corner isPointInPolygon. Useful for fast filtering before more
 * expensive checks.
 *
 * Port of `pdfkitGeoPDF.js:6038-6070` `checkLabelFitsInParcel`.
 *
 * @param {Object} args
 * @param {number} args.centerX - Label center x
 * @param {number} args.centerY - Label center y
 * @param {number} args.labelWidth
 * @param {number} args.labelHeight
 * @param {Array<{x:number,y:number}>} args.polygon
 * @param {number} [args.padding=5] - Padding from polygon bbox edges
 * @returns {boolean}
 */
export function checkLabelFitsInParcel({
  centerX, centerY, labelWidth, labelHeight, polygon, padding = 5,
}) {
  const labelLeft   = centerX - labelWidth  / 2
  const labelRight  = centerX + labelWidth  / 2
  const labelTop    = centerY - labelHeight / 2
  const labelBottom = centerY + labelHeight / 2

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  return (
    labelLeft   >= minX + padding &&
    labelRight  <= maxX - padding &&
    labelTop    >= minY + padding &&
    labelBottom <= maxY - padding
  )
}

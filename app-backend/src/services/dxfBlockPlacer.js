/**
 * DXF Generic Block Placer — finds non-overlapping positions for blocks
 * inside a drawing zone, avoiding the outside-figure polygon and any
 * already-placed blocks (including tick-mark obstacles composed by the
 * caller).
 *
 * Used by sub-project 3-v2 (Schedule of Areas topological placement)
 * and potentially by 4d (per-feature label placement). Algorithm ported
 * verbatim from `pdfkitGeoPDF.js:9297-9530` (the schedule-multi-table
 * topology-aware placement logic), with the generator and validator
 * concerns separated for testability — algorithm rules unchanged.
 *
 * No DXF dependencies, no module state, no I/O (apart from an optional
 * caller-injected logger).
 */

import { rectangleOverlapsPolygon, rectanglesOverlap } from './dxfGeometry.js'
import { computeWhitespaceZones } from './dxfTopology.js'

/**
 * Returns the axis-aligned bounding box of a polygon plus the polygon
 * itself wrapped in one object. Consumers (the placer, 3-v2's caller
 * setup) want the bbox + polygon together for collision-detection and
 * candidate-generation pipelines.
 *
 * Deferred from sub-project 4b's spec.
 *
 * @param {Array<{x:number,y:number}>|null|undefined} polygon
 * @returns {{x:number,y:number,width:number,height:number,right:number,bottom:number,polygon:Array<{x:number,y:number}>}|null}
 *   null if polygon is missing or empty
 */
export function computeMapFeatureBounds(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    right: maxX,
    bottom: maxY,
    polygon,
  }
}

/**
 * DXF Topological Whitespace Scanner — pure functions used by
 * sub-projects 4c (block placer), 4d (per-feature label placement),
 * and 3-v2 (Schedule of Areas topological placement).
 *
 * Algorithms are byte-for-byte ports from `app-backend/src/services/
 * pdfkitGeoPDF.js` (line numbers cited per function). Interfaces are
 * normalised to a uniform `{x, y}` object shape (matching 4a's
 * dxfGeometry.js convention) and a named-argument signature for the
 * public `computeWhitespaceZones` function.
 *
 * All inputs are unit-agnostic; caller's responsibility to keep units
 * consistent within one call. When called from sub-project 4c, units
 * will be ground metres at the chosen scale.
 *
 * No DXF dependencies, no module state, no I/O. Pure math.
 *
 * Verbatim-port fidelity note: the PDF's band-flush logic in
 * `computeWhitespaceZones` uses Math.min/max reductions that pick the
 * polygon edge closest to the zone (not the most conservative one).
 * This can produce zones that overlap the polygon when the band's
 * `rightAt[y]` varies significantly. In practice the bands form only
 * where the profile is roughly constant, so the issue rarely surfaces.
 * Preserved verbatim for fidelity to the production PDF.
 */

/**
 * Walks each polygon edge and samples it at integer multiples of
 * `scanStep`, recording for each sampled coordinate the most-extreme
 * x or y at that slice. Returns 4 dictionaries:
 *   - rightAt[y] = rightmost x of polygon at horizontal slice y
 *   - leftAt[y]  = leftmost x at slice y
 *   - bottomAt[x] = bottommost y at vertical slice x (max — y increases downward in PDF convention)
 *   - topAt[x]    = topmost y at slice x (min)
 *
 * Port of `pdfkitGeoPDF.js:9021`. Algorithm verbatim; interface
 * normalised to `{x, y}` polygon vertices (the PDF version already
 * used `{x, y}` objects so no destructuring change was needed).
 *
 * CLOSED-POLYGON ASSUMPTION: iterates `polygon.length - 1` edges, so
 * the polygon must be presented closed (last vertex equals first). An
 * open polygon will silently miss its final closing edge. Same
 * convention as `isPointNearPolygon` in 4a's dxfGeometry.js.
 *
 * @param {Array<{x:number,y:number}>} polygon - Closed polygon vertices
 * @param {number} scanStep - Sampling resolution (must be > 0)
 * @returns {{rightAt: Object, leftAt: Object, bottomAt: Object, topAt: Object}}
 *   Dictionaries keyed by integer multiples of scanStep.
 */
export function computePolygonProfile(polygon, scanStep) {
  const rightAt = {}, leftAt = {}, bottomAt = {}, topAt = {}

  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = polygon[i], p2 = polygon[i + 1]

    // Horizontal profiles (rightAt / leftAt) — sample at y intervals
    if (Math.abs(p2.y - p1.y) > 0.001) {
      const yMin = Math.min(p1.y, p2.y)
      const yMax = Math.max(p1.y, p2.y)
      for (let y = Math.ceil(yMin / scanStep) * scanStep; y <= yMax; y += scanStep) {
        const t = (y - p1.y) / (p2.y - p1.y)
        const x = p1.x + t * (p2.x - p1.x)
        rightAt[y] = Math.max(rightAt[y] ?? -Infinity, x)
        leftAt[y]  = Math.min(leftAt[y]  ??  Infinity, x)
      }
    }

    // Vertical profiles (bottomAt / topAt) — sample at x intervals
    if (Math.abs(p2.x - p1.x) > 0.001) {
      const xMin = Math.min(p1.x, p2.x)
      const xMax = Math.max(p1.x, p2.x)
      for (let x = Math.ceil(xMin / scanStep) * scanStep; x <= xMax; x += scanStep) {
        const t = (x - p1.x) / (p2.x - p1.x)
        const y = p1.y + t * (p2.y - p1.y)
        bottomAt[x] = Math.max(bottomAt[x] ?? -Infinity, y)
        topAt[x]    = Math.min(topAt[x]    ??  Infinity, y)
      }
    }
  }
  return { rightAt, leftAt, bottomAt, topAt }
}

/**
 * Dividing the sheet's one inset box between several insets.
 *
 * The A4 landscape working plan has exactly one uncommitted region: the inset
 * box at the lower right. The figure panel, the title, the north arrow, the
 * area statement and the approval box account for every other part of the
 * sheet. So when a plan needs a locality diagram AND a detail of beacons that
 * plot on top of each other, they share that box.
 *
 * A single inset keeps the box exactly as it was, so the ordinary sheet -- a
 * locality diagram and no crowding -- is drawn precisely as before.
 */

/** Space between neighbouring cells, so two frames never share an edge. */
export const INSET_GUTTER_MM = 2

/**
 * Split `box` into `count` cells, filled left to right and then downward.
 *
 * The grid is the squarest that fits: ceil(sqrt(n)) columns. That gives the
 * whole box to one inset, a side-by-side pair to two, and quadrants to three or
 * four -- and keeps degrading sensibly past that rather than slicing the box
 * into unreadable ribbons.
 *
 * @param {{x0:number,y0:number,x1:number,y1:number}} box
 * @param {number} count
 * @returns {Array<{x0:number,y0:number,x1:number,y1:number}>}
 */
export function insetCells(box, count) {
  const n = Math.max(0, Math.floor(count) || 0)
  if (n === 0) return []
  if (n === 1) return [{ ...box }]

  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)

  const cellW = (box.x1 - box.x0 - INSET_GUTTER_MM * (cols - 1)) / cols
  const cellH = (box.y1 - box.y0 - INSET_GUTTER_MM * (rows - 1)) / rows

  const cells = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x0 = box.x0 + c * (cellW + INSET_GUTTER_MM)
    const y0 = box.y0 + r * (cellH + INSET_GUTTER_MM)
    cells.push({ x0, y0, x1: x0 + cellW, y1: y0 + cellH })
  }
  return cells
}

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

/** The share of the inset box's width (full height) the first inset keeps when there are several. */
export const TRIG_SHARE = 0.75

/**
 * The narrowest the column beside the trig map may be. A detail inset's station names and wedge diagram reach
 * about 27 mm across and need clear margins, so below this the details cannot be drawn to scale at all.
 * In practice this, not TRIG_SHARE, sets the trig map's width: about 70% of the box.
 */
export const MIN_SIDE_COLUMN_MM = 36

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
 * @param {{sideColumnMm?:number}} [opts]  The narrowest the column beside the first inset may be.
 * @returns {Array<{x0:number,y0:number,x1:number,y1:number}>}
 */
export function insetCells(box, count, { sideColumnMm = MIN_SIDE_COLUMN_MM } = {}) {
  const n = Math.max(0, Math.floor(count) || 0)
  if (n === 0) return []
  if (n === 1) return [{ ...box }]

  // Two to four: the first inset (the trig map, a map to scale of kilometres of ground) keeps the whole height
  // of the left column and about three quarters of the box's area (TRIG_SHARE, less what the side column needs); the others stack in the column to its
  // right. The control the survey is tied to is the inset the Surveyor General looks for, and a map to scale
  // of kilometres needs the room; a quarter of the box made it a stamp.
  if (n <= 4) {
    const w1 = Math.min((box.x1 - box.x0) * TRIG_SHARE, box.x1 - box.x0 - INSET_GUTTER_MM - sideColumnMm)
    const x1 = box.x0 + w1 + INSET_GUTTER_MM
    const rest = n - 1
    const h = (box.y1 - box.y0 - INSET_GUTTER_MM * (rest - 1)) / rest
    return [
      { x0: box.x0, y0: box.y0, x1: box.x0 + w1, y1: box.y1 },
      ...Array.from({ length: rest }, (_, k) => ({
        x0: x1, y0: box.y0 + k * (h + INSET_GUTTER_MM), x1: box.x1, y1: box.y0 + k * (h + INSET_GUTTER_MM) + h,
      })),
    ]
  }

  // Five or more: the squarest grid, ceil(sqrt(n)) columns, filled left to right and then downward.
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

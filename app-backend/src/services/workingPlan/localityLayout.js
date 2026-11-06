/**
 * Fits a measured inset's stations in their cell, at a round scale, without anything overlapping.
 *
 * An inset is a MAP: its positions are true to a stated scale, so the scale has to be a round figure the
 * caption can print (1:50 000, not 1:47 310), and the stations' places on it are fixed by the ground. All
 * that is free is which round scale, and where the whole drawing sits in its cell. So this tries the round
 * scales from the finest down, and at each looks for a position at which every station's box (its sign,
 * its designation above, its monument name below, its wedge diagram) lies inside the cell, clear of the
 * reserved rectangles (the caption, the north arrow) and of every other station's box. The first scale at
 * which one exists is the one drawn: the largest the cell allows.
 *
 * Everything is in sheet millimetres, y down, except the stations' ground coordinates (e east, n north).
 */

/** A box {x0, y0, x1, y1}. */
const overlaps = (a, b, pad = 0) =>
  a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0

/**
 * @param {object} p
 * @param {Array<{e:number, n:number, ext:{l:number, r:number, u:number, d:number}}>} p.beacons
 *   Ground position, and how far the station's inscription reaches left, right, up and down of its sign (mm).
 * @param {{x0:number,y0:number,x1:number,y1:number}} p.cell  The cell the inset is drawn in.
 * @param {Array<{x0:number,y0:number,x1:number,y1:number}>} p.reserved  Rectangles nothing may overlap.
 * @param {{e:number,n:number}} p.ic  The ground point whose place on the sheet is returned as (cx, cy).
 * @param {number[]} p.scales  Round scale denominators, any order; tried finest first.
 * @param {number} [p.margin]  Clearance kept inside the cell's frame.
 * @param {number} [p.gap]  Clearance kept between two stations' boxes.
 * @param {number} [p.reservedGap]  Clearance kept round the reserved rectangles, so a name does not touch the caption.
 * @returns {{denominator:number, cx:number, cy:number, fits:boolean}}
 *   The scale, and the sheet position (cx, cy) of `ic`. `fits` is false when no round scale gave a clean
 *   placement: the coarsest scale is returned, centred, so something is still drawn.
 */
export function layoutMeasured({ beacons, cell, reserved = [], ic, scales, margin = 1.5, gap = 0.6, reservedGap = 1.2 }) {
  const inner = { x0: cell.x0 + margin, y0: cell.y0 + margin, x1: cell.x1 - margin, y1: cell.y1 - margin }
  const centre = { cx: (cell.x0 + cell.x1) / 2, cy: (cell.y0 + cell.y1) / 2 }
  const ordered = [...scales].sort((a, b) => a - b)

  // What is wrong with a placement, weighted by how bad it is: a station off the cell is lost altogether, a
  // station on the caption or the arrow hides one of them, and two stations overlapping are merely crowded.
  const OFF_CELL = 1000, ON_RESERVED = 10, ON_STATION = 1

  /** The weighted number of faults in a placement; stops counting once it reaches `stopAt`. */
  const faults = (kk, cx, cy, stopAt = Infinity) => {
    const boxes = beacons.map((b) => {
      const x = cx + (b.e - ic.e) * kk, y = cy - (b.n - ic.n) * kk
      return { x0: x - b.ext.l, x1: x + b.ext.r, y0: y - b.ext.u, y1: y + b.ext.d }
    })
    let n = 0
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      if (b.x0 < inner.x0 || b.x1 > inner.x1 || b.y0 < inner.y0 || b.y1 > inner.y1) n += OFF_CELL
      for (const r of reserved) if (overlaps(b, r, reservedGap)) n += ON_RESERVED
      for (let j = i + 1; j < boxes.length; j++) if (overlaps(b, boxes[j], gap)) n += ON_STATION
      if (n >= stopAt) return n
    }
    return n
  }

  // The finest round scale with a clean placement, then the clean position nearest the cell's centre.
  const STEP = 2
  for (const denominator of ordered) {
    const kk = 1000 / denominator
    let best = null, bestD = Infinity
    for (let cy = inner.y0; cy <= inner.y1; cy += STEP) {
      for (let cx = inner.x0; cx <= inner.x1; cx += STEP) {
        const dist = Math.hypot(cx - centre.cx, cy - centre.cy)
        if (dist < bestD && faults(kk, cx, cy, 1) === 0) { best = { cx, cy }; bestD = dist }
      }
    }
    if (best) return { denominator, ...best, fits: true }
  }

  // No round scale gave a clean placement. Draw the one with the fewest (weighted) faults rather than none,
  // the finest among equals, and say so (`fits` false) so the caller can tell. Nothing is ever put off the cell
  // while a coarser scale would keep it on.
  let worst = { n: Infinity, denominator: ordered[ordered.length - 1], ...centre }
  for (const denominator of ordered) {
    const kk = 1000 / denominator
    for (let cy = inner.y0; cy <= inner.y1; cy += STEP * 2) {
      for (let cx = inner.x0; cx <= inner.x1; cx += STEP * 2) {
        const n = faults(kk, cx, cy, worst.n)
        if (n < worst.n) worst = { n, denominator, cx, cy }
      }
    }
  }
  return { denominator: worst.denominator, cx: worst.cx, cy: worst.cy, fits: false }
}

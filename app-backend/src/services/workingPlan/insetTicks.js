/**
 * Where an inset's labelled coordinate tick goes.
 *
 * Every inset that is drawn to a scale must carry at least one tick: a cross at a round coordinate,
 * lettered with its X and Y as on the main grid. The caption states the scale, and the tick lets the
 * reader read a coordinate off the inset and ties the inset to the sheet's own grid.
 *
 * An inset is a small cell crowded with stations and names, so the tick is not simply put where the
 * lattice says: the nodes of a round-coordinate lattice, spaced far enough apart to be legible, are tried
 * and the first with room for the cross AND both its figures (clear of the caption, the north arrow, the
 * frame and everything drawn) is taken, the one nearest the cell's middle. If no node has room the least
 * crowded is taken anyway: an inset never goes without.
 *
 * Everything is in sheet millimetres, y down, except the ground coordinates e (east) and n (north), which
 * are the survey's own: X = -n (southing) and Y = -e (westing) in the Cape Lo axes the sheet uses.
 */

/** Round lattice spacings, ground metres. */
export const TICK_INTERVALS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000,
  10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000,
]

const overlaps = (a, b, pad = 0) =>
  a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0

/** The area two boxes share (0 when they do not meet). */
const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/**
 * The box a cross and its two figures occupy, in sheet mm, for the side its figures read toward.
 * `geometry`: { arm, labelW, drop } -- the cross's half-arm plus clearance, how far the X figure runs
 * sideways, and how far the Y figure runs down.
 */
export function tickBox(x, y, side, { arm, labelW, drop }) {
  return side === 'left'
    ? { x0: x - labelW, y0: y - arm, x1: x + arm, y1: y + drop }
    : { x0: x - arm, y0: y - arm, x1: x + labelW, y1: y + drop }
}

/**
 * What a tick actually covers, as separate rectangles: the cross with its X figure beside it, and the thin
 * strip the Y figure runs down. The L between them is empty, and letting other things stand in it is what
 * lets a tick fit a crowded cell.
 */
export function tickParts(x, y, side, { arm, labelW, drop }) {
  const cross = side === 'left'
    ? { x0: x - labelW, y0: y - arm, x1: x + arm, y1: y + 3.5 }
    : { x0: x - arm, y0: y - arm, x1: x + labelW, y1: y + 3.5 }
  const strip = { x0: x - 4, y0: y + 3.5, x1: x + 4, y1: y + drop }
  return [cross, strip]
}

/**
 * @param {object} p
 * @param {{x0:number,y0:number,x1:number,y1:number}} p.cell  The inset's cell.
 * @param {Array<box>} [p.reserved]  Rectangles nothing may overlap (caption, north arrow).
 * @param {Array<box>} [p.obstacles]  What is already drawn (stations, names, a circle's extent).
 * @param {number} p.D  The inset's scale denominator (1:D).
 * @param {(e:number,n:number)=>[number,number]} p.T  Ground to sheet mm.
 * @param {(x:number,y:number)=>[number,number]} p.Tinv  Sheet mm to ground.
 * @param {{arm:number,labelW:number,drop:number}} p.geometry
 * @param {number} [p.minSpacingMm]  The closest two lattice nodes may be on paper.
 * @param {number} [p.margin]  Clearance kept inside the cell's frame.
 * @returns {{ticks: Array<{x:number,y:number,side:'left'|'right',e:number,n:number,X:number,Y:number,box:box}>,
 *            interval:number, clear:boolean}}
 */
export function placeInsetTicks({
  cell, reserved = [], obstacles = [], D, T, Tinv, geometry, minSpacingMm = 20, margin = 1.5,
}) {
  const inner = { x0: cell.x0 + margin, y0: cell.y0 + margin, x1: cell.x1 - margin, y1: cell.y1 - margin }
  const centre = [(cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2]
  const blockers = [...reserved, ...obstacles]

  const [eA, nA] = Tinv(cell.x0, cell.y0), [eB, nB] = Tinv(cell.x1, cell.y1)
  const eLo = Math.min(eA, eB), eHi = Math.max(eA, eB), nLo = Math.min(nA, nB), nHi = Math.max(nA, nB)

  const candidates = (interval) => {
    const out = []
    // X = -n and Y = -e: the lattice is round in the survey's own coordinates.
    const Xlo = Math.ceil(-nHi / interval), Xhi = Math.floor(-nLo / interval)
    const Ylo = Math.ceil(-eHi / interval), Yhi = Math.floor(-eLo / interval)
    for (let kx = Xlo; kx <= Xhi; kx++) {
      for (let ky = Ylo; ky <= Yhi; ky++) {
        const X = kx * interval + 0, Y = ky * interval + 0   // + 0 turns a -0 into 0
        const e = -Y, n = -X
        const [x, y] = T(e, n)
        for (const side of ['right', 'left']) {
          const box = tickBox(x, y, side, geometry)
          out.push({ x, y, side, e, n, X, Y, box, parts: tickParts(x, y, side, geometry) })
        }
      }
    }
    return out
  }
  const inside = (b) => b.x0 >= inner.x0 && b.x1 <= inner.x1 && b.y0 >= inner.y0 && b.y1 <= inner.y1
  const nearest = (a, b) => Math.hypot(a.x - centre[0], a.y - centre[1]) - Math.hypot(b.x - centre[0], b.y - centre[1])

  // The first interval wide enough to read, and then coarser ones, until some node has room.
  const start = TICK_INTERVALS.findIndex((i) => (i * 1000) / D >= minSpacingMm)
  const wide = TICK_INTERVALS.slice(Math.max(0, start), Math.max(0, start) + 6)
  // Failing that, a finer lattice (nodes closer than the preferred spacing, still at least 4 mm apart on
  // paper): one tick needs only one node with room, and a cell mostly taken up by a map has little.
  const fine = TICK_INTERVALS.slice(0, Math.max(0, start)).reverse().filter((i) => (i * 1000) / D >= 4)
  const intervals = [...wide, ...fine]
  for (const interval of intervals) {
    const clean = candidates(interval)
      .filter((c) => inside(c.box) && !blockers.some((o) => c.parts.some((p) => overlaps(p, o, 0.6))))
      .sort(nearest)
    if (clean.length) return { ticks: [clean[0]], interval, clear: true }
  }

  // No node has room: the one that hides least. Its cross must still lie inside the cell.
  const interval = wide[0] ?? TICK_INTERVALS.at(-1)
  let best = null
  for (const c of [...candidates(interval), ...fine.flatMap((i) => candidates(i))]) {
    if (c.x < inner.x0 || c.x > inner.x1 || c.y < inner.y0 || c.y > inner.y1) continue
    const cost = blockers.reduce((t, o) => t + c.parts.reduce((u, p) => u + overlapArea(p, o), 0), 0)
      + (inside(c.box) ? 0 : 1e6)
    if (!best || cost < best.cost) best = { ...c, cost }
  }
  if (!best) {
    // The cell holds no node of this lattice at all (a cell narrower than the interval): the centre, rounded.
    const [e, n] = Tinv(centre[0], centre[1])
    const X = Math.round(-n / interval) * interval, Y = Math.round(-e / interval) * interval
    const [x, y] = T(-Y, -X)
    best = { x, y, side: 'right', e: -Y, n: -X, X, Y, box: tickBox(x, y, 'right', geometry), parts: tickParts(x, y, 'right', geometry) }
  }
  const { cost, ...tick } = best
  return { ticks: [tick], interval, clear: false }
}

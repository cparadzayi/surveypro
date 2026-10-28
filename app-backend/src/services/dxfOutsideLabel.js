/**
 * A beacon name at a corner of the OUTSIDE FIGURE, placed wholly outside it, as close to its
 * beacon as a clear spot allows: the DXF's version of the PDF's renderOutsideFigureVertexLabels
 * (pdfkitGeoPDF.js), same rule, same numbers.
 *
 *  - The bearing starts at the corner's LOCAL outside: the bisector of the two edges meeting at the
 *    vertex, flipped to whichever side is outside the figure (probed, so a reflex corner is right).
 *    It is not "away from the centroid": on a long figure that points along or into the boundary at
 *    a vertex part way down a side.
 *  - Distance first, bearing second: every bearing in the fan (straight out, then 22, 45 and 70
 *    degrees either way) is tried at one distance before any of them is tried further out, so the
 *    name stays beside its own beacon.
 *  - A spot is taken only if the whole padded box is outside the figure and clear of its outline by
 *    BOUNDARY_BUFFER, and clear of the labels already placed.
 *  - If nothing clears, eight compass directions are tried at growing distances with the boundary
 *    buffer relaxed in steps, and only then is the name forced out along the bearing.
 *
 * The PDF's constants are in paper points; they are converted with `ptPerMetre` so the same gaps
 * hold on paper at any scale. Frame: DXF ground metres, y up (the bearing maths does not care).
 *
 * Pure: no I/O, no module state.
 */
import { isPointInPolygon, rectangleOverlapsPolygon } from './dxfGeometry.js'
import { ptPerMetre, TEXT_WIDTH_FACTOR } from './dxfLetterFit.js'

const DEG = Math.PI / 180
const LABEL_GAP_PT = 2.5     // from the beacon circle to the box's near edge
const RING_STEP_PT = 2       // each further ring of the search
const BOUNDARY_BUFFER_PT = 3 // clearance from the figure outline
const PAD_PT = 2             // air round the text inside the box
const MAX_OFFSET_PT = 60
const FAN_DEG = [0, 22, -22, 45, -45, 70, -70]
const COMPASS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]

/** The ring without a repeated closing vertex. */
function open(ring) {
  const a = ring[0], b = ring[ring.length - 1]
  return ring.length > 1 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 ? ring.slice(0, -1) : ring
}

/** Index of the ring vertex within `tol` of `p`, or -1. */
export function vertexIndexAt(ring, p, tol = 0.6) {
  const r = open(ring)
  for (let i = 0; i < r.length; i++) if (Math.hypot(r[i].x - p.x, r[i].y - p.y) < tol) return i
  return -1
}

/**
 * @param {object} o
 * @param {Array<{x:number,y:number}>} o.ring     the figure, DXF ground metres
 * @param {number} o.index                        which vertex the beacon is
 * @param {string} o.text                         the name
 * @param {number} o.capHeight                    cap height, ground metres
 * @param {number} o.beaconRadius                 ground metres
 * @param {number} o.scaleDenominator
 * @param {(rect:{x:number,y:number,width:number,height:number})=>boolean} [o.collides]
 * @returns {{x:number,y:number,cx:number,cy:number,width:number,distance:number,found:boolean}}
 *   x,y: the TEXT baseline-left insertion point; cx,cy: the ink centre.
 */
export function placeFigureVertexName({ ring, index, text, capHeight, beaconRadius, scaleDenominator, collides = null }) {
  const k = ptPerMetre(scaleDenominator)
  const g = (pt) => pt / k
  const poly = open(ring)
  const n = poly.length
  const P = poly[index]
  const textW = String(text).length * capHeight * TEXT_WIDTH_FACTOR
  const w = textW + 2 * g(PAD_PT), h = capHeight + 2 * g(PAD_PT)

  // Bearing: the local outside of the corner.
  let baseAng = 0
  {
    const pc = poly[(index - 1 + n) % n], nc = poly[(index + 1) % n]
    const u1x = pc.x - P.x, u1y = pc.y - P.y, u2x = nc.x - P.x, u2y = nc.y - P.y
    const l1 = Math.hypot(u1x, u1y), l2 = Math.hypot(u2x, u2y)
    let bx = 0, by = 1
    if (l1 > 1e-9 && l2 > 1e-9) {
      bx = u1x / l1 + u2x / l2; by = u1y / l1 + u2y / l2
      const bl = Math.hypot(bx, by)
      if (bl < 1e-3) { bx = -u1y / l1; by = u1x / l1 } else { bx /= bl; by /= bl }
    }
    const probe = (s) => isPointInPolygon({ x: P.x + s * bx * g(4), y: P.y + s * by * g(4) }, poly)
    const sgn = probe(-1) && !probe(1) ? 1 : -1
    baseAng = Math.atan2(sgn * by, sgn * bx)
  }

  const boxAt = (cx, cy) => ({ x: cx - w / 2, y: cy - h / 2, width: w, height: h })
  const clear = (rect, buffer) =>
    !rectangleOverlapsPolygon(rect, poly, buffer) && !(collides && collides(rect))

  const finish = (cx, cy, found) => ({
    // ink centre -> baseline-left of an unturned TEXT
    x: cx - textW / 2, y: cy - capHeight / 2, cx, cy, width: textW,
    distance: Math.hypot(cx - P.x, cy - P.y), found,
  })

  const gap = beaconRadius + g(LABEL_GAP_PT)
  const buffer = g(BOUNDARY_BUFFER_PT)
  const maxRing = Math.ceil((MAX_OFFSET_PT - 4) / RING_STEP_PT)

  // 1. Distance first, bearing second, along the corner's own outside.
  for (let ringNo = 0; ringNo <= maxRing; ringNo++) {
    for (const d of FAN_DEG) {
      const a = baseAng + d * DEG
      const ux = Math.cos(a), uy = Math.sin(a)
      const reach = (Math.abs(ux) * w + Math.abs(uy) * h) / 2
      const off = gap + reach + ringNo * g(RING_STEP_PT)
      const cx = P.x + ux * off, cy = P.y + uy * off
      if (clear(boxAt(cx, cy), buffer)) return finish(cx, cy, true)
    }
  }

  // 2. Eight compass directions, nearest first, the boundary buffer relaxed in steps.
  for (const buf of [buffer, g(3), 0]) {
    let best = null
    for (const [dx, dy] of COMPASS) {
      const len = Math.hypot(dx, dy)
      for (let off = beaconRadius + g(4); off <= g(MAX_OFFSET_PT + 20); off += g(3)) {
        const cx = P.x + (dx / len) * off, cy = P.y + (dy / len) * off
        if (clear(boxAt(cx, cy), buf)) { if (!best || off < best.off) best = { cx, cy, off }; break }
      }
    }
    if (best) return finish(best.cx, best.cy, true)
  }

  // 3. Nothing clears: out along the bearing, far enough to be off the figure.
  const off = g(MAX_OFFSET_PT + 30)
  return finish(P.x + Math.cos(baseAng) * off, P.y + Math.sin(baseAng) * off, false)
}

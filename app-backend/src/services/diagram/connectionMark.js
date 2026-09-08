/**
 * Connecting data: the mark that ties a new beacon to a parent beacon of the
 * survey it subdivides. The Surveyor-General requires the connection; the
 * diagram shows it as a short ray from the beacon, an arrowhead at the far end
 * pointing the way to the parent, the distance lettered along it, and a letter
 * beyond the tip continuing the figure's own sequence (A B C D then E, F...).
 *
 * The ray is SYMBOLIC. A parent beacon is usually off the sheet -- 88 m at
 * 1:1500 is 59 mm, and the connections on a real diagram run further than the
 * figure is wide -- so only its DIRECTION is true. Drawing it to scale would
 * put the arrowhead off the page.
 *
 * Coordinate-space agnostic, like contiguousMarks: the caller passes points it
 * has already projected, in PDF points or DXF ground units, and gets the same
 * shape back in those units. Both diagram renderers call this so a connection
 * cannot come out differently on the PDF and the DXF.
 */
import { CONTIG_STUB_MM } from './contiguousMarks.js'
export { dashSegments, ADJOINING_DASH_ON_MM, ADJOINING_DASH_OFF_MM } from './contiguousMarks.js'

/**
 * How far the ray runs, in paper millimetres, measured to the ARROW TIP.
 *
 * The same 8.4 mm the abutment stub uses, plus the arrowhead. A connection and
 * an abutment are both marks hanging off a beacon into open ground, and there
 * is no reason for one to reach further than the other; sharing the number
 * means retuning the stub retunes this too.
 */
export const CONNECTION_ARROW_MM = 2.2
export const CONNECTION_STUB_MM = CONTIG_STUB_MM + CONNECTION_ARROW_MM

/**
 * How far along the ray the distance text starts, beyond whatever the beacon
 * itself occupies, in paper millimetres.
 *
 * A connection leaves a CORNER, where two boundaries meet and the beacon circle
 * sits on top of them. Centring the text on the shaft ran its leading edge back
 * over all three. The renderers add this to the beacon's own radius and put the
 * text box's near edge there, so the reading starts in clear ground.
 *
 * Clearance is bought two ways -- along the ray and across it -- and the second
 * is cheaper: pushing the label sideways costs no room at the arrowhead end,
 * where a long distance already runs past the tip. So the pad along the ray is
 * kept short and the standoff below does the rest.
 */
export const CONNECTION_LABEL_PAD_MM = 1.75

/**
 * How far the label sits off the connecting line, beyond its own half-height,
 * in paper millimetres. Enough to read as a label BESIDE the ray rather than
 * one sitting on it -- and the further off the line it is, the less of the
 * corner's converging boundaries it has to clear along the ray.
 */
export const CONNECTION_LABEL_STANDOFF_MM = 1.2

/** Half the arrowhead's width, in paper millimetres. Narrow enough to read as
 *  an arrow rather than a triangle symbol -- the Fifth Schedule's signs are
 *  triangles, and this must not be mistaken for one. */
export const CONNECTION_ARROW_HALF_MM = 0.75

/** How nearly parallel two lines must be to count as the same line: 8 degrees.
 *  Over a 10 mm mark that is 1,4 mm of divergence at the far end. */
const COINCIDENT_COS = Math.cos((8 * Math.PI) / 180)

/** How close two lines must run to count as the same line, in paper
 *  millimetres. Both renderers judge every pair of marks by this one figure --
 *  a ray against a boundary, a stub against a boundary -- so a line that reads
 *  as drawn twice on the PDF reads that way on the DXF as well. */
export const COINCIDENT_TOL_MM = 0.8

/**
 * Is this line already drawn by something else on the sheet?
 *
 * The rule the sheet keeps is simply that a LINE IS DRAWN ONCE. Two things
 * break it, both because a mark and a boundary can be the same line:
 *
 *   - a connection often runs ALONG a side of the land it ties to (SD2 to 87C
 *     is both), so the neighbour's edge and the ray coincide;
 *   - an abutment stub springs outward from a beacon, and where the neighbour's
 *     own boundary leaves that beacon the same way, the stub sits on it.
 *
 * Either way two marks quarrel over one line, in the same dashes.
 *
 * This only ANSWERS the question; which mark gives way is the caller's ruling.
 * A connecting ray is never given up -- it carries the distance and the
 * arrowhead, and nothing else draws it, so a neighbour edge beneath it is the
 * one dropped. An abutment stub IS given up to a neighbour's real boundary:
 * the boundary shows the neighbour and where it runs, which is everything the
 * stub was there to say and more.
 *
 * "Coincide" is tested the way it looks on paper -- the two run in the same
 * direction and lie on top of each other -- rather than by asking whether the
 * edge fits inside the ray. The ray is a SYMBOLIC length and the neighbour's
 * edge is clipped to the buffer, so neither contains the other; requiring the
 * edge's ends to sit on the ray simply never fired.
 *
 * An edge that merely starts at the same beacon and strikes off at an angle is
 * left alone: it is that neighbour's boundary and nothing else draws it.
 *
 * @param {Array<{tail: [number, number], tip: [number, number]}>} rays  lines
 *   already on the sheet
 */
export function alreadyDrawnAlong(a, b, rays, tol) {
  const near = (p, s, e) => {
    const vx = e[0] - s[0], vy = e[1] - s[1]
    const l2 = vx * vx + vy * vy
    if (!l2) return Math.hypot(p[0] - s[0], p[1] - s[1])
    let t = ((p[0] - s[0]) * vx + (p[1] - s[1]) * vy) / l2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p[0] - (s[0] + t * vx), p[1] - (s[1] + t * vy))
  }
  const dir = (s, e) => {
    const d = Math.hypot(e[0] - s[0], e[1] - s[1]) || 1
    return [(e[0] - s[0]) / d, (e[1] - s[1]) / d]
  }
  const [ex, ey] = dir(a, b)
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  return (rays ?? []).some((r) => {
    const [rx, ry] = dir(r.tail, r.tip)
    // The same line, either way along it. The angle is generous because two
    // lines drawn from one beacon diverge slowly: a stand 404 stub sat on its
    // neighbour's boundary at 5,1 degrees, which is a millimetre apart at the
    // far end of a 10 mm mark and indistinguishable on paper. A tighter test
    // let exactly that through.
    if (Math.abs(ex * rx + ey * ry) < COINCIDENT_COS) return false
    // and actually on top of one another, judged from both middles so that
    // neither having to be the longer decides it
    const rmid = [(r.tail[0] + r.tip[0]) / 2, (r.tail[1] + r.tip[1]) / 2]
    return near(rmid, a, b) <= tol || near(mid, r.tail, r.tip) <= tol
  })
}

/**
 * @param {[number, number]} at       The figure beacon, projected.
 * @param {[number, number]} toward   The parent beacon, projected. Only its
 *        direction from `at` is used; it may be far outside the sheet.
 * @param {number} lengthUnits        Ray length to the tip, in the caller's units.
 * @param {number} arrowUnits         Arrowhead length, same units.
 * @param {number} arrowHalfUnits     Arrowhead half-width, same units.
 * @returns {{dir: [number, number], tip: [number, number], tail: [number, number],
 *           arrow: Array<[number, number]>, along: (d: number) => [number, number]} | null}
 *          `null` when the two points coincide and there is no direction to draw.
 */
export function connectionMark(at, toward, lengthUnits, arrowUnits, arrowHalfUnits) {
  const dx = toward[0] - at[0]
  const dy = toward[1] - at[1]
  const len = Math.hypot(dx, dy)
  // A parent beacon on top of its own connection point is a data fault, not a
  // mark: there is no direction to point. Say so by returning nothing rather
  // than drawing an arrow in an arbitrary direction.
  if (!len) return null
  const ux = dx / len, uy = dy / len
  const tip = [at[0] + ux * lengthUnits, at[1] + uy * lengthUnits]
  // The head's base, where the shaft ends.
  const base = [tip[0] - ux * arrowUnits, tip[1] - uy * arrowUnits]
  const px = -uy, py = ux
  return {
    dir: [ux, uy],
    tail: [at[0], at[1]],
    tip,
    arrow: [
      tip,
      [base[0] + px * arrowHalfUnits, base[1] + py * arrowHalfUnits],
      [base[0] - px * arrowHalfUnits, base[1] - py * arrowHalfUnits],
    ],
    /** The point `d` along the ray from the beacon. The distance text is placed
     *  by its NEAR EDGE, not its centre, so it can be held clear of the corner
     *  the ray leaves -- the caller knows the text width, this does not. */
    along: (d) => [at[0] + ux * d, at[1] + uy * d],
  }
}

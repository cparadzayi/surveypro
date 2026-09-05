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

/** Half the arrowhead's width, in paper millimetres. Narrow enough to read as
 *  an arrow rather than a triangle symbol -- the Fifth Schedule's signs are
 *  triangles, and this must not be mistaken for one. */
export const CONNECTION_ARROW_HALF_MM = 0.75

/**
 * @param {[number, number]} at       The figure beacon, projected.
 * @param {[number, number]} toward   The parent beacon, projected. Only its
 *        direction from `at` is used; it may be far outside the sheet.
 * @param {number} lengthUnits        Ray length to the tip, in the caller's units.
 * @param {number} arrowUnits         Arrowhead length, same units.
 * @param {number} arrowHalfUnits     Arrowhead half-width, same units.
 * @returns {{dir: [number, number], tip: [number, number], tail: [number, number],
 *           arrow: Array<[number, number]>, labelAnchor: [number, number]} | null}
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
    // Midway along the shaft: the distance reads against the line it measures.
    labelAnchor: [at[0] + ux * (lengthUnits - arrowUnits) / 2,
      at[1] + uy * (lengthUnits - arrowUnits) / 2],
  }
}

/**
 * A beacon's suffix letter ("A", "C", ...) placed inside its own stand for the DXF, by the SAME rule
 * the PDF uses (diagram/suffixLabelFit.js): the whole letter clear of every boundary line, as close
 * to its beacon as the corner allows, a smaller size before a far spot, a small tilt only where a
 * level letter cannot clear the lines.
 *
 * That module is tuned in paper points with y pointing DOWN (the PDF's frame), and carries
 * absolute constants (search step, circle clearance, "far" distance) in those units. So this wrapper
 * converts the DXF's ground metres, y up, to paper points, y down, once on the way in, and back on
 * the way out; nothing in the fit itself needs to know it is not drawing a PDF.
 *
 * DXF TEXT facts used here: the entity's height is the CAP height of the glyphs; its width factor is
 * 0.55 (every entity carries it), so a label n characters long is n x height x 0.55 wide; it is
 * inserted at its baseline-left point and turned counter-clockwise about it.
 *
 * Pure: no I/O, no module state.
 */
import { fitSuffixLabel } from './diagram/suffixLabelFit.js'

const PT_PER_MM = 72 / 25.4
/** Cap height of a font of size 1: a glyph's ink is 0.71 x the font size tall (see INK_HEIGHT). */
const CAP_PER_FONT = 0.71
/** The width factor every DXF TEXT entity carries (STYLE_WIDTH_FACTOR). */
export const TEXT_WIDTH_FACTOR = 0.55
/** Other beacons this close (paper points) are ones a letter must not be mistaken for. */
const NEIGHBOUR_PT = 45

/** Paper points per ground metre at 1:S. */
export const ptPerMetre = (S) => (1000 / S) * PT_PER_MM

/**
 * @param {object} o
 * @param {{x:number,y:number}} o.beaconPos            DXF ground metres
 * @param {Array<{x:number,y:number}>} o.polygon       the beacon's stand, DXF ground metres
 * @param {string} o.text                              the letter(s)
 * @param {number} o.capHeight                         preferred cap height, ground metres
 * @param {number} o.beaconRadius                      ground metres
 * @param {number} o.scaleDenominator                  S of 1:S
 * @param {Array<{x:number,y:number}>} [o.neighbours]  other beacons, ground metres
 * @param {(box:{x:number,y:number,width:number,height:number})=>boolean} [o.collides]  ground-metre rect, bottom-left origin
 * @returns {{x:number,y:number,capHeight:number,width:number,rot:number,fitted:boolean,cramped:boolean,tier:number}}
 *   x,y: the TEXT insertion point (baseline-left), ground metres; rot: degrees counter-clockwise.
 */
export function fitDxfSuffixLetter({
  beaconPos, polygon, text, capHeight, beaconRadius, scaleDenominator, neighbours = [], collides = null,
}) {
  const k = ptPerMetre(scaleDenominator)
  const toPt = (p) => ({ x: p.x * k, y: -p.y * k })
  const n = String(text).length

  const fit = fitSuffixLabel({
    beaconPos: toPt(beaconPos),
    polygon: polygon.map(toPt),
    widthAt: (fs) => n * (fs * CAP_PER_FONT) * TEXT_WIDTH_FACTOR,
    fontSize: (capHeight * k) / CAP_PER_FONT,
    beaconRadius: beaconRadius * k,
    neighbours: neighbours.map(toPt).filter((p) => Math.hypot(p.x - beaconPos.x * k, p.y + beaconPos.y * k) < NEIGHBOUR_PT),
    // Fit the letter's real ink box, as the PDF does.
    ink: true,
    collides: collides
      ? (r) => collides({ x: r.x / k, y: -(r.y + r.h) / k, width: r.w / k, height: r.h / k })
      : null,
  })

  // Back to ground metres, y up. The fit's frame is y-down, so a turn that is clockwise there is
  // counter-clockwise here with the sign flipped.
  const cx = fit.inkCx / k, cy = -fit.inkCy / k
  const cap = (fit.fontSize * CAP_PER_FONT) / k
  const width = n * cap * TEXT_WIDTH_FACTOR
  const rot = -fit.rotation
  const th = (rot * Math.PI) / 180
  // Ink centre -> baseline-left: half the width back along the baseline, half the cap height down.
  const x = cx - Math.cos(th) * (width / 2) + Math.sin(th) * (cap / 2)
  const y = cy - Math.sin(th) * (width / 2) - Math.cos(th) * (cap / 2)
  return { x, y, capHeight: cap, width, rot: rot === 0 ? 0 : rot, fitted: fit.fitted, cramped: fit.cramped, tier: fit.tier }
}

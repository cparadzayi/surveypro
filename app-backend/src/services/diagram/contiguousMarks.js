/**
 * Decide the offset stubs and label anchor for a contiguous (abutting) neighbour
 * on ONE subject side, shared by the diagram PDF, general-plan PDF and DXF renderers
 * so all three stay identical. Coordinate-space agnostic (PDF points or DXF ground units).
 *
 * @param {[number, number]} a  First terminal of the side (the 'from' / first-letter vertex).
 * @param {[number, number]} b  Second terminal (the 'to' / second-letter vertex).
 * @param {'from'|'to'|'both'|'mid'|undefined} end  Which terminal(s) the neighbour abuts.
 *        Absent ⇒ 'both' (spans the side) for back-compat with pre-`end` data.
 *        'mid' ⇒ the neighbour spans the middle of the side and reaches neither
 *        terminal: no stubs at all, only the centred label.
 * @param {{from?: boolean, to?: boolean}} [suppress]  Terminals that already carry
 *        a connecting-data ray. A beacon showing both an abutment stub and a
 *        connection would make two different claims with marks a reader cannot
 *        tell apart -- one says "this side abuts that property", the other
 *        "this beacon lies so far from that parent beacon, that way". The
 *        connection is the one the Surveyor-General requires, so it wins and the
 *        stub is dropped. The side's LABEL is unaffected: the neighbour is still
 *        named, it just stops being marked twice.
 * @returns {{stubFrom: boolean, stubTo: boolean, labelAnchor: [number, number]}}
 *
 * The label is ALWAYS anchored at the side midpoint — one centred label per side.
 * `end` only decides which terminal(s) get an outward stub ('both'/'from'/'to'),
 * or none ('mid').
 */
/**
 * Outward stub length for an abutting neighbour, in paper millimetres.
 *
 * One definition for every renderer that draws these marks -- diagram DXF,
 * diagram PDF, general-plan PDF and the working plan -- because it had been
 * copied into three files as 6 mm and then changed in a fourth.
 *
 * 8.4 mm is set by legibility on the working plan, which draws the stub DASHED:
 * at PLANDASH (1.736 mm dash, 1.058 mm gap) three dashes need 7.324 mm, so 6 mm
 * showed two and read as a tick. 8.4 mm is exactly three periods. The diagram
 * draws the same stub solid, where length does not affect how it reads, so
 * matching costs it nothing and keeps the documents consistent.
 */
export const CONTIG_STUB_MM = 8.4

/**
 * The dash every adjoining mark is drawn with -- the abutment stub and the
 * connecting ray alike -- as PLANDASH: 1.736 mm of dash to 1.058 mm of gap.
 *
 * One pattern, because these marks sit side by side on the same sheet and a
 * second pattern would read as a distinction that does not exist. It is also
 * the pattern CONTIG_STUB_MM was derived from: 8.4 mm is exactly three periods
 * of it, which is where the three-dash floor above comes from.
 */
export const ADJOINING_DASH_ON_MM = 1.736
export const ADJOINING_DASH_OFF_MM = 1.058

/**
 * Cut a line into dashes, in whatever units the caller works in.
 *
 * Every renderer dashes through this rather than its own mechanism. PDFKit can
 * dash a path natively and the diagram's DXF writer cannot -- its linetype
 * table holds only CONTINUOUS, and a scaled pattern would have to be rebuilt
 * per sheet -- so the DXF used to draw solid where the PDF drew dashed. Sharing
 * the arithmetic makes the two documents break in the same places instead.
 *
 * @returns {Array<[[number, number], [number, number]]>} segments to draw
 */
export function dashSegments(a, b, onUnits, offUnits) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const period = onUnits + offUnits
  if (!len || !(onUnits > 0) || !(period > 0)) return len ? [[a, b]] : []
  const ux = dx / len, uy = dy / len
  const at = (t) => [a[0] + ux * t, a[1] + uy * t]
  const out = []
  for (let t = 0; t < len; t += period) {
    const end = Math.min(t + onUnits, len)
    // A last sliver is dropped rather than drawn. An 8.4 mm run over a 2.794 mm
    // period leaves 0.018 mm over, which prints as a dot and reads as an extra
    // dash -- the pattern's own remainder showing up as ink.
    if (end - t < onUnits * 0.25) continue
    out.push([at(t), at(end)])
  }
  return out
}

/**
 * Where an abutment stub ends: on the line of the SUBJECT's own side, carried on past the corner.
 *
 * A neighbour abutting a side shares that side with the figure, and where its boundary leaves the corner it
 * leaves along the figure's other side there, not square to the side it abuts: the stub marks that
 * boundary, so it keeps the direction the parcel under survey was running. At a right angle the two are the
 * same line; at any other corner the perpendicular put the stub on land the neighbour does not hold.
 *
 * @param {[number, number]} corner     The terminal the stub springs from.
 * @param {[number, number]|null} adj   The figure's vertex on the far side of `corner` from the abutting side,
 *                                      i.e. the other end of the adjacent side. Null when there is none.
 * @param {[number, number]} outwardTip The old stub end, perpendicular and outward: its length is the stub's,
 *                                      and it is the answer where the figure's own line cannot be used.
 * @returns {[number, number]} the stub's end, the same length as `outwardTip`'s stub.
 *
 * The figure's line is used only if it leaves the figure: carried on past a REFLEX corner it would run back
 * into the parcel, and one that runs nearly along the abutting side is no boundary of a neighbour at all, so
 * either falls back to the perpendicular.
 */
export function continuedStubTip(corner, adj, outwardTip) {
  if (!adj) return outwardTip
  const ox = outwardTip[0] - corner[0], oy = outwardTip[1] - corner[1]
  const length = Math.hypot(ox, oy)
  const dx = corner[0] - adj[0], dy = corner[1] - adj[1]
  const dl = Math.hypot(dx, dy)
  if (!(length > 0) || !(dl > 0)) return outwardTip
  const ux = dx / dl, uy = dy / dl
  // how far it points away from the abutting side: 1 = square to it, 0 = along it, negative = into the figure
  if ((ux * ox + uy * oy) / length < 0.15) return outwardTip
  return [corner[0] + ux * length, corner[1] + uy * length]
}

export function contiguousMarks(a, b, end, suppress) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const e = end || 'both'
  return {
    stubFrom: (e === 'both' || e === 'from') && !suppress?.from,
    stubTo: (e === 'both' || e === 'to') && !suppress?.to,
    labelAnchor: mid,
  }
}

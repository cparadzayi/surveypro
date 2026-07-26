/**
 * Decide the offset stubs and label anchor for a contiguous (abutting) neighbour
 * on ONE subject side, shared by the diagram PDF, general-plan PDF and DXF renderers
 * so all three stay identical. Coordinate-space agnostic (PDF points or DXF ground units).
 *
 * @param {[number, number]} a  First terminal of the side (the 'from' / first-letter vertex).
 * @param {[number, number]} b  Second terminal (the 'to' / second-letter vertex).
 * @param {'from'|'to'|'both'|undefined} end  Which terminal(s) the neighbour abuts.
 *        Absent ⇒ 'both' (spans the side) for back-compat with pre-`end` data.
 * @returns {{stubFrom: boolean, stubTo: boolean, labelAnchor: [number, number]}}
 *
 * The label is ALWAYS anchored at the side midpoint — one centred label per side.
 * `end` only decides which terminal(s) get an outward stub ('both'/'from'/'to').
 */
export function contiguousMarks(a, b, end) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const e = end || 'both'
  return {
    stubFrom: e === 'both' || e === 'from',
    stubTo: e === 'both' || e === 'to',
    labelAnchor: mid,
  }
}

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
 */
export function contiguousMarks(a, b, end) {
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const e = end || 'both'
  if (e === 'from') {
    return { stubFrom: true, stubTo: false, labelAnchor: [(a[0] + mid[0]) / 2, (a[1] + mid[1]) / 2] }
  }
  if (e === 'to') {
    return { stubFrom: false, stubTo: true, labelAnchor: [(mid[0] + b[0]) / 2, (mid[1] + b[1]) / 2] }
  }
  return { stubFrom: true, stubTo: true, labelAnchor: mid }
}

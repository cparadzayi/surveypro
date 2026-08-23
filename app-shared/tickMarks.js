/**
 * Coordinate tick marks — SINGLE SOURCE OF TRUTH.
 *
 * Every plan-producing path (pdfkitGeoPDF.js, dxfGenerator.js) gets its tick
 * interval, grid nodes, label text and mark geometry from here, so the two
 * formats can never disagree about where a cross goes or what it says.
 *
 * The convention is taken from a Surveyor-General-issued reference plan
 * (mag1sh1a.dxf, Maglas/Shabani), measured rather than assumed:
 *
 *   - A tick mark is a CROSS: two intersecting axis lines about a shared
 *     centre, ~4mm of paper per arm, carrying BOTH a Y and an X label.
 *   - Crosses sit on a regular grid of round coordinates covering the figure,
 *     the grid snapped OUTWARD so it spans the whole extent.
 *   - Crosses ARE placed within the figure. In the reference, most of them
 *     are: they mark the coordinate grid across the plan, not a frame around
 *     it. What the reference never does is put one on top of drawn detail —
 *     it draws roughly one node in three, keeping to clear space. So the rule
 *     is CLEARANCE, not exclusion: emit a node only where its cross and both
 *     labels miss the drawn detail. (A cross landing over stands 211/212 is
 *     the failure this prevents.)
 *   - Labels read "Y = +97400" / "X = +2247100": explicit sign, and NO
 *     thousands separators — the reference groups nothing.
 *
 * Superseded approaches, deliberately not kept: inward-confined bounds and
 * neatline/figure-edge ticks. Both were attempts to keep marks off the figure
 * entirely, which the reference shows is not the convention.
 */

// Largest "nice" ground-metre interval whose paper spacing stays within a
// ruler-safe target, so a Surveyor-General can check any adjacent pair with a
// standard 30cm scale ruler.
//
// The 100mm default is measured off the reference plan, not chosen: at 1:1000
// it lays out a 100m grid, i.e. 100mm of paper between adjacent crosses. A
// looser target (the old 250mm) picks 200m there and halves the grid density
// against what the Surveyor-General actually issues.
const REFERENCE_TARGET_PAPER_MM = 100
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500, 1000, 2000, 5000, 10000]

export function chooseTickIntervalMetres(scaleDenominator, targetPaperMm = REFERENCE_TARGET_PAPER_MM) {
  const maxIntervalM = (targetPaperMm * scaleDenominator) / 1000
  let chosen = GRID_NICE_NUMBERS[0]
  for (const n of GRID_NICE_NUMBERS) {
    if (n > maxIntervalM) break
    chosen = n
  }
  return chosen
}

/**
 * Grid nodes covering a figure's extent, as {y, x} ground coordinates.
 *
 * The rectangle is snapped OUTWARD to whole intervals so it spans the figure
 * — the reference plan carries crosses slightly beyond the parcels on every
 * side. Every intersection inside that rectangle is returned, interior nodes
 * included; deciding which to actually draw is the caller's clearance test,
 * not this function's job.
 */
export function computeTickGrid({ yMin, yMax, xMin, xMax, scaleDenominator, targetPaperMm = REFERENCE_TARGET_PAPER_MM }) {
  const intervalM = chooseTickIntervalMetres(scaleDenominator, targetPaperMm)
  const lo = (v) => Math.floor(v / intervalM) * intervalM
  const hi = (v) => Math.ceil(v / intervalM) * intervalM
  const nodes = []
  for (let y = lo(yMin); y <= hi(yMax) + 1e-6; y += intervalM) {
    for (let x = lo(xMin); x <= hi(xMax) + 1e-6; x += intervalM) {
      nodes.push({ y: Math.round(y * 1e6) / 1e6, x: Math.round(x * 1e6) / 1e6 })
    }
  }
  return { intervalM, nodes }
}

/**
 * Axis label exactly as the reference plan writes it: "Y = +97400".
 * Explicit sign; no thousands separators.
 */
export function formatTickLabel(axis, value) {
  const magnitude = Math.round(Math.abs(value))
  return `${axis} = ${value < 0 ? '-' : '+'}${magnitude}`
}

/**
 * Mark geometry in PAPER MILLIMETRES, measured off the reference plan (8mm
 * cross, 2.5mm label text). Callers convert to their own units.
 */
export const TICK_GEOMETRY_MM = {
  armHalfLength: 4,   // each arm runs 4mm either side of centre
  labelHeight: 2.5,
  labelGap: 1.5,      // clearance from arm tip to label
}

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

// Largest "nice" ground-metre interval whose paper spacing stays within the
// target. The surveyor's rule is 300mm of paper between adjacent crosses:
// 300m at 1:1000, 150m at 1:500 (so 600m at 1:2000, and so on).
//
// That is the STARTING interval only. selectTickGrid steps finer down the
// ladder when the coarse grid leaves too few crosses clear of drawn detail,
// so a small figure still gets its minimum marks.
const REFERENCE_TARGET_PAPER_MM = 300
export const GRID_NICE_NUMBERS = [50, 100, 150, 200, 300, 500, 600, 1000, 2000, 5000, 10000]

// Every cross sits on a coordinate that is a whole multiple of this, and the
// first and last cross on each axis lie within this distance of the figure's
// extremes (outside them where the lattice allows).
export const TICK_COORD_MULTIPLE_M = 50
export const TICK_END_REACH_M = 50

// longestExtentM is accepted for call-site compatibility but no longer caps the
// interval: tying the grid to the figure's size (at least 4 divisions across it)
// made a 300m survey at 1:1000 lay a 75m grid, against the 300m the rule asks.
export function chooseTickIntervalMetres(scaleDenominator, targetPaperMm = REFERENCE_TARGET_PAPER_MM, _longestExtentM = Infinity) {
  const maxIntervalM = (targetPaperMm * scaleDenominator) / 1000
  let chosen = GRID_NICE_NUMBERS[0]
  for (const n of GRID_NICE_NUMBERS) {
    if (n > maxIntervalM) break
    chosen = n
  }
  return chosen
}

/**
 * Coordinates of one axis' crosses for an EXACT spacing, or null when no run of
 * crosses at that spacing can satisfy the end rule.
 *
 * The rule (the surveyor's): every coordinate is a multiple of 50m; the first
 * is within 50m of the figure's minimum and the last within 50m of its maximum,
 * each preferably beyond the extreme (outside the figure) rather than inside it.
 * Of the two starts that qualify (the multiple of 50 at or below the minimum,
 * and the next one up) the run that ends nearer to or beyond the maximum wins.
 */
export function axisTickValues(min, max, spacingM) {
  const M = TICK_COORD_MULTIPLE_M, R = TICK_END_REACH_M, eps = 1e-6
  const s1 = Math.floor(min / M + eps) * M
  let best = null
  for (const start of [s1, s1 + M]) {
    if (start > min + R + eps) continue
    const n = Math.max(1, Math.ceil((max - R - start) / spacingM - eps))
    const end = start + n * spacingM
    if (end > max + R + eps) continue
    const outside = (start <= min + eps ? 1 : 0) + (end >= max - eps ? 1 : 0)
    const overshoot = Math.abs(start - min) + Math.abs(end - max)
    if (best === null || outside > best.outside || (outside === best.outside && overshoot < best.overshoot)) {
      best = { start, n, outside, overshoot }
    }
  }
  if (best === null) return null
  const out = []
  for (let i = 0; i <= best.n; i++) out.push(Math.round((best.start + i * spacingM) * 1e6) / 1e6)
  return out
}

/**
 * Grid nodes for an EXACT interval (ground metres), as {y, x} coordinates.
 * Each axis follows axisTickValues. Every intersection is returned, interior
 * nodes included; deciding which to actually draw is the caller's clearance
 * test, not this function's job.
 *
 * Factored out of computeTickGrid so selectTickGrid can drive the interval
 * directly (see its own comment for why that matters).
 */
export function gridNodesForInterval(intervalM, { yMin, yMax, xMin, xMax }) {
  const ys = axisTickValues(yMin, yMax, intervalM)
  const xs = axisTickValues(xMin, xMax, intervalM)
  if (ys === null || xs === null) {
    // Not reachable through tickRungLadder, which only offers spacings that
    // satisfy both axes; kept so a direct call still returns a covering grid.
    const lo = (v) => Math.floor(v / intervalM) * intervalM
    const hi = (v) => Math.ceil(v / intervalM) * intervalM
    const nodes = []
    for (let y = lo(yMin); y <= hi(yMax) + 1e-6; y += intervalM) {
      for (let x = lo(xMin); x <= hi(xMax) + 1e-6; x += intervalM) {
        nodes.push({ y: Math.round(y * 1e6) / 1e6, x: Math.round(x * 1e6) / 1e6 })
      }
    }
    return nodes
  }
  const nodes = []
  for (const y of ys) for (const x of xs) nodes.push({ y, x })
  return nodes
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
  const intervalM = tickRungLadder({ yMin, yMax, xMin, xMax, scaleDenominator, targetPaperMm })[0]
  return { intervalM, nodes: gridNodesForInterval(intervalM, { yMin, yMax, xMin, xMax }) }
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

/**
 * A grid of crosses along a single Y (or single X) line is not a coordinate
 * grid — nothing on it lets a reader interpolate the OTHER axis. So "enough"
 * crosses means both axes are actually represented, not just a node count.
 */
export function spansBothAxes(nodes) {
  if (nodes.length < 2) return false
  const ys = new Set(nodes.map((n) => n.y))
  const xs = new Set(nodes.map((n) => n.x))
  return ys.size >= 2 && xs.size >= 2
}

/**
 * Grid nodes that actually survive the caller's clearance test, stepping the
 * interval finer if too few do.
 *
 * A cross is only drawn where it misses drawn detail, so a coarse grid can be
 * unlucky: when a figure's extent happens to be exactly grid-aligned, EVERY
 * node lands on its boundary and nothing survives, leaving a plan with no
 * coordinate reference at all. Stepping to a finer interval moves nodes off
 * the boundary and into clear interior, which is the same density the
 * reference plan carries (roughly one node in three drawn).
 *
 * The step ladder is every "nice" interval at or below the reference choice,
 * tried coarsest first — NOT the interval reached by repeatedly halving the
 * paper target. Halving the target can skip a rung entirely: at 1:2000 the
 * halving sequence visits 200m, 100m, 50m, 25m... and never lands on 75m,
 * yet 75m is the interval whose OUTWARD SNAP (flooring the extent's minimum
 * to a 75m multiple) happens to land clear of this extent's edge, while
 * every rung the halving sequence does visit snaps to the extent's own
 * boundary (a floor/ceiling of an already-round number is a no-op) and
 * therefore never clears it. Walking every rung is what "steps to a finer
 * interval" has to mean for this to actually rescue a grid-aligned extent.
 *
 * A rung only counts as successful once it clears BOTH minMarks and
 * spansBothAxes — a rung that happens to clear 3+ nodes all sharing one Y
 * (a single column, not a grid) satisfies a bare count but not the point of
 * the exercise, so the search must keep stepping past it.
 *
 * `isClear(node)` is the renderer's own test — it alone knows what it has
 * drawn. Returns the coarsest interval whose clear nodes reach minMarks AND
 * span both axes; failing that, the rung with the most clear nodes that
 * still spans both axes; failing that, the rung with the most clear nodes
 * among those tried.
 */
/**
 * The interval rungs a figure may use, coarsest first: every "nice" interval at
 * or below the one the paper-spacing and division-cap rules pick for it.
 *
 * Exported because selectSpanningTickGrid in pdfkitGeoPDF.js walks the SAME
 * ladder when it has to borrow nodes to recover a missing axis. Two copies of
 * this expression would silently diverge the day either rule changes.
 */
export function tickRungLadder({ yMin, yMax, xMin, xMax, scaleDenominator, targetPaperMm = REFERENCE_TARGET_PAPER_MM }) {
  const startInterval = chooseTickIntervalMetres(scaleDenominator, targetPaperMm)
  // A spacing is offered only if a run of crosses at that spacing can begin and
  // end within reach of the figure on BOTH axes (axisTickValues). 50m always can.
  return GRID_NICE_NUMBERS
    .filter((n) => n <= startInterval)
    .filter((n) => axisTickValues(yMin, yMax, n) !== null && axisTickValues(xMin, xMax, n) !== null)
    .sort((a, b) => b - a)
}

export function selectTickGrid({
  yMin, yMax, xMin, xMax, scaleDenominator, isClear, minMarks = 3,
  targetPaperMm = REFERENCE_TARGET_PAPER_MM,
}) {
  const rungs = tickRungLadder({ yMin, yMax, xMin, xMax, scaleDenominator, targetPaperMm })
  let best = null
  let bestDiverse = null
  for (const intervalM of rungs) {
    const nodes = gridNodesForInterval(intervalM, { yMin, yMax, xMin, xMax })
    const clear = nodes.filter(isClear)
    if (best === null || clear.length > best.nodes.length) best = { intervalM, nodes: clear }
    if (spansBothAxes(clear)) {
      if (bestDiverse === null || clear.length > bestDiverse.nodes.length) bestDiverse = { intervalM, nodes: clear }
      if (clear.length >= minMarks) return { intervalM, nodes: clear }
    }
  }
  return bestDiverse ?? best ?? { intervalM: rungs[0] ?? TICK_COORD_MULTIPLE_M, nodes: [] }
}
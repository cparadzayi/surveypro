# Coordinate grid tick marks: scale-rule compliance (30cm ruler check)

## Problem

The general plan's coordinate tick marks (the "+" crosses with `Y=`/`X=` labels
around the figure) currently render as exactly **4 points** — one at each
corner of the figure's bounding extent, in both the PDF (`pdfkitGeoPDF.js`'s
`renderOutsideFigureTickMarks`) and DXF (`dxfGenerator.js`'s
`addCornerCrosses`).

The Surveyor-General verifies a plan's plotted scale by laying a standard
30cm scale ruler between two tick marks and confirming the ground distance
matches what's labelled. With only 4 corner ticks, the only distance
available to check is the full width/height of the figure — which routinely
exceeds 30cm of paper at typical survey scales. Confirmed against a real
plan (`MAG1_SH1_Shabani_2026-06-16`, scale 1:500, corner extent
Y=[97360,97730] / X=[2247150,2247400]): the shorter edge alone (250m) plots
at 50cm on paper, already 67% over ruler length, with no intermediate tick
to check any shorter distance at all.

## Scope decisions (confirmed with user)

- Applies to **both PDF and DXF** output, matching the existing parity
  convention for shared plan-generation logic in this codebase.
- Ticks run along **all 4 edges** of the figure's bounding extent (not just
  corners).
- The tick interval is **auto-computed per plan's scale** — not a single
  fixed ground distance — so paper spacing stays safely under the ruler
  length regardless of whether the plan is 1:500 or 1:2500.
- Target paper spacing: **250mm**, not the full 300mm. Leaves ~5cm of slack
  under the ruler for placement/measurement tolerance.
- **Every** tick (corner and intermediate) gets a full `Y=`/`X=` coordinate
  label — not just the corners.

## Architecture context

Both generators currently compute their own tick-snapping interval
independently, and the two already disagree:

- PDF (`pdfkitGeoPDF.js:1853`): fixed `GRID_INTERVAL = 50` for X, with Y
  separately snapped to a multiple of 5 or 10 depending on whether the Y
  range exceeds 200m (`pdfkitGeoPDF.js:1876`).
- DXF (`dxfGenerator.js:914`): `G = 100` if the larger of the extent's
  width/height exceeds 1000m, else `G = 50`.

Neither is used to generate more than the 4 corner points today — both only
snap those 4 corners to a round number. This spec replaces both ad hoc
snapping rules with one shared interval-selection function, and extends both
call sites from "draw 4 fixed corners" to "draw N points along 4 edges."

This mirrors the existing pattern for schedule column widths
(`computeScheduleColumnWidths` / `scaleColumnWidthsToTarget` in
`app-shared/block-definitions.js`, consumed identically by both generators)
and the scale bar's own round-number graduation (`snapScaleBarSegment`,
same file) — a single shared helper is the source of truth, each generator
threads its output through its own rendering code.

## Design

### 1. `chooseTickIntervalMetres` — `app-shared/block-definitions.js`

```js
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]

/**
 * Picks the largest "nice" round ground-metre interval whose paper spacing,
 * at the given scale, stays at or under targetPaperMm. Used to space
 * coordinate-grid tick marks close enough together that a Surveyor-General
 * can check any adjacent pair with a standard 30cm scale ruler.
 *
 * @param {number} scaleDenominator - e.g. 500 for a 1:500 plan
 * @param {number} [targetPaperMm=250] - safety-margin target under the 300mm ruler
 * @returns {number} interval in ground metres
 */
export function chooseTickIntervalMetres(scaleDenominator, targetPaperMm = 250) {
  const maxIntervalM = (targetPaperMm * scaleDenominator) / 1000
  let chosen = GRID_NICE_NUMBERS[0]
  for (const n of GRID_NICE_NUMBERS) {
    if (n > maxIntervalM) break
    chosen = n
  }
  return chosen
}
```

Reuses the same "nice number" set already established by
`snapScaleBarSegment` (same file) for consistency, but solves the opposite
constraint: `snapScaleBarSegment` picks the smallest nice number ≥ half a
raw segment (for the scale bar's own graduation); this picks the *largest*
nice number that still keeps paper spacing under the target — an intentional
adaptation, not a literal reuse, since the two callers optimize for
different things.

### 2. `computeGridTickPositions` — `app-shared/block-definitions.js`

```js
/**
 * Generates tick points along all 4 edges of a figure's bounding extent at
 * a fixed ground-metre interval, replacing the old "4 corners only" tick
 * set. Points are grouped per edge so callers can apply edge-specific label
 * offset direction (top labels above, bottom below, left/right to the
 * side).
 *
 * "top"/"bottom" edges run along Y (westing) at a fixed X (southing);
 * "left"/"right" edges run along X at a fixed Y — matching this codebase's
 * existing corner-tick axis convention (PDF: pdfkitGeoPDF.js:1985 tickMarks
 * array; DXF: dxfGenerator.js:932 corners array).
 *
 * @param {Object} args
 * @param {number} args.minY - rounded west Y bound
 * @param {number} args.maxY - rounded east Y bound
 * @param {number} args.topX - rounded/adjusted north X bound (may differ
 *        from a naive min due to title-block clearance — caller-supplied)
 * @param {number} args.bottomX - rounded/adjusted south X bound
 * @param {number} args.intervalM - ground-metre spacing from chooseTickIntervalMetres
 * @returns {{top: {y:number,x:number}[], bottom: {y:number,x:number}[], left: {y:number,x:number}[], right: {y:number,x:number}[]}}
 */
export function computeGridTickPositions({ minY, maxY, topX, bottomX, intervalM }) {
  const steppedRange = (start, end, step) => {
    const vals = []
    for (let v = start; v < end; v += step) vals.push(v)
    vals.push(end)
    return vals
  }
  const yValues = steppedRange(minY, maxY, intervalM)
  const xValues = steppedRange(topX, bottomX, intervalM)
  return {
    top:    yValues.map(y => ({ y, x: topX })),
    bottom: yValues.map(y => ({ y, x: bottomX })),
    left:   xValues.map(x => ({ y: minY, x })),
    right:  xValues.map(x => ({ y: maxY, x })),
  }
}
```

Each of the 4 corners is, by construction, the shared first/last element of
two adjacent edge arrays (e.g. `(minY, topX)` is both `top[0]` and
`left[0]`) — so flattening all 4 edges into one list produces each corner
point twice. The render loop must dedupe by `(y, x)` before drawing (a
one-line `Set`/filter guard) so no cross is drawn or reserved twice at the
same location.

### 3. PDF integration — `pdfkitGeoPDF.js`

`renderOutsideFigureTickMarks` currently builds a hardcoded 4-item
`tickMarks` array (`pdfkitGeoPDF.js:1985`) and loops over it with per-tick
transform → map-bounds check → title-block/block collision check → draw
cross + label (`pdfkitGeoPDF.js:2003` onward). That loop body is reused
as-is; only the array construction changes:

- Call `chooseTickIntervalMetres(scaleDenominator)` (scale is already
  available in this function's caller chain) to get `intervalM`.
- Call `computeGridTickPositions` with the already-computed `actualY_min`,
  `actualY_max`, `topX`, `bottomX` (all already computed by the existing
  title-block/map-bounds adjustment logic just above, unchanged).
- Flatten the 4 edge arrays into one list, tag each point with which edge it
  came from (for label-offset direction), and feed that into the existing
  per-tick loop instead of the old 4-item `tickMarks` array.
- Generalize the label-offset logic, currently keyed on
  `tick.name.includes("top")` etc. for the 4 named corners
  (`pdfkitGeoPDF.js` label placement block), to key on the point's edge tag
  instead: top → label above, bottom → below, left → label left of the
  vertical arm, right → label right of it. Corner points (shared by two
  edges) keep today's diagonal offset by checking both tags.

`calculateTickMarkBounds` (`pdfkitGeoPDF.js:1555`, used for Pass-1 early
reservation before layout) must call the same two shared helpers so Pass 1
reserves the same N regions Pass 2 actually places — today it independently
reimplements the 4-corner logic; this spec unifies both passes on the one
shared position list.

### 4. DXF integration — `dxfGenerator.js`

`addCornerCrosses` (`dxfGenerator.js:906`) currently hardcodes its own
`corners` array (4 items, `dxfGenerator.js:932`) after its own local
G-interval snap. Same shape of change as the PDF side:

- Replace the local `G = ... ? 100 : 50` snap with
  `chooseTickIntervalMetres(scaleDenominator)`.
- Replace the hardcoded `corners` array with the flattened output of
  `computeGridTickPositions`, using the same `xL`/`xR`/`yB`/`yT` values
  (already inward-clamped for drawing-area fit) as `topX`/`bottomX`/
  `minY`/`maxY`.
- The existing inward drawing-area clamp (`dxfGenerator.js:917-931`) still
  applies to the shared corner values before generating the full point list
  — intermediate ticks inherit the same clamped bounds, so they never sit
  outside the drawing area either.
- The per-point draw loop (arm + labels + reserved bounds,
  `dxfGenerator.js:945-967`) is reused as-is, just iterating the flattened N
  points instead of the fixed 4; label direction (Y reads up, X reads right)
  is already per-point in this function, not corner-name-keyed, so no
  generalization is needed here beyond feeding it more points.

## Edge cases

- **Figure narrower than one interval** on an axis: `computeGridTickPositions`
  naturally collapses that axis's stepped range to just the two corner
  values — today's 4-corner behavior, unchanged.
- **Irregular (non-rectangular) polygon**: ticks sit on the bounding-box
  edges, same as today's corners; some intermediate ticks can fall outside
  the true figure outline. Already true today, already tolerated.
- **Dense label collisions**: more ticks means more labels competing for
  space near the title block or other blocks. The existing per-tick
  collision check already skips (drops) a tick's label rather than
  overlapping anything — that behavior is preserved and will simply trigger
  more often. Not solved further by this spec; flagged as an accepted
  trade-off.

## Testing

- Unit tests (`block-definitions` test suite) for `chooseTickIntervalMetres`:
  a table of scale denominators → expected interval (1:500→100m,
  1:1500→200m, 1:2500→500m, plus a very small and very large scale
  denominator).
- Unit tests for `computeGridTickPositions`: known extent + interval →
  correct point lists per edge, including the narrower-than-one-interval
  collapse case.
- Integration tests (PDF and DXF) using a fixture sized like the real
  Shabani plan (1:500, ~250-370m extent): assert tick count > 4, assert no
  two adjacent same-edge ticks exceed 250mm of paper distance at the
  fixture's scale, and assert PDF and DXF produce the same tick coordinate
  list (parity) for the same input.
- Full backend suite (`npm test`) run at the end to catch any snapshot or
  collision-avoidance regressions in tests that assumed exactly 4 tick
  marks.
- Visual verification: regenerate the actual Shabani plan PDF and DXF and
  confirm the tick grid reads cleanly along all 4 edges with legible,
  non-colliding labels.

## Out of scope

- The pre-existing Schedule-of-Areas/figure collision-avoidance overlap bug
  (tracked separately) — not addressed by this spec. More tick marks does
  mean more reserved regions for that placement search to avoid, but this
  spec does not change how that search behaves.
- Changing which coordinate values get labelled (still Cape Lo Y=westing /
  X=southing, same `Y = +NN NNN` / `X = +N NNN NNN` format as today).
- Any change to the scale bar's own graduation (`snapScaleBarSegment`) —
  untouched, only its nice-number set's *pattern* is echoed for the new
  function.

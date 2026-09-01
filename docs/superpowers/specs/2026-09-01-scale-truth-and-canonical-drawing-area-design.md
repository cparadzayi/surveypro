# Scale truth — the PDF must draw at the scale it states

Phase 2 of the automatic scale + sheet-size selection work. Supersedes the
"Phase 2 — one drawing-area model" paragraph in
`2026-08-31-automatic-scale-and-sheet-selection-design.md`, which scoped the
wrong problem.

## Problem

Phase 1 gave the preview, the PDF and the DXF one shared ladder of
(scale, sheet) candidates. Phase 2 was scoped as "make both renderers stop on
the same rung" by unifying their drawing-area models.

Measuring the renderers before designing that showed the premise was wrong.
The PDF does not draw at the scale it reports. It fits the figure to a box and
prints a separately-computed denominator beside it. Unifying which rung the two
generators stop on would have made them agree on a number the PDF does not
honour.

A General Plan is a scaled document. A surveyor scaling a distance off a sheet
marked `SCALE 1:1000` is entitled to 1 mm = 1 m.

## Evidence — measured 2026-09-01

`sampleRealisticPlan`, rendered twice through `generateGeoPDF`:

| Run | Stated | Sheet | figureBounds | Extent | True drawn scale | Error |
|---|---|---|---|---|---|---|
| true auto | 1:600 | SI727_1000x800 | 760.0 × 613.1 mm | 300.0 × 195.0 m | **1:439** | −26.9% |
| declared `1:1000` | 1:1000 | SI727_1000x800 | 760.0 × 613.1 mm | 300.0 × 195.0 m | **1:439** | −56.1% |
| declared `1:10000` | 1:10000 | SI727_1000x800 | 760.0 × 613.1 mm | 300.0 × 195.0 m | **1:439** | −95.6% |

The drawn geometry is identical in all three runs. Declaring a scale changes only
the printed label; the figure occupies exactly the same area of paper either
way. At 1:1000 the sheet is out by a factor of 2.3.

**The drawn size is independent of the denominator at every value tested**, which
has a consequence for the record. The symptom Phase 1 was written against — a
50 × 42 mm figure on a 1000 × 800 sheet — was computed as `extent / denominator`,
nominally. The PDF cannot have drawn a figure that small; it filled the page then
as it does now. The DXF, being scale-true, genuinely did draw it. Phase 1
therefore fixed a real defect in the DXF and in sheet/label selection, and left
the PDF's drawing untouched — not what its commit message claims.

**Method and its limit.** The true scale is derived from the renderer's own
logged `figureBounds` and `extent` at the draw call site, applying the 5% inset
and `min(scaleX, scaleY)` fit that `transformCoords` performs. `transformCoords`
is pure and those are its exact inputs, so the derivation is sound — but it is a
derivation, not a measurement taken from the emitted PDF. The test in "Testing"
below closes that gap permanently by measuring the drawn output.

## Root cause

### 1. The figure is fit to a box; the scale is a caption

`pdfkitGeoPDF/geometry.js:528-536` — `transformCoords` sizes the drawing from
the box it is given:

```js
const scaleX = effectiveBounds.width / width;
const scaleY = effectiveBounds.height / height;
const uniformScale = Math.min(scaleX, scaleY);
```

`pdfkitGeoPDF.js:4936` draws the outside figure through exactly that call. The
denominator returned by `calculateOptimalScale` (`:9633`) is applied afterwards,
as text. Nothing connects the two.

### 2. The one existing compensation cannot work

`pdfkitGeoPDF.js:10521` expands the extent when the scale steps up, and its own
comment states the defect:

> Without this, transformCoords maps the data extent to fill the figure bounds
> regardless of scale, so the polygon is always the same size on the page.

It fires only when `optimalScale.value > requestedDenom`, so it is inert on the
auto path (no requested denominator) and inert whenever the resolved scale
equals the requested one — both runs in the evidence table above. It is also
proportional, not absolute: it preserves the ratio between two scales without
making either of them true.

### 3. The scale bar is box-derived too

`pdfkitGeoPDF.js:4787` computes `metersPerPoint = mapWidthMeters / _figW` from
the box rather than from the denominator, so the bar is graduated consistently
with a drawing whose scale is wrong, while the `SCALE 1:XXXX` text beside it
comes from the ladder. The bar and the ratio disagree by construction.

`_figW` is the full `figureBounds.width`, but `transformCoords` insets 5% per
side and fits on the tighter axis, so the bar is not exactly consistent with the
drawing either.

### 4. Three drawing-area models, none of them the available area

For `SI727_800x500` (margin-inset content 600 × 400 mm):

| Model | Figure width | Figure height | Basis |
|---|---|---|---|
| Resolver `drawingAreaMm` | 432 mm | 340 mm | inset × `RESERVE_W 0.72` / `RESERVE_H 0.85` |
| PDF effective allowance | 428 mm | 246 mm | inset × `figureScale 0.95`, minus title band, × `MARGIN_FACTOR 0.75` |
| DXF content area | 600 mm | 400 mm | the margin-inset rectangle itself |

The widths agree to within 1%. The heights differ by 38% between resolver and
PDF, which is what made the resolver's 1:1250 on `SI727_800x500` unreachable —
PDF's margin loop overrode it to 1:2000. The DXF places blocks in real
whitespace found by its topological scan and so needs no reserve at all.

`checkMarginConstraint`'s docstring says the figure must fit within 90% of the
drawing area; the constant is `MARGIN_FACTOR = 0.75`. Both go under this design.

### 5. The title band is not the problem

The two renderers compose their title blocks from different code — DXF from the
formatters exported by `dxfGenerator.js:128-217`, PDF from `_buildTitleBlockTexts`
(`:4253`) — so their reserved bands were suspected of diverging. Measured on
`sampleRealisticPlan`: PDF 51.9 mm, DXF 46.2 mm, a difference of **5.6 mm**, about
1.4% of a 400 mm content height and far below one ladder step.

Promoting the formatters into `app-shared` would change PDF title *text*, not
just its height, for no measured benefit. The bands stay independent; a drift
test guards the gap instead.

Caveat on the measurement: one fixture, with a single-line designation and a
single-line figure description. A multi-line designation could add roughly 8 mm
per extra line if the two char-width budgets disagree. The drift test covers
that case more cheaply than sharing the code would.

### 6. Tiled output inherits the defect

`generateTiledGeoPDF` (`:12447`) renders each tile with `forcedScale` and equal
`tileWidthM`. Equal extents fit the same box identically, so tiles mosaic
consistently with each other — at the wrong stated scale. Tiling is only correct
once the renderer honours the scale.

## Design

### §1 Canonical drawing area

`app-shared/planSheeting.js`:

```js
drawingAreaMm(sheetName, { titleBandMm = TITLE_BAND_ESTIMATE_MM })
  -> { widthMm:  sheet.width  - MARGIN_LEFT - MARGIN_RIGHT,
       heightMm: sheet.height - MARGIN_TOP  - MARGIN_BOTTOM - titleBandMm }
```

The real available rectangle: the margin-inset sheet less the one reservation
both renderers genuinely make. `RESERVE_W` and `RESERVE_H` are deleted — they
stood in for block room in a design where nothing measured it.

`TITLE_BAND_ESTIMATE_MM = 55` is deliberately conservative, above both measured
bands. Each renderer passes its own measured band when it re-resolves, so the
estimate is only ever used by the preview, which is a hint.

Alongside it, `FIGURE_MAX_FRACTION = 0.75`: the share of the available area the
figure may occupy, the remainder being the budget for the Schedule of Areas,
coordinate list and endorsement blocks. This is `MARGIN_FACTOR` from
`checkMarginConstraint`, promoted rather than deleted — see §4.

### §2 The PDF draws at the scale

The change that makes the geometry correct.

**Naming.** Two rectangles are involved and today both are called figure bounds.
This design separates them: the **available area** is what `drawingAreaMm`
returns — where the figure is *allowed* to go — and the **figure box** is the
scale-sized rectangle the figure actually occupies inside it. The figure box is
derived from the scale and the extent; the available area only decides which
scales are feasible.

| Location | Change |
|---|---|
| `geometry.js:553` `calculateMapBounds` | drop `figureScale = 0.95`; `figure` becomes the content rectangle, band subtracted where the band is known |
| `pdfkitGeoPDF.js` after scale resolution | set `figureBounds` to exactly `extent_m / S × 1000` mm in points, positioned by the existing `alignX` rule and below the band |
| `geometry.js:518` `INSET_FACTOR` | becomes `pdfBounds.insetFactor ?? 0.05`; the scale-sized box passes `0`, so the min-fit lands exactly on `S`. No other caller changes |
| `pdfkitGeoPDF.js:10521` | delete the extent-expansion block |
| `pdfkitGeoPDF.js:9599` `checkMarginConstraint` | delete the per-renderer check; its `MARGIN_FACTOR = 0.75` budget survives as the resolver's `FIGURE_MAX_FRACTION`, so feasibility becomes "does the scale-sized figure fit within 75% of the canonical area" |
| `pdfkitGeoPDF.js:9633` `calculateOptimalScale` | walk the resolver ladder against the canonical area. `needsScaleUp` block-placement escalation is untouched |
| `pdfkitGeoPDF.js:4787` `drawScaleBar` | derive `metersPerPoint` from `S`, not `_figW` |

The box carries the scale, so every existing consumer of `figureBounds` — block
placement, `alignX`, `InsetManager`, tick clamping — keeps working and starts
telling the truth without being touched.

### §3 The DXF

Already scale-true by construction: geometry stays in ground metres and the
paper frame is sized around it through `mmToGround(mm, S) = mm * S / 1000`
(`dxfGenerator.js:466`). The only change is that its feasibility check consults
the shared `drawingAreaMm`. Its drawing math and its own `titleBandH` are
untouched.

This is what closes the tracked ~73pt PDF/DXF `mapBounds` sizing gap: the two
formats stop allocating different amounts of page to the same figure because
the figure's size stops being a function of the page at all.

### §4 Whitespace for blocks — a fill ceiling, not an ordering hint

An earlier draft of this section called `MARGIN_FACTOR = 0.75` a fudge, deleted
it, and proposed ordering candidates by leftover whitespace instead. That was
wrong, and the numbers show why.

`MARGIN_FACTOR` is not a fudge. Its comment states its job exactly — "outside
figure must occupy ≤75% of drawing area, leaving 25% for blocks" — and it is the
only place in the PDF that reserves block room against a measured quantity.
Deleting it, combined with an honest (and therefore larger) available area, sends
the resolver straight to the fullest candidate on the smallest sheet: for
`sampleRealisticPlan`, 1:1000 on `SI727_500x400` at **100% fill**, a figure
covering the entire drawing area with nowhere for the Schedule of Areas to go.
Every such plan then fails block placement and escalates, at 280 s a render.

Ordering cannot fix this. The ladder is ordered smaller-sheet-first, so a
whitespace hint only re-orders candidates *within* one sheet; the sheet choice —
which is what determines whether blocks fit — is already settled by the time the
hint applies.

So the budget belongs in **feasibility**: a candidate is feasible only if the
scale-sized figure fits within `FIGURE_MAX_FRACTION` of the available area in
both dimensions. That is what `checkMarginConstraint` was enforcing per-renderer;
§1 promotes it to the shared model so all three consumers apply one budget
instead of the PDF applying it alone.

Escalation remains the fallback for the cases geometry cannot predict — block
placement depends on the figure's shape, not its bounding box — but it stops
being the *routine* path, which is what keeps the render cost bounded.

### §5 What this does not change

- The ladder ordering decided with the surveyor: avoid tiling > smaller sheet >
  larger figure.
- Reg 32(3): the 1:500 mandate still overrides both a declared scale and the
  auto path.
- An explicit scale is still honoured, with the sheet escalating rather than the
  scale being silently corrected. Under this design that guarantee becomes real
  for the first time — today a declared scale changes only the caption.
- PDF title block text, DXF drawing math, block placement, tick logic.

## Testing

**Scale truth, measured from the drawn output.** The load-bearing test: for each
fixture, assert the drawn figure's millimetres-per-metre equals `1000 / S`
within a tight tolerance, computed from the actual `transformCoords` output of
the outside-figure vertices — not from any model of the page.

This is the mistake to avoid repeating. The `auto never produces a
postage-stamp figure` guard added in `242ec69` measures fill from `pdf.scale`
against the resolver's own area model, so it validates the *label*: it would
pass unchanged on a plan drawn at the wrong size. It gets re-pointed at the
drawn geometry.

- **PDF↔DXF drawn-size parity**: both generators report the same drawn figure
  size in mm for the same fixture — the property Phase 1's parity suite claimed
  via the label.
- **Title-band drift**: PDF's measured band and DXF's computed band stay within
  15 mm, so the decision in §1 fails loudly if either title block changes.
- **Declared scale is honoured metrically**: rendering at 1:1000 and at 1:2000
  produces figures whose drawn sizes differ by exactly 2×.
- **Label fit**: stand numbers stay inside their parcels, and beacon labels stay
  clear of the features they annotate, on the dense fixture. This must land
  *before* §2, not after — it is the regression surface the existing suite is
  blind to, and the one §2 is most likely to break (see Risk 1).
- **Snapshot regeneration**: `pdfkitGeoPDF.snapshot.test.js` pins rendered text
  x/y for three fixtures. With both the sheet and the figure size changing, every
  position moves, so the diff cannot be reviewed line by line. Regenerate it, then
  judge the result by rendering a fixture and looking at it — the label-fit test
  above is what actually guards this, not the snapshot.

## Risk

Every existing plan becomes a materially different document. For
`sampleRealisticPlan`:

| | Sheet | Stated | Drawn figure |
|---|---|---|---|
| today | SI727_1000x800 | 1:600 (true 1:439) | 683 × 444 mm |
| after, no fill ceiling | SI727_500x400 | 1:1000 | 300 × 195 mm |
| after, with §4's ceiling | SI727_500x400 | 1:1500 | **200 × 130 mm** |
| after, if ordering preferred a larger figure | SI727_1000x800 | 1:500 | 600 × 390 mm |

Three things follow, in descending order of how likely they are to bite.

**1. Label fitting is the primary regression surface — not block placement.**
The figure shrinks ~3.4× linearly and ~11× by area while every text element keeps
its point size, so stand numbers, beacon labels and edge labels all become
relatively ~3× larger against the parcels they must fit inside. The adaptive
labelling machinery and the cartographic font hierarchy (title 7 mm > designation
5 mm > stand labels capped at 3.5 mm) were both calibrated against figures drawn
1.4–2.3× oversized. This is where the damage will be, and no existing test covers
it directly.

**2. The sheet-ordering preference now dominates the outcome.** The last two rows
above differ by 3× in figure size and two sheet sizes, and the only difference
between them is the "avoid tiling > smaller sheet > larger figure" ordering agreed
during Phase 1 — when these numbers were hypothetical. Scale truth is not what
makes the plan small; the ordering is. That choice should be re-confirmed with
the surveyor against the real numbers before §2 lands, and it is a resolver-level
change if it flips, not a rework of this design.

**3. The snapshot diff will be total.** `pdfkitGeoPDF.snapshot.test.js` pins
rendered text x/y for three fixtures; with the sheet and figure size both
changing, effectively every position moves. It will show the damage from (1)
rather than hide it, but it cannot be reviewed line by line — it needs to be
regenerated and then judged by rendering a fixture and looking at it.

Mitigation: land §1 and §3 (shared area, DXF feasibility) before §2, so the
ladder is correct before the geometry moves; then §2 behind the drawn-geometry
test, which fails loudly and specifically if the figure is not the size the scale
demands. Add a label-fit assertion — stand numbers remain inside their parcels on
the dense fixture — before §2 rather than after, since that is the failure mode
the existing suite is blind to.

## Verification of one output against a real plan

`D:\para2026` holds Surveyor-General reference material for a real survey with
its CSV. Once §2 lands, one fixture should be rendered and a known distance
scaled off it by hand against that reference, as a check that the tolerance in
the drawn-geometry test corresponds to a plan a surveyor would accept.

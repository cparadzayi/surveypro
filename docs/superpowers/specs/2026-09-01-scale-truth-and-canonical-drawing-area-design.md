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

The drawn geometry is identical in both runs. Declaring a scale changes only
the printed label; the figure occupies exactly the same area of paper either
way. At 1:1000 the sheet is out by a factor of 2.3.

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
| `pdfkitGeoPDF.js:9599` `checkMarginConstraint` | delete, with `MARGIN_FACTOR`; feasibility becomes "does the scale-sized figure fit the canonical area" |
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

### §4 Whitespace for blocks

Feasibility carries no fudge factor. Among candidates that fit, order by
leftover whitespace so block placement usually succeeds on the first render.

The distinction is load-bearing: whitespace is an **ordering hint, never a fit
filter**. A legitimately tight plan must still be allowed to render rather than
being escalated away from a scale it fits. This is also the tuning knob for
escalation cost — each escalation re-renders the whole plan, which is why the
dense Maglas fixture costs 280 s.

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
- **Snapshot regeneration**: `pdfkitGeoPDF.snapshot.test.js` pins rendered text
  x/y for three fixtures and will move wholesale. The diff must be read, not
  accepted — it is the most likely place for a real regression to hide.

## Risk

Every existing plan's figure changes size, generally getting smaller. On the
measured fixture the true denominator is 27–56% finer than the stated one, which
means the figure is drawn 1.4× to 2.3× larger in each dimension than the scale
claims. This is the correction, but it is not cosmetic:

- More plans will fail block placement at their first candidate and escalate,
  and escalation is expensive.
- Plans that previously "fit" only because fit-to-box shrank them may now need a
  larger sheet or tiling.
- The snapshot diff is large enough to hide a genuine defect inside an expected
  change.

Mitigation: land §1 and §3 (shared area, DXF feasibility) before §2, so the
ladder is correct before the geometry moves; then §2 behind the drawn-geometry
test, which fails loudly and specifically if the figure is not the size the
scale demands.

## Verification of one output against a real plan

`D:\para2026` holds Surveyor-General reference material for a real survey with
its CSV. Once §2 lands, one fixture should be rendered and a known distance
scaled off it by hand against that reference, as a check that the tolerance in
the drawn-geometry test corresponds to a plan a surveyor would accept.

# PDF/DXF coordinate tick corner-rounding parity

## Revision note (post-Task-1, second root cause discovered)

Task 1 (unifying the floor/ceil corner-snap interval, merged as its own
commit within this branch) is correct and complete for what it targeted —
task-reviewed with zero findings. But upgrading `tickMarkParity.test.js`
from count-only to actual coordinate-value parity (originally planned as
Task 2) revealed a **second, separate, pre-existing** source of PDF/DXF
corner divergence that Task 1 was never scoped to touch: both PDF's
tick-bound functions and DXF's `addCornerCrosses` apply an *inward clamp*
after the floor/ceil snap, stepping a corner inward by one interval if its
tick+label footprint would overflow the drawing area. This clamp is
**structurally asymmetric**: PDF's clamp only ever adjusts the Southing
(`actualX_min`/`actualX_max`) bounds, to keep ticks clear of the map's
top/bottom edges and the title block — it has **no code path at all** for
adjusting the Westing (`actualY_min`/`actualY_max`) bounds to keep ticks
clear of the map's left/right edges. DXF's `addCornerCrosses` clamp, by
contrast, already adjusts all four sides independently. Reproduced
deterministically on the existing `sharedPlan` test fixture: PDF's clamp
fires on the vertical axis (shrinking the Southing range) while DXF's fires
on the horizontal axis (shrinking the Westing range), for the same plan —
so even with Task 1's interval fix in place, the final corner coordinates
still disagree.

**Decision (confirmed with user):** extend this spec's scope to also port
DXF's four-sided clamp behavior into PDF — specifically, add the missing
Westing (left/right) clamp to PDF's two tick-bound functions, mirroring the
existing Southing (top/bottom) clamp's structure. This is chosen over the
alternative (restricting DXF's clamp back to X-only) because DXF's
four-sided design is more defensible cartographically — a tall/narrow
figure can run tick labels off the left/right page edge just as a wide/short
figure can run them off the top/bottom, and PDF currently has zero
protection against the former. The "Design" section below is extended with
this addition (added as "Design: Part 2"); everything in the original
"Design" section (now "Design: Part 1") is unchanged and already
implemented (Task 1).

## Revision note 2 (post-Task-2, third root cause discovered)

Task 2's Westing clamp (four-sided clamp parity) is correct and complete —
task-reviewed with zero findings. But attempting Task 3's value-parity test
upgrade with both Task 1 and Task 2 in place still failed: PDF's grid
(`X ∈ [2247200, 2247400]`) and DXF's grid (`X ∈ [2247100, 2247400]`)
disagreed by one row on the Southing (top/bottom) axis, for the *existing*
clamp both formats already had before this branch started.

Root cause: PDF's Southing clamp (`MAP_EDGE_MARGIN = 30` PDF points, applied
identically to all sides) and DXF's Southing clamp
(`addCornerCrosses`'s `padTop`/`padMin`, direction-aware — a larger margin
for the side a label extends toward, a smaller margin for the bare-arm
sides) are **both legitimate margin heuristics that happen to be calibrated
differently**, not a missing-vs-present asymmetry like Task 2's gap. For
`sharedPlan` at 1:500, PDF's flat 30pt margin is larger than DXF's bare-arm
`padMin` in physical-paper-equivalent terms, so PDF clamps a row DXF keeps.

**Decision (confirmed with user, after presenting two options — port DXF's
direction-aware footprint margin into PDF, or simplify both to one shared
flat margin):** port DXF's direction-aware approach into PDF, chosen over
the simpler flat-margin option. This is de-risked by a concrete finding:
PDF's own tick-label rendering code (`renderOutsideFigureTickMarks`,
~line 1767-1780) already draws the Y-label unconditionally *above* the tick
and the X-label unconditionally *to the right* — the exact same
fixed-direction assumption DXF's `padTop`/`padR`/`padMin` formula is built
on. The two formats' underlying geometric model already matches; only the
margin *values* (computed via different unit systems — PDF page-points vs
DXF ground-mm-at-scale) disagree. This is "Design: Part 3" below.

## Problem

`app-backend/src/services/__tests__/tickMarkParity.test.js` documents a
known, previously-unaddressed gap: PDF and DXF can compute genuinely
different coordinate-tick corner values for the same plan, even though both
independently space their own ticks at a scale-safe interval. The test
deliberately only asserts tick-*count* parity, with an inline comment
explaining why value parity isn't asserted:

> PDF's corner bounds (`actualY_min`/`actualY_max` in `pdfkitGeoPDF.js`) are
> rounded to the nearest 5m/10m — a legacy cosmetic-rounding rule that
> predates this feature — while DXF's corner bounds (`xL`/`xR`/`yB`/`yT` in
> `dxfGenerator.js`) are snapped outward to the new
> `chooseTickIntervalMetres(scale)` grid interval... a real, pre-existing
> PDF/DXF corner-rounding inconsistency, not something this test should
> paper over or that [the coordinate-grid tick marks] feature is scoped to
> fix. Tracked as a follow-up.

This is that follow-up.

## Root cause

`app-backend/src/services/pdfkitGeoPDF.js` has two near-duplicate functions
that each independently compute the same tick-corner bounds:
`calculateTickMarkBounds` (~line 1555, used for collision/placement
bookkeeping during layout) and `renderOutsideFigureTickMarks` (~line 1791,
the actual renderer). Both carry **the same legacy dual grid-snap system**,
which predates the `chooseTickIntervalMetres`/`computeGridTickPositions`
scale-aware tick system introduced by the coordinate-grid-tick-marks
feature:

1. A fixed 50m grid (`GRID_INTERVAL = 50`, producing
   `gridY_min`/`gridY_max`/`gridX_min`/`gridX_max`) — used only for
   map-edge/title-block collision probing and as the step size in the
   clamp-adjustment loops that nudge tick X positions to avoid the title
   block or run off the page.
2. A separate "cartographic rounding" pair — `actualY_min`/`actualY_max`
   snapped to a fixed 5m or 10m (chosen by a `>200m range` heuristic),
   `actualX_min`/`actualX_max` snapped to the same fixed 50m grid as (1) —
   these are the values actually fed into `computeGridTickPositions` as
   `aMin`/`aMax`/`bMin`/`bMax`, i.e. the real corner bounds ticks are placed
   within.

`chooseTickIntervalMetres(scaleDenominator)` is already called in both
functions today — but only to determine the *spacing between* ticks along
those bounds, not the bounds themselves. `dxfGenerator.js`'s equivalent,
`addCornerCrosses` (written fresh for the coordinate-grid-tick-marks
feature), does not have this split: it computes a single
`G = chooseTickIntervalMetres(S)` and uses it uniformly for both the corner
snap (`xL`/`xR`/`yB`/`yT`) and the inward-clamp step size. This is the
correct, principled design the legacy PDF code predates.

Because PDF's corner snap (5m/10m/50m, scale-independent) and DXF's corner
snap (`chooseTickIntervalMetres(scale)`, scale-aware) are different
functions of different inputs, they generally disagree — even though, once
a format has picked its own corners, both formats correctly space ticks
along them at a ruler-safe interval.

## Scope decision

**Approach A (chosen):** Port DXF's unified-interval design into PDF —
replace the legacy 5m/10m/50m corner-snap constants in both
`calculateTickMarkBounds` and `renderOutsideFigureTickMarks` with
`chooseTickIntervalMetres(scaleDenominator)` (hoisted to the top of each
function; already computed later in each, not duplicated), and use that
same interval as the clamp-loop step size. Since the fixed-50m
`gridY_min`/`gridY_max`/`gridX_min`/`gridX_max` become mathematically
identical to `actualY_min`/`actualY_max`/`actualX_min`/`actualX_max` once
both are driven by the same interval, the duplicate variable pair is
collapsed into one — removing the exact "two things meant to match, silently
drifting apart" pattern that caused this bug, not just patching its current
symptom.

Rejected alternatives:

- **Make DXF match PDF's legacy rule instead** — rejected. DXF's approach is
  the newer, correct one; it's the entire point of
  `chooseTickIntervalMetres`, introduced specifically so tick spacing stays
  ruler-safe across scales. Reverting DXF would undo that work.
- **Leave the mismatch as documented, permanent behavior** — rejected; this
  spec exists because the user asked for it to be fixed, not accepted.

## Design: Part 1 (interval-snap unification — implemented, Task 1)

In `app-backend/src/services/pdfkitGeoPDF.js`, apply the identical change to
both `calculateTickMarkBounds` (~line 1555) and `renderOutsideFigureTickMarks`
(~line 1791).

**Before** (in `calculateTickMarkBounds`; `renderOutsideFigureTickMarks` has
the same code with added `logger.info(...)` calls interleaved — those stay,
only the constants/variables described below change):

```js
  // Find grid coordinates (multiples of 50) - but keep actual polygon extent for tick placement
  const GRID_INTERVAL = 50;
  const gridY_min = Math.floor(minY / GRID_INTERVAL) * GRID_INTERVAL;
  const gridY_max = Math.ceil(maxY / GRID_INTERVAL) * GRID_INTERVAL;
  const gridX_min = Math.floor(minX / GRID_INTERVAL) * GRID_INTERVAL;
  const gridX_max = Math.ceil(maxX / GRID_INTERVAL) * GRID_INTERVAL;

  // Round Y (Westing) values to nearest multiple of 5 or 10 for clean cartographic labels
  // Use multiples of 10 when the range is large (>200m), multiples of 5 otherwise
  const _yRange = maxY - minY;
  const _ySnap  = _yRange > 200 ? 10 : 5;
  const actualY_min = Math.floor(minY / _ySnap) * _ySnap; // Round down to nearest snap
  const actualY_max = Math.ceil(maxY  / _ySnap) * _ySnap; // Round up to nearest snap
  // X (Southing) values: round to nearest multiple of 50 for clean cartographic labels
  const actualX_min = Math.floor(minX / GRID_INTERVAL) * GRID_INTERVAL; // Round down to nearest 50
  const actualX_max = Math.ceil(maxX  / GRID_INTERVAL) * GRID_INTERVAL; // Round up to nearest 50
```

**After:**

```js
  // Corner bounds snap to the same scale-aware interval used for tick
  // spacing (chooseTickIntervalMetres) — matches DXF's addCornerCrosses
  // exactly, so both formats compute the same corner coordinates for the
  // same plan. Previously PDF used a separate legacy 5m/10m/50m rule here
  // (predating this interval system) while only using the interval for
  // spacing between ticks, not the bounds themselves — that mismatch is
  // what caused PDF/DXF corner values to disagree.
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const actualY_min = Math.floor(minY / _tickIntervalM) * _tickIntervalM;
  const actualY_max = Math.ceil(maxY  / _tickIntervalM) * _tickIntervalM;
  const actualX_min = Math.floor(minX / _tickIntervalM) * _tickIntervalM;
  const actualX_max = Math.ceil(maxX  / _tickIntervalM) * _tickIntervalM;
```

Every remaining use of `gridY_min`/`gridY_max`/`gridX_min`/`gridX_max` in
the rest of the function (the map-edge/title-block probe-and-clamp logic)
is replaced with `actualY_min`/`actualY_max`/`actualX_min`/`actualX_max`
respectively — they're now the same values, so this is a pure rename, not a
behavior change beyond what the corner-snap change itself causes. Every
`GRID_INTERVAL` reference in the clamp-step loops (`adjustedX +=
GRID_INTERVAL`, `gridX_max - GRID_INTERVAL`) becomes `_tickIntervalM`.

The existing later declaration `const _tickIntervalM =
chooseTickIntervalMetres(scaleDenominator);` (currently right before the
`computeGridTickPositions` call, ~line 1688 and ~line 1990) is deleted —
it's now the same hoisted constant from the top of the function, not
recomputed.

`renderOutsideFigureTickMarks`'s log line `` `[PDFKit] 📐 Grid tick
coordinates (50m intervals): Y=[...` `` (~line 1862) is updated to report
the actual `_tickIntervalM` value instead of a hardcoded "50m".

No other part of either function changes. DXF (`dxfGenerator.js`,
`addCornerCrosses`) is not touched — it's already the reference
implementation this port matches.

## Design: Part 2 (Westing left/right clamp — implemented, Task 2)

`transformCoords(y, x, extent, mapBounds)` (`pdfkitGeoPDF/geometry.js:505`)
computes `pdfX` from `easting = -y`: as Cape Lo Y (Westing) increases,
`pdfX` decreases. **Verified empirically** (not just derived algebraically)
by calling `transformCoords` directly with two Y values against a fixed
extent/mapBounds: Y=97300 → pdfX=860.0, Y=97800 → pdfX=140.0 — confirming
**larger Y maps toward the LEFT page edge, smaller Y toward the RIGHT.**
This is the mirror image of the existing Southing clamp, where `pdfY`
decreases as Cape Lo X (Southing) decreases (smaller X = further north =
higher on the page = smaller `pdfY`) — `actualX_min` is checked against the
map's *top* edge, `actualX_max` against the *bottom*.

Add a new block to both `calculateTickMarkBounds` and
`renderOutsideFigureTickMarks`, placed after the existing Southing
(`topX`/`bottomX`) clamp block and before the `computeGridTickPositions`
call, mirroring that block's structure exactly but on the Westing axis:

```js
  // Adjust Y (Westing) bounds for map left/right edges — mirrors the X-axis
  // (Southing) clamp above, and ports DXF addCornerCrosses's four-sided
  // clamp: PDF previously had no horizontal-edge clamp at all. Larger Y
  // maps toward the LEFT page edge, smaller Y toward the RIGHT (verified
  // empirically against transformCoords — see
  // docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md).
  let leftY = actualY_max;
  let rightY = actualY_min;

  const leftPdfPoint = transformCoords(actualY_max, actualX_min, extent, mapBounds);
  if (leftPdfPoint.x < mapBounds.x + MAP_EDGE_MARGIN) {
    let adjustedY = actualY_max;
    let adjustedPdfPoint = leftPdfPoint;
    while (
      adjustedPdfPoint.x < mapBounds.x + MAP_EDGE_MARGIN &&
      adjustedY > actualY_min
    ) {
      adjustedY -= _tickIntervalM;
      adjustedPdfPoint = transformCoords(adjustedY, actualX_min, extent, mapBounds);
    }
    leftY = adjustedY;
  }

  const rightPdfPoint = transformCoords(actualY_min, actualX_min, extent, mapBounds);
  if (rightPdfPoint.x > mapBounds.x + mapBounds.width - MAP_EDGE_MARGIN) {
    let adjustedY = actualY_min;
    let adjustedPdfPoint = rightPdfPoint;
    while (
      adjustedPdfPoint.x > mapBounds.x + mapBounds.width - MAP_EDGE_MARGIN &&
      adjustedY < actualY_max
    ) {
      adjustedY += _tickIntervalM;
      adjustedPdfPoint = transformCoords(adjustedY, actualX_min, extent, mapBounds);
    }
    rightY = adjustedY;
  }
```

Then change the `computeGridTickPositions` call's `aMin`/`aMax` from
`actualY_min`/`actualY_max` to `rightY`/`leftY` (smaller/larger, matching
the `aMin < aMax` convention `computeGridTickPositions` expects):

```js
  const _tickPoints = computeGridTickPositions({
    aMin: rightY, aMax: leftY, bMin: topX, bMax: bottomX, intervalM: _tickIntervalM,
  });
```

Unlike the existing Southing clamp (which gives the top edge an iterative
while-loop but the bottom edge only a single-interval-step check — an
existing asymmetry in code that predates this spec), both the new left and
right clamps use the iterative while-loop form, matching DXF's `for
(g = 0; ...; g++)` iterative-until-clear approach on all four sides. This
new code doesn't need to preserve the old single-step limitation; matching
the more robust reference behavior is better than propagating an
inconsistency into new code.

No title-block-style secondary obstruction check is added for left/right —
DXF's `addCornerCrosses` only checks against a single drawing-area
rectangle for all four sides (no per-side secondary check beyond that), so
matching that keeps this addition scoped to exactly what the reference
implementation does, without inventing new behavior DXF doesn't have either.

## Design: Part 3 (direction-aware margins — new, Task 4)

DXF's `addCornerCrosses` (`dxfGenerator.js:908-936`) computes three
distinct margins from the same physical footprint constants
(`arm = mm(4)`, `lblH = mm(2.5)`, `off = mm(1.5)`):

```js
const padR   = arm + off + mm(24);        // X= label runs right
const padTop = arm + off + lblH + mm(2);  // Y= label runs up
const padMin = arm + mm(2);               // bare arm on the other two sides
```

PDF's two tick-bound functions currently use one flat `MAP_EDGE_MARGIN =
30` for all four edge checks (Task 1's Southing checks, Task 2's new
Westing checks alike). Replace it with four margins built from PDF's own
already-declared footprint constants (`TICK_LENGTH`, `LABEL_OFFSET`,
`LABEL_CLEARANCE`), mirroring DXF's three-way split (`padR`/`padTop`/
`padMin` → PDF's right/top/bare-arm), with the label-width component
estimated from the actual candidate coordinate at each check (more precise
than DXF's fixed `mm(24)` guess, since PDF already has the real value in
scope at that point) using the same `formatCoord`-style formatting the
final rendered labels use:

```js
  // Footprint-aware margins for the 4 edge clamps below — ports DXF
  // addCornerCrosses's per-direction padTop/padR/padMin
  // (dxfGenerator.js:922-936). PDF's Y-label always renders above the tick,
  // X-label always to the right (confirmed against this function's own
  // label-bounds code) — the same fixed-direction assumption DXF's formula
  // is built on. Previously all 4 sides used one flat MAP_EDGE_MARGIN; DXF
  // (and now PDF) uses a smaller "bare arm" margin for the two sides with
  // no label (bottom, left) and a larger "label" margin for the two sides
  // a label extends toward (top, right). Label width is estimated from the
  // actual candidate coordinate at each check, not a fixed placeholder.
  const _formatCoordForMargin = (value) => {
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString("en-US").replace(/,/g, " ");
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };
  const _CHAR_WIDTH = 4.5;
  const BARE_ARM_MARGIN = TICK_LENGTH + LABEL_CLEARANCE;
  const yLabelMargin = (yValue) =>
    TICK_LENGTH + LABEL_OFFSET + LABEL_CLEARANCE +
    `Y = ${_formatCoordForMargin(yValue)}`.length * _CHAR_WIDTH;
  const xLabelMargin = (xValue) =>
    TICK_LENGTH + LABEL_OFFSET + LABEL_CLEARANCE +
    `X = ${_formatCoordForMargin(xValue)}`.length * _CHAR_WIDTH;
```

Then substitute into the four existing clamp checks (all four already
built in Tasks 1/2):

- **Top** (tests `actualY_min`'s Y-label extending up):
  `mapBounds.y + MAP_EDGE_MARGIN` → `mapBounds.y + yLabelMargin(actualY_min)`
  (used in both the map-edge check and its loop condition; `actualY_min` is
  fixed for this whole check, so the margin is a constant, computed once).
- **Bottom** (bare arm): `mapBounds.y + mapBounds.height - MAP_EDGE_MARGIN`
  → `mapBounds.y + mapBounds.height - BARE_ARM_MARGIN`.
- **Left** (bare arm): `mapBounds.x + MAP_EDGE_MARGIN` →
  `mapBounds.x + BARE_ARM_MARGIN`.
- **Right** (tests the X-label extending right; the actual X value at a
  right-edge tick can be anywhere in `[actualX_min, actualX_max]`, so use
  the longer of the two formatted lengths for a conservative estimate):
  `mapBounds.x + mapBounds.width - MAP_EDGE_MARGIN` →
  `mapBounds.x + mapBounds.width - Math.max(xLabelMargin(actualX_min), xLabelMargin(actualX_max))`.

`calculateTickMarkBounds` does not currently declare `LABEL_OFFSET`/
`LABEL_CLEARANCE` until later, inside its `tickMarks.forEach` block (with
existing `// MUST match renderOutsideFigureTickMarks()` comments noting
they're intentionally duplicated) — hoist both declarations up next to the
existing `TICK_LENGTH`/`MAP_EDGE_MARGIN`/`TITLE_BLOCK_CLEARANCE` block,
removing the now-redundant later declarations (`FONT_SIZE` stays where it
is — only used for the later bounds-box height calculation, not the margin
formula). `renderOutsideFigureTickMarks` already declares all of
`TICK_LENGTH`/`LABEL_OFFSET`/`LABEL_CLEARANCE`/`FONT_SIZE` together near
its top — no hoisting needed there, just add the margin-computation block
and substitute the four checks.

`MAP_EDGE_MARGIN` itself is no longer used by any of the four edge checks
after this change; it is left declared (unused elsewhere in the function is
not expected — verify at implementation time whether it's referenced by
anything else in either function before deciding whether to delete it).

## Edge cases

- **`chooseTickIntervalMetres` always returns a positive "nice number"**
  (from `GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, ...]`) — same
  guarantee the function already provides for tick *spacing* today; using it
  for the corner snap too introduces no new degenerate-value risk.
- **Very small figures at large scale denominators** could in principle
  produce `actualY_min`/`actualY_max` close together (whole figure inside
  one grid cell) — this is the same `floor`/`ceil` pattern the legacy code
  already had, just with `chooseTickIntervalMetres`'s value range (which is
  wider than the legacy 5/10/50), so not a new risk class.
- **Both call sites already thread the same `scaleDenominator`** into
  `chooseTickIntervalMetres` today for tick spacing (that's why the two
  functions' tick *spacing* already agrees) — no new parameter plumbing
  needed; this change extends already-correct scale threading to the corner
  snap too.
- **Internal PDF self-consistency** (between `calculateTickMarkBounds`'s
  reserved bounds and `renderOutsideFigureTickMarks`'s actually-drawn
  bounds) is preserved — both functions get the identical change.
- **DXF is completely untouched** — no risk to DXF's existing, working tick
  behavior or its own test coverage.
- **Axis direction verified empirically, not just derived** — the
  larger-Y-maps-left / smaller-Y-maps-right relationship was confirmed by
  directly calling `transformCoords` with sample values, not assumed from
  reading the formula alone (algebra errors on axis-flip logic are an easy,
  hard-to-notice mistake class).
- **The `adjustedY > actualY_min` / `adjustedY < actualY_max` loop guards**
  prevent the left clamp from stepping past the right bound (or vice versa)
  — mirrors the existing Southing clamp's `adjustedX < gridX_max`-style
  guard (now `actualX_max`) and DXF's `xL + G < areaR` "don't cross over"
  guard.
- **No new degenerate case beyond what Part 1 already covers** — the
  left/right clamp only ever moves `actualY_min`/`actualY_max` closer
  together (toward each other), same direction-of-motion safety property
  the existing top/bottom clamp already relies on.
- **PDF's label-direction model was verified against the actual rendering
  code, not assumed** — Y-label-above/X-label-right is read directly from
  `renderOutsideFigureTickMarks`'s label-bounds computation, the same
  fixed-direction assumption DXF's formula already relies on.
- **The margin values are approximations by design, on both sides of the
  format boundary** — DXF's `mm(24)` is a fixed guess at typical label
  width; PDF's version is more precise (uses the actual candidate
  coordinate's formatted length) but is still an *estimate* made before the
  final tick set is chosen, same as DXF. Exact byte-identical margins
  between formats are not the goal — matching *clamp decisions* for
  realistic plans is; the physical-unit math checked before writing this
  design (PDF's new bare-arm margin ≈5.3mm-paper-equivalent vs DXF's
  ≈6mm) is close enough that this should resolve the specific test
  fixture's disagreement, verified empirically by the task's test, not by
  this arithmetic alone.
- **`MAP_EDGE_MARGIN` may become unused** by the four edge checks after this
  change — check both functions for any other reference before deciding
  whether to remove it; do not delete a constant still used elsewhere.

## Testing

- **Primary acceptance criterion — upgrade `tickMarkParity.test.js` from
  count-only to value parity.** The test already extracts full `Y = ...`
  label text from both PDF and DXF output; extend the assertion from
  `pdfYLabels.length === dxfYLabels.length` to comparing the actual
  (sorted) label value sets for deep equality. Add the same for `X = ...`
  labels (currently only `Y` is checked). Remove the now-stale comment
  explaining why only count parity is asserted — replace it with a comment
  confirming corner values now genuinely match, referencing this spec.
- **Regression guard**: `pdfkitGeoPDF.tickMarks.test.js` (and any DXF-side
  corner-cross tests) must still pass unchanged — tick *count* and *spacing*
  are not expected to change, only which corner values they're anchored to.
- **Full backend suite**, explicitly including `pdfkitGeoPDF.snapshot` (tick
  corner values are exactly the kind of position change that snapshot
  captures).
- **Visual verification**: regenerate both a PDF and a DXF for the same
  plan (reuse `tickMarkParity.test.js`'s own fixture) and visually confirm
  the corner tick labels now show identical coordinate values in both.

## Out of scope

- Any change to `dxfGenerator.js`'s `addCornerCrosses` — already correct,
  untouched.
- Any change to tick *spacing* logic (`computeGridTickPositions`,
  `chooseTickIntervalMetres` themselves) — only how the corner bounds fed
  into them are computed.
- Deduplicating `calculateTickMarkBounds` and `renderOutsideFigureTickMarks`
  into a single shared function — they remain two near-duplicate functions
  that must be kept in sync by hand, same as today; a full dedup is a
  separate, larger refactor not needed to close this specific gap.

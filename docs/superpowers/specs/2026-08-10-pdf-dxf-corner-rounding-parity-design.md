# PDF/DXF coordinate tick corner-rounding parity

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

## Design

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

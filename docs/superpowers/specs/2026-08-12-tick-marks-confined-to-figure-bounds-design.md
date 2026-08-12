# Confine coordinate-grid tick marks to the Outside Figure's actual bounds

## Problem

General Plan PDFs/DXFs draw a grid of coordinate tick-mark crosses (Y=/X=
labelled) around the Outside Figure. The tick grid's Y/X range is currently
rounded **outward** to the next "nice" interval boundary beyond the figure's
true min/max coordinates — e.g. a real Y-extent of 97367.95–97721.38 becomes
a tick range of 97300–97800 at a 100m interval. That's up to one full
interval of unnecessary margin reserved as a fixed obstacle on every side,
eating into the whitespace other blocks (most notably the Schedule of Areas
table) need, and increasing the chance of a tick/block collision on dense
plans. Confirmed visually against a real generated plan
(`MAG1_SH1_Shabani_2026-06-16`'s Stands 207-270/340-345 General Plan): the
printed tick range (Y 97300–97800) visibly exceeds the Outside Figure's own
printed coordinate table (Y 97367.95–97721.38).

## Root cause

Three near-duplicate copies of the same "round outward to a nice interval"
logic exist, one per call site that needs a tick-mark bounding box:

- PDF, obstacle-bounds pass: `calculateTickMarkBounds`
  (`pdfkitGeoPDF.js:1599-1603`)
- PDF, actual rendering pass: `renderOutsideFigureTickMarks`
  (`pdfkitGeoPDF.js:1896-1900`) — must stay in sync with the above or the
  reserved obstacle and the drawn tick positions diverge
- DXF: `addCornerCrosses` (`dxfGenerator.js:931-933`)

All three do the same thing: `Math.floor(min/interval)*interval` and
`Math.ceil(max/interval)*interval`, i.e. round outward. This is the exact
"two/three copies that must be kept in sync" pattern that has already
caused a real PDF/DXF drift bug in this same function once before
(`docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md`,
which fixed PDF using a different legacy snap rule than DXF's interval-based
one) — evidence this area of code needs a shared source of truth, not a
third independently-maintained copy of the fix.

Underneath the rounding, `computeGridTickPositions`
(`app-shared/block-definitions.js:573-602`) already always includes the
exact `aMin`/`aMax`/`bMin`/`bMax` it's given as tick positions (via
`steppedRange`'s `vals.push(end)`), so the "corners are exact" property
already holds — it's just exact relative to the *rounded-out* bounds each
caller hands it, not the figure's true bounds.

Downstream of the base rounding, each of the three call sites also has its
own existing edge/title-block-avoidance clamp (a loop that walks the
corner INWARD by one interval at a time if it would land too close to the
page margin or title block — PDF: `pdfkitGeoPDF.js:1610-1721`; DXF:
`dxfGenerator.js:939-948`). That logic is unrelated to this bug (it's about
avoiding *other fixed page elements*, not the figure) and must be preserved
exactly as-is — it already only ever moves a bound further inward, never
outward, so it composes safely with a more-inward starting bound.

## Scope decision

**Approach (chosen):** Add one new shared helper,
`computeInwardTickBounds`, next to the existing `chooseTickIntervalMetres`/
`computeGridTickPositions` in `app-shared/block-definitions.js`. It rounds
each axis **inward** instead of outward — `Math.ceil(min/interval)*interval`,
`Math.floor(max/interval)*interval` — so the outermost tick on each side is
the round-number multiple closest to, but never beyond, the figure's true
extent. Falls back to the figure's own exact min/max on an axis where the
figure is smaller than one interval (no round multiple exists strictly
between min and max) — still guarantees ticks never exceed the figure,
just without a round label in that rare degenerate case. All three call
sites replace their local 4-line floor/ceil block with one call to this
helper.

Also: add `25` and `75` to `GRID_NICE_NUMBERS`
(`app-shared/block-definitions.js:554`), the candidate interval ladder
`chooseTickIntervalMetres` picks from — per your explicit request, to give
the selector finer-grained choices between today's 20→50 and 50→100 gaps,
improving how evenly tick marks distribute across a range of figure sizes.
Kept as an *addition* to the existing ladder (`1, 2, 5, 10, 20, 25, 50, 75,
100, 200, 500, 1000, 2000, 5000, 10000`), not a replacement — the smaller
(1, 2, 5) and larger (200+) entries remain available for very small or very
large plans.

Rejected alternatives:

- **Fix the outward-rounding independently at each of the three call
  sites**, matching the "each copy fixed separately" pattern that already
  caused one drift bug in this exact code. Rejected for the same reason a
  shared helper was chosen for `chooseTickIntervalMetres`/
  `computeGridTickPositions` themselves — three copies of a fix is three
  chances for the next person to update one and miss the others.
- **Clamp exactly to the figure's true min/max on every axis** (no
  round-number ticks at all). Rejected per your explicit choice — surveyors
  reference coordinate ticks against a physical scale ruler, and round
  numbers (Y = +97 400) are far easier to work with than exact beacon
  coordinates (Y = +97 367.95); only fall back to exact values in the rare
  degenerate case where no round number fits.
- **Replace `GRID_NICE_NUMBERS` with a narrower 10/20/25/50/75/100-only
  ladder.** Rejected per your explicit choice — keeps today's working
  behavior for plans at the very small or very large end of the range
  intact, only adds the two new mid-range options.

## Design

### 1. New shared helper (`app-shared/block-definitions.js`, placed immediately after `computeGridTickPositions`, ~line 602)

```js
/**
 * Round a figure's true min/max INWARD to the nearest tick-interval
 * multiple on each axis, so no tick mark ever falls outside the figure's
 * actual bounds. Ticks still land on nice round numbers — they're just one
 * interval short of the figure's true extent rather than one interval
 * beyond it. Falls back to the exact min/max on an axis where the figure
 * is smaller than one interval (no round multiple strictly between min and
 * max) — still guarantees confinement, just without a round label in that
 * rare case.
 *
 * Axis-agnostic (aMin/aMax/bMin/bMax, not Y/X) like computeGridTickPositions
 * — its return shape is exactly that function's input shape, so callers can
 * pass this helper's output straight into computeGridTickPositions. Shared
 * by pdfkitGeoPDF.js (calculateTickMarkBounds, renderOutsideFigureTickMarks)
 * and dxfGenerator.js (addCornerCrosses) so all three resolve identical
 * corner bounds for the same figure — previously three independent
 * outward-rounding copies, the same class of drift risk already fixed once
 * for the rounding rule itself, see
 * docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md
 */
export function computeInwardTickBounds({ aMin, aMax, bMin, bMax, intervalM }) {
  const roundInward = (min, max) => {
    const inwardMin = Math.ceil(min / intervalM) * intervalM
    const inwardMax = Math.floor(max / intervalM) * intervalM
    return inwardMin <= inwardMax ? { min: inwardMin, max: inwardMax } : { min, max }
  }
  const a = roundInward(aMin, aMax)
  const b = roundInward(bMin, bMax)
  return { aMin: a.min, aMax: a.max, bMin: b.min, bMax: b.max }
}
```

### 2. `GRID_NICE_NUMBERS` (`app-shared/block-definitions.js:554`)

Replace:

```js
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
```

with:

```js
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500, 1000, 2000, 5000, 10000]
```

### 3. PDF: `calculateTickMarkBounds` (`pdfkitGeoPDF.js:1592-1603`)

Replace the comment + 4-line rounding block:

```js
  // Corner bounds snap to the same scale-aware interval used for tick
  // spacing (chooseTickIntervalMetres) — matches DXF's addCornerCrosses
  // exactly, so both formats compute the same corner coordinates for the
  // same plan. Previously this used a separate legacy 5m/10m/50m rule
  // (predating this interval system) while only using the interval for
  // spacing between ticks, not the bounds themselves — see
  // docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const actualY_min = Math.floor(minY / _tickIntervalM) * _tickIntervalM;
  const actualY_max = Math.ceil(maxY  / _tickIntervalM) * _tickIntervalM;
  const actualX_min = Math.floor(minX / _tickIntervalM) * _tickIntervalM;
  const actualX_max = Math.ceil(maxX  / _tickIntervalM) * _tickIntervalM;
```

with:

```js
  // Corner bounds round INWARD to the same scale-aware interval used for
  // tick spacing (chooseTickIntervalMetres) — matches DXF's
  // addCornerCrosses exactly, so both formats compute the same corner
  // coordinates for the same plan, and neither ever places a tick beyond
  // the Outside Figure's true extent (previously rounded outward, wasting
  // up to one full interval of margin on every side) — see
  // docs/superpowers/specs/2026-08-12-tick-marks-confined-to-figure-bounds-design.md
  const _tickIntervalM = chooseTickIntervalMetres(scaleDenominator);
  const { aMin: actualY_min, aMax: actualY_max, bMin: actualX_min, bMax: actualX_max } =
    computeInwardTickBounds({ aMin: minY, aMax: maxY, bMin: minX, bMax: maxX, intervalM: _tickIntervalM });
```

### 4. PDF: `renderOutsideFigureTickMarks` (`pdfkitGeoPDF.js:1889-1900`)

Identical replacement to Step 3, at this function's own copy of the same
comment + 4-line block.

### 5. PDF import (`pdfkitGeoPDF.js:14`)

Add `computeInwardTickBounds` to the existing `block-definitions.js` named
import list (already imports `computeScheduleColumnWidths`,
`chooseTickIntervalMetres`, `computeGridTickPositions`, etc. from the same
module on this line).

### 6. DXF: `addCornerCrosses` (`dxfGenerator.js:924-933`)

Replace:

```js
    // Snap the four corners OUTWARD to a round coordinate grid so every cross
    // label is a clean multiple of a scale-driven interval — chooseTickIntervalMetres
    // picks the largest "nice" ground-metre interval (1/2/5/10/20/50/100/...) whose
    // paper spacing at this plan's scale (S) stays within a ruler-safe target, so a
    // Surveyor-General can check any adjacent pair with a standard 30cm scale ruler.
    // drawL/B are the min corners (floor/out), drawR/T the max corners (ceil/out);
    // labels = −coord, so they stay multiples too.
    const G = chooseTickIntervalMetres(S);
    let xL = Math.floor(drawL / G) * G, xR = Math.ceil(drawR / G) * G;
    let yB = Math.floor(drawB / G) * G, yT = Math.ceil(drawT / G) * G;
```

with:

```js
    // Snap the four corners INWARD to a round coordinate grid so every cross
    // label is a clean multiple of a scale-driven interval — chooseTickIntervalMetres
    // picks the largest "nice" ground-metre interval (1/2/5/10/20/25/50/75/100/...)
    // whose paper spacing at this plan's scale (S) stays within a ruler-safe
    // target, so a Surveyor-General can check any adjacent pair with a
    // standard 30cm scale ruler. Rounding inward (not outward) guarantees no
    // tick ever falls beyond the Outside Figure's true extent — see
    // docs/superpowers/specs/2026-08-12-tick-marks-confined-to-figure-bounds-design.md
    const G = chooseTickIntervalMetres(S);
    const { aMin: xL0, aMax: xR0, bMin: yB0, bMax: yT0 } =
      computeInwardTickBounds({ aMin: drawL, aMax: drawR, bMin: drawB, bMax: drawT, intervalM: G });
    let xL = xL0, xR = xR0, yB = yB0, yT = yT0;
```

(`let` is required — `xL`/`xR`/`yB`/`yT` are mutated by the existing
edge-avoidance clamp loops immediately below this block,
`dxfGenerator.js:939-948`, unchanged.)

### 7. DXF import

Add `computeInwardTickBounds` to the existing `block-definitions.js` named
import list in `dxfGenerator.js` (already imports `chooseTickIntervalMetres`,
`computeGridTickPositions`, etc. from the same module).

## Edge cases

- **Figure smaller than one tick interval on an axis** (e.g. a small
  township at a coarse-scale interval): `computeInwardTickBounds` falls
  back to the exact `min`/`max` for that axis. The corner ticks on that
  axis will show non-round coordinates (matching the figure's real
  extreme vertices) — an accepted, rare trade-off per the chosen approach,
  still never exceeding the figure.
- **Existing edge/title-block clamp walks**: PDF's `topX`/`bottomX`/
  `leftY`/`rightY` adjustment loops (`pdfkitGeoPDF.js:1610-1721`) and DXF's
  `xL`/`xR`/`yB`/`yT` adjustment loops (`dxfGenerator.js:939-948`) both only
  ever move a bound *further* inward from wherever it starts, with existing
  cross-over guards (e.g. `adjustedY < leftY`, `g < 1000`). Starting from an
  already more-inward base changes nothing about their correctness — they
  simply have less (or no) further walking to do in the common case.
- **`computeGridTickPositions`'s own exact-endpoint guarantee**: unchanged
  and still relied upon — it's what makes the new inward-rounded
  `aMin/aMax/bMin/bMax` show up as guaranteed corner ticks once handed to
  it, exactly as it already does for the old outward-rounded bounds today.
- **`GRID_NICE_NUMBERS` addition of 25/75**: purely additive to the sorted
  ladder `chooseTickIntervalMetres` walks — no change to that function's
  selection logic (largest candidate whose paper spacing at the plan's
  scale stays ≤ `targetPaperMm`), so existing behavior for scales that
  already resolved to an untouched value (10, 20, 50, 100, …) is unaffected
  except where 25 or 75 now wins over what used to be the next-larger
  candidate.

## Testing

- **New unit tests for `computeInwardTickBounds`**: exact-multiple bounds
  (e.g. `minY=97400, maxY=97700` at interval 100 → unchanged), true
  non-round bounds (the reported case: `97367.95, 97721.38` at 100 →
  `97400, 97700`), and the smaller-than-one-interval fallback (e.g.
  `97420, 97480` at 100 → falls back to `97420, 97480` exactly, since
  `ceil(97420/100)*100=97500 > floor(97480/100)*100=97400`).
- **`GRID_NICE_NUMBERS` regression**: confirm `chooseTickIntervalMetres`
  still returns the same value as before for scale/target combinations that
  shouldn't be affected by the 25/75 insertion, and returns 25 or 75 for
  combinations where they're now the largest-fitting candidate.
- **Existing suites to re-run and check for intentional, verified changes**
  (not blind acceptance) — these currently assert on specific tick
  positions/counts derived from the old outward-rounding + old interval
  ladder, so some are expected to need updates once run against the fix:
  `pdfkitGeoPDF.tickMarks.test.js`, `tickMarkParity.test.js`,
  `block-definitions-tickmarks.test.js`, `dxfGenerator.test.js` (tick-mark
  related cases only).
- **Manual visual check**: regenerate the Shabani Mine plan referenced in
  the Problem section and confirm the printed tick Y/X range no longer
  exceeds the Outside Figure Data table's own printed Y/X range.
- **PDF/DXF parity**: confirm both formats resolve to the same corner
  bounds for the same fixture (this is the exact property
  `computeInwardTickBounds` being shared is meant to guarantee) —
  `sheetLayoutPlanner.parity.test.js` or a fixture exercised through both
  `generateGeoPDF` and `generateDXF`.

## Out of scope

- The edge/title-block-avoidance clamp logic itself (PDF
  `pdfkitGeoPDF.js:1610-1721`, DXF `dxfGenerator.js:939-948`) — unrelated
  concern (keeping ticks clear of *other fixed page elements*, not the
  figure), left untouched.
- Any change to `computeGridTickPositions`'s own logic — already correctly
  includes exact endpoints; this fix only changes what endpoints callers
  hand it.
- Any change to block-placement/collision logic that treats tick marks as
  obstacles — ticks remain fixed obstacles other blocks dodge; this fix
  only shrinks the obstacle region itself, it doesn't change the
  one-directional "ticks first, blocks dodge" placement order.
- The previously-flagged, still-open "PDF's mapBounds reserves less
  drawing-area room than DXF's for the same figure" gap
  (`2026-08-10-pdf-dxf-corner-rounding-parity-design.md`'s Revision-note-3)
  — a related but distinct margin-allocation question, not addressed here.

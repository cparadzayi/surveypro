# Relocation pass: use the accurate figure polygon, and trigger on real overlap

## Problem

After the PDF figure-boundary fallback fix (branch `pdf-figure-boundary-fallback`,
merged), visual verification found a *new*, previously-invisible residual
issue: even on a small, single-table plan where the Schedule of Areas is now
correctly placed clear of the figure, the "Approved / For Surveyor General"
signature box (`sgSignature`) and the survey-date statement
(`surveyStatement`) can still render on top of the figure.

Confirmed by direct measurement: `generateGeoPDF(sampleRealisticPlan, ...)`
returns `warnings.surveyStatementOverlapsPolygon` and
`warnings.sgSignatureOverlapsPolygon`, and the rendered PDF visually shows
the "Approved" box drawn over stand 108's grid cell.

## Root cause

There are two different polygon representations of "where the figure is" in
`pdfkitGeoPDF.js`, from two different transforms:

1. **`_polyForPlanner`** (built via `buildPlannerObstacles` /
   `_buildPlannerTransform` in `polygonForPlanner.js`) — fed to the
   *placement engine* (`calculateBlockPositions` via `planSheetLayout`).
   Deliberately re-centers the polygon within `mapBounds`, on purpose: a
   pre-existing code comment (`polygonForPlanner.js:4-7`) explains this was
   introduced specifically because PDF and DXF used to independently
   transform the figure differently and disagreed about where it was,
   causing the schedule to land on opposite sides of the page between the
   two output formats. The centering keeps PDF and DXF's *planning*
   decisions in sync.
2. **`_topoPolyPts`** (→ `mapFeatureBounds.pdfPoints`) — matches where the
   figure is *actually drawn* on the page (same `transformCoords`
   fit-to-extent transform used for parcels, beacons, and every other piece
   of map content). This is what the final `_pdfWarnIfOverlap` check
   (`pdfkitGeoPDF.js:12403-12422`) validates against.

Measured directly for `sampleRealisticPlan`: these two polygons are
substantially different in both size and position (not a rounding
difference) — `_polyForPlanner`'s bbox is roughly 1134×737pt, `_topoPolyPts`'s
is roughly 1554×1010pt, at different offsets. The placement engine validates
block positions against the smaller, re-centered polygon; blocks it
considers "clear" can still fall inside the real, larger, differently-placed
figure once actually drawn.

This affects `surveyStatement` and `sgSignature` specifically because both
go through the existing post-placement relocation pass
(`pdfkitGeoPDF.js:12253-12314`), which today only triggers relocation when a
block overlaps a *tick mark*, and — when it does relocate — searches for a
new spot using `_polyForPlanner` (the approximate, planning-purposes
polygon), not the accurate one. A block that doesn't happen to overlap a
tick mark is never even checked against the real figure at this stage.

## Scope decision (confirmed with user)

**Approach C, of three considered:**

- ~~Make the placement engine use the accurate polygon~~ — rejected: this
  is exactly what the centered polygon was introduced to prevent (would
  risk resurrecting the PDF/DXF cross-format placement divergence the
  centering fixed).
- ~~Make the actual drawn figure match the planner's centered position~~ —
  rejected: the figure is drawn using the same transform as every other
  piece of map content (parcels, beacons, labels); switching only the
  figure outline to a different, centered transform would visually
  misalign it from the parcels it's supposed to bound.
- **Extend the existing post-placement relocation pass** to also trigger on
  real figure overlap (not just tick-mark overlap), and to search using the
  accurate polygon instead of the approximate one. Chosen because it
  reuses an established, already-proven pattern in this exact codebase
  (the tick-mark relocation mechanism already exists for exactly this
  purpose — moving `surveyStatement`/`sgSignature`/etc. clear of obstacles
  after the initial approximate placement) rather than introducing a new
  one, and leaves the delicate cross-format planning logic (`_polyForPlanner`,
  everything feeding `calculateBlockPositions`/`planSheetLayout`) completely
  untouched.

This is scoped as its own, separate fix — not the same branch as the
Schedule-of-Areas fix, and not sub-project B (the split-schedule
paper-size-escalation gap, which remains separate and unaddressed).

## Design

In `app-backend/src/services/pdfkitGeoPDF.js`, within the existing
relocation block (currently `pdfkitGeoPDF.js:12253-12314`):

1. Introduce an accurate-polygon reference alongside the existing
   `_relocPoly`:

```js
const _accurateFigurePoly =
  mapFeatureBounds?.pdfPoints?.length >= 3 ? mapFeatureBounds.pdfPoints : null;
```

2. Widen the outer gate from `if (_tickRects.length > 0)` to also fire when
   an accurate figure polygon exists, so the pass isn't skipped entirely on
   a plan with no tick marks:

```js
if (_tickRects.length > 0 || _accurateFigurePoly) {
```

3. Extend the trigger condition. Replace the tick-only check:

```js
const _overlapsAnyTick = (r) => _tickRects.some((t) => rectanglesOverlap(r, t, 0));
```

with a check that also covers the real figure:

```js
const _overlapsAnyTick = (r) => _tickRects.some((t) => rectanglesOverlap(r, t, 0));
const _overlapsFigure = (r) =>
  _accurateFigurePoly ? rectangleOverlapsPolygon(r, _accurateFigurePoly, 0) : false;
const _needsRelocation = (r) => _overlapsAnyTick(r) || _overlapsFigure(r);
```

...and update the loop's trigger check (`if (!_overlapsAnyTick(t.rect))`) to
`if (!_needsRelocation(t.rect))`.

4. Switch the relocation *search* to validate against the accurate polygon,
   not the approximate one — replace `polygon: _relocPoly` with
   `polygon: _accurateFigurePoly` in the `findBlockPosition(...)` call.
   (`_relocPoly`/`_polyForPlanner` itself stays defined and used elsewhere
   for planning — only this one call site's `polygon` argument changes.)

5. Update the two log messages (`"Relocated ${t.name} clear of tick marks"`
   and `"${t.name} overlaps a tick mark but no clear slot was found"`) to
   reflect that relocation can now be triggered by either cause — exact
   wording is an implementation detail, not specified further here.

No other part of the pipeline changes. `_pdfWarnIfOverlap` (the final
warning check) is untouched — it already uses the same accurate polygon
this fix now searches against, so once a block is correctly relocated here,
the corresponding warning clears on its own as a natural consequence, not a
separate fix.

## Edge cases

- **No figure at all** (no parcels, nothing to derive a polygon from):
  `_accurateFigurePoly` is `null`, `_overlapsFigure` always returns `false`,
  and behavior degrades exactly to today's tick-only logic.
- **A block overlaps the figure but no clear slot exists anywhere** (dense
  plans — same territory as the already-known split-schedule gap,
  informally "sub-project B"): `findBlockPosition` already returns `null`
  gracefully in that case; the existing `else` branch already logs a
  warning and keeps the block at its imperfect planner slot. This fix does
  not promise to resolve dense/crowded plans — it strictly improves the
  common case without regressing the hard case.
- **`scheduleOfAreas`**: not in the `_relocatable` list, untouched — already
  has its own separate, working escalation-based handling.

## Testing

- Regression test via `generateGeoPDF`'s public API on `sampleRealisticPlan`
  (the fixture that surfaced this): assert
  `warnings.surveyStatementOverlapsPolygon` and
  `warnings.sgSignatureOverlapsPolygon` are both absent.
- Regression guard that `warnings.scheduleOfAreasOverlapsPolygon` stays
  absent too — confirms no interaction with the schedule's separate
  handling.
- Full backend suite run.
- Visual verification: regenerate `sampleRealisticPlan` and confirm the
  "Approved" signature box no longer renders on top of a stand's grid cell.

## Out of scope

- The split-schedule paper-size-escalation gap ("sub-project B") — separate,
  already-tracked, unaddressed by this fix.
- The pre-existing PDF/DXF corner-rounding mismatch found during the
  coordinate-grid tick-mark work — separate, already-tracked.
- Any change to `_polyForPlanner`, `buildPlannerObstacles`, or anything
  feeding the placement engine's own planning decisions — deliberately
  untouched per the scope decision above.

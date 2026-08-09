# PDF figure-boundary fallback for the schedule/tick collision system

> **Revision note:** this spec originally proposed a clipper-lib polygon
> union of all parcels as the fallback boundary, shared by both PDF and
> DXF. Deeper investigation (below) found that premise was wrong on two
> counts: DXF already derives a boundary from `outsideFigureData` and
> isn't actually blind the way originally believed, and PDF *already
> computes* a suitable fallback boundary (`outsideFigureBoundary`, an
> extent bounding box) for other purposes — it just never reaches the
> collision system. The real fix is much smaller: wire PDF's existing
> boundary into the one place that was missing it. No new geometry
> library usage, no parcel union. This revision replaces the original
> content in place.

## Problem

The collision-avoidance system used for placing the Schedule of Areas (and
every other collision-aware block — tick marks' reserved regions, scale
bar, north arrow) only recognizes the survey figure via the literal
`outsideFigure` GeoJSON field. When a plan has no separately digitized
outer boundary — common for "general-developed" township plans defined
only by their individual stand parcels — `mapFeatureBounds.pdfPoints` (the
hard-reject collision polygon) ends up empty, and the placement engine
treats the entire map as open whitespace.

Confirmed by direct reproduction (systematic-debugging session,
2026-08-08): generating a 240-stand fixture with no `outsideFigure` field
produced a PDF where the Schedule of Areas sub-tables render directly on
top of the stand grid. The same overlap reproduced on the pre-existing
`main` baseline, confirming this predates any work already shipped.

## What investigation found (revising the original premise)

**DXF is not actually blind the way originally believed.** It derives its
figure polygon from `outsideFigureData` (the tabular SIDES/coordinates
table — present on essentially every real plan, since it's mandatory SI
727 documentation) via `computeOutsideFigureVertices()`
(`dxfGenerator.js:293-320`), then constructs an inline GeoJSON-shaped
object from those vertices at its `buildPlannerObstacles` call site
(`dxfGenerator.js:1949-1951`). Measured directly: for a fixture with
`outsideFigureData` but no separate `outsideFigure`, DXF sees `polyVerts:
4`; PDF sees `polyVerts: 0` for the identical fixture. **PDF never got
DXF's fallback.**

**PDF already computes a *better* fallback than DXF's, for a different
purpose — it just never reaches the collision path.** Inside
`_generateGeoPDFInner` (`pdfkitGeoPDF.js`):

1. `outsideFigureBoundary` is first built from `outsideFigureData.edges`
   (`pdfkitGeoPDF.js:10687-10701`) — the same sparse 4-point polygon DXF
   uses.
2. It is then **unconditionally rebuilt** as the bounding box of *all*
   parcel + Outside Figure coordinates combined
   (`pdfkitGeoPDF.js:10899-10915`), specifically because — per the
   existing code comment — "the 4 OFD edge endpoints form a sparse polygon
   that doesn't cover the full drawn parcel area — blocks placed 'outside'
   those 4 points still land on top of parcel lines." This rebuild uses
   `_allYs`/`_allXs`, which are populated from **parcels unconditionally**
   (`pdfkitGeoPDF.js:10784-10797`) and from Outside Figure only if present
   (`pdfkitGeoPDF.js:10804-10824`) — so the rebuilt bbox is available
   whenever parcels exist, with or without `outsideFigureData`.

`outsideFigureBoundary` (post-rebuild) is used for tick-mark map
positioning and as a fallback inside `calculateMapFeatureBounds`. But the
literal `outsideFigure` variable — used separately for `_topoPolyPts`
(`pdfkitGeoPDF.js:11879-11894`), beacon filtering
(`pdfkitGeoPDF.js:10704`), and ultimately `buildPlannerObstacles`
(`pdfkitGeoPDF.js:12039`) — is never updated to use it. Those two
boundaries have quietly diverged: one self-heals via the extent bbox, the
other stays empty.

**Conclusion:** the fix is to synthesize a GeoJSON `outsideFigure` from
the already-rebuilt `outsideFigureBoundary` bbox, once, at a single point
late enough in `_generateGeoPDFInner` to run after the bbox rebuild — not
a new parcel-union mechanism, and not needed on the DXF side (DXF already
has an equivalent, if simpler, fallback).

## Scope decisions (confirmed with user)

- Fix scoped to the general polygon-awareness gap (not schedule-specific),
  since the fix point (`outsideFigure` itself) is read by every
  collision-aware consumer, not just the schedule.
- **PDF only.** DXF already has a working fallback via `outsideFigureData`
  and is not touched by this fix.
- No parcel-union / clipper-lib work. Superseded by the simpler,
  already-available bbox fallback found during investigation.
- The separate, still-open paper-size-escalation gate for schedules that
  split into sub-tables (`isScheduleWithFluidFallback` in
  `pdfkitGeoPDF.js`) remains a distinct, later follow-up — not addressed
  here.

## Design

In `app-backend/src/services/pdfkitGeoPDF.js`:

1. Change the top-of-function destructuring of `_generateGeoPDFInner`'s
   `options` from `const { ... }` to `let { ... }` (`pdfkitGeoPDF.js:10604`)
   so `outsideFigure` can be reassigned.
2. Immediately after the `outsideFigureBoundary` bbox rebuild block
   (`pdfkitGeoPDF.js:10899-10915`), insert:

```js
// The schedule/tick collision-avoidance polygon (mapFeatureBounds.pdfPoints,
// fed to buildPlannerObstacles as `outsideFigure`) has historically only
// recognized the figure via this literal `outsideFigure` GeoJSON field —
// unlike outsideFigureBoundary above, it never fell back to the rebuilt
// extent bbox. When outsideFigure is absent, synthesize an equivalent
// GeoJSON Polygon from outsideFigureBoundary (the full-coverage extent
// bbox rebuilt just above, not the sparse 4-point OFD-edges polygon) so
// every downstream consumer of `outsideFigure` — schedule/tick-mark
// collision avoidance, beacon filtering, map positioning — sees a real
// figure instead of treating the whole map as empty space.
if (!(outsideFigure?.features?.length > 0) && outsideFigureBoundary?.length >= 4) {
  outsideFigure = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [outsideFigureBoundary] },
      properties: {},
    }],
  };
  logger.info('[PDFKit] 🗺️  No outsideFigure supplied — using the extent bbox as the collision-avoidance figure boundary');
}
```

`outsideFigureBoundary` is already `[y, x]` pairs, GeoJSON-ring-shaped
(closed, first point duplicated at the end) — no coordinate remapping
needed, it drops straight into `coordinates: [outsideFigureBoundary]`.

This single change point is deliberately placed **after** every consumer
that must only see a *true* figure boundary and would be wrong to receive
a bbox:

- Beacon inside/outside filtering (`pdfkitGeoPDF.js:10704-10801`) runs
  *before* this point — filtering by the true polygon, or not at all if
  none exists, is correct; filtering by a much-larger bbox would silently
  admit beacons that should have been excluded. Unaffected by this change.

...and placed **before** every consumer this fix is meant to reach:

- `_topoPolyPts` / `mapFeatureBounds.pdfPoints` construction
  (`pdfkitGeoPDF.js:11879-11906`) — the actual hard-reject collision
  polygon fed to the placement engine. This is the fix's primary target.
- All three `calculateTickMarkBounds` call sites and the
  `renderOutsideFigureTickMarks` call
  (`pdfkitGeoPDF.js:11918,12084,12203,12400`) — tick-mark collision
  awareness improves incidentally, for free, from the same change.
- The optional `trueGeoPDF` layer-tagging block
  (`pdfkitGeoPDF.js:10984-10989`) — gated behind an opt-in flag, tags GIS
  metadata (not visible drawing geometry); if reached with the bbox
  fallback, the "outsideFigure" GIS layer represents the extent bbox
  instead of not existing at all for such plans. A neutral-to-positive
  side effect, not a regression — verified this code path only adds a
  metadata layer for GIS export tooling, not visible PDF content.

## Edge cases

- **No `outsideFigure` and no parcels either**: `outsideFigureBoundary`
  stays unset (nothing to build a bbox from), the fallback condition's
  `outsideFigureBoundary?.length >= 4` check fails, `outsideFigure` stays
  empty — same as today. Not worse, just not improved for a
  no-geometry-at-all plan (schedule placement is moot without any parcels
  to schedule anyway).
- **`outsideFigure` present and valid**: fallback condition's
  `outsideFigure?.features?.length > 0` short-circuits true, the
  synthesis never runs — completely unchanged behavior.
- **A single stand / very small extent**: the bbox degenerates toward a
  small rectangle matching that stand's own bounds — correct, matches
  what a true 1-parcel figure boundary would look like anyway.

## Testing

- Unit tests exercising `_generateGeoPDFInner`'s fallback via
  `generateGeoPDF`'s public API (no internal exports needed — the fix is
  a local variable reassignment, not a new exported function): a fixture
  with parcels and `outsideFigureData` but no `outsideFigure` → the
  synthesized boundary reaches the collision system (verified via the
  existing `[PLANNER-INPUT] PDF → planSheetLayout` diagnostic log's
  `polyVerts` field, already emitted at `pdfkitGeoPDF.js:12066`, going
  from `0` to `>= 4`); a fixture with a real `outsideFigure` → `polyVerts`
  unchanged from today's value (regression guard); a fixture with neither
  `outsideFigureData` nor `outsideFigure` but with parcels → still
  resolves via the parcels-only bbox path.
- Integration regression test for the originally reported bug: a small
  (single-table, non-splitting — see note below), no-`outsideFigure`
  fixture, generated through `generateGeoPDF` with a captured logger,
  asserting none of the placement engine's collision-warning log lines
  (`blockPlacementEngine.js:98`'s `"no collision-free slot found"`, and
  PDF's own `"❌ Block↔Polygon collision"` Step-6 validation log) mention
  `scheduleOfAreas`.

  **Deliberately not the large 240-stand Maglas-style fixture** used in
  the original bug reproduction: that fixture's schedule splits into
  multiple sub-tables, which hits the *separate*, still-open
  `isScheduleWithFluidFallback` escalation gate (sub-project B). Testing
  with a splitting schedule here would conflate two different bugs — a
  small, single-table fixture isolates this fix's actual effect. Verified
  empirically before writing this plan: the smaller `sampleRealisticPlan`
  fixture (12 stands, no `outsideFigure`) currently produces **no**
  scheduleOfAreas collision-warning today even though visually the
  schedule crowds the scale bar — so the integration test's real target
  signal is the `polyVerts: 0 → >0` planner-input diagnostic (proven
  reliable above), with the collision-log assertions as an additional,
  belt-and-suspenders check.
- Full backend suite run at the end.
- Visual verification: regenerate a plan resembling the original
  240-stand repro fixture (acknowledging sub-project B may still leave
  *some* residual overlap risk for that specific dense case) and a
  smaller single-table plan, and look at both rendered PDFs.

## Out of scope

- DXF — already has a working (if simpler) fallback via
  `outsideFigureData`; not touched.
- Sub-project B: the paper-size escalation gate for schedules that split
  into sub-tables. Separate follow-up.
- Making `outsideFigureBoundary`'s bbox fallback itself more accurate
  (e.g. a true parcel-union outline instead of a bbox) — the existing bbox
  approach is already an established, working, in-codebase pattern for
  this exact purpose; revisiting its accuracy is not requested and not
  needed to fix the reported bug.

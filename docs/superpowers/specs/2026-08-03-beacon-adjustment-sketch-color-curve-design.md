# Beacon Adjustment Report Sketch — Colour Convention & Curved Rays

**Date:** 2026-08-03
**Status:** Design approved, pending spec review
**Scope:** Frontend only, `app-frontend/src/utils/beaconAdjustmentReport.js`
(`addEdgeComplianceSketch`) + a small pure-geometry addition to
`app-frontend/src/utils/beaconComparisonSketchLayout.ts` + one signed-formatter
helper in `app-frontend/src/utils/surveyMath.js`. Narrower follow-up to the
just-shipped `addEdgeComplianceSketch` (spec `2026-08-02-beacon-adjustment-report-sketch-design.md`).

## Problem

The shipped sketch (reviewed directly against a real 12-beacon/66-edge output,
`beacon-comparison-2026-08-03.pdf`, page 9) has two problems once used on a real,
densely-connected network:

1. **Colour convention doesn't show enough.** Per ray it shows historical distance
   (black), survey distance (red), and only the direction *difference* ("swing",
   black, regardless of pass/fail) — never the historical or survey direction
   themselves. Pass/fail is shown by circling the figure in red, which is a second,
   redundant visual channel once the differences themselves are colour-coded, and
   the circles add clutter to an already dense drawing.
2. **Straight rays cross constantly.** With 66 edges among 12 points (an O(n²)
   edge-compliance network), straight chords overlap and cross so much the sketch
   is close to unreadable, and annotation text sits on top of unrelated rays.

## Desired behaviour

- Old (historical) distance and direction: **black**. New (survey) distance and
  direction: **red**. This replaces "swing-only" with both endpoints of the
  comparison shown explicitly.
- Difference values (distance `dDiff`, direction `dirDiffSec`) coloured **black**
  when within the SI 727 tolerance for that line, **red** when outside it. This
  replaces the red-circle-on-failure convention — colour alone now carries
  pass/fail.
- Rays are **curved**, bowed away from a straight chord, varied per edge so
  rays that would otherwise coincide or nearly-overlap fan visually apart. This
  is a best-effort heuristic, not a graph-theoretic crossing minimiser (true
  crossing minimisation for a dense general-position graph is a hard layout
  problem, out of scope).
- Annotation text must **not overlap any ray's drawn curve** (not just the ray it
  labels) — confirmed as a hard requirement, not best-effort, distinct from the
  ray-crossing heuristic above. See "Annotation placement" below for how this is
  guaranteed short of pathological inputs.
- Sketch page becomes **A4 landscape** (was portrait) — more room for the curves
  and the wider 2-line annotations.

## Data source (unchanged)

Every field needed is already on `edges.rows` from `si727.js`'s `edgeCompliance()`:
`dH`, `dS`, `dDiff`, `distOk`, `brgH`, `brgS`, `dirDiffSec`, `dirOk`. No new data
plumbing.

## Annotation format

Two lines per ray, replacing today's three stacked single-colour lines:

```
135.383 → 135.432 (+0.050)              [black] [grey →] [red] [black|red by distOk]
44°57'07.6" → 44°56'35.4" (-32.2")      [black] [grey →] [red] [black|red by dirOk]
```

Each line is drawn as multiple `doc.text()` calls advanced by `doc.getTextWidth()`
(the same technique the current code already uses to size the failure-circle
ellipses), one call per colour segment. `formatDMS` (existing, `surveyMath.js`)
formats `brgH`/`brgS`; `formatSignedDMS` (existing, `beaconComparisonSection.ts`,
already imported here) formats the direction difference. The distance difference
needs a new signed-3-decimal formatter — add `f3s` to `surveyMath.js`, mirroring
the existing `f4s` (`(v >= 0 ? '+' : '') + v.toFixed(4)`) at 3 decimals instead of 4,
consistent with how `dH`/`dS` are already formatted to 3 decimals in this method.

The red-ellipse-drawing code (`if (!row.distOk) { ... doc.ellipse ... }` and the
`dirOk` equivalent) is deleted.

## Curved rays

Each ray is drawn as a cubic Bézier via jsPDF's path API
(`doc.moveTo(a) → doc.curveTo(cp1, cp2, b) → doc.stroke()`), replacing the current
`doc.line(a, b)`. Still solid black, unchanged line width.

- A single bow control point `c` is computed via the existing
  `midpointOffset(a, b, bowMm, side)` helper (already imported).
- `side` alternates by `idx % 2` (even → 1, odd → −1); magnitude is
  `4 + 3 * (idx % 3)` mm (3 distinct depths: 4, 7, 10mm), capped at 35% of the
  chord length so short rays don't over-bow.
- The quadratic control point `c` is converted to the two cubic control points
  jsPDF's `curveTo` needs via the standard quadratic→cubic formula:
  `cp1 = a + 2/3*(c − a)`, `cp2 = b + 2/3*(c − b)`.
- This is a deterministic, index-varied fan-out, not a true crossing solver —
  edges that happen to run in similar directions get pushed to different bow
  depths/sides so they visually separate rather than perfectly overlapping;
  crossings between geometrically unrelated edges can still occur.

## Annotation placement (must not overlap any ray)

This is the one part of the request that's a hard requirement, so it gets an
actual search rather than a fixed offset:

1. **Two-pass render.** Pass 1 draws every curved ray and, for each, samples its
   cubic Bézier into an 10-point polyline (`sampleCubicBezier(a, cp1, cp2, b, 10)`),
   keeping all 66 polylines in memory. Pass 2 places annotations, now able to test
   candidate positions against every other ray's actual drawn path.
2. **Candidate search per ray.** For each ray's 2-line annotation, compute its
   bounding box (width = the wider of the two rendered line strings via
   `getTextWidth`, height ≈ two line-heights + padding). Starting from the ray's
   own bow side and a minimum offset just clear of its own curve
   (`|bowMm| + 1.5mm`), search outward in ~2.5mm steps (via `midpointOffset` along
   the same perpendicular used for the bow) up to a capped radius; if the
   preferred side never clears, retry the opposite side over the same range. Pick
   the first offset/side whose bounding box intersects none of the *other* rays'
   sampled polylines (the ray's own curve is excluded from the check — it
   naturally passes near the anchor by construction). Rectangle-vs-polyline
   intersection is a straightforward segment/segment test against the box's four
   edges.
3. **Fallback.** If no clear position exists within the search cap (possible in a
   very dense cluster of near-coincident edges), use the largest offset tried on
   the preferred side — a documented best-effort fallback for a case that
   shouldn't occur in practice at SI 727-scale beacon counts, not silently
   dropped or crashing.
4. **Where this lives.** The pure geometry — `sampleCubicBezier`,
   segment-intersection, `polylineIntersectsRect`, and the offset-search itself —
   goes in `beaconComparisonSketchLayout.ts` alongside the existing
   `computeExtent`/`pickSketchScale`/`makeSketchTransform`/`midpointOffset` (no
   jsPDF dependency, independently unit-testable, matching that module's
   established purpose). `beaconAdjustmentReport.js` only calls it and draws.

## Page & box sizing

`addEdgeComplianceSketch` switches from `doc.addPage('a4', 'portrait')` to
`doc.addPage('a4', 'landscape')`. The box width/height must come from the actual
post-switch page size (`this.doc.internal.pageSize.getWidth()/getHeight()`), not
the stale portrait `this.pw` captured in the constructor — today's hardcoded
`boxH = 170` (sized for a 297mm-tall portrait page) is replaced with a height
computed from the landscape page's shorter (210mm) dimension, leaving room for
the title above and the caption/summary lines below, the same way the box width
is already derived from the page width today.

## Caption update

```
Scale 1 : 2500. Black = historical, Red = current survey.
Differences black = within SI 727 tolerance, red = outside.
```
(replaces "Circled = outside SI 727 tolerance")

## Scope boundaries (YAGNI)

- No change to `beaconComparisonSection.ts` / `beaconComparisonReportGenerator.ts`
  — this is the other (already-shipped, already-has-a-sketch) report generator;
  explicitly out of scope, consistent with the prior spec's scope decision.
- No general graph-layout / crossing-minimisation algorithm — the bow heuristic
  is intentionally simple and deterministic.
- No change to beacon-point placement, scale-bar, or south-arrow rendering.
- Legibility for *extremely* dense clusters (fallback case in step 3 above) is a
  documented best-effort, not a guarantee, consistent with the crowding
  limitation already accepted for this sketch in the prior spec.

## Testing

`beaconAdjustmentReport.test.ts`'s existing ray-capture harness patches
`jsPDF.API.line`; it must be reworked to patch `moveTo`/`curveTo`/`stroke` instead
(capturing the active draw colour at `stroke()` time, same pattern as today's
`setDrawColor` interception). Existing assertions to update:

- "draws every ray in plain black" — still holds, just observed via the new
  patch target.
- "circles only the failing figures" — replaced with an assertion that the
  distance-diff and direction-diff text segments are drawn in red exactly when
  `distOk`/`dirOk` is false, black otherwise (the `ellipse` patch and its
  assertions are removed).
- New: a test asserting an annotation's computed bounding box does not intersect
  another ray's sampled polyline, using a fixture with two near-parallel/crossing
  edges specifically constructed to exercise the search-outward path.

New pure-function tests in `beaconComparisonSketchLayout.test.ts` for
`sampleCubicBezier`, the segment-intersection helper, and the offset-search
function, following that file's existing test style.

## Files touched

Modified:
- `app-frontend/src/utils/beaconAdjustmentReport.js` (`addEdgeComplianceSketch`
  rewritten: curved rays, 2-line coloured annotations, landscape page, updated
  caption)
- `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (new pure geometry:
  bezier sampling, segment intersection, clear-anchor search)
- `app-frontend/src/utils/surveyMath.js` (new `f3s` export)
- `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts` (ray-capture
  harness reworked, assertions updated)
- `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (new
  tests for the new geometry helpers)

Untouched:
- `si727.js`, `surveyAdjustmentStore.js` — no data-shape changes
- `beaconComparisonSection.ts`, `beaconComparisonReportGenerator.ts`,
  `reportOnSurveyGenerator.ts` — different report, out of scope

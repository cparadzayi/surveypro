# Beacon Adjustment Sketch — Automatic Paper Size/Orientation for a Collision-Free Layout

**Date:** 2026-08-04
**Status:** Design approved, pending spec review
**Scope:** Frontend only, `app-frontend/src/utils/beaconAdjustmentReport.js`
(`addEdgeComplianceSketch`) + `app-frontend/src/utils/beaconComparisonSketchLayout.ts`
(new pure layout/collision functions) + their tests. First of two sub-projects — the
second (a matching DXF export of this same sketch) is explicitly **out of scope** here;
it will consume this sub-project's chosen scale/extent once shipped, so it's designed
after this one lands, not in parallel.

## Problem

The shipped sketch (spec `2026-08-03-beacon-adjustment-sketch-color-curve-design.md`)
always renders on a fixed A4 page (orientation was fixed to portrait, per the immediately
preceding change). Two consequences, both confirmed by the user reviewing real rendered
output:

1. **Fixed paper size caps how much room the collision-avoidance search has.** At the
   density this feature actually sees in practice (all-pairs edges — 8 beacons already
   means 28 rays), A4 sometimes doesn't have enough room for every annotation to find a
   spot clear of every ray, even with the widened search from the prior fix.
2. **Annotation-vs-annotation collisions were never checked at all.** The existing
   `findClearAnchor` only avoids *rays*; two annotations can still be drawn on top of
   each other. This was an accepted, documented limitation until now — the user has
   confirmed it no longer is.

## Desired behaviour

For a given beacon-comparison result, automatically choose the smallest paper size and
whichever orientation (portrait or landscape — no fixed preference either way) lets the
*entire* sketch render with **zero** annotation-vs-ray and zero annotation-vs-annotation
overlaps. Escalate through the standard ISO ladder — A4 → A3 → A2 → A1 → A0, both
orientations at each size — and stop at the first (size, orientation) combination that
achieves zero collisions. If even A0 (in whichever orientation does better) can't reach
zero, render at A0 with the fewest collisions found — the same "documented best-effort
limit for pathologically dense clusters" posture this sketch has always had, just pushed
much further out before it's ever reached in practice.

This mirrors an existing project pattern: `app-shared/sheetEscalation.js` already does
A2→A1→A0 sheet escalation for a *different*, backend/pdfkit feature (survey-plan
DXF/GeoPDF generation) when content doesn't fit. This sub-project is the frontend/jsPDF
analogue for this specific report, not a shared abstraction with that backend code (different
runtime, different drawing library, no reuse path — confirmed by reading both).

## Design

### 1. Make the layout computation pure and page-size-agnostic

Today, `addEdgeComplianceSketch` computes scale, beacon positions, ray curves, and
annotation placement *while also* drawing them, all against a page size that's already
fixed by the time any of that math runs. To try 10 candidate (size, orientation)
combinations cheaply, the geometry math must be extractable and re-runnable without
touching a real page or drawing anything.

A new pure function, `computeSketchLayout`, moves into `beaconComparisonSketchLayout.ts`
(no jsPDF import, matching that module's existing, established purpose) and takes over
everything currently inline in `addEdgeComplianceSketch` between "compute `positioned`"
and "finish placing every annotation": scale selection, the box-shrink-to-content sizing
already shipped, beacon position transform, per-ray curve/bow/polyline computation, and
per-ray annotation anchor placement (via an extended collision search — see below). It
works in a box-local coordinate frame (origin at the box's own top-left, not the page's)
so it has no opinion about *where* on a page the box ends up — the caller translates by
the box's actual page position only when it draws for real. Its only external dependency
is a `measureText(s: string): number` callback (a thin wrapper the caller provides around
`doc.getTextWidth`) — text metrics are page-size-independent, so this callback is created
once and reused across every trial and the final render, not rebuilt per trial.

The function reports, alongside the full computed geometry, a **violation count**: for
every annotation, after the collision search places it, re-check whether its final
rectangle still intersects any ray polyline or any other annotation's rectangle it should
have avoided (the search already falls back to a best-effort position when it can't find
a fully clear one — this count is what turns that fallback into an externally-visible,
comparable number instead of a silent internal detail).

### 2. Extend collision avoidance to cover annotation-vs-annotation

`findClearAnchor`'s search currently excludes only other rays' sampled polylines. It
gains a second exclusion set: the rectangles of annotations already placed earlier in the
same pass (placement stays sequential/greedy in edge order, as today — this is a direct
extension of the existing approach, not a new algorithm). A new pure helper,
`rectsOverlap(r1, r2): boolean` (plain axis-aligned rectangle intersection — simpler than
the existing polyline-vs-rectangle test, since both sides are already rectangles), backs
this second check.

### 3. Try the paper ladder, draw the winner

In `addEdgeComplianceSketch`, replace the fixed `addPage('a4', 'portrait')` with a loop
over `[A4, A3, A2, A1, A0] × [portrait, landscape]` (10 candidates, ordered smallest-page
first so the smallest sufficient sheet wins on ties — never escalate past what's needed).
For each candidate, call `computeSketchLayout` with that candidate's available width/height
(standard ISO mm dimensions, matching jsPDF's own built-in page-format table so the trial
math and the real page agree exactly) and keep the result with the lowest violation count,
stopping immediately at the first zero. Only then call the real `doc.addPage(...)` for the
winning candidate and draw using that trial's already-computed geometry directly — rays via
`moveTo`/`curveTo`/`stroke` from the stored `edgeGeom`, annotations via `_drawColoredLine`
at the stored anchors. No geometry is recomputed for the real render.

### 4. Everything downstream of "the box" stays page-size-agnostic, as it already is

The box sizing (shrink-to-content), the chrome-clearance band for the south arrow, the
scale bar, and the caption's `maxWidth` already derive from the actual chosen page's
dimensions rather than an assumed fixed one (this was already true after the most recent
portrait-switch fix) — they need no further change, only to keep receiving whichever
`pageW`/`pageH`/`boxW`/`boxH` the winning candidate produced.

## Scope boundaries (YAGNI)

- **No arbitrary/custom sheet sizes.** The ladder is the standard ISO A-series, matching
  the project's existing backend escalation precedent and standard survey-drawing
  practice — not open-ended growth to whatever size guarantees zero collisions.
- **No change to the collision-avoidance *algorithm's* nature.** Still a deterministic,
  sequential, greedy nearest-clear-spot search — no graph-layout solver, no iterative
  relaxation, no annotation *re*-placement once initially placed (an annotation placed
  early never moves to make room for one placed later).
- **No DXF work in this sub-project.** The DXF export explicitly depends on this
  sub-project's output (chosen scale, extent, final geometry) and is designed separately
  once this ships.
- **No change to per-ray annotation content, colour rules, or ray curvature math** — all
  already shipped and unaffected by where they end up drawn.

## Testing

- Pure-function tests in `beaconComparisonSketchLayout.test.ts`: `rectsOverlap` (overlap,
  no-overlap, edge-touching cases); the extended `findClearAnchor` now also avoiding a
  supplied list of prior-annotation rectangles (mirroring the existing polyline-avoidance
  test style); `computeSketchLayout` against small fixtures — a widely-spaced network
  that should report zero violations even at A4-sized input, and a deliberately
  overcrowded tiny-area fixture that should report a nonzero, correctly-counted violation
  total.
- `beaconAdjustmentReport.test.ts`: a fixture that already fits cleanly should render at
  A4 (no needless escalation to a larger sheet); a dense fixture sized to force escalation
  should render on a larger sheet/different orientation than A4-portrait, and the test
  harness needs a way to observe the actually-chosen page size (e.g. capturing `addPage`'s
  arguments, similar to how curves/text already get captured).

## Files touched

Modified:
- `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (new `rectsOverlap`, extended
  `findClearAnchor`, new `computeSketchLayout`)
- `app-frontend/src/utils/beaconAdjustmentReport.js` (`addEdgeComplianceSketch`: paper
  ladder trial loop replacing the fixed `addPage` call; drawing code updated to consume a
  `computeSketchLayout` result instead of computing geometry inline)
- `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts`,
  `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts`

Untouched: every other method in `beaconAdjustmentReport.js`; `surveyMath.js`;
`beaconComparisonSection.ts`/`beaconComparisonReportGenerator.ts` (the other, separate
report generator, still out of scope as established in the prior spec).

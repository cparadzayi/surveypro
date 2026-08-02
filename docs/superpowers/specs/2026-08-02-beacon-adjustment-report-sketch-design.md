# Beacon Comparison Sketch in the Beacon Adjustment Report

**Date:** 2026-08-02
**Status:** Design approved, pending spec review
**Scope:** Frontend only (`app-frontend/src/utils/beaconAdjustmentReport.js`). No backend changes.
Narrower follow-up to the just-shipped `feat/beacon-comparison-sketch` branch.

## Problem

There are two independent SI 727 s.67(5) beacon-comparison PDF generators in this codebase:

- `beaconComparisonReportGenerator.ts` — a thin, collation-ready wrapper around the shared
  `renderBeaconComparison` (`beaconComparisonSection.ts`). This is the standalone "Beacon
  Comparison Report" collated into `Comprehensive_Latest.pdf`, and the same renderer is also
  used inline in the Report on Survey. **It already has the graphical comparison sketch**
  (shipped in `feat/beacon-comparison-sketch`) — confirmed by reading the file: its whole
  purpose is to delegate to the shared renderer so "this report and the structured Report on
  Survey never drift apart." No work needed here.
- `beaconAdjustmentReport.js` — a much richer, self-contained, class-based report (Helmert
  transformation stats, iterative W-test data-snooping log, a "Holistic Displacement Plot",
  full comparison schedule, transformation residuals, reliability/LOO validation, and its own
  `addEdgeCompliance` landscape TABLE of the exact same `edgeCompliance()` data). Triggered by
  a "Download Report" button in the standalone lite Compare tool (`CompareView.vue`), it calls
  `.save()` directly (a browser download) and was never touched by the sketch feature — **it
  has no graphical sketch at all**, only the tabular edge-compliance list.

A surveyor generating a report from the Compare tool's "Download Report" button gets a
document with no sketch, inconsistent with the sketch-bearing report produced elsewhere.

## Desired behaviour

Add the same graphical comparison sketch — beacon points, a black ray for every accepted-pair
edge, historical/survey distance + swing annotated per ray, failing figures circled in red —
as a **new section** in `beaconAdjustmentReport.js`, styled to match *this file's own*
established visual conventions (not copy-pasted from the other file's style), placed
immediately after the existing tabular Edge Compliance section. The table is **not replaced**
— it remains the complete, always-legible, per-line audit trail; the sketch adds a visual
network overview alongside it. (The same annotation-crowding characteristic already known and
accepted for the shipped sketch — dense networks will show overlapping labels — applies here
too, and is not being solved as part of this change; see the prior feature's tracked
follow-up.)

## Scope decision: two separate documents, not a merge

Explicitly **not** doing (walked back from an earlier, broader proposal after reading the
actual code): merging the two generators into one canonical document, or making
`beaconComparisonReportGenerator.ts`'s output redundant. They serve different purposes — one
is a compact, persisted, collation-friendly project-record section; the other is a rich,
live, examiner-facing export with no persistence today. Forcing them into one document would
require reflowing a multi-page landscape report into a portrait section (or vice versa) for
no benefit once the actual gap (missing sketch) is closed directly.

## Design — match `beaconAdjustmentReport.js`'s own conventions, not `beaconComparisonSection.ts`'s

This file already has an established visual language for "a network of points on a spatial
plot" — `addDisplacementPlot` (its `Holistic Displacement Plot` section). The new sketch
section follows that page's conventions, not the shipped sketch's PDFKit-adjacent styling:

| Aspect | `addDisplacementPlot` (existing, being matched) | Shipped sketch (`beaconComparisonSection.ts`) |
|---|---|---|
| Page | New page, **portrait** | Inline within a portrait flow (no new page) |
| Frame | Bordered box (`doc.rect(...)`) | No border |
| Scale indicator | Tick-marked true scale bar (`scaleBarMetres`/`niceNumber` from `beaconReportGeometry.js`) | "Scale 1 : N" caption only |
| Orientation marker | **South** arrow (`_arrowhead` helper; this whole document is South-oriented, "Bearings South-oriented (0°=S, 90°=W)") | North arrow |
| Section heading style | `sectionTitle()` — 11pt bold NAVY | 10pt bold black |

The new section reuses `addDisplacementPlot`'s bordered-box/scale-bar/south-arrow visual
package, but is a genuinely new method (`addEdgeComplianceSketch`) since the content (a
beacon-pair ray network with per-ray annotations, not per-point displacement vectors) is
different geometry.

**What IS reused verbatim, unchanged:** the pure geometry/scale module from the shipped
feature, `app-frontend/src/utils/beaconComparisonSketchLayout.ts`
(`computeExtent`/`pickSketchScale`/`makeSketchTransform`/`midpointOffset`) — it has no jsPDF
dependency and no opinion about page style, so it works identically here. Also reused: the
established, user-confirmed **ray/annotation colour convention** — rays always plain black
regardless of pass/fail; historical distance black, survey distance red; swing shown signed
(via `formatSignedDMS`, currently a private helper in `beaconComparisonSection.ts` — exported
as part of this change so both files can import it, rather than duplicating four lines of
logic); failing distance and/or direction figures circled in red, independently. This rule is
not renegotiable per-report — it was corrected once already after an initial wrong assumption
and confirmed directly with the end user; it must read identically in both documents.

### Data source (different shape from the shipped sketch — same underlying numbers)

- Beacon positions: `result.pts[].yH/xH` (historical Y/X) — this file's own established field
  access pattern (used throughout `addScheduleLandscape`, `addDisplacementPlot`, etc.), *not*
  `beacon.originalData.coordinates` (that's `ReportOnSurveyData`'s shape, not this file's
  `result` shape).
- Rays: `result.edges.rows` — already all-pairs among *accepted* beacons, computed by
  `si727.js`'s `edgeCompliance()` inside `surveyAdjustmentStore.js`'s `compute()`, exactly the
  same field shape already consumed by this file's own `addEdgeCompliance` method
  (`from, to, dH, dS, dDiff, dAllow, distOk, brgH, brgS, dirDiffSec, dirAllowSec, dirOk,
  pass`) — no new data plumbing needed, this method already receives `result` with `edges`
  populated.
- Survey class / summary: `result.surveyClass`, `result.edges.summary` — likewise already
  available, already used by the existing `addEdgeCompliance` method for its own heading and
  footnote.

### Placement

In `generate()`:
```js
generate(result, meta) {
  this.addHeader(meta)
  this.addTransformStats(result)
  this.addSnoopingLog(result)
  this.addDisplacementPlot(result)
  this.addCertification(result, meta)
  this.addScheduleLandscape(result)
  this.addTransformationResiduals(result)
  this.addReliabilityValidation(result)
  this.addEdgeCompliance(result)
  this.addEdgeComplianceSketch(result)   // NEW — immediately after the table it visualises
  this.addFooters()
  return this.doc
}
```

## Scope boundaries (YAGNI)

- **No persistence change.** `generateBeaconAdjustmentReport` keeps calling `.save()` (browser
  download) exactly as today — this change does not make the report a saved project artifact.
  That was part of the broader proposal explicitly walked back in favour of this narrower scope.
- **No changes to `beaconComparisonReportGenerator.ts`, `beaconComparisonSection.ts`'s
  rendering behaviour, or the Report on Survey.** Only `formatSignedDMS`'s export visibility
  changes there (private → exported), which is a no-op for existing behaviour.
- **No new UI.** The existing "Download Report" button and its metadata form fields
  (`surveyorName`, `plsNumber`, `location`, `priorSurvey`) are untouched.
- **Legibility for dense networks is a known, accepted limitation**, not addressed here —
  consistent with the decision already made for the shipped sketch.

## Testing

`beaconAdjustmentReport.js` currently has no test file (confirmed: no
`__tests__/beaconAdjustmentReport*` exists). This plan adds one, following the same
`renderCapturing`-style pattern used for `beaconComparisonSection.test.ts` (wrap `jsPDF`
methods to capture calls, assert on real drawn content) rather than leaving the whole file
untested:

- `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts` (new): a realistic
  multi-beacon `result` fixture (mirroring `surveyAdjustmentStore.js`'s real shape: `pts` with
  `yH/xH/yS/xS/name`, `edges.rows` with a mix of passing/failing lines, `edges.summary`,
  `surveyClass`) asserts the new section renders (heading, beacon names, at least one
  historical/survey distance pair, a signed swing) and that the black-rays-always +
  circle-only-failures rule holds (same `doc.line`/`doc.ellipse`/`doc.setDrawColor`
  interception technique already proven in `beaconComparisonSection.test.ts`'s fix commit).
- `formatSignedDMS`'s existing behaviour (in `beaconComparisonSection.test.ts`) is unaffected
  by exporting it — no test changes needed there beyond adding the export keyword.

## Files touched

Modified:
- `app-frontend/src/utils/beaconAdjustmentReport.js` (new `addEdgeComplianceSketch` method +
  one call-site insertion in `generate()`)
- `app-frontend/src/utils/beaconComparisonSection.ts` (`formatSignedDMS`: add `export`)

New:
- `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts`

Untouched (confirmed no change needed):
- `app-frontend/src/utils/beaconComparisonSketchLayout.ts` (reused as-is)
- `app-frontend/src/utils/beaconComparisonReportGenerator.ts`, `beaconComparisonSection.ts`'s
  rendering logic, `reportOnSurveyGenerator.ts`, `si727.js`, `surveyAdjustmentStore.js`
- `app-frontend/src/views/modules/lite/compare/CompareView.vue`

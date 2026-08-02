# Beacon Comparison Sketch (SI 727 s.67(5))

**Date:** 2026-08-02
**Status:** Design approved, pending spec review
**Scope:** Frontend only (jsPDF report generation). No backend changes.

## Problem

The Found Beacons Assessment report (SI 727 s.67(5)) currently only ever renders a
coordinate **tabulation** — a table of each beacon's historical vs. surveyed Y/X and the
point-position discrepancy. A **comparison sketch** — a graphical diagram of the beacon
network with pass/fail annotations on each connecting ray — has never actually been built:

- `BeaconComparisonConfig.method: 'tabulation' | 'sketch' | 'both'` exists as a type, but
  `renderBeaconComparison` (`app-frontend/src/utils/beaconComparisonSection.ts`) only branches
  on `method === 'tabulation' || method === 'both'` to call `renderBeaconComparisonTable` —
  there is no sketch branch at all.
- An older, **orphaned** file (`app-frontend/src/utils/beaconComparisonGenerator.ts`,
  `generateSketchHTML`) produces an HTML placeholder (text list of beacons + an unstyled
  table), not a drawing, and nothing imports this file — it is dead code.
- The underlying SI 727 (1979) per-ray compliance math (distance **and** direction/"swing"
  checks against the real class-B/C tolerance formulas) is already built, live, and used
  today — `app-frontend/src/utils/si727.js`'s `edgeCompliance(points, cls)` is called by
  `app-frontend/src/stores/surveyAdjustmentStore.js` on every comparison run, and its result
  (`result.edges`) is already displayed as a table in the interactive "Edge compliance" tab
  of `CompareView.vue`. But this result is **discarded** the moment the assessment is saved —
  `useFoundBeaconsComparison.ts`'s `buildComparisonConfig` never reads `result.edges` at all.

So the hard part (the actual SI 727 compliance calculation) is done and already trusted in
production; what's missing is (a) carrying that result through to the saved assessment, and
(b) an actual graphical renderer for it.

## Desired behaviour

A **comparison sketch** — beacon points plotted to scale, connected by a ray for every pair
(all-pairs, matching the Surveyor-General sample), each ray annotated with its historical
distance, surveyed distance, and swing (direction difference) — is added to the Found Beacons
Assessment report, rendered automatically alongside the existing tabulation (no method picker
needed; `method` stays available in the type for forward compatibility but both blocks always
render).

### Visual convention (confirmed against a Surveyor-General sample and corrected in review)

- **Ray lines are always plain black** — pass/fail is never shown by recolouring the line
  itself (this corrects an initial assumption; the final, confirmed convention is below).
- **Ink colour by data source, not by pass/fail:** the historical/original-survey distance
  figure is **black**; the current-survey distance figure is **red**. This matches the
  existing tabulation table's own convention (`beaconComparisonSection.ts`'s
  `renderBeaconComparisonTable`, historical columns black, "This Survey" columns red) — the
  sketch is visually consistent with the table it sits beside.
- **Pass/fail is shown by circling the failing figure(s) in red** — mirroring the sample's
  own convention of circling flagged numbers, rather than colouring the whole ray.
- **Both distance and swing are checked and both are annotated per ray** — a ray can fail on
  distance, on direction, or both; each failing figure (the distance difference and/or the
  swing) is circled independently.
- Beacon points, a north arrow, a "Scale 1 : N" caption, and a legend are included, consistent
  with the rest of this app's diagram outputs.

## Data flow

### 1. Carry `result.edges` through the save path

`app-frontend/src/composables/useFoundBeaconsComparison.ts`:

- `EngineResult` (currently `{ pts, adj? }`) gains an optional `edges` field matching
  `si727.js`'s `edgeCompliance` return shape:
  ```ts
  edges?: {
    rows: Array<{
      from: string; to: string
      dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean
      brgH: number; brgS: number; dirDiffSec: number; dirAllowSec: number; dirOk: boolean
      pass: boolean
    }>
    summary: { totalLines: number; distPass: number; dirPass: number; bothPass: number
               meanScale: number | null; meanSwingDeg: number | null }
  }
  surveyClass?: 'B' | 'C'
  ```
  (This is exactly `surveyAdjustmentStore.js`'s `result.edges`/`result.surveyClass` shape,
  already computed on every run — `buildComparisonConfig` just needs to read it.)
- `buildComparisonConfig` reads `result?.edges` and `result?.surveyClass` and populates a new
  `BeaconComparisonConfig.edgeCompliance` field (see below) instead of leaving it unset.

### 2. Replace the inert `interBeaconChecks` field

`app-frontend/src/types/cadastral.ts`'s `BeaconComparisonConfig`:

- The current `interBeaconChecks?: {...}[]` field is speculative and was never populated by
  any real caller (confirmed: no code outside its own type declaration and the orphaned
  `beaconComparisonGenerator.ts` references it). Replace it with a field carrying the real,
  already-computed edge-compliance data verbatim:
  ```ts
  /** SI 727 s.67(5) inter-beacon (edge) compliance — distance AND direction/swing checks
   *  for every pair of accepted beacons. Source of truth for the comparison sketch. */
  edgeCompliance?: {
    surveyClass: 'B' | 'C'
    rows: Array<{
      from: string; to: string
      dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean
      brgH: number; brgS: number; dirDiffSec: number; dirAllowSec: number; dirOk: boolean
      pass: boolean
    }>
    summary: { totalLines: number; distPass: number; dirPass: number; bothPass: number
               meanScale: number | null; meanSwingDeg: number | null }
  }
  ```
  This is an additive, non-breaking change (the old field had no real producer or consumer).

### 3. Beacon point positions for plotting

The sketch also needs each beacon's **historical** (`yH, xH`) and **surveyed** (`yS, xS`)
coordinates to plot points and draw rays — these already exist per-beacon in
`ReportOnSurveyData.beacons[].originalData.coordinates` (historical) and
`.currentCoordinates` (surveyed), the same fields the tabulation already reads. No new field
needed here; the sketch renderer takes the same `reportData.beacons` array
`renderBeaconComparisonTable` already consumes.

## Rendering

### New function: `renderBeaconComparisonSketch` in `beaconComparisonSection.ts`

Called from `renderBeaconComparison` right after the existing tabulation call:

```ts
if (comparison.method === 'tabulation' || comparison.method === 'both') {
  renderBeaconComparisonTable(cursor, reportData);
}
renderBeaconComparisonSketch(cursor, reportData);   // always — see "Always included" below
```

Signature: `renderBeaconComparisonSketch(cursor: BeaconComparisonCursor, reportData: ReportOnSurveyData): void`
— same cursor-mutation pattern as every other block in this file (`cursor.y` advances as
content is drawn; `checkPageBreak` guards page-fit).

No-op (returns immediately) when `reportData.beaconComparison?.edgeCompliance?.rows` is
empty/absent — e.g. fewer than 2 beacons, or an older saved assessment predating this feature
(no crash, no empty page section).

### New pure helper module: `app-frontend/src/utils/beaconComparisonSketchLayout.ts`

Coordinate-space math, kept separate from the jsPDF drawing calls (testable without a jsPDF
instance, mirroring how `si727.js` itself is pure):

- `pickSketchScale(extentM: {widthM, heightM}, areaMm: {width, height}) -> { denom, label }` —
  auto-picks a "nice" scale denominator (reusing the same SI 727 scale-ladder concept the
  backend diagram renderer uses — `[100,125,150,200,250,300,400,500,...]` — so the sketch
  reads like a standard SI 727 diagram, not an arbitrary plot) such that the beacon network's
  ground extent fits the available mm² area on the page.
- `makeSketchTransform(extent, areaMm, denomM) -> (point: {y,x}) => {mmX, mmY}` — maps ground
  Y/X (Cape Lo convention, same axes as the rest of this app) into page millimetres within the
  sketch area, north-up (mirrors the backend `diagram/diagramScale.js`'s `makeTransform`
  convention, ported to this frontend module rather than imported — different runtime/module
  graph, same math).
- `midpointOffset(a: {mmX,mmY}, b: {mmX,mmY}, offsetMm: number) -> {mmX, mmY}` — a point beside
  a ray's midpoint (perpendicular to the ray), for placing the stacked distance/swing labels
  clear of the line itself.

### Drawing sequence (jsPDF calls, using this codebase's existing colour conventions —
`pdf.setTextColor(0,0,0)` black, `(220,0,0)` or similar red, `pdf.setDrawColor`,
`pdf.setLineWidth`, all already used elsewhere in this file's sibling generators):

1. Compute the beacon extent (min/max Y/X across all beacons' **historical** coordinates —
   the network's nominal shape) and pick a scale + transform via the helpers above. The
   sketch area is a fixed **SKETCH_HEIGHT_MM = 140mm** band spanning the full content width
   (`cursor.pageWidth - cursor.margin * 2`); `checkPageBreak(cursor, SKETCH_HEIGHT_MM + 20)`
   first (the `+20` covers the north-arrow/scale caption above and the legend/summary line
   below), so the whole sketch always starts fresh on one page rather than splitting mid-ray.
2. Draw the north arrow and a "Scale 1 : N" caption above the sketch area.
3. Draw every ray first (`pdf.setDrawColor(0,0,0)`, `pdf.setLineWidth(0.2)`, plain solid line,
   `pdf.line(...)`) — **all pairs**, i.e. one line per `edgeCompliance.rows` entry, using the
   **historical** positions of `from`/`to` for BOTH the ray endpoints and the beacon circle
   centres in the next step (the ray represents the nominal network; historical and surveyed
   points are close enough at sketch scale that drawing from one consistent coordinate set
   keeps the geometry clean — annotations carry the actual numeric discrepancy; the surveyed
   coordinates are never separately plotted as a second set of points).
4. Draw each beacon as a small open circle — `pdf.circle(x, y, 1.5 /* mm */, 'S')` — at its
   **historical** position, with its name label (8pt) beside it, offset ~2mm outward from the
   local point cluster's centroid (reuses the same "circle + outward label" visual idea as
   the rest of this app's diagrams, sized for legibility rather than a strict door-scale).
5. For each ray, place its annotation beside the midpoint (`midpointOffset(a, b, 2.5mm)` —
   perpendicular offset, alternating which side of the line successive rays label to reduce
   overlap in a dense all-pairs network), all text at **6pt**:
   - Historical distance (`dH.toFixed(3)`), **black** (`pdf.setTextColor(0,0,0)`).
   - Surveyed distance (`dS.toFixed(3)`), **red** (`pdf.setTextColor(220,0,0)`), stacked
     ~2.2mm directly below the historical figure.
   - Swing (`formatDMS(row.dirDiffSec / 3600)`, reusing the existing `surveyMath.js` helper
     the interactive Edge Compliance tab already uses), black text, ~2.2mm below the distance
     pair.
   - If `!row.distOk`: circle the surveyed-distance figure — `pdf.setDrawColor(220,0,0)`,
     `pdf.setLineWidth(0.15)`, an ellipse/circle (`pdf.ellipse` or `pdf.circle`, radius sized
     to the text's measured width via `pdf.getTextWidth`) drawn around it. If `!row.dirOk`:
     circle the swing figure the same way. A ray can have either, both, or neither circled.
6. A short legend line beneath the sketch: "Black = historical, Red = current survey, Circled
   = outside SI 727 tolerance", plus the summary line already computed by `edgeCompliance`
   (mirrors the Edge Compliance tab's own summary text): `SI 727 Class {surveyClass} · N of M
   lines pass both checks`.

### Always included

Per the approved design, both the tabulation and the sketch render unconditionally — the
`method` field is read only for the tabulation branch (existing behaviour, unchanged) and is
otherwise no longer gating anything. This keeps `method` in the type for forward
compatibility without requiring a UI control to select it (none exists today).

## Scope boundaries (YAGNI)

- **No backend/PDFKit/DXF work.** This is entirely within the existing jsPDF-based frontend
  report pipeline (`beaconComparisonSection.ts` and its callers). Nothing in `app-backend` is
  touched.
- **No new "sketch method" UI control.** Both blocks always render; `method` stays as-is.
- **No change to the point-position (tabulation) comparison, its tolerance, or the Helmert/
  W-test accept-reject engine.** The sketch is a new, additive block reading data the engine
  already produces.
- **Ray geometry uses historical coordinates only**, not a blended/averaged position — the
  network shape is nominal; the discrepancy is expressed entirely through the per-ray
  annotations, not through drawing two slightly-offset lines per pair.
- **No table alternative to the annotations** — per the explicit Surveyor-General requirement,
  the numeric detail lives on the sketch itself, not in a separate table.

## Testing

- `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts` (new): pure unit
  tests for `pickSketchScale`, `makeSketchTransform`, `midpointOffset` — scale picks a
  denominator that fits, transform maps known points to expected mm positions, midpoint
  offset is perpendicular and the requested distance from the ray.
- `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts` (extend): a case with
  `beaconComparison.edgeCompliance` populated (2+ beacons, at least one row with `pass:
  false`) asserts `renderBeaconComparisonSketch` is reached (via the existing pattern of
  spying on `jsPDF` methods or inspecting the rendered document, matching how this test file
  already verifies `renderBeaconComparisonTable`'s output) and that it doesn't throw when
  `edgeCompliance` is absent (back-compat with pre-existing saved assessments).
- `app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts` (extend):
  `buildComparisonConfig` populates `edgeCompliance` from a `result.edges`/`result.surveyClass`
  fixture; omits the field when `result` is null or carries no `edges`.

## Files touched

New:
- `app-frontend/src/utils/beaconComparisonSketchLayout.ts`
- `app-frontend/src/utils/__tests__/beaconComparisonSketchLayout.test.ts`

Modified:
- `app-frontend/src/utils/beaconComparisonSection.ts` (new `renderBeaconComparisonSketch`
  function + one call site in `renderBeaconComparison`)
- `app-frontend/src/types/cadastral.ts` (`BeaconComparisonConfig.interBeaconChecks` →
  `edgeCompliance`)
- `app-frontend/src/composables/useFoundBeaconsComparison.ts` (`EngineResult` gains
  `edges`/carry-through in `buildComparisonConfig`)
- `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`
- `app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts`

Untouched (confirmed no change needed — they already call the shared renderer, or already
compute the data this feature consumes):
- `app-frontend/src/utils/si727.js` (`edgeCompliance` is read, not modified)
- `app-frontend/src/stores/surveyAdjustmentStore.js` (already computes `result.edges`)
- `app-frontend/src/views/modules/lite/compare/CompareView.vue` (its own "Edge compliance"
  tab is unrelated UI, untouched)
- `app-frontend/src/utils/beaconComparisonReportGenerator.ts` and
  `app-frontend/src/utils/reportOnSurveyGenerator.ts` (both call the shared
  `renderBeaconComparison` — the sketch appears in both the standalone Beacon Comparison
  Report and the inline Report on Survey automatically, with no change to either file)
- `app-frontend/src/utils/beaconComparisonGenerator.ts` (orphaned/dead code — left alone,
  not deleted as part of this feature; a separate cleanup decision)

# Beacon Comparison & Adjustment — Examination Report (PDF)

**Date:** 2026-05-24
**Status:** Approved (design)
**Component:** `app-frontend` — Lite → Transform → Beacon Comparison (`/modules/lite/compare`)

## Purpose

Produce a print-ready PDF report of a beacon comparison / least-squares
adjustment for the **Office of the Surveyor-General** to use when examining and
approving a survey record under **SI 727 of 1979, Section 67(5)**. The report
documents how each compared beacon's historical coordinates relate to the new
survey, the Helmert transformation between them, the statistical test results,
the data-snooping decisions, and a **holistic displacement plot** of the whole
network for at-a-glance visual assessment.

## Scope

- A new client-side report generator that turns an existing adjustment result
  into a PDF, triggered from the Beacon Comparison tool.
- A small set of examination-metadata inputs in the tool UI.
- A native-vector displacement plot rendered into the PDF.

### Non-goals

- No backend route, persistence, or database storage (the Lite tool is
  standalone and stores nothing server-side).
- No change to the adjustment mathematics (`surveyMath.js` is unchanged).
- No SG crest/letterhead asset handling (report uses SurveyPro report styling
  per the chosen branding option).

## Convention (carried from the tool)

Cape Lo / Gauss Lo **P(Y, X)**: `Y = Westing`, `X = Southing`. Bearings are
**South-oriented**, whole-circle `[0,360)`: `0°=S, 90°=W` (matches
`app-backend/src/utils/zim-geo.js`). The Helmert translation is reported at the
network centroid (numerically reduced — see the tool's `surveyMath.js`).

## Architecture

### New module: `app-frontend/src/utils/beaconAdjustmentReport.ts`

A single-purpose generator following the established pattern of
`reportOnSurveyGenerator.ts` (jsPDF, A4, helvetica, `currentY` cursor,
`jspdf-autotable` for tables). No Vue/Pinia/network dependencies — a pure
function of its inputs, independently testable.

```ts
interface BeaconReportMeta {
  surveyorName: string   // examining/submitting surveyor
  plsNumber: string      // PLS registration number
  location: string       // stand/property description, district, Lo zone
  priorSurvey: string    // original/prior SR or Diagram/General Plan number
  sigma0: number         // a priori σ₀ used (m)
  critW: number          // W-test critical value used
  date: string           // examination date (default: today)
}

// `result` is the object returned by iterativeAdjust():
//   { pts, adj: { params, stats }, log, converged }
export function generateBeaconAdjustmentReport(
  result: any,
  meta: BeaconReportMeta,
): void   // builds the jsPDF and calls doc.save(filename)
```

`filename`: `beacon-comparison-<priorSurvey | date>.pdf`, with the identifier
sanitised to `[A-Za-z0-9._-]`.

### UI additions: `CompareView.vue`

- An **"Examination details"** input group (4 text inputs: surveyor name, PLS
  no., location/description, prior survey/Diagram-GP no.) held in local `ref`s
  (report-only metadata; not persisted to the store).
- A **"📄 Examination Report (PDF)"** button in the results panel, enabled only
  when `result` is present. On click it assembles `meta` (inputs + current
  `sigma0`/`critW` + today's date) and calls the generator.

### Data flow

`CompareView` (result from store + local meta refs) → `generateBeaconAdjustmentReport(result, meta)` → jsPDF document → `doc.save(...)` (browser download). No other component or service is involved.

## Report layout

SurveyPro report styling (helvetica), A4, with the SI 727 §67(5) subtitle.

1. **Header (portrait):** title `BEACON COMPARISON & ADJUSTMENT`; subtitle
   `SI 727 of 1979 — Section 67(5)`; metadata block — Surveyor + PLS no.,
   Location/description, Prior survey / Diagram-GP no., Examination date.
2. **Comparison schedule (landscape page):** `jspdf-autotable` with columns —
   Beacon, Hist Y, Hist X, Survey Y, Survey X, ΔY, ΔX, vY, vX, Dist, Brg (S),
   W-max, Status. (13 columns with 7-digit southings do not fit A4 portrait
   legibly, hence a dedicated landscape page.) Rejected rows tinted red;
   residual/W cells show `—` for rejected beacons (undefined by definition);
   raw ΔY/ΔX/dist shown for all.
3. **Transformation + statistics (portrait):** Helmert ΔY/ΔX (at centroid),
   scale, ppm, rotation; σ₀ a priori / a posteriori; DOF; χ² value with
   `[lower, upper]` bounds and a **PASS / FAIL** verdict.
4. **Data-snooping log (portrait):** iteration table — iter, active points, σ₀,
   χ², bounds.
5. **Holistic displacement plot (portrait, full width):** see below.
6. **Certification statement:** outcome summary (n accepted / m rejected, χ²
   verdict); a recommendation line — `Recommended for approval` when all
   beacons accepted and χ² passes, otherwise `Referred — N beacon(s) exceed
   tolerance`; signature lines (Examined by / Date).
7. **Footer (every page):** page `n of m` and a "computer-generated" note.

## Displacement plot specification

Drawn with native jsPDF vector primitives (lines, circles, polygons, text) into
a bordered plot box on a portrait page.

- **Orientation:** conventional plan layout — `East = −Y` (right), `North = −X`
  (up) — annotated for South orientation with a prominent **S↓ arrow** and the
  note `Bearings South-oriented (0°=S, 90°=W)`. (Physical layout equals N-up/
  E-right; this reads correctly to examiners while staying true to the bearing
  convention.)
- **True scale:** `s = min(boxW / spanE, boxH / spanN)` page-mm per metre,
  computed from the network bounds (spans guarded with `|| 1`). Drives a
  **true-metre scale bar** (nice round length, e.g. 50/100/200 m).
- **Vector exaggeration:** displacement drawn length = `(survey − historical) ·
  s · k`. `k` chosen so the largest displacement renders ≈ 20 mm, rounded to a
  "nice" 1/2/5 × 10ⁿ value, and **printed on the plot** (e.g. "displacement
  vectors ×500").
- **Per beacon:** historical position = filled black dot; arrow to the
  exaggerated survey position; survey dot coloured **blue = accept / red =
  reject**; beacon label offset from the dot. Rejected beacons additionally
  flagged (e.g. red label).
- **Legend:** black = historical, coloured = survey (accept/reject), arrow =
  displacement (exaggerated), scale bar = true metres.
- **Degenerate cases:** all-zero displacements → `k = 1`, note "no measurable
  displacement"; single point / collinear bounds → span guard prevents divide-
  by-zero; the plot still renders dots + labels.

## Error handling / edge cases

- Report button disabled until `result` exists (no compute → nothing to report).
- Empty metadata fields render as `—`; none are mandatory.
- Rejected beacons: schedule shows raw ΔY/ΔX/dist/bearing; residuals & W as `—`.
- `result.converged === false` (didn't converge in 25 iterations): report still
  generates from the last state; certification line states "Did not converge —
  refer".

## Verification plan

1. `npm run build` — compiles, emits updated `CompareView` chunk, no errors.
2. Reuse the Edge/Playwright harness: seed auth, load `/modules/lite/compare`,
   load sample data, Compute, fill examination details, click the report
   button, capture the download, and render page 1 + the plot page to confirm
   the layout, schedule, statistics, and plot visually.

## Files touched

- **New:** `app-frontend/src/utils/beaconAdjustmentReport.ts`
- **Edit:** `app-frontend/src/views/modules/lite/compare/CompareView.vue`
  (examination-details inputs + report button + handler)
- **New (spec):** this document.

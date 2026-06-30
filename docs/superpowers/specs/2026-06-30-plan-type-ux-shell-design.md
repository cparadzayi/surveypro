# Plan-Type UX Shell — Design

**Date:** 2026-06-30
**Status:** Approved (design)
**Sub-project:** 1 of 3 in the "diagram production" initiative

## Context

SurveyPro produces SI 727-compliant survey documents. The frontend
`SurveyPlanMapView.vue` currently exposes a **Plan Type** dropdown with four
options (`general-undeveloped`, `general-developed`, `diagram`, `working-plan`)
but three **format-oriented** export buttons that ignore the chosen type:

- `exportGeneralPlan()` → vector GeoPDF (`POST /api/geopdf/vector`)
- `generateComprehensivePDF()` → multi-document "Complete Survey Record"
- `exportToDXF()` → DXF (`POST /api/geopdf/dxf`)

Two problems:

1. **The action does not reflect the deliverable.** The primary button always
   says "Generate General Plan" regardless of plan type; the user must know to
   click a *format* button after choosing a *type*.
2. **Only two variants actually render differently.** The backend renderers
   (`pdfkitGeoPDF.js`, `dxfGenerator.js`) branch only on `general-developed`
   vs. everything-else. `diagram` and `working-plan` currently produce output
   identical to an undeveloped general plan.

This initiative makes each plan type a genuinely distinct deliverable that
auto-produces **both** PDF and DXF. It is decomposed into three sub-projects,
each with its own spec → plan → implementation cycle:

1. **UX shell** (this spec) — plan-type-driven generation plumbing + UX.
2. **Diagram renderer** — single-parcel S.G. registered format.
3. **Working Plan renderer** — survey block + surroundings + trig connections +
   inset locality plan + coordinate grid, no tables, A4/A3 landscape.

This spec covers **only the UX shell**. It deliberately does **not** change what
any renderer draws.

## Goal

Make **Plan Type** the single driver of document generation:

- Pick a plan type (and, for Diagram, click the subject parcel on the map).
- One **Generate** action produces both PDF and DXF.
- Both files are delivered as a **single ZIP**.
- **PDF-only** / **DXF-only** toggles are available for users who want one format.
- "Download Complete Survey Record" remains a separate, unchanged button.

## Non-Goals

- No change to renderer output (`pdfkitGeoPDF.js`, `dxfGenerator.js`). Diagram
  and Working Plan still route through the existing pipeline; Diagram is merely
  filtered to the one selected parcel. Distinct rendering arrives in
  sub-projects 2 and 3, branching on `planType` inside the renderers behind this
  same plumbing.
- No backend route changes. The existing `/api/geopdf/vector` and
  `/api/geopdf/dxf` endpoints already accept the full payload and a `planType`.
- No change to the "Complete Survey Record" flow.

## Components

### 1. Plan-type metadata map

A small reactive table keyed by `config.planType`, the single source of truth
the UI and orchestrator both read:

| key                   | label                              | subjectMode    | defaultScaleHint |
| --------------------- | ---------------------------------- | -------------- | ---------------- |
| `general-undeveloped` | General Plan (Undeveloped Portion) | `whole-set`    | auto             |
| `general-developed`   | General Plan (Developed Portion)   | `whole-set`    | 1:500 ceiling*   |
| `diagram`             | Diagram                            | `single-parcel`| auto             |
| `working-plan`        | Working Plan                       | `whole-set`    | auto             |

\* The 1:500 ceiling for `general-developed` already exists in the renderers
(`applyPlanTypeCeiling`); the metadata map only records it for labelling, it does
not re-implement it.

`subjectMode` drives whether the Diagram subject picker is active and whether the
payload is filtered to one parcel.

### 2. Diagram subject selection (map-click)

When `planType === 'diagram'`:

- A MapLibre `click` handler on the parcel `-fill` layers sets
  `selectedDiagramParcelId`.
- The chosen parcel's outline is emphasised (heavier/blue line via a highlight
  paint property or a dedicated highlight layer).
- The panel shows the chosen stand number and a hint: *"Click the parcel to
  diagram."*

When `subjectMode === 'whole-set'`, the handler is inactive and all project
parcels are used. Switching plan type away from `diagram` clears the highlight;
switching to `diagram` with no selection shows the hint and disables Generate.

### 3. Action group

Replaces the standalone GeoPDF and DXF buttons. **Keeps** "Download Complete
Survey Record" unchanged.

- **Primary:** `Generate {planTypeLabel}` → both PDF + DXF.
- **Secondary:** `PDF only` / `DXF only` toggles (e.g. two checkboxes or a small
  segmented control). Default: both on. If neither is on, Generate is disabled.

Button label is driven by the metadata map, so it always names the deliverable.

### 4. Generation orchestrator

`generatePlanDocuments(formats: { pdf: boolean; dxf: boolean })` — one async
function:

1. **Validate.** In `single-parcel` mode, require `selectedDiagramParcelId`;
   otherwise require ≥1 parcel. Require ≥1 requested format.
2. **Build payload once** via `buildPlanPayload(...)` (see §5).
3. **Generate per requested format**, reusing existing service functions and
   their scale-retry logic:
   - `pdf` → `generateVectorGeoPDF(payload)` (with the existing
     suggested-scale retry currently in `exportGeneralPlan`).
   - `dxf` → `generateDXF(payload)`.
4. **Deliver.**
   - Both formats → bundle into one `.zip` with `JSZip` (already a dependency),
     download via existing `downloadBlob`.
   - Single format → download that file directly.
5. **Surface warnings.** Reuse the existing DXF warning summary
   (`warningCount` / `warningsSummary`) into the status line.

**Naming.** Base = `{planType}-{designation || projectId}-{timestamp}`.

- ZIP: `{base}.zip`, containing `{base}.pdf` and `{base}.dxf`.
- Single: `{base}.pdf` or `{base}.dxf`.

### 5. Targeted refactor — `buildPlanPayload`

`exportGeneralPlan()` and `exportToDXF()` currently duplicate the same
payload-building (metadata, scale resolution, sheet/orientation resolution,
`parcelsGeoJSON` / `beaconsGeoJSON`, `outsideFigureData`, `beaconLabels`,
`beaconGroups`, `projection`). Extract it into one helper:

```
buildPlanPayload(planType, subjectParcelId?) -> {
  parcels, beacons, projection, metadata, outsideFigureData,
  scale, sheetSize, orientation, planType, beaconLabels, beaconGroups
}
```

- For `single-parcel` mode, filters `parcels` (and the dependent
  `beacons`/`beaconLabels`) to the subject parcel; otherwise returns the full
  set.
- Both the orchestrator and the future per-type renderers consume this one
  shape, eliminating the current drift between the two export paths.

The existing `exportGeneralPlan` / `exportToDXF` are removed (their button
entry points are replaced by the action group); their reusable internals move
into `buildPlanPayload`.

## Data Flow

```
planType select ─┐
                 ├─► buildPlanPayload(planType, subjectParcelId?)
(diagram) map-click ─► selectedDiagramParcelId ─┘        │
                                                         ▼
                                   { pdf? generateVectorGeoPDF }
                                   { dxf? generateDXF }
                                                         │
                                          both ─► JSZip ─┤
                                          one  ─────────┤
                                                         ▼
                                                  downloadBlob
```

## Error Handling

- **No subject parcel** (Diagram mode) → Generate disabled + inline message.
- **No format selected** → Generate disabled.
- **One of two formats fails** → deliver the format that succeeded, show a
  warning naming the one that failed.
- **Both fail** → error message; nothing downloaded.
- **Scale fallback** → reuse the existing suggested-scale retry already in the
  PDF path.

## Testing

**Unit (frontend):**

- `buildPlanPayload` returns a single-parcel set in `single-parcel` mode and the
  full set otherwise (including dependent beacons/labels filtering).
- Filename / zip-name composition for both, single-pdf, single-dxf.
- `generatePlanDocuments` calls only the requested services (mocked) and zips
  only when both succeed.
- Validation gates: diagram-without-subject and no-format-selected both block.

**Unaffected:** existing backend DXF/PDF renderer tests — no renderer change.

**Manual:** for each plan type, choose it (click a parcel for Diagram), Generate,
and confirm the ZIP contains the expected `.pdf` + `.dxf`; confirm PDF-only and
DXF-only download a single file.

## Open Questions

None blocking. Diagram in this sub-project produces the *existing* rendering
filtered to one parcel; its distinct S.G. format is sub-project 2.

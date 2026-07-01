# Diagram PDF Renderer — Design

**Date:** 2026-07-01
**Status:** Approved (design)
**Sub-project:** 2b of 3 in the "single-stand Diagram renderer" initiative (sub-project 2 of "diagram production")

## Context

The plan-type UX shell (sub-project 1) lets a user pick **Diagram**, click a
subject parcel, and generate PDF + DXF. Sub-project 2a captured the seven
project-level diagram reference fields and carries them into the renderer
`metadata`. Today the `diagram` plan type still renders like an undeveloped
General Plan (filtered to one parcel).

2b builds the real **single-stand S.G. Diagram** in PDF — the registrable format
of the three reference samples (STANDS 302/303/310 Brackenhurst). 2c mirrors it
in DXF afterwards for PDF↔DXF parity.

## Decisions (from brainstorming)

- **Neighbour scope: core + derivable neighbours.** The first cut renders the
  full core diagram plus neighbour **stand numbers** and road-frontage **edge
  lengths**. Deferred (need data capture, a later step): named roads (e.g.
  "Klein Road"), and dashed bearing/distance connection lines to external
  adjoining survey beacons. The road/street name is not in the data model today.
- **Const. row = 0.00 / 0.00, full beacon coordinates** in the coordinates
  table (the app stores full coords; no origin/residual split). Carried from 2a.
- **Sheet: A4 portrait; scale: auto** (SI 727 prescribed ladder) unless the
  shell supplies a scale. Single stand → single sheet, no tiling.
- **Separate module**, not a branch in the General Plan renderer.

## Architecture

- **New module** `app-backend/src/services/diagramPdf.js` exporting
  `generateDiagramPDF(options, logger)` — parallels
  `pdfkitGeoPDF.js`'s `generateGeoPDF` but renders the fixed A4-portrait Diagram
  template. It does **not** modify `pdfkitGeoPDF.js` (12.9k lines, GP-tuned).
- **Route dispatch:** `app-backend/src/routes/geopdf-vector.js` `POST /vector`
  branches to `generateDiagramPDF` when `planType === 'diagram'`; all other plan
  types keep calling `generateGeoPDF`. The response contract (PDF buffer +
  headers) is unchanged.
- **Reuse (pure/shared only):** `resolveLoSystem`, `snapScaleBarSegment`
  (`app-shared/block-definitions.js`), bearing-DMS formatting, the SI 727 scale
  ladder / scale selector, and a small coordinate transform. Drawing primitives
  the diagram places differently (scale bar, T/N arrow, coordinate mapping) are
  implemented compactly inside `diagramPdf.js` rather than coupling to the GP
  renderer's internals. A genuinely-identical pure helper is extracted to a
  shared location rather than duplicated.
- **Shell payload change:** for `planType==='diagram'`, `buildPlanPayload`
  (`app-frontend/.../planPayload.ts`) stops filtering the payload down to the
  subject parcel. It passes **all** parcels/beacons and adds `subjectParcelId`
  (into `metadata`, camelCase `subjectParcelId`). The renderer draws the subject
  in full detail and neighbours as faint context outlines with their
  stand-number labels. The sub-project-1 single-parcel-filter tests are updated
  to reflect the new behaviour (diagram no longer strips neighbours; it marks
  the subject instead).

## Layout Template (A4 portrait), top → bottom

1. **SIDES / DIRECTIONS / CO-ORDINATES table** (full width):
   - SIDES column: `AB, BC, CD…` with **Metres** (side distances).
   - DIRECTIONS column: **° ′ ″** (DMS bearing of each side).
   - `Lo NN°` header + **CO-ORDINATES**: per-vertex letter (A, B, C…) with full
     **Y** and **X** (metres). A **Const.** row shows `0.00 / 0.00`.
   - **DIAGRAM S.G. No.** box (right) — left blank (SG office fills).
2. **Beacon description** ("All : 12 mm iron peg…" derived like the GP's) and the
   **T/N north arrow** (left region under the table).
3. **Approved / for Surveyor-General / Date** box (upper-right region).
4. **The figure** (central area):
   - Subject parcel outline with **lettered vertices** (A, B, C… in ring order),
     each edge labelled with its **bearing (DMS)** and **distance**.
   - Neighbour parcels drawn as **faint outlines** labelled with their **stand
     numbers** (designations).
   - Road-frontage edges labelled with their **length** (road name deferred).
5. **Scale bar** (round-metre graduations) + **"Scale 1 : N"**.
6. **"The figure represents A.B.C…A. / N square metres of land called STAND …
   TOWNSHIP OF …"** — vertex sequence + area + subject designation + parent.
7. **"situate in the district of … / Surveyed in <month year> by me"** +
   signature line + **"Land Surveyor"**.
8. **Reference grid** (labelled cells; values from 2a metadata, blanks where
   empty): immediate parent diagram No. + "annexed to"; Deed of Transfer No.;
   File; G.P.; original title diagram No.; S.R.; "This diagram is annexed to
   No.___ dated___" (blank); registration "G.P." (blank); "Compilation" (blank);
   "Surveyor-General".

## Data Flow

```
Shell (planType='diagram'): buildPlanPayload → all parcels + subjectParcelId in metadata
      │  POST /api/geopdf/vector
      ▼
geopdf-vector.js /vector  ──(planType==='diagram')──►  generateDiagramPDF(options, logger)
      │
      ▼
diagramPdf.js:
  find subject parcel by subjectParcelId
  derive ordered edges (bearing DMS + distance) + lettered vertices (A,B,C…)
  build sides/directions/coordinates table rows (Const 0.00, full Y/X)
  neighbours = all other parcels (faint outline + stand-number label)
  reference-grid model from metadata (7 fields; blanks where empty)
  pick scale (shell value or auto SI 727) → coordinate transform into A4 figure area
  draw all template blocks → return { buffer }
```

`options` fields: `parcels` (FeatureCollection, all), `beacons`
(FeatureCollection, all), `beaconLabels`, `metadata` (`designation`, `district`,
`surveyDate`, `surveyor`, `parentProperty`, `wholePortion`, `centralMeridian`,
`subjectParcelId`, and the seven 2a fields), `projection`, `scale` (string or
`'auto'`), `sheetSize` (`'A4'`), `orientation` (`'portrait'`).

## Scale & Sheet

A4 portrait, fixed. Scale = the shell's requested value when supplied; otherwise
**auto**: the largest SI 727 prescribed scale (base ladder ×/÷ 10ⁿ, via the
existing scale selector) at which the subject parcel's extent fits the figure
area legibly. The chosen scale drives the scale bar graduations and the
"Scale 1 : N" text. No multi-sheet tiling.

## Components / File Structure

- `app-backend/src/services/diagramPdf.js` — `generateDiagramPDF` (assembly +
  the net-new drawing).
- `app-backend/src/services/diagram/` (focused pure helpers, each unit-tested):
  - `subjectGeometry.js` — ordered edges (bearing DMS + distance) + lettered
    vertices from the subject ring + matched beacons.
  - `sidesTable.js` — sides/directions/coordinates table rows (Const 0.00, full
    coords) + the "figure represents A.B.C…A." string + formatted area.
  - `referenceGrid.js` — map metadata → reference-grid cell values (blanks where
    empty).
  - `diagramScale.js` — A4 figure-area scale pick + coordinate transform.
  (Exact file split may be refined in the plan; the boundary is: pure model
  builders separate from the pdfkit drawing.)
- Modify: `app-backend/src/routes/geopdf-vector.js` (dispatch).
- Modify: `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`
  (+ its tests) — un-filter neighbours for diagram; carry `subjectParcelId`.

## Error Handling

- Subject parcel not found by `subjectParcelId` → return a clear 400/handled
  error (the shell requires a subject before generating, so this is a guard).
- Missing 2a reference fields → render the labelled grid cell empty (blanks are
  valid, per 2a).
- Fewer than 3 vertices / degenerate ring → skip the figure and log a warning
  rather than throw (mirror the app's tolerance elsewhere).
- Neighbour parcels absent (only the subject present) → render the core diagram
  without neighbour outlines (no error).

## Testing

- **Unit (pure, Jest):**
  - `subjectGeometry`: ordered edges with correct bearing DMS + distance and
    vertex letters (A, B, C… in ring order) for a known fixture.
  - `sidesTable`: rows with Const = 0.00/0.00 and full Y/X; "figure represents
    A.B.C…A." sequence; area formatting.
  - `referenceGrid`: values mapped from metadata; empty fields → blank cells.
  - `diagramScale`: auto scale pick fits a known extent into the A4 figure area;
    honours an explicit scale.
- **Integration:** `generateDiagramPDF` returns a valid `%PDF-` buffer for a
  sample single-parcel payload; the text layer contains the stand number,
  `S.R.`, and `Scale 1 :`.
- **Frontend unit:** `buildPlanPayload` for diagram returns all parcels (not
  filtered) and sets `subjectParcelId`; existing sub-project-1 tests updated.
- **Manual/visual:** generate a diagram for a real stand (STAND 302 fixture) and
  compare against the three samples — the authoritative fidelity check.

## Non-Goals

- No DXF (that is 2c).
- No named roads, no dashed connection lines to external adjoining beacons (need
  later data capture).
- No changes to `pdfkitGeoPDF.js` or the General Plan / Working Plan output.
- No multi-sheet tiling.
- No new reference-data capture (2a already did that).

## Open Questions

None blocking. The exact `diagram/` file split may be refined during planning;
the pure-model/drawing boundary is fixed.

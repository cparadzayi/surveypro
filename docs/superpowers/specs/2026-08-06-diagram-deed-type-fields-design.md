# Diagram Deed-Type Fields — Design

**Date:** 2026-08-06
**Status:** Approved (design)
**Builds on:** 2a — Diagram Reference Data Capture (`2026-07-01-diagram-reference-data-capture-design.md`)

## Context

Sub-project 2a captured seven project-level "reg 53" reference fields for the
single-stand Diagram plan type, rendered by the PDF/DXF renderers
(`diagramPdf.js` / `diagramDxf.js`) into a bottom reference grid. Two of the
top-band cells — "The immediate parent diagram is No. X annexed to Y No. Z"
and "The original title diagram is No. X annexed to Y No. Z" — currently
share a single pair of "annexed to" fields (`parentDiagramAnnexedTo`,
`deedOfTransferNo`). In practice the original title diagram is frequently
annexed to a *different* deed/certificate than the immediate parent diagram,
so the shared fields are wrong whenever they differ, and the "annexed to"
value has always been free text even though in practice it is one of two (or
occasionally a handful of) known document types.

This spec covers two changes together, since both touch the same form
section and the same render-time data:

1. Turn the free-text "annexed to" field for the immediate parent diagram
   into a constrained choice (deed type), rather than open text.
2. Give the original title diagram its own deed-type + number fields,
   independent of the immediate parent diagram's.

## Decisions (from brainstorming)

- **Render only the captured type**, not a fixed "X or Y (whichever
  applicable)" boilerplate. E.g. "annexed to Deed of Transfer No. 1166/77" —
  the captured value drives the sentence directly.
- **Deed type is a dropdown with an "Other" free-text fallback**: "Deed of
  Transfer" / "Certificate of Registered Title" / "Other" (reveals a text
  input). Zimbabwean title documents include other types (Deed of Grant,
  Deed of Cession, Deed of Donation, etc.) that a strict two-option dropdown
  can't represent.
- **Original title diagram gets its own deed-type + number fields**,
  independent of the immediate parent diagram's — they are frequently
  different documents. No more reuse of the parent's `annexedTo`/`deedNo` for
  the original-title cell.
- **All new fields are project-level**, matching the existing 2a fields
  (same parent property across the whole survey project).
- **S.R./File/G.P./Compilation cells are untouched** — out of scope.

## Fields

Two new columns on `survey_projects` (all `VARCHAR`, nullable):

| Column                        | Sample value              | Diagram grid cell |
| ------------------------------ | -------------------------- | ------------------ |
| `original_title_annexed_to`   | `Certificate of Registered Title` | "…annexed to" (original title diagram cell) |
| `original_title_deed_no`      | `2201/64`                  | "No." (original title diagram cell, deed/cert row) |

Reused as-is (from 2a, semantics unchanged at the data layer — only the UI
input for `parent_diagram_annexed_to` changes from free text to a
dropdown+Other): `deed_of_transfer_no`, `parent_diagram_no`,
`parent_diagram_annexed_to`, `original_title_diagram_no`, `sr_no`,
`file_no`, `gp_no`.

## Architecture

Four thin layers, mirroring 2a's precedent exactly.

### 1. Migration
`app-backend/migrations/087_add_original_title_deed_fields.do.sql`, copying
the loop-over-every-`surveyor_%`-schema-plus-`public`,
existence-guarded `ADD COLUMN` pattern from migration `085` verbatim, for the
two new columns. Idempotent, no `.undo.sql` (matches 085's precedent).

### 2. Backend
- `app-backend/src/models/SurveyProject.js`: add `original_title_annexed_to`,
  `original_title_deed_no` to `allowedColumns` in `update()`. (`create()`
  doesn't set any of the 2a fields either — they're always set via the
  follow-up `update()` call from Project Setup, same as today.)
- `app-backend/src/services/diagram/referenceGrid.js`: add
  `originalTitleAnnexedTo`, `originalTitleDeedNo` to `KEYS` so
  `buildReferenceGrid()` carries them into the render-time `grid` object.
- `app-backend/src/services/diagramPdf.js` and `diagramDxf.js`: the *second*
  `drawDiagramRefCell`/`drawDiagramRefCellDxf` call (the "original title
  diagram is..." cell) switches from
  `annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo` to
  `annexedTo: grid.originalTitleAnnexedTo, deedNo: grid.originalTitleDeedNo`.
  The first call (immediate parent diagram cell) is unchanged — it already
  reads the correct fields.

### 3. Frontend
- **Type/metadata contract:** add `originalTitleAnnexedTo`,
  `originalTitleDeedNo` alongside the existing seven fields everywhere they
  currently appear as a group:
  - `app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts`
    (`DiagramReferenceFields` interface + `DIAGRAM_REFERENCE_KEYS`)
  - `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`
    (`handleProjectSetupComplete`'s param type, `workflowState.projectInfo`
    assignments, the `updateSurveyProject()` call)
  - `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
    (`projectInfo` prop type)
  - `app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue`
    (`projectInfo` computed — read from `project.original_title_annexed_to` /
    `project.original_title_deed_no` with the same
    `project?.x || workflowState?.projectInfo?.x || ''` fallback pattern)
- **Form (`ProjectSetupView.vue`):** split the current flat "Diagram
  details" block into two visually grouped sub-sections, each ordered to
  match the rendered sentence:
  - **Immediate parent diagram:** "Immediate parent diagram No."
    (`parentDiagramNo`, text) → "Type of deed or title" (`parentDiagramAnnexedTo`,
    dropdown: Deed of Transfer / Certificate of Registered Title / Other →
    text) → "Deed / Certificate No." (`deedOfTransferNo`, text, placeholder
    "e.g. 1166/77")
  - **Original title diagram:** "Original title diagram No."
    (`originalTitleDiagramNo`, text) → "Type of deed or title"
    (`originalTitleAnnexedTo`, same dropdown+Other pattern) → "Deed /
    Certificate No." (`originalTitleDeedNo`, text)
  - The dropdown's "Other" option reveals a plain text input bound to the
    same field (so the stored value is always the free-text string —
    "Other" is a UI affordance, not a stored value).
  - S.R./File/G.P. fields stay where they are, unaffected.

## Data Flow

```
Project setup form (two "Diagram details" sub-sections)
      │  save
      ▼
PATCH/POST /api/survey-projects  ──►  survey_projects columns (9 fields total)
      │  load
      ▼
GET /api/survey-projects/:id  ──►  projectInfo (9 fields)
      │
      ▼
gatherPlanContext() ──► payload.metadata.{...7 existing, originalTitleAnnexedTo, originalTitleDeedNo}
      │
      ▼
buildReferenceGrid(metadata) ──► grid.{...}
      │
      ▼
drawDiagramRefCell (parent cell)         reads grid.parentDiagramAnnexedTo / grid.deedOfTransferNo
drawDiagramRefCell (original-title cell) reads grid.originalTitleAnnexedTo / grid.originalTitleDeedNo
```

## Error Handling

- All fields optional; blank/absent is valid and persists as `NULL`, same as
  2a.
- Migration is idempotent (existence-guarded), safe to re-run.
- No new failure modes: reuses the existing project save/load paths and the
  existing (already-blank-safe) `drawDiagramRefCell` rendering, just pointed
  at different source fields for the second call.

## Testing

- **Migration:** applies cleanly and is idempotent; the two columns exist
  afterward on a `surveyor_*` schema and `public`.
- **`referenceGrid.test.js`:** extend to assert `originalTitleAnnexedTo` /
  `originalTitleDeedNo` pass through `buildReferenceGrid()` independently of
  `parentDiagramAnnexedTo` / `deedOfTransferNo`.
- **`diagramReferenceMetadata.test.ts`:** extend the "carries all fields
  through" / "exposes exactly the N contract keys" cases to 9 keys.
- **Manual:** enter different deed types/numbers for the parent vs. original
  title diagram in Project Setup, generate a Diagram PDF and DXF, confirm the
  two cells show their own independent values (not a shared one).

## Non-Goals

- No rendering changes to the S.R./File/G.P./Compilation cells.
- No per-parcel reference data; everything stays project-level.
- No validation of deed type/number formats (free text, as with all 2a
  fields).
- No change to how the immediate-parent-diagram cell is rendered (it already
  read the correct fields) — only how its "annexed to" value is *captured*
  (dropdown instead of free text).

## Open Questions

None blocking.

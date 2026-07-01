# Diagram Reference Data Capture — Design

**Date:** 2026-07-01
**Status:** Approved (design)
**Sub-project:** 2a of 3 in the "single-stand Diagram renderer" initiative (itself sub-project 2 of 3 in "diagram production")

## Context

SurveyPro produces SI 727 survey documents. Sub-project 1 (the plan-type UX shell,
merged to `main`) lets a user pick a plan type and generate PDF + DXF. For the
plan type **Diagram** — a single-stand, registrable S.G. diagram like the three
reference samples (STANDS 302/303/310 Brackenhurst) — the deliverable carries a
bottom **reference grid**: Deed of Transfer No., File, S.R., immediate parent
diagram No., original title diagram No., G.P., etc. These values cannot be
derived from geometry; they must be captured.

Sub-project 2 (the Diagram renderer) is decomposed into three, each its own
spec → plan → implementation:

- **2a (this spec)** — capture the diagram reference fields.
- **2b** — the Diagram PDF renderer.
- **2c** — the Diagram DXF renderer.

This spec covers **only 2a**: data capture and carrying the values into the
renderer `metadata`. It renders nothing itself.

## Decisions (from brainstorming)

- **All reference fields are project-level.** A survey project covers many stands
  of the same parent property, so Deed of Transfer, parent diagram, S.R., File,
  and G.P. are the same across the survey. Enter once per project; 2b/2c apply
  them to whichever stand's diagram is generated.
- **Constants row = 0.00 / 0.00.** (Relevant to 2b's top table, recorded here so
  it isn't lost.) The app stores full beacon coordinates, so the diagram's
  "Const." origin is 0.00 for both Y and X and the coordinate columns carry the
  full values — no origin/residual split.
- **Surveyor-General's-office cells are not captured.** *"This diagram is annexed
  to No. ___ dated ___"*, the registration *G.P.:* cell, and *Compilation* are
  filled by the SG office after submission. 2b/2c render their labelled cells
  empty; 2a does not model them.
- **Deed of Transfer gets its own project field** (not the parcel-level
  `title_deed`).

## Fields

New columns on `survey_projects` (all `VARCHAR`, nullable — nothing required):

| Column                        | Sample value | Diagram grid cell |
| ----------------------------- | ------------ | ----------------- |
| `deed_of_transfer_no`         | `3326/72`    | "Deed of Transfer No." |
| `parent_diagram_no`           | `8055/57`    | "The immediate parent diagram is No." |
| `parent_diagram_annexed_to`   | (varies)     | "…annexed to" (next to parent diagram) |
| `original_title_diagram_no`   | (varies)     | "The original title diagram is No." |
| `sr_no`                       | `118/2023`   | "S.R." |
| `file_no`                     | `8/2916`     | "File" |
| `gp_no`                       | (varies)     | "G.P." (the related General Plan No.) |

Reused as-is (already on `survey_projects`): `parent_property`, `designation`,
`district`, `survey_date`, `surveyor`, `central_meridian`.

Not modelled (SG office fills after submission): annexed-to No./date for *this*
diagram, registration G.P. cell, Compilation.

## Architecture

Three thin layers, following existing patterns; no new endpoints, no renderer
changes.

### 1. Migration
`app-backend/migrations/085_add_diagram_reference_fields.do.sql`, mirroring
migration `084_add_parent_property_to_projects.do.sql` exactly: loop over every
`surveyor_%` schema (and `public`), and for each of the seven columns
`ADD COLUMN IF NOT EXISTS` guarded by an `information_schema.columns` existence
check. Idempotent. No `.undo.sql` — migration 084 (the most recent precedent)
ships without one, so match that.

### 2. API
Extend the existing `survey_projects` route handlers (`survey-projects.js`):
- **Create** and **update** accept the seven new fields in the request body and
  persist them (parameterised, alongside the current columns).
- **GET** (list + by-id) include the seven fields in the returned project object.

The fields are optional; omitted fields persist as `NULL` and read back as
`null`. No validation beyond the existing project-field handling (free-text
references; SG number formats vary).

### 3. Frontend
- **Type:** add the seven optional fields to the project/`projectInfo` type
  (`app-frontend/src/types/…` and wherever `projectInfo` is shaped).
- **Form:** a "Diagram details" section in project setup, grouped with the
  existing SI 727 fields, one labelled text input per field. Values load from the
  project GET and save via the existing project update — no bespoke save flow.
- **Carry into renderer metadata:** in `SurveyPlanMapView.vue`'s
  `gatherPlanContext()`, add the seven fields to the `metadata` object it builds
  (from `props.projectInfo`). The current GP renderers ignore unknown metadata
  keys; 2b/2c will consume them. This is the single wiring point that makes the
  data available to generation.

## Data Flow

```
Project setup form (Diagram details)
      │  save
      ▼
PATCH/POST /api/survey-projects  ──►  survey_projects columns
      │  load
      ▼
GET /api/survey-projects/:id  ──►  projectInfo (7 new fields)
      │
      ▼
gatherPlanContext() ──► payload.metadata.{deedOfTransferNo, parentDiagramNo,
   parentDiagramAnnexedTo, originalTitleDiagramNo, srNo, fileNo, gpNo}
      │
      ▼
(2b/2c renderers consume these — out of scope here)
```

Metadata key names (camelCase) map to the snake_case columns:
`deed_of_transfer_no→deedOfTransferNo`, `parent_diagram_no→parentDiagramNo`,
`parent_diagram_annexed_to→parentDiagramAnnexedTo`,
`original_title_diagram_no→originalTitleDiagramNo`, `sr_no→srNo`,
`file_no→fileNo`, `gp_no→gpNo`.

## Error Handling

- All fields optional; blank/absent is valid and persists as `NULL`.
- Migration is idempotent (existence-guarded), safe to re-run.
- No new failure modes: reuses the existing project save/load paths.

## Testing

- **Migration:** applies cleanly and is idempotent (running twice is a no-op);
  the seven columns exist afterward on a `surveyor_*` schema and `public`.
- **API round-trip:** create/update a project with the seven fields set →
  GET returns them verbatim; omit them → GET returns `null` for each.
- **Frontend mapping (unit):** given a `projectInfo` with the seven fields,
  `gatherPlanContext()` (or an extracted helper) places them under the correct
  camelCase `metadata` keys. This is the contract 2b/2c depend on.
- **Manual:** enter values in the Diagram details form, save, reload the project,
  confirm they persist and round-trip.

## Non-Goals

- No rendering. 2b (PDF) and 2c (DXF) consume this data.
- No per-parcel reference data; everything is project-level by decision.
- No modelling of SG-office-filled cells.
- No changes to the GP/Working Plan renderers.

## Open Questions

None blocking.

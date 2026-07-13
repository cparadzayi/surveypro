# Comprehensive Survey Record Letter — Fine-Tune Design

Date: 2026-07-13
Status: Approved (design)

## Goal

Fine-tune the lodgement letter to the Surveyor-General that forms the front of the
comprehensive survey record (`Comprehensive_Latest.pdf`). Two changes:

1. **Subject line** must read exactly like the wording on the **general plan**,
   e.g. `RE: STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP` (no "SURVEY OF" prefix).
2. **Tick boxes** on each of the documents the letter says are enclosed, ticked
   only when a matching record exists in the project output folder (or its
   subfolders / the input folder), otherwise left as an empty box. When one or
   more are missing, warn the surveyor in the UI before generating.

## Context (as-found)

- The letter is drawn by `CoverPageGenerator.generateLetterPage` in
  `app-frontend/src/utils/cover-page.ts`. Subject is
  `RE: ${info.surveyType || 'SURVEY OF ' + projectTitle}`. The enclosed-documents
  list (11 items) is a hardcoded array rendered as a plain numbered list.
- The cover page is merged into `Comprehensive_Latest.pdf` via
  `comprehensive-document.ts` → `generateWithTwoPass`, whose `projectInfo`
  (a `CoverPageInfo`) is built at the call sites:
  - `MapLibreAreaView.vue` (Area Computation workflow), `coverPageInfo` ~line 6257,
    which sets `surveyType = 'SURVEY OF ' + surveyorInfo.projectTitle.toUpperCase()`.
  - `SurveyPlanMapView.vue` (Survey Plan export), equivalent `coverPageInfo` near
    the `generateWithTwoPass` call (~line 4394).
- The **general plan** title wording comes from `formatDesignation(projectInfo)`,
  currently a local function in `SurveyPlanMapView.vue:4908`. It returns strings
  like `STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP` — no "SURVEY OF" prefix.
- The letter runs in-browser (jsPDF), so it cannot read disk. A backend endpoint
  `GET /documents/list` already exists (`app-backend/src/routes/documents.js:122`)
  but scans only a subset of subfolders and only `.pdf` files.
- Project output tree (`utils/project-directory.ts`):
  `output/{field-book, calculations, coordinate-list, reports, certificates,
  diagrams, general-plans, working-plans, survey-record}` plus `input/`.

## Part 1 — Subject line matches the general plan

- Extract `formatDesignation()` from `SurveyPlanMapView.vue` into a shared,
  unit-tested util: `app-frontend/src/utils/planDesignation.ts`. Keep the existing
  behaviour exactly (priority `surveyOf` > `designation`/`standReference`, township
  suffix handling, ranges/farms/LOT branches). Re-import it in `SurveyPlanMapView.vue`
  to replace the local copy (no behavioural change there).
- At **both** comprehensive-doc call sites, set
  `surveyType = formatDesignation(projectInfo)` instead of
  `'SURVEY OF ' + projectTitle.toUpperCase()`.
  - `projectInfo` here means the object carrying `surveyOf`, `designation`/
    `standReference`, and `township`. In `MapLibreAreaView` these come from
    `workflowState.surveyorInfo` / `workflowState.projectInfo`; confirm the fields
    are present during implementation and fall back gracefully (the function
    already returns sensible defaults).
- `cover-page.ts` already prints `RE: ${info.surveyType}`; with the new value it
  reads identically to the general plan. No change to the `RE:` rendering itself.

## Part 2 — Tick boxes + existence check

### Backend

Add a **new** endpoint (do not change `/documents/list`, which other screens use):

`GET /documents/output-manifest?workingDirectory=<dir>`
- Resolve `workingDirectory` with the existing `resolveWorkingDirectory` helper.
- Recursively walk `output/` **and** `input/` (if present).
- Return `{ ok: true, files: [{ name, relDir }] }` for **all** files (every
  extension), where `relDir` is the path relative to the working directory.
- Missing folders → empty list, never an error.

### Frontend

New util `app-frontend/src/utils/lodgementDocuments.ts`:
- The canonical 11-item list (single source of truth; `cover-page.ts` imports it
  instead of its inline array).
- A keyword-match table mapping each item label to a `RegExp`:

  | Item | Pattern |
  |---|---|
  | Field book | `/field.?book/i` |
  | Coordinate List and Calculations | `/coordinate|calc/i` |
  | General Plan | `/general.?plan/i` |
  | Working Plan | `/working.?plan/i` |
  | Report on Survey | `/report.*survey|survey.?record/i` |
  | Dispensation Certificate | `/dispensation/i` |
  | Checklist | `/check.?list/i` |
  | DSG Certificate (1/96) | `/dsg|1.?96/i` |
  | Permit/Instruction and layout | `/permit|instruction|layout/i` |
  | Beacon receipt | `/beacon.*receipt/i` |
  | Searches | `/search/i` |

- `resolveLodgementDocuments(fileNames: string[]): { label: string; present: boolean }[]`
  — tests each item's pattern against the manifest file names (basename match).

### Wiring (both comprehensive-doc call sites)

Before calling the generator:
1. Fetch the manifest for the project working directory.
2. `const documents = resolveLodgementDocuments(manifest.files.map(f => f.name))`.
3. If any `!present` → show a confirm dialog:
   `"⚠ N documents not found in the output folder:\n • …\n\nGenerate anyway?"`.
   Cancel aborts generation; confirm proceeds.
4. Put `documents` on the `CoverPageInfo` passed to `generateWithTwoPass`.

If no working directory is available (download-only path), skip the manifest fetch
and pass `documents` with all `present: false` (or undefined → letter falls back to
empty boxes). No dialog in that case.

### Rendering (`cover-page.ts`)

- Add `documents?: { label: string; present: boolean }[]` to `CoverPageInfo`.
- Replace the plain numbered list with a checkbox per item: draw a small square,
  and a check mark (or filled/✓) when `present` is true. Fall back to the default
  hardcoded list (all unchecked) when `documents` is absent, so existing callers
  keep working.

## Testing

- `planDesignation.test.ts` — port the current `formatDesignation` behaviour with
  cases: single stand, numeric range, multi-range, farm names, LOT designation,
  `surveyOf` passthrough, township-already-included, empty/default.
- `lodgementDocuments.test.ts` — given representative file-name lists, assert the
  correct `present` flags per item (including a case where several are missing).
- Backend: a small test for `/documents/output-manifest` over a temp folder tree
  (nested subfolders, mixed extensions, missing `input/`).

## Approaches considered

- **Existence check:** keyword scan of the output tree (chosen) vs. auto-tick only
  SurveyPro-generated docs vs. exact expected filenames. Keyword scan ticks both
  generated and manually-dropped-in records and tolerates naming drift.
- **Missing summary:** UI confirm dialog before generating (chosen) vs. a printed
  note on the letter vs. both. The dialog lets the surveyor gather documents; the
  printed letter still shows the true tick state.
- **Backend:** new `/documents/output-manifest` endpoint (chosen) vs. extending
  `/documents/list`. A new endpoint avoids regressing screens that depend on the
  current `/documents/list` shape and `.pdf`-only behaviour.

## Out of scope

- Changing which sections the comprehensive record contains or their page numbering.
- Any change to how external documents (permit, beacon receipt, searches, etc.) are
  uploaded — this only *detects* them.

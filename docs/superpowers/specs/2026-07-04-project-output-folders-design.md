# Surveyor-Scoped Project Output Folders — Design

**Status:** Approved (design phase)
**Date:** 2026-07-04
**Author:** cparadzayi (with Claude)

## Problem

Plan outputs (diagrams, general plans, working plans) are currently delivered as a
per-generation **zip download**, separate from the project's on-disk folder. There is
no single, surveyor-identifiable place holding all of a project's products, and
filenames are timestamped so every regeneration accumulates a new file.

## Goal

One source of all outputs: a **surveyor-scoped project folder** with a subfolder per
product type. Plan outputs are saved as individual files (PDF + DXF) into those
subfolders instead of a zip. Regenerating a product writes to a **stable canonical
name** and **prompts before overwriting** an existing file.

## Decisions (from brainstorming, 2026-07-04)

1. **Folder layout:** surveyor at the top — `SurveyPro/Surveyors/<Surveyor>/<Project>/`.
2. **Overwrite:** stable canonical filenames; **prompt to overwrite** on collision.
3. **Delivery:** save to the project folder as the **sole** delivery (no zip download).

## Architecture

### 1. Folder structure & path builder — `app-frontend/src/utils/project-directory.ts`

Target tree:
```
Documents/SurveyPro/Surveyors/<Surveyor Name>/<Project>/
  ├─ input/
  └─ output/
     ├─ diagrams/  general-plans/  working-plans/  survey-record/   (new)
     └─ field-book/ calculations/ coordinate-list/ reports/ certificates/  (existing)
```

Changes:
- Add `diagrams`, `generalPlans`, `workingPlans`, `surveyRecord` to
  `ProjectDirectoryStructure` and `getProjectDirectoryStructure()` (mapping to
  `output/diagrams`, `output/general-plans`, `output/working-plans`,
  `output/survey-record`).
- `generateDefaultWorkingDirectory(projectName, district, surveyorName)` gains a
  `surveyorName` parameter and returns
  `Documents/SurveyPro/Surveyors/<sanitizedSurveyor>/<sanitizedProject>` (surveyor
  name sanitized: trim, strip filesystem-illegal chars `<>:"/\|?*`, collapse spaces to
  `_`). If `surveyorName` is empty/unavailable, use `Unknown_Surveyor`. The date suffix
  is dropped from the default so the folder is stably identifiable by surveyor+project
  (the caller may still choose any directory; this only changes the default).
- Update `getDirectoryStructureDescription()` to show the new tree.
- **Existing projects keep their stored `workingDirectory`** — no migration. They gain
  the new subfolders under their own `output/` when a plan is first saved. Only the
  *default* path for new projects becomes surveyor-scoped.

The single caller of `generateDefaultWorkingDirectory` (ProjectSetupView) passes the
surveyor name from the auth store (`auth.surveyorName`).

### 2. Canonical filenames + save routing

- `composePlanBaseName(planType, designation, projectId)` **drops the `ts` timestamp
  parameter** and returns `${planType}-${safeDesignation}` (same `[^\w.-]+ → _`
  sanitization). One canonical base name per (planType, designation).
- The plan flow writes each present document as an individual file into the plan's
  subfolder: `<base>.pdf`, `<base>.dxf`, `<base>-summary.pdf`. No zip.
- Plan-type → subfolder resolver: new small pure function
  `planTypeOutputSubdir(planType)` in `project-directory.ts`:
  - `diagram` → `output/diagrams`
  - `general-plan` (developed & undeveloped township GP) → `output/general-plans`
  - `working-plan` → `output/working-plans`
  - `survey-record` / `report-on-survey` → `output/survey-record`
- Storage layer (`workflowProductStorage.ts` + `documentStorage.ts`): add the plan
  categories (`diagram`, `general-plan`, `working-plan`, `survey-record`) mapping to the
  new folders, and add **DXF** handling (a `type: 'dxf'` / blob path saved verbatim like
  the pdf path — the backend `/documents/save` is content-agnostic).

### 3. Overwrite prompt — `app-backend/src/routes/documents.js` + frontend helper

- `/documents/save` accepts a new multipart field `overwrite` (`'true'`/absent). After
  resolving the absolute path and ensuring the directory exists, if the target file
  **already exists** and `overwrite !== 'true'`, respond **409** with
  `{ ok: false, code: 'EXISTS', error: 'File already exists', filePath }` and do **not**
  write. Otherwise write as today (`fs.writeFileSync` overwrites). Locked-file handling
  via `classifyFsWriteError` is unchanged (its EBUSY 409 keeps `code` from the
  classifier; the EXISTS gate runs before the write attempt).
- Frontend helper `saveWithOverwritePrompt(saveArgs, confirmFn)` (in
  `workflowProductStorage.ts`): calls the save with
  `overwrite=false`; on a 409 `EXISTS` response, invokes `confirmFn(fileName)`; if
  confirmed, retries with `overwrite=true`; if cancelled, returns
  `{ success: false, skipped: true }`. Supports an "overwrite all for this generation"
  choice by letting the caller short-circuit `confirmFn` after the first confirm.
- The confirm UI is a simple modal/`confirm`-style dialog: **Overwrite** / **Cancel**,
  with an "apply to all files in this generation" checkbox.

### 4. Remove the zip; wire plan generation to save-to-folder

- The plan generation flow (the view/composable that today calls `bundlePlanDocuments`
  and triggers a browser download) instead:
  1. resolves the subfolder from `planType` and the project's working directory;
  2. builds the canonical base name;
  3. saves each produced doc (pdf/dxf/summary) via `saveWithOverwritePrompt`;
  4. shows a success toast naming the saved folder and files (and a summary if some were
     skipped/cancelled).
- `bundlePlanDocuments` and the `jszip` import are removed from that path.
  `validateGenerateRequest` is unchanged.

### 5. Error handling / edge cases

- **No working directory set:** abort with a clear message ("Set the project working
  directory first"); do not attempt to save.
- **Surveyor not loaded** when generating a *default* path: fall back to
  `Unknown_Surveyor` (path builder never throws).
- **Locked target file** (open in a viewer): existing `classifyFsWriteError` 409 path
  surfaces the actionable message; the overwrite helper treats a locked-file 409
  (code ≠ `EXISTS`) as a real error, not a prompt.
- **Partial failures** across pdf/dxf/summary: continue saving the rest; the toast
  reports which succeeded/were skipped.

## Testing

- **Backend** (`documents.save.test.js`, extend): (a) new file writes and returns
  `ok:true`; (b) existing file + no `overwrite` → 409 `code:'EXISTS'`, file unchanged;
  (c) existing file + `overwrite='true'` → overwrites, `ok:true`.
- **Frontend (Vitest):**
  - `project-directory`: `getProjectDirectoryStructure` includes the four new subfolders;
    `generateDefaultWorkingDirectory('Erf 5','Harare','John Doe')` →
    `.../Surveyors/John_Doe/...`; sanitizes illegal chars; `Unknown_Surveyor` fallback.
  - `composePlanBaseName` has no timestamp; `planTypeOutputSubdir` maps each plan type.
  - `saveWithOverwritePrompt`: mock fetch returns 409 `EXISTS` → calls confirm → retries
    with `overwrite=true` on confirm; aborts (skipped) on cancel; passes through other
    errors.
- **Manual:** generate a diagram → PDF+DXF appear in
  `Surveyors/<me>/<project>/output/diagrams/` with canonical names; regenerate → prompt;
  Overwrite replaces, Cancel leaves the original; a general plan lands in
  `output/general-plans/`.

## Non-goals (YAGNI)

- No migration of existing projects to the surveyor-scoped root.
- No "download all"/zip export (removed per the delivery decision; can be revisited).
- No change to how field-book/calculations/coordinate-list/reports/certificates are
  produced — they keep their folders (now under the surveyor-scoped root for new
  projects).
- No server-side project registry/DB changes; folders are filesystem-only as today.

## Rollout

Single spec → single plan. Suggested task order: (1) path builder + tests; (2) backend
overwrite gate + tests; (3) storage layer categories/DXF + overwrite helper + tests;
(4) wire the plan flow, remove the zip; (5) manual verification.

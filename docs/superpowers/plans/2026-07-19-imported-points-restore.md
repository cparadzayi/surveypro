# Imported Points Restore + Status Persistence — Implementation Plan

> **For agentic workers:** executed inline (cross-stack integration, live-QA verified). Steps use `- [ ]`.

**Goal:** Make `workflowState.importedPoints` survive a page reload/revisit for every project, and preserve each point's F/P `status` end-to-end, so Field Book / Coordinate List don't break on revisit.

**Architecture:** Two defense-in-depth restore sources plus real status wiring. (3) On CSV import, persist the points (with status) into `step_data['csv-import'].points` — the primary restore source. (1) On load, if that JSON copy is absent/empty, fall back to the authoritative `coordinate_points` table via `listCoordinatePoints()`. Status is wired through the `coordinate_points` column that migration 079 already added but the model never used.

**Tech Stack:** Fastify + PostgreSQL (backend model), Vue 3 + TS (frontend), vitest.

## Global Constraints

- **Status values** are short strings (`'F'`, `'P'`, etc.); column is `VARCHAR(10)` (migration 079 — already applied). No new migration.
- **Coordinate convention:** `coordinate_points.geom` stores `ST_MakePoint(Westing, Southing)`; `ST_X(geom)=y=Westing`, `ST_Y(geom)=x=Southing`. The model's `findByProject` already returns `y`/`x` this way — do not change it.
- **Restore shape:** `step_data['csv-import'].points[]` entries are consumed at `useCadastralWorkflow.ts:319-335` as `{ id, y, x, status, description, survey_date }`. Any point copy we persist must use those field names.
- **Legacy projects** (e.g. Brakenhurst/18) have `status = NULL` in `coordinate_points` and no JSON copy — status is unrecoverable for them; they reconstruct coordinates with blank status (acceptable, unblocks Field Book). This fix is forward-looking for status.
- **Don't stage** the four pre-existing untracked root files. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Backend Jest is ESM: run from app-backend as `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`. Frontend vitest from app-frontend.

---

### Task 1: Backend — wire `status` through the coordinate_points model

**Files:** `app-backend/src/models/coordinatePoint.js`, `app-backend/src/routes/coordinatePoints.js`

- [ ] **1a.** `findByProject` — add `status` to the explicit SELECT column list (currently `id, project_id, name, geom, elevation, description, survey_date, surveyor, created_at, updated_at, ST_X, ST_Y`). Add `status,`.
- [ ] **1b.** `batchCreate` — thread status through:
  - In the dedup pre-processing, carry `status: pt.status` into `processedPoints` first-occurrence and into `uniquePoints.map(...)`.
  - INSERT column list `(project_id, name, geom, elevation, description)` → add `status`; the per-row value tuple gets a 6th param; push `pt.status || null`. (Renumber the `$` placeholders: currently 5 params/row via `paramIndex+4`; becomes 6 via `paramIndex+5`, `paramIndex += 7`… — recompute carefully: geom uses 2 params, so a row is `(project_id, name, geom(y,x), elevation, description, status)` = 7 params. Verify placeholder math.)
  - `ON CONFLICT ... DO UPDATE SET` — add `status = EXCLUDED.status`.
- [ ] **1c.** `create` (single) — add `status` param + INSERT it (keep optional). Update the POST `/coordinate-points` route body schema to allow `status: { type: 'string' }`.
- [ ] **1d.** Verify: `create`/`findById`/`findByName`/`findAll` use `SELECT *`/`RETURNING *` so status flows automatically once written; only `findByProject` and the INSERTs needed edits.

Verification (live, servers running): after 3a-3c below, re-import a project and confirm the batch route stores status (backend log) and `GET /coordinate-points` returns `status`.

---

### Task 2: Frontend service types — expose `status`

**Files:** `app-frontend/src/services/spatial.ts`

- [ ] **2a.** `CoordinatePoint` interface — add `status?: string`.
- [ ] **2b.** `batchCreateCoordinatePoints` — its `points` param type: add `status?: string` so callers can send it (find the function; it POSTs to `/coordinate-points/batch`).
- [ ] **2c.** `createCoordinatePoint` payload type — add `status?: string`.

---

### Task 3: Frontend import — send status + persist the JSON copy

**Files:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

- [ ] **3a.** In `handleDataImported` (~2205), change the `dbPoints` mapping to send status as its own field and stop folding it into description:
  ```ts
  const dbPoints = points.map(point => ({
    name: point.id,
    y: point.original.y,
    x: point.original.x,
    elevation: undefined,
    description: point.description || '',
    status: point.status || undefined,
  }));
  ```
- [ ] **3b.** After `setImportedPoints(points)` (and before/independent of the DB export), persist the JSON copy into the workflow so a later reload restores it. Add, when `selectedProjectId.value`:
  ```ts
  await updateStepData('csv-import', {
    points: points.map(p => ({
      id: p.id,
      y: p.original.y,
      x: p.original.x,
      status: p.status || null,
      description: p.description || null,
      survey_date: p.surveyDate instanceof Date ? p.surveyDate.toISOString() : (p.surveyDate || null),
    })),
  });
  ```
  Use the existing workflow-update mechanism (`updateStepData`/`saveWorkflowState('update', …)` — confirm the exact exported name from `useCadastralWorkflow`; the beacon feature used `api.patch('/survey-projects/:id/workflow', { step, action:'update', metadata })`, so if no wrapper exists, call that directly with `step:'csv-import', metadata:{ points }`).
  **Important:** do this write BEFORE the `reloadWorkflowState()` call at ~2246 so the reload sees the persisted points (or move/skip the reload's clobber — verify reload doesn't wipe in-memory points; restore only overwrites `importedPoints` when `csvStepData.points` exists, which now it will, with the same data).

---

### Task 4: Frontend restore — fallback from coordinate_points (with status)

**Files:** `app-frontend/src/composables/useCadastralWorkflow.ts`, new `app-frontend/src/composables/importedPointFromCoordinate.ts` (+ test)

- [ ] **4a.** Extract a pure mapper (unit-testable) `coordinateToImportedPoint(cp)` → the `importedPoints` element shape used at useCadastralWorkflow.ts:319-335:
  ```ts
  // importedPointFromCoordinate.ts
  export interface CoordRow { name: string; y: number; x: number; status?: string | null; description?: string | null; survey_date?: string | null }
  export function coordinateToImportedPoint(cp: CoordRow) {
    const y = Number(cp.y) || 0, x = Number(cp.x) || 0
    return {
      id: cp.name,
      original: { y, x },
      fieldBook: { y: y.toFixed(3), x: x.toFixed(3) },
      coordinateList: { y: y.toFixed(2), x: x.toFixed(2) },
      status: cp.status ?? undefined,
      description: cp.description ?? undefined,
      surveyDate: new Date(cp.survey_date || Date.now()),
      includeInFieldBook: true,
      includeInCoordinateList: true,
    }
  }
  ```
  TDD: test maps y/x, 3-/2-dp strings, status passthrough (present + null→undefined), id=name.
- [ ] **4b.** In `loadWorkflowState`, immediately after the existing `if (csvStepData?.points) { … }` block, add a fallback:
  ```ts
  if ((!workflowState.importedPoints || workflowState.importedPoints.length === 0) && surveyProjectId) {
    try {
      const { listCoordinatePoints } = await import('../services/spatial')
      const { coordinateToImportedPoint } = await import('./importedPointFromCoordinate')
      const cps = await listCoordinatePoints(Number(surveyProjectId))
      if (cps?.length) {
        workflowState.importedPoints = cps.map(coordinateToImportedPoint)
        console.log(`✅ Restored ${workflowState.importedPoints.length} imported points from coordinate_points (fallback)`)
      }
    } catch (e:any) { console.warn('coordinate_points fallback failed:', e?.message) }
  }
  ```
  (Confirm `surveyProjectId` is the id in scope in `loadWorkflowState`; the debug logs use it.)

---

### Verification (live)

Servers are running (3050/5173). End-to-end:
- [ ] **New import path:** import a CSV into a fresh project → reload the page → revisit → `importedPoints` restored from `step_data.points` WITH status; Field Book generates. (Confirms Task 3.)
- [ ] **Legacy fallback:** open Brakenhurst (18) → `importedPoints` now restored from `coordinate_points` (status blank) → Field Book generates. (Confirms Task 4.)
- [ ] **Status round-trip:** the re-imported project's `GET /coordinate-points` returns `status`; the restored points show F/P. (Confirms Tasks 1-3.)
- [ ] Backend model test (if feasible) + the pure mapper test green: `node --experimental-vm-modules node_modules/jest/bin/jest.js coordinatePoint` (app-backend) and `npx vitest run importedPointFromCoordinate` (app-frontend).

## Self-Review
- Coverage: 3=persist JSON copy (option 3); 4=coordinate_points fallback (option 1); 1-2-3a=status wiring end-to-end (full scope). Legacy blank-status acknowledged (constraint).
- Placeholder scan: 3b/4b note "confirm exact wrapper name / surveyProjectId scope" — resolve during implementation by reading the file, not left vague in code.
- Type consistency: the persisted `step_data.points` shape `{id,y,x,status,description,survey_date}` matches both the restore mapper (useCadastralWorkflow:319-335) and `coordinateToImportedPoint`.

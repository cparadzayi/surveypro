# Diagram Reference Data Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture seven project-level diagram-reference fields (Deed of Transfer, parent/original diagram Nos, S.R., File, G.P.) and carry them into the renderer `metadata`, so sub-projects 2b/2c can print the diagram's reference grid.

**Architecture:** Three thin layers mirroring the existing `parent_property` field end-to-end: a `survey_projects` migration (patterned on 084), the `SurveyProject.update` allow-list + `SELECT *` reads, and frontend form + render-path wiring. A small pure helper maps `projectInfo` → the exact camelCase metadata keys 2b/2c depend on. No rendering; no changes to the General Plan / Working Plan renderers.

**Tech Stack:** Fastify + PostgreSQL (backend), Vue 3 + TypeScript (frontend), Vitest (frontend unit tests, already configured).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-diagram-reference-data-capture-design.md`.
- **All seven fields are project-level and nullable.** Nothing is required; blanks persist as `NULL`/`''`.
- **DB columns (snake_case) on `survey_projects`:** `deed_of_transfer_no`, `parent_diagram_no`, `parent_diagram_annexed_to`, `original_title_diagram_no`, `sr_no`, `file_no`, `gp_no`. Type `VARCHAR(100)`.
- **Metadata / projectInfo keys (camelCase), exact:** `deedOfTransferNo`, `parentDiagramNo`, `parentDiagramAnnexedTo`, `originalTitleDiagramNo`, `srNo`, `fileNo`, `gpNo`. These map 1:1 to the snake_case columns via the model's `key.replace(/([A-Z])/g,'_$1').toLowerCase()` conversion.
- **Mirror the existing `parent_property` / `wholePortion` handling at every layer** — same pattern, same files.
- Migration mirrors `084_add_parent_property_to_projects.do.sql`; **no `.undo.sql`** (084 has none).
- No rendering. No edits to `pdfkitGeoPDF.js`, `dxfGenerator.js`, or other renderers.
- Frontend TypeScript under `app-frontend/src/`; backend ESM under `app-backend/src/`.

---

### Task 1: Persist the seven fields (migration + model allow-list)

**Files:**
- Create: `app-backend/migrations/085_add_diagram_reference_fields.do.sql`
- Modify: `app-backend/src/models/SurveyProject.js` (the `update` method's `allowedColumns` array, ~line 148)

**Interfaces:**
- Consumes: nothing.
- Produces: the seven columns exist on `survey_projects` in every `surveyor_*` schema (+ `public`); `SurveyProject.update(db, id, data)` persists them when `data` carries the camelCase keys; `findById`/`findAll` return them (via existing `SELECT sp.*`).

- [ ] **Step 1: Write the migration**

Create `app-backend/migrations/085_add_diagram_reference_fields.do.sql`:
```sql
-- Migration 085: Add single-stand Diagram reference fields to survey_projects
-- in all surveyor schemas. Per the SI 727 Diagram reference grid (Deed of
-- Transfer, parent/original diagram Nos, S.R., File, G.P.). All nullable;
-- entered once per project and applied to every stand's diagram.

DO $$
DECLARE
  schema_rec RECORD;
  col TEXT;
  cols TEXT[] := ARRAY[
    'deed_of_transfer_no',
    'parent_diagram_no',
    'parent_diagram_annexed_to',
    'original_title_diagram_no',
    'sr_no',
    'file_no',
    'gp_no'
  ];
BEGIN
  -- Every surveyor schema
  FOR schema_rec IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    FOREACH col IN ARRAY cols LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = schema_rec.schema_name
          AND table_name = 'survey_projects'
          AND column_name = col
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I.survey_projects ADD COLUMN %I VARCHAR(100)',
          schema_rec.schema_name, col
        );
        RAISE NOTICE 'Added % to %.survey_projects', col, schema_rec.schema_name;
      END IF;
    END LOOP;
  END LOOP;

  -- public schema too, if survey_projects exists there
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'survey_projects'
  ) THEN
    FOREACH col IN ARRAY cols LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'survey_projects'
          AND column_name = col
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.survey_projects ADD COLUMN %I VARCHAR(100)', col
        );
        RAISE NOTICE 'Added % to public.survey_projects', col;
      END IF;
    END LOOP;
  END IF;
END;
$$;
```

- [ ] **Step 2: Add the columns to the update allow-list**

In `app-backend/src/models/SurveyProject.js`, find the `allowedColumns` array inside `static async update` (search for `'whole_portion', 'parent_property'`). Extend it:
```js
      const allowedColumns = [
        'name', 'client_name', 'survey_type', 'survey_date', 'district',
        'central_meridian', 'working_directory', 'status', 'metadata', 
        'workflow_state', 'last_used', 'datum', 'instruments', 'designation', 'township',
        'whole_portion', 'parent_property',
        'deed_of_transfer_no', 'parent_diagram_no', 'parent_diagram_annexed_to',
        'original_title_diagram_no', 'sr_no', 'file_no', 'gp_no'
      ]
```
Change nothing else — the dynamic query build and `SELECT *` reads already handle any allow-listed column.

- [ ] **Step 3: Run the migration**

Run (from `app-backend/`, dev DB running):
```bash
npm run migrate
```
Expected: completes without error; log shows `Added deed_of_transfer_no to …` (and the other six) for each surveyor schema on first run.
If the DB is unreachable in this environment, STOP and report — do not fake success.

- [ ] **Step 4: Verify idempotency + syntax**

Run again:
```bash
npm run migrate
```
Expected: completes without error and adds nothing (the `IF NOT EXISTS` guards make the re-run a no-op).
Then: `node --check src/models/SurveyProject.js` → no output (valid).

- [ ] **Step 5: Verify round-trip against the API (manual)**

With the backend running, using an authenticated session (or `curl` with a valid token), `PUT /api/survey-projects/:id` a body containing `{"srNo":"118/2023","fileNo":"8/2916","deedOfTransferNo":"3326/72"}`, then `GET /api/survey-projects/:id` and confirm the response includes `sr_no: "118/2023"`, `file_no: "8/2916"`, `deed_of_transfer_no: "3326/72"`. Record the commands + output in your report. (If you cannot obtain a token in this environment, note it and rely on Steps 3–4 plus the frontend tasks.)

- [ ] **Step 6: Commit**

```bash
git add app-backend/migrations/085_add_diagram_reference_fields.do.sql app-backend/src/models/SurveyProject.js
git commit -m "feat(diagram-2a): persist diagram reference fields on survey_projects"
```

---

### Task 2: Frontend metadata helper (the 2b/2c contract)

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/diagramReferenceMetadata.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface DiagramReferenceFields { deedOfTransferNo?: string | null; parentDiagramNo?: string | null; parentDiagramAnnexedTo?: string | null; originalTitleDiagramNo?: string | null; srNo?: string | null; fileNo?: string | null; gpNo?: string | null }`
  - `function diagramReferenceMetadata(projectInfo: DiagramReferenceFields | null | undefined): Record<keyof DiagramReferenceFields, string>` — returns exactly the seven keys, each a string (missing/null → `''`).

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/diagramReferenceMetadata.test.ts`:
```ts
import { diagramReferenceMetadata } from '../diagramReferenceMetadata'

describe('diagramReferenceMetadata', () => {
  it('carries all seven fields through', () => {
    const r = diagramReferenceMetadata({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      srNo: '118/2023',
      fileNo: '8/2916',
      gpNo: 'GP-1',
    })
    expect(r).toEqual({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      srNo: '118/2023',
      fileNo: '8/2916',
      gpNo: 'GP-1',
    })
  })

  it('normalises missing and null values to empty strings', () => {
    const r = diagramReferenceMetadata({ srNo: '118/2023', fileNo: null })
    expect(r.srNo).toBe('118/2023')
    expect(r.fileNo).toBe('')
    expect(r.deedOfTransferNo).toBe('')
  })

  it('handles null/undefined input', () => {
    expect(diagramReferenceMetadata(null)).toEqual({
      deedOfTransferNo: '', parentDiagramNo: '', parentDiagramAnnexedTo: '',
      originalTitleDiagramNo: '', srNo: '', fileNo: '', gpNo: '',
    })
  })

  it('exposes exactly the seven contract keys', () => {
    expect(Object.keys(diagramReferenceMetadata({})).sort()).toEqual([
      'deedOfTransferNo', 'fileNo', 'gpNo', 'originalTitleDiagramNo',
      'parentDiagramAnnexedTo', 'parentDiagramNo', 'srNo',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-frontend/`): `npm test -- diagramReferenceMetadata`
Expected: FAIL — cannot find module `../diagramReferenceMetadata`.

- [ ] **Step 3: Write the implementation**

Create `app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts`:
```ts
export interface DiagramReferenceFields {
  deedOfTransferNo?: string | null
  parentDiagramNo?: string | null
  parentDiagramAnnexedTo?: string | null
  originalTitleDiagramNo?: string | null
  srNo?: string | null
  fileNo?: string | null
  gpNo?: string | null
}

const DIAGRAM_REFERENCE_KEYS: (keyof DiagramReferenceFields)[] = [
  'deedOfTransferNo',
  'parentDiagramNo',
  'parentDiagramAnnexedTo',
  'originalTitleDiagramNo',
  'srNo',
  'fileNo',
  'gpNo',
]

/**
 * Pick the seven project-level diagram reference fields from a projectInfo-like
 * object, normalising missing/null values to '' so the renderer metadata is
 * stable and complete. These exact keys are the contract sub-projects 2b/2c
 * (the Diagram PDF/DXF renderers) read from `metadata`.
 */
export function diagramReferenceMetadata(
  projectInfo: DiagramReferenceFields | null | undefined,
): Record<keyof DiagramReferenceFields, string> {
  const src = (projectInfo ?? {}) as Record<string, unknown>
  const out = {} as Record<keyof DiagramReferenceFields, string>
  for (const key of DIAGRAM_REFERENCE_KEYS) {
    const v = src[key]
    out[key] = v == null ? '' : String(v)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- diagramReferenceMetadata`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts app-frontend/src/views/modules/cadastral-standard/__tests__/diagramReferenceMetadata.test.ts
git commit -m "feat(diagram-2a): projectInfo→metadata helper for diagram reference fields"
```

---

### Task 3: "Diagram details" form in project setup

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue`

**Interfaces:**
- Consumes: the seven columns from Task 1 (persisted via the existing project save path).
- Produces: the seven camelCase fields on `setupData`, entered via inputs, loaded from `project.*` (snake_case) and saved in the update payload — exactly mirroring `parentProperty`.

**Context:** This file already handles `parentProperty` at four touchpoints. Find each by searching for `parentProperty` / `parent_property` and add the seven new fields alongside:
1. The `setupData` **type/interface** (search `parentProperty?: string`).
2. The `setupData` **initial value** (search `parentProperty: ''`).
3. A **template input** block (search `v-model="setupData.parentProperty"`).
4. The **load mapping** (search `setupData.value.parentProperty = project.parent_property`).
5. The **save payload** (search `parentProperty: setupData.value.parentProperty || undefined`).

- [ ] **Step 1: Add the fields to the setupData type**

In the `setupData` interface (near `parentProperty?: string`), add:
```ts
    deedOfTransferNo?: string
    parentDiagramNo?: string
    parentDiagramAnnexedTo?: string
    originalTitleDiagramNo?: string
    srNo?: string
    fileNo?: string
    gpNo?: string
```

- [ ] **Step 2: Add the initial values**

In the `setupData` initialiser (near `parentProperty: ''`), add:
```ts
  deedOfTransferNo: '',
  parentDiagramNo: '',
  parentDiagramAnnexedTo: '',
  originalTitleDiagramNo: '',
  srNo: '',
  fileNo: '',
  gpNo: '',
```

- [ ] **Step 3: Add the "Diagram details" template section**

Add a new section in the template (place it after the block containing `v-model="setupData.parentProperty"`; match the surrounding markup/label structure used by the existing fields — use the same wrapper element and label classes as the `parentProperty` field's block). Each input:
```html
        <!-- Diagram details (SI 727 single-stand Diagram reference grid) -->
        <div class="form-group">
          <label>Deed of Transfer No.</label>
          <input v-model="setupData.deedOfTransferNo" type="text" placeholder="e.g. 3326/72" />
        </div>
        <div class="form-group">
          <label>Immediate parent diagram No.</label>
          <input v-model="setupData.parentDiagramNo" type="text" placeholder="e.g. 8055/57" />
        </div>
        <div class="form-group">
          <label>Parent diagram annexed to</label>
          <input v-model="setupData.parentDiagramAnnexedTo" type="text" />
        </div>
        <div class="form-group">
          <label>Original title diagram No.</label>
          <input v-model="setupData.originalTitleDiagramNo" type="text" />
        </div>
        <div class="form-group">
          <label>S.R. No.</label>
          <input v-model="setupData.srNo" type="text" placeholder="e.g. 118/2023" />
        </div>
        <div class="form-group">
          <label>File No.</label>
          <input v-model="setupData.fileNo" type="text" placeholder="e.g. 8/2916" />
        </div>
        <div class="form-group">
          <label>G.P. No.</label>
          <input v-model="setupData.gpNo" type="text" />
        </div>
```
> Use the exact wrapper/label markup of the neighbouring `parentProperty` field if it differs from `form-group`/`<label>` — the goal is visual consistency with the existing SI 727 fields, not introducing a new style.

- [ ] **Step 4: Add the load mapping**

Where the project is loaded into `setupData` (near `setupData.value.parentProperty = project.parent_property || ''`), add:
```ts
    setupData.value.deedOfTransferNo = project.deed_of_transfer_no || ''
    setupData.value.parentDiagramNo = project.parent_diagram_no || ''
    setupData.value.parentDiagramAnnexedTo = project.parent_diagram_annexed_to || ''
    setupData.value.originalTitleDiagramNo = project.original_title_diagram_no || ''
    setupData.value.srNo = project.sr_no || ''
    setupData.value.fileNo = project.file_no || ''
    setupData.value.gpNo = project.gp_no || ''
```

- [ ] **Step 5: Add to the save payload**

In the update payload object (near `parentProperty: setupData.value.parentProperty || undefined`), add:
```ts
      deedOfTransferNo: setupData.value.deedOfTransferNo || undefined,
      parentDiagramNo: setupData.value.parentDiagramNo || undefined,
      parentDiagramAnnexedTo: setupData.value.parentDiagramAnnexedTo || undefined,
      originalTitleDiagramNo: setupData.value.originalTitleDiagramNo || undefined,
      srNo: setupData.value.srNo || undefined,
      fileNo: setupData.value.fileNo || undefined,
      gpNo: setupData.value.gpNo || undefined,
```

- [ ] **Step 6: Verify build**

Run (from `app-frontend/`): `npm run build`
Expected: build succeeds (no TS/template errors).

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue
git commit -m "feat(diagram-2a): Diagram details fields in project setup"
```

---

### Task 4: Render-path wiring (projectInfo → metadata)

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue` (the `projectInfo` computed, ~line 148-168)
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (the `projectInfo` prop type ~line 600-610, and `gatherPlanContext()`'s `metadata` object)

**Interfaces:**
- Consumes: `diagramReferenceMetadata` from `./diagramReferenceMetadata` (Task 2); the seven `project.*` snake_case columns (Task 1).
- Produces: `payload.metadata` carries the seven camelCase diagram-reference keys whenever a plan is generated. This is what 2b/2c read.

- [ ] **Step 1: Map the fields into the render-path projectInfo**

In `SurveyPlanViewNew.vue`, find the `projectInfo` object (search `parentProperty: project?.parent_property`). Add, alongside it, mirroring the pattern:
```ts
    deedOfTransferNo: project?.deed_of_transfer_no || props.workflowState?.projectInfo?.deedOfTransferNo || '',
    parentDiagramNo: project?.parent_diagram_no || props.workflowState?.projectInfo?.parentDiagramNo || '',
    parentDiagramAnnexedTo: project?.parent_diagram_annexed_to || props.workflowState?.projectInfo?.parentDiagramAnnexedTo || '',
    originalTitleDiagramNo: project?.original_title_diagram_no || props.workflowState?.projectInfo?.originalTitleDiagramNo || '',
    srNo: project?.sr_no || props.workflowState?.projectInfo?.srNo || '',
    fileNo: project?.file_no || props.workflowState?.projectInfo?.fileNo || '',
    gpNo: project?.gp_no || props.workflowState?.projectInfo?.gpNo || '',
```

- [ ] **Step 2: Extend the projectInfo prop type**

In `SurveyPlanMapView.vue`, find the `projectInfo` prop type (search `parentProperty?: string`, near `wholePortion?: string`). Add:
```ts
    deedOfTransferNo?: string
    parentDiagramNo?: string
    parentDiagramAnnexedTo?: string
    originalTitleDiagramNo?: string
    srNo?: string
    fileNo?: string
    gpNo?: string
```

- [ ] **Step 3: Import the helper and fold it into gatherPlanContext metadata**

In `SurveyPlanMapView.vue`, add the import near the other `./` imports (e.g. next to `./planTypes` / `./planPayload`):
```ts
import { diagramReferenceMetadata } from './diagramReferenceMetadata'
```
Then in `gatherPlanContext()`, find the `metadata` object literal (it sets `title`, `planType`, …, `priorDiagrams`). Add a spread of the seven fields into it (place the line just before the closing `}` of the metadata object):
```ts
    ...diagramReferenceMetadata(props.projectInfo as any),
```

- [ ] **Step 4: Verify build + wiring**

Run (from `app-frontend/`): `npm run build` → succeeds.
Then confirm the metadata actually carries the keys:
```bash
grep -n "diagramReferenceMetadata" src/views/modules/cadastral-standard/SurveyPlanMapView.vue
```
Expected: two matches — the import and the spread inside `gatherPlanContext`.

- [ ] **Step 5: Run the frontend unit suite**

Run: `npm test -- diagramReferenceMetadata planPayload planTypes`
Expected: all pass (Task 2 helper + the existing sub-project-1 helpers, unaffected).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(diagram-2a): carry diagram reference fields into renderer metadata"
```

---

## Self-Review

**Spec coverage:**
- Migration adding seven nullable columns, mirroring 084, no undo → Task 1 Step 1. ✓
- API round-trips the fields (persist via update allow-list; return via `SELECT *`) → Task 1 Steps 2, 5. ✓
- "Diagram details" form in project setup → Task 3. ✓
- Carry fields into renderer `metadata` under exact camelCase keys → Task 2 (helper) + Task 4 (wiring). ✓
- Constants=0.00 decision → recorded in spec; not an implementation step here (it's a 2b concern). ✓ (no task needed)
- Testing: migration idempotency (T1 S4), API round-trip (T1 S5), frontend mapping unit (T2), build (T3/T4) → covered. ✓
- Non-goals (no rendering, no per-parcel data, no SG-office cells, no GP/WP renderer changes) → respected; no task touches renderers. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows the code. The two manual/DB steps (T1 S3/S5) name exact commands and expected output and instruct escalation if the DB/token is unavailable rather than faking success.

**Type consistency:** camelCase keys (`deedOfTransferNo`, `parentDiagramNo`, `parentDiagramAnnexedTo`, `originalTitleDiagramNo`, `srNo`, `fileNo`, `gpNo`) are identical across the helper (Task 2), the setup form (Task 3), the render-path projectInfo (Task 4 Step 1), the prop type (Task 4 Step 2), and the spread (Task 4 Step 3). snake_case columns (`deed_of_transfer_no`, `parent_diagram_no`, `parent_diagram_annexed_to`, `original_title_diagram_no`, `sr_no`, `file_no`, `gp_no`) are identical across the migration (Task 1 Step 1), the allow-list (Task 1 Step 2), and the load mappings (Task 3 Step 4, Task 4 Step 1). The camelCase↔snake_case pairs match the model's regex conversion.

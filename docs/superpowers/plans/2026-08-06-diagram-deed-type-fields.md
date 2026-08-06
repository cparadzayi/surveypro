# Diagram Deed-Type Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the immediate-parent-diagram and original-title-diagram cells of the SI 727 single-stand Diagram their own independent "type of deed/title" (dropdown + free-text fallback) and "deed/certificate No." fields, instead of the original-title cell silently reusing the parent's values.

**Architecture:** Two new nullable `VARCHAR(100)` columns (`original_title_annexed_to`, `original_title_deed_no`) on `survey_projects`, added via an idempotent migration mirroring migration 085. They flow through the same thin pipeline as the existing seven "2a" fields: `SurveyProject.update()`'s allowed-columns whitelist → `buildReferenceGrid()` → the second `drawDiagramRefCell`/`drawDiagramRefCellDxf` call in the PDF/DXF renderers → `diagramReferenceMetadata()` on the frontend → `ProjectSetupView.vue`'s form. The immediate-parent-diagram's existing "annexed to" field (`parentDiagramAnnexedTo`) changes from free text to a dropdown (Deed of Transfer / Certificate of Registered Title / Other) — same UI pattern reused for the new original-title field.

**Tech Stack:** Fastify + PostgreSQL (backend), Vue 3 + TypeScript (frontend), Jest (`app-backend`, ESM via `--experimental-vm-modules`), Vitest (`app-frontend`).

## Global Constraints

- Migrations are additive only — never modify an existing migration file (per `CLAUDE.md`).
- New columns must be added to every `surveyor_%` schema and `public`, guarded by an `information_schema.columns` existence check (idempotent), matching migration `085`'s pattern exactly.
- Backend tests run via `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` — bare `npx jest` fails on this ESM codebase.
- Frontend tests run via `cd app-frontend && npm run test -- <pattern>` (Vitest).
- All new project fields are optional (nullable); blank/absent must persist as `NULL` and round-trip as `''`/`null`, matching the existing seven "2a" fields.
- Render only the captured deed type in the diagram sentence — never a fixed "X or Y (whichever applicable)" boilerplate.

---

### Task 1: Database migration for original-title deed fields

**Files:**
- Create: `app-backend/migrations/087_add_original_title_deed_fields.do.sql`

**Interfaces:**
- Produces: two new columns, `original_title_annexed_to` and `original_title_deed_no` (both `VARCHAR(100)`, nullable), on `survey_projects` in every `surveyor_%` schema and `public`. Task 2 reads these column names.

- [ ] **Step 1: Write the migration**

Create `app-backend/migrations/087_add_original_title_deed_fields.do.sql`:

```sql
-- Migration 087: Add original title diagram deed-type fields to survey_projects
-- in all surveyor schemas. The original title diagram is frequently annexed to
-- a different deed/certificate than the immediate parent diagram, so it needs
-- its own "annexed to" type + number instead of reusing the parent's
-- (parent_diagram_annexed_to / deed_of_transfer_no, from migration 085).

DO $$
DECLARE
  schema_rec RECORD;
  col TEXT;
  cols TEXT[] := ARRAY[
    'original_title_annexed_to',
    'original_title_deed_no'
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

- [ ] **Step 2: Apply the migration**

Run: `cd app-backend && npm run migrate`
Expected: exits 0; console output includes `Added original_title_annexed_to to <schema>.survey_projects` and `Added original_title_deed_no to <schema>.survey_projects` (or "already exists" if re-run).

- [ ] **Step 3: Verify idempotency**

Run: `cd app-backend && npm run migrate` again.
Expected: exits 0; no errors (the existence checks skip already-added columns silently, matching the `IF NOT EXISTS` guard behavior of migration 085).

- [ ] **Step 4: Commit**

```bash
git add app-backend/migrations/087_add_original_title_deed_fields.do.sql
git commit -m "feat(diagram): add original_title_annexed_to and original_title_deed_no columns"
```

---

### Task 2: Backend data layer — thread the two fields to the render-time grid

**Files:**
- Modify: `app-backend/src/models/SurveyProject.js:147-154` (allowedColumns)
- Modify: `app-backend/src/services/diagram/referenceGrid.js:5-8` (KEYS)
- Test: `app-backend/src/services/diagram/__tests__/referenceGrid.test.js`

**Interfaces:**
- Consumes: DB columns `original_title_annexed_to`, `original_title_deed_no` from Task 1.
- Produces: `buildReferenceGrid(metadata)` returns a `grid` object with `grid.originalTitleAnnexedTo` and `grid.originalTitleDeedNo` (strings, `''` when absent) — Task 3's renderers read these two properties.

- [ ] **Step 1: Write the failing test**

In `app-backend/src/services/diagram/__tests__/referenceGrid.test.js`, add a new `test(...)` inside the existing `describe('buildReferenceGrid', ...)` block, after the last existing test:

```js
  test('carries original title deed fields independently of the parent diagram ones', () => {
    const g = buildReferenceGrid({
      parentDiagramAnnexedTo: 'Deed of Transfer', deedOfTransferNo: '1166/77',
      originalTitleAnnexedTo: 'Certificate of Registered Title', originalTitleDeedNo: '2201/64',
    })
    expect(g.parentDiagramAnnexedTo).toBe('Deed of Transfer')
    expect(g.deedOfTransferNo).toBe('1166/77')
    expect(g.originalTitleAnnexedTo).toBe('Certificate of Registered Title')
    expect(g.originalTitleDeedNo).toBe('2201/64')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js referenceGrid`
Expected: FAIL — `g.originalTitleAnnexedTo` and `g.originalTitleDeedNo` are `undefined`, not the expected strings (the `KEYS` array in `referenceGrid.js` doesn't include them yet).

- [ ] **Step 3: Implement — add the keys to referenceGrid.js**

In `app-backend/src/services/diagram/referenceGrid.js`, replace lines 5-8:

```js
const KEYS = [
  'deedOfTransferNo', 'parentDiagramNo', 'parentDiagramAnnexedTo',
  'originalTitleDiagramNo', 'srNo', 'fileNo', 'gpNo',
]
```

with:

```js
const KEYS = [
  'deedOfTransferNo', 'parentDiagramNo', 'parentDiagramAnnexedTo',
  'originalTitleDiagramNo', 'originalTitleAnnexedTo', 'originalTitleDeedNo',
  'srNo', 'fileNo', 'gpNo',
]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js referenceGrid`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Whitelist the two new columns for project updates**

In `app-backend/src/models/SurveyProject.js`, replace lines 147-154:

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

with:

```js
      const allowedColumns = [
        'name', 'client_name', 'survey_type', 'survey_date', 'district',
        'central_meridian', 'working_directory', 'status', 'metadata',
        'workflow_state', 'last_used', 'datum', 'instruments', 'designation', 'township',
        'whole_portion', 'parent_property',
        'deed_of_transfer_no', 'parent_diagram_no', 'parent_diagram_annexed_to',
        'original_title_diagram_no', 'original_title_annexed_to', 'original_title_deed_no',
        'sr_no', 'file_no', 'gp_no'
      ]
```

(No dedicated test exists for `allowedColumns` — this mirrors how the seven existing 2a columns were whitelisted with no unit test, per the precedent in `docs/superpowers/specs/2026-07-01-diagram-reference-data-capture-design.md`. Verified manually in Task 7.)

- [ ] **Step 6: Run the full referenceGrid suite once more to confirm nothing else broke**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js referenceGrid`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/models/SurveyProject.js app-backend/src/services/diagram/referenceGrid.js app-backend/src/services/diagram/__tests__/referenceGrid.test.js
git commit -m "feat(diagram): thread original title deed-type fields through the data layer"
```

---

### Task 3: Backend renderers — original-title cell reads its own deed fields

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js:557-569`
- Modify: `app-backend/src/services/diagramDxf.js:415-424`
- Test: `app-backend/src/services/__tests__/diagramDxf.test.js:178-197`

**Interfaces:**
- Consumes: `grid.originalTitleAnnexedTo`, `grid.originalTitleDeedNo` from Task 2's `buildReferenceGrid()`.
- Produces: the "original title diagram" reference-grid cell renders its own captured deed type/number in both PDF and DXF output; the "immediate parent diagram" cell is unchanged (already correct).

- [ ] **Step 1: Write the failing test**

In `app-backend/src/services/__tests__/diagramDxf.test.js`, replace the existing test (currently lines 178-197):

```js
  test('renders the reference grid (reg-53)', async () => {
    const r = await generateDiagramDXF({
      ...options,
      metadata: { ...options.metadata, fileNo: '5/2023', srNo: '118/2023' },
    }, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('GRID\n')
    expect(text).toContain('This diagram is annexed to')
    // 'The immediate parent diagram is' / 'The original title diagram is' are rendered via
    // justifiedLineDxf, which (like diagramPdf.js's drawJustifiedLine) emits one DXF TEXT
    // entity per word so the line can be spread to fill the cell width — so the phrase never
    // appears as one contiguous substring in the buffer. Assert the constituent words instead.
    expect(text).toContain('immediate')
    expect(text).toContain('parent')
    expect(text).toContain('original')
    expect(text).toContain('title')
    expect(text).toContain('File : 5/2023')
    expect(text).toContain('S.R. : 118/2023')
    expect(text).toContain('Surveyor-General')
  })
```

with:

```js
  test('renders the reference grid (reg-53)', async () => {
    const r = await generateDiagramDXF({
      ...options,
      metadata: { ...options.metadata, fileNo: '5/2023', srNo: '118/2023' },
    }, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('GRID\n')
    expect(text).toContain('This diagram is annexed to')
    // 'The immediate parent diagram is' / 'The original title diagram is' are rendered via
    // justifiedLineDxf, which (like diagramPdf.js's drawJustifiedLine) emits one DXF TEXT
    // entity per word so the line can be spread to fill the cell width — so the phrase never
    // appears as one contiguous substring in the buffer. Assert the constituent words instead.
    expect(text).toContain('immediate')
    expect(text).toContain('parent')
    expect(text).toContain('original')
    expect(text).toContain('title')
    expect(text).toContain('File : 5/2023')
    expect(text).toContain('S.R. : 118/2023')
    expect(text).toContain('Surveyor-General')
  })

  test('the original title diagram cell renders its own deed type/No., independent of the parent diagram cell', async () => {
    const r = await generateDiagramDXF({
      ...options,
      metadata: {
        ...options.metadata,
        parentDiagramAnnexedTo: 'Deed of Transfer', deedOfTransferNo: '1166/77',
        originalTitleAnnexedTo: 'Certificate of Registered Title', originalTitleDeedNo: '2201/64',
      },
    }, logger)
    const text = r.dxfBuffer.toString('utf8')
    // annexedTo and "No. <deedNo>" are drawn as single TEXT entities (not word-split), so the
    // full strings are contiguous substrings in the buffer.
    expect(text).toContain('Deed of Transfer')
    expect(text).toContain('No. 1166/77')
    expect(text).toContain('Certificate of Registered Title')
    expect(text).toContain('No. 2201/64')
  })
```

- [ ] **Step 2: Run the test to verify the new one fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: the new test FAILS — `text` contains `'Deed of Transfer'` and `'No. 1166/77'` twice (both cells), but does not contain `'Certificate of Registered Title'` or `'No. 2201/64'` at all, because both cells currently read `grid.parentDiagramAnnexedTo`/`grid.deedOfTransferNo`.

- [ ] **Step 3: Implement — diagramDxf.js**

In `app-backend/src/services/diagramDxf.js`, replace lines 415-424:

```js
  drawDiagramRefCellDxf(w, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)
  drawDiagramRefCellDxf(w, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)
```

with:

```js
  drawDiagramRefCellDxf(w, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)
  drawDiagramRefCellDxf(w, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.originalTitleAnnexedTo, deedNo: grid.originalTitleDeedNo,
  }, toG, toGLen)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagramDxf`
Expected: PASS (all tests in the file, including both reg-53 tests).

- [ ] **Step 5: Apply the same fix to diagramPdf.js**

In `app-backend/src/services/diagramPdf.js`, replace lines 557-569:

```js
  // Top band: parent-diagram cell (left) and original-title cell (right), both on the
  // same 4-row layout. Deed type + No. come from the property's title-deed metadata
  // (deed type shown only when available); the diagram number differs per cell.
  drawDiagramRefCell(doc, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  })
  drawDiagramRefCell(doc, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  })
```

with:

```js
  // Top band: parent-diagram cell (left) and original-title cell (right), both on the
  // same 4-row layout. Each cell has its own deed type + No. (deed type shown only when
  // available) — they're often different documents, so they're captured independently.
  drawDiagramRefCell(doc, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  })
  drawDiagramRefCell(doc, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.originalTitleAnnexedTo, deedNo: grid.originalTitleDeedNo,
  })
```

(`diagramPdf.js` has no text-content assertions in its test suite — PDF output isn't parsed as text anywhere in this codebase's tests — so this change is verified by the DXF test above plus manual PDF generation in Task 7.)

- [ ] **Step 6: Run the full diagram test suites to confirm nothing else broke**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagram`
Expected: PASS (covers `diagramDxf`, `diagramPdf`, `diagramLayout`, `referenceGrid`, and all other `diagram*` suites).

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/services/diagramPdf.js app-backend/src/services/diagramDxf.js app-backend/src/services/__tests__/diagramDxf.test.js
git commit -m "fix(diagram): original title cell renders its own deed type/No. instead of the parent's"
```

---

### Task 4: Frontend metadata contract — diagramReferenceMetadata.ts

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/diagramReferenceMetadata.test.ts`

**Interfaces:**
- Produces: `DiagramReferenceFields` interface and `diagramReferenceMetadata()` now carry 9 keys (the existing 7 plus `originalTitleAnnexedTo`, `originalTitleDeedNo`). Task 5's `SurveyPlanMapView.vue` spreads this into `payload.metadata` — no code change needed there beyond widening the `projectInfo` prop type, since `gatherPlanContext()` already does `...diagramReferenceMetadata(props.projectInfo as any)`.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `app-frontend/src/views/modules/cadastral-standard/__tests__/diagramReferenceMetadata.test.ts`:

```ts
import { diagramReferenceMetadata } from '../diagramReferenceMetadata'

describe('diagramReferenceMetadata', () => {
  it('carries all nine fields through', () => {
    const r = diagramReferenceMetadata({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      originalTitleAnnexedTo: 'annex-z',
      originalTitleDeedNo: '2201/64',
      srNo: '118/2023',
      fileNo: '8/2916',
      gpNo: 'GP-1',
    })
    expect(r).toEqual({
      deedOfTransferNo: '3326/72',
      parentDiagramNo: '8055/57',
      parentDiagramAnnexedTo: 'annex-x',
      originalTitleDiagramNo: 'orig-y',
      originalTitleAnnexedTo: 'annex-z',
      originalTitleDeedNo: '2201/64',
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
    expect(r.originalTitleAnnexedTo).toBe('')
    expect(r.originalTitleDeedNo).toBe('')
  })

  it('handles null/undefined input', () => {
    const empty = {
      deedOfTransferNo: '', parentDiagramNo: '', parentDiagramAnnexedTo: '',
      originalTitleDiagramNo: '', originalTitleAnnexedTo: '', originalTitleDeedNo: '',
      srNo: '', fileNo: '', gpNo: '',
    }
    expect(diagramReferenceMetadata(null)).toEqual(empty)
    expect(diagramReferenceMetadata(undefined)).toEqual(empty)
  })

  it('exposes exactly the nine contract keys', () => {
    expect(Object.keys(diagramReferenceMetadata({})).sort()).toEqual([
      'deedOfTransferNo', 'fileNo', 'gpNo', 'originalTitleAnnexedTo',
      'originalTitleDeedNo', 'originalTitleDiagramNo', 'parentDiagramAnnexedTo',
      'parentDiagramNo', 'srNo',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npm run test -- diagramReferenceMetadata`
Expected: FAIL — `originalTitleAnnexedTo`/`originalTitleDeedNo` are `undefined` in the result (not yet in `DIAGRAM_REFERENCE_KEYS`), and the "nine contract keys" test sees only 7 keys.

- [ ] **Step 3: Implement**

Replace the full contents of `app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts`:

```ts
export interface DiagramReferenceFields {
  deedOfTransferNo?: string | null
  parentDiagramNo?: string | null
  parentDiagramAnnexedTo?: string | null
  originalTitleDiagramNo?: string | null
  originalTitleAnnexedTo?: string | null
  originalTitleDeedNo?: string | null
  srNo?: string | null
  fileNo?: string | null
  gpNo?: string | null
}

const DIAGRAM_REFERENCE_KEYS: (keyof DiagramReferenceFields)[] = [
  'deedOfTransferNo',
  'parentDiagramNo',
  'parentDiagramAnnexedTo',
  'originalTitleDiagramNo',
  'originalTitleAnnexedTo',
  'originalTitleDeedNo',
  'srNo',
  'fileNo',
  'gpNo',
]

/**
 * Pick the nine project-level diagram reference fields from a projectInfo-like
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app-frontend && npm run test -- diagramReferenceMetadata`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/diagramReferenceMetadata.ts app-frontend/src/views/modules/cadastral-standard/__tests__/diagramReferenceMetadata.test.ts
git commit -m "feat(diagram): add original title deed fields to the reference-metadata contract"
```

---

### Task 5: Thread the two fields through prop types and workflow state

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:648-673`
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue:141-177`
- Modify: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue:1923-1944, 2058-2073, 2093-2112`

**Interfaces:**
- Consumes: `originalTitleAnnexedTo`/`originalTitleDeedNo` will be emitted by `ProjectSetupView.vue`'s `complete` event in Task 6 — this task makes the receiving types/plumbing ready for it first (so Task 6's emit has somewhere to go).
- Produces: `props.projectInfo.originalTitleAnnexedTo` / `.originalTitleDeedNo` available in `SurveyPlanMapView.vue` (already picked up automatically by `diagramReferenceMetadata(props.projectInfo as any)` from Task 4 — no change needed to `gatherPlanContext()` itself).

- [ ] **Step 1: Widen the projectInfo prop type in SurveyPlanMapView.vue**

In `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`, replace lines 663-671:

```ts
    deedOfTransferNo?: string
    parentDiagramNo?: string
    parentDiagramAnnexedTo?: string
    originalTitleDiagramNo?: string
    srNo?: string
    fileNo?: string
    gpNo?: string
```

with:

```ts
    deedOfTransferNo?: string
    parentDiagramNo?: string
    parentDiagramAnnexedTo?: string
    originalTitleDiagramNo?: string
    originalTitleAnnexedTo?: string
    originalTitleDeedNo?: string
    srNo?: string
    fileNo?: string
    gpNo?: string
```

- [ ] **Step 2: Populate the two fields in SurveyPlanViewNew.vue's projectInfo computed**

In `app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue`, replace lines 160-166:

```ts
    deedOfTransferNo: project?.deed_of_transfer_no || props.workflowState?.projectInfo?.deedOfTransferNo || '',
    parentDiagramNo: project?.parent_diagram_no || props.workflowState?.projectInfo?.parentDiagramNo || '',
    parentDiagramAnnexedTo: project?.parent_diagram_annexed_to || props.workflowState?.projectInfo?.parentDiagramAnnexedTo || '',
    originalTitleDiagramNo: project?.original_title_diagram_no || props.workflowState?.projectInfo?.originalTitleDiagramNo || '',
    srNo: project?.sr_no || props.workflowState?.projectInfo?.srNo || '',
    fileNo: project?.file_no || props.workflowState?.projectInfo?.fileNo || '',
    gpNo: project?.gp_no || props.workflowState?.projectInfo?.gpNo || '',
```

with:

```ts
    deedOfTransferNo: project?.deed_of_transfer_no || props.workflowState?.projectInfo?.deedOfTransferNo || '',
    parentDiagramNo: project?.parent_diagram_no || props.workflowState?.projectInfo?.parentDiagramNo || '',
    parentDiagramAnnexedTo: project?.parent_diagram_annexed_to || props.workflowState?.projectInfo?.parentDiagramAnnexedTo || '',
    originalTitleDiagramNo: project?.original_title_diagram_no || props.workflowState?.projectInfo?.originalTitleDiagramNo || '',
    originalTitleAnnexedTo: project?.original_title_annexed_to || props.workflowState?.projectInfo?.originalTitleAnnexedTo || '',
    originalTitleDeedNo: project?.original_title_deed_no || props.workflowState?.projectInfo?.originalTitleDeedNo || '',
    srNo: project?.sr_no || props.workflowState?.projectInfo?.srNo || '',
    fileNo: project?.file_no || props.workflowState?.projectInfo?.fileNo || '',
    gpNo: project?.gp_no || props.workflowState?.projectInfo?.gpNo || '',
```

- [ ] **Step 3: Widen handleProjectSetupComplete's param type in CadastralStandardView.vue**

In `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`, replace lines 1932 (the single line `originalTitleDiagramNo?: string;`) — i.e. replace:

```ts
  originalTitleDiagramNo?: string;
```

with:

```ts
  originalTitleDiagramNo?: string;
  originalTitleAnnexedTo?: string;
  originalTitleDeedNo?: string;
```

(This is inside the `handleProjectSetupComplete(setupData: {...})` parameter type spanning lines 1923-1944.)

- [ ] **Step 4: Copy the two fields into workflowState.projectInfo**

In `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`, replace line 2066:

```ts
  workflowState.projectInfo.originalTitleDiagramNo = setupData.originalTitleDiagramNo;
```

with:

```ts
  workflowState.projectInfo.originalTitleDiagramNo = setupData.originalTitleDiagramNo;
  workflowState.projectInfo.originalTitleAnnexedTo = setupData.originalTitleAnnexedTo;
  workflowState.projectInfo.originalTitleDeedNo = setupData.originalTitleDeedNo;
```

- [ ] **Step 5: Include the two fields in the updateSurveyProject payload**

In `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`, replace line 2100:

```ts
        originalTitleDiagramNo: setupData.originalTitleDiagramNo,
```

with:

```ts
        originalTitleDiagramNo: setupData.originalTitleDiagramNo,
        originalTitleAnnexedTo: setupData.originalTitleAnnexedTo,
        originalTitleDeedNo: setupData.originalTitleDeedNo,
```

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue
git commit -m "feat(diagram): thread original title deed fields through workflow state and prop types"
```

(No unit tests exist for these three Vue components — verified together with Task 6 via manual dev-server testing in Task 7, matching this codebase's existing test coverage for Project Setup plumbing.)

---

### Task 6: ProjectSetupView.vue — grouped sections with deed-type dropdowns

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue`

**Interfaces:**
- Consumes: nothing new (this task both defines and consumes `setupData.originalTitleAnnexedTo`/`originalTitleDeedNo` locally).
- Produces: emits `complete` with `originalTitleAnnexedTo`/`originalTitleDeedNo` populated — consumed by Task 5's `handleProjectSetupComplete` (already updated).

- [ ] **Step 1: Add the two new fields to the emit type**

Replace line 493 (`originalTitleDiagramNo?: string`) in the `defineEmits<{ complete: [setupData: {...}] }>()` block (lines 483-506):

```ts
    originalTitleDiagramNo?: string
```

with:

```ts
    originalTitleDiagramNo?: string
    originalTitleAnnexedTo?: string
    originalTitleDeedNo?: string
```

- [ ] **Step 2: Add the two new fields to setupData's initial state**

Replace line 523 (`originalTitleDiagramNo: '',`) in the `setupData = ref({...})` block (lines 513-534):

```ts
  originalTitleDiagramNo: '',
```

with:

```ts
  originalTitleDiagramNo: '',
  originalTitleAnnexedTo: '',
  originalTitleDeedNo: '',
```

- [ ] **Step 3: Add the deed-type dropdown helpers**

In the `<script setup lang="ts">` block, immediately before the `function onProjectChange() {` declaration (currently line 607), insert:

```ts
const DEED_TYPE_PRESETS = ['Deed of Transfer', 'Certificate of Registered Title']

function deedTypeSelectValue(current: string): string {
  if (current === '' || DEED_TYPE_PRESETS.includes(current)) return current
  return 'Other'
}

function onDeedTypeChange(event: Event, field: 'parentDiagramAnnexedTo' | 'originalTitleAnnexedTo') {
  const value = (event.target as HTMLSelectElement).value
  setupData.value[field] = value === 'Other' ? '' : value
}

```

- [ ] **Step 4: Load the two new fields when a project is selected**

Replace line 624 (`setupData.value.originalTitleDiagramNo = project.original_title_diagram_no || ''`) in `onProjectChange()`:

```ts
    setupData.value.originalTitleDiagramNo = project.original_title_diagram_no || ''
```

with:

```ts
    setupData.value.originalTitleDiagramNo = project.original_title_diagram_no || ''
    setupData.value.originalTitleAnnexedTo = project.original_title_annexed_to || ''
    setupData.value.originalTitleDeedNo = project.original_title_deed_no || ''
```

- [ ] **Step 5: Emit the two new fields on completion**

Replace line 837 (`originalTitleDiagramNo: setupData.value.originalTitleDiagramNo || undefined,`) in `completeSetup()`:

```ts
      originalTitleDiagramNo: setupData.value.originalTitleDiagramNo || undefined,
```

with:

```ts
      originalTitleDiagramNo: setupData.value.originalTitleDiagramNo || undefined,
      originalTitleAnnexedTo: setupData.value.originalTitleAnnexedTo || undefined,
      originalTitleDeedNo: setupData.value.originalTitleDeedNo || undefined,
```

- [ ] **Step 6: Replace the flat "Diagram details" template block with two grouped sections**

Replace the entire block from `<!-- Diagram details (SI 727 single-stand Diagram reference grid) -->` through the `<!-- G.P. No. -->` field's closing `</div>` — currently lines 192-266:

```html
            <!-- Diagram details (SI 727 single-stand Diagram reference grid) -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Deed of Transfer No.
              </label>
              <input
                v-model="setupData.deedOfTransferNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 3326/72"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Immediate parent diagram No.
              </label>
              <input
                v-model="setupData.parentDiagramNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 8055/57"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Parent diagram annexed to
              </label>
              <input
                v-model="setupData.parentDiagramAnnexedTo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Original title diagram No.
              </label>
              <input
                v-model="setupData.originalTitleDiagramNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                S.R. No.
              </label>
              <input
                v-model="setupData.srNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 118/2023"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                File No.
              </label>
              <input
                v-model="setupData.fileNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 8/2916"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                G.P. No.
              </label>
              <input
                v-model="setupData.gpNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
```

with:

```html
            <!-- Immediate parent diagram (SI 727 single-stand Diagram reference grid) -->
            <h3 class="text-sm font-semibold text-gray-700 pt-2">Immediate Parent Diagram</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Immediate Parent Diagram No.
              </label>
              <input
                v-model="setupData.parentDiagramNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 8057/77"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Type of Deed or Title
              </label>
              <select
                :value="deedTypeSelectValue(setupData.parentDiagramAnnexedTo)"
                @change="onDeedTypeChange($event, 'parentDiagramAnnexedTo')"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select type...</option>
                <option value="Deed of Transfer">Deed of Transfer</option>
                <option value="Certificate of Registered Title">Certificate of Registered Title</option>
                <option value="Other">Other</option>
              </select>
              <input
                v-if="deedTypeSelectValue(setupData.parentDiagramAnnexedTo) === 'Other'"
                v-model="setupData.parentDiagramAnnexedTo"
                type="text"
                class="mt-2 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Deed of Grant"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Deed / Certificate No.
              </label>
              <input
                v-model="setupData.deedOfTransferNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 1166/77"
              />
            </div>

            <!-- Original title diagram -->
            <h3 class="text-sm font-semibold text-gray-700 pt-2">Original Title Diagram</h3>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Original Title Diagram No.
              </label>
              <input
                v-model="setupData.originalTitleDiagramNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Type of Deed or Title
              </label>
              <select
                :value="deedTypeSelectValue(setupData.originalTitleAnnexedTo)"
                @change="onDeedTypeChange($event, 'originalTitleAnnexedTo')"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select type...</option>
                <option value="Deed of Transfer">Deed of Transfer</option>
                <option value="Certificate of Registered Title">Certificate of Registered Title</option>
                <option value="Other">Other</option>
              </select>
              <input
                v-if="deedTypeSelectValue(setupData.originalTitleAnnexedTo) === 'Other'"
                v-model="setupData.originalTitleAnnexedTo"
                type="text"
                class="mt-2 w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Deed of Grant"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Deed / Certificate No.
              </label>
              <input
                v-model="setupData.originalTitleDeedNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 2201/64"
              />
            </div>

            <!-- S.R. / File / G.P. -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                S.R. No.
              </label>
              <input
                v-model="setupData.srNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 118/2023"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                File No.
              </label>
              <input
                v-model="setupData.fileNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 8/2916"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                G.P. No.
              </label>
              <input
                v-model="setupData.gpNo"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
```

- [ ] **Step 7: Start the frontend dev server and manually verify**

Run: `cd app-frontend && npm run dev`

Open the app, navigate to Project Setup, and confirm:
- The "Immediate Parent Diagram" and "Original Title Diagram" sub-sections both appear, each with its own diagram No., "Type of Deed or Title" dropdown, and "Deed / Certificate No." field.
- Selecting "Deed of Transfer" or "Certificate of Registered Title" in either dropdown does not reveal a text input.
- Selecting "Other" in either dropdown reveals a text input scoped to that section only (selecting "Other" in one section must not affect the other).
- Typing a custom value, then reloading the project, shows the dropdown as "Other" with the typed value preserved in the text input (round-trips correctly since `deedTypeSelectValue` treats anything outside the two presets as "Other").

Expected: all four checks pass; no console errors.

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue
git commit -m "feat(diagram): split parent/original-title diagram fields into grouped sections with deed-type dropdowns"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Run the full backend diagram-related suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js diagram`
Expected: PASS.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd app-frontend && npm run test`
Expected: PASS.

- [ ] **Step 3: Manual round-trip through Project Setup → Diagram generation**

With both dev servers running (`cd app-backend && npm run dev`, `cd app-frontend && npm run dev`):
1. Open Project Setup for a project with a stand suitable for the Diagram plan type (e.g. a Brackenhurst Township stand, per the design doc's reference samples).
2. Set: Immediate Parent Diagram No. `8057/77`, Type of Deed or Title `Deed of Transfer`, Deed/Certificate No. `1166/77`; Original Title Diagram No. `8055/57` (any distinct value), Type of Deed or Title `Certificate of Registered Title`, Deed/Certificate No. `2201/64`.
3. Complete setup and generate a Diagram PDF and DXF for that stand.
4. Open the generated PDF/DXF and confirm the reference grid reads (across the two top-band cells):
   - "The immediate parent diagram is No. 8057/77 ... annexed to ... Deed of Transfer ... No. 1166/77"
   - "The original title diagram is No. 8055/57 ... annexed to ... Certificate of Registered Title ... No. 2201/64"
   - The two cells show **different** deed types and numbers (confirms independence — the bug this plan fixes).

Expected: both cells show their own distinct values; no crash; no field left silently blank that was filled in on the form.

- [ ] **Step 4: Report results to the user**

Summarize: which automated suites passed, and the outcome of the manual PDF/DXF check (paste or describe what the two cells rendered).

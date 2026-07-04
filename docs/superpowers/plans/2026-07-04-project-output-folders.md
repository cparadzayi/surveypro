# Surveyor-Scoped Project Output Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save plan outputs (diagrams, general plans, working plans) as individual PDF/DXF files into a surveyor-scoped project folder with per-product subfolders, replacing the per-plan zip download, and prompt before overwriting an existing file.

**Architecture:** A path builder produces the surveyor-scoped structure and maps plan types to subfolders. The plan-generation flow saves each produced document through an overwrite-aware helper that talks to the existing `/documents/save` route, which gains an "exists → 409" gate. No project migration; only new-project defaults change.

**Tech Stack:** Vue 3 + TypeScript (Vitest), Fastify (Jest, ESM).

## Global Constraints

- Folder layout: `Documents/SurveyPro/Surveyors/<sanitized surveyor>/<project>`; fallback surveyor `Unknown_Surveyor`.
- New `output/` subfolders: `diagrams`, `general-plans`, `working-plans`, `survey-record`.
- Canonical filenames — **no timestamp**; save individual files (`<base>.pdf`, `<base>.dxf`, `<base>-summary.pdf`); **no zip**.
- Overwrite: `/documents/save` returns **409 `{ code: 'EXISTS' }`** when the target exists and `overwrite !== 'true'`; the frontend prompts, then retries with `overwrite='true'`.
- Backend Jest runs via `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` from `app-backend/` (bare `npx jest` fails on the ESM backend).
- Frontend tests run via `npx vitest run <pattern>` from `app-frontend/`.
- Existing projects keep their stored `workingDirectory` — no migration.

---

### Task 1: Backend overwrite gate on `/documents/save`

**Files:**
- Modify: `app-backend/src/routes/documents.js` (the `/documents/save` handler, ~lines 24-101)
- Test: `app-backend/src/routes/__tests__/documents.save.test.js`

**Interfaces:**
- Produces: `/documents/save` accepts an extra multipart field `overwrite`; when the resolved target file exists and `overwrite !== 'true'`, responds `409 { ok:false, code:'EXISTS', error:'File already exists', filePath }` without writing. Otherwise unchanged (writes, `ok:true`).

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the `describe('POST /documents/save error handling', ...)` block in `app-backend/src/routes/__tests__/documents.save.test.js` (after the existing test). They write into the OS temp dir with a unique filename.

```js
  test('existing file without overwrite returns 409 EXISTS and does not change it', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const app = Fastify(); await app.register(multipart); await app.register(documentRoutes); await app.ready()

    const target = path.join(os.tmpdir(), `sp-exists-${Date.now()}.pdf`)
    fs.writeFileSync(target, 'ORIGINAL')

    const boundary = '----jestb' + Date.now()
    const payload = buildMultipart(boundary, { fileName: path.basename(target), fileContent: 'NEW', filePath: target })
    const res = await app.inject({ method: 'POST', url: '/documents/save',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('EXISTS')
    expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL')
    fs.unlinkSync(target)
    await app.close()
  })

  test('existing file with overwrite=true replaces it', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const app = Fastify(); await app.register(multipart); await app.register(documentRoutes); await app.ready()

    const target = path.join(os.tmpdir(), `sp-ovr-${Date.now()}.pdf`)
    fs.writeFileSync(target, 'ORIGINAL')

    const boundary = '----jestb' + Date.now()
    const CRLF = '\r\n'
    const payload =
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${path.basename(target)}"${CRLF}` +
      `Content-Type: application/pdf${CRLF}${CRLF}NEW${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="filePath"${CRLF}${CRLF}${target}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="overwrite"${CRLF}${CRLF}true${CRLF}` +
      `--${boundary}--${CRLF}`
    const res = await app.inject({ method: 'POST', url: '/documents/save',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toBe('NEW')
    fs.unlinkSync(target)
    await app.close()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js documents.save`
Expected: the two new tests FAIL (existing file currently overwrites silently → first test gets 200 instead of 409).

- [ ] **Step 3: Implement the overwrite gate**

In `app-backend/src/routes/documents.js`, (a) parse the new `overwrite` field alongside `filePath` in the multipart loop, and (b) add the exists-gate before writing.

Add a variable near the other declarations at the top of the handler (with `fileBuffer`/`fileName`/`filePath`):

```js
    let overwrite = false
```

In the `for await (const part of parts)` loop, extend the field branch:

```js
        } else {
          // This is a field
          if (part.fieldname === 'filePath') {
            filePath = part.value
            fastify.log.info(`[SAVE] File path: ${filePath}`)
          } else if (part.fieldname === 'overwrite') {
            overwrite = part.value === 'true'
          }
        }
```

Then, immediately after the "Ensure directory exists" block and before `fs.writeFileSync(absolutePath, fileBuffer)`, insert:

```js
      // Overwrite gate: never silently clobber an existing product. The caller
      // must opt in with overwrite=true (driven by a user prompt).
      if (!overwrite && fs.existsSync(absolutePath)) {
        fastify.log.info(`[SAVE] Exists, overwrite not set: ${absolutePath}`)
        return reply.code(409).send({
          ok: false, code: 'EXISTS', error: 'File already exists', filePath: absolutePath,
        })
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js documents.save`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/routes/documents.js app-backend/src/routes/__tests__/documents.save.test.js
git commit -m "feat(documents): overwrite gate — 409 EXISTS unless overwrite=true"
```

---

### Task 2: Surveyor-scoped path builder + plan-type subfolder map

**Files:**
- Modify: `app-frontend/src/utils/project-directory.ts`
- Test: `app-frontend/src/utils/__tests__/project-directory.test.ts` (create)

**Interfaces:**
- Produces:
  - `ProjectDirectoryStructure` gains `diagrams`, `generalPlans`, `workingPlans`, `surveyRecord` (absolute-ish paths `output/diagrams` etc.).
  - `generateDefaultWorkingDirectory(projectName: string, district?: string, surveyorName?: string): string` → `Documents/SurveyPro/Surveyors/<surveyor>/<project>[_district]` (no date).
  - `planTypeOutputSubdir(planType: string): string` → `'diagrams' | 'general-plans' | 'working-plans' | 'survey-record' | 'output'`.

- [ ] **Step 1: Write the failing tests**

Create `app-frontend/src/utils/__tests__/project-directory.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import {
  getProjectDirectoryStructure,
  generateDefaultWorkingDirectory,
  planTypeOutputSubdir,
} from '../project-directory'

describe('getProjectDirectoryStructure', () => {
  test('includes the new plan subfolders under output/', () => {
    const s = getProjectDirectoryStructure('Proj')
    expect(s.diagrams).toBe('Proj/output/diagrams')
    expect(s.generalPlans).toBe('Proj/output/general-plans')
    expect(s.workingPlans).toBe('Proj/output/working-plans')
    expect(s.surveyRecord).toBe('Proj/output/survey-record')
  })
})

describe('generateDefaultWorkingDirectory', () => {
  test('nests under Surveyors/<surveyor>/ with no date suffix', () => {
    expect(generateDefaultWorkingDirectory('Erf 5', 'Harare', 'John Doe'))
      .toBe('Documents/SurveyPro/Surveyors/John_Doe/Erf_5_Harare')
  })
  test('falls back to Unknown_Surveyor when the surveyor is missing', () => {
    expect(generateDefaultWorkingDirectory('Erf 5', 'Harare'))
      .toBe('Documents/SurveyPro/Surveyors/Unknown_Surveyor/Erf_5_Harare')
  })
  test('strips filesystem-illegal characters from the surveyor name', () => {
    expect(generateDefaultWorkingDirectory('Erf 5', undefined, 'A/B:C*'))
      .toBe('Documents/SurveyPro/Surveyors/ABC/Erf_5')
  })
})

describe('planTypeOutputSubdir', () => {
  test('maps each plan type to its output subfolder', () => {
    expect(planTypeOutputSubdir('diagram')).toBe('diagrams')
    expect(planTypeOutputSubdir('general-undeveloped')).toBe('general-plans')
    expect(planTypeOutputSubdir('general-developed')).toBe('general-plans')
    expect(planTypeOutputSubdir('working-plan')).toBe('working-plans')
    expect(planTypeOutputSubdir('survey-record')).toBe('survey-record')
    expect(planTypeOutputSubdir('unknown')).toBe('output')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-frontend && npx vitest run project-directory`
Expected: FAIL — new structure fields and `planTypeOutputSubdir` are undefined; default path lacks `Surveyors/`.

- [ ] **Step 3: Implement**

In `app-frontend/src/utils/project-directory.ts`:

(a) Extend the interface — add to `ProjectDirectoryStructure`:

```ts
  diagrams: string;
  generalPlans: string;
  workingPlans: string;
  surveyRecord: string;
```

(b) Extend `getProjectDirectoryStructure` return object (add alongside the existing fields):

```ts
    diagrams: `${workingDirectory}/output/diagrams`,
    generalPlans: `${workingDirectory}/output/general-plans`,
    workingPlans: `${workingDirectory}/output/working-plans`,
    surveyRecord: `${workingDirectory}/output/survey-record`,
```

(c) Replace `generateDefaultWorkingDirectory` with:

```ts
/** Sanitize a name for use as a filesystem path segment. */
function sanitizePathSegment(s: string, max = 60): string {
  return (s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, max);
}

/**
 * Generate default working directory: surveyor-scoped, stable (no date).
 * `Documents/SurveyPro/Surveyors/<surveyor>/<project>[_district]`
 */
export function generateDefaultWorkingDirectory(
  projectName: string,
  district?: string,
  surveyorName?: string,
): string {
  const project = projectName
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('_')
    .substring(0, 50);
  const districtPart = district ? `_${district.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 20)}` : '';
  const surveyor = sanitizePathSegment(surveyorName || '') || 'Unknown_Surveyor';
  return `Documents/SurveyPro/Surveyors/${surveyor}/${project}${districtPart}`;
}
```

(d) Add the resolver (place near the bottom, before the default export area):

```ts
/** Map a plan type to its output subfolder name (relative to output/). */
export function planTypeOutputSubdir(planType: string): string {
  switch (planType) {
    case 'diagram': return 'diagrams';
    case 'general-undeveloped':
    case 'general-developed':
    case 'general-plan': return 'general-plans';
    case 'working-plan': return 'working-plans';
    case 'survey-record':
    case 'report-on-survey': return 'survey-record';
    default: return 'output';
  }
}
```

(e) Update `getDirectoryStructureDescription`'s returned tree text to list the new subfolders (add lines under `output/`):

```ts
    ├── diagrams/            (Diagram PDFs + DXF)
    ├── general-plans/       (General Plan PDFs + DXF)
    ├── working-plans/       (Working Plan PDFs + DXF)
    ├── survey-record/       (Survey record documents)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-frontend && npx vitest run project-directory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/project-directory.ts app-frontend/src/utils/__tests__/project-directory.test.ts
git commit -m "feat(project-dir): surveyor-scoped default path + plan output subfolders"
```

---

### Task 3: Overwrite-aware save helper

**Files:**
- Modify: `app-frontend/src/services/workflowProductStorage.ts`
- Test: `app-frontend/src/services/__tests__/saveWithOverwritePrompt.test.ts` (create)

**Interfaces:**
- Consumes: `getProjectDirectoryStructure` (Task 2) for `structure.output`; `/documents/save` 409 `EXISTS` gate (Task 1).
- Produces:
  ```ts
  interface SavePlanFileArgs { workingDirectory: string; subdir: string; fileName: string; blob: Blob }
  type OverwriteConfirmFn = (fileName: string) => Promise<boolean> | boolean
  interface SavePlanFileResult { success: boolean; filePath?: string; skipped?: boolean; error?: string }
  function saveWithOverwritePrompt(args: SavePlanFileArgs, confirmFn: OverwriteConfirmFn): Promise<SavePlanFileResult>
  ```
  Saves `${workingDirectory}/output/${subdir}/${fileName}`; on 409 `EXISTS` calls `confirmFn`; retries with `overwrite='true'` if confirmed, else returns `{ success:false, skipped:true }`. A non-`EXISTS` 409 (locked file) returns an error without prompting.

- [ ] **Step 1: Write the failing tests**

Create `app-frontend/src/services/__tests__/saveWithOverwritePrompt.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { saveWithOverwritePrompt } from '../workflowProductStorage'

const resp = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body }) as any
const args = { workingDirectory: 'Proj', subdir: 'diagrams', fileName: 'diagram-302.pdf', blob: new Blob(['x']) }

beforeEach(() => { vi.restoreAllMocks() })

describe('saveWithOverwritePrompt', () => {
  test('saves directly when there is no conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp({ ok: true, filePath: '/abs/diagram-302.pdf' }))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn()
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(r.success).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('prompts on EXISTS then retries with overwrite=true when confirmed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resp({ ok: false, code: 'EXISTS' }, 409))
      .mockResolvedValueOnce(resp({ ok: true, filePath: '/abs/diagram-302.pdf' }))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn().mockResolvedValue(true)
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(confirm).toHaveBeenCalledWith('diagram-302.pdf')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1][1].body as FormData).get('overwrite')).toBe('true')
    expect(r.success).toBe(true)
  })

  test('skips (no overwrite) when the user declines', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp({ ok: false, code: 'EXISTS' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    const r = await saveWithOverwritePrompt(args, () => false)
    expect(r).toEqual({ success: false, skipped: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('returns an error on a non-EXISTS 409 (locked file) without prompting', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resp({ ok: false, code: 'EBUSY', message: 'File is open' }, 409))
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.fn()
    const r = await saveWithOverwritePrompt(args, confirm)
    expect(r.success).toBe(false)
    expect(r.skipped).toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-frontend && npx vitest run saveWithOverwritePrompt`
Expected: FAIL — `saveWithOverwritePrompt` is not exported.

- [ ] **Step 3: Implement**

In `app-frontend/src/services/workflowProductStorage.ts`, add a top-level import and the helper. First ensure the import at the top includes `getProjectDirectoryStructure`:

```ts
import { makeAbsolutePath, getProjectDirectoryStructure } from '../utils/project-directory'
```

Then append at the end of the file:

```ts
export interface SavePlanFileArgs {
  workingDirectory: string
  subdir: string        // subfolder under output/, e.g. 'diagrams'
  fileName: string      // canonical name incl. extension
  blob: Blob
}
export type OverwriteConfirmFn = (fileName: string) => Promise<boolean> | boolean
export interface SavePlanFileResult {
  success: boolean
  filePath?: string
  skipped?: boolean
  error?: string
}

function postSave(filePath: string, fileName: string, blob: Blob, overwrite: boolean): Promise<Response> {
  const formData = new FormData()
  formData.append('file', blob, fileName)
  formData.append('filePath', filePath)
  formData.append('overwrite', overwrite ? 'true' : 'false')
  return fetch(`${API_BASE}/documents/save`, { method: 'POST', body: formData })
}

/**
 * Save a plan file into output/<subdir>/, prompting before overwriting an
 * existing file. Returns { skipped:true } if the user declines the overwrite.
 */
export async function saveWithOverwritePrompt(
  args: SavePlanFileArgs,
  confirmFn: OverwriteConfirmFn,
): Promise<SavePlanFileResult> {
  const { workingDirectory, subdir, fileName, blob } = args
  const structure = getProjectDirectoryStructure(workingDirectory)
  const filePath = `${structure.output}/${subdir}/${fileName}`
  try {
    let res = await postSave(filePath, fileName, blob, false)
    if (res.status === 409) {
      const body = await res.json().catch(() => ({} as any))
      if (body?.code === 'EXISTS') {
        const ok = await confirmFn(fileName)
        if (!ok) return { success: false, skipped: true }
        res = await postSave(filePath, fileName, blob, true)
      } else {
        return { success: false, error: body?.message || 'File is locked or cannot be written' }
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as any))
      return { success: false, error: err?.message || 'Failed to save file' }
    }
    const result = await res.json()
    return { success: true, filePath: result.filePath }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-frontend && npx vitest run saveWithOverwritePrompt`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/services/workflowProductStorage.ts app-frontend/src/services/__tests__/saveWithOverwritePrompt.test.ts
git commit -m "feat(storage): overwrite-aware saveWithOverwritePrompt helper"
```

---

### Task 4: Wire the plan flow to save-to-folder; drop the zip; surveyor default dir

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/planPayload.ts` (`composePlanBaseName` ~88-97; remove `bundlePlanDocuments` ~105-130; remove `import JSZip` ~3)
- Modify: `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts` (update `composePlanBaseName` cases ~77-83; remove the `bundlePlanDocuments` describe ~86-117 and the import of `bundlePlanDocuments`)
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (import line ~595; generation tail ~3986-3990)
- Modify: `app-frontend/src/components/cadastral/WorkingDirectorySelector.vue` (~135, 207)

**Interfaces:**
- Consumes: `planTypeOutputSubdir` (Task 2), `saveWithOverwritePrompt` (Task 3), `getSystem-`n/a. `composePlanBaseName(planType, designation, projectId)` (no ts).

- [ ] **Step 1: Update the planPayload unit tests (drop ts; drop bundle)**

In `app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts`:
- Change the import line to drop `bundlePlanDocuments`:
  ```ts
  import { buildPlanPayload, beaconsForParcel, composePlanBaseName, validateGenerateRequest, type PlanPayloadContext } from '../planPayload'
  ```
- Replace the two `composePlanBaseName` expectations with the no-timestamp form:
  ```ts
  it('builds a base name from plan type + sanitized designation', () => {
    expect(composePlanBaseName('diagram', 'Stand 302', 7)).toBe('diagram-Stand_302')
  })
  it('falls back to projectId when designation is blank', () => {
    expect(composePlanBaseName('working-plan', '   ', 7)).toBe('working-plan-7')
  })
  ```
  (Keep the surrounding `describe('composePlanBaseName', ...)`; match its existing `it`/`test` style — use whichever the file already uses.)
- Delete the entire `describe('bundlePlanDocuments', ...)` block.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-frontend && npx vitest run planPayload`
Expected: FAIL — `composePlanBaseName` still appends `-<ts>` (old signature required 4 args / different output), and `bundlePlanDocuments` import is now gone but still referenced until Step 3.

- [ ] **Step 3: Implement planPayload changes**

In `app-frontend/src/views/modules/cadastral-standard/planPayload.ts`:
- Remove the JSZip import line: `import JSZip from 'jszip'`.
- Replace `composePlanBaseName` with the no-timestamp version:

```ts
export function composePlanBaseName(
  planType: string,
  designation: string | undefined,
  projectId: number | string | undefined,
): string {
  const id = (designation && designation.trim()) || String(projectId ?? 'project')
  const safe = id.replace(/[^\w.-]+/g, '_')
  return `${planType}-${safe}`
}
```

- Delete `bundlePlanDocuments` entirely (the `export async function bundlePlanDocuments(...) { ... }` block) and the `PlanDocumentSet`-adjacent comment referencing zipping. Keep the `PlanDocumentSet` interface (still used to type the docs object).

- [ ] **Step 4: Run the planPayload tests to verify they pass**

Run: `cd app-frontend && npx vitest run planPayload`
Expected: PASS.

- [ ] **Step 5: Wire SurveyPlanMapView to save-to-folder**

In `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`:

(a) Update the planPayload import (~line 595) to drop `bundlePlanDocuments`:

```js
  buildPlanPayload, composePlanBaseName, validateGenerateRequest,
```

(b) Add imports (near the other service/util imports at the top of the `<script setup>`):

```js
import { planTypeOutputSubdir } from '@/utils/project-directory'
import { saveWithOverwritePrompt } from '@/services/workflowProductStorage'
```

(c) Replace the generation tail (the block currently at ~lines 3986-3990):

```js
    const ts = Date.now()
    const baseName = composePlanBaseName(config.value.planType, props.projectInfo.designation, props.projectId, ts)
    const { blob, filename } = await bundlePlanDocuments(docs, baseName)
    downloadBlob(blob, filename)
    emit('export-complete', { format: config.value.planType, filename })
```

with:

```js
    const baseName = composePlanBaseName(config.value.planType, props.projectInfo.designation, props.projectId)
    const workingDirectory = (props.projectInfo as any).workingDirectory
    if (!workingDirectory) {
      alert('Set the project working directory (Project Setup) before generating plans.')
      return
    }
    const subdir = planTypeOutputSubdir(config.value.planType)
    let overwriteAll = false
    const confirmOverwrite = async (name: string): Promise<boolean> => {
      if (overwriteAll) return true
      const ok = window.confirm(`"${name}" already exists in output/${subdir}. Overwrite it (and any other existing files in this plan)?`)
      if (ok) overwriteAll = true
      return ok
    }
    const saved: string[] = []
    const skipped: string[] = []
    for (const kind of ['pdf', 'dxf', 'summary'] as const) {
      const blob = docs[kind]
      if (!(blob instanceof Blob)) continue
      const ext = kind === 'dxf' ? 'dxf' : 'pdf'
      const suffix = kind === 'summary' ? '-summary' : ''
      const fileName = `${baseName}${suffix}.${ext}`
      const res = await saveWithOverwritePrompt({ workingDirectory, subdir, fileName, blob }, confirmOverwrite)
      if (res.success) saved.push(fileName)
      else if (res.skipped) skipped.push(fileName)
      else throw new Error(res.error || `Failed to save ${fileName}`)
    }
    const summary = `Saved to output/${subdir}/:\n${saved.join('\n') || '(none)'}` +
      (skipped.length ? `\n\nKept existing (not overwritten):\n${skipped.join('\n')}` : '')
    alert(summary)
    emit('export-complete', { format: config.value.planType, filename: saved[0] || '' })
```

- [ ] **Step 6: Pass the surveyor name into the default working directory**

In `app-frontend/src/components/cadastral/WorkingDirectorySelector.vue`:
- Add the auth store import near the other imports:
  ```ts
  import { useAuthStore } from '../../stores/auth'
  ```
- After the existing `const props = defineProps<Props>()`, add:
  ```ts
  const auth = useAuthStore()
  ```
- Update the two `generateDefaultWorkingDirectory(props.projectName, props.district)` calls (the `import`ed usages at ~line 207 and the one near ~226) to pass the surveyor:
  ```ts
  generateDefaultWorkingDirectory(props.projectName, props.district, auth.surveyorName)
  ```

- [ ] **Step 7: Verify frontend build and unit tests**

Run: `cd app-frontend && npx vitest run planPayload project-directory saveWithOverwritePrompt`
Expected: PASS.
Run: `cd app-frontend && npm run build`
Expected: build succeeds (no unresolved `bundlePlanDocuments`/`JSZip` references, imports resolve).

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/planPayload.ts \
        app-frontend/src/views/modules/cadastral-standard/__tests__/planPayload.test.ts \
        app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue \
        app-frontend/src/components/cadastral/WorkingDirectorySelector.vue
git commit -m "feat(plans): save PDF/DXF into surveyor project folder with overwrite prompt (no zip)"
```

---

## Manual verification (after all tasks)

1. Create/open a project; the default working directory shows `Documents/SurveyPro/Surveyors/<you>/<project>`.
2. Generate a **Diagram** → `output/diagrams/diagram-<designation>.pdf` (+ `.dxf` if DXF selected) appear; no zip is downloaded; success alert names them.
3. Regenerate the same diagram → overwrite prompt; **OK** replaces the files, **Cancel** keeps them and the alert lists them as skipped.
4. Generate a **Working Plan** / **General Plan** → files land in `output/working-plans/` / `output/general-plans/`.

## Self-Review

**Spec coverage:**
- §1 folder structure & path builder → Task 2. ✔
- §2 canonical filenames + routing → Task 2 (`planTypeOutputSubdir`) + Task 4 (`composePlanBaseName`, per-file save). ✔
- §3 overwrite prompt (backend + frontend) → Task 1 (gate) + Task 3 (helper) + Task 4 (confirm UI). ✔
- §4 remove zip, wire flow → Task 4. ✔
- §5 testing → Tasks 1-4 tests + Manual section. ✔
- Note: the spec mentioned extending `documentStorage.ts`'s type switch; the plan instead routes plan saves through the content-agnostic `saveWithOverwritePrompt` (any Blob incl. DXF), so `documentStorage.saveDocument` is left untouched — simpler, and it does not disturb the older workflow's document types.

**Placeholder scan:** none — every code step has full content.

**Type consistency:** `saveWithOverwritePrompt(args, confirmFn)` and `SavePlanFileArgs { workingDirectory, subdir, fileName, blob }` are used identically in Task 3 (definition) and Task 4 (call). `planTypeOutputSubdir` returns the subfolder name used as `subdir`. `composePlanBaseName` is 3-arg in both the impl and the Task 4 call site. 409 `code:'EXISTS'` is produced by Task 1 and consumed by Task 3.

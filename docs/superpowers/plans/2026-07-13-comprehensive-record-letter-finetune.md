# Comprehensive Record Letter Fine-Tune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Surveyor-General lodgement letter (front of `Comprehensive_Latest.pdf`) show a subject line identical to the general-plan title wording, and give each enclosed-document item a tick box that is ticked only when a matching record exists in the project output/input folders (warning the surveyor about missing ones before generating).

**Architecture:** Two pure frontend utils (`planDesignation.ts` for the subject wording, `lodgementDocuments.ts` for the document list + keyword matching), a new recursive backend manifest endpoint (`GET /documents/output-manifest`) with its walker extracted to `outputManifest.js`, a service call + composable to combine them, and edits to `cover-page.ts` (render tick boxes) plus the two comprehensive-doc call sites (`MapLibreAreaView.vue`, `SurveyPlanMapView.vue`) to set the subject and pass the document statuses.

**Tech Stack:** Vue 3 + TypeScript (frontend, Vitest), Fastify 5 + Node ESM (backend, Jest under `--experimental-vm-modules`), jsPDF for the letter.

## Global Constraints

- Backend is ESM (`"type": "module"`). Run backend Jest via `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` from `app-backend` (bare `npx jest` fails).
- Frontend unit tests use Vitest: `npx vitest run <pattern>` from `app-frontend`.
- Never push to `origin/main` (a different project). This repo's local `main` is the working branch; commit there. Do not push unless the user asks.
- Do NOT stage the pre-existing untracked files at repo root (`20260527 beacon-comparison-claude.csv`, `namibian example.txt`, `survey-plan-dxf-sample.dxf`, `verification/`). Stage only files each task names.
- The letter subject must have NO "SURVEY OF" prefix; it must read like the general plan, e.g. `STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP`.
- The 11 enclosed-document labels are canonical and must stay verbatim (see Task 3).
- Existence check scans `output/` AND `input/` recursively, ALL file extensions.
- Missing-document warning is a UI confirm dialog before generation; the printed letter still reflects the true tick state. No dialog on the download-only (no working directory) path.

---

### Task 1: Backend output-manifest walker + endpoint

**Files:**
- Create: `app-backend/src/utils/outputManifest.js`
- Create: `app-backend/src/utils/__tests__/outputManifest.test.js`
- Modify: `app-backend/src/routes/documents.js` (add import near line 7; add route inside `documentRoutes`, e.g. after the `/documents/list` handler ~line 173)

**Interfaces:**
- Produces: `collectOutputManifest(absWorkingDir: string): Array<{ name: string, relDir: string }>` — every file under `<absWorkingDir>/output` and `<absWorkingDir>/input`, recursively; `relDir` is the POSIX directory path relative to `absWorkingDir`. Missing/unreadable dirs are skipped (never throws for absence).
- Produces: `GET /documents/output-manifest?workingDirectory=<dir>` → `{ ok: true, files: [{ name, relDir }] }`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/utils/__tests__/outputManifest.test.js`:

```js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectOutputManifest } from '../outputManifest.js';

let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-'));
  fs.mkdirSync(path.join(root, 'output', 'general-plans'), { recursive: true });
  fs.mkdirSync(path.join(root, 'output', 'calculations'), { recursive: true });
  fs.mkdirSync(path.join(root, 'input'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output', 'general-plans', 'GENERAL-PLAN-Maglas.pdf'), 'x');
  fs.writeFileSync(path.join(root, 'output', 'calculations', 'Comprehensive_Latest.pdf'), 'x');
  fs.writeFileSync(path.join(root, 'input', 'beacon-receipt.jpg'), 'x');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('collects files from output/ and input/ recursively with all extensions', () => {
  const files = collectOutputManifest(root);
  const names = files.map(f => f.name).sort();
  expect(names).toEqual(['Comprehensive_Latest.pdf', 'GENERAL-PLAN-Maglas.pdf', 'beacon-receipt.jpg']);
  const gp = files.find(f => f.name === 'GENERAL-PLAN-Maglas.pdf');
  expect(gp.relDir).toBe('output/general-plans');
});

test('missing output/input folders yield an empty list, no throw', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-empty-'));
  expect(collectOutputManifest(empty)).toEqual([]);
  fs.rmSync(empty, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: FAIL — `Cannot find module '../outputManifest.js'`.

- [ ] **Step 3: Write the walker**

Create `app-backend/src/utils/outputManifest.js`:

```js
import fs from 'fs';
import path from 'path';

/**
 * Recursively collect every file under the project's output/ and input/ folders.
 * Returns [{ name, relDir }] where relDir is the POSIX directory path relative to
 * absWorkingDir. Missing or unreadable folders are skipped (never throws for absence).
 */
export function collectOutputManifest(absWorkingDir) {
  const out = [];
  for (const rootName of ['output', 'input']) {
    walk(path.join(absWorkingDir, rootName), absWorkingDir, out);
  }
  return out;
}

function walk(dir, base, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // missing or unreadable directory
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (entry.isFile()) {
      const relDir = path.relative(base, dir).split(path.sep).join('/');
      out.push({ name: entry.name, relDir });
    }
  }
}
```

- [ ] **Step 4: Run util test to verify it passes**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the endpoint**

In `app-backend/src/routes/documents.js`, add the import after line 7 (`import { writeFileWithRetry } ...`):

```js
import { collectOutputManifest } from '../utils/outputManifest.js'
```

Then, immediately after the `/documents/list` handler closes (after line ~173, before `/documents/save-pdf`), add:

```js
  // Recursive manifest of every file under output/ and input/ (all extensions).
  // Used by the comprehensive-record letter to tick enclosed documents that exist.
  fastify.get('/documents/output-manifest', async (request, reply) => {
    try {
      const { workingDirectory } = request.query
      if (!workingDirectory) {
        return reply.code(400).send({ ok: false, error: 'Working directory required' })
      }
      const absolutePath = resolveWorkingDirectory(workingDirectory)
      const files = collectOutputManifest(absolutePath)
      return { ok: true, files }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Failed to build output manifest' })
    }
  })
```

- [ ] **Step 6: Verify the whole documents test set still passes**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: PASS. (No existing Jest suite imports `documents.js` routes; the util test is the coverage. If `documents` matches any suite, run `... documents` too and expect PASS.)

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/utils/outputManifest.js app-backend/src/utils/__tests__/outputManifest.test.js app-backend/src/routes/documents.js
git commit -m "feat(documents): recursive /documents/output-manifest endpoint"
```

---

### Task 2: Frontend subject-wording util (`planDesignation.ts`)

**Files:**
- Create: `app-frontend/src/utils/planDesignation.ts`
- Create: `app-frontend/src/utils/__tests__/planDesignation.test.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (delete dead `formatDesignation` at lines 4907-4963)

**Interfaces:**
- Produces: `formatStandRanges(standNames: string[]): string` — e.g. `['207','208','340']` → `'207 - 208, 340'`.
- Produces: `extractTownship(surveyOf: string): string` — e.g. `'Stands 207-270 Maglas Township of Lot 3'` → `'Maglas Township'`.
- Produces: `buildPlanDesignation(standNames: string[], surveyOf: string): string` — e.g. `(['207',…,'270','340',…,'345'], 'Stands 207-270,340-345 Maglas Township')` → `'STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP'`. Returns `''` when there are no stands and no township.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/planDesignation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatStandRanges, extractTownship, buildPlanDesignation } from '../planDesignation';

describe('formatStandRanges', () => {
  it('compresses consecutive runs and keeps gaps as separate ranges', () => {
    const stands = ['207','208','209','340','341'];
    expect(formatStandRanges(stands)).toBe('207 - 209, 340 - 341');
  });
  it('renders a single stand without a dash', () => {
    expect(formatStandRanges(['12'])).toBe('12');
  });
  it('sorts numerics ascending and appends non-numeric names', () => {
    expect(formatStandRanges(['3','1','2','ALPHA'])).toBe('1 - 3, ALPHA');
  });
  it('returns empty string for no input', () => {
    expect(formatStandRanges([])).toBe('');
  });
});

describe('extractTownship', () => {
  it('strips a leading Stands N-M prefix', () => {
    expect(extractTownship('Stands 207-270 Maglas Township')).toBe('Maglas Township');
  });
  it('strips a trailing " of ..." clause', () => {
    expect(extractTownship('Stands 1-3 Maglas Township of Lot 3 of Subdivision B')).toBe('Maglas Township');
  });
  it('returns empty string for empty input', () => {
    expect(extractTownship('')).toBe('');
  });
});

describe('buildPlanDesignation', () => {
  it('builds the full uppercased plan wording', () => {
    const stands = ['207','208','209','270','340','341','342','343','344','345'];
    // note: 210..269 omitted for brevity; ranges reflect the given list
    expect(buildPlanDesignation(['207','208','209'], 'Stands 207-209 Maglas Township'))
      .toBe('STANDS 207 - 209 MAGLAS TOWNSHIP');
  });
  it('omits township when it cannot be extracted', () => {
    expect(buildPlanDesignation(['5','6'], '')).toBe('STANDS 5 - 6');
  });
  it('returns empty string when there is nothing to describe', () => {
    expect(buildPlanDesignation([], '')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-frontend`): `npx vitest run planDesignation`
Expected: FAIL — cannot resolve `../planDesignation`.

- [ ] **Step 3: Write the util**

Create `app-frontend/src/utils/planDesignation.ts`:

```ts
/**
 * Reproduces the backend general-plan title wording (pdfkitGeoPDF.js:
 * formatStandRanges + the township extraction in _buildTitleBlockTexts) so the
 * lodgement-letter subject reads identically to the general plan.
 */

/** Compress stand names into "a - b, c" ranges. Port of the backend formatStandRanges. */
export function formatStandRanges(standNames: string[]): string {
  if (!standNames || standNames.length === 0) return '';

  const numeric: number[] = [];
  const nonNumeric: string[] = [];
  for (const name of standNames) {
    const n = parseInt(name, 10);
    if (!isNaN(n) && String(n) === String(name).trim()) numeric.push(n);
    else if (name != null && String(name).trim() !== '') nonNumeric.push(String(name));
  }

  numeric.sort((a, b) => a - b);

  const parts: string[] = [];
  let i = 0;
  while (i < numeric.length) {
    let j = i;
    while (j + 1 < numeric.length && numeric[j + 1] === numeric[j] + 1) j++;
    parts.push(j === i ? String(numeric[i]) : `${numeric[i]} - ${numeric[j]}`);
    i = j + 1;
  }
  for (const name of nonNumeric) parts.push(name);
  return parts.join(', ');
}

/** Extract the township phrase from a surveyOf string. Mirrors _buildTitleBlockTexts. */
export function extractTownship(surveyOf: string): string {
  const raw = (surveyOf || '').trim();
  const withoutStandsPrefix = raw.replace(/^Stands?\s+[\d,\s\-–]+/i, '').trim();
  return withoutStandsPrefix.replace(/\s+of\s+.+$/i, '').trim();
}

/** Build the plan-title subject, e.g. "STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP". */
export function buildPlanDesignation(standNames: string[], surveyOf: string): string {
  const ranges = formatStandRanges(standNames);
  const township = extractTownship(surveyOf);
  let out: string;
  if (ranges) out = township ? `Stands ${ranges} ${township}` : `Stands ${ranges}`;
  else if (township) out = township;
  else return '';
  return out.toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app-frontend`): `npx vitest run planDesignation`
Expected: PASS (all cases).

- [ ] **Step 5: Delete the dead `formatDesignation` in SurveyPlanMapView**

In `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`, delete the entire unused function `function formatDesignation(projectInfo: any): string { … }` (currently lines 4907-4963, including the `// SI 727 Title Block Formatting Functions` comment on 4907). It has no callers (verified). Leave `calculateStandCount` (starts ~4965) and everything else intact.

- [ ] **Step 6: Verify the frontend still type-checks / tests pass**

Run (from `app-frontend`): `npx vitest run planDesignation`
Expected: PASS. (Deletion of dead code does not affect this suite; a full `npx vitest run` is optional here and covered again in Task 6.)

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/utils/planDesignation.ts app-frontend/src/utils/__tests__/planDesignation.test.ts "app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue"
git commit -m "feat(record): plan-designation util for letter subject; drop dead formatDesignation"
```

---

### Task 3: Lodgement-documents util (`lodgementDocuments.ts`)

**Files:**
- Create: `app-frontend/src/utils/lodgementDocuments.ts`
- Create: `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`

**Interfaces:**
- Produces: `export const LODGEMENT_DOCUMENTS: string[]` — the 11 canonical labels, in order.
- Produces: `export interface LodgementDocumentStatus { label: string; present: boolean }`.
- Produces: `resolveLodgementDocuments(fileNames: string[]): LodgementDocumentStatus[]` — one entry per label (same order), `present` true when any file name matches that label's keyword pattern.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LODGEMENT_DOCUMENTS, resolveLodgementDocuments } from '../lodgementDocuments';

describe('LODGEMENT_DOCUMENTS', () => {
  it('lists the 11 canonical items in order', () => {
    expect(LODGEMENT_DOCUMENTS).toEqual([
      'Field book',
      'Coordinate List and Calculations',
      'General Plan',
      'Working Plan',
      'Report on Survey',
      'Dispensation Certificate',
      'Checklist',
      'DSG Certificate (1/96)',
      'Permit/Instruction and layout',
      'Beacon receipt',
      'Searches',
    ]);
  });
});

describe('resolveLodgementDocuments', () => {
  it('ticks items whose keyword matches a file name, leaves others unticked', () => {
    const files = [
      'MAG1_FieldBook.pdf',
      'Comprehensive_Latest.pdf',      // coordinate/calc
      'GENERAL-PLAN-Maglas.pdf',
      'Report_on_Survey.pdf',
      'DSG-Certificate-1-96.pdf',
      'beacon-receipt.jpg',
    ];
    const result = resolveLodgementDocuments(files);
    const by = Object.fromEntries(result.map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(true);
    expect(by['Coordinate List and Calculations']).toBe(true);
    expect(by['General Plan']).toBe(true);
    expect(by['Report on Survey']).toBe(true);
    expect(by['DSG Certificate (1/96)']).toBe(true);
    expect(by['Beacon receipt']).toBe(true);
    // not provided:
    expect(by['Working Plan']).toBe(false);
    expect(by['Dispensation Certificate']).toBe(false);
    expect(by['Checklist']).toBe(false);
    expect(by['Permit/Instruction and layout']).toBe(false);
    expect(by['Searches']).toBe(false);
  });

  it('returns all-unticked for an empty file list, preserving order', () => {
    const result = resolveLodgementDocuments([]);
    expect(result.map(r => r.label)).toEqual(LODGEMENT_DOCUMENTS);
    expect(result.every(r => r.present === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-frontend`): `npx vitest run lodgementDocuments`
Expected: FAIL — cannot resolve `../lodgementDocuments`.

- [ ] **Step 3: Write the util**

Create `app-frontend/src/utils/lodgementDocuments.ts`:

```ts
/**
 * Canonical enclosed-documents list for the Surveyor-General lodgement letter,
 * plus keyword matching so each item can be ticked when a matching file exists in
 * the project output/input folders.
 */

export const LODGEMENT_DOCUMENTS: string[] = [
  'Field book',
  'Coordinate List and Calculations',
  'General Plan',
  'Working Plan',
  'Report on Survey',
  'Dispensation Certificate',
  'Checklist',
  'DSG Certificate (1/96)',
  'Permit/Instruction and layout',
  'Beacon receipt',
  'Searches',
];

export interface LodgementDocumentStatus {
  label: string;
  present: boolean;
}

/** Keyword pattern per label; a file whose name matches means the item is present. */
const DOCUMENT_PATTERNS: Record<string, RegExp> = {
  'Field book': /field.?book/i,
  'Coordinate List and Calculations': /coordinate|calc/i,
  'General Plan': /general.?plan/i,
  'Working Plan': /working.?plan/i,
  'Report on Survey': /report.*survey|survey.?record/i,
  'Dispensation Certificate': /dispensation/i,
  'Checklist': /check.?list/i,
  'DSG Certificate (1/96)': /dsg|1.?96/i,
  'Permit/Instruction and layout': /permit|instruction|layout/i,
  'Beacon receipt': /beacon.*receipt/i,
  'Searches': /search/i,
};

export function resolveLodgementDocuments(fileNames: string[]): LodgementDocumentStatus[] {
  const names = fileNames || [];
  return LODGEMENT_DOCUMENTS.map((label) => {
    const pattern = DOCUMENT_PATTERNS[label];
    const present = names.some((n) => pattern.test(n));
    return { label, present };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app-frontend`): `npx vitest run lodgementDocuments`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts
git commit -m "feat(record): lodgement-documents list + keyword existence matcher"
```

---

### Task 4: Manifest service + lodgement-check composable

**Files:**
- Modify: `app-frontend/src/services/documentStorage.ts` (add `getOutputManifest` after `getProjectDocuments`, ~line 120)
- Create: `app-frontend/src/composables/useLodgementCheck.ts`
- Create: `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts`

**Interfaces:**
- Consumes: `resolveLodgementDocuments`, `LodgementDocumentStatus` (Task 3).
- Produces: `getOutputManifest(workingDirectory: string): Promise<{ files: { name: string; relDir: string }[] }>` — never throws (returns `{ files: [] }` on error).
- Produces: `checkLodgementDocuments(workingDirectory?: string): Promise<{ documents: LodgementDocumentStatus[]; missing: string[] }>` — fetches the manifest (skips fetch when `workingDirectory` is falsy, treating everything as absent) and computes statuses + the list of missing labels.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/documentStorage', () => ({
  getOutputManifest: vi.fn(),
}));

import { getOutputManifest } from '@/services/documentStorage';
import { checkLodgementDocuments } from '../useLodgementCheck';

describe('checkLodgementDocuments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks items present from the manifest and lists the missing ones', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [{ name: 'GENERAL-PLAN-Maglas.pdf', relDir: 'output/general-plans' }],
    });
    const { documents, missing } = await checkLodgementDocuments('some/dir');
    expect(getOutputManifest).toHaveBeenCalledWith('some/dir');
    expect(documents.find(d => d.label === 'General Plan')?.present).toBe(true);
    expect(missing).toContain('Working Plan');
    expect(missing).not.toContain('General Plan');
  });

  it('treats everything as missing and skips the fetch when no working directory', async () => {
    const { documents, missing } = await checkLodgementDocuments(undefined);
    expect(getOutputManifest).not.toHaveBeenCalled();
    expect(missing.length).toBe(documents.length);
    expect(documents.every(d => !d.present)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-frontend`): `npx vitest run useLodgementCheck`
Expected: FAIL — cannot resolve `../useLodgementCheck` (and `getOutputManifest` not yet exported).

- [ ] **Step 3: Add `getOutputManifest` to the service**

In `app-frontend/src/services/documentStorage.ts`, after the `getProjectDocuments` function (ends ~line 120), add:

```ts
/**
 * Recursive manifest of every file under the project's output/ and input/ folders.
 * Never throws — returns an empty list on any error.
 */
export async function getOutputManifest(
  workingDirectory: string
): Promise<{ files: { name: string; relDir: string }[] }> {
  try {
    const response = await fetch(
      `${API_BASE}/documents/output-manifest?workingDirectory=${encodeURIComponent(workingDirectory)}`
    )
    if (!response.ok) throw new Error('Failed to fetch output manifest')
    const body = await response.json()
    return { files: Array.isArray(body.files) ? body.files : [] }
  } catch (error) {
    console.error('Error fetching output manifest:', error)
    return { files: [] }
  }
}
```

- [ ] **Step 4: Write the composable**

Create `app-frontend/src/composables/useLodgementCheck.ts`:

```ts
import { getOutputManifest } from '@/services/documentStorage'
import { resolveLodgementDocuments, type LodgementDocumentStatus } from '@/utils/lodgementDocuments'

/**
 * Determine which enclosed documents exist in the project output/input folders.
 * When no working directory is available (download-only path), skips the fetch and
 * reports every item as absent — callers should NOT show a warning dialog then.
 */
export async function checkLodgementDocuments(
  workingDirectory?: string
): Promise<{ documents: LodgementDocumentStatus[]; missing: string[] }> {
  let fileNames: string[] = []
  if (workingDirectory) {
    const manifest = await getOutputManifest(workingDirectory)
    fileNames = manifest.files.map((f) => f.name)
  }
  const documents = resolveLodgementDocuments(fileNames)
  const missing = documents.filter((d) => !d.present).map((d) => d.label)
  return { documents, missing }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `app-frontend`): `npx vitest run useLodgementCheck`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/services/documentStorage.ts app-frontend/src/composables/useLodgementCheck.ts app-frontend/src/composables/__tests__/useLodgementCheck.test.ts
git commit -m "feat(record): output-manifest service + lodgement-check composable"
```

---

### Task 5: Render tick boxes in the letter (`cover-page.ts`)

**Files:**
- Modify: `app-frontend/src/utils/cover-page.ts` (add `documents` to `CoverPageInfo` ~lines 8-31; import `lodgementDocuments`; replace the hardcoded list render at lines 162-181)
- Create: `app-frontend/src/utils/__tests__/coverPage.test.ts`

**Interfaces:**
- Consumes: `LODGEMENT_DOCUMENTS`, `LodgementDocumentStatus`, `resolveLodgementDocuments` (Task 3).
- Produces: `CoverPageInfo.documents?: LodgementDocumentStatus[]` (new optional field). When absent, the letter falls back to all-unticked boxes so existing callers keep working.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/coverPage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CoverPageGenerator, type CoverPageInfo } from '../cover-page';

const baseInfo: CoverPageInfo = {
  projectTitle: 'Maglas',
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 123',
  surveyDate: '2026-01-01',
  surveyType: 'STANDS 207 - 270 MAGLAS TOWNSHIP',
};

describe('CoverPageGenerator', () => {
  it('produces a non-empty PDF blob when documents are supplied', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage({
      ...baseInfo,
      documents: [
        { label: 'Field book', present: true },
        { label: 'General Plan', present: false },
      ],
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('still produces a PDF when documents are omitted (falls back to defaults)', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage(baseInfo);
    expect(blob.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-frontend`): `npx vitest run coverPage`
Expected: FAIL — `documents` is not an accepted property on `CoverPageInfo` (type error) / test file references the new field.

- [ ] **Step 3: Extend the interface and imports**

In `app-frontend/src/utils/cover-page.ts`, add the import at the top (after `import jsPDF from 'jspdf';`):

```ts
import { LODGEMENT_DOCUMENTS, type LodgementDocumentStatus } from './lodgementDocuments';
```

In the `CoverPageInfo` interface (after `pointsAnalyzed?: number;`, before the closing brace ~line 30), add:

```ts
  // Enclosed-documents tick state (present ⇒ ticked). Absent ⇒ all unticked.
  documents?: LodgementDocumentStatus[];
```

- [ ] **Step 4: Replace the hardcoded document list with tick boxes**

In `generateLetterPage`, replace the current block (lines 162-181, from `// Document List` through the `documents.forEach(...)` loop) with:

```ts
    // Document List with tick boxes (ticked when the record exists on disk)
    const docItems: LodgementDocumentStatus[] =
      info.documents && info.documents.length
        ? info.documents
        : LODGEMENT_DOCUMENTS.map((label) => ({ label, present: false }));

    const boxSize = 3.5;
    docItems.forEach((doc) => {
      const boxX = this.marginLeft + 5;
      const boxY = yPosition - boxSize; // align box bottom near the text baseline
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.rect(boxX, boxY, boxSize, boxSize);
      if (doc.present) {
        pdf.setLineWidth(0.5);
        // simple check mark inside the box
        pdf.line(boxX + 0.7, boxY + boxSize * 0.55, boxX + boxSize * 0.42, boxY + boxSize - 0.6);
        pdf.line(boxX + boxSize * 0.42, boxY + boxSize - 0.6, boxX + boxSize - 0.5, boxY + 0.5);
      }
      pdf.text(doc.label, this.marginLeft + 12, yPosition);
      yPosition += 6.5;
    });
```

(The surrounding `pdf.setFont('helvetica', 'normal')` before the list and the `yPosition += 10;` after it stay as they are.)

- [ ] **Step 5: Run test to verify it passes**

Run (from `app-frontend`): `npx vitest run coverPage`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/cover-page.ts app-frontend/src/utils/__tests__/coverPage.test.ts
git commit -m "feat(record): render enclosed-document tick boxes on the lodgement letter"
```

---

### Task 6: Wire both comprehensive-doc call sites

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` (script imports; `coverPageInfo` block ~6257-6273; insert pre-generation check)
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (script imports; `coverPageInfo` block ~4283-4298; insert pre-generation check after existing `workingDirectory` at ~4179)

**Interfaces:**
- Consumes: `buildPlanDesignation` (Task 2), `checkLodgementDocuments` (Task 4), and the extended `CoverPageInfo.documents` (Task 5).

This task has no unit test (it edits `.vue` orchestration); it ends with a manual verification step and a typecheck.

- [ ] **Step 1: Add imports in MapLibreAreaView**

In `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`, in the `<script setup>` import area (near the other `@/utils` / `@/composables` imports), add:

```ts
import { buildPlanDesignation } from '@/utils/planDesignation';
import { checkLodgementDocuments } from '@/composables/useLodgementCheck';
```

- [ ] **Step 2: Insert the pre-generation existence check in MapLibreAreaView**

In the function that builds `coverPageInfo` (the block starting at line 6257), immediately BEFORE `const coverPageInfo = {` (line 6257), insert:

```ts
    // Existence check for enclosed documents (ticks + optional warning).
    const recordWorkingDirectory = workflowState?.projectInfo?.workingDirectory;
    const { documents: lodgementDocs, missing: missingDocs } =
      await checkLodgementDocuments(recordWorkingDirectory);
    if (recordWorkingDirectory && missingDocs.length) {
      const proceed = window.confirm(
        `⚠ ${missingDocs.length} document(s) not found in the output folder:\n` +
        missingDocs.map((m) => `  • ${m}`).join('\n') +
        `\n\nGenerate anyway?`
      );
      if (!proceed) {
        console.log('[MapLibre] Comprehensive record generation cancelled by user (missing documents)');
        return;
      }
    }

    // Stand names for the subject line (exclude the Outside Figure parcel).
    const recordStandNames = computedParcels
      .map((p: any) => String(p.stand ?? p.designation ?? '').trim())
      .filter((s: string) => s && !s.toLowerCase().includes('outside figure'));
```

- [ ] **Step 3: Update the subject line and add `documents` in MapLibreAreaView**

In the same `coverPageInfo` object, change the `surveyType` line (6271) from:

```ts
      surveyType: `SURVEY OF ${surveyorInfo.projectTitle.toUpperCase()}`,
```

to:

```ts
      surveyType:
        buildPlanDesignation(recordStandNames, workflowState?.surveyorInfo?.surveyOf || '')
        || `SURVEY OF ${surveyorInfo.projectTitle.toUpperCase()}`,
      documents: lodgementDocs,
```

- [ ] **Step 4: Add imports in SurveyPlanMapView**

In `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` `<script setup>` imports, add:

```ts
import { buildPlanDesignation } from '@/utils/planDesignation';
import { checkLodgementDocuments } from '@/composables/useLodgementCheck';
```

- [ ] **Step 5: Insert the pre-generation existence check in SurveyPlanMapView**

The generate function already declares `const workingDirectory = (props.projectInfo as any).workingDirectory` at line 4179. Immediately BEFORE `const coverPageInfo: CoverPageInfo = {` (line 4283), insert:

```ts
    const { documents: lodgementDocs, missing: missingDocs } =
      await checkLodgementDocuments(workingDirectory);
    if (workingDirectory && missingDocs.length) {
      const proceed = window.confirm(
        `⚠ ${missingDocs.length} document(s) not found in the output folder:\n` +
        missingDocs.map((m) => `  • ${m}`).join('\n') +
        `\n\nGenerate anyway?`
      );
      if (!proceed) {
        console.log('[ComprehensivePDF] Generation cancelled by user (missing documents)');
        return;
      }
    }

    const recordStandNames = (computedParcels as any[])
      .map((p) => String(p.stand ?? p.designation ?? '').trim())
      .filter((s) => s && !s.toLowerCase().includes('outside figure'));
```

- [ ] **Step 6: Update the subject line and add `documents` in SurveyPlanMapView**

Change the `surveyType` line (4296) from:

```ts
      surveyType: props.projectInfo.surveyType || `SURVEY OF ${projectName.toUpperCase()}`,
```

to:

```ts
      surveyType:
        buildPlanDesignation(recordStandNames, (props.projectInfo as any).surveyOf || '')
        || props.projectInfo.surveyType
        || `SURVEY OF ${projectName.toUpperCase()}`,
      documents: lodgementDocs,
```

- [ ] **Step 7: Typecheck / run the frontend unit suites touched**

Run (from `app-frontend`):
```bash
npx vitest run planDesignation lodgementDocuments useLodgementCheck coverPage
```
Expected: PASS (all four suites). Then, if the project has a typecheck script, run `npm run build` (or `vue-tsc --noEmit`) and expect no new type errors from the edited views.

- [ ] **Step 8: Manual verification**

Start backend (`npm run dev` in `app-backend`) and frontend (`npm run dev` in `app-frontend`). Open a project with a general plan, generate the comprehensive record from BOTH the Area Computation view (MapLibre) and the Survey Plan view. Confirm:
1. The letter subject reads e.g. `RE: STANDS 207 - 270, 340 - 345 MAGLAS TOWNSHIP`, matching the general-plan title.
2. Enclosed items with a matching file in `output/`/`input/` are ticked; others are empty boxes.
3. Removing a file (e.g. the working plan) and regenerating triggers the "documents not found … Generate anyway?" dialog; Cancel aborts, OK proceeds.

- [ ] **Step 9: Commit**

```bash
git add "app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue" "app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue"
git commit -m "feat(record): letter subject matches general plan + existence-checked tick boxes"
```

---

## Self-Review

**Spec coverage:**
- Part 1 (subject matches general plan) → Task 2 (`planDesignation.ts`) + Task 6 (both call sites set `surveyType`). ✓
- Part 2 backend recursive manifest → Task 1. ✓
- Part 2 document list + keyword matching → Task 3. ✓
- Part 2 service + composable + missing-list → Task 4. ✓
- Part 2 tick-box rendering → Task 5. ✓
- Part 2 UI confirm dialog before generation, no dialog on download-only path → Task 6 (gated on `workingDirectory`). ✓
- Testing (planDesignation, lodgementDocuments, manifest) → Tasks 1-5 each ship tests. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `LodgementDocumentStatus { label; present }`, `resolveLodgementDocuments`, `getOutputManifest`, `checkLodgementDocuments`, `buildPlanDesignation`, `formatStandRanges`, `extractTownship`, and `CoverPageInfo.documents` are named identically across the tasks that define and consume them. ✓

## Notes / risks

- The subject reproduces the backend's *fallback* (all non-Outside-Figure stands, compressed), which equals the general plan whenever every stand sits inside the figure — the normal case. If a project deliberately places some stands outside the figure, the letter could list a wider range than the plan; if that shows up in practice, promote to the backend-endpoint approach (spec "Approaches considered").
- Line numbers are from the current working tree and may drift; anchor edits on the quoted code, not the numbers.

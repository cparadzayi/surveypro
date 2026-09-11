# Sheet-Aware Plan Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State on the Surveyor-General lodgement letter how many diagrams and general plans a record encloses, how many sheets the general plans run to, and which file types are present.

**Architecture:** Sheet counts are derived from the artifact — a multi-sheet general plan is one PDF with one page per sheet, so the backend reads PDF page counts when serving the output manifest. A new classifier names each plan file's role (`sheet` / `cad` / `summary`) and its sheet count; a per-family tally feeds multi-line letter rows. Nothing new is persisted.

**Tech Stack:** Vue 3 + TypeScript + Vitest (frontend), Fastify + Jest + `pdf-lib` (backend), jsPDF (the letter).

**Spec:** `docs/superpowers/specs/2026-09-11-sheet-aware-plan-counts-design.md`

## Global Constraints

- Branch off `main`. **Never push to `origin/main`** — that remote is an unrelated project. `main` tracks `origin/nov-alpha`; push only with `git push origin HEAD:nov-alpha` and only if asked.
- Frontend tests: `cd app-frontend && npx vitest run` (Vitest, `globals: true`, alias `@` → `./src`). Baseline is **615 passing, 0 failures**.
- Backend tests: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`. **Bare `npx jest` fails** — the backend is ESM.
- **Every task runs the FULL frontend suite before committing**, not just its own file. Two earlier tasks on this codebase shipped bugs by verifying too narrow a slice.
- **No `@vue/test-utils` and no `vue-tsc` in this repo.** Never write a component-mounting test. View logic goes in a plain `.ts` module and is tested there; `npm run build` compiles `.vue` but does NOT type-check it.
- `utils/` must never import from `views/`.
- **A diagram is always one sheet** (domain rule, confirmed by the surveyor). Never measure a diagram's page count; a project can hold 60 diagrams.
- **The `-summary.pdf` is never lodged** — excluded from counts, from file types, and from the letter.
- **An unknown sheet count omits the sheets clause; it never guesses "1 sheet".** Absent beats wrong on a document lodged with the Surveyor-General.
- Exact copy multipliers: **diagrams 3 copies per plan, general plans 1**.

**A design detail the spec did not resolve:** `collectOutputManifest` is **synchronous** (`fs.readdirSync`), but `pdf-lib`'s `PDFDocument.load` is async. Page counts therefore CANNOT go inside the existing walker. Task 1 adds a separate async enrichment pass that the route composes, leaving the walker a pure synchronous directory scan and its existing tests untouched.

## File Structure

| File | Responsibility |
|---|---|
| `app-backend/src/utils/pdfPageCount.js` *(new)* | Cached, failure-tolerant PDF page-count reader. Isolated so the manifest walker stays free of PDF concerns |
| `app-backend/src/utils/outputManifest.js` *(modify)* | Gains `attachPageCounts` — an async pass over an already-collected manifest. The sync `collectOutputManifest` is unchanged |
| `app-backend/src/routes/documents.js` *(modify)* | Composes walk + enrich |
| `app-frontend/src/services/documentStorage.ts` *(modify)* | Manifest return type gains `pageCount?` |
| `app-frontend/src/utils/planFileClassifier.ts` *(new)* | Owns `ManifestFile`, `classifyPlanFile`, `tallyPlanFamily`. The one place that decides what a plan file is |
| `app-frontend/src/utils/letterRowLayout.ts` *(new)* | Letter row/detail heights and the page-break predicate — pure, so it is testable without rendering a PDF |
| `app-frontend/src/utils/lodgementDocuments.ts` *(modify)* | Re-exports `ManifestFile`; builds `detail` lines from the tally; migrates `verifyAgainstManifest` off the deleted boolean |
| `app-frontend/src/utils/cover-page.ts` *(modify)* | Draws detail lines and applies the page-break guard |
| `app-frontend/src/composables/useLodgementCheck.ts` *(modify)* | Passes the unknown-sheet count into the warnings |

---

### Task 1: The manifest learns sheet counts

**Files:**
- Create: `app-backend/src/utils/pdfPageCount.js`
- Modify: `app-backend/src/utils/outputManifest.js`
- Modify: `app-backend/src/routes/documents.js` (the `/documents/output-manifest` handler, ~line 178)
- Modify: `app-frontend/src/services/documentStorage.ts` (~line 132)
- Test: `app-backend/src/utils/__tests__/outputManifest.test.js` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `readPdfPageCount(absPath, mtimeMs, size): Promise<number | null>` from `pdfPageCount.js`; `attachPageCounts(absWorkingDir, files): Promise<Array>` from `outputManifest.js`; every manifest entry may now carry `pageCount: number`.

- [ ] **Step 1: Write the failing test**

Append to `app-backend/src/utils/__tests__/outputManifest.test.js`. Note the existing file already has a `beforeAll` building a fixture tree at `root`; add this new `describe` at the end, with its own fixture so it cannot disturb the existing tests:

```js
import { attachPageCounts } from '../outputManifest.js';
import { PDFDocument } from 'pdf-lib';

describe('attachPageCounts', () => {
  let pcRoot;

  beforeAll(async () => {
    pcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pagecount-'));
    fs.mkdirSync(path.join(pcRoot, 'output', 'general-plans'), { recursive: true });
    fs.mkdirSync(path.join(pcRoot, 'output', 'diagrams'), { recursive: true });

    // A real 3-page PDF stands in for a 3-sheet general plan.
    const gp = await PDFDocument.create();
    gp.addPage(); gp.addPage(); gp.addPage();
    fs.writeFileSync(
      path.join(pcRoot, 'output', 'general-plans', 'general-undeveloped-MAGLAS.pdf'),
      await gp.save(),
    );

    // Its DXF twin and statistics summary must never be counted.
    fs.writeFileSync(path.join(pcRoot, 'output', 'general-plans', 'general-undeveloped-MAGLAS.dxf'), 'DXF');
    const summary = await PDFDocument.create();
    summary.addPage();
    fs.writeFileSync(
      path.join(pcRoot, 'output', 'general-plans', 'general-undeveloped-MAGLAS-summary.pdf'),
      await summary.save(),
    );

    // A diagram is always one sheet by rule, so it is never opened.
    const diagram = await PDFDocument.create();
    diagram.addPage();
    fs.writeFileSync(path.join(pcRoot, 'output', 'diagrams', 'diagram-STAND_207.pdf'), await diagram.save());

    // A deliberately corrupt PDF must not break the enrichment.
    fs.writeFileSync(path.join(pcRoot, 'output', 'general-plans', 'general-broken.pdf'), 'not a pdf at all');
  });

  afterAll(() => {
    fs.rmSync(pcRoot, { recursive: true, force: true });
  });

  const by = (files, name) => files.find(f => f.name === name);

  test('reads the real page count for a general-plan PDF', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    expect(by(files, 'general-undeveloped-MAGLAS.pdf').pageCount).toBe(3);
  });

  test('never opens a diagram PDF — a diagram is one sheet by rule', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    expect(by(files, 'diagram-STAND_207.pdf').pageCount).toBeUndefined();
  });

  test('ignores the DXF twin and the statistics summary', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    expect(by(files, 'general-undeveloped-MAGLAS.dxf').pageCount).toBeUndefined();
    expect(by(files, 'general-undeveloped-MAGLAS-summary.pdf').pageCount).toBeUndefined();
  });

  test('keeps a corrupt PDF in the manifest, just without a page count', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    const broken = by(files, 'general-broken.pdf');
    expect(broken).toBeDefined();
    expect(broken.pageCount).toBeUndefined();
  });

  test('returns the same array instance it was given', async () => {
    const input = collectOutputManifest(pcRoot);
    const output = await attachPageCounts(pcRoot, input);
    expect(output).toBe(input);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: FAIL — `attachPageCounts is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `app-backend/src/utils/pdfPageCount.js`:

```js
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

/**
 * Page counts keyed by path + mtime + size. A regenerated plan changes its mtime, which
 * invalidates the entry naturally, so nothing has to be evicted by hand.
 */
const cache = new Map();

/**
 * Pages in a PDF, or null when it cannot be read.
 *
 * For a survey plan this IS the sheet count: _mergePDFBuffers in pdfkitGeoPDF.js merges one
 * single-page document per sheet, so pages and sheets are the same number by construction.
 * Returning null rather than a guess matters — the letter omits its sheet clause when the
 * count is unknown instead of under-reporting a multi-sheet plan to the Surveyor-General.
 */
export async function readPdfPageCount(absPath, mtimeMs, size) {
  const key = `${absPath}:${mtimeMs}:${size}`;
  if (cache.has(key)) return cache.get(key);

  let pageCount = null;
  try {
    const bytes = fs.readFileSync(absPath);
    // ignoreEncryption lets a permissions-flagged (but readable) plan still report its pages;
    // updateMetadata:false keeps this a pure read.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch {
    // Corrupt, truncated, locked, or not a PDF at all. Unknown, never fatal.
    pageCount = null;
  }

  cache.set(key, pageCount);
  return pageCount;
}
```

In `app-backend/src/utils/outputManifest.js`, add the imports at the top:

```js
import { readPdfPageCount } from './pdfPageCount.js';
```

and append this function (leave `collectOutputManifest` and `walk` exactly as they are — the walker stays synchronous and its existing tests must keep passing unchanged):

```js
/** Folder whose PDFs carry a meaningful sheet count. Matched as a path SEGMENT. */
const SHEET_COUNTED_FOLDER = 'general-plans';

/**
 * Fill in `pageCount` for the manifest entries where pages mean sheets.
 *
 * Separate from the walk because `pdf-lib` is async while `collectOutputManifest` is
 * synchronous by design. Mutates and returns the array it is given.
 *
 * Scoped to general-plan PDFs only: a diagram is always one sheet (domain rule) and a project
 * can hold 60 diagrams, so opening each to learn what the rule already states would be the
 * only expensive part of building a manifest. General plans number one to three.
 */
export async function attachPageCounts(absWorkingDir, files) {
  const list = files || [];
  for (const file of list) {
    const segments = (file.relDir || '').split('/').filter(Boolean);
    if (!segments.includes(SHEET_COUNTED_FOLDER)) continue;
    if (!/\.pdf$/i.test(file.name)) continue;
    if (/-summary\.pdf$/i.test(file.name)) continue;

    const abs = path.join(absWorkingDir, ...segments, file.name);
    let size = 0;
    try {
      size = fs.statSync(abs).size;
    } catch {
      continue; // vanished between walk and enrich; leave it uncounted
    }
    const pageCount = await readPdfPageCount(abs, file.mtimeMs ?? 0, size);
    if (typeof pageCount === 'number') file.pageCount = pageCount;
  }
  return list;
}
```

In `app-backend/src/routes/documents.js`, change the `/documents/output-manifest` handler to compose the two. Replace:

```js
      const files = collectOutputManifest(absolutePath)
      return { ok: true, files }
```

with:

```js
      const files = await attachPageCounts(absolutePath, collectOutputManifest(absolutePath))
      return { ok: true, files }
```

and widen its import:

```js
import { collectOutputManifest, attachPageCounts } from '../utils/outputManifest.js'
```

In `app-frontend/src/services/documentStorage.ts`, widen the return type:

```ts
export async function getOutputManifest(
  workingDirectory: string
): Promise<{ files: { name: string; relDir: string; mtimeMs?: number; pageCount?: number }[] }> {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: PASS — the 3 pre-existing tests plus 5 new ones.

Then confirm the frontend still compiles and passes:
Run: `cd app-frontend && npx vitest run`
Expected: PASS — 615.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/utils/pdfPageCount.js app-backend/src/utils/outputManifest.js app-backend/src/utils/__tests__/outputManifest.test.js app-backend/src/routes/documents.js app-frontend/src/services/documentStorage.ts
git commit -m "feat(manifest): read sheet counts from general-plan PDFs"
```

---

### Task 2: The plan-file classifier and per-family tally

**Files:**
- Create: `app-frontend/src/utils/planFileClassifier.ts`
- Test: `app-frontend/src/utils/__tests__/planFileClassifier.test.ts`

**Interfaces:**
- Consumes: `pageCount?: number` on manifest entries (Task 1).
- Produces: `interface ManifestFile { name: string; relDir: string; mtimeMs?: number; pageCount?: number }`; `type PlanFileFamily = 'diagram' | 'general'`; `type PlanFileRole = 'sheet' | 'cad' | 'summary'`; `interface ClassifiedPlanFile { role: PlanFileRole; sheets: number | null }`; `classifyPlanFile(file: ManifestFile, family: PlanFileFamily): ClassifiedPlanFile | null`; `interface PlanFamilyTally { plans: number; sheets: number | null; copies: number; dxf: number }`; `tallyPlanFamily(files: ManifestFile[], family: PlanFileFamily): PlanFamilyTally`.

**Deliberate deviation from the spec's test plan:** the spec's Part 7 names a separate
`utils/__tests__/planFamilyTally.test.ts`. The tally tests live in
`planFileClassifier.test.ts` instead, because `tallyPlanFamily` ships in the same module as
`classifyPlanFile` and is meaningless without it — two test files for one module would split
coverage of one unit. All the cases the spec listed for that file are present here (the worked
example, `sheets: null` when a count is missing, DXF-only yielding `plans: 0`). Do NOT create
`planFamilyTally.test.ts`.

**Note on `ManifestFile`:** this task MOVES the interface here from `lodgementDocuments.ts:55`. Task 3 re-exports it from there so existing importers (`useLodgementCheck.ts:7`, `lodgementDocuments.test.ts:2`) keep working untouched. Moving it is what avoids a circular import: `lodgementDocuments` will import this module, so this module must not import `lodgementDocuments`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/planFileClassifier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  classifyPlanFile,
  tallyPlanFamily,
  type ManifestFile,
} from '../planFileClassifier';

const f = (name: string, pageCount?: number): ManifestFile =>
  pageCount === undefined
    ? { name, relDir: 'output/general-plans' }
    : { name, relDir: 'output/general-plans', pageCount };

describe('classifyPlanFile', () => {
  it('reads a general plan PDF sheet count from its page count', () => {
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS.pdf', 3), 'general')).toEqual({
      role: 'sheet',
      sheets: 3,
    });
  });

  it('reports an unknown general plan sheet count as null, never as 1', () => {
    // Guessing 1 would silently under-report a 3-sheet plan to the Surveyor-General.
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS.pdf'), 'general')).toEqual({
      role: 'sheet',
      sheets: null,
    });
  });

  it('treats a diagram as exactly one sheet, ignoring any page count', () => {
    expect(classifyPlanFile(f('diagram-STAND_207.pdf'), 'diagram')).toEqual({
      role: 'sheet',
      sheets: 1,
    });
    expect(classifyPlanFile(f('diagram-STAND_207.pdf', 7), 'diagram')).toEqual({
      role: 'sheet',
      sheets: 1,
    });
  });

  it('classifies a DXF as cad, carrying no sheets', () => {
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS.dxf'), 'general')).toEqual({
      role: 'cad',
      sheets: 0,
    });
  });

  it('classifies the statistics summary as summary, never as a sheet', () => {
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS-summary.pdf'), 'general')).toEqual({
      role: 'summary',
      sheets: 0,
    });
  });

  it('returns null for anything that is not a plan product', () => {
    expect(classifyPlanFile(f('beacon-receipt-scan.jpg'), 'general')).toBeNull();
    expect(classifyPlanFile(f('notes.txt'), 'diagram')).toBeNull();
  });
});

describe('tallyPlanFamily', () => {
  it('tallies the worked example for general plans', () => {
    // Two plans, one of three sheets and one of one, each with a DXF twin and a summary.
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 3),
      f('general-undeveloped-MAGLAS.dxf'),
      f('general-undeveloped-MAGLAS-summary.pdf'),
      f('general-developed-MAGLAS.pdf', 1),
      f('general-developed-MAGLAS.dxf'),
    ];
    expect(tallyPlanFamily(files, 'general')).toEqual({
      plans: 2,
      sheets: 4,
      copies: 2,
      dxf: 2,
    });
  });

  it('tallies three diagrams at three copies each', () => {
    const files = [
      f('diagram-STAND_207.pdf'),
      f('diagram-STAND_207.dxf'),
      f('diagram-STAND_208.pdf'),
      f('diagram-STAND_208.dxf'),
      f('diagram-STAND_209.pdf'),
      f('diagram-STAND_209.dxf'),
    ];
    expect(tallyPlanFamily(files, 'diagram')).toEqual({
      plans: 3,
      sheets: 3,
      copies: 9,
      dxf: 3,
    });
  });

  it('reports sheets as null when ANY contributing plan count is unknown', () => {
    // A partial sum would read as authoritative while being short.
    const files = [f('general-a.pdf', 3), f('general-b.pdf')];
    expect(tallyPlanFamily(files, 'general').sheets).toBeNull();
    expect(tallyPlanFamily(files, 'general').plans).toBe(2);
  });

  it('counts no plans when only a DXF is present', () => {
    expect(tallyPlanFamily([f('general-undeveloped-MAGLAS.dxf')], 'general')).toEqual({
      plans: 0,
      sheets: 0,
      copies: 0,
      dxf: 1,
    });
  });

  it('returns an all-zero tally for no files', () => {
    expect(tallyPlanFamily([], 'general')).toEqual({ plans: 0, sheets: 0, copies: 0, dxf: 0 });
  });

  it('does not count the summary as a plan', () => {
    const files = [f('general-a-summary.pdf')];
    expect(tallyPlanFamily(files, 'general').plans).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/planFileClassifier.test.ts`
Expected: FAIL — "Failed to resolve import ../planFileClassifier".

- [ ] **Step 3: Write minimal implementation**

Create `app-frontend/src/utils/planFileClassifier.ts`:

```ts
/**
 * What a file sitting in a plan output folder actually is, and how many sheets it carries.
 *
 * One generation writes up to three files into one folder — `<base>.pdf`, `<base>.dxf` and
 * `<base>-summary.pdf` — so "count the files" is never the same as "count the plans". This
 * module is the single place that decides which is which.
 */

/** A file from the project output/input manifest. relDir is POSIX, e.g. "output/field-book". */
export interface ManifestFile {
  name: string;
  relDir: string;
  /** Last-modified epoch ms, for surfacing stale outputs. Absent on older callers. */
  mtimeMs?: number;
  /**
   * PDF pages, which for a survey plan IS its sheet count — the backend merges one
   * single-page document per sheet. Present only for general-plan PDFs; absent when the
   * file was never opened or could not be read.
   */
  pageCount?: number;
}

/** The two plan families whose contents the letter counts. Working plans are not counted. */
export type PlanFileFamily = 'diagram' | 'general';

export type PlanFileRole = 'sheet' | 'cad' | 'summary';

export interface ClassifiedPlanFile {
  role: PlanFileRole;
  /** Sheets carried. Meaningful only for role 'sheet'; null when undeterminable. */
  sheets: number | null;
}

/** Copies of each plan physically lodged with the Surveyor-General. */
const COPIES_PER_PLAN: Record<PlanFileFamily, number> = {
  diagram: 3,
  general: 1,
};

/**
 * Classify one file. Returns null when it is not a plan product at all (a .jpg scan, a note).
 *
 * A diagram is ALWAYS one sheet — a domain rule, not a measurement. The letter never prints a
 * diagram sheet count, so this assumption cannot produce a wrong number; it can only omit one
 * that was never wanted. It is what lets a 60-diagram project be tallied without opening 60 PDFs.
 */
export function classifyPlanFile(
  file: ManifestFile,
  family: PlanFileFamily,
): ClassifiedPlanFile | null {
  const name = file?.name || '';

  if (/\.dxf$/i.test(name)) return { role: 'cad', sheets: 0 };
  // Checked before the general .pdf case: the summary is a PDF, and is never lodged.
  if (/-summary\.pdf$/i.test(name)) return { role: 'summary', sheets: 0 };
  if (/\.pdf$/i.test(name)) {
    const sheets = family === 'diagram'
      ? 1
      : (typeof file.pageCount === 'number' ? file.pageCount : null);
    return { role: 'sheet', sheets };
  }
  return null;
}

export interface PlanFamilyTally {
  /** Files with role 'sheet' — i.e. distinct lodged plans. */
  plans: number;
  /** Sheets summed across them. null if ANY contributing plan's count is unknown. */
  sheets: number | null;
  /** plans x copies-per-plan. */
  copies: number;
  /** Files with role 'cad'. */
  dxf: number;
}

/**
 * Tally one family's files.
 *
 * Receives the already folder-and-keyword-filtered files for a letter row, not the whole
 * manifest — deciding which folder a row owns stays in DOCUMENT_RULES where it already lives.
 */
export function tallyPlanFamily(
  files: ManifestFile[],
  family: PlanFileFamily,
): PlanFamilyTally {
  let plans = 0;
  let dxf = 0;
  let sheets: number | null = 0;

  for (const file of files || []) {
    const classified = classifyPlanFile(file, family);
    if (!classified) continue;
    if (classified.role === 'cad') {
      dxf++;
      continue;
    }
    if (classified.role !== 'sheet') continue;
    plans++;
    // Once unknown, stay unknown: a partial sum would read as authoritative while being short.
    if (sheets !== null) {
      sheets = classified.sheets === null ? null : sheets + classified.sheets;
    }
  }

  return { plans, sheets, copies: plans * COPIES_PER_PLAN[family], dxf };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/planFileClassifier.test.ts`
Expected: PASS — 13 tests.

Then the full suite: `cd app-frontend && npx vitest run`
Expected: PASS — 628 (615 + 13).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/planFileClassifier.ts app-frontend/src/utils/__tests__/planFileClassifier.test.ts
git commit -m "feat(letter): classify plan files by role and tally sheets per family"
```

---

### Task 3: Detail lines, and retiring the boolean

**Files:**
- Modify: `app-frontend/src/utils/lodgementDocuments.ts`
- Test: `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` (extend)

**Interfaces:**
- Consumes: `classifyPlanFile`, `tallyPlanFamily`, `ManifestFile`, `PlanFileFamily`, `PlanFamilyTally` (Task 2).
- Produces: `LodgementDocumentStatus` gains `detail?: string[]`; `planRowDetail(family: PlanFileFamily, tally: PlanFamilyTally): string[]` (exported for testing); `countUnknownSheetPlans(files: ManifestFile[]): number`; `ManifestFile` re-exported from here.

**Three migrations this task must complete together** — leaving any one undone breaks the build:
1. `ManifestFile` (line ~55) is DELETED here and re-exported from `planFileClassifier`.
2. `isLodgeablePlanFile` (line ~93) is DELETED. It has TWO callers: `resolveLodgementDocuments` (~line 136) and `verifyAgainstManifest` (~line 195). Both must move to the classifier.
3. `FAMILY_FOLDERS` (line ~168) is typed `Array<{ family: PlanFamily; folder: string }>`. `PlanFamily` includes `'working'`, which `classifyPlanFile` does not accept. Narrow the annotation to `Array<{ family: PlanFileFamily; folder: string }>`.

- [ ] **Step 1: Write the failing test**

Extend the import at the top of `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`:

```ts
import { LODGEMENT_DOCUMENTS, lodgementDocumentsFor, resolveLodgementDocuments, markRecordSectionsPresent, verifyAgainstManifest, buildLodgementWarnings, planRowDetail, countUnknownSheetPlans, type ManifestFile } from '../lodgementDocuments';
```

Append these blocks to the end of the file:

```ts
const gp = (name: string, pageCount?: number): ManifestFile =>
  pageCount === undefined
    ? { name, relDir: 'output/general-plans' }
    : { name, relDir: 'output/general-plans', pageCount };

const dg = (name: string): ManifestFile => ({ name, relDir: 'output/diagrams' });

describe('planRowDetail', () => {
  it('states diagrams and their copies, never their sheets', () => {
    expect(planRowDetail('diagram', { plans: 3, sheets: 3, copies: 9, dxf: 3 })).toEqual([
      '3 diagrams, 9 copies',
      'PDF 3 · DXF 3',
    ]);
  });

  it('states general plans and their sheet total', () => {
    expect(planRowDetail('general', { plans: 2, sheets: 4, copies: 2, dxf: 2 })).toEqual([
      '2 general plans, 4 sheets',
      'PDF 2 · DXF 2',
    ]);
  });

  it('drops the sheets clause entirely when the count is unknown', () => {
    expect(planRowDetail('general', { plans: 2, sheets: null, copies: 2, dxf: 2 })).toEqual([
      '2 general plans',
      'PDF 2 · DXF 2',
    ]);
  });

  it('uses singular nouns for one of each', () => {
    expect(planRowDetail('general', { plans: 1, sheets: 1, copies: 1, dxf: 1 })).toEqual([
      '1 general plan, 1 sheet',
      'PDF 1 · DXF 1',
    ]);
    expect(planRowDetail('diagram', { plans: 1, sheets: 1, copies: 3, dxf: 0 })).toEqual([
      '1 diagram, 3 copies',
      'PDF 1',
    ]);
  });

  it('omits the DXF term when there is no DXF', () => {
    expect(planRowDetail('general', { plans: 1, sheets: 2, copies: 1, dxf: 0 })[1]).toBe('PDF 1');
  });

  it('returns no detail lines at all when nothing is enclosed', () => {
    expect(planRowDetail('general', { plans: 0, sheets: 0, copies: 0, dxf: 1 })).toEqual([]);
  });
});

describe('resolveLodgementDocuments — detail lines', () => {
  it('attaches detail to both plan rows and to no other row', () => {
    const files = [
      gp('general-undeveloped-MAGLAS.pdf', 3),
      gp('general-undeveloped-MAGLAS.dxf'),
      dg('diagram-STAND_207.pdf'),
      f('MAG1_FieldBook.pdf', 'output/field-book'),
    ];
    const rows = resolveLodgementDocuments(files);
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r]));
    expect(byLabel['General Plan'].detail).toEqual(['1 general plan, 3 sheets', 'PDF 1 · DXF 1']);
    expect(byLabel['Diagram'].detail).toEqual(['1 diagram, 3 copies', 'PDF 1']);
    expect(byLabel['Field book'].detail).toBeUndefined();
  });

  it('leaves an unticked plan row without detail lines', () => {
    const rows = resolveLodgementDocuments([gp('general-undeveloped-MAGLAS.dxf')]);
    const row = rows.find(r => r.label === 'General Plan')!;
    expect(row.present).toBe(false);
    expect(row.detail ?? []).toEqual([]);
  });

  it('keeps the plural display label without a count in it', () => {
    // The count moved to the detail lines; the label is now just the noun.
    const rows = resolveLodgementDocuments([dg('diagram-A.pdf'), dg('diagram-B.pdf')]);
    expect(rows.find(r => r.label === 'Diagram')!.displayLabel).toBe('Diagrams');
  });
});

describe('countUnknownSheetPlans', () => {
  it('counts general plans whose sheet count could not be read', () => {
    const files = [gp('general-a.pdf', 3), gp('general-b.pdf'), gp('general-c.pdf')];
    expect(countUnknownSheetPlans(files)).toBe(2);
  });

  it('ignores DXFs, summaries, and diagrams', () => {
    const files = [gp('general-a.dxf'), gp('general-a-summary.pdf'), dg('diagram-STAND_207.pdf')];
    expect(countUnknownSheetPlans(files)).toBe(0);
  });

  it('is zero when every general plan reports its pages', () => {
    expect(countUnknownSheetPlans([gp('general-a.pdf', 2)])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: FAIL — `planRowDetail is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `app-frontend/src/utils/lodgementDocuments.ts`:

**(a)** Replace the `ManifestFile` interface declaration (~line 55) with a re-export placed near the other imports, so existing importers are unaffected:

```ts
import {
  classifyPlanFile,
  tallyPlanFamily,
  type ManifestFile,
  type PlanFileFamily,
  type PlanFamilyTally,
} from './planFileClassifier';

// Re-exported so existing importers (useLodgementCheck, tests) need no change. The interface
// now lives with the classifier, which is what avoids a circular import between the two.
export type { ManifestFile };
```

**(b)** Add `detail` to `LodgementDocumentStatus` (~line 46). It MUST be optional — `coverPage.test.ts` constructs rows as `{ label, present }`:

```ts
export interface LodgementDocumentStatus {
  /** Canonical identity. Never carries a count — consumers match on this. */
  label: string;
  /** What the letter prints on the row's own line. */
  displayLabel: string;
  present: boolean;
  /** Extra lines drawn under the row without a tick box. Absent for most rows. */
  detail?: string[];
}
```

**(c)** Delete `COPIES_PER_FILE` (~line 70), `enclosedLabel` (~line 81) and `isLodgeablePlanFile` (~line 93). Replace them with the row→family map and the detail builder:

```ts
/** Which letter rows are counted plan rows, and which family each one owns. */
const ROW_FAMILY: Record<string, PlanFileFamily> = {
  'Diagram': 'diagram',
  'General Plan': 'general',
};

/** Plural display label for a counted row. The count itself now lives in the detail lines. */
function planRowLabel(label: string, plans: number): string {
  if (plans <= 1) return label;
  return label === 'Diagram' ? 'Diagrams' : 'General Plans';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The lines printed under a counted plan row.
 *
 * Diagrams state copies and never sheets — a diagram is always a single sheet. General plans
 * state sheets, and DROP the clause when the count is unknown rather than guessing, because an
 * under-reported sheet total on a document lodged with the Surveyor-General is worse than none.
 */
export function planRowDetail(family: PlanFileFamily, tally: PlanFamilyTally): string[] {
  if (tally.plans === 0) return [];

  const first = family === 'diagram'
    ? `${plural(tally.plans, 'diagram', 'diagrams')}, ${plural(tally.copies, 'copy', 'copies')}`
    : `${plural(tally.plans, 'general plan', 'general plans')}` +
      (tally.sheets === null ? '' : `, ${plural(tally.sheets, 'sheet', 'sheets')}`);

  const types = [`PDF ${tally.plans}`];
  if (tally.dxf > 0) types.push(`DXF ${tally.dxf}`);

  return [first, types.join(' · ')];
}
```

**(d)** Replace the body of `resolveLodgementDocuments` (~line 118) so counted rows come from the tally:

```ts
export function resolveLodgementDocuments(
  files: ManifestFile[],
  composition?: RecordComposition | null
): LodgementDocumentStatus[] {
  const list = files || [];
  return lodgementDocumentsFor(composition).map((label) => {
    const rule = DOCUMENT_RULES[label];
    const matches = list.filter((file) => {
      if (!rule || !rule.keyword.test(file.name)) return false;
      const segments = (file.relDir || '').split('/').filter(Boolean);
      if (rule.kind === 'external') return segments[0] === 'input';
      return segments.some((seg) => rule.folders.includes(seg));
    });

    const family = ROW_FAMILY[label];
    if (!family) {
      // Every other row is unchanged: presence is simply "a matching file exists". External
      // items are legitimately .jpg scans, so no PDF filter may be applied to them.
      return { label, displayLabel: label, present: matches.length > 0 };
    }

    const tally = tallyPlanFamily(matches, family);
    return {
      label,
      displayLabel: planRowLabel(label, tally.plans),
      present: tally.plans > 0,
      detail: planRowDetail(family, tally),
    };
  });
}
```

**(e)** Narrow `FAMILY_FOLDERS` (~line 168) and migrate `verifyAgainstManifest`'s filter (~line 195):

```ts
const FAMILY_FOLDERS: Array<{ family: PlanFileFamily; folder: string }> = [
  { family: 'diagram', folder: 'diagrams' },
  { family: 'general', folder: 'general-plans' },
];
```

and inside the loop, replace the `isLodgeablePlanFile` line with:

```ts
    // "Declared but never generated" must look only at lodged plan sheets: a folder holding
    // nothing but a stray .dxf (or a -summary.pdf) encloses no plan at all. The opposite
    // direction deliberately keeps ALL files — a leftover DXF in a family this record does
    // not declare is still worth showing the surveyor.
    const lodgeable = found.filter((file) => classifyPlanFile(file, family)?.role === 'sheet');
```

**(f)** Append the unknown-sheet counter, which Task 6 feeds to the warnings:

```ts
/**
 * General plans whose sheet count could not be read, so the letter's omission of a sheet
 * total can be explained to the surveyor rather than silently noticed.
 */
export function countUnknownSheetPlans(files: ManifestFile[]): number {
  return (files || []).filter((file) => {
    const segments = (file.relDir || '').split('/').filter(Boolean);
    if (!segments.includes('general-plans')) return false;
    const classified = classifyPlanFile(file, 'general');
    return classified?.role === 'sheet' && classified.sheets === null;
  }).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: PASS.

**Expect to update pre-existing assertions in this file.** Counted-row `displayLabel` values lose their embedded counts — `'General Plan (1)'` becomes `'General Plan'`, `'Diagrams (9)'` becomes `'Diagrams'`, `'Diagram (3)'` becomes `'Diagram'`. That is the point of this task, not a regression; update each such assertion to the new label and, where the count mattered, assert it on `detail` instead.

Then the full suite: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts
git commit -m "feat(letter): build plan rows from the tally, retire the lodgeable-file boolean"
```

---

### Task 4: The letter's row layout arithmetic

**Files:**
- Create: `app-frontend/src/utils/letterRowLayout.ts`
- Test: `app-frontend/src/utils/__tests__/letterRowLayout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ROW_HEIGHT_MM = 6.5`, `DETAIL_LINE_HEIGHT_MM = 5`, `RESERVED_CLOSING_MM = 45`, `DETAIL_FONT_SIZE = 9`, `ROW_FONT_SIZE = 11`; `rowBlockHeight(detailLineCount: number): number`; `rowNeedsPageBreak(yPosition: number, blockHeight: number, pageHeight: number, reserved?: number): boolean`.

**Why this exists as its own module:** `coverPage.test.ts` can only assert that the generated blob is non-empty — it cannot read positions out of a PDF. Extracting the arithmetic is the only way to test the page-break decision at all, and it matches the repo's convention of putting view logic in a plain `.ts`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/letterRowLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ROW_HEIGHT_MM,
  DETAIL_LINE_HEIGHT_MM,
  RESERVED_CLOSING_MM,
  rowBlockHeight,
  rowNeedsPageBreak,
} from '../letterRowLayout';

const A4_HEIGHT_MM = 297;

describe('rowBlockHeight', () => {
  it('is one row height when there are no detail lines', () => {
    expect(rowBlockHeight(0)).toBe(ROW_HEIGHT_MM);
  });

  it('adds one detail line height per detail line', () => {
    expect(rowBlockHeight(2)).toBe(ROW_HEIGHT_MM + 2 * DETAIL_LINE_HEIGHT_MM);
  });
});

describe('rowNeedsPageBreak', () => {
  it('does not break near the top of the page', () => {
    expect(rowNeedsPageBreak(60, rowBlockHeight(2), A4_HEIGHT_MM)).toBe(false);
  });

  it('breaks when the row would encroach on the reserved closing block', () => {
    // A row starting this low cannot fit and still leave room for "Yours Faithfully"
    // plus the signature — which is exactly how the signature used to fall off the page.
    const y = A4_HEIGHT_MM - RESERVED_CLOSING_MM - 1;
    expect(rowNeedsPageBreak(y, rowBlockHeight(2), A4_HEIGHT_MM)).toBe(true);
  });

  it('respects the reserved closing block, not just the paper edge', () => {
    // Comfortably above the paper edge, yet still inside the reserved band.
    const y = A4_HEIGHT_MM - RESERVED_CLOSING_MM + 2;
    expect(y).toBeLessThan(A4_HEIGHT_MM);
    expect(rowNeedsPageBreak(y, ROW_HEIGHT_MM, A4_HEIGHT_MM)).toBe(true);
  });

  it('accepts an explicit reserved height', () => {
    expect(rowNeedsPageBreak(200, ROW_HEIGHT_MM, A4_HEIGHT_MM, 0)).toBe(false);
    expect(rowNeedsPageBreak(200, ROW_HEIGHT_MM, A4_HEIGHT_MM, 120)).toBe(true);
  });

  it('a taller block breaks sooner than a shorter one at the same position', () => {
    const y = A4_HEIGHT_MM - RESERVED_CLOSING_MM - 10;
    expect(rowNeedsPageBreak(y, ROW_HEIGHT_MM, A4_HEIGHT_MM)).toBe(false);
    expect(rowNeedsPageBreak(y, rowBlockHeight(2), A4_HEIGHT_MM)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/letterRowLayout.test.ts`
Expected: FAIL — "Failed to resolve import ../letterRowLayout".

- [ ] **Step 3: Write minimal implementation**

Create `app-frontend/src/utils/letterRowLayout.ts`:

```ts
/**
 * Vertical arithmetic for the lodgement letter's enclosed-documents list.
 *
 * Extracted from cover-page.ts because the generator can only be asserted as "produced a
 * non-empty blob" — positions inside a rendered PDF are not readable from a test. Keeping the
 * arithmetic here is what makes the page-break decision verifiable.
 *
 * All units are millimetres, matching the jsPDF document's unit.
 */

/** Baseline step for a row's own line. */
export const ROW_HEIGHT_MM = 6.5;

/** Baseline step for each indented detail line under a row. */
export const DETAIL_LINE_HEIGHT_MM = 5;

/**
 * Space kept free below the list for "Yours Faithfully", the signature rule and the name.
 * Without this the enclosed list could consume the page and push the signature off it.
 */
export const RESERVED_CLOSING_MM = 45;

export const ROW_FONT_SIZE = 11;
export const DETAIL_FONT_SIZE = 9;

/** Total height a row occupies, including its detail lines. */
export function rowBlockHeight(detailLineCount: number): number {
  return ROW_HEIGHT_MM + Math.max(0, detailLineCount) * DETAIL_LINE_HEIGHT_MM;
}

/**
 * Would drawing this row here leave too little room for the closing block?
 *
 * Measured against the reserved band rather than the paper edge, because running into the
 * signature is the failure we are preventing, not running off the paper.
 */
export function rowNeedsPageBreak(
  yPosition: number,
  blockHeight: number,
  pageHeight: number,
  reserved: number = RESERVED_CLOSING_MM,
): boolean {
  return yPosition + blockHeight > pageHeight - reserved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/letterRowLayout.test.ts`
Expected: PASS — 7 tests.

Then the full suite: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/letterRowLayout.ts app-frontend/src/utils/__tests__/letterRowLayout.test.ts
git commit -m "feat(letter): extract row-height arithmetic and the page-break predicate"
```

---

### Task 5: Draw the multi-line rows

**Files:**
- Modify: `app-frontend/src/utils/cover-page.ts` (the enclosed-documents loop, ~lines 167-187)
- Test: `app-frontend/src/utils/__tests__/coverPage.test.ts` (extend)

**Interfaces:**
- Consumes: `detail?: string[]` on `LodgementDocumentStatus` (Task 3); `rowBlockHeight`, `rowNeedsPageBreak`, `ROW_HEIGHT_MM`, `DETAIL_LINE_HEIGHT_MM`, `ROW_FONT_SIZE`, `DETAIL_FONT_SIZE` (Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/coverPage.test.ts`:

```ts
  it('produces a PDF when rows carry detail lines', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage({
      ...baseInfo,
      documents: [
        { label: 'Field book', displayLabel: 'Field book', present: true },
        {
          label: 'Diagram',
          displayLabel: 'Diagrams',
          present: true,
          detail: ['3 diagrams, 9 copies', 'PDF 3 · DXF 3'],
        },
        {
          label: 'General Plan',
          displayLabel: 'General Plans',
          present: true,
          detail: ['2 general plans, 4 sheets', 'PDF 2 · DXF 2'],
        },
      ],
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('still produces a PDF when detail is omitted on every row', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage({
      ...baseInfo,
      documents: [{ label: 'Field book', displayLabel: 'Field book', present: true }],
    });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces a PDF when every row carries detail, forcing a page break', () => {
    // Enough detail-bearing rows that the list cannot fit one page — this is the path that
    // used to push the signature off the sheet.
    const gen = new CoverPageGenerator();
    const documents = Array.from({ length: 12 }, (_, i) => ({
      label: `Row ${i}`,
      displayLabel: `Row ${i}`,
      present: true,
      detail: ['detail line one', 'detail line two'],
    }));
    const blob = gen.generateCoverPage({ ...baseInfo, documents });
    expect(blob.size).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/coverPage.test.ts`
Expected: these three PASS already (jsPDF ignores the unknown `detail` field), but the third would render off the page. Treat Step 2 as establishing the baseline: record that all three pass, then implement Step 3 so the third case paginates. The behaviour under test here is "does not throw and still produces a PDF"; correct pagination is verified by Task 4's unit tests plus the manual check below.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `app-frontend/src/utils/cover-page.ts`:

```ts
import {
  rowBlockHeight,
  rowNeedsPageBreak,
  ROW_HEIGHT_MM,
  DETAIL_LINE_HEIGHT_MM,
  ROW_FONT_SIZE,
  DETAIL_FONT_SIZE,
} from './letterRowLayout';
```

Replace the enclosed-documents block (`cover-page.ts` ~lines 167-187) with:

```ts
    // Document List with tick boxes (ticked when the record exists on disk)
    const docItems: LodgementDocumentStatus[] =
      info.documents && info.documents.length
        ? info.documents
        : LODGEMENT_DOCUMENTS.map((label) => ({ label, displayLabel: label, present: false }));

    const boxSize = 3.5;
    const pageHeight = pdf.internal.pageSize.getHeight();

    docItems.forEach((doc) => {
      const detail = doc.detail ?? [];

      // Keep the closing block on the same page as the end of the list. Without this guard the
      // detail lines can consume the remaining space and push the signature off the sheet.
      if (rowNeedsPageBreak(yPosition, rowBlockHeight(detail.length), pageHeight)) {
        pdf.addPage();
        yPosition = this.marginTop;
      }

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

      pdf.setFontSize(ROW_FONT_SIZE);
      pdf.text(doc.displayLabel ?? doc.label, this.marginLeft + 12, yPosition);
      yPosition += ROW_HEIGHT_MM;

      // Detail lines sit under the row, indented past the tick box and set smaller, so the
      // row itself still reads as the enclosed document.
      if (detail.length) {
        pdf.setFontSize(DETAIL_FONT_SIZE);
        for (const line of detail) {
          pdf.text(line, this.marginLeft + 18, yPosition);
          yPosition += DETAIL_LINE_HEIGHT_MM;
        }
        pdf.setFontSize(ROW_FONT_SIZE);
      }
    });
```

- [ ] **Step 4: Run tests and build**

Run: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

Run: `cd app-frontend && npm run build`
Expected: succeeds. One PRE-EXISTING warning about chunks larger than 500 kB is expected and is not yours.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/cover-page.ts app-frontend/src/utils/__tests__/coverPage.test.ts
git commit -m "feat(letter): draw plan detail lines and keep the signature on the page"
```

---

### Task 6: Explain an omitted sheet total

**Files:**
- Modify: `app-frontend/src/utils/lodgementDocuments.ts` (`buildLodgementWarnings`, ~line 209)
- Modify: `app-frontend/src/composables/useLodgementCheck.ts`
- Test: `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` (extend)
- Test: `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts` (extend)

**Interfaces:**
- Consumes: `countUnknownSheetPlans(files)` (Task 3).
- Produces: `buildLodgementWarnings(missing, verification, unknownSheetPlans?)` — the third parameter is NEW and OPTIONAL, so existing two-argument callers and tests keep working.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`:

```ts
describe('buildLodgementWarnings — unknown sheet counts', () => {
  const noVerification = { expectedMissing: [], unexpectedPresent: [] };

  it('explains an omitted sheet total', () => {
    const w = buildLodgementWarnings([], noVerification, 1);
    expect(w.some(line => /sheet count could not be determined for 1 general plan/i.test(line))).toBe(true);
    expect(w.some(line => /omits the sheet total/i.test(line))).toBe(true);
  });

  it('pluralises the count', () => {
    const w = buildLodgementWarnings([], noVerification, 2);
    expect(w.some(line => /2 general plans/i.test(line))).toBe(true);
  });

  it('says nothing when every sheet count is known', () => {
    expect(buildLodgementWarnings([], noVerification, 0)).toEqual([]);
  });

  it('says nothing when the argument is omitted entirely', () => {
    expect(buildLodgementWarnings([], noVerification)).toEqual([]);
  });
});
```

Append to `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts`:

```ts
describe('checkLodgementDocuments — unknown sheet counts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports how many general plans have an unreadable sheet count', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [
        { name: 'general-a.pdf', relDir: 'output/general-plans', pageCount: 3 },
        { name: 'general-b.pdf', relDir: 'output/general-plans' },
      ],
    });
    const { unknownSheetPlans } = await checkLodgementDocuments('some/dir');
    expect(unknownSheetPlans).toBe(1);
  });

  it('reports zero when there is no working directory to read', async () => {
    const { unknownSheetPlans } = await checkLodgementDocuments(undefined);
    expect(unknownSheetPlans).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts src/composables/__tests__/useLodgementCheck.test.ts`
Expected: FAIL — no unknown-sheet warning is produced, and `unknownSheetPlans` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `app-frontend/src/utils/lodgementDocuments.ts`, change `buildLodgementWarnings`'s signature and append one block before its `return`:

```ts
export function buildLodgementWarnings(
  missing: string[],
  verification: CompositionVerification,
  unknownSheetPlans: number = 0
): string[] {
```

```ts
  if (unknownSheetPlans > 0) {
    const what = unknownSheetPlans === 1 ? 'general plan' : 'general plans';
    warnings.push(
      `Sheet count could not be determined for ${unknownSheetPlans} ${what} — ` +
      `the letter omits the sheet total.`
    );
  }

  return warnings;
}
```

In `app-frontend/src/composables/useLodgementCheck.ts`, add `countUnknownSheetPlans` to the existing import from `@/utils/lodgementDocuments`, add the key to the return type, and compute it:

```ts
export async function checkLodgementDocuments(
  workingDirectory?: string,
  composition?: RecordComposition | null
): Promise<{
  documents: LodgementDocumentStatus[]
  missing: string[]
  verification: CompositionVerification
  /** General plans whose sheet count could not be read. Feeds buildLodgementWarnings. */
  unknownSheetPlans: number
}> {
```

and before the return:

```ts
  const unknownSheetPlans = countUnknownSheetPlans(files)
  return { documents, missing, verification, unknownSheetPlans }
```

Finally, both record-generating views must pass it through. In BOTH `SurveyPlanMapView.vue` (~line 4645) and `MapLibreAreaView.vue` (~line 6295), destructure the new key and pass it as the third argument:

```ts
    const { documents: lodgementDocs, missing: missingDocs, verification, unknownSheetPlans } =
      await checkLodgementDocuments(recordWorkingDirectory, recordComposition.value)
```

```ts
      const warnings = buildLodgementWarnings(missingDocs, verification, unknownSheetPlans)
```

In `MapLibreAreaView.vue` the composition expression is `await loadComposition(Number(recordProjectId), workflowState)` rather than `recordComposition.value` — keep that file's existing expression and change only the destructuring and the `buildLodgementWarnings` call.

- [ ] **Step 4: Run tests and build**

Run: `cd app-frontend && npx vitest run`
Expected: PASS, 0 failures.

Run: `cd app-frontend && npm run build`
Expected: succeeds, only the pre-existing chunk-size warning.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/composables/useLodgementCheck.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts app-frontend/src/composables/__tests__/useLodgementCheck.test.ts app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(letter): warn when a plan's sheet count could not be read"
```

---

## Verification checklist

```bash
cd app-frontend && npx vitest run
cd app-frontend && npm run build
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

The backend full suite takes roughly 14 minutes (77 suites, 1060 tests, 6 snapshots). The
`pdfkitGeoPDF` snapshot suite records exact rendered text positions; this work changes the
FRONTEND jsPDF letter, not backend PDFKit output, so it should be unaffected. **If it fails,
inspect the diff — do not regenerate the snapshot.**

**Manual check, unavoidable:** no automated test can read positions out of a rendered PDF.
Generate a comprehensive record for a project with a multi-sheet general plan and confirm:

| Check | Expect |
|---|---|
| Diagram row | `Diagrams` with `N diagrams, 3N copies` and `PDF N · DXF N` beneath |
| General Plan row | `General Plans` with `N general plans, M sheets` where M is the true sheet total |
| Bottom of the letter | "Yours Faithfully", the signature rule and the name all still present |
| If the list spilled | The project-information page follows on the next page, nothing lost |

## Out of scope

- No change to how plans are generated, tiled, or saved.
- No persistence of the `X-Tile-Grid` header; sheet counts stay derived.
- No per-sheet DXF export.
- No change to the nine non-plan rows, or to the Working Plan row.
- No zip packaging and no Surveyor-General upload (sub-projects C and D).

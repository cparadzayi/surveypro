# Survey Record Split Outputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save each section of the comprehensive survey record (field book, coordinate list, calculations, areas & consistency) as its own project-name-prefixed PDF in its output subfolder alongside the collated `Comprehensive_Latest.pdf`, and make the lodgement-letter tick-box matcher folder-aware so those files (and surveyor-supplied ones) are correctly detected.

**Architecture:** Expose the section blobs the generators already build (`TwoPassDocumentGenerator` → cover/field-book/coordinate-list/calculations; `generateAreaConsistencyPDF` → areas-only), route them through a new best-effort save composable (`useSurveyRecordOutputs`) into their canonical folders, and upgrade `resolveLodgementDocuments` from filename-keyword to folder-aware matching (folder+keyword for generated docs, `input/` keyword for external docs).

**Tech Stack:** Vue 3 + TypeScript (frontend, Vitest), jsPDF + pdf-lib (PDF assembly). No backend change (the `/documents/output-manifest` endpoint already returns `relDir`).

## Global Constraints

- Frontend unit tests use Vitest: `npx vitest run <pattern>` from `app-frontend` (PowerShell starts in `app-backend`; `Set-Location C:/surveypro-may-2026/SurveyPro-nov-alpha/app-frontend` first). The Bash tool has NO git/node on PATH — use the PowerShell tool for git and tests. On a sandbox/permission error, retry with `dangerouslyDisableSandbox: true`.
- This work happens on a feature branch off `main`. Never push to `origin/main`; the project pushes with `git push origin HEAD:nov-alpha`. Do not push unless the user asks.
- Do NOT stage the pre-existing untracked root files (`20260527 beacon-comparison-claude.csv`, `namibian example.txt`, `survey-plan-dxf-sample.dxf`, `verification/`). Never `git add -A`/`git add .`; stage only the files each task names.
- Split section files are project-name-prefixed rolling snapshots written with `overwrite:true`. `<Project>` = `projectName.replace(/[^a-zA-Z0-9-_]/g, '_')`.
  - `output/field-book/<Project>_FieldBook.pdf`
  - `output/coordinate-list/<Project>_CoordinateList.pdf`
  - `output/calculations/<Project>_Calculations.pdf` (the collated `Comprehensive_Latest.pdf` stays in this folder unchanged)
  - `output/survey-record/<Project>_AreasAndConsistency.pdf`
- Saving a split file is best-effort per file: a failed write is caught and recorded, never aborts the record generation or the other saves.
- The collated `Comprehensive_Latest.pdf`, its content, and page numbering are unchanged. Section blobs are exposed by returning already-built values, never by re-generating.
- The 11 enclosed-document labels are unchanged. The areas file is for retrieval only; it is not a new tick item (areas is part of "Coordinate List and Calculations").

---

### Task 1: Folder-aware lodgement matcher

**Files:**
- Modify: `app-frontend/src/utils/lodgementDocuments.ts`
- Modify: `app-frontend/src/composables/useLodgementCheck.ts`
- Test: `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` (rewrite cases), `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts` (unchanged — already uses `{name, relDir}`)

**Interfaces:**
- Produces: `export interface ManifestFile { name: string; relDir: string }`
- Produces: `resolveLodgementDocuments(files: ManifestFile[]): LodgementDocumentStatus[]` (signature changes from `string[]` to `ManifestFile[]`). `LodgementDocumentStatus = { label: string; present: boolean }` (unchanged). `LODGEMENT_DOCUMENTS: string[]` (unchanged).
- Consumes (in `useLodgementCheck`): `getOutputManifest(dir): Promise<{ files: { name: string; relDir: string }[] }>` (already exists).

- [ ] **Step 1: Rewrite the failing test**

Replace the body of `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { LODGEMENT_DOCUMENTS, resolveLodgementDocuments, type ManifestFile } from '../lodgementDocuments';

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

const f = (name: string, relDir: string): ManifestFile => ({ name, relDir });

describe('resolveLodgementDocuments — generated docs (folder + keyword)', () => {
  it('ticks a generated item only when BOTH its folder and keyword match', () => {
    const files = [
      f('MAG1_FieldBook.pdf', 'output/field-book'),
      f('MAG1_CoordinateList.pdf', 'output/coordinate-list'),
      f('Comprehensive_Latest.pdf', 'output/calculations'),
      f('GENERAL-PLAN-Maglas.pdf', 'output/general-plans'),
      f('DSG-1-96.pdf', 'output/certificates'),
    ];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(true);
    expect(by['Coordinate List and Calculations']).toBe(true);
    expect(by['General Plan']).toBe(true);
    expect(by['DSG Certificate (1/96)']).toBe(true);
    expect(by['Working Plan']).toBe(false);
  });

  it('does NOT tick a generated item when the keyword matches but the folder is wrong', () => {
    // A field-book-named file sitting in the calculations folder must not tick "Field book".
    const files = [f('MAG1_FieldBook.pdf', 'output/calculations')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(false);
  });

  it('does NOT let a stray "196" in an unrelated folder tick the DSG certificate', () => {
    const files = [f('coords_196_points.pdf', 'output/coordinate-list')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['DSG Certificate (1/96)']).toBe(false);
  });
});

describe('resolveLodgementDocuments — external docs (input/ keyword)', () => {
  it('ticks an external item when a matching file is anywhere under input/', () => {
    const files = [
      f('beacon-receipt-scan.jpg', 'input'),
      f('title-search.pdf', 'input/searches'),
    ];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Beacon receipt']).toBe(true);
    expect(by['Searches']).toBe(true);
  });

  it('does NOT tick an external item when the keyword file is under output/ instead of input/', () => {
    const files = [f('permit-layout.pdf', 'output/general-plans')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Permit/Instruction and layout']).toBe(false);
  });
});

describe('resolveLodgementDocuments — empty', () => {
  it('returns all-unticked, preserving order, for no files', () => {
    const result = resolveLodgementDocuments([]);
    expect(result.map(r => r.label)).toEqual(LODGEMENT_DOCUMENTS);
    expect(result.every(r => r.present === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run lodgementDocuments`
Expected: FAIL — `ManifestFile` is not exported and `resolveLodgementDocuments` still takes `string[]`.

- [ ] **Step 3: Rewrite `lodgementDocuments.ts`**

Replace the file body from the `DOCUMENT_PATTERNS` declaration onward (keep `LODGEMENT_DOCUMENTS` and `LodgementDocumentStatus` as they are) so the full file reads:

```ts
/**
 * Canonical enclosed-documents list for the Surveyor-General lodgement letter,
 * plus folder-aware matching: SurveyPro-generated docs must live in their
 * designated output subfolder (deterministic, no cross-folder false positives),
 * while surveyor-supplied docs are matched by keyword anywhere under input/.
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

/** A file from the project output/input manifest. relDir is POSIX, e.g. "output/field-book". */
export interface ManifestFile {
  name: string;
  relDir: string;
}

type DocRule =
  | { kind: 'generated'; folders: string[]; keyword: RegExp }
  | { kind: 'external'; keyword: RegExp };

/** Per-item matching rule. Generated items are folder-scoped; external items live under input/. */
const DOCUMENT_RULES: Record<string, DocRule> = {
  'Field book': { kind: 'generated', folders: ['field-book'], keyword: /field.?book/i },
  'Coordinate List and Calculations': { kind: 'generated', folders: ['coordinate-list', 'calculations'], keyword: /coordinate|calc|comprehensive/i },
  'General Plan': { kind: 'generated', folders: ['general-plans'], keyword: /general.?plan/i },
  'Working Plan': { kind: 'generated', folders: ['working-plans'], keyword: /working.?plan/i },
  'Report on Survey': { kind: 'generated', folders: ['survey-record', 'reports'], keyword: /report|survey.?record/i },
  'DSG Certificate (1/96)': { kind: 'generated', folders: ['certificates'], keyword: /dsg|1.?96/i },
  'Dispensation Certificate': { kind: 'external', keyword: /dispensation/i },
  'Checklist': { kind: 'external', keyword: /check.?list/i },
  'Permit/Instruction and layout': { kind: 'external', keyword: /permit|instruction|layout/i },
  'Beacon receipt': { kind: 'external', keyword: /beacon.*receipt/i },
  'Searches': { kind: 'external', keyword: /search/i },
};

export function resolveLodgementDocuments(files: ManifestFile[]): LodgementDocumentStatus[] {
  const list = files || [];
  return LODGEMENT_DOCUMENTS.map((label) => {
    const rule = DOCUMENT_RULES[label];
    const present = list.some((file) => {
      if (!rule || !rule.keyword.test(file.name)) return false;
      const segments = (file.relDir || '').split('/').filter(Boolean);
      if (rule.kind === 'external') return segments[0] === 'input';
      return segments.some((seg) => rule.folders.includes(seg));
    });
    return { label, present };
  });
}
```

- [ ] **Step 4: Update `useLodgementCheck.ts` to pass full manifest entries**

In `app-frontend/src/composables/useLodgementCheck.ts`, change the fetch/mapping so it passes `{ name, relDir }` entries (not just names):

```ts
import { getOutputManifest } from '@/services/documentStorage'
import { resolveLodgementDocuments, type LodgementDocumentStatus, type ManifestFile } from '@/utils/lodgementDocuments'

/**
 * Determine which enclosed documents exist in the project output/input folders.
 * When no working directory is available (download-only path), skips the fetch and
 * reports every item as absent — callers should NOT show a warning dialog then.
 */
export async function checkLodgementDocuments(
  workingDirectory?: string
): Promise<{ documents: LodgementDocumentStatus[]; missing: string[] }> {
  let files: ManifestFile[] = []
  if (workingDirectory) {
    const manifest = await getOutputManifest(workingDirectory)
    files = manifest.files
  }
  const documents = resolveLodgementDocuments(files)
  const missing = documents.filter((d) => !d.present).map((d) => d.label)
  return { documents, missing }
}
```

- [ ] **Step 5: Run both suites to verify they pass**

Run (from `app-frontend`): `npx vitest run lodgementDocuments useLodgementCheck`
Expected: PASS. (The existing `useLodgementCheck` test already uses `{ name: 'GENERAL-PLAN-Maglas.pdf', relDir: 'output/general-plans' }`, which now matches "General Plan" via folder+keyword — still green.)

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/composables/useLodgementCheck.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts
git commit -m "feat(record): folder-aware lodgement matcher (folder+keyword / input keyword)"
```

---

### Task 2: Expose section blobs through the two-pass pipeline

**Files:**
- Modify: `app-frontend/src/utils/TwoPassDocumentGenerator.ts` (`renderPass` return + `generate` return + `TwoPassDocumentResult`)
- Modify: `app-frontend/src/utils/comprehensive-document.ts` (`generateWithTwoPass` return)
- Test: `app-frontend/src/utils/__tests__/twoPassSections.test.ts` (new)

**Interfaces:**
- Produces: `TwoPassDocumentResult.sections: { fieldBook: Blob; coordinateList: Blob; calculations: Blob }`.
- Produces: `generateWithTwoPass(...)` result gains `sections: { cover: Blob; fieldBook: Blob; coordinateList: Blob; calculations: Blob }`.
- Consumes: existing `SurveyPoint`, `AdjustedCoordinate`, `SurveyorInfo`, `CoverPageInfo` types.

- [ ] **Step 1: Write the failing smoke test**

Create `app-frontend/src/utils/__tests__/twoPassSections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ComprehensiveDocumentGenerator } from '../comprehensive-document';

// Minimal-but-real inputs: two observed points + one parcel are enough to render
// every section (field book, coordinate list, calculations, areas) without error.
const surveyPoints = [
  { pointId: 'A1', y: 50000, x: 2200000, status: 'P', description: '', surveyDate: '2026-01-01' },
  { pointId: 'A2', y: 50100, x: 2200060, status: 'P', description: '', surveyDate: '2026-01-01' },
];
const adjustedCoordinates = surveyPoints.map((pt) => ({
  ...pt,
  fieldBookPage: '',
  calculationsPage: 0,
  adjustment: { isDuplicate: false, observationCount: 1, method: 'gps' as const },
}));
const surveyorInfo = {
  name: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
  surveyDate: '2026-01-01', projectTitle: 'Test', district: 'X', centralMeridian: 31,
};
const projectInfo = {
  projectTitle: 'Test', surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01', surveyType: 'STANDS 1 - 2 TEST TOWNSHIP',
};
const parcels = [{
  id: '1', name: '1',
  coordinates: [{ x: 2200000, y: 50000 }, { x: 2200060, y: 50000 }, { x: 2200060, y: 50100 }],
  area: 0.6,
}];

describe('generateWithTwoPass — section blobs', () => {
  it('returns non-empty cover, field book, coordinate list, and calculations blobs', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      projectInfo, surveyorInfo,
      fieldBookObservations: [],
      surveyPoints, adjustedCoordinates,
      projectControlPoints: [], duplicateAnalyses: [], parcels,
    } as any);
    for (const key of ['cover', 'fieldBook', 'coordinateList', 'calculations'] as const) {
      expect(result.sections?.[key]).toBeInstanceOf(Blob);
      expect(result.sections?.[key].size).toBeGreaterThan(0);
    }
  }, 30000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run twoPassSections`
Expected: FAIL — `result.sections` is `undefined`.

If instead it fails because a generator throws on this minimal fixture, report DONE_WITH_CONCERNS with the exact error rather than expanding the fixture indefinitely — the controller will advise.

- [ ] **Step 3: Return the section blobs from `TwoPassDocumentGenerator`**

In `app-frontend/src/utils/TwoPassDocumentGenerator.ts`:

Add to the `TwoPassDocumentResult` interface (after `pdf: Blob`):

```ts
  sections: {
    fieldBook: Blob
    coordinateList: Blob
    calculations: Blob
  }
```

Change `renderPass` to return the sections alongside the merged PDF. Replace its signature and body tail so it returns an object:

```ts
  private async renderPass(
    data: TwoPassDocumentData,
    measurements: DocumentMeasurements
  ): Promise<{ merged: Blob; sections: { fieldBook: Blob; coordinateList: Blob; calculations: Blob } }> {
    const pdfs: Blob[] = []

    // 1. Field Book
    const fieldBookResult = await this.renderFieldBook(data)
    pdfs.push(fieldBookResult.pdf)

    // 2. Coordinate List
    const coordListPDF = await this.renderCoordinateList(
      data,
      measurements.calculations.pointPageMap,
      fieldBookResult.pointPageMap
    )
    pdfs.push(coordListPDF)

    // 3. Calculations Part 1
    const calcsPDF = await this.renderCalculations(data, measurements.calculations.startPage)
    pdfs.push(calcsPDF)

    // 4. Merge all sections into the collated body
    const merged = await this.mergePDFs(pdfs)

    return {
      merged,
      sections: {
        fieldBook: fieldBookResult.pdf,
        coordinateList: coordListPDF,
        calculations: calcsPDF,
      },
    }
  }
```

(Keep the existing `console.log` lines if you wish; the return shape is the only functional change. Note the areas rendering was already a no-op TODO here — leave it out; areas is handled in Task 3.)

Then in `generate`, update the render step and return:

```ts
    // PASS 2: Rendering
    const rendered = await this.renderPass(data, measurements)

    return {
      pdf: rendered.merged,
      sections: rendered.sections,
      measurements,
      totalPages: measurements.totalPages,
    }
```

- [ ] **Step 4: Forward sections (plus cover) from `generateWithTwoPass`**

In `app-frontend/src/utils/comprehensive-document.ts`, in `generateWithTwoPass`, the local variables `result` (from `this.twoPassGenerator.generate(...)`) and `coverPageBlob` already exist. Add `sections` to the returned object (the function currently returns `{ pdf: finalPdf, pageAllocation, totalPages, actualCoordListLastPage, actualCalcStartPage, actualCalcLastPage, measurements }`):

```ts
    return {
      pdf: finalPdf,
      pageAllocation: result.measurements,
      totalPages: result.totalPages + 2,
      actualCoordListLastPage: result.measurements.coordinateList.endPage,
      actualCalcStartPage: result.measurements.calculations.startPage,
      actualCalcLastPage: result.measurements.calculations.endPage,
      measurements: result.measurements,
      sections: {
        cover: coverPageBlob,
        fieldBook: result.sections.fieldBook,
        coordinateList: result.sections.coordinateList,
        calculations: result.sections.calculations,
      },
    }
```

Also widen the method's return type to include the sections. Change the `generateWithTwoPass` return annotation to:

```ts
  ): Promise<ComprehensiveDocumentResult & {
    measurements?: DocumentMeasurements;
    sections?: { cover: Blob; fieldBook: Blob; coordinateList: Blob; calculations: Blob };
  }> {
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run twoPassSections`
Expected: PASS (the four section blobs are non-empty).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/TwoPassDocumentGenerator.ts app-frontend/src/utils/comprehensive-document.ts app-frontend/src/utils/__tests__/twoPassSections.test.ts
git commit -m "feat(record): expose cover/field-book/coordinate-list/calculations section blobs"
```

---

### Task 3: Expose the areas-only blob

**Files:**
- Modify: `app-frontend/src/composables/useAreaConsistencyPDF.ts` (`generateAreaConsistencyPDF` return + `mergeWithCalculationsPart1` caller)
- Modify: `app-frontend/src/composables/useComprehensivePDF.ts` (capture + return `areasOnlyBlob`)
- Test: `app-frontend/src/composables/__tests__/areasOnly.test.ts` (new)

**Interfaces:**
- Produces: `generateAreaConsistencyPDF(...)` returns `{ merged: Uint8Array; areasOnly: Blob } | void` (was `Uint8Array | void`). When `calculationsPart1PDF` is provided it returns the object; the standalone (`void`) branch is unchanged.
- Produces: `ComprehensivePDFResult.areasOnlyBlob?: Blob`.

- [ ] **Step 1: Write the failing smoke test**

Create `app-frontend/src/composables/__tests__/areasOnly.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateAreaConsistencyPDF } from '../useAreaConsistencyPDF';

async function onePagePdfBlob(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

const parcel: any = {
  designation: 'STAND 1',
  points: [{ id: 'A', y: 50000, x: 2200000 }, { id: 'B', y: 50100, x: 2200000 }],
  areaResult: {
    area: { abs_m2: 6000, display: { unit: 'm2', square_meters: 6000 } },
    residuals: {
      edges: [{
        from: { id: 'A', y: 50000, x: 2200000 },
        to: { id: 'B', y: 50100, x: 2200000 },
        distance: 100, distanceRounded: 100, bearing: 0, bearingRoundedDeg: 0, dy: 0, dx: 0,
      }],
    },
  },
};

describe('generateAreaConsistencyPDF — areas-only blob', () => {
  it('returns both the merged bytes and a non-empty areas-only blob', async () => {
    const calc = await onePagePdfBlob();
    const result = await generateAreaConsistencyPDF([parcel], 'Test', calc, 116, [], []);
    expect(result).toBeTruthy();
    expect((result as any).merged).toBeInstanceOf(Uint8Array);
    expect((result as any).merged.length).toBeGreaterThan(0);
    expect((result as any).areasOnly).toBeInstanceOf(Blob);
    expect((result as any).areasOnly.size).toBeGreaterThan(0);
  }, 20000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run areasOnly`
Expected: FAIL — `result.merged`/`result.areasOnly` are `undefined` (the function currently returns a bare `Uint8Array`).

- [ ] **Step 3: Return the areas-only blob from `generateAreaConsistencyPDF`**

In `app-frontend/src/composables/useAreaConsistencyPDF.ts`:

Change the function's return type from `Promise<Uint8Array | void>` to `Promise<{ merged: Uint8Array; areasOnly: Blob } | void>`.

In the `if (calculationsPart1PDF)` branch (currently returns `mergedPdfBytes`), capture the areas-only bytes from the areas `doc` and return both:

```ts
  if (calculationsPart1PDF) {
    // Areas as its own document (independent retrieval) — captured before the merge.
    const areasOnly = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });

    const mergedPdfBytes = await mergeWithCalculationsPart1(
      doc,
      calculationsPart1PDF,
      projectName,
      pageWidth,
      lastDisplayedPageNumber
    );

    return { merged: mergedPdfBytes, areasOnly };
  } else {
```

(The standalone `else` branch — which calls `doc.save(...)` and returns nothing — is unchanged.)

- [ ] **Step 4: Run the areas test to verify it passes**

Run (from `app-frontend`): `npx vitest run areasOnly`
Expected: PASS.

- [ ] **Step 5: Thread `areasOnlyBlob` through `useComprehensivePDF`**

In `app-frontend/src/composables/useComprehensivePDF.ts`:

Add `areasOnlyBlob?: Blob` to the `ComprehensivePDFResult` interface.

The current code does `const mergedPdfBytes = await generateAreaConsistencyPDF(...)` then checks `if (!mergedPdfBytes)`. Replace that with capturing the object and its parts:

```ts
    const areaResult = await generateAreaConsistencyPDF(
      computedParcels,
      projectName,
      calcPart1Blob,
      lastDisplayedPageNumber,
      beaconLabels,
      coordinatePoints
    )

    if (!areaResult) {
      return { success: false, error: 'PDF generation returned no data' }
    }

    const mergedPdfBytes = areaResult.merged
    const areasOnlyBlob = areaResult.areasOnly
```

Then, in BOTH success `return` objects (the one after a successful `saveDocument`, and the no-working-directory `return { success: true, pdfBlob: blob }`), add `areasOnlyBlob`:

```ts
        return { success: true, filePath: saveResult.filePath, pdfBlob: blob, areasOnlyBlob }
```
and
```ts
      return { success: true, pdfBlob: blob, areasOnlyBlob }
```

(Leave the failure/`No parcels` returns as-is.)

- [ ] **Step 6: Run the frontend suites touched to confirm nothing regressed**

Run (from `app-frontend`): `npx vitest run areasOnly twoPassSections lodgementDocuments useLodgementCheck`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/composables/useAreaConsistencyPDF.ts app-frontend/src/composables/useComprehensivePDF.ts app-frontend/src/composables/__tests__/areasOnly.test.ts
git commit -m "feat(record): expose areas-only blob from area-consistency generation"
```

---

### Task 4: Route section documentTypes to their folders

**Files:**
- Modify: `app-frontend/src/services/documentStorage.ts` (extract `resolveTargetFolder`, add `areas-consistency`)
- Test: `app-frontend/src/services/__tests__/resolveTargetFolder.test.ts` (new)

**Interfaces:**
- Produces: `export function resolveTargetFolder(documentType: SaveDocumentOptions['documentType'], structure: ProjectDirectoryStructure): string`.
- The `SaveDocumentOptions['documentType']` union gains `'areas-consistency'`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/services/__tests__/resolveTargetFolder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTargetFolder } from '../documentStorage';
import { getProjectDirectoryStructure } from '@/utils/project-directory';

const structure = getProjectDirectoryStructure('C:/proj');

describe('resolveTargetFolder', () => {
  it('routes each document type to its subfolder', () => {
    expect(resolveTargetFolder('field-book', structure)).toBe(structure.fieldBook);
    expect(resolveTargetFolder('coordinate-list', structure)).toBe(structure.coordinateList);
    expect(resolveTargetFolder('calculations-part1', structure)).toBe(structure.calculations);
    expect(resolveTargetFolder('area-computation', structure)).toBe(structure.calculations);
    expect(resolveTargetFolder('areas-consistency', structure)).toBe(structure.surveyRecord);
    expect(resolveTargetFolder('report-on-survey', structure)).toBe(structure.reports);
    expect(resolveTargetFolder('dsg-certificate', structure)).toBe(structure.certificates);
  });

  it('throws on an unknown document type', () => {
    expect(() => resolveTargetFolder('nope' as any, structure)).toThrow(/Unknown document type/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run resolveTargetFolder`
Expected: FAIL — `resolveTargetFolder` is not exported.

- [ ] **Step 3: Extract `resolveTargetFolder` and add the areas mapping**

In `app-frontend/src/services/documentStorage.ts`:

Add `'areas-consistency'` to the `documentType` union in `SaveDocumentOptions`:

```ts
  documentType: 'field-book' | 'calculations-part1' | 'coordinate-list' | 'area-computation' | 'areas-consistency' | 'report-on-survey' | 'dsg-certificate'
```

Add an import for the structure type at the top (alongside the existing `getProjectDirectoryStructure` import):

```ts
import { getProjectDirectoryStructure, type ProjectDirectoryStructure } from '../utils/project-directory'
```

Add the exported resolver (near the top, after the interfaces):

```ts
/** Map a document type to its target output subfolder. */
export function resolveTargetFolder(
  documentType: SaveDocumentOptions['documentType'],
  structure: ProjectDirectoryStructure
): string {
  switch (documentType) {
    case 'field-book':
      return structure.fieldBook
    case 'calculations-part1':
    case 'area-computation':
      return structure.calculations
    case 'areas-consistency':
      return structure.surveyRecord
    case 'coordinate-list':
      return structure.coordinateList
    case 'report-on-survey':
      return structure.reports
    case 'dsg-certificate':
      return structure.certificates
    default:
      throw new Error(`Unknown document type: ${documentType}`)
  }
}
```

Then replace the inline `switch (documentType) { ... }` block inside `saveDocument` with a single call:

```ts
    const structure = getProjectDirectoryStructure(workingDirectory)
    const targetFolder = resolveTargetFolder(documentType, structure)
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run resolveTargetFolder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/services/documentStorage.ts app-frontend/src/services/__tests__/resolveTargetFolder.test.ts
git commit -m "feat(record): resolveTargetFolder + areas-consistency -> survey-record mapping"
```

---

### Task 5: Survey-record split-save composable

**Files:**
- Create: `app-frontend/src/composables/useSurveyRecordOutputs.ts`
- Test: `app-frontend/src/composables/__tests__/useSurveyRecordOutputs.test.ts` (new)

**Interfaces:**
- Consumes: `saveDocument` (Task 4's widened union), `getProjectDirectoryStructure` (unused here — save handles folders).
- Produces: `saveSurveyRecordSections(opts): Promise<{ saved: string[]; failed: { label: string; error: string }[] }>` where `opts = { workingDirectory: string; projectName: string; sections: { fieldBook: Blob; coordinateList: Blob; calculations: Blob; areas: Blob } }`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/useSurveyRecordOutputs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/documentStorage', () => ({
  saveDocument: vi.fn(),
}));

import { saveDocument } from '@/services/documentStorage';
import { saveSurveyRecordSections } from '../useSurveyRecordOutputs';

const blob = () => new Blob(['x'], { type: 'application/pdf' });
const sections = { fieldBook: blob(), coordinateList: blob(), calculations: blob(), areas: blob() };

describe('saveSurveyRecordSections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes all four sections to their folders with project-prefixed names and overwrite', async () => {
    (saveDocument as any).mockResolvedValue({ success: true, filePath: 'ok' });
    const res = await saveSurveyRecordSections({
      workingDirectory: 'C:/proj', projectName: 'MAG 1', sections,
    });
    expect(saveDocument).toHaveBeenCalledTimes(4);
    const calls = (saveDocument as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentType: 'field-book', fileName: 'MAG_1_FieldBook.pdf', overwrite: true }),
      expect.objectContaining({ documentType: 'coordinate-list', fileName: 'MAG_1_CoordinateList.pdf', overwrite: true }),
      expect.objectContaining({ documentType: 'calculations-part1', fileName: 'MAG_1_Calculations.pdf', overwrite: true }),
      expect.objectContaining({ documentType: 'areas-consistency', fileName: 'MAG_1_AreasAndConsistency.pdf', overwrite: true }),
    ]));
    expect(res.saved.length).toBe(4);
    expect(res.failed).toEqual([]);
  });

  it('is best-effort: a failed save is recorded and does not stop the others', async () => {
    (saveDocument as any)
      .mockResolvedValueOnce({ success: true, filePath: 'a' })
      .mockResolvedValueOnce({ success: false, error: 'locked' })
      .mockResolvedValueOnce({ success: true, filePath: 'c' })
      .mockResolvedValueOnce({ success: true, filePath: 'd' });
    const res = await saveSurveyRecordSections({
      workingDirectory: 'C:/proj', projectName: 'P', sections,
    });
    expect(saveDocument).toHaveBeenCalledTimes(4);
    expect(res.saved.length).toBe(3);
    expect(res.failed.length).toBe(1);
    expect(res.failed[0].error).toBe('locked');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `app-frontend`): `npx vitest run useSurveyRecordOutputs`
Expected: FAIL — cannot resolve `../useSurveyRecordOutputs`.

- [ ] **Step 3: Write the composable**

Create `app-frontend/src/composables/useSurveyRecordOutputs.ts`:

```ts
import { saveDocument, type SaveDocumentOptions } from '@/services/documentStorage'

export interface SurveyRecordSections {
  fieldBook: Blob
  coordinateList: Blob
  calculations: Blob
  areas: Blob
}

export interface SaveSurveyRecordOptions {
  workingDirectory: string
  projectName: string
  sections: SurveyRecordSections
}

export interface SaveSurveyRecordResult {
  saved: string[]
  failed: { label: string; error: string }[]
}

/** Sanitize a project name for use in a filename (mirrors getOutputFilePaths). */
function safeName(projectName: string): string {
  return (projectName || 'project').replace(/[^a-zA-Z0-9-_]/g, '_')
}

/**
 * Save each section of the comprehensive record as its own file in its output
 * subfolder, alongside the collated Comprehensive_Latest.pdf. Best-effort per file:
 * a failed write is recorded and never aborts the others.
 */
export async function saveSurveyRecordSections(
  opts: SaveSurveyRecordOptions
): Promise<SaveSurveyRecordResult> {
  const { workingDirectory, projectName, sections } = opts
  const safe = safeName(projectName)

  const jobs: Array<{ label: string; documentType: SaveDocumentOptions['documentType']; fileName: string; pdfBlob: Blob }> = [
    { label: 'Field book', documentType: 'field-book', fileName: `${safe}_FieldBook.pdf`, pdfBlob: sections.fieldBook },
    { label: 'Coordinate List', documentType: 'coordinate-list', fileName: `${safe}_CoordinateList.pdf`, pdfBlob: sections.coordinateList },
    { label: 'Calculations', documentType: 'calculations-part1', fileName: `${safe}_Calculations.pdf`, pdfBlob: sections.calculations },
    { label: 'Areas & Consistency', documentType: 'areas-consistency', fileName: `${safe}_AreasAndConsistency.pdf`, pdfBlob: sections.areas },
  ]

  const saved: string[] = []
  const failed: { label: string; error: string }[] = []

  for (const job of jobs) {
    try {
      const result = await saveDocument({
        workingDirectory,
        documentType: job.documentType,
        fileName: job.fileName,
        pdfBlob: job.pdfBlob,
        overwrite: true,
      })
      if (result.success) saved.push(result.filePath || job.fileName)
      else failed.push({ label: job.label, error: result.error || 'Unknown error' })
    } catch (error: any) {
      failed.push({ label: job.label, error: error?.message || 'Unknown error' })
    }
  }

  return { saved, failed }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `app-frontend`): `npx vitest run useSurveyRecordOutputs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useSurveyRecordOutputs.ts app-frontend/src/composables/__tests__/useSurveyRecordOutputs.test.ts
git commit -m "feat(record): useSurveyRecordOutputs best-effort split-save composable"
```

---

### Task 6: Wire both views to save the split sections

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `generateWithTwoPass(...).sections` (Task 2), `ComprehensivePDFResult.areasOnlyBlob` (Task 3), `saveSurveyRecordSections` (Task 5).

This task edits `.vue` orchestration; it has no new unit test. It ends with a typecheck-style check and manual QA.

**Context — where the blobs are:** In both views, `const result = await generator.generateWithTwoPass({...})` now carries `result.sections` (`{ cover, fieldBook, coordinateList, calculations }`). The Areas & Consistency section is produced later by the `useComprehensivePDF` composable, whose result now carries `areasOnlyBlob`. Save the four splits once both are available.

- [ ] **Step 1: Add the import in both views**

In BOTH `MapLibreAreaView.vue` and `SurveyPlanMapView.vue` `<script setup>` imports, add:

```ts
import { saveSurveyRecordSections } from '@/composables/useSurveyRecordOutputs';
```

- [ ] **Step 2: MapLibreAreaView — capture areas blob and save splits**

In `MapLibreAreaView.vue`, the local `generateComprehensivePDF(computedParcels, calcPart1Blob, projectName, lastDisplayedPageNumber)` function calls `generateComprehensiveLatestPDF(...)` and stores `const result = await generateComprehensiveLatestPDF({...})`. It currently receives only the collated blobs. To also save the splits, this function needs the two-pass `sections`. Change its signature to accept them, and its single caller.

At the call site inside `exportAreaConsistencyPDF` (currently `await generateComprehensivePDF(computedParcels, result.pdf, surveyorInfo.projectTitle, lastDisplayedPageNumber);`), pass the sections through:

```ts
    await generateComprehensivePDF(computedParcels, result.pdf, surveyorInfo.projectTitle, lastDisplayedPageNumber, result.sections);
```

Change the `generateComprehensivePDF` declaration to accept the sections and, after a successful `generateComprehensiveLatestPDF`, save the splits:

```ts
async function generateComprehensivePDF(
  computedParcels: Parcel[],
  calcPart1Blob: Blob,
  projectName: string,
  lastDisplayedPageNumber: number,
  twoPassSections?: { cover: Blob; fieldBook: Blob; coordinateList: Blob; calculations: Blob }
) {
```

After the existing `const result = await generateComprehensiveLatestPDF({...})` and its success handling, add (still inside the function, after `if (!result.success) { ... }` handling and before the function ends):

```ts
    // Save each section of the record as its own file for independent retrieval.
    const recordWorkingDirectory = workflowState?.projectInfo?.workingDirectory;
    if (recordWorkingDirectory && twoPassSections && result.areasOnlyBlob) {
      const split = await saveSurveyRecordSections({
        workingDirectory: recordWorkingDirectory,
        projectName,
        sections: {
          fieldBook: twoPassSections.fieldBook,
          coordinateList: twoPassSections.coordinateList,
          calculations: twoPassSections.calculations,
          areas: result.areasOnlyBlob,
        },
      });
      if (split.failed.length) {
        console.warn('[MapLibre] ⚠️ Some record sections did not save:',
          split.failed.map(f => `${f.label}: ${f.error}`).join('; '));
      }
    }
```

- [ ] **Step 3: SurveyPlanMapView — save splits after the composable result**

In `SurveyPlanMapView.vue`'s `generateComprehensivePDF`, `const result = await generator.generateWithTwoPass({...})` provides `result.sections`, and `const finalResult = await generateComprehensivePDFComposable({...})` provides `finalResult.areasOnlyBlob`. The function already has `const workingDirectory = (props.projectInfo as any).workingDirectory` in scope (declared earlier in the function). Immediately AFTER the `finalResult` is obtained and its success handled, add:

```ts
    // Save each section of the record as its own file for independent retrieval.
    if (workingDirectory && result.sections && finalResult.areasOnlyBlob) {
      const split = await saveSurveyRecordSections({
        workingDirectory,
        projectName,
        sections: {
          fieldBook: result.sections.fieldBook,
          coordinateList: result.sections.coordinateList,
          calculations: result.sections.calculations,
          areas: finalResult.areasOnlyBlob,
        },
      });
      if (split.failed.length) {
        console.warn('[ComprehensivePDF] ⚠️ Some record sections did not save:',
          split.failed.map(f => `${f.label}: ${f.error}`).join('; '));
      }
    }
```

If `workingDirectory` is not already in scope at that point (verify against the file — a `finally` may close the block earlier), declare `const recordSplitDir = (props.projectInfo as any).workingDirectory` alongside it and use that instead. If `result.sections`/`finalResult.areasOnlyBlob` are not accessible in that scope, STOP and report NEEDS_CONTEXT rather than guessing.

- [ ] **Step 4: Typecheck + run the feature suites**

Run (from `app-frontend`):
```
npx vitest run lodgementDocuments useLodgementCheck twoPassSections areasOnly resolveTargetFolder useSurveyRecordOutputs
```
Expected: PASS (all suites).

Then `npx vue-tsc --noEmit` from `app-frontend`. Note: this repo has a pre-existing `tsconfig.json` `baseUrl` deprecation that makes `vue-tsc` bail before file-level checks; confirm your edits introduce no NEW error beyond that baseline (compare with/without your changes if needed). If `vue-tsc` cannot reach these files, say so in your report.

- [ ] **Step 5: Manual verification (PENDING-FOR-HUMAN — do not fabricate)**

Cannot be run in the agent environment. In the report, list this for the human: start backend + frontend, generate the comprehensive record from BOTH the Area Computation (MapLibre) and Survey Plan views for a project with a working directory, then confirm:
1. `output/field-book/<Project>_FieldBook.pdf`, `output/coordinate-list/<Project>_CoordinateList.pdf`, `output/calculations/<Project>_Calculations.pdf`, and `output/survey-record/<Project>_AreasAndConsistency.pdf` all appear.
2. `output/calculations/Comprehensive_Latest.pdf` still exists (collated whole).
3. The lodgement letter now ticks Field book, Coordinate List and Calculations, and (via calculations) the record sections that previously showed missing.

- [ ] **Step 6: Commit**

```bash
git add "app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue" "app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue"
git commit -m "feat(record): save per-section split files from both comprehensive-record views"
```

---

## Self-Review

**Spec coverage:**
- A. Expose section blobs (two-pass) → Task 2. ✓
- A. Expose areas-only blob → Task 3. ✓
- B. Save split files (composable, best-effort, project-prefixed names, overwrite) → Task 5, wired in Task 6. ✓
- B. `saveDocument` areas-consistency→survey-record mapping → Task 4. ✓
- C. Folder-aware matcher (restore relDir; generated=folder+keyword, external=input keyword) → Task 1. ✓
- D. Rolling snapshots on each generation from both views → Task 6. ✓
- E. Best-effort error handling → Task 5 (logic) + Task 6 (surfacing); tests in Tasks 1/4/5; manual QA in Task 6. ✓

**Placeholder scan:** No TBD/TODO; each code step shows full code; commands have expected output. The two generator-exposure tasks (2, 3) use smoke tests with concrete minimal fixtures, with an explicit DONE_WITH_CONCERNS escape if a generator needs heavier setup.

**Type consistency:** `ManifestFile {name, relDir}`, `resolveLodgementDocuments(ManifestFile[])`, `TwoPassDocumentResult.sections`, `generateWithTwoPass(...).sections {cover,fieldBook,coordinateList,calculations}`, `generateAreaConsistencyPDF → {merged, areasOnly}`, `ComprehensivePDFResult.areasOnlyBlob`, `resolveTargetFolder`, `'areas-consistency'`, `saveSurveyRecordSections({workingDirectory, projectName, sections:{fieldBook,coordinateList,calculations,areas}})` are named identically across defining and consuming tasks.

## Notes / risks

- The generator smoke tests (Tasks 2–3) run jsPDF + pdf-lib under Vitest's jsdom env (the same stack the shipped `coverPage.test.ts` uses). If a section generator throws on the minimal fixture, the task should report DONE_WITH_CONCERNS with the exact error rather than inflating the fixture.
- Line numbers in this plan are indicative; anchor edits on the quoted code.
- The cover/letter blob is exposed (Task 2) but intentionally not saved as a file (out of scope per spec).

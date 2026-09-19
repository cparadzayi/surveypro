# Field Book Cover and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the electronic field book a cover page, move the site calibration to E1, and replace five independent page-numbering derivations with one shared module.

**Architecture:** A new pure module `fieldBookPagination.ts` owns every field-book page-number decision. The renderer, the measurement pass, the Calculations F/B lookup and both `pageAllocation` derivations all call it instead of doing their own arithmetic. The cover is an unnumbered physical page; the calibration takes E1 when a survey has one, and points follow. Two new per-project columns feed the cover's "Assisted by" and instrument rows.

**Tech Stack:** Vue 3 + TypeScript frontend, jsPDF for document generation, Vitest for frontend tests. Fastify 5 backend (ESM), PostgreSQL with per-surveyor schemas, Jest for backend tests.

**Spec:** `docs/superpowers/specs/2026-09-18-field-book-cover-and-pagination-design.md`

## Global Constraints

- **Frontend tests:** `cd app-frontend && npx vitest run <path>`. The whole suite is `npx vitest run`.
- **Backend tests:** the backend is ESM, so bare `npx jest` fails. From `app-backend`, use
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`.
- **Line endings:** after editing, always check `git diff --stat`. A diffstat wildly out of
  proportion to the change means line endings flipped; fix with `sed -i 's/\r$//' <file>` and
  re-check before committing.
- **Never edit an existing migration.** Add a new numbered file. The next number is `089`.
- **`pointsPerPage` is 27** and after Task 5 exists only as `FIELD_BOOK_POINTS_PER_PAGE` in
  `fieldBookPagination.ts`.
- **E-number rules:** calibration is `E1` when present; points follow from `E2`. With no
  calibration, points start at `E1`. The cover is never numbered.
- **`.vue` files have no test harness** in this repo (no `@vue/test-utils`, no `vue-tsc`). They
  verify as "suite green + `npm run build` compiles" plus the manual steps written into the task.
- **Existing records are not preserved** under the old numbering. No compatibility shim.

## File Structure

**Created:**
- `app-frontend/src/utils/fieldBookPagination.ts` — the only place field-book page numbers are decided.
- `app-frontend/src/utils/__tests__/fieldBookPagination.test.ts` — unit tests for the module.
- `app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts` — the cross-consumer guard.
- `app-frontend/src/utils/__tests__/fieldBookCover.test.ts` — cover render tests.
- `app-backend/migrations/089_add_assistant_and_instruments_to_projects.do.sql` — the four new columns.

**Modified:**
- `app-frontend/src/utils/field-book.ts` — calibration first, cover page, new metadata fields.
- `app-frontend/src/utils/TwoPassDocumentGenerator.ts` — measurement via the module, plus a page-count guard.
- `app-frontend/src/utils/calculations-part1.ts` — F/B lookup via the module.
- `app-frontend/src/services/pageAllocation.ts` — both derivations via the module.
- `app-backend/src/models/SurveyProject.js` — `allowedColumns` gains the four new columns.
- `app-backend/src/routes/survey-projects.js` — accepts and forwards them.
- `app-frontend/src/composables/useCadastralWorkflow.ts` — `surveyorInfo` gains four fields.
- `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` — form inputs.

---

### Task 1: The pagination module

**Files:**
- Create: `app-frontend/src/utils/fieldBookPagination.ts`
- Test: `app-frontend/src/utils/__tests__/fieldBookPagination.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FIELD_BOOK_POINTS_PER_PAGE: number`, `paginateFieldBook(points: FieldBookPaginationPoint[], opts: { hasCalibration: boolean; hasCover: boolean }): FieldBookPagination`, and the types `FieldBookPaginationPoint = { id: string }` and `FieldBookPagination = { pointPageMap: Record<string, string>; calibrationPage: string | null; ePageCount: number; physicalPageCount: number }`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/fieldBookPagination.test.ts`:

```ts
/**
 * Field book pagination — the single source of every E-number.
 *
 * The site calibration is the evidence the GNSS work was tied to the local grid,
 * so it opens the book at E1 and the observed points follow. A survey with no
 * calibration has no such page, and its points start at E1 instead. The cover is
 * a title page: it is physically first and carries no number at all, so adding it
 * must never move a point.
 */

import { describe, it, expect } from 'vitest';
import { paginateFieldBook, FIELD_BOOK_POINTS_PER_PAGE } from '../fieldBookPagination';

const points = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `P${i + 1}` }));

const noCover = { hasCover: false };

describe('paginateFieldBook', () => {
  it('fits exactly 27 points on a page', () => {
    expect(FIELD_BOOK_POINTS_PER_PAGE).toBe(27);
  });

  describe('without a site calibration', () => {
    it('starts the points at E1', () => {
      const { pointPageMap, calibrationPage } = paginateFieldBook(
        points(1), { hasCalibration: false, ...noCover },
      );

      expect(pointPageMap.P1).toBe('E1');
      expect(calibrationPage).toBeNull();
    });

    it('keeps a full page of points on E1', () => {
      const { pointPageMap, ePageCount } = paginateFieldBook(
        points(27), { hasCalibration: false, ...noCover },
      );

      expect(pointPageMap.P27).toBe('E1');
      expect(ePageCount).toBe(1);
    });

    it('spills the 28th point onto E2', () => {
      const { pointPageMap, ePageCount } = paginateFieldBook(
        points(28), { hasCalibration: false, ...noCover },
      );

      expect(pointPageMap.P27).toBe('E1');
      expect(pointPageMap.P28).toBe('E2');
      expect(ePageCount).toBe(2);
    });
  });

  describe('with a site calibration', () => {
    it('gives the calibration E1 and starts the points at E2', () => {
      const { pointPageMap, calibrationPage } = paginateFieldBook(
        points(1), { hasCalibration: true, ...noCover },
      );

      expect(calibrationPage).toBe('E1');
      expect(pointPageMap.P1).toBe('E2');
    });

    it('spills the 28th point onto E3, one further than without', () => {
      const { pointPageMap, ePageCount } = paginateFieldBook(
        points(28), { hasCalibration: true, ...noCover },
      );

      expect(pointPageMap.P27).toBe('E2');
      expect(pointPageMap.P28).toBe('E3');
      expect(ePageCount).toBe(3);
    });
  });

  describe('the cover', () => {
    it('adds a physical page without moving any point', () => {
      const withoutCover = paginateFieldBook(points(30), { hasCalibration: true, hasCover: false });
      const withCover = paginateFieldBook(points(30), { hasCalibration: true, hasCover: true });

      expect(withCover.pointPageMap).toEqual(withoutCover.pointPageMap);
      expect(withCover.calibrationPage).toBe(withoutCover.calibrationPage);
      expect(withCover.ePageCount).toBe(withoutCover.ePageCount);
      expect(withCover.physicalPageCount).toBe(withoutCover.physicalPageCount + 1);
    });
  });

  describe('an empty survey', () => {
    it('reports no pages rather than inventing one', () => {
      const result = paginateFieldBook([], { hasCalibration: false, hasCover: false });

      expect(result.pointPageMap).toEqual({});
      expect(result.ePageCount).toBe(0);
      expect(result.physicalPageCount).toBe(0);
    });

    it('still numbers a calibration that exists without points', () => {
      const result = paginateFieldBook([], { hasCalibration: true, hasCover: true });

      expect(result.calibrationPage).toBe('E1');
      expect(result.ePageCount).toBe(1);
      expect(result.physicalPageCount).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookPagination.test.ts`
Expected: FAIL — the module does not exist, so the import cannot resolve.

- [ ] **Step 3: Write the module**

Create `app-frontend/src/utils/fieldBookPagination.ts`:

```ts
/**
 * Every field-book page number is decided here, and nowhere else.
 *
 * This used to be derived independently in five places — the renderer, the
 * measurement pass, the Calculations F/B lookup, and twice in pageAllocation —
 * which is how one of them came to paginate at 20 points per page while the rest
 * used 27, quietly mis-citing every point past the 20th. Cross-references in a
 * survey record are only as trustworthy as the arithmetic behind them, so there
 * is now one function and one constant.
 */

/** Rows that fit on one field book page: A4 portrait less margins and header. */
export const FIELD_BOOK_POINTS_PER_PAGE = 27;

export interface FieldBookPaginationPoint {
  id: string;
}

export interface FieldBookPagination {
  /** point id -> E-number, e.g. "E2" */
  pointPageMap: Record<string, string>;
  /** E-number of the calibration page, or null when the survey has none */
  calibrationPage: string | null;
  /** numbered (E) pages */
  ePageCount: number;
  /** physical pages, including the unnumbered cover */
  physicalPageCount: number;
}

/**
 * Number the pages of a field book.
 *
 * `points` must be EXACTLY the points the field book will render, in render
 * order. Calculated points never appear in the field book, so a caller that
 * passes an unfiltered list shifts every E-number after the first calculated
 * point. This function does not filter; it paginates what it is given.
 */
export function paginateFieldBook(
  points: FieldBookPaginationPoint[],
  opts: { hasCalibration: boolean; hasCover: boolean },
): FieldBookPagination {
  const { hasCalibration, hasCover } = opts;

  // The calibration opens the book, so every point page sits one later.
  const offset = hasCalibration ? 1 : 0;

  const pointPageMap: Record<string, string> = {};
  points.forEach((point, index) => {
    const page = Math.floor(index / FIELD_BOOK_POINTS_PER_PAGE) + 1 + offset;
    pointPageMap[point.id] = `E${page}`;
  });

  const pointPages = Math.ceil(points.length / FIELD_BOOK_POINTS_PER_PAGE);
  const ePageCount = pointPages + offset;

  return {
    pointPageMap,
    calibrationPage: hasCalibration ? 'E1' : null,
    ePageCount,
    physicalPageCount: ePageCount + (hasCover ? 1 : 0),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookPagination.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/fieldBookPagination.ts app-frontend/src/utils/__tests__/fieldBookPagination.test.ts
git commit -m "feat(field-book): one module owns every field book page number

The calibration opens the book at E1 and points follow; with no calibration
points start at E1. The cover is physical but unnumbered, so it never moves a
point. Callers must pass exactly the points that will be rendered -- the
function paginates, it does not filter."
```

---

### Task 2: Render the calibration first

**Files:**
- Modify: `app-frontend/src/utils/field-book.ts:49-105` (`generateFieldBookPDF`)
- Test: `app-frontend/src/utils/__tests__/fieldBookCalibration.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: `paginateFieldBook`, `FieldBookPagination` from Task 1.
- Produces: `generateFieldBookPDF` keeps its signature but its returned `pageCount` now counts **physical** pages, and its `pointPageMap` reflects the calibration offset.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/fieldBookCalibration.test.ts`:

```ts
describe('where the calibration sits in the book', () => {
  it('opens the book, pushing the points to E2', async () => {
    const points = Array.from({ length: 3 }, (_, i) => ({
      id: `P${i + 1}`, y: i, x: i, status: 'P', description: 'peg', surveyDate: '2026-01-01',
    }));

    const result = await new FieldBookGenerator().generateFieldBookPDF(
      points,
      { surveyorName: 'C. Paradzayi' },
      horizontalOnlyCalibration(),
    );

    expect(result.pointPageMap.P1).toBe('E2');
    expect(result.pageCount).toBe(2);
  });

  it('leaves the points on E1 when there is no calibration', async () => {
    const points = [{ id: 'P1', y: 0, x: 0, status: 'P', description: 'peg', surveyDate: '2026-01-01' }];

    const result = await new FieldBookGenerator().generateFieldBookPDF(
      points,
      { surveyorName: 'C. Paradzayi' },
    );

    expect(result.pointPageMap.P1).toBe('E1');
    expect(result.pageCount).toBe(1);
  });
});
```

The fixture is already in that file: `parseSiteCalibration(sampleXml)`, where `sampleXml` is
imported as `import sampleXml from './fixtures/siteCalibrationReport.xml?raw'`. Use it; do not
invent a second one. Replace `horizontalOnlyCalibration()` above with `parseSiteCalibration(sampleXml)`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookCalibration.test.ts`
Expected: FAIL — `pointPageMap.P1` is `"E1"`, not `"E2"`, because the calibration is still rendered last.

- [ ] **Step 3: Rewrite the generation flow**

In `app-frontend/src/utils/field-book.ts`, add the import at the top:

```ts
import { paginateFieldBook, FIELD_BOOK_POINTS_PER_PAGE } from './fieldBookPagination';
```

Replace the body of `generateFieldBookPDF` from `const pdf = new jsPDF(this.options);` through
the `return` with:

```ts
    const pdf = new jsPDF(this.options);

    const pagination = paginateFieldBook(points, {
      hasCalibration: Boolean(calibration),
      hasCover: false, // Task 10 turns this on
    });
    this.pointPageMap = pagination.pointPageMap;

    console.log('[FieldBook] Generating field book with', points.length, 'points');

    let isFirstPage = true;
    const startPage = () => {
      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;
    };

    // The calibration opens the book: it is the evidence the GNSS observations
    // were tied to the local grid, so it precedes the observations themselves.
    if (calibration) {
      startPage();
      this.generateCalibrationPage(pdf, calibration, 1, metadata);
      console.log('[FieldBook] Generated calibration page E1');
    }

    const totalPointPages = Math.ceil(points.length / FIELD_BOOK_POINTS_PER_PAGE);
    for (let pageIndex = 0; pageIndex < totalPointPages; pageIndex++) {
      startPage();

      const startIndex = pageIndex * FIELD_BOOK_POINTS_PER_PAGE;
      const pagePoints = points.slice(startIndex, startIndex + FIELD_BOOK_POINTS_PER_PAGE);

      // Every point on this page carries the same E-number, so read it off the
      // map rather than recomputing it here.
      const pageLabel = pagination.pointPageMap[pagePoints[0].id];
      const pageNumber = Number(pageLabel.slice(1));

      this.generateFieldBookPage(pdf, pagePoints, pageNumber, metadata);
      console.log(`[FieldBook] Generated page ${pageLabel}: ${pagePoints.length} points`);
    }

    console.log('[FieldBook] ✅ Point page map created:', Object.keys(this.pointPageMap).length, 'points tracked');

    return {
      pdf,
      pageCount: pagination.physicalPageCount,
      pointPageMap: this.pointPageMap,
    };
```

Then update the `calibration` parameter's docstring, which currently states the opposite:

```ts
    /**
     * Optional GNSS site calibration. Rendered FIRST, as E1, with the point pages
     * following from E2. Every E-number therefore depends on whether a survey has
     * a calibration, which is why pagination is decided once in
     * fieldBookPagination.ts and read from there by every consumer.
     */
    calibration?: SiteCalibration
```

Finally update the method's own docstring: it says "E1-E99 pages only, no cover" — replace
"no cover" wording only after Task 10; for now change "E1-E99 pages only" to
"calibration page then point pages".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookCalibration.test.ts`
Expected: PASS for the new cases. Two existing tests in that file encode the OLD rule and will
fail. Rewrite them to the new rule rather than deleting them — they are still the right
questions, with different answers:

- `'appends the calibration after the point pages, adding exactly one page'` becomes
  `'opens the book with the calibration, adding exactly one page'`. It still asserts
  `withCal.pageCount === withoutCal.pageCount + 1`; only the placement claim changes.
- `'leaves every point page label untouched'` asserted the opposite of the new behaviour and
  becomes `'moves every point page label down one'`: with the 30-point fixture,
  `withoutCal.pointPageMap.P1 === 'E1'` and `withCal.pointPageMap.P1 === 'E2'`, and likewise
  `P30` moves from `'E2'` to `'E3'`.

The test `'is byte-for-byte unchanged when no calibration is supplied'` must still pass — nothing
about the no-calibration path changes in this task.

- [ ] **Step 5: Run the whole frontend suite**

Run: `cd app-frontend && npx vitest run`
Expected: failures only in `TwoPassDocumentGenerator`, `calculations-part1` and `pageAllocation`
consumers, which Tasks 3–5 convert. Note which ones fail; they are your checklist.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/field-book.ts app-frontend/src/utils/__tests__/fieldBookCalibration.test.ts
git commit -m "feat(field-book): the site calibration opens the book at E1

It was deliberately rendered last so no point's E-number would move. Moving it
first renumbers every point page, which is why the page numbers now come from
fieldBookPagination rather than from arithmetic repeated at each call site.
pageCount becomes a count of physical pages."
```

---

### Task 3: Measurement pass and the page-count guard

**Files:**
- Modify: `app-frontend/src/utils/TwoPassDocumentGenerator.ts:248-270` (`measureFieldBook`), and `:176-181` (the render step)
- Test: `app-frontend/src/utils/__tests__/twoPassSections.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: `paginateFieldBook` from Task 1; `generateFieldBookPDF`'s physical `pageCount` from Task 2.
- Produces: `measureFieldBook` returns the same `FieldBookMeasurement` shape; `pages` is now physical pages, matching what the renderer returns.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/twoPassSections.test.ts`:

```ts
describe('field book page-count guard', () => {
  it('measures the same number of pages it renders, calibration included', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      ...baseData,
      siteCalibration: { /* reuse the fixture already used elsewhere in this file */ },
    } as any);

    // A mismatch throws inside generateWithTwoPass, so reaching here is the
    // assertion; the explicit check documents what is being guarded.
    expect(result.sections.fieldBook).toBeInstanceOf(Blob);
  });
});
```

If `baseData` in that file has no site calibration fixture, build one from the same source
`fieldBookCalibration.test.ts` uses.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/twoPassSections.test.ts`
Expected: FAIL — the measurement pass still starts points at E1 and omits the calibration offset,
so measured and rendered counts disagree. Before Step 3 the mismatch is silent, so this test may
pass for the wrong reason; if it does, add the guard (Step 3b) FIRST and re-run to see it fail.

- [ ] **Step 3a: Convert the measurement**

In `app-frontend/src/utils/TwoPassDocumentGenerator.ts`, add the import:

```ts
import { paginateFieldBook } from './fieldBookPagination'
```

Replace the whole body of `measureFieldBook` with:

```ts
  private measureFieldBook(data: TwoPassDocumentData): FieldBookMeasurement {
    // The calibration opens the book at E1, so it DOES move every point -- the
    // opposite of the rule this method used to encode. fieldBookPagination is the
    // single place that decision lives.
    const pagination = paginateFieldBook(
      data.surveyPoints.map(pt => ({ id: pt.pointId })),
      { hasCalibration: Boolean(data.siteCalibration), hasCover: false },
    )

    return {
      pages: pagination.physicalPageCount,
      startPage: 1,
      endPage: pagination.physicalPageCount,
      pointsPerPage: FIELD_BOOK_POINTS_PER_PAGE,
      totalPoints: data.surveyPoints.length,
      pointPageMap: pagination.pointPageMap
    }
  }
```

Add `FIELD_BOOK_POINTS_PER_PAGE` to the import from `./fieldBookPagination`.

- [ ] **Step 3b: Add the guard**

In the same file, replace the field book render block (currently logging
`measurements.fieldBook.pages`):

```ts
    // 1. Generate Field Book
    console.log('  📘 Rendering Field Book...')
    const fieldBookResult = await this.renderFieldBook(data)
    pdfs.push(fieldBookResult.pdf)

    // The beacon-comparison section has always been guarded this way; the field
    // book was only logged. A field book whose rendered length disagrees with the
    // measured one renumbers every section after it, silently, so it throws too.
    if (fieldBookResult.pageCount !== measurements.fieldBook.pages) {
      throw new Error(
        `Field Book page count mismatch. ` +
        `Pass 1 measured ${measurements.fieldBook.pages} pages, ` +
        `Pass 2 rendered ${fieldBookResult.pageCount}.`
      )
    }
    console.log(`     ✓ ${fieldBookResult.pageCount} pages generated`)
    console.log(`     ✓ ${Object.keys(fieldBookResult.pointPageMap).length} points tracked`)
```

`renderFieldBook` must return `pageCount`; it already returns `{ pdf, pointPageMap }` at
`:450-453`, so add `pageCount: result.pageCount` to that return and to its declared type at
`:408-411`.

- [ ] **Step 4: Run the tests**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/twoPassSections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/TwoPassDocumentGenerator.ts app-frontend/src/utils/__tests__/twoPassSections.test.ts
git commit -m "feat(field-book): measure pagination from the shared module, and guard it

measureFieldBook encoded the old rule that a calibration never moves a point.
It now calls fieldBookPagination like every other consumer. Adds the
measured-vs-rendered guard the beacon-comparison section already had: a field
book that renders a different length than it measured renumbers every later
section, so it must fail loudly rather than be logged."
```

---

### Task 4: The Calculations F/B lookup

**Files:**
- Modify: `app-frontend/src/utils/calculations-part1.ts:51-86` (`generateFieldBookPageLookup`)
- Test: `app-frontend/src/utils/__tests__/calculatedPointReferences.test.ts` (exists — extend it)

**Interfaces:**
- Consumes: `paginateFieldBook` from Task 1.
- Produces: `generateFieldBookPageLookup` keeps its signature `(surveyPoints: SurveyPoint[]) => Record<string, string>` and keeps returning `'-'` for calculated points.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/calculatedPointReferences.test.ts`:

```ts
describe('the F/B page a calculation cites', () => {
  it('counts only the points the field book actually renders', async () => {
    // A calculated point is not in the field book, so it must not consume an
    // E-page slot -- the observed point after it stays on the same page.
    const observed = Array.from({ length: 27 }, (_, i) => ({
      pointId: `P${i + 1}`, y: i, x: i, status: 'P',
      description: 'iron peg', surveyDate: '2026-01-01',
    }));
    const calculated = {
      pointId: 'C1', y: 0, x: 0, status: 'C',
      description: 'CALCULATED', surveyDate: '2026-01-01',
    };

    const gen = new CalculationsPart1Generator();
    const result: any = await gen.generateCalculationsPart1PDF(
      [...observed.slice(0, 5), calculated, ...observed.slice(5)],
      surveyorInfo,
    );
    const byId = Object.fromEntries(
      result.adjustedCoordinates.map((c: any) => [c.pointId, c.fieldBookPage]),
    );

    expect(byId.C1).toBe('-');
    expect(byId.P27).toBe('E1'); // still the 27th RENDERED point
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/calculatedPointReferences.test.ts`
Expected: this may already PASS, because the existing code filters before paginating. That is
fine and expected — it is a characterisation test locking in behaviour the refactor must not
break. Record that it passed before the change, then continue.

- [ ] **Step 3: Convert the lookup**

In `app-frontend/src/utils/calculations-part1.ts`, add the import:

```ts
import { paginateFieldBook } from './fieldBookPagination'
```

Replace the pagination half of `generateFieldBookPageLookup` — everything from
`const sortedPoints = [...fieldBookPoints]` to the `lookupStore` call — with:

```ts
    // The field book renders only observed points, so pagination sees only those.
    // Whether the book opens with a calibration page is not knowable here, so this
    // lookup is the ESTIMATE used when the real map is unavailable; the two-pass
    // path overwrites it with FieldBookGenerator's actual pointPageMap.
    const { pointPageMap } = paginateFieldBook(
      fieldBookPoints.map(pt => ({ id: pt.pointId })),
      { hasCalibration: false, hasCover: false },
    )
    Object.assign(lookup, pointPageMap)

    // Persist lookup in Pinia for canonical reference
    const lookupStore = useSurveyLookupStore();
    lookupStore.setFieldBookPageLookup(lookup);
    return lookup;
```

Note the `Object.assign` order: calculated points were already written as `'-'` into `lookup`
by the filter above, and they are absent from `pointPageMap`, so they survive.

- [ ] **Step 4: Run the tests**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/calculatedPointReferences.test.ts src/utils/__tests__/calculationsPart1Conflicts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/calculations-part1.ts app-frontend/src/utils/__tests__/calculatedPointReferences.test.ts
git commit -m "refactor(calculations): take F/B page numbers from the shared module

Keeps the calculated-point filter and its '-' marker -- calculated points are
not in the field book and must not consume an E-page slot. Documents that this
lookup is the estimate used when the real map is unavailable; the two-pass path
overwrites it with the renderer's actual map."
```

---

### Task 5: Both pageAllocation derivations

**Files:**
- Modify: `app-frontend/src/services/pageAllocation.ts:177-188` (`calculateFieldBookPages`), `:236-256` (`createFieldBookLookup`)
- Test: `app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts` (created in Task 6 — write the fix first, then Task 6 proves it)

**Interfaces:**
- Consumes: `paginateFieldBook` from Task 1.
- Produces: `calculateFieldBookPages(observations: any[]) => number` and `createFieldBookLookup(observations: any[]) => Record<string, string>`, both unchanged in signature.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts` with just this first
case (Task 6 adds the rest):

```ts
/**
 * createFieldBookLookup paginated at 20 points per page while every other
 * derivation used 27, so it mis-cited every point past the 20th. It is reachable
 * only from the deprecated generateComprehensiveDocument, which is why nobody
 * noticed. This pins it to the shared module.
 */

import { describe, it, expect } from 'vitest';
import { PageAllocationService } from '../../services/pageAllocation';
import { paginateFieldBook } from '../fieldBookPagination';

describe('pageAllocation field book lookup', () => {
  it('agrees with the shared module past the 20th point', () => {
    const observations = Array.from({ length: 30 }, (_, i) => ({ pointId: `P${i + 1}` }));

    const lookup = new PageAllocationService().createFieldBookLookup(observations);
    const expected = paginateFieldBook(
      observations.map(o => ({ id: o.pointId })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;

    expect(lookup.P21).toBe('E1'); // was "E2" under the 20-per-page bug
    expect(lookup).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookPaginationParity.test.ts`
Expected: FAIL — `expected 'E2' to be 'E1'`, the 20-vs-27 bug.

- [ ] **Step 3: Convert both**

In `app-frontend/src/services/pageAllocation.ts`, add the import:

```ts
import { paginateFieldBook } from '@/utils/fieldBookPagination';
```

Replace `calculateFieldBookPages`. It feeds TWO different things in
`calculateAllPageNumbers` — the physical page range AND the `E` display range — which were the
same number until the cover existed. It must now return both:

```ts
  private calculateFieldBookPages(observations: any[]): { ePages: number; physicalPages: number } {
    const { ePageCount, physicalPageCount } = paginateFieldBook(
      (observations || []).map(obs => ({ id: obs.pointId })),
      // The cover is a physical page that carries no E-number, so the two counts
      // differ by one and cannot be conflated the way they were before it existed.
      { hasCalibration: false, hasCover: true },
    );

    // At least one page even for an empty survey, and the SGO caps the book at 99.
    const ePages = Math.min(Math.max(ePageCount, 1), 99);
    return { ePages, physicalPages: Math.max(physicalPageCount, ePages) };
  }
```

Then update its caller. At `pageAllocation.ts:90` the result is destructured, and the `fieldBook`
block at `:126-133` uses each count for the range it actually governs:

```ts
    const { ePages, physicalPages } = this.calculateFieldBookPages(data.observations || []);
```

```ts
    // Field Book: the cover is physical but unnumbered, so the physical span is
    // one longer than the E span.
    const fieldBook = {
      physicalStart: currentPhysicalPage,
      physicalEnd: currentPhysicalPage + physicalPages - 1,
      displayStart: 'E1',
      displayEnd: `E${ePages}`,
      pageCount: physicalPages
    };
    currentPhysicalPage += physicalPages;
```

`pageCount` is physical, matching what `generateFieldBookPDF` returns, so the Task 6 parity test
compares like with like. Any other reader of `fieldBookPageCount` in this file must be updated to
name one of the two explicitly — grep for it before moving on.

Replace `createFieldBookLookup`:

```ts
  createFieldBookLookup(observations: any[]): Record<string, string> {
    // Was 20 points per page here and 27 everywhere else, so every point past the
    // 20th got the wrong E-number.
    return paginateFieldBook(
      (observations || []).filter(obs => obs.pointId).map(obs => ({ id: obs.pointId })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;
  }
```

- [ ] **Step 4: Run the test**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookPaginationParity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/services/pageAllocation.ts app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts
git commit -m "fix(page-allocation): correct the 20-points-per-page field book lookup

createFieldBookLookup paginated at 20 while every other derivation used 27, so
it mis-cited every point past the 20th. Only the deprecated comprehensive-
document path reaches it, which is why it went unnoticed. Both this and
calculateFieldBookPages now call the shared module."
```

---

### Task 6: The cross-consumer parity guard

**Files:**
- Modify: `app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: nothing; this is the regression guard.

- [ ] **Step 1: Write the test**

Append to `app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts`:

```ts
import { setActivePinia, createPinia } from 'pinia';
import { FieldBookGenerator } from '../field-book';
import { CalculationsPart1Generator } from '../calculations-part1';

const surveyorInfo = {
  name: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
  surveyDate: '2026-01-01', projectTitle: 'Test',
};

describe('every consumer agrees on a point E-number', () => {
  beforeEach(() => setActivePinia(createPinia()));

  // 30 points crosses the 27-per-page boundary, so a consumer using a different
  // page size disagrees here even though it would match on a short survey.
  const ids = Array.from({ length: 30 }, (_, i) => `P${i + 1}`);

  it('renderer, Calculations and page allocation produce the same map', async () => {
    const fieldBookPoints = ids.map((id, i) => ({
      id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));
    const surveyPoints = ids.map((id, i) => ({
      pointId: id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));

    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' },
    );

    const calcs: any = await new CalculationsPart1Generator()
      .generateCalculationsPart1PDF(surveyPoints, surveyorInfo);
    const fromCalcs = Object.fromEntries(
      calcs.adjustedCoordinates.map((c: any) => [c.pointId, c.fieldBookPage]),
    );

    const fromAllocation = new PageAllocationService()
      .createFieldBookLookup(surveyPoints.map(p => ({ pointId: p.pointId })));

    expect(fromCalcs).toEqual(rendered.pointPageMap);
    expect(fromAllocation).toEqual(rendered.pointPageMap);
  });

  it('the renderer and page allocation agree on how many pages that is', async () => {
    const fieldBookPoints = ids.map((id, i) => ({
      id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));

    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' },
    );
    const allocation = new PageAllocationService().calculateAllPageNumbers({
      observations: ids.map(id => ({ pointId: id })),
    } as any);

    // Both are PHYSICAL counts: the cover is a page that carries no E-number.
    expect(allocation.fieldBook.pageCount).toBe(rendered.pageCount);
    expect(allocation.fieldBook.displayEnd).toBe(`E${Math.ceil(ids.length / 27)}`);
  });
});
```

If `calculateAllPageNumbers` requires more of its argument than `observations`, read its
signature at `pageAllocation.ts:90` and supply the minimum it needs; do not stub the method.

- [ ] **Step 2: Run the test**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookPaginationParity.test.ts`
Expected: PASS. If the Calculations map disagrees, check it was given the same point list —
Calculations filters calculated points, so this fixture deliberately contains none.

- [ ] **Step 3: Prove the guard bites**

Temporarily change `FIELD_BOOK_POINTS_PER_PAGE` to `26` in `fieldBookPagination.ts` and re-run.
Expected: the parity tests still pass (all consumers moved together) but
`fieldBookPagination.test.ts` fails on the 27-per-page assertion. Then temporarily hardcode `20`
back inside `createFieldBookLookup` and re-run: the parity test must FAIL. Revert both probes.

This step is what distinguishes a guard from a test that merely passes.

- [ ] **Step 4: Run the whole frontend suite**

Run: `cd app-frontend && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/__tests__/fieldBookPaginationParity.test.ts
git commit -m "test(field-book): pin every pagination consumer to the same E-numbers

Drives the renderer, Calculations and both page-allocation derivations from one
30-point input -- past the 27-per-page boundary, where a consumer with its own
page size disagrees. Verified the guard bites by reintroducing the 20-per-page
bug and watching it fail."
```

---

### Task 7: The migration

**Files:**
- Create: `app-backend/migrations/089_add_assistant_and_instruments_to_projects.do.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `assisted_by`, `instrument_description`, `instrument_base_serial`, `instrument_rover_serial` on `survey_projects` in every surveyor schema, in `public`, and in the schema-creation template.

- [ ] **Step 1: Write the migration**

Create `app-backend/migrations/089_add_assistant_and_instruments_to_projects.do.sql`:

```sql
-- Migration 089: the field book cover names the assistant and the instruments.
--
-- The cover (cadastral-standard/1 fieldbook cover.pdf) prints "Assisted by" and
-- an instrument block giving make/model with Base and Rover serial numbers. The
-- existing free-text `instruments` column holds that block as typed prose; these
-- columns hold it as data so the cover's layout does not depend on typing. The
-- old column is left in place and read as a fallback for projects predating this.

DO $$
DECLARE
  schema_rec RECORD;
  col TEXT;
  cols TEXT[] := ARRAY[
    'assisted_by VARCHAR(255)',
    'instrument_description VARCHAR(255)',
    'instrument_base_serial VARCHAR(100)',
    'instrument_rover_serial VARCHAR(100)'
  ];
BEGIN
  -- Every surveyor schema. Read from information_schema rather than
  -- surveyor_profiles: a schema whose profile row is missing or stale still
  -- needs the columns.
  FOR schema_rec IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'surveyor_%'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = schema_rec.schema_name AND table_name = 'survey_projects'
    ) THEN
      FOREACH col IN ARRAY cols LOOP
        EXECUTE format(
          'ALTER TABLE %I.survey_projects ADD COLUMN IF NOT EXISTS %s',
          schema_rec.schema_name, col
        );
      END LOOP;
      RAISE NOTICE 'Patched %.survey_projects', schema_rec.schema_name;
    END IF;
  END LOOP;

  -- public too, if it has the table
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'survey_projects'
  ) THEN
    FOREACH col IN ARRAY cols LOOP
      EXECUTE format('ALTER TABLE public.survey_projects ADD COLUMN IF NOT EXISTS %s', col);
    END LOOP;
    RAISE NOTICE 'Patched public.survey_projects';
  END IF;
END;
$$;
```

- [ ] **Step 2: Extend the schema-creation template**

In the same file, append a `CREATE OR REPLACE FUNCTION create_surveyor_schema(...)` that is a
copy of the definition in `app-backend/migrations/079.do.sql` with the four columns added to its
`survey_projects` CREATE TABLE.

Read `079.do.sql` and copy its function body verbatim, changing only the `survey_projects`
column list, which becomes:

```sql
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255),
      survey_type VARCHAR(100),
      township VARCHAR(255),
      designation TEXT,
      survey_date DATE,
      district VARCHAR(100),
      central_meridian VARCHAR(10),
      instruments VARCHAR(255),
      assisted_by VARCHAR(255),
      instrument_description VARCHAR(255),
      instrument_base_serial VARCHAR(100),
      instrument_rover_serial VARCHAR(100),
      datum VARCHAR(50),
      working_directory TEXT,
      status VARCHAR(50) DEFAULT ''active'',
      metadata JSONB,
      workflow_state JSONB DEFAULT ''{"completed_steps": [], "current_step": "project-setup", "step_data": {}, "generated_documents": {}, "can_finalize": false}''::jsonb,
      last_used TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
```

This step is the one that is easy to skip and was skipped by migrations 083–088. Without it, a
surveyor who registers after this deploy gets a `survey_projects` without these columns.

- [ ] **Step 3: Apply it**

Run: `cd app-backend && npm run migrate`
Expected: `NOTICE` lines naming each patched schema, no errors.

- [ ] **Step 4: Verify, including idempotency**

Run `npm run migrate` a second time. Expected: succeeds silently, no errors — `ADD COLUMN IF NOT
EXISTS` and `CREATE OR REPLACE` are both repeatable.

Then confirm the columns exist. In `psql`:

```sql
SELECT table_schema, column_name
FROM information_schema.columns
WHERE table_name = 'survey_projects'
  AND column_name IN ('assisted_by','instrument_description','instrument_base_serial','instrument_rover_serial')
ORDER BY table_schema, column_name;
```

Expected: four rows per surveyor schema.

- [ ] **Step 5: Commit**

```bash
git add app-backend/migrations/089_add_assistant_and_instruments_to_projects.do.sql
git commit -m "feat(db): per-project assistant and instrument columns for the field book cover

Adds assisted_by and the three instrument columns to survey_projects in every
surveyor schema, in public, and -- the step migrations 083-088 skipped -- in the
create_surveyor_schema template, so surveyors registering after this deploy get
them too. The free-text instruments column stays as a fallback for existing
projects; nothing is backfilled."
```

---

### Task 8: Persist the new fields

**Files:**
- Modify: `app-backend/src/models/SurveyProject.js:146-155` (`allowedColumns`)
- Modify: `app-backend/src/routes/survey-projects.js:128-140` (destructure), `:169-180` (create call)
- Test: `app-backend/src/routes/__tests__/surveyProjects.coverFields.test.js` (create)

**Interfaces:**
- Consumes: the columns from Task 7.
- Produces: the API accepts and returns `assistedBy`, `instrumentDescription`, `instrumentBaseSerial`, `instrumentRoverSerial`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/routes/__tests__/surveyProjects.coverFields.test.js`:

```js
/**
 * The field book cover names the assistant and the instruments, so the project
 * API must carry them. Validation runs before preHandler in Fastify's lifecycle,
 * so these assertions exercise the compiled schema without auth or a database.
 */

import { describe, test, expect } from '@jest/globals'
import SurveyProject from '../../models/SurveyProject.js'

describe('survey project cover fields', () => {
  test('update writes the four cover columns rather than skipping them', () => {
    // allowedColumns is the whitelist update() filters against; a column missing
    // from it is silently dropped with a console warning, which is how a field can
    // appear to save and not persist.
    const source = SurveyProject.update.toString()

    expect(source).toContain('assisted_by')
    expect(source).toContain('instrument_description')
    expect(source).toContain('instrument_base_serial')
    expect(source).toContain('instrument_rover_serial')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js surveyProjects.coverFields`
Expected: FAIL — `allowedColumns` does not list them.

- [ ] **Step 3: Add the columns to the whitelist**

In `app-backend/src/models/SurveyProject.js`, extend `allowedColumns`:

```js
      const allowedColumns = [
        'name', 'client_name', 'survey_type', 'survey_date', 'district',
        'central_meridian', 'working_directory', 'status', 'metadata',
        'workflow_state', 'last_used', 'datum', 'instruments', 'designation', 'township',
        'whole_portion', 'parent_property',
        'deed_of_transfer_no', 'parent_diagram_no', 'parent_diagram_annexed_to',
        'original_title_diagram_no', 'original_title_annexed_to', 'original_title_deed_no',
        'sr_no', 'file_no', 'gp_no', 'compilation',
        // Field book cover (migration 089)
        'assisted_by', 'instrument_description', 'instrument_base_serial', 'instrument_rover_serial'
      ]
```

- [ ] **Step 4: Forward them through the route**

In `app-backend/src/routes/survey-projects.js`, add to the POST destructure:

```js
        instruments,
        assistedBy,
        instrumentDescription,
        instrumentBaseSerial,
        instrumentRoverSerial,
        designation,
```

and to the `SurveyProject.create({...})` argument:

```js
        instruments,
        assistedBy,
        instrumentDescription,
        instrumentBaseSerial,
        instrumentRoverSerial,
        designation,
```

Note: `SurveyProject.create`'s INSERT deliberately writes only the columns migration 040 defined
— `instruments` and `designation` are accepted and dropped there, then written by the subsequent
`update` when project setup saves. The new fields follow that same existing route; do not widen
the INSERT.

- [ ] **Step 5: Run the test**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js surveyProjects.coverFields`
Expected: PASS.

- [ ] **Step 6: Run the backend suite**

Run: `cd app-backend && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app-backend/src/models/SurveyProject.js app-backend/src/routes/survey-projects.js app-backend/src/routes/__tests__/surveyProjects.coverFields.test.js
git commit -m "feat(api): carry the field book cover fields on the survey project

update() filters against an allowedColumns whitelist and silently drops anything
missing from it, so a field can appear to save without persisting. Adds the four
migration-089 columns there and forwards them from the route."
```

---

### Task 9: Capture them in project setup

**Files:**
- Modify: `app-frontend/src/composables/useCadastralWorkflow.ts:15-23` (`surveyorInfo`)
- Modify: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue:524-535` (the form), `:2002-2016` (`setupData` type), `:2152`, `:2184`, `:2206`, `:3231-3232`, `:3356`
- Test: none automated — `.vue` has no harness (see Global Constraints)

**Interfaces:**
- Consumes: the API from Task 8.
- Produces: `workflowState.surveyorInfo.assistedBy`, `.instrumentDescription`, `.instrumentBaseSerial`, `.instrumentRoverSerial`, all `string`.

- [ ] **Step 1: Extend the workflow state**

In `app-frontend/src/composables/useCadastralWorkflow.ts`:

```ts
  surveyorInfo: {
    landSurveyor: '',
    licenseNumber: '',
    firm: '',
    address: '',
    surveyDate: '',
    surveyOf: '',
    instruments: '',
    assistedBy: '',
    instrumentDescription: '',
    instrumentBaseSerial: '',
    instrumentRoverSerial: ''
  },
```

Also extend the restore block at `:408-417` so each new field is repopulated from
`latestStepWithSurveyorInfo.surveyor_info`, following the existing `landSurveyor` line exactly.

- [ ] **Step 2: Replace the textarea with structured inputs**

In `CadastralStandardView.vue`, replace the `lg:col-span-2` block containing the `instruments`
textarea with:

```html
            <div>
              <label for="assistedBy" class="block text-sm font-medium text-gray-700 mb-2">
                Assisted by
              </label>
              <input
                id="assistedBy"
                v-model="workflowState.surveyorInfo.assistedBy"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., R. T. Mapamula"
              />
            </div>

            <div>
              <label for="instrumentDescription" class="block text-sm font-medium text-gray-700 mb-2">
                Instrument
              </label>
              <input
                id="instrumentDescription"
                v-model="workflowState.surveyorInfo.instrumentDescription"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Trimble R6GNSS Set"
              />
            </div>

            <div>
              <label for="instrumentBaseSerial" class="block text-sm font-medium text-gray-700 mb-2">
                Base serial number
              </label>
              <input
                id="instrumentBaseSerial"
                v-model="workflowState.surveyorInfo.instrumentBaseSerial"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 5016424521"
              />
            </div>

            <div>
              <label for="instrumentRoverSerial" class="block text-sm font-medium text-gray-700 mb-2">
                Rover serial number
              </label>
              <input
                id="instrumentRoverSerial"
                v-model="workflowState.surveyorInfo.instrumentRoverSerial"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 5146476624"
              />
            </div>
```

- [ ] **Step 3: Thread the fields through the setup handler**

Add the four to the `setupData` parameter type at `:2002-2016`:

```ts
  instruments: string;
  assistedBy: string;
  instrumentDescription: string;
  instrumentBaseSerial: string;
  instrumentRoverSerial: string;
```

Then, at each of `:2152`, `:2184`, `:2206`, `:3231-3232` and `:3356`, add the four alongside the
existing `instruments` line, copying its exact form. For example `:2152` becomes:

```ts
  workflowState.surveyorInfo.instruments = setupData.instruments;
  workflowState.surveyorInfo.assistedBy = setupData.assistedBy;
  workflowState.surveyorInfo.instrumentDescription = setupData.instrumentDescription;
  workflowState.surveyorInfo.instrumentBaseSerial = setupData.instrumentBaseSerial;
  workflowState.surveyorInfo.instrumentRoverSerial = setupData.instrumentRoverSerial;
```

Grep to confirm none were missed: `grep -n "instruments" CadastralStandardView.vue` — every hit
that assigns or sends `instruments` needs the four siblings.

- [ ] **Step 4: Verify**

Run: `cd app-frontend && npx vitest run && npm run build`
Expected: suite green, build compiles.

Then manually, with backend and frontend running:
1. Open a cadastral-standard project, go to Project Setup.
2. Fill Assisted by, Instrument, Base serial, Rover serial. Save.
3. Reload the page. All four values must still be shown.
4. Check the database: `SELECT assisted_by, instrument_description, instrument_base_serial, instrument_rover_serial FROM <surveyor_schema>.survey_projects WHERE id = <project>;` — all four populated.

Step 3 is the one that catches a field missing from the restore block, and step 4 the one that
catches a field missing from `allowedColumns`.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useCadastralWorkflow.ts app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue
git commit -m "feat(project-setup): capture the assistant and instruments as fields

Replaces the free-text Instruments textarea, whose placeholder already taught
the cover's exact three-line format, with the four structured inputs. Two
editable homes for one fact is how they drift apart, so the textarea goes rather
than sitting alongside; the old column stays readable as a cover fallback."
```

---

### Task 10: The cover page

**Files:**
- Modify: `app-frontend/src/utils/field-book.ts:20-26` (`FieldBookMetadata`), `:49-105` (turn `hasCover` on), plus a new private `generateCoverPage`
- Test: `app-frontend/src/utils/__tests__/fieldBookCover.test.ts` (create)

**Interfaces:**
- Consumes: `paginateFieldBook` from Task 1; the metadata fields from Task 9.
- Produces: `FieldBookMetadata` gains `assistedBy?: string`, `instrumentDescription?: string`, `instrumentBaseSerial?: string`, `instrumentRoverSerial?: string`, `surveyOf?: string`, `address?: string` (the last already exists).

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/fieldBookCover.test.ts`:

```ts
/**
 * The field book cover, modelled on cadastral-standard/1 fieldbook cover.pdf.
 *
 * It is a title page: physically first, and carrying no E-number, so adding it
 * must not move a single point. A row whose value is absent is omitted entirely
 * rather than printed as an empty label -- a cover that names an assistant who
 * does not exist is worse than one that stays quiet.
 */

import { describe, it, expect } from 'vitest';
import { FieldBookGenerator } from '../field-book';

const points = [{ id: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }];

const metadata = {
  surveyorName: 'O Saunyama',
  assistedBy: 'R. T. Mapamula',
  surveyOf: '108, 167-256 ADVALOREM TOWNSHIP OF SHABANI MINE',
  surveyDate: 'June 2020',
  instrumentDescription: 'Trimble R6GNSS Set',
  instrumentBaseSerial: '5016424521',
  instrumentRoverSerial: '5146476624',
  address: 'BOX A1262\nAVONDALE\nHARARE',
};

const coverStream = async (meta: any): Promise<string> => {
  const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, meta);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const streams = raw.split('stream\n').slice(1).map(s => s.split('\nendstream')[0]);
  const cover = streams.find(s => s.includes('(ELECTRONIC FIELD BOOK)') && !s.includes('(Point)'));
  if (!cover) throw new Error('no cover page rendered');
  return cover;
};

describe('the field book cover', () => {
  it('names the surveyor, the assistant, the survey and the instruments', async () => {
    const stream = await coverStream(metadata);

    for (const label of ['Land Surveyor', 'Assisted by', 'Survey of', 'Surveyed in', 'Instruments', 'Address']) {
      expect(stream).toContain(`(${label})`);
    }
    expect(stream).toContain('(O Saunyama)');
    expect(stream).toContain('(R. T. Mapamula)');
    expect(stream).toContain('(5016424521)');
    expect(stream).toContain('(5146476624)');
  });

  it('omits a row whose value is absent', async () => {
    const stream = await coverStream({ ...metadata, assistedBy: '' });

    expect(stream).not.toContain('(Assisted by)');
    expect(stream).toContain('(Land Surveyor)'); // the rest survive
  });

  it('falls back to the free-text instruments of an older project', async () => {
    const stream = await coverStream({
      ...metadata,
      instrumentDescription: '',
      instrumentBaseSerial: '',
      instrumentRoverSerial: '',
      instruments: '1. Trimble R6GNSS Set\nBase Serial Number S/N 5016424521',
    });

    expect(stream).toContain('(Instruments)');
    expect(stream).toContain('(5016424521)');
  });

  it('does not consume an E-number', async () => {
    const { pointPageMap, pageCount } = await new FieldBookGenerator()
      .generateFieldBookPDF(points, metadata);

    expect(pointPageMap.P1).toBe('E1'); // the cover is before it, unnumbered
    expect(pageCount).toBe(2);          // but it is a physical page
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookCover.test.ts`
Expected: FAIL — "no cover page rendered".

- [ ] **Step 3: Extend the metadata type**

In `app-frontend/src/utils/field-book.ts`:

```ts
export interface FieldBookMetadata {
  surveyorName: string;
  surveyDescription?: string;
  surveyDate?: string;
  instruments?: string;
  address?: string;
  /** What was surveyed, as printed on the cover. */
  surveyOf?: string;
  /** Field assistant. */
  assistedBy?: string;
  instrumentDescription?: string;
  instrumentBaseSerial?: string;
  instrumentRoverSerial?: string;
}
```

- [ ] **Step 4: Write the cover renderer**

Add to `FieldBookGenerator`:

```ts
  /**
   * Render the cover, modelled on cadastral-standard/1 fieldbook cover.pdf.
   *
   * A title page: no E-number, because the calibration owns E1. Rows whose value
   * is absent are dropped rather than printed empty, so a project that predates
   * the structured instrument fields still produces an honest cover.
   */
  private generateCoverPage(pdf: jsPDF, metadata: FieldBookMetadata): void {
    const left = this.options.marginLeft;
    const valueX = left + 18;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(16);
    pdf.text('ELECTRONIC FIELD BOOK', left + 9, 12 + 10);

    // Instruments read from the structured fields; an older project has them only
    // in the free-text column, so that is the fallback and its only reader.
    const instrumentLines: string[] = [];
    if (metadata.instrumentDescription) {
      instrumentLines.push(`1. ${metadata.instrumentDescription}`);
      if (metadata.instrumentBaseSerial) {
        instrumentLines.push(`   Base  Serial Number S/N ${metadata.instrumentBaseSerial}`);
      }
      if (metadata.instrumentRoverSerial) {
        instrumentLines.push(`   Rover Serial Number S/N ${metadata.instrumentRoverSerial}`);
      }
    } else if (metadata.instruments) {
      instrumentLines.push(...metadata.instruments.split('\n'));
    }

    const rows: { label: string; lines: string[] }[] = [
      { label: 'Land Surveyor', lines: [metadata.surveyorName || ''] },
      { label: 'Assisted by', lines: [metadata.assistedBy || ''] },
      { label: 'Survey of', lines: (metadata.surveyOf || '').split('\n') },
      { label: 'Surveyed in', lines: [metadata.surveyDate || ''] },
      { label: 'Instruments', lines: instrumentLines },
      { label: 'Address', lines: (metadata.address || '').split('\n') },
    ];

    let y = 21 + 10;
    const lineHeight = 4.5;
    const rowGap = 4;

    for (const row of rows) {
      const lines = row.lines.filter(line => line.trim().length > 0);
      if (lines.length === 0) continue; // absent value: no label, no colon

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(row.label, left, y);
      const labelWidth = pdf.getTextWidth(row.label);
      pdf.line(left, y + 0.8, left + labelWidth, y + 0.8); // underlined, as the sample

      pdf.setFont('helvetica', 'normal');
      lines.forEach((line, index) => {
        const text = index === 0 ? `: ${line}` : `  ${line}`;
        pdf.text(text, valueX, y + index * lineHeight);
      });

      y += lines.length * lineHeight + rowGap;
    }
  }
```

- [ ] **Step 5: Render it first**

In `generateFieldBookPDF`, change the pagination call to `hasCover: true` and render the cover
before everything else:

```ts
    const pagination = paginateFieldBook(points, {
      hasCalibration: Boolean(calibration),
      hasCover: true,
    });
    this.pointPageMap = pagination.pointPageMap;

    // The cover comes first and carries no number.
    startPage();
    this.generateCoverPage(pdf, metadata);
```

`startPage()` must be declared above this line. Update the method docstring, replacing
"E1-E99 pages only, no cover" with "cover, then the calibration at E1, then the point pages".

- [ ] **Step 6: Run the tests**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookCover.test.ts`
Expected: PASS.

Then `npx vitest run` — the parity test from Task 6 and the measurement in Task 3 both count
physical pages, so both must be updated to `hasCover: true`. Change
`TwoPassDocumentGenerator.measureFieldBook`'s option to `hasCover: true` so measured and rendered
agree; the Task 3 guard will fail loudly if you forget.

- [ ] **Step 7: Eyeball the output**

The tests prove the text is present, not that the page looks right. Generate a field book from
the running app and compare against `cadastral-standard/1 fieldbook cover.pdf` side by side.
Check the label column aligns, the values line up at a common colon, and multi-line Address and
Instruments do not collide with the row beneath.

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/utils/field-book.ts app-frontend/src/utils/__tests__/fieldBookCover.test.ts app-frontend/src/utils/TwoPassDocumentGenerator.ts
git commit -m "feat(field-book): add the cover page

Modelled on the SG sample: underlined labels, colon-aligned values, the survey,
the instruments and the address. Unnumbered -- the calibration owns E1 -- so it
adds a physical page without moving a point. A row with no value is omitted
rather than printed empty, and the instruments fall back to the old free-text
column so projects predating the structured fields still render correctly."
```

---

### Task 11: Feed the cover from the workflow

**Files:**
- Modify: `app-frontend/src/utils/TwoPassDocumentGenerator.ts:415-430` (`renderFieldBook`'s metadata)
- Modify: `app-frontend/src/utils/comprehensive-document.ts` (the `FieldBookGenerator` call in the deprecated path)
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue:5981,6939`
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:4726`
- Modify: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue:1834,3633`
- Test: `app-frontend/src/utils/__tests__/fieldBookCover.test.ts` (extend)

**Interfaces:**
- Consumes: `FieldBookMetadata` from Task 10, `workflowState.surveyorInfo` from Task 9.
- Produces: nothing new; this wires existing pieces together.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/fieldBookCover.test.ts`:

```ts
import { TwoPassDocumentGenerator } from '../TwoPassDocumentGenerator';

describe('the cover through the two-pass generator', () => {
  it('carries the assistant and instruments from the workflow', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'SHABANI',
        assistedBy: 'R. T. Mapamula',
        instrumentDescription: 'Trimble R6GNSS Set',
        instrumentBaseSerial: '5016424521',
        instrumentRoverSerial: '5146476624',
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(R. T. Mapamula)');
    expect(raw).toContain('(5016424521)');
  });
});
```

If `TwoPassDocumentGenerator.generate` requires more of its argument, read its
`TwoPassDocumentData` type and supply the minimum; do not stub the generator.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookCover.test.ts`
Expected: FAIL — the assistant is not in the rendered bytes, because `renderFieldBook` builds its
metadata from only `surveyorName`.

- [ ] **Step 3: Pass the fields through**

In `TwoPassDocumentGenerator.renderFieldBook`, extend the metadata argument given to
`generateFieldBookPDF`:

```ts
      {
        surveyorName: data.surveyorInfo.name,
        address: data.surveyorInfo.address,
        surveyDate: data.surveyorInfo.surveyDate,
        surveyOf: data.surveyorInfo.projectTitle,
        assistedBy: data.surveyorInfo.assistedBy,
        instruments: data.surveyorInfo.instruments,
        instrumentDescription: data.surveyorInfo.instrumentDescription,
        instrumentBaseSerial: data.surveyorInfo.instrumentBaseSerial,
        instrumentRoverSerial: data.surveyorInfo.instrumentRoverSerial,
      },
```

Extend `TwoPassDocumentData['surveyorInfo']` with the same optional string fields.

Apply the identical change to the `FieldBookGenerator` call in `comprehensive-document.ts`'s
deprecated path, so both entry points build the same cover.

- [ ] **Step 3b: Widen the `surveyorInfo` the views construct**

The generators can only forward what they are handed, and three views build their own
`surveyorInfo` literal before calling them. Each currently stops at `projectTitle`, so without
this the cover renders with only the Land Surveyor row:

- `MapLibreAreaView.vue:5981` and `:6939`
- `SurveyPlanMapView.vue:4726`
- `CadastralStandardView.vue:1834` and `:3633`

Add the same four lines to every one of them, following the existing `address` line's form:

```ts
      assistedBy: workflowState.surveyorInfo?.assistedBy || '',
      instrumentDescription: workflowState.surveyorInfo?.instrumentDescription || '',
      instrumentBaseSerial: workflowState.surveyorInfo?.instrumentBaseSerial || '',
      instrumentRoverSerial: workflowState.surveyorInfo?.instrumentRoverSerial || '',
```

Confirm none were missed before moving on:
`grep -rn "projectTitle: workflowState" app-frontend/src/views` — every hit must now be followed
by the four fields. Missing one means the cover is populated from one entry point and blank from
another, which is the failure mode this step exists to prevent.

- [ ] **Step 4: Run the tests**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/fieldBookCover.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything**

Run: `cd app-frontend && npx vitest run && npm run build`
Then: `cd app-backend && npm test`
Expected: all green, build compiles.

- [ ] **Step 6: End-to-end check**

With both servers running, generate a comprehensive document for a project whose Assisted by and
instrument fields are filled. Confirm in the output PDF that:
1. the field book opens with the cover, showing all six rows;
2. the calibration page follows, numbered E1;
3. the first point page is E2;
4. the F/B column in Calculations cites E2 for those points, not E1.

Point 4 is the one that proves the whole refactor: it is the cross-reference that used to be
derived separately.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/utils/TwoPassDocumentGenerator.ts app-frontend/src/utils/comprehensive-document.ts app-frontend/src/utils/__tests__/fieldBookCover.test.ts
git commit -m "feat(field-book): feed the cover from the project's captured details

renderFieldBook passed only the surveyor's name, so the cover would have
rendered with every other row omitted. Both entry points -- two-pass and the
deprecated comprehensive path -- now build the same metadata."
```

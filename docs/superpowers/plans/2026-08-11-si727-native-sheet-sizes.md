# SI 727-Native General-Plan Sheet Sizes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ISO A-series substitute General Plan sheet sizes (594×420 / 841×594 / 1189×841mm) with the real SI 727 Section 62(1) prescribed sizes (500×400 / 800×500 / 1000×800mm), consolidated into one shared source of truth, renamed from `ISO_A2`/`ISO_A1`/`ISO_A0` to `SI727_500x400`/`SI727_800x500`/`SI727_1000x800` everywhere they mean a General Plan sheet.

**Architecture:** One new file, `app-shared/si727SheetSizes.js`, becomes the single source of truth for the three real sizes. Backend (`si727Constants.js`, `dxfGenerator.js`, `sheetEscalation.js`) and frontend (`paperSizeOptions.ts`, `SurveyPlanMapView.vue`) import from it. Every other reference to the old ISO identifiers — across ~9 more backend files, ~5 more frontend files, and ~13 test files — is a mechanical rename to match. The Diagram plan type's `ISO_A4`/`ISO_A3` sizes are a separate SI 727 provision and are never touched.

**Tech Stack:** Node.js (ESM backend), Jest (`--experimental-vm-modules`), Vue 3 + TypeScript + Vite (frontend), Vitest.

## Global Constraints

- New identifiers: `SI727_500x400` (was `ISO_A2`), `SI727_800x500` (was `ISO_A1`), `SI727_1000x800` (was `ISO_A0`) — smallest to largest, same relative order as before.
- `ISO_A4`/`ISO_A3` (Diagram plan type) are never renamed or touched anywhere in this plan.
- The `code` field (e.g. `'ISO A2'`, the old human-readable space-form) is dropped entirely — display strings are built directly from `width`/`height`.
- `sheetSize` is never persisted in the database (confirmed: zero references in `app-backend/migrations` or `app-backend/src/models`) — no migration needed.
- Backend tests run via `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` (bare `npx jest` fails — ESM).
- Frontend tests run via `cd app-frontend && npm run test` (= `vitest run`).
- After every rename step, verify with: `grep -rn "ISO_A2\|ISO_A1\|ISO_A0\|ISO A2\|ISO A1\|ISO A0" app-backend/src app-frontend/src app-shared` — it must return zero matches once the full sweep (Tasks 2, 3, 4, 5) is complete. (`ISO_A4`/`ISO_A3`/`"ISO A4"`/`"ISO A3"` are NOT matched by this pattern and are correctly left alone.)

---

### Task 1: Shared SI 727 sheet-size module

**Files:**
- Create: `app-shared/si727SheetSizes.js`
- Test: `app-backend/src/services/__tests__/si727SheetSizes.test.js` (new — `app-backend/jest.config.js` has no `roots` override, so Jest only discovers tests under `app-backend/`; the established pattern for testing `app-shared/` code in this codebase is a test file under `app-backend/src/services/__tests__/` that imports the shared module directly, e.g. the existing `block-definitions-tickmarks.test.js` does exactly this for `app-shared/block-definitions.js`)

**Interfaces:**
- Produces: `SI727_GENERAL_PLAN_SHEET_SIZES` (array of `{ name, width, height, area }`, smallest→largest) and `findSheetSize(name)` (returns the matching entry or `undefined`), both exported from `app-shared/si727SheetSizes.js`.

- [ ] **Step 1: Write the failing tests**

Create `app-backend/src/services/__tests__/si727SheetSizes.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { SI727_GENERAL_PLAN_SHEET_SIZES, findSheetSize } from '../../../../app-shared/si727SheetSizes.js'

describe('SI727_GENERAL_PLAN_SHEET_SIZES', () => {
  test('has exactly the three SI 727 Section 62(1) prescribed sizes, smallest to largest', () => {
    expect(SI727_GENERAL_PLAN_SHEET_SIZES).toEqual([
      { name: 'SI727_500x400',  width: 500,  height: 400,  area: 200000 },
      { name: 'SI727_800x500',  width: 800,  height: 500,  area: 400000 },
      { name: 'SI727_1000x800', width: 1000, height: 800,  area: 800000 },
    ])
  })

  test('every entry has area === width * height', () => {
    for (const s of SI727_GENERAL_PLAN_SHEET_SIZES) {
      expect(s.area).toBe(s.width * s.height)
    }
  })

  test('every entry is landscape (width > height)', () => {
    for (const s of SI727_GENERAL_PLAN_SHEET_SIZES) {
      expect(s.width).toBeGreaterThan(s.height)
    }
  })
})

describe('findSheetSize', () => {
  test('returns the matching entry by name', () => {
    expect(findSheetSize('SI727_800x500')).toEqual({ name: 'SI727_800x500', width: 800, height: 500, area: 400000 })
  })

  test('returns undefined for an unknown name', () => {
    expect(findSheetSize('ISO_A2')).toBeUndefined()
    expect(findSheetSize('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js si727SheetSizes`

Expected: FAIL — `Cannot find module '../../../../app-shared/si727SheetSizes.js'` (the file doesn't exist yet).

- [ ] **Step 3: Create the shared module**

Create `app-shared/si727SheetSizes.js`:

```js
/**
 * SI 727 Section 62(1) prescribed General Plan sheet sizes — the ONLY
 * three sizes the regulation allows: 500x400mm, 800x500mm, 1000x800mm.
 * Single source of truth for the PDF generator, DXF generator, sheet
 * escalation ladder, and the frontend paper-size picker, so none of them
 * can drift from the real SI 727 dimensions (or from each other) again.
 *
 * Does NOT cover the Diagram plan type's A4/A3 sizes (a different SI 727
 * provision, genuine ISO sizes) — those remain defined where they already
 * are (dxfGenerator.js's PAPER_SIZES, paperSizeOptions.ts's DIAGRAM list).
 *
 * Ordered smallest to largest — sheetEscalation.js's SHEET_ORDER derives
 * its ladder directly from this array's order.
 */
export const SI727_GENERAL_PLAN_SHEET_SIZES = [
  { name: 'SI727_500x400',  width: 500,  height: 400,  area: 200000 },
  { name: 'SI727_800x500',  width: 800,  height: 500,  area: 400000 },
  { name: 'SI727_1000x800', width: 1000, height: 800,  area: 800000 },
];

/** Look up a size by name, or undefined if not found. */
export function findSheetSize(name) {
  return SI727_GENERAL_PLAN_SHEET_SIZES.find((s) => s.name === name);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the same command as Step 2.
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app-shared/si727SheetSizes.js app-backend/src/services/__tests__/si727SheetSizes.test.js
git commit -m "feat(sheet-sizes): add shared SI 727 Section 62(1) sheet-size module"
```

---

### Task 2: Backend structural consolidation

**Files:**
- Modify: `app-backend/src/utils/si727Constants.js`
- Modify: `app-shared/sheetEscalation.js`
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Test: `app-backend/src/services/__tests__/generalPlanSheetSizes.regression.test.js` (new)

**Interfaces:**
- Consumes: `SI727_GENERAL_PLAN_SHEET_SIZES`, `findSheetSize` from Task 1.
- `si727Constants.js` keeps exporting `SI727_SHEET_SIZES` (same name, now a re-export) so every existing importer of that name is unaffected by this task — only the *values* inside each entry change (no `code` field, real dimensions), which is exactly the fix.
- `app-shared/sheetEscalation.js`'s `SHEET_ORDER` and `nextSheetUp` keep their exact existing signatures; only the array's string values change.

> **Line-number note:** Steps 5 and 6 make several sequential edits to `dxfGenerator.js` and `pdfkitGeoPDF.js` respectively. Each file's earlier edits in this task change that file's line count, so line numbers cited later in the same step will have already drifted from what's stated by the time you reach them (e.g. Step 6's `LABEL_SHEET_ORDER` removal shortens the file, shifting every line number below it — including the later `12268`, `12322`, `12659`, `12679-12684` citations in that same step). Locate each edit by matching its exact quoted code snippet, not by trusting the cited line number once an earlier edit in the same step has already run.

- [ ] **Step 1: Write the failing regression test**

Create `app-backend/src/services/__tests__/generalPlanSheetSizes.regression.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { SI727_SHEET_SIZES } from '../../utils/si727Constants.js'
import { SHEET_ORDER, nextSheetUp } from '../../../../app-shared/sheetEscalation.js'

describe('General Plan sheet sizes use the real SI 727 Section 62(1) dimensions', () => {
  test('si727Constants.SI727_SHEET_SIZES has the three real sizes, not the ISO substitutes', () => {
    expect(SI727_SHEET_SIZES).toEqual([
      { name: 'SI727_500x400',  width: 500,  height: 400,  area: 200000 },
      { name: 'SI727_800x500',  width: 800,  height: 500,  area: 400000 },
      { name: 'SI727_1000x800', width: 1000, height: 800,  area: 800000 },
    ])
  })

  test('sheetEscalation SHEET_ORDER matches the new names, same relative order', () => {
    expect(SHEET_ORDER).toEqual(['SI727_500x400', 'SI727_800x500', 'SI727_1000x800'])
    expect(nextSheetUp('SI727_500x400')).toBe('SI727_800x500')
    expect(nextSheetUp('SI727_800x500')).toBe('SI727_1000x800')
    expect(nextSheetUp('SI727_1000x800')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js generalPlanSheetSizes.regression`
Expected: FAIL — `SI727_SHEET_SIZES` still has the old ISO entries (`594`/`420`/etc. and `ISO_A2`/etc. names), `SHEET_ORDER` still `['ISO_A2', 'ISO_A1', 'ISO_A0']`.

- [ ] **Step 3: Update `si727Constants.js`**

In `app-backend/src/utils/si727Constants.js`, replace lines 6-12:

```js
// ISO A-series Sheet Sizes (Approved by Surveyor-General for survey plans)
// Landscape orientation by default (width > height)
export const SI727_SHEET_SIZES = [
  { code: 'ISO A2', name: 'ISO_A2', width: 594, height: 420, area: 249480 },
  { code: 'ISO A1', name: 'ISO_A1', width: 841, height: 594, area: 499554 },
  { code: 'ISO A0', name: 'ISO_A0', width: 1189, height: 841, area: 999949 }
]
```

with:

```js
// SI 727 Section 62(1) prescribed General Plan sheet sizes — single source
// of truth in app-shared/si727SheetSizes.js, re-exported here under the
// same name so every existing importer of SI727_SHEET_SIZES is unaffected.
export { SI727_GENERAL_PLAN_SHEET_SIZES as SI727_SHEET_SIZES } from '../../../app-shared/si727SheetSizes.js'
```

- [ ] **Step 4: Update `app-shared/sheetEscalation.js`**

Replace line 9:

```js
export const SHEET_ORDER = ['ISO_A2', 'ISO_A1', 'ISO_A0'];
```

with:

```js
import { SI727_GENERAL_PLAN_SHEET_SIZES } from './si727SheetSizes.js';

export const SHEET_ORDER = SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => s.name);
```

(Place the `import` above the existing header comment block's `export const SHEET_ORDER` line — i.e. as the first line of the file, before the `/** ... */` doc comment, matching standard import-then-code file ordering.)

- [ ] **Step 5: Update `dxfGenerator.js`'s `PAPER_SIZES`**

Replace lines 441-448:

```js
/** ISO paper sizes in mm (landscape orientation: width > height) */
const PAPER_SIZES = {
  'ISO_A4': { w: 297, h: 210 },
  'ISO_A3': { w: 420, h: 297 },
  'ISO_A2': { w: 594, h: 420 },
  'ISO_A1': { w: 841, h: 594 },
  'ISO_A0': { w: 1189, h: 841 },
};
```

with:

```js
/**
 * Paper sizes in mm (landscape orientation: width > height). ISO_A4/ISO_A3
 * are the Diagram plan type's genuine ISO sizes (unrelated SI 727
 * provision, unchanged). The other three are the real SI 727 Section
 * 62(1) General Plan sizes, sourced from the shared table so this can
 * never drift from si727Constants.js / the frontend picker again.
 */
const PAPER_SIZES = {
  'ISO_A4': { w: 297, h: 210 },
  'ISO_A3': { w: 420, h: 297 },
  ...Object.fromEntries(
    SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => [s.name, { w: s.width, h: s.height }])
  ),
};
```

Add the import at the top of `dxfGenerator.js`, alongside the existing `sheetEscalation.js` import (line 39):

```js
import { SHEET_ORDER, MAX_SHEET_UP_ATTEMPTS, nextSheetUp } from '../../../app-shared/sheetEscalation.js';
import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../app-shared/si727SheetSizes.js';
```

Update the fallback literal at line 549:

```js
const _basePaper = PAPER_SIZES[normalizedSheetSize] || PAPER_SIZES['ISO_A2'];
```

to:

```js
const _basePaper = PAPER_SIZES[normalizedSheetSize] || PAPER_SIZES['SI727_500x400'];
```

Update the two explanatory comments referencing the old identifiers/dimensions:
- Line 544: `// Without this, an 'ISO A0' input misses PAPER_SIZES and falls back to A2.` → `// Without this, a space-form input misses PAPER_SIZES and falls back to the smallest SI 727 size.`
- Lines 543-545 (the comment block above, mentioning `'ISO_A0'`/`'ISO A0'` as example forms) — update the example identifiers to `'SI727_1000x800'`/`'SI 727 1000x800'`-style, keeping the same explanatory point (accept both underscore and space forms).

- [ ] **Step 6: Update `pdfkitGeoPDF.js`**

Delete the redundant `LABEL_SHEET_ORDER` local array and reuse the already-imported `SHEET_ORDER`. Replace lines 12064-12071:

```js
    const LABEL_SHEET_ORDER = ['ISO_A2', 'ISO_A1', 'ISO_A0'];
    const currentSheet = sheetSize || 'ISO_A2';
    const sheetIdx = LABEL_SHEET_ORDER.indexOf(currentSheet);
    const canGoBiggerPaper = sheetIdx >= 0 && sheetIdx < LABEL_SHEET_ORDER.length - 1;

    if (canGoBiggerPaper) {
      // ── PAPER-SIZE ESCALATION for labels ──
      const nextSheet = LABEL_SHEET_ORDER[sheetIdx + 1];
```

with:

```js
    const currentSheet = sheetSize || 'SI727_500x400';
    const sheetIdx = SHEET_ORDER.indexOf(currentSheet);
    const canGoBiggerPaper = sheetIdx >= 0 && sheetIdx < SHEET_ORDER.length - 1;

    if (canGoBiggerPaper) {
      // ── PAPER-SIZE ESCALATION for labels ──
      const nextSheet = SHEET_ORDER[sheetIdx + 1];
```

(`SHEET_ORDER` is already imported at the top of this file per the existing `import { SHEET_ORDER, MAX_SHEET_UP_ATTEMPTS, nextSheetUp } from '../../../app-shared/sheetEscalation.js';` line — no new import needed here.)

Update the remaining `'ISO_A2'` fallback literals:
- Line 10711 (comment): `sheetSize,    // e.g. 'ISO_A2' from intelligentPreview` → `sheetSize,    // e.g. 'SI727_500x400' from intelligentPreview`
- Line 12268: `const currentSheetName = sheetSize || 'ISO_A2';` → `const currentSheetName = sheetSize || 'SI727_500x400';`
- Line 12322: `atSheetSize: sheetSize || 'ISO_A2',` → `atSheetSize: sheetSize || 'SI727_500x400',`
- Line 56 (top-of-file comment): `//   ISO A2: 594mm x 420mm  |  ISO A1: 841mm x 594mm  |  ISO A0: 1189mm x 841mm` → `//   SI727_500x400: 500mm x 400mm  |  SI727_800x500: 800mm x 500mm  |  SI727_1000x800: 1000mm x 800mm`

Update the `selectPageSize` doc comment (lines 10525-10530) to drop the now-resolved "current practice substitutes ISO" framing:

```js
/**
 * Select appropriate page size based on survey extent
 * SI 727 Section 62(1) prescribed sizes: 500×400mm, 800×500mm, 1000×800mm
 * Uses next larger size for better label spacing and cleaner presentation
 */
```

Drop the `code` field usage. Replace lines 10537-10541:

```js
      const pageSize = {
        size: [sheet.width * MM_TO_PT, sheet.height * MM_TO_PT],
        name: `${sheet.width}mm × ${sheet.height}mm (${sheet.code})`,
        code: sheet.code,
      };
```

with:

```js
      const pageSize = {
        size: [sheet.width * MM_TO_PT, sheet.height * MM_TO_PT],
        name: `${sheet.width}mm × ${sheet.height}mm`,
        code: sheet.name,
      };
```

Replace lines 10583-10587 (the equivalent auto-select block) the same way:

```js
  const pageSize = {
    size: [sheet.width * MM_TO_PT, sheet.height * MM_TO_PT],
    name: `${sheet.width}mm × ${sheet.height}mm`,
    code: sheet.name,
  };
```

(`code` is kept as a field here — set to `sheet.name` — rather than removed from the `pageSize` object shape, because `_returnedSheetSize`/`tileGrid.sheetSize` below read `pageSize.code`; keeping the field name avoids touching those two call sites' property access, while its *value* is now already the canonical underscored name, so the space-stripping normalization becomes a no-op we can simplify away.)

Simplify the two `.replace(/\s+/g, '_')` normalizations, now unnecessary since `pageSize.code` no longer contains spaces. Replace line 12659:

```js
      sheetSize: String(pageSize.code || '').replace(/\s+/g, '_') || null,
```

with:

```js
      sheetSize: pageSize.code || null,
```

Replace lines 12679-12684:

```js
  // sheetSize returned in underscore form ('ISO_A0') for round-trip consistency:
  // intelligentPreview / PAPER_SIZES / DXF generator all key by this form.
  // pageSize.code is 'ISO A0' (space form, human-readable); normalize to
  // underscored canonical name before returning. pageSize.name is the FULL
  // display string ('1189mm × 841mm (ISO A0)') — don't use that here.
  const _returnedSheetSize = String(pageSize.code || '').replace(/\s+/g, '_') || null;
```

with:

```js
  // sheetSize returned as the canonical name (e.g. 'SI727_1000x800') for
  // round-trip consistency: intelligentPreview / PAPER_SIZES / DXF
  // generator all key by this form. pageSize.name is the display string
  // ('1000mm × 800mm') — don't use that here.
  const _returnedSheetSize = pageSize.code || null;
```

- [ ] **Step 7: Run the regression test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js generalPlanSheetSizes.regression`
Expected: PASS (2 tests).

- [ ] **Step 8: Run the affected suites to check for immediate breakage**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetEscalation pdfkitGeoPDF.snapshot`
Expected: `sheetEscalation.test.js` will FAIL at this point — it still asserts the old `'ISO_A2'`-style names (fixed in Task 3, not this task). `pdfkitGeoPDF.snapshot.test.js` should still PASS if its fixtures don't reference sheet-size identifiers directly (check output; if it fails on identifier strings, that's expected and deferred to Task 3 — if it fails on rendered *text positions*, stop and investigate before proceeding, since that would mean the dimension change altered layout in a way this task didn't anticipate).

- [ ] **Step 9: Commit**

```bash
git add app-backend/src/utils/si727Constants.js app-shared/sheetEscalation.js app-backend/src/services/dxfGenerator.js app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/generalPlanSheetSizes.regression.test.js
git commit -m "feat(sheet-sizes): consolidate backend generators onto the real SI 727 sheet sizes"
```

---

### Task 3: Backend rename sweep

**Files:**
- Modify: `app-backend/src/routes/surveyPlanPreview.js`
- Modify: `app-backend/src/services/dxfScheduleHelpers.js`
- Modify: `app-backend/src/utils/si727LayoutCalculator.js`
- Modify (rename only): `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`, `dxfGenerator.integration.test.js`, `dxfGenerator.test.js`, `dxfScheduleHelpers.test.js`, `pdfkitGeoPDF.scheduleNoOverlap.test.js`, `pdfkitGeoPDF.tickMarks.test.js`, `sheetEscalation.test.js`, `sheetLayoutPlanner.parity.test.js`, `sheetLayoutPlanner.test.js`, `tickMarkParity.test.js`
- Modify (rename + recompute): `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`, `app-backend/src/utils/__tests__/si727LayoutCalculator.test.js`

**Interfaces:**
- No new exports. Consumes Task 2's renamed `SI727_SHEET_SIZES`/`SHEET_ORDER` (via `si727LayoutCalculator.js`'s existing import of `SI727_SHEET_SIZES`, unchanged import statement).

This task has two parts: (A) three source files with precise, known edits; (B) twelve test files renamed via a scoped find-and-replace, ten of which are purely mechanical (the identifier is only ever used as an opaque input/output value, never a basis for a derived computation) and two of which (`dxfScheduleEmitter.test.js`, `si727LayoutCalculator.test.js`) compute real positions/heights from sheet dimensions and need their expected values recomputed from actual output, per your decision: rename first, run, verify each failure is legitimately dimension-driven, then update the expected value to match.

- [ ] **Step 1: Update `si727LayoutCalculator.js`**

In `app-backend/src/utils/si727LayoutCalculator.js`, replace line 10:

```js
 * @param {string} sheetSize - 'ISO_A2', 'ISO_A1', or 'ISO_A0'
```

with:

```js
 * @param {string} sheetSize - 'SI727_500x400', 'SI727_800x500', or 'SI727_1000x800'
```

Replace line 18:

```js
    throw new Error(`Invalid sheet size: ${sheetSize}. Must be 'ISO_A2', 'ISO_A1', or 'ISO_A0'`)
```

with:

```js
    throw new Error(`Invalid sheet size: ${sheetSize}. Must be 'SI727_500x400', 'SI727_800x500', or 'SI727_1000x800'`)
```

Replace lines 24-28:

```js
  const titleBlockHeight = sheetSize === 'ISO_A0' 
    ? LAYOUT_COMPONENTS.titleBlock.heightLarge
    : sheetSize === 'ISO_A1'
    ? LAYOUT_COMPONENTS.titleBlock.heightMedium
    : LAYOUT_COMPONENTS.titleBlock.heightSmall
```

with:

```js
  const titleBlockHeight = sheetSize === 'SI727_1000x800' 
    ? LAYOUT_COMPONENTS.titleBlock.heightLarge
    : sheetSize === 'SI727_800x500'
    ? LAYOUT_COMPONENTS.titleBlock.heightMedium
    : LAYOUT_COMPONENTS.titleBlock.heightSmall
```

Replace line 104:

```js
    sheet: { width: sheet.width, height: sheet.height, name: sheet.name, code: sheet.code },
```

with:

```js
    sheet: { width: sheet.width, height: sheet.height, name: sheet.name },
```

(Dropping `code` — confirmed via `grep -rn "sheet\.code\|layout\.sheet\.code" app-backend app-frontend` that nothing downstream reads it; every frontend consumer of `layout.sheet` already reads only `.width`/`.height`/`.name`.)

Find line 146 (`for (const sheetSize of ['ISO_A2', 'ISO_A1', 'ISO_A0']) {`) and replace with:

```js
  for (const sheetSize of ['SI727_500x400', 'SI727_800x500', 'SI727_1000x800']) {
```

- [ ] **Step 2: Update `dxfScheduleHelpers.js`**

In `app-backend/src/services/dxfScheduleHelpers.js`, replace line 18:

```js
const SHEET_LADDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']
```

with:

```js
const SHEET_LADDER = ['SI727_500x400', 'SI727_800x500', 'SI727_1000x800']
```

- [ ] **Step 3: Update `surveyPlanPreview.js`**

In `app-backend/src/routes/surveyPlanPreview.js`, find and replace each of these (search for the exact substring shown; each occurs once):

- `(sheetSize === 'ISO_A2' || sheetSize === 'ISO_A1' || sheetSize === 'ISO_A0') ? sheetSize : undefined` → `(sheetSize === 'SI727_500x400' || sheetSize === 'SI727_800x500' || sheetSize === 'SI727_1000x800') ? sheetSize : undefined`
- `const sheetOrder = ['ISO_A2', 'ISO_A1', 'ISO_A0']` → `const sheetOrder = ['SI727_500x400', 'SI727_800x500', 'SI727_1000x800']`
- `// ISO_A2 at ceiling is as good as any — front-end tile grid picks sheet size` → `// SI727_500x400 at ceiling is as good as any — front-end tile grid picks sheet size`
- `selectedSheetSize = 'ISO_A0'` → `selectedSheetSize = 'SI727_1000x800'`
- `layout = calculateSI727Layout('ISO_A0', parcels.length, 0)` → `layout = calculateSI727Layout('SI727_1000x800', parcels.length, 0)`

- [ ] **Step 4: Rename the ten mechanical test files**

For each of these ten files, every occurrence of `'ISO_A2'` → `'SI727_500x400'`, `'ISO_A1'` → `'SI727_800x500'`, `'ISO_A0'` → `'SI727_1000x800'` (and the space-separated comment forms `ISO_A2`/`ISO A2` etc. the same way) is a straight identifier substitution — none of these files assert on raw mm dimensions:

- `app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js`
- `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`
- `app-backend/src/services/__tests__/dxfGenerator.test.js`
- `app-backend/src/services/__tests__/dxfScheduleHelpers.test.js`
- `app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js`
- `app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js`
- `app-backend/src/services/__tests__/sheetEscalation.test.js`
- `app-backend/src/services/__tests__/sheetLayoutPlanner.parity.test.js`
- `app-backend/src/services/__tests__/sheetLayoutPlanner.test.js`
- `app-backend/src/services/__tests__/tickMarkParity.test.js`

Run this from the repo root to apply the rename across exactly these ten files (PowerShell, since the primary shell here is Windows):

```powershell
$files = @(
  'app-backend/src/services/__tests__/dxfBottomZoneEmitter.test.js',
  'app-backend/src/services/__tests__/dxfGenerator.integration.test.js',
  'app-backend/src/services/__tests__/dxfGenerator.test.js',
  'app-backend/src/services/__tests__/dxfScheduleHelpers.test.js',
  'app-backend/src/services/__tests__/pdfkitGeoPDF.scheduleNoOverlap.test.js',
  'app-backend/src/services/__tests__/pdfkitGeoPDF.tickMarks.test.js',
  'app-backend/src/services/__tests__/sheetEscalation.test.js',
  'app-backend/src/services/__tests__/sheetLayoutPlanner.parity.test.js',
  'app-backend/src/services/__tests__/sheetLayoutPlanner.test.js',
  'app-backend/src/services/__tests__/tickMarkParity.test.js'
)
foreach ($f in $files) {
  (Get-Content $f -Raw) `
    -replace 'ISO_A2', 'SI727_500x400' `
    -replace 'ISO_A1', 'SI727_800x500' `
    -replace 'ISO_A0', 'SI727_1000x800' `
    -replace 'ISO A2', 'SI 727 500x400' `
    -replace 'ISO A1', 'SI 727 800x500' `
    -replace 'ISO A0', 'SI 727 1000x800' |
    Set-Content $f -NoNewline -Encoding utf8
}
```

After running it, re-check each file: `grep -n "ISO_A2\|ISO_A1\|ISO_A0\|ISO A2\|ISO A1\|ISO A0" <file>` must return nothing for all ten.

- [ ] **Step 5: Run the mechanical test files and confirm pass**

Run:
```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfBottomZoneEmitter dxfGenerator.integration dxfGenerator.test dxfScheduleHelpers.test pdfkitGeoPDF.scheduleNoOverlap pdfkitGeoPDF.tickMarks sheetEscalation.test sheetLayoutPlanner.parity sheetLayoutPlanner.test tickMarkParity
```
Expected: all PASS. If any fails, read the failure: if it's a leftover unrenamed literal (e.g. a variant spelling the sed pattern missed), fix it directly; if it's a genuine dimension-driven behavior change (unexpected for this batch — these were sampled and confirmed identifier-only), stop and report it rather than guessing.

- [ ] **Step 6: Rename identifiers in the two recompute files**

Apply the same three-line identifier substitution (`ISO_A2`→`SI727_500x400`, `ISO_A1`→`SI727_800x500`, `ISO_A0`→`SI727_1000x800`) to:
- `app-backend/src/services/__tests__/dxfScheduleEmitter.test.js`
- `app-backend/src/utils/__tests__/si727LayoutCalculator.test.js`

```powershell
$files = @(
  'app-backend/src/services/__tests__/dxfScheduleEmitter.test.js',
  'app-backend/src/utils/__tests__/si727LayoutCalculator.test.js'
)
foreach ($f in $files) {
  (Get-Content $f -Raw) `
    -replace 'ISO_A2', 'SI727_500x400' `
    -replace 'ISO_A1', 'SI727_800x500' `
    -replace 'ISO_A0', 'SI727_1000x800' `
    -replace 'ISO A2', 'SI 727 500x400' `
    -replace 'ISO A1', 'SI 727 800x500' `
    -replace 'ISO A0', 'SI 727 1000x800' |
    Set-Content $f -NoNewline -Encoding utf8
}
```

Do not touch any other numbers in these files yet — this step only renames identifiers.

- [ ] **Step 7: Run the two recompute files and diagnose each failure**

Run:
```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js si727LayoutCalculator.test dxfScheduleEmitter.test
```

For every failing assertion, read the test name and the actual-vs-expected values Jest reports. Confirm the failure is a legitimate consequence of the smaller real sheet dimensions (e.g. a `drawingArea.width` that used to be computed from `594 - 50 - 150` and is now correctly computed from `500 - 50 - 150`, or a schedule/title-block position that shifted because the paper it's placed on shrank) — not a logic bug (e.g. a completely wrong shape, a thrown error, `NaN`, or a value that doesn't correspond to any sane function of the new 500/800/1000 × 400/500/800 dimensions). If a failure doesn't look dimension-driven, stop and investigate before changing the expectation.

For each confirmed-legitimate failure, update the hardcoded expected value in the test to the actual value Jest reported (the real computed output), and add a one-line comment above the changed assertion noting it was updated from the old ISO-based expectation to the real SI 727 dimension (e.g. `// was 394 under ISO_A2 (594-50-150); now 300 under SI727_500x400 (500-50-150)`), matching the existing "confirmed empirically" documentation style used elsewhere in this codebase's specs.

Re-run after each round of updates until both files pass clean.

- [ ] **Step 8: Full backend suite**

Run: `cd app-backend && npm test`
Expected: PASS, zero remaining failures. If `pdfkitGeoPDF.snapshot.test.js` or any other suite not touched by this plan fails, diagnose the same way as Step 7 (dimension-driven and legitimate vs. a real regression) before updating anything.

- [ ] **Step 9: Verify the backend sweep is complete**

Run: `grep -rn "ISO_A2\|ISO_A1\|ISO_A0\|ISO A2\|ISO A1\|ISO A0" app-backend/src app-shared`
Expected: zero matches.

- [ ] **Step 10: Commit**

```bash
git add app-backend/src app-shared
git commit -m "refactor(sheet-sizes): rename remaining backend ISO identifiers to SI 727-native names"
```

---

### Task 4: Frontend structural wiring

**Files:**
- Modify: `app-frontend/vite.config.ts` (only if the empirical check in Step 1 shows it's needed)
- Modify: `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/__tests__/paperSizeOptions.test.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `SI727_GENERAL_PLAN_SHEET_SIZES` from Task 1 (`app-shared/si727SheetSizes.js`), imported by the frontend for the first time in this codebase.
- `paperSizeOptionsFor(planType)` keeps its exact existing signature and return shape (`PaperSizeOption[]`, `{ value, label }`).

- [ ] **Step 1: Verify the cross-package import resolves**

Temporarily add this line to the top of `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts` and run both the dev server and the test runner to confirm it resolves before wiring it in for real:

```ts
import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../../../app-shared/si727SheetSizes.js'
console.log('[import check]', SI727_GENERAL_PLAN_SHEET_SIZES.length)
```

(Path depth: `app-frontend/src/views/modules/cadastral-standard/` → five `../` to reach the repo root, then into `app-shared/`.)

Run: `cd app-frontend && npm run test -- paperSizeOptions` (Vitest picks up the console output/import error if any) and `cd app-frontend && npm run build` (Rollup will fail loudly if it can't resolve the module).

If both succeed, remove the temporary `console.log` line and keep the import — no `vite.config.ts` change needed (Vitest's `environment: 'node'` and Rollup's build both resolve relative imports outside the project root without extra configuration; only the Vite *dev server*'s HTTP file-serving restriction, `server.fs.allow`, can block this, and only in `npm run dev`).

If `npm run build` or the Vitest run fails to resolve the import, but `npm run dev` is what actually breaks (test this too: `cd app-frontend && npm run dev`, then load the page that uses `paperSizeOptionsFor`), add the minimal fix to `app-frontend/vite.config.ts`'s existing `resolve` block:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
server: {
  fs: {
    allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '../app-shared')],
  },
},
```

(Only add the `server.fs.allow` block if the empirical check shows it's actually needed — do not add it speculatively.)

- [ ] **Step 2: Update `paperSizeOptions.ts`**

Replace the full contents of `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts`:

```ts
import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../../../app-shared/si727SheetSizes.js'

export interface PaperSizeOption {
  value: string
  label: string
}

// Diagram sheets are portrait A4/A3; other plan types use the SI 727 Section 62(1) ladder.
const DIAGRAM: PaperSizeOption[] = [
  { value: 'A4', label: 'A4 (210×297mm)' },
  { value: 'A3', label: 'A3 (297×420mm)' },
]

const GENERAL: PaperSizeOption[] = [
  { value: 'auto', label: 'Auto (Recommended)' },
  ...SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => ({
    value: s.name,
    label: `${s.width} × ${s.height}mm`,
  })),
]

export function paperSizeOptionsFor(planType: string): PaperSizeOption[] {
  return planType === 'diagram' ? DIAGRAM : GENERAL
}
```

- [ ] **Step 3: Update `paperSizeOptions.test.ts`**

Replace lines 7-11 of `app-frontend/src/views/modules/cadastral-standard/__tests__/paperSizeOptions.test.ts`:

```ts
  it('offers auto + ISO sizes for general and working plans', () => {
    const expected = ['auto', 'ISO_A2', 'ISO_A1', 'ISO_A0']
    expect(paperSizeOptionsFor('general-undeveloped').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('general-developed').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('working-plan').map(o => o.value)).toEqual(expected)
  })
```

with:

```ts
  it('offers auto + the real SI 727 sizes for general and working plans', () => {
    const expected = ['auto', 'SI727_500x400', 'SI727_800x500', 'SI727_1000x800']
    expect(paperSizeOptionsFor('general-undeveloped').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('general-developed').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('working-plan').map(o => o.value)).toEqual(expected)
  })
```

- [ ] **Step 4: Run the frontend test**

Run: `cd app-frontend && npm run test -- paperSizeOptions`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `SurveyPlanMapView.vue`'s structural fields**

Add the import near the top of the `<script setup>` block (alongside existing imports):

```ts
import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../../../app-shared/si727SheetSizes.js'
```

Replace line 710:

```ts
  sheetSize: 'auto' as 'auto' | 'ISO_A2' | 'ISO_A1' | 'ISO_A0' | 'A4' | 'A3',
```

with:

```ts
  sheetSize: 'auto' as 'auto' | 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800' | 'A4' | 'A3',
```

Replace line 4175:

```ts
            sheetSize: result.usedSheetSize || intelligentPreview.value?.sheetSize || 'ISO_A0',
```

with:

```ts
            sheetSize: result.usedSheetSize || intelligentPreview.value?.sheetSize || 'SI727_1000x800',
```

Replace line 4187:

```ts
      const dxfPayload = { ...payload, scale: usedScale || payload.scale, sheetSize: payload.sheetSize || 'ISO_A2' }
```

with:

```ts
      const dxfPayload = { ...payload, scale: usedScale || payload.scale, sheetSize: payload.sheetSize || 'SI727_500x400' }
```

Replace lines 4906-4915 (the `paperDimensionsMap` inside `exportSurveyPlanSummary`):

```ts
    // Get paper dimensions based on selected sheet size
    // ISO A-series paper sizes as approved by Surveyor General
    const paperDimensionsMap: Record<string, { width: number; height: number }> = {
      'ISO_A0': { width: 1189, height: 841 },  // Landscape
      'ISO_A1': { width: 841, height: 594 },   // Landscape
      'ISO_A2': { width: 594, height: 420 },   // Landscape
      'A0': { width: 1189, height: 841 },
      'A1': { width: 841, height: 594 },
      'A2': { width: 594, height: 420 }
    }
```

with:

```ts
    // Get paper dimensions based on selected sheet size (real SI 727
    // Section 62(1) sizes — single source of truth in app-shared).
    const paperDimensionsMap: Record<string, { width: number; height: number }> = Object.fromEntries(
      SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => [s.name, { width: s.width, height: s.height }])
    )
```

(The old plain `'A0'`/`'A1'`/`'A2'` fallback keys are dropped — confirmed via `grep -n "'A0'\|'A1'\|'A2'" SurveyPlanMapView.vue` around this function that `selectedSheet` is only ever assigned from `config.value.sheetSize`, which only ever holds `'auto'` or one of the three ISO/SI727 keys per `paperSizeOptions.ts`'s `GENERAL` list — the plain-letter keys were unreachable.)

Replace line 4922:

```ts
    const selectedSheet = sheetConfig === 'auto' ? 'ISO_A1' : sheetConfig
```

with:

```ts
    const selectedSheet = sheetConfig === 'auto' ? 'SI727_800x500' : sheetConfig
```

Leave `calculateOptimalPaperSize()` (lines 1355-1370) untouched — confirmed dead code (no call sites anywhere in this file); not part of this task.

- [ ] **Step 6: Manual smoke check**

Run `cd app-frontend && npm run dev`, open a General Plan view, and confirm the Sheet Size dropdown shows the three new SI 727 dimensions (not "ISO A2/A1/A0"), and that selecting one and generating a plan still works end-to-end (backend now expects the new names per Task 2/3).

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts app-frontend/src/views/modules/cadastral-standard/__tests__/paperSizeOptions.test.ts app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git add app-frontend/vite.config.ts
git commit -m "feat(sheet-sizes): wire the frontend paper-size picker onto the real SI 727 sizes"
```

(If `vite.config.ts` wasn't touched because Step 1 found it unnecessary, the second `git add` is a no-op — fine either way.)

---

### Task 5: Frontend rename sweep

**Files:**
- Modify: `app-frontend/src/components/SurveyPlanPreview.vue`
- Modify: `app-frontend/src/services/geopdf.ts`
- Modify: `app-frontend/src/utils/surveyPlanSummaryReport.ts`
- Modify: `app-frontend/src/utils/surveyPlanSummaryGenerator.ts`
- Modify: `app-frontend/src/utils/professionalSurveyPlanExporter.ts`

**Interfaces:** No new exports; all changes are internal to each file's existing functions/types.

- [ ] **Step 1: Update `SurveyPlanPreview.vue`**

Replace lines 38-40:

```html
            <option value="ISO_A2">ISO A2 (594×420mm)</option>
            <option value="ISO_A1">ISO A1 (841×594mm)</option>
            <option value="ISO_A0">ISO A0 (1189×841mm)</option>
```

with:

```html
            <option value="SI727_500x400">500 × 400mm</option>
            <option value="SI727_800x500">800 × 500mm</option>
            <option value="SI727_1000x800">1000 × 800mm</option>
```

- [ ] **Step 2: Update `geopdf.ts`**

Replace line 63:

```ts
  sheetSize?: string    // e.g. 'ISO_A2'
```

with:

```ts
  sheetSize?: string    // e.g. 'SI727_500x400'
```

- [ ] **Step 3: Update `surveyPlanSummaryReport.ts`**

Replace line 35:

```ts
  sheetSize: string        // e.g. "ISO_A2"
```

with:

```ts
  sheetSize: string        // e.g. "SI727_500x400"
```

Replace lines 58-66:

```ts
function sheetLabel(sheetSize: string, orientation: string): string {
  const labels: Record<string, string> = {
    ISO_A2: 'ISO A2 (594 × 420 mm)',
    ISO_A1: 'ISO A1 (841 × 594 mm)',
    ISO_A0: 'ISO A0 (1189 × 841 mm)'
  }
  const base = labels[sheetSize] || sheetSize
  return `${base} — ${orientation}`
}
```

with:

```ts
function sheetLabel(sheetSize: string, orientation: string): string {
  const labels: Record<string, string> = {
    SI727_500x400:  '500 × 400 mm',
    SI727_800x500:  '800 × 500 mm',
    SI727_1000x800: '1000 × 800 mm'
  }
  const base = labels[sheetSize] || sheetSize
  return `${base} — ${orientation}`
}
```

- [ ] **Step 4: Update `surveyPlanSummaryGenerator.ts`**

Replace lines 422-435:

```ts
  private formatPaperSizeName(paperSize: string): string {
    const sizeMap: Record<string, string> = {
      'ISO_A0': 'ISO A0',
      'ISO_A1': 'ISO A1',
      'ISO_A2': 'ISO A2',
      'A0': 'ISO A0',
      'A1': 'ISO A1',
      'A2': 'ISO A2',
      'A3': 'ISO A3',
      'A4': 'ISO A4'
    };
    
    return sizeMap[paperSize] || paperSize;
```

with:

```ts
  private formatPaperSizeName(paperSize: string): string {
    const sizeMap: Record<string, string> = {
      'SI727_500x400':  '500 x 400mm',
      'SI727_800x500':  '800 x 500mm',
      'SI727_1000x800': '1000 x 800mm',
      'A3': 'ISO A3',
      'A4': 'ISO A4'
    };
    
    return sizeMap[paperSize] || paperSize;
```

(`A0`/`A1`/`A2` plain-letter aliases are dropped along with their now-inapplicable "ISO A0/A1/A2" labels — `A3`/`A4` stay, since those are the genuine Diagram-type ISO sizes.)

- [ ] **Step 5: Update `professionalSurveyPlanExporter.ts`**

Replace the three type-union occurrences (lines 59, 67, 82):

```ts
  sheetSize: 'ISO_A2' | 'ISO_A1' | 'ISO_A0'  // ISO A-series sizes approved by Surveyor-General
```
→
```ts
  sheetSize: 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800'  // SI 727 Section 62(1) sizes
```

```ts
  sheetSize: 'ISO_A2' | 'ISO_A1' | 'ISO_A0'
```
(occurs at both line 67 and line 82 — replace both)
→
```ts
  sheetSize: 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800'
```

Replace lines 114-120:

```ts
// ISO A-series Sheet Sizes (mm) - Approved by Surveyor-General
// Landscape orientation by default (width > height)
const SHEET_SIZES = {
  ISO_A2: { width: 594, height: 420 },  // ISO A2 (249,480 mm²)
  ISO_A1: { width: 841, height: 594 },  // ISO A1 (499,554 mm²)
  ISO_A0: { width: 1189, height: 841 }  // ISO A0 (999,949 mm²)
}
```

with:

```ts
// SI 727 Section 62(1) prescribed General Plan sheet sizes (mm).
// Landscape orientation by default (width > height)
const SHEET_SIZES = {
  SI727_500x400:  { width: 500,  height: 400 },  // 200,000 mm²
  SI727_800x500:  { width: 800,  height: 500 },  // 400,000 mm²
  SI727_1000x800: { width: 1000, height: 800 }   // 800,000 mm²
}
```

Replace lines 188-241 (`calculateOptimalSheetSize`) in full — its inline thresholds are the ISO dimensions repeated a third time in this same file and must be corrected to the real sizes to stay internally consistent with the `SHEET_SIZES` table above and its own renamed return type:

```ts
export function calculateOptimalSheetSize(
  outsideFigureExtent: { width: number; height: number } | null,
  parcelCount: number = 0,
  totalArea: number = 0
): 'ISO_A2' | 'ISO_A1' | 'ISO_A0' {
  // If no outside figure extent provided, use parcel-based heuristics
  if (!outsideFigureExtent) {
    if (parcelCount > 50 || totalArea > 500000) return 'ISO_A0'
    if (parcelCount > 10 || totalArea > 100000) return 'ISO_A1'
    return 'ISO_A2'
  }
  
  // Calculate required drawing area (extent + margins + overlays)
  // Working area = Sheet size - margins (50mm left, 150mm right, 50mm top/bottom)
  // Available for map = Working area - overlays (~200mm for tables/text)
  
  const extentWidth = outsideFigureExtent.width  // meters
  const extentHeight = outsideFigureExtent.height  // meters
  
  // Determine scale based on extent
  // Common cadastral scales: 1:500, 1:1000, 1:2000, 1:5000
  let scale = 1000  // Default
  const maxExtent = Math.max(extentWidth, extentHeight)
  
  if (maxExtent > 2000) scale = 5000
  else if (maxExtent > 1000) scale = 2000
  else if (maxExtent > 500) scale = 1000
  else scale = 500
  
  // Calculate required map size in mm at this scale
  const mapWidthMm = (extentWidth / scale) * 1000
  const mapHeightMm = (extentHeight / scale) * 1000
  
  // Add space for overlays and margins
  const totalWidthNeeded = mapWidthMm + 200 + 200  // Left overlays + right margin
  const totalHeightNeeded = mapHeightMm + 100 + 100  // Top/bottom space
  
  console.log('[SheetSizeCalc] 📐 Extent:', extentWidth.toFixed(1) + 'm × ' + extentHeight.toFixed(1) + 'm')
  console.log('[SheetSizeCalc] 📐 Scale:', '1:' + scale)
  console.log('[SheetSizeCalc] 📐 Map size needed:', mapWidthMm.toFixed(1) + 'mm × ' + mapHeightMm.toFixed(1) + 'mm')
  console.log('[SheetSizeCalc] 📐 Total size needed:', totalWidthNeeded.toFixed(1) + 'mm × ' + totalHeightNeeded.toFixed(1) + 'mm')
  
  // Select sheet size (ISO A-series landscape)
  // ISO_A2: 594×420mm, ISO_A1: 841×594mm, ISO_A0: 1189×841mm
  if (totalWidthNeeded > 841 || totalHeightNeeded > 594) {
    console.log('[SheetSizeCalc] ✅ Selected: ISO_A0 (1189×841mm)')
    return 'ISO_A0'
  }
  if (totalWidthNeeded > 594 || totalHeightNeeded > 420) {
    console.log('[SheetSizeCalc] ✅ Selected: ISO_A1 (841×594mm)')
    return 'ISO_A1'
  }
  console.log('[SheetSizeCalc] ✅ Selected: ISO_A2 (594×420mm)')
  return 'ISO_A2'
}
```

with:

```ts
export function calculateOptimalSheetSize(
  outsideFigureExtent: { width: number; height: number } | null,
  parcelCount: number = 0,
  totalArea: number = 0
): 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800' {
  // If no outside figure extent provided, use parcel-based heuristics
  if (!outsideFigureExtent) {
    if (parcelCount > 50 || totalArea > 500000) return 'SI727_1000x800'
    if (parcelCount > 10 || totalArea > 100000) return 'SI727_800x500'
    return 'SI727_500x400'
  }
  
  // Calculate required drawing area (extent + margins + overlays)
  // Working area = Sheet size - margins (50mm left, 150mm right, 50mm top/bottom)
  // Available for map = Working area - overlays (~200mm for tables/text)
  
  const extentWidth = outsideFigureExtent.width  // meters
  const extentHeight = outsideFigureExtent.height  // meters
  
  // Determine scale based on extent
  // Common cadastral scales: 1:500, 1:1000, 1:2000, 1:5000
  let scale = 1000  // Default
  const maxExtent = Math.max(extentWidth, extentHeight)
  
  if (maxExtent > 2000) scale = 5000
  else if (maxExtent > 1000) scale = 2000
  else if (maxExtent > 500) scale = 1000
  else scale = 500
  
  // Calculate required map size in mm at this scale
  const mapWidthMm = (extentWidth / scale) * 1000
  const mapHeightMm = (extentHeight / scale) * 1000
  
  // Add space for overlays and margins
  const totalWidthNeeded = mapWidthMm + 200 + 200  // Left overlays + right margin
  const totalHeightNeeded = mapHeightMm + 100 + 100  // Top/bottom space
  
  console.log('[SheetSizeCalc] 📐 Extent:', extentWidth.toFixed(1) + 'm × ' + extentHeight.toFixed(1) + 'm')
  console.log('[SheetSizeCalc] 📐 Scale:', '1:' + scale)
  console.log('[SheetSizeCalc] 📐 Map size needed:', mapWidthMm.toFixed(1) + 'mm × ' + mapHeightMm.toFixed(1) + 'mm')
  console.log('[SheetSizeCalc] 📐 Total size needed:', totalWidthNeeded.toFixed(1) + 'mm × ' + totalHeightNeeded.toFixed(1) + 'mm')
  
  // Select sheet size (SI 727 Section 62(1) landscape)
  // SI727_500x400: 500×400mm, SI727_800x500: 800×500mm, SI727_1000x800: 1000×800mm
  if (totalWidthNeeded > SHEET_SIZES.SI727_800x500.width || totalHeightNeeded > SHEET_SIZES.SI727_800x500.height) {
    console.log('[SheetSizeCalc] ✅ Selected: SI727_1000x800 (1000×800mm)')
    return 'SI727_1000x800'
  }
  if (totalWidthNeeded > SHEET_SIZES.SI727_500x400.width || totalHeightNeeded > SHEET_SIZES.SI727_500x400.height) {
    console.log('[SheetSizeCalc] ✅ Selected: SI727_800x500 (800×500mm)')
    return 'SI727_800x500'
  }
  console.log('[SheetSizeCalc] ✅ Selected: SI727_500x400 (500×400mm)')
  return 'SI727_500x400'
}
```

(The two threshold comparisons now read directly from `SHEET_SIZES` instead of repeating the raw numbers a third time in this file — same decision logic, self-consistent with the corrected table above.)

Replace line 671:

```ts
  const sheetOrder: Array<'ISO_A2' | 'ISO_A1' | 'ISO_A0'> = ['ISO_A2', 'ISO_A1', 'ISO_A0']
```

with:

```ts
  const sheetOrder: Array<'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800'> = ['SI727_500x400', 'SI727_800x500', 'SI727_1000x800']
```

Replace line 728 (comment):

```ts
      // Do NOT break: continue iterating so ISO_A0 (fewest tiles) is preferred over ISO_A2.
```

with:

```ts
      // Do NOT break: continue iterating so SI727_1000x800 (fewest tiles) is preferred over SI727_500x400.
```

Replace line 776:

```ts
  const fallbackSheet: 'ISO_A0' = 'ISO_A0'
```

with:

```ts
  const fallbackSheet: 'SI727_1000x800' = 'SI727_1000x800'
```

Replace line 832:

```ts
  sheetSize: 'ISO_A2' | 'ISO_A1' | 'ISO_A0',
```

with:

```ts
  sheetSize: 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800',
```

- [ ] **Step 6: Type-check and build the frontend**

Run: `cd app-frontend && npm run build`
Expected: succeeds with no TypeScript errors (the type-union renames must match exactly everywhere they're used, or `tsc` will fail the build — this is the verification that every occurrence in `professionalSurveyPlanExporter.ts` was updated consistently).

- [ ] **Step 7: Verify the frontend sweep is complete**

Run: `grep -rn "ISO_A2\|ISO_A1\|ISO_A0\|ISO A2\|ISO A1\|ISO A0" app-frontend/src`
Expected: zero matches.

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/components/SurveyPlanPreview.vue app-frontend/src/services/geopdf.ts app-frontend/src/utils/surveyPlanSummaryReport.ts app-frontend/src/utils/surveyPlanSummaryGenerator.ts app-frontend/src/utils/professionalSurveyPlanExporter.ts
git commit -m "refactor(sheet-sizes): rename remaining frontend ISO identifiers to SI 727-native names"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Repo-wide sweep check**

Run: `grep -rn "ISO_A2\|ISO_A1\|ISO_A0\|ISO A2\|ISO A1\|ISO A0" app-backend/src app-frontend/src app-shared`
Expected: zero matches (confirms Tasks 2, 3, 4, 5 together left nothing behind).

Run: `grep -rln "ISO_A4\|ISO_A3" app-backend/src app-frontend/src app-shared`
Expected: non-zero matches, unchanged from before this plan (confirms the Diagram plan type's genuine ISO sizes were correctly left alone throughout).

- [ ] **Step 2: Full backend suite**

Run: `cd app-backend && npm test`
Expected: PASS, all suites, zero failures.

- [ ] **Step 3: Full frontend suite**

Run: `cd app-frontend && npm run test`
Expected: PASS, all suites, zero failures.

- [ ] **Step 4: Frontend build**

Run: `cd app-frontend && npm run build`
Expected: succeeds, zero TypeScript errors.

- [ ] **Step 5: Manual end-to-end smoke check**

Run the dev server (`cd app-backend && npm run dev` and `cd app-frontend && npm run dev`), generate one General Plan PDF and one DXF for a real or test project, and confirm: the sheet-size dropdown shows the new dimensions, the generated PDF's page size is 500×400 / 800×500 / 1000×800mm (not the old ISO dimensions) at whichever tier was auto-selected or chosen, and the DXF opens with a matching paper size. Note the observed dimensions in your report.

- [ ] **Step 6: Commit any follow-up fixes**

```bash
git add -A
git commit -m "test: fix any remaining fallout from the SI 727 sheet-size rename"
```

(Skip this step entirely if Steps 1-5 passed clean with no changes needed.)

# Replace ISO A-series general-plan sheet sizes with the real SI 727 Section 62(1) sizes

## Problem

SI 727 Section 62(1) prescribes exactly three General Plan sheet sizes:
500×400mm, 800×500mm, 1000×800mm. The codebase currently substitutes ISO
A-series sizes as a stand-in — A2 (594×420mm), A1 (841×594mm), A0
(1189×841mm) — every dimension larger than the real prescribed size. All
scale-fit math (the 90% margin constraint, `checkMarginConstraint`, the
sheet-size auto-selector) computes against whatever paper dimensions the
lookup table returns, so a plan can pass those checks against the
oversized ISO paper while not actually complying with the true, smaller
SI 727 sheet — the reported "scaling issues."

## Root cause

The ISO substitution is duplicated **three times independently**, with no
shared source of truth:

- `app-backend/src/utils/si727Constants.js` — `SI727_SHEET_SIZES` (canonical
  for the PDF generator, imported by `pdfkitGeoPDF.js`).
- `app-backend/src/services/dxfGenerator.js` — its own `PAPER_SIZES` object
  (line 442), hardcoding the same numbers again, plus `ISO_A4`/`ISO_A3` for
  the unrelated Diagram plan type.
- `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
  — its own dimension dictionary again (lines 4909-4914), used by
  `exportSurveyPlanSummary()`.

Beyond these three canonical tables, the literal strings `'ISO_A2'` /
`'ISO_A1'` / `'ISO_A0'` (and the space-separated display form `'ISO A2'`
etc.) are referenced as sheet-size identifiers throughout: `app-shared/
sheetEscalation.js` (`SHEET_ORDER`, the escalation ladder both generators
retry through), a fourth ad-hoc duplicate of that same ladder
(`LABEL_SHEET_ORDER` in `pdfkitGeoPDF.js:12064`, which is redundant with the
`SHEET_ORDER` already imported at the top of that file), ~24 backend files,
8 frontend files (including a fifth independent dimension table and its own
sheet-selection algorithm in `professionalSurveyPlanExporter.ts`), and
~13 test files.

Confirmed **not** persisted anywhere: `sheetSize` never appears in a
migration or model (`grep` across `app-backend/migrations` and
`app-backend/src/models` — zero hits). It is a per-request generation
parameter only, so this refactor has no stored-data migration concern.

## Scope decision

**Approach (chosen):** Create one new shared module,
`app-shared/si727SheetSizes.js`, as the single source of truth for the
three real General Plan sizes, keyed by dimension-based names
(`SI727_500x400`, `SI727_800x500`, `SI727_1000x800`, per the confirmed
naming choice). Every consumer — backend and frontend — imports from it
instead of maintaining its own copy. `app-shared/sheetEscalation.js`'s
`SHEET_ORDER` derives its key list from the same module instead of a
separately hardcoded array, closing the exact kind of drift that let the
ISO substitution go unnoticed in the first place.

The Diagram plan type's `ISO_A4`/`ISO_A3` sizes are a genuine, different
SI 727 provision (single-stand diagrams, not General Plans under Section
62) and are **not** renamed or touched.

Rejected alternatives:

- **Keep `ISO_A2`/`A1`/`A0` as internal keys, only change the numbers.**
  Rejected per your explicit choice — code permanently reading `ISO_A2` for
  a 500×400mm sheet is a standing trap for the next person who touches this
  code and reasonably assumes it means 594×420mm ISO A2.
- **Update the 3 duplicate tables in place, keep them separate.** Rejected
  per your explicit choice — this is exactly the pattern that let the ISO
  substitution ship undetected across three independent copies; consolidating
  removes the possibility of future drift between PDF, DXF, and the frontend
  preview.
- **Give the frontend its own copy of the shared module's values instead of
  importing the same file.** Rejected — the frontend has zero existing
  imports from `app-shared` today, which is precisely how
  `SurveyPlanMapView.vue` ended up with its own drifted copy. A real
  cross-package import is a small, one-time addition (see Design) and is the
  only way to guarantee the frontend dropdown, the backend generator, and
  the DXF generator can never again disagree.

## Design

### 1. New shared module

`app-shared/si727SheetSizes.js` (new file):

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

The old `code` field (e.g. `'ISO A2'`, a human display form distinct from
the `'ISO_A2'` key) is dropped — there is no separate "official
designation" for these sizes beyond the dimensions themselves, so display
strings are built directly from `width`/`height` (e.g. `"500mm × 400mm"`)
wherever the old code built `"594mm × 420mm (ISO A2)"`. This also
simplifies `pdfkitGeoPDF.js:12684`'s `_returnedSheetSize` construction,
which today strips spaces from `pageSize.code` to recover the underscored
key (`'ISO A0'` → `'ISO_A0'`); with the new names already underscore-only
and identical between `name` and the returned identifier, that call
becomes `pageSize.name` directly — no space-stripping needed.

### 2. Backend consumers

- `app-backend/src/utils/si727Constants.js`: replace the hardcoded
  `SI727_SHEET_SIZES` array (lines 6-12) with a re-export:
  ```js
  export { SI727_GENERAL_PLAN_SHEET_SIZES as SI727_SHEET_SIZES } from '../../../app-shared/si727SheetSizes.js'
  ```
  Keeping the exported name `SI727_SHEET_SIZES` avoids touching every
  `si727Constants.js` import site for this one constant — only the entries'
  `.name`/`.width`/`.height` values and the removed `.code` field ripple
  outward (see rename sweep below for `.code` usages).

- `app-backend/src/services/dxfGenerator.js`: `PAPER_SIZES` (line 442) keeps
  its `ISO_A4`/`ISO_A3` entries as literal values (unrelated, untouched) and
  spreads in the shared table for the other three:
  ```js
  import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../app-shared/si727SheetSizes.js';
  const PAPER_SIZES = {
    'ISO_A4': { w: 297, h: 210 },
    'ISO_A3': { w: 420, h: 297 },
    ...Object.fromEntries(SI727_GENERAL_PLAN_SHEET_SIZES.map(s => [s.name, { w: s.width, h: s.height }])),
  };
  ```

- `app-shared/sheetEscalation.js`: replace the hardcoded `SHEET_ORDER`
  (line 9) with:
  ```js
  import { SI727_GENERAL_PLAN_SHEET_SIZES } from './si727SheetSizes.js';
  export const SHEET_ORDER = SI727_GENERAL_PLAN_SHEET_SIZES.map(s => s.name);
  ```

- `app-backend/src/services/pdfkitGeoPDF.js`: delete the redundant
  `LABEL_SHEET_ORDER` local array (`:12064`) and use the already-imported
  `SHEET_ORDER` (from `sheetEscalation.js`, already imported at the top of
  this file) in its place at `:12065-12071`. Update the four hardcoded
  `'ISO_A2'` fallback literals (`:10711` comment, `:12065`, `:12268`,
  `:12322`) to the new smallest-size name, `'SI727_500x400'`. Simplify
  `_returnedSheetSize` (`:12684`) to `pageSize.name` per the dropped-`code`
  note above.

- `app-backend/src/routes/surveyPlanPreview.js` and any other backend file
  the rename sweep finds referencing `'ISO_A2'`/`'ISO_A1'`/`'ISO_A0'` as a
  general-plan sheet identifier: literal rename only, no logic change.

### 3. Frontend consumers

- **New cross-package import wiring** (frontend has never imported from
  `app-shared` before): verify a relative import
  (`import { SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../../app-shared/si727SheetSizes.js'`)
  resolves through Vite in both dev and build. If Vite's dev-server file
  serving blocks it (`server.fs.allow`), add the minimal fix (an `fs.allow`
  entry or a `resolve.alias`) in `app-frontend/vite.config.ts` — whichever
  is the smaller change once actually tested; this is an implementation
  detail to confirm empirically, not a design fork.

- `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts`:
  update the `GENERAL` array's three entries to the new `value`s and
  dimension-only labels (e.g. `{ value: 'SI727_500x400', label: '500 × 400mm' }`),
  built from the imported shared table rather than hardcoded a second time.

- `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`:
  - `:710` type union (`'ISO_A2' | 'ISO_A1' | 'ISO_A0'`) → new names.
  - `:4175`, `:4187` literal fallback defaults → new names.
  - `:4908-4914` `paperDimensionsMap` → replace with the imported shared
    table (drop the unreachable plain `'A0'/'A1'/'A2'` entries — never
    produced by any input path into this map).
  - `:4922` `'ISO_A1'` auto default → new medium-size name.
  - `calculateOptimalPaperSize()` (`:1355-1370`, its own fifth ISO A4-A0
    portrait dimension table) is **dead code** — no call sites found anywhere
    in the file. Left untouched; see Out of scope.

- `app-frontend/src/components/SurveyPlanPreview.vue` (`:38-40` dropdown
  options), `app-frontend/src/services/geopdf.ts` (`:63` comment),
  `app-frontend/src/utils/surveyPlanSummaryReport.ts` (`:35`, `:60-62`),
  `app-frontend/src/utils/surveyPlanSummaryGenerator.ts` (`:424-429`):
  literal rename + label-text updates, no logic change.

- `app-frontend/src/utils/professionalSurveyPlanExporter.ts`: this file has
  its own independent sheet-size dimension table (`:117-119`) and its own
  sheet-selection algorithm (`:192-241`, `determineOptimalSheetSize`-style,
  choosing a sheet from parcel count / total area). Per the same reasoning
  as the earlier township-scale-mandate work (`2026-08-10-township-scale-
  mandate-design.md`), this file's own scale/sheet heuristics are a
  separate, apparently-unwired "intelligent preview" surface — **not**
  confirmed to be the code path that actually produces the `sheetSize` sent
  to generation. Rename its `ISO_A2`/`A1`/`A0` literals and type unions
  (`:59,67,82,117-119,192-241,671,728,776,832`) to the new names for
  consistency (so it can never emit a stale identifier the backend no
  longer recognizes), but do **not** touch its selection algorithm itself —
  that's out of scope, matching the prior decision.

### 4. Rename sweep

Mechanical, not a design decision: `SI727_500x400` / `SI727_800x500` /
`SI727_1000x800` replace `ISO_A2` / `ISO_A1` / `ISO_A0` respectively
(smallest→largest, same order) everywhere they mean a *General Plan* sheet
size — in code, comments, and test fixtures/assertions, across the ~24
backend files, ~8 frontend files, and ~13 test files (2 of which,
`sheetLayoutPlanner.test.js` and `si727LayoutCalculator.test.js`, assert
raw `594`/`841`/`1189` dimension numbers directly and need value updates,
not just key renames). `ISO_A4`/`ISO_A3` (Diagram plan type) are excluded
from this sweep everywhere they appear.

Verification method: after the sweep, `grep -rn "ISO_A2\|ISO_A1\|ISO_A0\|ISO A2\|ISO A1\|ISO A0" app-backend/src app-frontend/src app-shared` must return zero matches.

## Edge cases

- **A requested `sheetSize` the caller doesn't recognize** (e.g. a stale
  frontend build still sending `'ISO_A2'` after the backend has renamed):
  already handled by existing fallback behavior — `selectPageSize()`
  (`pdfkitGeoPDF.js:10534-10550`) logs a warning and falls back to
  auto-select rather than crashing; `dxfGenerator.js:549`'s
  `PAPER_SIZES[normalizedSheetSize] || PAPER_SIZES['ISO_A2']` fallback
  needs its literal updated to `'SI727_500x400'` as part of the sweep, or
  it would silently resolve to `undefined` post-rename. No behavior change
  needed beyond that literal fix — same graceful-degradation shape as today.
- **Portrait orientation**: `dxfGenerator.js`'s `paper.w`/`paper.h` swap for
  `orientation === 'portrait'` (`:552-554`) is dimension-agnostic and needs
  no change.
- **Diagram plan type**: entirely unaffected — `ISO_A4`/`ISO_A3` untouched,
  and diagrams never reach the General Plan sheet-size code paths (they
  branch out earlier in the routes, per the existing `planType === 'diagram'`
  checks).
- **Multi-sheet tiling** (`SI727_MAX_DENOMINATOR_BY_PLAN`-adjacent tiling
  logic from the township-scale-mandate work): reads sheet dimensions
  generically via the same lookup tables — no logic change, only the
  dimension values it computes against become the real (smaller) SI 727
  sizes, which is the intended fix.

## Testing

- **`app-shared/si727SheetSizes.js` unit tests** (new): the three entries
  have the exact prescribed dimensions (500×400, 800×500, 1000×800) in
  smallest-to-largest order; `findSheetSize` returns the right entry / `undefined`.
- **`sheetEscalation.js` regression**: `SHEET_ORDER` still has exactly 3
  entries in the same relative order as before (just renamed); `nextSheetUp`
  still walks smallest → largest → null past the end.
- **Backend generator regression**: for both `generateGeoPDF` and
  `generateDXF`, a plan whose extent previously auto-selected `'ISO_A1'`
  under the old (larger) dimensions should now correctly reflect the
  smaller real paper — add/update a test asserting the resolved sheet
  size's actual `width`/`height` match the new SI 727 values, not the old
  ISO ones. This is the direct regression test for the reported "scaling
  issue."
- **Update the ~13 existing test files** identified in the rename sweep:
  fixture `sheetSize` values and the two files asserting raw ISO mm numbers
  (`sheetLayoutPlanner.test.js`, `si727LayoutCalculator.test.js`) need their
  expected numbers changed to the real SI 727 dimensions — these are
  legitimate expectation updates (the old numbers were the bug), not
  papering over regressions.
- **Frontend**: `paperSizeOptions.test.ts` — update expected `value`s to
  the new names. Confirm the app-shared import resolves under the frontend's
  actual test runner (whatever runs `.test.ts` today), not just under Vite
  dev/build.
- **Full backend suite** (`cd app-backend && npm test`) and frontend test
  suite, both to completion, checking for any snapshot whose rendered sheet
  dimensions shift as an intended consequence of this fix.

## Out of scope

- `professionalSurveyPlanExporter.ts`'s own sheet-selection algorithm
  (`determineOptimalSheetSize`-style logic, `:192-241`) — literals renamed
  for consistency, algorithm itself untouched; same reasoning as the prior
  township-scale-mandate spec's decision not to touch this file's logic.
- `SurveyPlanMapView.vue`'s `calculateOptimalPaperSize()` (`:1355-1370`) —
  dead code, no call sites, left as-is; not part of this fix's blast radius.
- Any change to the actual scale-fit/margin-constraint algorithms
  (`checkMarginConstraint`, `calculateOptimalScale`, the 90% margin loop,
  sheet-size escalation retry logic) — these are all dimension-agnostic and
  correctly pick up the new (smaller, correct) sizes automatically once the
  lookup tables are fixed. No algorithmic changes needed or made.
- Database/migration changes — confirmed `sheetSize` is never persisted.

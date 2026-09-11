# Sheet-Aware Plan Counts — Design

Date: 2026-09-11
Status: Approved (design)

Sub-project **A** of four. See "Decomposition" below for B, C and D, which this enables
and which are NOT designed here.

## Goal

State on the Surveyor-General lodgement letter how many diagrams and general plans a record
encloses, how many **sheets** the general plans run to, and the **file types** present:

```
  [x]  Diagrams
         3 diagrams, 9 copies
         PDF 3 · DXF 3

  [x]  General Plans
         2 general plans, 4 sheets
         PDF 2 · DXF 2
```

## Context (as-found)

- **A multi-sheet general plan is ONE PDF with one page per sheet.** `_mergePDFBuffers`
  (`app-backend/src/services/pdfkitGeoPDF.js:12266`) documents that "each input buffer is a
  standalone, single-page PDFKit document" and merges them with `pdf-lib`. Called once at
  `:12583`. Therefore **PDF page count == sheet count, exactly.**
- The tiling is reported only in transit: `/geopdf/vector` sets an `X-Tile-Grid` response
  header, read at `app-frontend/src/services/geopdf.ts:170-171` and then **discarded**. Nothing
  persists it.
- **The manifest cannot see sheets.** `collectOutputManifest`
  (`app-backend/src/utils/outputManifest.js:38`) returns `{ name, relDir, mtimeMs }` only.
  This is the reason the letter cannot state sheets today.
- **One DXF per plan, never per sheet.** The `POST /api/geopdf/dxf` handler
  (`app-backend/src/routes/geopdf-vector.js:159`) returns a single buffer and performs no
  tiling. So for 2 general plans totalling 4 sheets the folder holds 2 PDFs and 2 DXFs.
- One plan generation writes up to three files into one folder — `<base>.pdf`, `<base>.dxf`,
  `<base>-summary.pdf` (`SurveyPlanMapView.vue:4549`).
- Counting today is a boolean filter: `isLodgeablePlanFile`
  (`app-frontend/src/utils/lodgementDocuments.ts:93`) = `.pdf` and not `-summary.pdf`, applied
  at `:136` (letter rows) and `:195` (`verifyAgainstManifest`). `COPIES_PER_FILE` at `:70` is
  `{ Diagram: 3, 'General Plan': 1 }`.
- The letter draws exactly one line per row: `cover-page.ts:173-186`, box at `boxSize = 3.5`,
  `yPosition += 6.5` per row.
- `pdf-lib` is already a backend dependency (`^1.17.1`).
- `coverPage.test.ts` can only assert the blob is non-empty; it cannot assert positions. It also
  constructs rows as `{ label, present }` with no `displayLabel`, so any new field must be
  optional.

## Decisions

1. **Sheet counts are DERIVED from the artifact, not declared.** Read the PDF page count when
   building the manifest. Rejected: persisting `totalSheets` from the `X-Tile-Grid` header at
   generation time — it covers only newly generated plans, leaves every existing output unknown,
   and drifts silently when a file is replaced or renamed outside the app. A derived count is
   recomputed on every render and cannot drift. (This is the same principle that makes the copy
   counts correct, and the opposite of the bug that arose when a declared value was persisted and
   read back wrong.)
2. **Only `general-plans/` PDFs are opened.** A diagram is always one sheet (confirmed by the
   surveyor), and a project can hold 60 diagrams. Opening each to learn what the rule already
   tells us would be the only costly part of the walk. General plans number one to three.
3. **A diagram never prints a sheet count.** It is always a single sheet. Consequence worth
   stating: because no diagram sheet count is ever printed, a wrong single-sheet assumption
   cannot produce a wrong number on the letter — it can only omit one that was never wanted.
4. **The `-summary.pdf` is never lodged** — excluded from counts, from file types, and from the
   letter entirely. Unchanged from current behaviour.
5. **Unknown sheet count omits the clause rather than guessing.** Falling back to "1 sheet" would
   silently under-report a 3-sheet plan on a legal document. Absent beats wrong.
6. **Each family uses its own noun** — "3 diagrams", "2 general plans", not "3 plans".
7. **This supersedes part of the 2026-09-10 record-composition design.** That spec's §4b excluded
   DXF from the letter on the reasoning that only the PDF sheet is lodged. Enumerating file types
   is the better call for digital lodgement. The DXF is now *reported*, still not *counted* as a
   lodged sheet.

## Part 1 — The manifest learns sheet counts

`collectOutputManifest` (`app-backend/src/utils/outputManifest.js`) adds an optional
`pageCount` per file, read with `pdf-lib`.

**Scope:** computed only for files whose `relDir` contains the path SEGMENT `general-plans`,
whose name matches `/\.pdf$/i`, and which do NOT match `/-summary\.pdf$/i`. Segment, not
suffix or substring — matching the convention `DOCUMENT_RULES` already uses
(`segments.some(seg => folders.includes(seg))`), so a folder like `output/old-general-plans`
cannot match.

**Failure is per-file, never fatal.** A corrupt, locked, or truncated PDF yields no `pageCount`
and remains in the manifest. The walk already tolerates unreadable directories
(`outputManifest.js` `walk`'s `catch`) and must tolerate this the same way.

**Caching:** a module-scope `Map` keyed by `absolutePath + ':' + mtimeMs + ':' + size`.
Regenerating a plan changes its mtime and invalidates the entry naturally; repeated letter
renders within one server session re-parse nothing.

Both consumer types widen with `pageCount?: number`, exactly as they did for `mtimeMs`:
- `ManifestFile` (`app-frontend/src/utils/lodgementDocuments.ts:55`)
- `getOutputManifest`'s return type (`app-frontend/src/services/documentStorage.ts:132`)

## Part 2 — A classifier replaces the boolean

`isLodgeablePlanFile` (`lodgementDocuments.ts:93`) is replaced by one function that names what
a file *is*:

```ts
export type PlanFileRole = 'sheet' | 'cad' | 'summary';

export interface ClassifiedPlanFile {
  role: PlanFileRole;
  /** Sheets this file carries. Meaningful only for role 'sheet'; null when undeterminable. */
  sheets: number | null;
}

/** Returns null when the file is not a plan product at all. */
export function classifyPlanFile(
  file: ManifestFile,
  family: 'diagram' | 'general',
): ClassifiedPlanFile | null;
```

| File | role | sheets |
|---|---|---|
| `general-undeveloped-MAGLAS.pdf` | `sheet` | `file.pageCount ?? null` |
| `diagram-STAND_207.pdf` | `sheet` | `1` — by rule, ignoring any `pageCount` |
| `*.dxf` | `cad` | `0` |
| `*-summary.pdf` | `summary` | `0` |
| anything else (e.g. `.jpg`) | `null` | — |

The `summary` role exists so the exclusion is a **stated fact** rather than a negative lookahead
buried in a regex.

**The second caller must be migrated too.** `verifyAgainstManifest` currently filters with
`isLodgeablePlanFile` at `lodgementDocuments.ts:195` for its `expectedMissing` side. Deleting the
boolean without updating that call site would break it. It becomes
`classifyPlanFile(file, family)?.role === 'sheet'`, preserving today's behaviour: a folder holding
only a `.dxf` still counts as missing its plan. The `unexpectedPresent` side continues to list
ALL files, unfiltered, so a stray DXF in an undeclared folder is still surfaced.

## Part 3 — One tally per family

```ts
export interface PlanFamilyTally {
  /** Files with role 'sheet' — i.e. distinct lodged plans. */
  plans: number;
  /** Sheets summed across them. null if ANY contributing plan's count is unknown. */
  sheets: number | null;
  /** plans x copies-per-plan: 3 for diagrams, 1 for general plans. */
  copies: number;
  /** Files with role 'cad'. */
  dxf: number;
}

export function tallyPlanFamily(
  files: ManifestFile[],
  family: 'diagram' | 'general',
): PlanFamilyTally;
```

`sheets` is `null` when any `role: 'sheet'` file in the family has an unknown count — not a
partial sum, which would read as authoritative while being short.

**What it receives:** the already folder-and-keyword-filtered `matches` that
`resolveLodgementDocuments` computes for the row (`lodgementDocuments.ts:130-135`), NOT the whole
manifest. Tallying is not responsible for deciding which folder a row owns; that rule stays in
`DOCUMENT_RULES` where it already lives.

**Integration point:** `resolveLodgementDocuments` calls `tallyPlanFamily` for the two counted
rows only (`COPIES_PER_FILE[label] !== undefined`), uses `tally.plans > 0` for `present`, and
renders `detail` from the tally. Every other row is built exactly as it is today.

## Part 4 — Rendering the multi-line row

`LodgementDocumentStatus` (`lodgementDocuments.ts:46`) gains ONE optional field:

```ts
detail?: string[];   // extra lines under the row, drawn without a tick box
```

It must be optional: `coverPage.test.ts` constructs rows as `{ label, present }`.

**Detail lines per family** (omitted entirely when `plans === 0`):

| Family | detail[0] | detail[1] |
|---|---|---|
| Diagram | `3 diagrams, 9 copies` | `PDF 3 · DXF 3` |
| General Plan | `2 general plans, 4 sheets` | `PDF 2 · DXF 2` |

Singular/plural follows the count (`1 diagram, 3 copies`). When `sheets` is null the clause is
dropped: `2 general plans`. When `dxf` is 0 the type line reads `PDF 2` alone.

**`cover-page.ts:173-186`** draws the box and tick on the first line only, then each detail line
at `marginLeft + 18` in 9pt, advancing 5mm instead of 6.5mm, restoring 11pt afterwards.

### The page-overflow guard

The letter already sits near the bottom of A4: firm header, recipient block, subject, body,
twelve rows at 6.5mm, closing, signature. Four detail lines add roughly 18-20mm against an
estimated ~17mm of headroom, which **could push the signature off the page**.

The design does not rely on that estimate. Before drawing each row, if the row plus a reserved
closing block would pass a safe bottom, start a new page and continue the list there:

```ts
/** Pure, so it can be tested without rendering a PDF. */
export function rowNeedsPageBreak(
  yPosition: number,
  rowHeight: number,
  pageHeight: number,
  reservedClosingHeight: number,
): boolean;
```

Whether the real headroom is 17mm or 40mm, the letter cannot lose its signature. **Consequence:**
when the guard fires, the existing project-information page moves from page 2 to page 3.

## Part 5 — Warnings

`buildLodgementWarnings` (`lodgementDocuments.ts:209`) gains one line, so an omitted sheets
clause is explained rather than merely absent:

> Sheet count could not be determined for 1 general plan — the letter omits the sheet total.

Pluralised on the count (`1 general plan` / `2 general plans`), consistent with the detail
lines.

## Part 6 — Edge cases

| Case | Behaviour |
|---|---|
| Folder empty | Row unticked, no detail lines (unchanged) |
| DXF present, no PDF | Row unticked, **no** detail lines. Not rendered as `PDF 0 · DXF 1`. Surfaced by the warning path instead |
| `-summary.pdf` only | Row unticked; the summary counts nowhere |
| Diagram PDF with >1 page | One diagram, no sheet count printed — no wrong number possible |
| General plan with no `pageCount` | `sheets: null`, clause omitted, warning raised |
| Corrupt PDF | Stays in the manifest without `pageCount`; treated as unknown |

## Part 7 — Testing

The repo has no `@vue/test-utils` and no `vue-tsc`; `.vue` files are not unit-tested, and view
logic is extracted to plain `.ts` and tested there. `coverPage.test.ts` can only assert the blob
is non-empty, which is why the page-break predicate is extracted as a pure function.

| File | Coverage |
|---|---|
| `utils/__tests__/planFileClassifier.test.ts` *(new)* | Every row of the role/sheets table; `.jpg` yields null; a diagram PDF carrying `pageCount: 3` still yields 1 sheet |
| `utils/__tests__/planFamilyTally.test.ts` *(new)* | The worked example (2 general plans, one with `pageCount: 3`, plus 3 diagrams); `sheets: null` when any count is missing; DXF-only yields `plans: 0` |
| `utils/__tests__/letterRowLayout.test.ts` *(new)* | `rowNeedsPageBreak`: a row that fits, one that does not, and that the reserved closing block is respected |
| `utils/__tests__/lodgementDocuments.test.ts` *(extend)* | Detail lines for both families; absent when unticked; sheets clause dropped when null; singular/plural |
| `utils/__tests__/coverPage.test.ts` *(extend)* | Still produces a PDF with `detail` supplied and with it omitted |
| `app-backend/src/utils/__tests__/outputManifest.test.js` *(extend)* | `pageCount` present for a general-plan PDF, absent for a diagram PDF, absent for `.dxf`, and a deliberately corrupt PDF still listed without one |

Commands: `cd app-frontend && npx vitest run` (full suite; currently 615 passing) and
`cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`.
Bare `npx jest` fails — the backend is ESM.

**Manual check, unavoidable:** generate a letter for a multi-sheet project and confirm the
signature is still on the page. No automated test can see the rendered layout.

## Decomposition — what this is NOT

This spec is sub-project A of four. The others get their own spec, plan and implementation:

- **B — Digital-lodgement presentation.** Largely absorbed here: the file-type lines ARE B's
  visible output. What remains of B is any further per-type detail the SG turns out to want.
- **C — Digital lodgement package.** A deterministic zip of the record with an internal index
  and checksums. Depends on this spec's classifier and tally for its index content.
- **D — Upload to the Surveyor-General's system.** **Blocked:** the SG has no published upload
  API. When specified, D should be a thin, swappable transport behind an interface, so that only
  the adapter changes. Do not invent an endpoint contract in advance.

## Out of scope

- No change to how plans are generated, tiled, or saved.
- No persistence of `X-Tile-Grid`; sheet counts stay derived.
- No per-sheet DXF export.
- No change to the nine non-plan document rows.
- No change to the Working Plan row (uncounted, single line, no file types).
- No zip packaging and no upload (sub-projects C and D).

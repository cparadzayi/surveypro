# Survey Record — Split Outputs & Harmonized Matching Design

Date: 2026-07-13
Status: Approved (design)

## Goal

Re-engineer how the comprehensive survey record is written to disk so that:

1. Each section currently bundled only inside `Comprehensive_Latest.pdf` (field
   book, coordinate list, calculations, areas & consistency) is ALSO saved as its
   own PDF in its respective output subfolder for independent retrieval — while
   `Comprehensive_Latest.pdf` remains as the collated whole record.
2. The lodgement-letter tick-box existence check is harmonized with these names
   and locations, so documents that exist (whether SurveyPro-generated or
   surveyor-supplied) are correctly ticked and false positives are eliminated.

## Problem (as-found)

- The collated `Comprehensive_Latest.pdf` = cover/letter + field book + coordinate
  list + calculations + areas & consistency. It is saved to
  `output/calculations/` via `useComprehensivePDF.generateComprehensiveLatestPDF`
  (`saveDocument`, `overwrite:true`).
- The section content already exists as separate blobs at generation time but is
  discarded after merging:
  - `TwoPassDocumentGenerator.renderPass` (`app-frontend/src/utils/TwoPassDocumentGenerator.ts`)
    builds `fieldBookResult.pdf`, `coordListPDF`, `calcsPDF`, merges them, and
    returns ONLY the merged `pdf`.
  - `comprehensive-document.ts` `generateWithTwoPass` builds the cover/letter blob
    (`coverPageGenerator.generateCoverPage`) separately, merges it in front, and
    returns only the merged pdf + measurements.
  - `generateAreaConsistencyPDF` (`useAreaConsistencyPDF.ts`) builds the areas
    `jsPDF` doc, then (when `calculationsPart1PDF` is passed) merges areas onto the
    end and returns the merged bytes — the areas-only bytes are not returned.
- The tick-box matcher (`lodgementDocuments.ts` / `useLodgementCheck.ts`, shipped
  on `nov-alpha`) scans file NAMES across `output/`+`input/` with fuzzy keywords.
  Because field book / coordinate list / calculations / areas exist only as
  sections inside `Comprehensive_Latest.pdf`, `/field.?book/i` etc. find no file
  and those items report "missing". The keyword approach also has false positives
  (e.g. `/dsg|1.?96/i` matches any name containing "196").
- `useLodgementCheck.checkLodgementDocuments` currently maps the manifest to
  `files.map(f => f.name)`, discarding `relDir` — so folder-scoped matching is not
  yet possible even though the backend manifest already returns `relDir`.
- Output subfolders already exist (`utils/project-directory.ts`
  `getProjectDirectoryStructure`): `field-book, calculations, coordinate-list,
  reports, certificates, diagrams, general-plans, working-plans, survey-record`.

## Design

### A. Expose the section blobs

Stop discarding the section blobs that are already generated:

1. `TwoPassDocumentGenerator.generate` returns
   `{ pdf, sections: { fieldBook: Blob, coordinateList: Blob, calculations: Blob }, measurements, totalPages }`.
   `renderPass` already produces these three blobs — capture and return them
   alongside the merged pdf (no change to how they're rendered).
2. `comprehensive-document.ts` `generateWithTwoPass` returns the existing merged
   pdf PLUS `sections: { cover: coverPageBlob, fieldBook, coordinateList,
   calculations }` (cover blob and the three from step 1).
3. `generateAreaConsistencyPDF` also returns the areas-only bytes. Capture
   `doc.output('arraybuffer')` (the areas jsPDF) before/independently of
   `mergeWithCalculationsPart1`, and return both the merged bytes (unchanged
   contract for existing callers) and the areas-only blob — e.g. change the return
   to `{ merged: Uint8Array, areasOnly: Blob }` (or add an out-param) and update
   `useComprehensivePDF` accordingly. Preserve the current merged behavior exactly.

### B. Save the split files

New shared composable `app-frontend/src/composables/useSurveyRecordOutputs.ts`:

- `saveSurveyRecordSections({ workingDirectory, sections, projectName }): Promise<{ saved: string[]; failed: { label: string; error: string }[] }>`.
- For each section blob, call `saveDocument({ workingDirectory, documentType, fileName, pdfBlob, overwrite: true })` into its canonical folder (table below).
- **Best-effort per file:** a single failed write (e.g. locked file) is caught,
  recorded in `failed`, and does NOT abort the others or the overall record
  generation. Return the summary so the caller can surface a concise note.
- Called from BOTH views (`MapLibreAreaView.vue`, `SurveyPlanMapView.vue`) right
  after the collated `Comprehensive_Latest.pdf` is produced/saved, using the same
  `workingDirectory`. The two call sites stay thin (one call each).

`documentStorage.saveDocument`: add the missing `documentType`→folder mappings so
sections route correctly. Required additions: `areas-consistency` →
`structure.surveyRecord`. Existing mappings reused: `field-book`→field-book,
`coordinate-list`→coordinate-list, `calculations-part1`→calculations. Keep the
existing `area-computation` mapping untouched for backward compatibility.

Canonical files written (rolling snapshots, `overwrite:true`):

| Section | documentType | Folder | Filename |
|---|---|---|---|
| Field book | `field-book` | `output/field-book/` | `FieldBook.pdf` |
| Coordinate list | `coordinate-list` | `output/coordinate-list/` | `CoordinateList.pdf` |
| Calculations | `calculations-part1` | `output/calculations/` | `Calculations.pdf` |
| Areas & consistency | `areas-consistency` | `output/survey-record/` | `AreasAndConsistency.pdf` |

`Comprehensive_Latest.pdf` continues to be written to `output/calculations/`
unchanged (the collated whole). The cover/letter blob is exposed by step A2 but is
NOT required to be saved as a standalone file (it is not one of the enclosed
documents); saving it is out of scope unless later requested.

### C. Harmonized, folder-aware matching

Restore `relDir` end-to-end and make the matcher folder-aware:

- `useLodgementCheck.checkLodgementDocuments` passes the full manifest entries
  (`{ name, relDir }[]`) to the matcher instead of `name`-only.
- `resolveLodgementDocuments(files: { name: string; relDir: string }[])` classifies
  each of the 11 items:
  - **Generated items** — present when a file exists whose `relDir` ends with the
    item's designated subfolder AND whose `name` contains the item's keyword. This
    is deterministic per folder and removes cross-folder false positives.

    | Item | Subfolder | Name keyword |
    |---|---|---|
    | Field book | `field-book` | `/field.?book/i` |
    | Coordinate List and Calculations | `coordinate-list` or `calculations` | `/coordinate\|calc\|comprehensive/i` |
    | General Plan | `general-plans` | `/general.?plan/i` |
    | Working Plan | `working-plans` | `/working.?plan/i` |
    | Report on Survey | `survey-record` or `reports` | `/report\|survey.?record/i` |
    | DSG Certificate (1/96) | `certificates` | `/dsg\|1.?96/i` |

  - **External items** — present when a file under `input/` (any depth) matches the
    keyword; no folder/name discipline imposed on the surveyor:

    | Item | Root | Name keyword |
    |---|---|---|
    | Dispensation Certificate | `input/` | `/dispensation/i` |
    | Checklist | `input/` | `/check.?list/i` |
    | Permit/Instruction and layout | `input/` | `/permit\|instruction\|layout/i` |
    | Beacon receipt | `input/` | `/beacon.*receipt/i` |
    | Searches | `input/` | `/search/i` |

- `relDir` comparison is normalized (POSIX forward slashes, case-insensitive folder
  segment match) since the manifest already emits POSIX `relDir`.

### D. Data flow & staleness

Every comprehensive-record generation (both views): build the collated
`Comprehensive_Latest.pdf` as today → call `saveSurveyRecordSections` to write the
four split files with `overwrite:true` → compute the letter tick boxes from the
freshly-written manifest. Because every split file is a rolling snapshot
overwritten on each run, the collated whole and its parts always agree.

### E. Error handling & testing

- Split saves are best-effort per file (see B); the record generation never fails
  because a section file could not be written. If `failed` is non-empty, surface a
  short note (which sections didn't save and why) without blocking.
- Section-blob exposure changes preserve every existing merged-output contract; the
  collated PDF and its page numbering are unchanged.
- Tests:
  - `lodgementDocuments` folder-aware matching: generated item present only when
    BOTH folder and keyword match; external item present on `input/` keyword;
    regression: a file named `...196....pdf` in an unrelated folder does NOT tick
    DSG; a section file in the wrong folder does NOT tick.
  - `TwoPassDocumentGenerator` returns non-empty `sections.{fieldBook,coordinateList,calculations}` blobs.
  - `useSurveyRecordOutputs` save orchestration: all four `saveDocument` calls made
    with the right documentType/filename/overwrite; a thrown save is caught and
    recorded in `failed` without aborting the rest (mock `saveDocument`).
  - Manual QA: generate from both views; confirm the four split files appear in
    their folders, `Comprehensive_Latest.pdf` still present, and the letter ticks
    field book / coordinate list / calculations / areas from the split files.

## Approaches considered

- **Split into files + keep collated (chosen)** vs. keep-collated-only with a
  PDF-content-aware matcher vs. split-only (drop the collated record). Chosen path
  serves independent retrieval AND fixes the matcher, while keeping the single
  lodgement record.
- **Matching:** canonical (folder+keyword) for generated docs + `input/` keyword
  for external docs (chosen) vs. keyword-everywhere (retains false positives) vs.
  canonical-everywhere (forces rename discipline on surveyor uploads).
- **Exposing sections:** return blobs from the existing generators (chosen; they
  already build them) vs. re-generating each section independently (wasteful,
  double work, risk of drift from the collated copy).

## Out of scope

- Saving the cover/letter as a standalone file (not an enclosed document).
- Changing section content, page numbering, or the collated record's assembly.
- Changing how external documents are uploaded (this only detects them).
- Backfilling split files for previously-generated records (they appear on the next
  regeneration).

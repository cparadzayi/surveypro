# Field book: cover page, per-project survey facts, and one pagination source

**Date:** 2026-09-18
**Status:** design approved in chat; spec awaiting review

## Problem

Three things are wrong or missing in the electronic field book.

1. **It has no cover.** The reference document `cadastral-standard/1 fieldbook cover.pdf`
   opens with an "ELECTRONIC FIELD BOOK" title page naming the surveyor, the assistant, what
   was surveyed, when, with which instruments, and at what address. We render none of it.
2. **Two facts the cover needs are captured nowhere** — the field assistant, and the
   instruments in the structured form the cover shows (make/model plus Base and Rover serial
   numbers). `survey_projects.instruments` is a single free-text column.
3. **The site calibration is rendered last, and must be first (E1).** It is currently placed
   after the point pages *on purpose*, with this reasoning in `field-book.ts`:

   > Rendered on its own page AFTER the point pages, so no point's E-number moves:
   > pointPageMap is cross-referenced by the other documents, and placing the calibration
   > first would renumber every page they point at.

   That reasoning is sound, which is exactly why moving the calibration is not a one-line
   change. It renumbers every point page, and field-book pagination is derived **independently
   in five places**, each assuming points start at E1:

   | Location | Role | points/page |
   |---|---|---|
   | `utils/field-book.ts` (`pointPageMap`) | the actual render | 27 |
   | `utils/TwoPassDocumentGenerator.ts` (`measureFieldBook`) | the measurement pass | 27 |
   | `utils/calculations-part1.ts` (`generateFieldBookPageLookup`) | the F/B column in Calculations | 27 |
   | `services/pageAllocation.ts` (`calculateFieldBookPages`) | section page-range allocation | 27 |
   | `services/pageAllocation.ts` (`createFieldBookLookup`) | F/B lookup, deprecated path only | **20** |

   Any one drifting produces a survey record whose cross-references silently lie — and one
   already has. `createFieldBookLookup` paginates at **20 points per page** while every other
   derivation uses 27, so it returns wrong E-numbers for any survey past the 20th point. It is
   reachable only from the deprecated `generateComprehensiveDocument`
   (`comprehensive-document.ts:263`), so it is latent rather than live, but it is a worked
   example of exactly the failure this refactor removes. Note that `calculateFieldBookPages`
   carries the comment "FIXED VALUE - matches field-book.ts", which is the duplication
   apologising for itself.

## Decisions taken

Settled in conversation on 2026-09-18:

- **The assistant and instruments are per-project**, stored on `survey_projects` — the
  assistant changes between surveys and a firm may hire or swap GNSS kit.
- **With no site calibration, point pages start at E1.** The calibration takes E1 only when one
  exists, so the point offset is 0 or 1 and must be an *input* to pagination, never assumed.
- **One source of truth for pagination.** Extract a single module every consumer calls, rather
  than applying the same offset in five places.
- **Existing records are not preserved under the old numbering.** Moving the calibration to E1
  shifts every point's E-number by one wherever a calibration exists, so a record regenerated
  after this ships will not match a copy generated before it. That is accepted: survey records
  are regenerated wholesale, never patched page by page. No compatibility shim, no versioned
  pagination, no migration of stored F/B strings.

## Out of scope: the registration portal

The original request allowed that registration might need redesigning to capture the cover's
fields. It does not. Every cover field describing the *surveyor* is already captured in
`surveyor_profiles` and already reaches the generators:

| Cover field | Source | Already captured? |
|---|---|---|
| Land Surveyor | `surveyor_profiles.name` | yes |
| Address | `surveyor_profiles.address` | yes |
| Survey of | project designation (`surveyorInfo.surveyOf`) | yes |
| Surveyed in | `surveyorInfo.surveyDate` | yes |
| Assisted by | — | **no — Part B** |
| Instruments (make/model, Base S/N, Rover S/N) | `survey_projects.instruments` is free text | **no — Part B** |

`surveyor_profiles`, `/auth/register` and `/auth/me` are **not modified by this work.**

## Part C — one pagination source, calibration at E1

### New module

`app-frontend/src/utils/fieldBookPagination.ts`:

```ts
export const FIELD_BOOK_POINTS_PER_PAGE = 27;

export interface FieldBookPagination {
  /** point id -> E-number, e.g. "E2" */
  pointPageMap: Record<string, string>;
  /** E-number of the calibration page, or null when the survey has none */
  calibrationPage: string | null;
  /** count of NUMBERED (E) pages */
  ePageCount: number;
  /** count of PHYSICAL pages, including the unnumbered cover */
  physicalPageCount: number;
}

export function paginateFieldBook(
  points: { id: string }[],
  opts: { hasCalibration: boolean; hasCover: boolean },
): FieldBookPagination;
```

### Contract

`points` must be **exactly the points the field book will render, in render order.**

This is load-bearing. Calculated points do not appear in the field book, so if a caller passes
an unfiltered list, every E-number after the first calculated point shifts. The existing filter
in `generateFieldBookPageLookup` stays where it is and runs *before* this call. The function
does not filter; it paginates what it is given.

### Numbering rules

- The calibration page, when present, is **E1**; point pages follow from E2.
- With no calibration, point pages start at **E1**.
- The cover is **not numbered** and never consumes an E-number. It affects
  `physicalPageCount` only.
- `ePageCount = ceil(points.length / 27) + (hasCalibration ? 1 : 0)`.
- `physicalPageCount = ePageCount + (hasCover ? 1 : 0)`.

### Call sites to convert

All five delete their own arithmetic and call `paginateFieldBook`:

1. `field-book.ts` — renders the calibration page first, then point pages, from the returned map.
2. `TwoPassDocumentGenerator.measureFieldBook` — returns `ePageCount`/`pointPageMap` from it.
   The comment stating the calibration "never [changes] a point's E-number" is now false and is
   replaced by the new rule.
3. `calculations-part1.ts` `generateFieldBookPageLookup` — keeps its calculated-point filter and
   its `lookup[id] = '-'` for excluded points, and paginates the remainder through the module.
4. `pageAllocation.calculateFieldBookPages` — returns `ePageCount`, keeping its existing cap of
   99 pages applied after the module's count.
5. `pageAllocation.createFieldBookLookup` — returns the module's `pointPageMap`. This corrects
   its 20-points-per-page bug as a side effect of the consolidation. Being on the deprecated
   path makes it low-risk to change, not a reason to leave it wrong.

After this, the page size is stated once, as `FIELD_BOOK_POINTS_PER_PAGE`. The guard is the
parity test below, which drives every consumer from the same input and asserts they agree —
not a grep for the literal `27`, which would false-positive on unrelated constants.

Part C also adds a **measured-vs-rendered guard for the field book** in
`TwoPassDocumentGenerator`, mirroring the one that already exists for the beacon-comparison
section: if the rendered page count disagrees with the measured one, throw rather than log.
Without it, a future regression in pagination renumbers the record silently (see Risks).

## Part B — assistant and instruments on the project

### Storage

`survey_projects` lives in **each surveyor's schema**, not `public`. It is created by the SQL
function `create_surveyor_schema()`, last redefined in `app-backend/migrations/079.do.sql`.

New migration `089_add_assistant_and_instruments_to_projects.do.sql` must do **both** of:

1. **Alter existing schemas** — loop and `ADD COLUMN IF NOT EXISTS`, following the shape of
   `088_add_compilation_to_projects.do.sql`: iterate `information_schema.schemata WHERE
   schema_name LIKE 'surveyor_%'`, and also patch `public.survey_projects` if it exists.
2. **Redefine the template** — `CREATE OR REPLACE FUNCTION create_surveyor_schema(...)` carrying
   the four new columns, following the precedent of `079.do.sql`, so surveyors registered after
   this deploy get them.

Step 2 matters and is easy to skip: it is what `079` did and what `083`–`088` did not.

> **Pre-existing bug found while writing this spec, deliberately NOT fixed here.** Because
> migrations `083`–`088` altered existing schemas without redefining the template, the function
> is current only as of `079`. A surveyor registering today receives a `survey_projects` table
> missing `whole_portion`, `parent_property`, the diagram reference fields, the original
> title-deed fields, and `compilation`. This work must not add to that set — hence step 2 — but
> repairing the existing gap is a separate change with its own testing, and is out of scope.
> It should be raised as its own task.

Note also that the two precedents disagree on how to enumerate schemas: `079` reads
`surveyor_profiles WHERE schema_name IS NOT NULL`, `088` reads `information_schema.schemata`.
Prefer `information_schema`, which cannot miss a schema whose profile row is absent or stale.

New columns:

| Column | Type | Meaning |
|---|---|---|
| `assisted_by` | `VARCHAR(255)` | field assistant's name, as printed on the cover |
| `instrument_description` | `VARCHAR(255)` | make and model, e.g. `Trimble R6GNSS Set` |
| `instrument_base_serial` | `VARCHAR(100)` | Base receiver serial number |
| `instrument_rover_serial` | `VARCHAR(100)` | Rover receiver serial number |

Flat columns, not JSONB: a survey uses exactly one GNSS pair (confirmed 2026-09-18), so the
array the reference sample's `1.` numbering hints at is not needed. Should a second instrument
set ever be required, that is a migration, not a reason to carry a collection now.

The existing free-text `instruments` column is left in place and untouched — nothing migrates
out of it, and no backfill is attempted.

**It is, however, already carrying this exact content.** The project-setup form's "Instruments
Used" textarea placeholder reads:

```
e.g., 1. Trimble R6GNSS Set
Base Serial Number S/N 5016424521
Rover Serial Number S/N 5146476624
```

— character-for-character the cover's instrument block. Surveyors have been entering the right
data in the right shape into an unstructured field. Structured columns were chosen over keeping
that free text (confirmed 2026-09-18) so the cover's layout is guaranteed rather than dependent
on typing, and so the serials are queryable later.

Two consequences follow:

1. The textarea is **replaced** by the three structured inputs, not kept alongside them. Two
   editable homes for one fact is how they drift apart.
2. Because existing projects have their instruments only in the free-text column, the cover
   **falls back to `instruments` verbatim** when all three structured fields are empty. An
   existing project therefore still renders a correct cover, and re-entering the data in the
   new inputs takes over from the fallback. This fallback is the only reader of the old column.

All four columns are nullable. A project missing any of them renders a cover with the
corresponding row omitted (see Part A).

### API and state

- `app-backend/src/routes/survey-projects.js` accepts and returns all four fields; the Fastify
  body schema gains `assistedBy`, `instrumentDescription`, `instrumentBaseSerial` and
  `instrumentRoverSerial`, all optional strings.
- `useCadastralWorkflow.ts` `workflowState.surveyorInfo` gains the same four, persisted through
  the existing `surveyor_info` step-data mechanism that already round-trips this object.
- The project-setup form in `CadastralStandardView.vue` gains four plain text inputs:
  assistant, instrument description, Base serial, Rover serial.

## Part A — the cover

Rendered by `FieldBookGenerator` as physical page 1, before the calibration page. It is a
section cover for the field book, distinct from `CoverPageGenerator`, which covers the whole
record.

### Layout

Modelled on `cadastral-standard/1 fieldbook cover.pdf` (US Letter, 612 x 792 pt). Labels are
bold and underlined in a left column; values sit in a second column, each preceded by a colon.
Measured from the reference, in mm from the page edges:

| Element | x | y | Notes |
|---|---|---|---|
| `ELECTRONIC FIELD BOOK` | 24 | 12 | ~16pt, not bold |
| Label column | 15 | — | bold, underlined, ~9pt |
| Value column | 33 | — | regular, ~9pt |
| Land Surveyor | — | 21 | |
| Assisted by | — | 29 | |
| Survey of | — | 37 | wraps to further lines; bold in the reference |
| Surveyed in | — | 46 | month and year, e.g. `June 2020.` |
| Instruments | — | 54 | `1. <description>`, then indented Base and Rover serial lines |
| Address | — | 66 | multi-line, one line per address line |

Rows below a multi-line value shift down by the extra lines consumed. `Survey of`, `Instruments`
and `Address` are all multi-line in the reference.

A row whose value is absent is **omitted entirely** — no empty label, no blank colon. This keeps
the cover honest for projects predating Part B.

### Metadata

`FieldBookMetadata` gains:

```ts
assistedBy?: string;
instrumentDescription?: string;
instrumentBaseSerial?: string;
instrumentRoverSerial?: string;
```

### Contract changes

- `generateFieldBookPDF`'s docstring currently reads "E1-E99 pages only, no cover". That is no
  longer true and is rewritten.
- Its returned `pageCount` becomes **physical** pages (cover included). E-numbers come only from
  `paginateFieldBook`. Every consumer of that value must be checked — see Risks.

## Data flow

```
surveyor_profiles ──┐
                    ├─> workflowState.surveyorInfo ──> FieldBookMetadata ──> cover page
survey_projects  ───┘   (assistedBy, instrument description + serials)

field book point list ──> paginateFieldBook ──┬─> field-book.ts render
   (calculated excluded)                      ├─> measureFieldBook
                                              └─> generateFieldBookPageLookup ──> F/B column
```

## Testing

- **`paginateFieldBook` unit tests** (pure function, no PDF): exact boundaries at 27 and 28
  points; with and without calibration; cover on and off; empty point list.
- **Parity test across all five consumers** — the renderer's `pointPageMap`, the measurement
  pass's map, Calculations' lookup, `calculateFieldBookPages` and `createFieldBookLookup` all
  agree for the same input. This is the regression guard against the drift that motivated
  Part C, and it must fail if any one of them reverts to local arithmetic. It would have caught
  the existing 20-vs-27 bug.
- **Calibration placement test** — with a calibration, it is E1 and the first point is E2;
  without, the first point is E1.
- **Cover render test** — generate the field book and assert against the PDF content stream that
  each label and its value are placed, and that an absent value omits its row. Uses the
  stream-parsing approach already used in `calculationsCombinedTable.test.ts`.
- **Cover does not renumber** — adding the cover leaves every E-number unchanged.
- **Backend**: migration applies cleanly twice (idempotent), and a schema created after the
  migration has both columns.

## Risks

1. **`pageCount` semantics change** from E-pages to physical pages, and
   `services/pageAllocation.ts` allocates each section's page range from these counts, so a
   wrong value shifts page numbers across the whole record. Worse, **nothing will catch it**:
   `TwoPassDocumentGenerator` guards only the beacon-comparison section against a
   measured-vs-rendered mismatch (`beaconResult.pageCount !== measurements.beaconComparison.pages`,
   which throws); the field book's counts are logged and never compared. Part C should add the
   equivalent guard for the field book while it is in this code, so a future drift fails loudly
   instead of silently renumbering the record.
2. **`.vue` has no test harness** in this repo (no `@vue/test-utils`, no `vue-tsc`), so the
   project-setup form verifies only as "suite green + build compiles" plus explicit manual
   browser steps. Keep logic out of the component.
3. **Multi-schema migration** must be idempotent (`IF NOT EXISTS`) and must not fail on schemas
   created between the function replacement and the loop.
4. **Two digitizing viewers.** `CadastralStandardView.vue` is the project-setup surface, but
   `MapLibreAreaView.vue` and `AreaComputationView.vue` both build `surveyorInfo` objects for
   generation. Any new field must be threaded through every site that constructs one, or the
   cover renders blank from one entry point and populated from another.

## Implementation order

**C → B → A.**

C is the riskiest and is fully testable in isolation, so it lands first with the calibration
move. B unblocks A's data. A is the visible payoff and depends on both.

A may be pulled forward if the cover is wanted sooner; it will render with the Assisted by and
Instruments rows omitted until B lands.

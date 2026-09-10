# Record Composition — Implementation Plan

Date: 2026-09-10
Spec: `docs/superpowers/specs/2026-09-10-record-composition-design.md`
Status: Ready to implement

## Decisions resolved since the spec

The spec left two questions open (§4b wording, §Decisions 4 inference rule). Both are
now answered and this plan supersedes those two spec sections. Everything else in the
spec stands as written.

### 1. Letter counts (supersedes spec §4b, "no count")

The letter **does** show a count, computed from the output manifest, not typed by the
surveyor:

- **Diagrams:** `filesIn('output/diagrams').length * 3`. Three copies of each diagram
  are lodged, so the enclosed count is the file count times three, not the file count.
- **General Plans:** `filesIn('output/general-plans').length`. One copy per plan — no
  multiplier.

This replaces the plain `present: boolean` status for these two rows with a count, e.g.
*"Diagrams (9)"* for 3 diagram files, *"General Plan (2)"* for 2 general-plan files.
The earlier "count goes stale when a plan is superseded" concern is moot: the count is
derived live from the manifest at letter-generation time, the same way presence already
is — there is nothing to go stale that isn't already re-derived on every render.

### 2. Inference rule (supersedes spec §Decisions 4)

Grounded in SI 727 §61(1)(a): a General Plan is required when a parcel is divided into
**three or more** adjoining parcels and the immediate parent property is plotted at too
small a scale to show the portions clearly. The pre-fill threshold moves from `>= 2` to
`>= 3`:

| Parcel count (excluding Outside Figure) | Inferred composition |
|---|---|
| `0` | neither (unchanged — not a valid confirmed state) |
| `1` or `2` | Diagrams |
| `>= 3` | General Plans |

"Both" is still never guessed (spec Decision 4, unchanged). This is a pre-fill only —
the surveyor confirms or overrides it, so a record legitimately split into 2 parcels
that still needs a General Plan (small-scale parent, per §61(1)(a)'s second clause) is
not blocked, only defaulted differently. `inferComposition`'s doc comment should cite
§61(1)(a) so the threshold isn't mistaken for an arbitrary number later.

## Task breakdown

Ten tasks, each independently testable, in dependency order. TDD per the repo
convention: extract logic into a plain `.ts`/`.js` module, test that module, keep the
`.vue`/route edits declarative.

### 1. `app-frontend/src/utils/recordComposition.ts` (new)

Pure module per spec Part 1:

- `RecordComposition` interface (`includesDiagrams`, `includesGeneralPlans`, `source`,
  `confirmedAt`).
- `inferComposition(parcelCount)` — thresholds above; cite SI 727 §61(1)(a) in the
  doc comment.
- `normalizeComposition(raw)` — validate untyped jsonb from `step_data`, return `null`
  when unusable.
- `allowsFamily(composition, family)` — `'working'` always true; `'diagram'` ⇒
  `includesDiagrams`; `'general'` ⇒ `includesGeneralPlans`.
- `describeComposition(composition)` — banner text, disabled-option reason strings.

**Not here:** `verifyAgainstManifest` — moved to `lodgementDocuments.ts` (task 3) to
avoid the circular import (`ManifestFile` is defined there).

**Tests:** `utils/__tests__/recordComposition.test.ts` — inference boundaries (0, 1, 2,
3, many), `normalizeComposition` against malformed/missing/partial jsonb, the
`allowsFamily` matrix (3 families × composition states), `describeComposition` wording
for all three confirmed states plus the unconfirmed state.

### 2. `PlanTypeMeta.family` + `planTypeOptions.ts` (new)

- Add `family: 'diagram' | 'general' | 'working'` to `PlanTypeMeta`
  (`app-frontend/src/views/modules/cadastral-standard/planTypes.ts:9,19`). Map:
  `diagram` ⇒ `'diagram'`; `general-developed` / `general-undeveloped` ⇒ `'general'`;
  `working-plan` ⇒ `'working'`.
- New `app-frontend/src/views/modules/cadastral-standard/planTypeOptions.ts`:
  `planTypeOptionsFor(composition)` returns `{ type, label, disabled, disabledReason }[]`
  over `PLAN_TYPE_META`, using `allowsFamily` from task 1. Gating is a no-op (nothing
  disabled) while `composition` is unconfirmed or absent, per spec Part 3.

**Tests:** `views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts` —
enabled/disabled sets for each confirmed composition and the unconfirmed passthrough.

### 3. `lodgementDocumentsFor` + Diagram rule + `verifyAgainstManifest`

In `app-frontend/src/utils/lodgementDocuments.ts`:

- Add the Diagram rule to `DOCUMENT_RULES`:
  `'Diagram': { kind: 'generated', folders: ['diagrams'], keyword: /diagram/i }`.
- Replace the flat `LODGEMENT_DOCUMENTS` usage with `lodgementDocumentsFor(composition)`:
  includes `'Diagram'` iff `includesDiagrams`, `'General Plan'` iff
  `includesGeneralPlans`, Diagram immediately before General Plan, the other nine items
  unconditional in current order. Keep `LODGEMENT_DOCUMENTS` exported as the
  both-inclusive default (the `cover-page.ts:170` fallback needs no change).
- Counts (per Decision 1 above): the two plan rows resolve to a `count`, not a
  `present` boolean.
  - `'Diagram'` count = matching files in `output/diagrams` × 3.
  - `'General Plan'` count = matching files in `output/general-plans`, unmultiplied.
  - Every other row keeps its existing `present: boolean` status — the multiplier is
    specific to the two plan families, not a general document-status change.
- `verifyAgainstManifest(composition, files): { expectedMissing, unexpectedPresent }`
  lives here (not in `recordComposition.ts`) to avoid the circular import — `ManifestFile`
  is defined in this file.

**Tests:** extend `utils/__tests__/lodgementDocuments.test.ts` — diagram-only omits
General Plan row; GP-only omits Diagram row; both includes both; Diagram rule
folder-gates to `output/diagrams` and does not match a diagram-named file elsewhere;
count math (2 diagram files → count 6; 2 GP files → count 2); `verifyAgainstManifest`
both directions.

### 4. Backend `mtimeMs` (Cleanup #2 from spec)

`app-backend/src/utils/outputManifest.js:30` — `collectOutputManifest` adds `mtimeMs`
via `fs.statSync` alongside the existing `{ name, relDir }`.

**Tests:** extend `app-backend/src/utils/__tests__/outputManifest.test.js` — `mtimeMs`
present and plausible (within test run time bounds).

### 5. `useRecordComposition` composable (new)

`app-frontend/src/composables/useRecordComposition.ts` — module-scope `ref` cache keyed
by `projectId` (pattern from `stores/projectContext.ts`):

- Hydrate from `workflowState.step_data['record-composition']` via
  `normalizeComposition` on load.
- `confirm(composition)` — writes through `PATCH /api/survey-projects/:id/workflow`
  (`action: 'update'`, key `record-composition`), sets `source: 'confirmed'` and
  `confirmedAt`.
- Exposes the current composition reactively so gating updates without a refetch.

**Tests:** covered indirectly through the `.vue` integration (no `@vue/test-utils` in
this repo, per spec Context) — verify via the `useLodgementCheck` and
`planTypeOptions` tests which consume its output shape.

### 6. `useLodgementCheck.ts`

Extend to take the composition:

- Build the expected list via `lodgementDocumentsFor(composition)` (task 3).
- When no composition is confirmed, fall back to the both-inclusive
  `LODGEMENT_DOCUMENTS` list and report only the *absent* direction (today's behaviour
  plus the Diagram row) — an unconfigured project never regresses.
- When confirmed, report both directions via `verifyAgainstManifest`: expected-but-
  absent and present-but-unexpected.
- Plan-row entries carry the new `count` (task 3) instead of `present` where
  applicable; the check logic (present/absent) treats `count > 0` as present.

**Tests:** extend `composables/__tests__/useLodgementCheck.test.ts` — composition-aware
missing and unexpected-present, unconfirmed fallback, count-aware presence.

### 7. Inference & confirm surface (spec Part 2)

Top of `SurveyPlanViewNew.vue`:

- On mount: hydrate from `useRecordComposition`; if `source: 'confirmed'` already
  present, stop.
- Otherwise fetch `getLandParcels(projectId)`, count excluding Outside Figure (use the
  now-exported `isOutsideFigureParcelName` from `parcelValidation.ts:40` — do not add a
  13th inline copy), call `inferComposition` (task 1, new threshold).
- Render the banner: three options (Diagrams / General Plans / Both) + Confirm. While
  unconfirmed, banner stays prominent; once confirmed, collapses to a one-line summary
  with a Change link.

### 8. Gating — the two `.vue` surfaces (spec Part 3)

- **8a — `SurveyPlanViewNew.vue` card picker.** A blocked card (via `allowsFamily`)
  stays in place, greys out, ignores clicks, shows the inline reason from
  `describeComposition`.
- **8b — `SurveyPlanMapView.vue:332` dropdown (Cleanup #1).** Replace the four
  hardcoded `<option>`s with `v-for` over `planTypeOptionsFor(composition)` (task 2),
  each disabled option suffixed "(not in this record)". On load, normalize
  `config.planType` to the first allowed type if the current value is disabled.

Both surfaces gate only once `source: 'confirmed'` — never on an inferred value (spec
Part 3, unchanged).

### 9. Record call sites (spec §4e)

Pass the composition into `checkLodgementDocuments` at both comprehensive-record call
sites: `SurveyPlanMapView.vue:4627` and `MapLibreAreaView.vue:6282` — same both-sites
pattern as the 2026-07-13 letter work.

### 10. Full test pass + regression check

- Frontend: `cd app-frontend && npm test`.
- Backend: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`.
- **Check, don't assume:** `pdfkitGeoPDF.snapshot.test.js` snapshots exact rendered
  text x/y. This work changes both the line count (Diagram row) and the row text
  (counts, not just presence) in the letter's enclosed list. That snapshot is backend
  PDFKit and the letter is frontend jsPDF, so it most likely does not fire — but if it
  does, inspect the diff before regenerating it.

## Order of work

1 → 3 → 4 (independent of 1–3, can run in parallel) → 2 → 5 → 6 → 7 → 8 → 9 → 10.

Tasks 1, 3, and 4 have no Vue dependency and are the natural place to start/parallelize.
Tasks 7–9 depend on 1, 2, 3, 5, and 6 all being in place.

## Out of scope (unchanged from spec)

- No new DB column, migration, or endpoint.
- No changes to the nine non-plan document rules.
- No refactor of the twelve existing inline Outside Figure checks.
- No fix for `survey-plan` missing from the `workflowSteps` array.
- Working Plan gating.

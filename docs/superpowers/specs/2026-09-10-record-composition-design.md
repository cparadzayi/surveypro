# Record Composition — Design

Date: 2026-09-10
Status: Approved (design)

## Goal

The lodgement letter to the Surveyor-General must state whether the survey record
encloses **Diagrams**, **General Plans**, or **both**. The surveyor declares that
configuration once, it persists with the project, and it drives the letter, the
document checks, and which plan types the workflow offers.

## Context (as-found)

- `LODGEMENT_DOCUMENTS` (`app-frontend/src/utils/lodgementDocuments.ts:8`) is a
  hardcoded 11-item list containing `'General Plan'` and **no `'Diagram'` entry at
  all**. Consequences today:
  - a diagram-only record still prints "General Plan", permanently unticked;
  - diagrams that *were* produced are never listed, though they are written to
    `output/diagrams/` (`app-frontend/src/utils/project-directory.ts:104`).
- `resolveLodgementDocuments` (`lodgementDocuments.ts:55`) already folder-gates
  `'General Plan'` to `output/general-plans`, so the diagram rule is a mirror of
  machinery that exists.
- Plan-type vocabulary lives in
  `app-frontend/src/views/modules/cadastral-standard/planTypes.ts`
  (`PlanType`, `PLAN_TYPE_META:19`, `PlanTypeMeta:9`).
- Plans are reached through **two** choosers, not through dedicated workflow steps:
  - `SurveyPlanViewNew.vue:12,26,40` — a three-card picker
    (`diagram` / `working-plan` / `township-general-plan`). The third key is **not**
    a `PlanType`; it is a wrapper that opens `SurveyPlanMapView`, where
    developed/undeveloped is then chosen.
  - `SurveyPlanMapView.vue:332` — a `<select>` that **hardcodes the same four plan
    types** that `PLAN_TYPE_META` already defines. Two lists, one vocabulary.
- `survey-plan` is a real `currentStep` value (`CadastralStandardView.vue:1137`
  renders `SurveyPlanViewNew`) even though it is absent from the `workflowSteps`
  array at `CadastralStandardView.vue:1604`. Not fixed here; noted so it is not
  mistaken for a gap.
- Per-project persistence already exists: `workflow_state.step_data[<key>]`, written
  by `PATCH /api/survey-projects/:id/workflow`. The `action: 'update'` branch
  (`app-backend/src/routes/survey-projects.js:428`) merges into `step_data[step]`
  for an **arbitrary** key with no whitelist — the same mechanism `project-setup`
  uses.
- `collectOutputManifest` (`app-backend/src/utils/outputManifest.js:30`) returns only
  `{ name, relDir }` — no mtime, no size. Nothing exists to distinguish a current
  plan from an abandoned trial.
- The Outside Figure predicate exists as `isOutsideFigureParcelName`
  (`app-frontend/src/services/parcelValidation.ts:40`) but is module-private; the
  same `.includes('outside figure')` test is inlined in ~12 other places.
- No `@vue/test-utils`; nothing mounts components. The repo convention is to extract
  view logic into a plain `.ts` module and unit-test that (see
  `components/inputs/ParcelSelect.vue` + `parcelSelect.ts`).

## Decisions

Recorded because each rules out an approach that looked reasonable.

1. **Inferred, then confirmed, then verified — not inferred alone.** Pure inference
   from the output folders at generation time was considered and rejected: it cannot
   gate the workflow (the folder is populated at the *end*, so gating the Diagram
   step on an empty `diagrams/` is circular), and it removes the "expected" side of
   the existing missing-document check, so a plan that was never generated could
   never be reported missing.
2. **Two booleans, not a 3-way enum.** `includesDiagrams` / `includesGeneralPlans`.
   The three configurations are the three valid combinations; gating is naturally
   per-type; a fourth product would not reshape the model. The UI still presents
   three options.
3. **Persist in `workflow_state.step_data`, not a new column.** No migration, no new
   endpoint, no per-surveyor-schema work. A first-class `record_composition` column
   is the right move only once a cross-project query needs it.
4. **Parcel count drives the pre-fill; "both" is never guessed.** Whether individual
   stand diagrams are cut inside a general plan is an instruction/commercial
   decision, absent from the data.
5. **Excluded plan types are disabled with a reason, not hidden.** Hidden UI in a
   professional tool reads as a bug.
6. **Working Plan is never gated.** It is neither a diagram nor a general plan and is
   lodged either way.

## Part 1 — Data model & persistence

New pure util `app-frontend/src/utils/recordComposition.ts`:

```ts
export interface RecordComposition {
  includesDiagrams: boolean
  includesGeneralPlans: boolean
  /** 'inferred' until the surveyor confirms it; 'confirmed' after. */
  source: 'inferred' | 'confirmed'
  confirmedAt?: string
}
```

| Function | Responsibility |
|---|---|
| `inferComposition(parcelCount)` | `>= 2` ⇒ general plans; `=== 1` ⇒ diagrams; `0` ⇒ neither. Always `source: 'inferred'`. |
| `normalizeComposition(raw)` | Validate untyped jsonb; return `null` when unusable. |
| `allowsFamily(c, family)` | `'working'` always true; `'diagram'` ⇒ `includesDiagrams`; `'general'` ⇒ `includesGeneralPlans`. |
| `describeComposition(c)` | "General Plans and Diagrams" / "Diagrams only" — banner, disabled-option reason, warnings. |
| `verifyAgainstManifest(c, files)` | `{ expectedMissing, unexpectedPresent }` — the end-of-job cross-check. |

**Persistence.** Key `record-composition` under `workflow_state.step_data`, written via
the existing `PATCH /api/survey-projects/:id/workflow` with `action: 'update'`.
**No backend change and no migration.**

**Only confirmed compositions are persisted.** An inferred value lives in memory until
the surveyor confirms it, so anything read back from `step_data` is by construction
`source: 'confirmed'`. Re-inference therefore never overwrites a human decision, and a
persisted value never needs re-confirming.

**A composition must include at least one family.** `inferComposition(0)` returns
neither flag set, which is not a valid *confirmed* state: the confirm control offers
Diagrams / General Plans / Both and cannot submit an empty selection.

**Reactivity.** `app-frontend/src/composables/useRecordComposition.ts` holds a
module-scope `ref` cache keyed by `projectId` — the pattern `stores/projectContext.ts`
already uses — hydrated from `workflowState` on load, written through on confirm, so
gating updates immediately without a refetch.

## Part 2 — Inference & the confirm surface

**Where:** the top of `SurveyPlanViewNew.vue` (the `survey-plan` step). Parcels are
digitized and areas computed by then; it is immediately before any plan is produced;
and it is the screen holding the cards that get gated. **No new workflow step, no
modal.**

**On mount:**

1. Hydrate from `workflowState`; a valid `source: 'confirmed'` value ends it.
2. Otherwise fetch via `getLandParcels(projectId)`
   (`app-frontend/src/services/landParcels.ts:45`), count parcels **excluding the
   Outside Figure**, and call `inferComposition`.
3. Render a banner above the cards — *"Record composition: **General Plans** —
   inferred from 47 parcels"* — with the three options and a **Confirm** button.
4. While `source: 'inferred'` the banner stays prominent; once confirmed it collapses
   to a one-line summary with a **Change** link.

`isOutsideFigureParcelName` (`parcelValidation.ts:40`) is exported and reused rather
than inlining a thirteenth copy of the check. The twelve existing copies are **not**
refactored — unrelated to this work.

A project that never reaches the `survey-plan` step behaves exactly as it does today.

## Part 3 — Gating

`PlanTypeMeta` (`planTypes.ts:9`) gains one field:

```ts
family: 'diagram' | 'general' | 'working'
```

`diagram` ⇒ `'diagram'`; both `general-*` ⇒ `'general'`; `working-plan` ⇒ `'working'`.
Gating reduces to `allowsFamily(composition, family)` in both surfaces instead of
matching four plan-type strings in two places. It also resolves the
`township-general-plan` mismatch: that card declares `family: 'general'` and never
names a specific plan type.

**Gating applies only once the composition is confirmed.** While `source: 'inferred'`
— and when no composition exists at all — every plan type stays fully enabled and the
banner simply asks for confirmation. This is what makes a wrong guess harmless: an
inference that misreads the survey can never block the surveyor, it can only propose.
It also disposes of the zero-parcel case, where `inferComposition(0)` sets neither flag
and gating on it would otherwise block every plan type at once.

**3a — card picker** (`SurveyPlanViewNew.vue:12,26,40`). A blocked card keeps its
position, greys out, ignores clicks, and carries the reason inline: *"This record is
configured as General Plans only. Change it in Record Composition above."*

**3b — plan-type dropdown** (`SurveyPlanMapView.vue:332`). **Cleanup #1:** replace the
four hardcoded `<option>`s with a `v-for` over `PLAN_TYPE_META`, each
`:disabled="!allowsFamily(...)"` and suffixed *"(not in this record)"*.

**Bug this exposes:** `config.planType` is independent state. If it already holds
`'diagram'` when a general-plans-only composition loads, the `<select>` sits on a
disabled option. On load, normalise `config.planType` to the first allowed type.

**Testability:** decisions live in `planTypeOptionsFor(composition)` and
`allowsFamily(...)` — pure functions; the `.vue` edits stay declarative.

## Part 4 — The letter

**4a.** Add the mirror rule to `DOCUMENT_RULES` (`lodgementDocuments.ts:38`):

```ts
'Diagram': { kind: 'generated', folders: ['diagrams'], keyword: /diagram/i },
```

`LODGEMENT_DOCUMENTS` becomes `lodgementDocumentsFor(composition)`, including
`'Diagram'` and/or `'General Plan'` per the flags, with the other nine items
unconditional and in their current order. Diagram sits immediately before General
Plan. The existing const stays exported as the both-inclusive default so the fallback
at `cover-page.ts:170` keeps working — **`cover-page.ts` needs no rendering change**,
since it already iterates `info.documents` (`cover-page.ts:167`).

**4b. Label wording.** `"Diagram"` for a single file, `"Diagrams"` for several, **no
count**. A count on a letter to the SG goes stale the moment a plan is superseded, and
the tick already carries the signal.

**4c. `useLodgementCheck.ts`** takes the composition, builds the expected list from it,
and reports **both** directions. When **no composition is confirmed** it falls back to
the both-inclusive list and reports only the *absent* direction — i.e. exactly today's
behaviour plus the Diagram row, so an unconfigured project never regresses:

- *expected but absent* — "This record is configured as General Plans + Diagrams, but
  `output/diagrams/` is empty."
- *present but unexpected* — "`output/diagrams/` holds 3 file(s), but this record is
  configured as General Plans only."

The second direction is new capability; the current fixed-list check cannot express it.

**4d. Stale files — Cleanup #2.** `outputManifest.js:30` gains `mtimeMs` via
`fs.statSync`. **mtime cannot decide staleness — it can only surface it.** The warning
lists matched files with their dates so a human can spot a three-week-old trial sitting
beside today's plan. No heuristic judges it.

**4e.** Both comprehensive-record call sites pass the composition into
`checkLodgementDocuments`: `SurveyPlanMapView.vue:4627` and `MapLibreAreaView.vue:6282`
— the same both-sites pattern the 2026-07-13 letter work established.

## Part 5 — Testing

TDD, following the extract-logic-and-test-the-`.ts` convention.

| File | Coverage |
|---|---|
| `utils/__tests__/recordComposition.test.ts` *(new)* | Inference boundaries (0/1/2/many), `normalizeComposition` against malformed jsonb, the `allowsFamily` matrix, `describeComposition` wording, `verifyAgainstManifest` both directions |
| `utils/__tests__/lodgementDocuments.test.ts` *(extend)* | Diagram-only omits General Plan; GP-only omits Diagram; both includes both; the Diagram rule folder-gates to `output/diagrams` and does not match a diagram-named file elsewhere |
| `composables/__tests__/useLodgementCheck.test.ts` *(extend)* | Composition-aware missing **and** unexpected-present |
| `app-backend/src/utils/__tests__/outputManifest.test.js` *(extend)* | `mtimeMs` present and plausible |
| `views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts` *(new)* | `planTypeOptionsFor(composition)` enabled/disabled sets; `config.planType` normalisation |

Frontend: `cd app-frontend && npm test`.
Backend: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`.

**Regression risk to check, not to assume:** `pdfkitGeoPDF.snapshot.test.js` snapshots
exact rendered text x/y. This work changes the number of lines in the letter's enclosed
list, shifting everything below it. That snapshot is backend PDFKit and the letter is
frontend jsPDF, so it most likely will not fire — but if it does, inspect the diff.
Do not regenerate it blindly.

## Out of scope

- No new DB column, migration, or endpoint.
- No changes to the nine non-plan document rules.
- No refactor of the twelve inline Outside Figure checks.
- No fix for `survey-plan` missing from the `workflowSteps` array.
- Working Plan gating.

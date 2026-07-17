# Unified Beacon Comparison — Design Spec

**Date:** 2026-07-17
**Status:** Approved for planning
**Branch:** `feat/unified-beacon-comparison`

## Problem

There are two beacon-comparison surfaces in the app, with duplicated and divergent logic:

- **Lite Compare tool** (`views/modules/lite/compare/CompareView.vue`) — a standalone
  toolbox calculator. Thin shell over `stores/surveyAdjustmentStore.js`
  (`compute()` = Section 67(5) 4-parameter Helmert least-squares with iterative
  W-test data snooping), plus `utils/surveyMath` and `utils/beaconAdjustmentReport`.
  Input: one CSV, `Beacon, Hist_Y, Hist_X, Survey_Y, Survey_X`, parsed by its own
  `parseBeaconCsv`.
- **Cadastral Found Beacons step** (`views/modules/cadastral-standard/FoundBeaconsView.vue`)
  — a workflow step. Runs its **own** bespoke least-squares (`leastSquaresResult` /
  `analyze`), uploads a *historical-only* CSV (`Point, Y, X`) via
  `parseHistoricalPointsCSV`, matches by beacon name to the project's live beacons,
  populates `beacon.originalData.coordinates`, persists historical points to the DB
  (`importHistoricalSurveyPoints`), and feeds the Report on Survey
  (`reportOnSurveyGenerator`, `reportOnSurveyNarrativeGenerator`) and
  `useSmartSuggestions`.

We want **one** comparison routine — the rigorous Section 67(5) Helmert + W-test
engine — behind both surfaces, and **one** CSV format everywhere, without breaking
the cadastral workflow's persistence or its Report on Survey integration.

## Decisions (from brainstorming)

1. **Single input format everywhere = the full comparison CSV**
   `Beacon, Hist_Y, Hist_X, Survey_Y, Survey_X` (option **B**). Found Beacons no
   longer takes a historical-only CSV; the survey coordinates come from the CSV, not
   the live survey beacons.
2. **Reuse = embed the Compare surface wholesale.** The Found Beacons step renders
   the Compare component (in an embedded mode) rather than keeping its own
   comparison UI. Both surfaces share `surveyAdjustmentStore`, `surveyMath`, and
   `beaconAdjustmentReport`.
3. **Keep persisting.** Found Beacons still writes to the DB so the step is
   reloadable and existing DB consumers keep their data.
4. **`step_data` JSON is the reload source of truth** (parsed rows + result
   summary). `importHistoricalSurveyPoints` is kept for the historical-points table,
   but reload reconstructs from `step_data`.
5. **Report contract preserved; richer stats deferred.** The unified step keeps
   emitting the existing `ReportOnSurveyData` shape. Surfacing the new
   W-test/rejection detail inside the Report on Survey is out of scope for this pass
   (YAGNI).
6. **Canonical engine = Section 67(5) Helmert + W-test** (`surveyAdjustmentStore`).
   Found Beacons' bespoke least-squares is retired.

## Architecture

### Shared engine (unchanged)
`stores/surveyAdjustmentStore.js` — Pinia setup store `useSurveyAdjustmentStore`:
- State: `points` (rows `{ id, name, yH, xH, yS, xS }`), `sigma0`, `critW`,
  `surveyClass`, `sigma0Auto`, `result` (`{ adj, pts, log, converged }`), `error`.
- Actions: `setPoints(rows)`, `compute()`, `setSurveyClass`, `setSigma0`,
  `addPoint`, `removePoint`, `updatePoint`, `loadSample`.
- `result.pts` carries per-point residuals + accept/reject; `result.adj` the
  transformation parameters; `result.log` the data-snooping iteration log.

No changes to the math. It is already view-independent.

### Single CSV parser
`parseBeaconCsv` (currently local to `CompareView.vue`) is extracted to a shared
module `utils/beaconComparisonCsv.ts` and imported by both surfaces. Signature
unchanged: `parseBeaconCsv(text: string): { name: string; yH: number; xH: number;
yS: number; xS: number }[]` — tolerant of an optional header line, blank rows,
throws on malformed input, requires ≥ 3 rows. `CSV_HEADER` constant moves with it.

`parseHistoricalPointsCSV` and the `hist_y`/`hist_x` alias added during the earlier
interim fix are **removed** from the Found Beacons path (the alias is superseded).
`parseHistoricalPointsCSV` itself may remain in `services/historicalSurveyPoints.ts`
only if another caller exists (it does not today; remove it and its interim test).

### Embeddable Compare component
`CompareView.vue` gains an `embedded?: boolean` prop (default `false`):
- When `false`: renders exactly as today (route-level, with `ModuleScaffold`
  header/description).
- When `true`: renders the comparison panel **without** the outer `ModuleScaffold`
  chrome (title/description/scaffold), so it sits cleanly inside the Found Beacons
  workflow step.
- It exposes the ability to be driven programmatically and observed: on a completed
  `compute()` it emits `@computed` (payload: the store's `points` + `result`), so the
  host can run the adapter. (Alternatively the host watches `storeToRefs(store).result`
  — the plan picks whichever is cleaner; the observable contract is "host learns when
  a result exists.")

### Found Beacons step (rewritten)
`FoundBeaconsView.vue` becomes a thin workflow host:
- Renders `<CompareView embedded @computed="onComputed" />`.
- Removes the bespoke least-squares (`leastSquaresResult`, `analyze`, tolerance
  category UI) and the historical-only CSV upload handler.
- On mount: loads persisted `step_data`; if present, calls `store.setPoints(savedRows)`
  (reset-from-workflow-dataset — also prevents lite-tool singleton state bleed).
- On `@computed`: runs the adapter (below), then persists.

### Adapter
New composable `composables/useFoundBeaconsComparison.ts`:
- `buildReportFragment(points, result, projectBeacons)` → `{ beacons, beaconComparison }`
  in `ReportOnSurveyData` shape. `projectBeacons` = `FoundBeaconsView`'s
  `beacons.value` (`BeaconWithUIState[]`, keyed by `.beaconId`, populated from
  `props.existingBeacons` / `props.fixedPoints`).
  - For each comparison row, reconcile `row.name` against `projectBeacons` by
    `beaconId` (case-insensitive). Populate `beacon.originalData = { coordinates: { y:
    row.yH, x: row.xH }, source: 'previous-survey' }` and mark status `found`. Rows
    with no matching project beacon are still included in the comparison engine but
    surfaced as unmatched (they contribute to the report table only if a project
    beacon exists — same as today's name-match behaviour).
  - `beaconComparison` summary from `result`: `converged`, `sigma0`, count within
    tolerance, list of rejected beacon names, transformation params — using **only the
    fields the current report already consumes** (preserve contract; do not add new
    required fields to the report path).
- `toHistoricalRows(points)` → `HistoricalPointCSV[]` = `{ Point: name, Y: yH, X: xH }[]`
  for `importHistoricalSurveyPoints`.
- `persist(projectId, step, points, result)`:
  - Write `{ rows, resultSummary }` to workflow `step_data['found-beacons']` (the
    `found_beacons` step's `dbKey`, per `config/cadastralWorkflow.ts`) via the existing
    `api.patch('/survey-projects/:id/workflow', { step, action:'update', metadata })`
    pattern.
  - Call `importHistoricalSurveyPoints(projectId, toHistoricalRows(points), fileName)`.

## Data flow (Found Beacons step)

```
CSV (Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X)
  -> parseBeaconCsv (shared)
  -> store.setPoints(rows)
  -> store.compute()            (Sec 67(5) Helmert + W-test)
  -> store.result
  -> adapter.buildReportFragment(points, result, projectBeacons)
       -> ReportOnSurveyData { beacons[].originalData, beaconComparison }
  -> adapter.persist:
       -> step_data[found-beacons] = { rows, resultSummary }   (reload source of truth)
       -> importHistoricalSurveyPoints(projectId, {Point,Y:yH,X:xH}[], fileName)
```

Reload: on mount, read `step_data[found-beacons]`; `store.setPoints(savedRows)` and
recompute (or restore `resultSummary`) so the step shows the prior comparison with no
re-upload.

## Report on Survey — preserved contract

`reportOnSurveyGenerator.ts` reads (unchanged):
- `reportData.beaconComparison` (summary object) — `addBeaconComparison`.
- `reportData.beacons[]` where `status === 'found'` and
  `originalData.coordinates.{y,x}` present — `addBeaconComparisonTable` (renders
  `origY`/`origX` vs found).

`useSmartSuggestions` only needs a "has found beacons" boolean.

The adapter guarantees this shape, so the report generator, narrative generator, and
smart suggestions require **no changes**. Their existing tests must stay green.

## Store state handling

`surveyAdjustmentStore` is a singleton shared with the lite route. Mitigation:
- Found Beacons **resets from its own dataset on mount** (`setPoints(savedRows)` or an
  empty set), so lite-tool state never bleeds into the workflow.
- No teardown on leave; the lite route can `loadSample()` or set its own points.
- This is acceptable because it is the *same routine*; the only requirement is that
  entering the workflow step shows the workflow's data, which reset-on-mount ensures.

## What is retired / removed

- Found Beacons' bespoke least-squares: `leastSquaresResult`, `analyze`, and the
  urban/rural/trig/custom tolerance-category UI.
- Found Beacons' historical-only CSV upload (`handleHistoricalFileUpload` +
  `parseHistoricalPointsCSV` usage).
- The interim `hist_y`/`hist_x` alias in `parseHistoricalPointsCSV` and its test
  (superseded). Remove `parseHistoricalPointsCSV` entirely if it has no other caller.

## Testing

- **Shared CSV parser** (`beaconComparisonCsv.ts`): unit tests moved/added — header
  optional, blank rows tolerated, < 3 rows throws, malformed throws, numeric parsing.
- **Adapter** (`useFoundBeaconsComparison`): given store `points` + a mock `result`
  and a set of project beacons →
  - correct `beacons[]` with `originalData.coordinates = { y: yH, x: xH }`, status
    `found`, and case-insensitive name reconciliation (matched vs unmatched rows);
  - `beaconComparison` summary carries the fields the report consumes;
  - `toHistoricalRows` maps to `{ Point, Y: yH, X: xH }`.
- **Report generators**: existing `reportOnSurvey*` tests stay green (contract
  unchanged) — no new assertions required beyond confirming they still pass with the
  adapter-produced shape.
- **Embedded CompareView**: smoke — renders without `ModuleScaffold` chrome when
  `embedded`, still renders it when not; the lite route is visually unchanged.

## Out of scope (this pass)

- Enriching the Report on Survey with the new W-test / rejection statistics.
- Any change to the Helmert / W-test math.
- Backend schema changes (reuse the existing historical-points table + workflow
  `step_data`).

## Open risks (managed in the plan)

- Embedding a `ModuleScaffold`-based route view inside a workflow step — handled by
  the `embedded` prop; needs a live UX check once wired.
- Singleton store bleed between lite + workflow — handled by reset-on-mount.
- Reload fidelity rests on the `step_data` JSON (not the historical-points table).

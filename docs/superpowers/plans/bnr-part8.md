# Plan — Task 8: never average away a conflicting imported beacon — keep the first, suffix the rest

Branch: `feat/beacon-name-reconciliation` — on top of `4914371` (Task 7).

## Goal

An imported CSV (or batch add) can carry two or more observations under the same
beacon name. Today both write doors silently resolve them:
`CoordinatePoint.batchCreate` (:91-251) averages pairs within `COORDINATE_TOLERANCE`
(0.5 m) and **drops** pairs beyond it; `csvImports.execute-merge` (:569-610) always
averages and only `console.warn`s beyond a flat 0.1 m (`duplicate_tolerance`).
Neither path tells the surveyor that two different positions claimed one name —
a contradiction (Decision 15 says a case-fold pair is never merged) is instead
erased by an average and any positional spectres are dropped.

Task 8 makes a conflicting duplicate **visible and adjudicable**: keep the first
observation as the canonical named beacon, store every additional observation under
an escalating `_dupl` suffix (so it plots for editing, per the surveyor), and return
a `conflicts[]` list that the frontend turns into a reviewable, map-plotable list.

Decisions (confirmed by the surveyor 2026-09-14): (a) the SI 727 class B/C tolerance
schedule decides "conflict" vs "repeat"; (b) the first observation is canonical, every
extra gets `_dupl`, then `_dupl2`, ...

## Design

### Where the tolerance lives

The SI 727 class B/C schedule (`SI727_CLASS`, `distanceToleranceM(f, cls)`) is today
frontend-only (`app-frontend/src/utils/si727.js`), while both conflict sites are
backend. Move the pure schedule + formula to a new `app-shared/si727Tolerances.js`
and re-export from `si727.js` (same import path keeps frontend call sites working);
the backend imports the shared module directly. Only the schedule + kernel move — the
Helmert/severity logic and `edgeCompliance` (which need `bearingSouth`) stay in
`si727.js`.

`distanceToleranceM(f, cls)` for a duplicated beacon uses
`f = the on-the-ground separation of the two observations`. This is the "shorter
line length" the schedule already encodes: two claims of the same name separated by
~0.03 m at a small site pass class B; a metre apart can never be the same peg.

> Observed consequence (2026-09-14, during implementation): because the tolerance is
> computed from the very separation it must judge, `distanceToleranceM(sep, cls) < sep`
> for **every** nonzero separation — the para 7(1) formula returns 0 for `f <= 0` and
> grows more slowly than `f` immediately. So in practice only **exactly coincident**
> rows classify as repeats (they average, keeping today's behaviour for true double
> entries with identical coords); any distinct position, however close, is a conflict
> and is kept visible as `_dupl`. That is the point of the task — nothing positionally
> distinct is silently averaged or dropped. (The Schedule text is about accepting
> co-ordinates against distances, not about duplicate rows; we use it as the intended
> "same peg" signal, not as an accuracy budget. A real re-observation of the same peg
> differs by millimetres, which this reading deliberately flags as a conflict for the
> surveyor to inspect.)

> **Follow-up (2026-09-21):** the tolerance is now the para 7(5) Limits of Error —
> `0,04·√(0,075f + 0,00015f²)` (B) / `0,06·√(...)` (C), replacing the 0,01/0,02 × 0.075
> reading (the 0.075 coefficient itself is what the Second Schedule prescribes; a brief
> transcription of "0,0785" was corrected back). The correction rescales the repeat window:
> `distanceToleranceM(sep, cls) >= sep`
> now only up to `sep <= ~0.13 mm` (B) / `~0.28 mm` (C). The consequence above still stands
> for every practically measurable separation — a millimetre apart is a conflict — but the
> claim "`< sep` for **every** nonzero separation" no longer holds in the sub-millimetre
> repeat neighbourhood.

Conflict classification per `(name, cls)`:

- separation `== 0` (or `<= distanceToleranceM(sep, cls)`) → a **repeat**: keep today's
  average row.
- separation `>  tol` → a **conflict**: canonical keeps the name; every extra is stored
  under `name + '_dupl'`, `'_dupl2'`, ... (escalating until free under
  `UNIQUE(project_id, name)`).

The whole adjudication lives in one shared function, `resolveDuplicateGroups(groupList,
{ surveyClass, takenNames })`, in `app-shared/si727Tolerances.js` (new this session). It
takes `[[name, observations], ...]`, returns `{ points, conflicts }`, and seeds its
name-escape set with **every input name and `takenNames`** so an escape can never collide
with a genuine point (e.g. a CSV that literally lists a beacon called `5000A_dupl`).
Both write doors call it, so the two can never drift apart again.

### coordinatePoint.batchCreate (backend model, :91-251)

Rename the "smart duplicate" block. Pre-process:
1. Compute `medianPairwiseDistance` over all incoming points as the site scale; `f`
   for a pair is its own separation (max over the group).
2. Walk points in input order. First occurrence of a name is canonical. A later
   occurrence within tolerance is folded into the running average (as today). A later
   occurrence beyond tolerance is **not dropped**: it becomes a new point with an
   escaped name (`_dupl`), recorded in `conflicts[]`.
3. `batchCreate` returns `{ created, conflicts }` (coordinated with coordinatePoints.js
   route `:100`/`:108` and the frontend caller together).
4. Accept an optional `surveyClass` on the request (default `'B'`).

### csvImports.execute-merge (backend route, :569-610)

Replace the "average everything" grouping:
- single observation → as today;
- group within tolerance → average (as today);
- group beyond tolerance → canonical first, extras escaped `_dupl`/`_dupl2`/..., all
  inserted as real rows, pushed to `conflicts[]`.
- `new_points` payload gains optional `surveyClass` (default `'B'`).
- The success response gains `data.conflicts`:
  `[{ id, count, tolerance, canonical: {y,x}, extras: [{name, y, x, distance}] }]`.
- `duplicate_tolerance` is removed outright (no remaining caller; the merge dialog now
  sends `surveyClass` and the schedule decides).

Threshold defaults: `duplicate_tolerance` is gone; all merges pass `surveyClass` and the
SI 727 schedule decides.

### Frontend

- `csvImports.ts` `executeMerge` type: add `surveyClass?: 'B'|'C'` to payload and
  `conflicts[]` to `data`; `duplicate_tolerance` removed from the type.
- `MergeAnalysisDialog.vue`: replace the raw `duplicateTolerance` number input with a
  `surveyClass` B/C selector (default B) — same slot, clearer meaning. (Keep the
  existing emit signature surface; the underlying value becomes the class.)
- `CadastralStandardView.handleMergeProceed`: pass `surveyClass`, then after merge,
  if `data.conflicts` is non-empty show a **conflict review panel** listing each
  conflict with canonical vs `_dupl` positions and separation, and a "view on map"
  action that plots/labels the `_dupl` beacons (they are normal `coordinate_points`
  rows, so MapLibre already renders them; we add a fit-to + highlight).
- Coordinate list batch-add path: surface `conflicts` similarly (toast/panel).

### The `_dupl` name end-to-end

- `_dupl` passes the write doors unchanged: `splitBeaconName(/^(\d+)([A-Za-z]+)$/)`
  never matches a `_dupl` suffix, so `normalizeBeaconName` returns it verbatim and
  the case-fold 400 logic never trips on it.
- `labelParts`/`splitBeaconName` return `null` parts → label sites print the FULL name
  (e.g. `2474A_dupl`), never a bare suffix. PDF/DXF label sites use
  `fallbackBeaconLabel`/full-name paths for non-parsable names — no change needed.
- A future re-import sees `2474A_dupl` as its own row: it survives, plots, and is
  editable; if the surveyor deletes/moves it and re-imports, the canonical stays.

## Changes

| File | Change |
|---|---|
| `app-shared/si727Tolerances.js` | New: `SI727_CLASS`, `distanceToleranceM`, `medianPairwiseDistance`, `suggestedSigma0`, `classifyDuplicateGroup`, `groupSpread`, `resolveDuplicateGroups` (moved kernel + the shared adjudication both doors call; no bearing/geometry deps) |
| `app-frontend/src/utils/si727.js` | Re-export the moved kernel + resolver from app-shared; keep `edgeCompliance`/`severityVerdict`/`beaconSeverity`/`directionToleranceArcsec` locally. Fixed the app-shared import depth (`../../../`, was `../../../../`) |
| `app-backend/src/models/coordinatePoint.js` | `batchCreate` calls `resolveDuplicateGroups`, returns `{ created, conflicts }` |
| `app-backend/src/routes/coordinatePoints.js` | Wire `surveyClass`, return `conflicts` in batch response |
| `app-backend/src/routes/csvImports.js` | `execute-merge` calls `resolveDuplicateGroups`, `data.conflicts` in response, `duplicate_tolerance` removed |
| `app-frontend/src/services/csvImports.ts` | `surveyClass` + `conflicts` types; `duplicate_tolerance` removed |
| `app-frontend/src/services/spatial.ts` | `batchCreateCoordinatePoints` accepts `surveyClass` (default B), returns `conflicts` |
| `app-frontend/src/components/cadastral/MergeAnalysisDialog.vue` | `surveyClass` selector (default B) instead of raw tolerance |
| `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` | Pass `surveyClass`; conflict list in merge alert + auto-export log |
| `app-frontend/src/views/modules/lite/areas/AreasView.vue` | Conflict warning in export alert |
| `app-frontend/src/views/modules/cadastral-standard/QGISExportView.vue` | Conflict warning in export status |
| `app-backend/src/models/__tests__/coordinatePoint.test.js` | New backend suite: `batchCreate` conflict/`_dupl` cases + shared `resolveDuplicateGroups` (config/db mocked away, fd injection) |
| `app-frontend/src/utils/__tests__/si727.test.ts` | Added re-export sanity for `classifyDuplicateGroup`/`resolveDuplicateGroups` |

## Verify

```bash
cd app-frontend && npm test && npm run build
cd app-backend && npm run test
```

Expected: backend suite grows (batchCreate conflict cases + execute-merge conflicts
response); frontend 59-file suite grows + build green; `si727.test.ts` still passes
through the re-export.

**Manual browser checklist (Task 8):**

1. Import a CSV where the same name appears twice ~5 m apart → both appear on the
   map (`2474A` and `2474A_dupl`); the conflict panel lists one conflict; no average.
2. Re-run the same import → `2474A_dupl` updates in place; the canonical `2474A` stays.
3. Move `2474A_dupl` on the map to coincide with `2474A`, re-import → averaged (repeat),
   `_dupl` disappears.
4. Batch-add the same beacon name twice far apart via the coordinate list → both rows
   stored (canonical + `_dupl`), conflict surfaced.
5. Verify a `_dupl` beacon shows its FULL name on the PDF/DXF label, not a bare suffix.

## Commit

```bash
git add app-shared/si727Tolerances.js \
        app-frontend/src/utils/si727.js \
        app-backend/src/models/coordinatePoint.js \
        app-backend/src/routes/coordinatePoints.js \
        app-backend/src/routes/csvImports.js \
        app-frontend/src/services/csvImports.ts \
        app-frontend/src/services/spatial.ts \
        app-frontend/src/components/cadastral/MergeAnalysisDialog.vue \
        app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue \
        app-frontend/src/views/modules/lite/areas/AreasView.vue \
        app-frontend/src/views/modules/cadastral-standard/QGISExportView.vue \
        app-backend/src/models/__tests__/coordinatePoint.test.js \
        app-frontend/src/utils/__tests__/si727.test.ts \
        docs/superpowers/plans/bnr-part8.md
git commit -m "feat(beacon-names): keep the first conflicting imported beacon, suffix the rest _dupl"
```

Verify command needs the frontend suite run from `app-frontend` and the backend from
`app-backend` (the backend suite is slow — ~20 min — because of the DXF/pdf integration
suites; the new unit test is a few hundred ms).

---

## Addendum — 2026-09-14: Calculations Part 1 client-side averaged conflicting duplicates

After deploying the write-door fixes, the Area & Consistency map (`MapLibreAreaView`)
still showed a single averaged `1213A` at y=97349.579 (the mean of two 5 m-apart
observations) because **the frontend's `generateAdjustedCoordinates` pipeline**
(Calculations Part 1) was averaging every duplicate unconditionally, regardless of
`withinTolerance`, and the map renders `workflow_state['calculations-part1'].adjustedCoordinates`,
not the `coordinate_points` table directly.

### Root cause

- `generateAdjustedCoordinates` (calculations-part1.ts, up to this addendum) called
  `duplicate.meanY`/`meanX` for every same-named group, even when `withinTolerance`
  was `false` — the mean of two conflict positions was written as the only row.
- `handleMergeProceed` (CadastralStandardView.vue:2632) keeps the raw CSV client rows
  as `importedPoints` via `setImportedPoints(pendingCSVData.value.points)`; conflicts
  were only logged to the alert panel, never removed from the point list, so a
  subsequent Part 1 run re-averaged.

### Fix (`calculations-part1.ts`, `adjusted-coordinates.ts`)

`generateAdjustedCoordinates` now uses the same three-way decision as the backend
write doors:

| condition | behaviour |
|-----------|-----------|
| `withinTolerance === true` | average (certified mean, unchanged) |
| `withinTolerance === false` | **never average**: first observation → canonical
  (`method: 'canonical'`), extras → `_dupl`/`_dupl2`... (`method: 'conflict'`), same
  `takenNames` seed as `resolveDuplicateGroups` |
| no duplicate | single observation (unchanged) |

`method` union on `AdjustedCoordinate.adjustment` extended with `'canonical'` |
`'conflict'` (no existing consumers switch on the value; `projectPoints.ts` just
defaults to `'single'`).

### New test

`app-frontend/src/utils/__tests__/calculationsPart1Conflicts.test.ts` — 4 tests:

1. out-of-tolerance duplicate → canonical + `_dupl`, no averaging
2. within-tolerance duplicate → certified mean (unchanged)
3. `_dupl` escape escalates past a genuine `_dupl` point name
4. single observation untouched

### Verification

```bash
cd app-frontend && npx vitest run && npm run build
```

775 tests pass (was 771, +4 new); build green.

### Data fix required

The persisted `workflow_state['calculations-part1'].adjusted_coordinates` for
project 8 was generated by the old code and still holds the averaged `1213A`.
After deploying this fix, **re-run Calculations Part 1** in the browser (Area &
Consistency → regenerate) to repopulate `adjusted_coordinates`; the map will then
show both `1213A` and `1213A_dupl` at their real positions.

## Pending commit (apply when ready)

```bash
cd app-frontend
git add src/utils/calculations-part1.ts \
        src/types/adjusted-coordinates.ts \
        src/utils/__tests__/calculationsPart1Conflicts.test.ts \
        docs/superpowers/plans/bnr-part8.md
git commit -m "fix(calculations): never average out-of-tolerance duplicates in Part 1 — keep first, escape extras _dupl

generateAdjustedCoordinates now uses the same three-way decision as the
backend write doors: within-tolerance repeats still average; out-of-tolerance
conflicts split into canonical + _dupl/_dupl2, never silently averaged.
The map (which reads adjusted_coordinates, not coordinate_points) now
shows both real positions of a conflicting beacon.

Includes 4 new unit tests (775 frontend tests pass, build green).
```
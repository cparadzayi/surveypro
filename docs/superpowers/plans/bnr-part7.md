# Plan — Task 7: self-heal parcel beacon names after a re-import

Branch: `feat/beacon-name-reconciliation` — on top of `0fea73d` (Task 6). Reverses
plan decision 1 ("manual trigger only") the way `8d36203` recorded the vertex-snap
reversal: documented, deliberate, scoped.

## Goallay

A **re-import** of survey points (smart-merge or append) writes the *normalised*
beacon names to `coordinate_points` but leaves every saved parcel's historical
area/consistency metadata (`metadata.cape_lo_points`, `residuals.edges[].from/.to`)
holding the old spelling. Verified on the live DB: `surveyor_chitsikef` 509/1508
parcels and `surveyor_mapamulart` 11/11 parcels hold a lowercase-suffix name that
no longer matches the beacon table. Today nothing self-heals that; the 🔧 button
was the only repair.

Task 7 makes the **🔧 Repair Beacon Names** orchestration run **automatically
after a successful smart-merge or append**, while keeping both the 🔧 button and
its confirm/outcome dialogs. The merge itself is unchanged and is never rolled
back — the self-heal follows it, degrades on failure, and reports inside the
merge success alert.

## Design

Reuse the existing load-bearing pieces untouched:

- `planNameNormalization` (app-shared) → the beacon half of the plan
- `planReconciliation` + `summarise` (`beaconReconcile.ts`) → the parcel half
- `executeRepair` (`beaconRepairFlow.ts`) → the A1 → A2 → B ordering

Add two thin, pure wrappers to `beaconRepairFlow.ts` so the button and the
self-heal share one code path (same convention that extracted decision 7):

- `buildBeaconRepairPlan(dbParcels, dbPoints)` → `{ beaconPlan, parcelPlan, summary }`
- `runBeaconRepair(plan, deps)` → `executeRepair(plan.beaconPlan, plan.parcelPlan, deps)`

### Post-merge behaviour — smart-merge and append

1. `executeMerge` (or the append's `processNewCSVImport`) succeeds — unchanged.
2. `selfHealBeaconNamesAfterImport()`:
   - loads `listLandParcels` + `listCoordinatePoints` fresh from the DB,
   - `buildBeaconRepairPlan(...)`; returns `''` when `summary.hasWork` is false,
   - `runBeaconRepair(...)` with the same injected deps as the button
     (A1 `normalizeCoordinatePointNames`, A2 workflow-step PATCH via
     `renameWorkflowCopies`, B `updateLandParcel` metadata-only, refresh the
     parcels store),
   - returns `describeRepairResult(outcome)` (or a warning string on throw).
3. The merge success alert gains one line: the repair text, e.g.
   `Updated 2 parcel(s): STAND 1, STAND 2.` A failure is reported as a `⚠️`
   line and never fails the merge.

The self-heal is idempotent: after the merge most beacon names are already
normalised, so A1/A2 are skipped and only phase B (parcel metadata + edges)
runs; on a clean project nothing is written.

## Changes

| File | Change |
|---|---|
| `beaconRepairFlow.ts` | Add `buildBeaconRepairPlan`, `runBeaconRepair` (+ imports `planNameNormalization` from app-shared, `planReconciliation`/`summarise`/`RECONCILE_TOLERANCE_M`/types from `beaconReconcile`) |
| `MapLibreAreaView.vue` | `repairParcelBeaconNames` uses `buildBeaconRepairPlan` + `runBeaconRepair` (same checks, confirm modal, result dialogs); drop now-unused `planNameNormalization`/`planReconciliation`/`summarise`/`RECONCILE_TOLERANCE_M` imports |
| `CadastralStandardView.vue` | New `selfHealBeaconNamesAfterImport()`; call it after `executeMerge` (in `handleMergeProceed`) and after the append path of `handleReimportChoice`; append its text to the success alert |
| `__tests__/beaconRepairFlow.test.ts` | Add a `buildBeaconRepairPlan`/`runBeaconRepair` describe (post-merge: no beacon renames, B-only; stale parcel metadata → planned renames; clean → no work) |

No backend change. The merge response is untouched; the self-heal replans from
the post-merge DB state by geometry, exactly as the button does.

## Verify

```bash
cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/beaconRepairFlow.test.ts
cd app-frontend && npm test && npm run build
```

Expected: new tests pass; 59-file suite grows; build green (pre-existing chunk
warning only).

**Manual browser checklist (mandatory, Task 7):**

1. Project with a lowercase-suffix beacon (e.g. `137c`) referenced by a saved
   parcel's area/consistency data. Run **smart-merge** with a CSV containing the
   same point → success alert ends with `Updated N parcel(s): ...`.
2. Regenerate the Area/Consistency PDF → the stale From/To names are current.
3. Re-run the same merge → alert reads `No changes were needed.` (idempotent).
4. Stop the backend mid-merge → merge alert still reports the merge success plus
   a `⚠️ Beacon-name reconciliation did not run` line; nothing is rolled back.
5. 🔧 button still shows its confirm modal and outcome dialogs on a project with
   a stale parcel.
6. Reload the page → 137c no longer appears anywhere in a saved parcel's
   metadata (queries: `cape_lo_points`, `residuals.edges`).

## Commit

```bash
git add app-frontend/src/views/modules/cadastral-standard/beaconRepairFlow.ts \
        app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue \
        app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue \
        app-frontend/src/views/modules/cadastral-standard/__tests__/beaconRepairFlow.test.ts \
        docs/superpowers/plans/bnr-part7.md
git commit -m "feat(beacon-names): self-heal parcel names after a re-import, keep the repair button"
```
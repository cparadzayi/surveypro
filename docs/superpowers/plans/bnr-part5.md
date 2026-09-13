### Task 5: Frontend — entry-point normalisation + going-forward rename propagation (Resolved #3)

**Files:**
- Test: `app-frontend/src/utils/__tests__/beaconName-entry.test.ts` *(new)*
- Modify: `app-frontend/src/utils/cadastral-csv.ts` — `validateAndParseCSV` (`:113`)
- Create: `app-frontend/src/services/spatial.ts` — new `normalizeCoordinatePointNames` function (near existing `renameCoordinatePoint` at `:204`)
- Modify: `app-frontend/src/views/modules/cadastral-standard/CoordinateListView.vue` — `commitRename` (`:241`)
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — `confirmMapRename` (`:1103`), `resolveRenameConflict` (`:1140`), `editPanelHandler` (`:1332`), `handlePointRename` (`:1540`), `confirmBeaconSave` (`:1842`)

**Interfaces:**
- Consumes: `normalizeBeaconName`, `findCaseFoldDuplicates` from `app-shared/beaconName.js` (Task 1); `propagateRename`, `renamePointList` from `./beaconRepairFlow` (Task 4).
- Produces (nothing new for Task 6 — the functions below are purely Task 5's):
  - `normalizeCoordinatePointNames(projectId, renames: Array<{id, from, to}>): Promise<{ renamed: number }>` in `spatial.ts` — frontend service for `POST /coordinate-points/normalize-names` (Task 3 route, defends stale plans with 409).
  - `validateAndParseCSV` adds a `severity: 'error'` row to `result.errors` when `findCaseFoldDuplicates` detects a pair (spec Part 3 `cadastral-csv.ts:243, :285`).

**Spec anchors:** `docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md` Part 3 Frontend entry points (`:481-494`), Resolved #3 (action: `handlePointRename` and `CoordinateListView.commitRename` apply `patchParcelMetadata` with the exact old→new name — `propagateRename` from Task 4 implements the planner; these entry points call it).

Note on **line-number drift:** Tasks 1-4 do not touch `CoordinateListView.vue` or `cadastral-csv.ts`; line numbers here are as of `HEAD 44e1df1`. Task 4 edits `MapLibreAreaView.vue` `handlePointRename` internals, so the cited line numbers in that file (`:1103`, `:1140`, `:1332`, `:1842`) will shift. The anchor text is the canonical reference.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/beaconName-entry.test.ts`:

```ts
/**
 * Entry-point normalisation — the frontend side of spec Part 3.
 * Pure: only tests validateAndParseCSV and the normalisation helpers,
 * no network. Run: cd app-frontend && vitest run beaconName-entry
 */
import { describe, test, expect } from 'vitest'
import { validateAndParseCSV } from '../cadastral-csv'
import { normalizeBeaconName, findCaseFoldDuplicates } from '../../../../app-shared/beaconName'

const HEADER = 'Point,Y,X,Status,Description,Date of survey'

function csv(...rows: string[]) {
  return [HEADER, ...rows].join('\n')
}

describe('cadastral-csv — normalised id on parse', () => {
  test('a lowercase-suffix id is accepted but keeps its original id in the point (the normaliser runs elsewhere)', () => {
    // The CSV parser itself does NOT mutate the id — it stores the raw id; the
    // normalisation happens in validateAndParseCSV BEFORE the point is emitted.
    // See Step 2 for the exact edit.
    const r = validateAndParseCSV(csv('2474a,97581.234,2247733.456,P,peg,1/10/2025'))
    expect(r.isValid).toBe(true)
    expect(r.preview[0].id).toBe('2474A')
  })

  test('1464An passes through byte-for-byte (mixed-case is a deliberate naming form)', () => {
    const r = validateAndParseCSV(csv('1464An,97581.234,2247733.456,F,town,1/10/2025'))
    expect(r.isValid).toBe(true)
    expect(r.preview[0].id).toBe('1464An')
  })

  test('SD4, TSM5025, 2474A1, 1425, "" are byte-for-byte (no numeric prefix)', () => {
    const r = validateAndParseCSV(csv(
      'SD4,97581.234,2247733.456,P,peg,1/10/2025',
      'TSM5025,97581.234,2247733.456,P,peg,1/10/2025',
      '2474A1,97581.234,2247733.456,P,peg,1/10/2025',
      '1425,97581.234,2247733.456,P,peg,1/10/2025',
    ))
    expect(r.preview.map(p => p.id)).toEqual(['SD4', 'TSM5025', '2474A1', '1425'])
  })
})

describe('cadastral-csv — case-fold pair rejection (decision 15)', () => {
  test('99a + 99A in the same file is a hard error', () => {
    const r = validateAndParseCSV(csv(
      '99a,97581.234,2247733.456,P,peg,1/10/2025',
      '99A,97581.234,2247733.456,P,peg,1/10/2025',
    ))
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => e.severity === 'error' && /99a.*99A/.test(e.message))).toBe(true)
  })

  test('15b + 15B in the same file is a hard error', () => {
    const r = validateAndParseCSV(csv(
      '15b,97581.234,2247733.456,P,peg,1/10/2025',
      '15B,97581.234,2247733.456,P,peg,1/10/2025',
    ))
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => e.severity === 'error' && /15b.*15B/.test(e.message))).toBe(true)
  })

  test('2474a twice is NOT an error (exact duplicate, decision 15 — keeps averaging)', () => {
    const r = validateAndParseCSV(csv(
      '2474a,97581.234,2247733.456,P,peg,1/10/2025',
      '2474a,97582.000,2247734.000,P,peg,1/10/2025',
    ))
    expect(r.isValid).toBe(true)
  })
})

describe('app-shared normalisation sanity (same suite as beaconName-shared)', () => {
  test('2474a → 2474A, 15b → 15B, 1464An → 1464An', () => {
    expect(normalizeBeaconName('2474a')).toBe('2474A')
    expect(normalizeBeaconName('15b')).toBe('15B')
    expect(normalizeBeaconName('1464An')).toBe('1464An')
    expect(normalizeBeaconName('SD4')).toBe('SD4')
    expect(normalizeBeaconName('')).toBe('')
    expect(normalizeBeaconName(null as any)).toBe(null)
  })

  test('findCaseFoldDuplicates catches a pair, not an exact repeat', () => {
    expect(findCaseFoldDuplicates(['99a', '99A', '99a'])).toEqual([['99a', '99A']])
    expect(findCaseFoldDuplicates(['1464An', '2474A'])).toEqual([])
  })
})
```

- [ ] **Step 2: Normalise in `validateAndParseCSV` and reject a case-fold pair**

In `app-frontend/src/utils/cadastral-csv.ts`, add the import at the top (after `:18`):

```ts
import { normalizeBeaconName, findCaseFoldDuplicates } from '../../../app-shared/beaconName'
```

In `validateAndParseCSV`, after the point is pushed to `result.preview` (`:319`) and before the summary counts (`:323`), **normalise the id in-place**:

```ts
      result.preview.push(point);
      point.id = normalizeBeaconName(point.id);
      result.summary.totalPoints++;
```

Then, **after the entire for-loop finishes** (after `:334`, inside the same `try` block but after the loop, before `:335` catch):

```ts
    // Case-fold pair rejection (decision 15): two distinct raw ids that normalise
    // to the same stored name are a hard error — do not import either one.
    const rawIds = result.preview.map((p: any) => p._rawId ?? p.id)
    const pairs = findCaseFoldDuplicates(rawIds)
    for (const pair of pairs) {
      result.isValid = false;
      result.errors.push({
        row: 0,
        field: 'point',
        message: `Case-fold collision in CSV: "${pair[0]}" and "${pair[1]}" normalise to the same name`,
        severity: 'error'
      });
    }
```

But `point._rawId` does not exist yet. To preserve the raw name for the duplicate check while emitting the normalised id, store the raw id in a throwaway key on the point during the parse. In the same point-creation block (`:284-304`), immediately after the point object is constructed, add:

```ts
      (point as any)._rawId = record['point'] || '';
```

This is a private field consumed only within this function and never reaches the store or the API. The `findCaseFoldDuplicates` call uses these raw ids, not the normalised ones, to correctly detect `99a` + `99A` as a pair (not `99A` + `99A`).

(Also note: the `capeLoPoint.id` at `:243` and `point.id` at `:285` are both set from `record['point']`; the normalisation in this step makes the point-creation block emit `normalizeBeaconName(record['point'])`. The `capeLoPoint` id does not need normalising here since it is only used for WGS84 transform lookup — it is not emitted in `result.preview`. The single `point.id` normalisation at `:319` covers it.)

- [ ] **Step 3: Add `normalizeCoordinatePointNames` to `spatial.ts`**

In `app-frontend/src/services/spatial.ts`, add near `renameCoordinatePoint` (`:204`):

```ts
/**
 * Call POST /coordinate-points/normalize-names (Task 3) for a repair's
 * renames list. The server recomputes the plan and returns 409 when it
 * has changed since planning — the view must surface this and ask the
 * surveyor to re-run.
 */
export async function normalizeCoordinatePointNames(
  projectId: number | string,
  renames: Array<{ id: number | string; from: string; to: string }>
): Promise<{ ok: boolean; renamed: number }> {
  const r = await api.post<{ ok: boolean; data?: { renamed: number }; error?: string }>(
    '/coordinate-points/normalize-names',
    { project_id: projectId.toString(), renames }
  )
  if (r.data.ok) return { ok: true, renamed: r.data.data?.renamed ?? renames.length }
  throw new Error(r.data.error || 'normalize-names returned not ok')
}
```

This does not add a new API surface — it just wraps the Task 3 route behind a name the view can import cleanly (used by `MapLibreAreaView.vue`'s `repairParcelBeaconNames` A1 dep in Task 4).

- [ ] **Step 4: Normalise at `CoordinateListView.commitRename` + propagate (Resolved #3)**

`commitRename` (`:241`) already trims at `:242` — normalise the trimmed string in the same spot, and make the duplicate check compare normalised forms. Then, after the DB rename succeeds, call `propagateRename` instead of the in-place mutation (`:264-281`).

Add the import at `:143` (next to existing `renameCoordinatePoint`):

```ts
import { renameCoordinatePoint, deleteCoordinatePointByName, listLandParcels, updateLandParcel } from '../../../services/spatial';
import { propagateRename } from '../beaconRepairFlow'
import { normalizeBeaconName, findCaseFoldDuplicates } from '../../../../app-shared/beaconName'
```

Replace `commitRename` (`:241-291`) with:

```ts
    async function commitRename(oldName: string) {
      const newName = normalizeBeaconName(renameValue.value.trim());
      if (!newName || newName === oldName || renameSaving.value) {
        cancelRename();
        return;
      }
      // Reject a case-fold collision in-memory (decision 15)
      const duplicate = workflowState.importedPoints.find(
        (p: any) => p.id !== oldName && normalizeBeaconName(p.id) === newName
      );
      if (duplicate) {
        renameError.value = `Point name "${newName}" already exists in this project.`;
        cancelRename();
        return;
      }
      renameSaving.value = true;
      try {
        if (projectId.value) {
          await renameCoordinatePoint(projectId.value, oldName, newName);
        }
        // Update importedPoints in-place
        const point = workflowState.importedPoints.find((p: any) => p.id === oldName);
        if (point) point.id = newName;

        // Propagate into land_parcels.metadata.cape_lo_points (Resolved #3)
        const rows = await listLandParcels(Number(projectId.value));
        const { written, failed } = await propagateRename(rows, oldName, newName, {
          updateParcel: async (parcelId, { metadata }) => {
            await updateLandParcel(parcelId, { metadata });
          }
        });
        if (failed.length) {
          console.warn('[CoordinateList] ⚠️ Some parcels were not updated:', failed);
        }
        if (written.length) {
          console.log(`[CoordinateList] ✅ Propagated "${oldName}" → "${newName}" to ${written.length} parcel(s): ${written.join(', ')}`);
        }

        console.log(`[CoordinateList] ✅ Renamed "${oldName}" → "${newName}"`);
      } catch (err: any) {
        renameError.value = err?.response?.data?.error ||
          err?.message ||
          `Failed to rename "${oldName}".`;
        console.error('[CoordinateList] ❌ Rename failed:', err);
      } finally {
        renameSaving.value = false;
        cancelRename();
      }
    }
```

The old in-place mutations (`:264-281` — `importedPoints.find`, `coordinateList.points.find`, `adjustedCoordinates.find`) are replaced by `propagateRename` for the parcel side, and by `point.id = newName` for `importedPoints` (field book and coordinate-list documents re-derive from `importedPoints` on the next build — `useCadastralWorkflow.buildCoordinateList` at `:54-119`). The `adjustedCoordinates` mutation is preserved in `handlePointRename` (Task 4 rewires it) and does not belong in `CoordinateListView` — the commit list does not use `adjustedCoordinates` for its own rendering.

- [ ] **Step 5: Normalise at every `MapLibreAreaView` entry point + replace inline propagation with `propagateRename`**

Add the import at `:945-949` (next to existing `describeCascadeOutcome`):

```ts
import { normalizeBeaconName, findCaseFoldDuplicates } from '../../../../app-shared/beaconName';
```

`confirmMapRename` (`:1103-1138`): normalise `trimmed` at `:1106` and make the duplicate check compare normalised forms:

```ts
async function confirmMapRename() {
  const modal = mapRenameModal.value;
  if (!modal || modal.saving) return;
  const newName = normalizeBeaconName(modal.newName.trim());
  if (!newName || newName === modal.pointId) { closeMapRenameModal(); return; }
  if (!newName) { modal.error = 'Name cannot be empty'; return; }

  // In-memory duplicate check — case-fold aware (decision 15)
  const inMemory = coordinatePoints.value.some(
    (p: any) => p.id !== modal.pointId && normalizeBeaconName(p.id) === newName
  );
  if (inMemory) {
    modal.conflictPoint = _findConflictPoint(newName);
    modal.error = '';
    return;
  }

  modal.saving = true;
  modal.error = '';
  modal.conflictPoint = null;
  try {
    await handlePointRename({ oldName: modal.pointId, newName });
    handleRenameComplete([{ oldName: modal.pointId, newName }]);
    closeMapRenameModal();
  } catch (e: any) {
    // ... (unchanged error handling, unchanged)
    modal.saving = false;
  }
}
```

`resolveRenameConflict` (`:1140-1179`): normalise `trimmed` at `:1143`:

```ts
async function resolveRenameConflict(deleteConflicting: boolean) {
  const modal = mapRenameModal.value;
  if (!modal || modal.saving || !modal.conflictPoint) return;
  const newName = normalizeBeaconName(modal.newName.trim());
  // ... (rest unchanged; only the variable name changes)
```

`editPanelHandler` (`:1332-1457`): normalise `patch.name` before it reaches `handlePointRename` — add one line immediately after the `if (!onlyDescription)` block ends (`:1349`), before the name-change gate at `:1363`:

```ts
  if (patch.name && patch.name !== oldName) {
    patch.name = normalizeBeaconName(patch.name);
  }
```

`handlePointRename` (`:1540-1642`): normalise `payload.newName` on entry (first statement), and replace the inline propagation loop (`:1608-1635`) with `propagateRename`:

```ts
async function handlePointRename(payload: { oldName: string; newName: string }) {
  payload.newName = normalizeBeaconName(payload.newName);
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) throw new Error('No project ID available');

  // 1. Persist name change to database
  await renameCoordinatePoint(projectId, payload.oldName, payload.newName);

  // 2. Replace adjustedCoordinates items so Vue reactivity triggers
  if (Array.isArray(workflowState?.adjustedCoordinates)) {
    workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.map((c: any) => {
      const currentId = c.pointId || c.id || c.name;
      if (currentId !== payload.oldName) return c;
      return { ...c, ...('pointId' in c && { pointId: payload.newName }), ...('id' in c && { id: payload.newName }), ...('name' in c && { name: payload.newName }) };
    });
  }

  // 3. Replace importedPoints items
  if (Array.isArray(workflowState?.importedPoints)) {
    workflowState.importedPoints = workflowState.importedPoints.map((p: any) =>
      p.id === payload.oldName ? { ...p, id: payload.newName } : p
    );
  }

  // 4. Persist back to calculations-part1 step
  try {
    await api.patch(`/survey-projects/${projectId}/workflow`, {
      step: 'calculations-part1',
      action: 'update',
      metadata: {
        adjusted_coordinates: workflowState.adjustedCoordinates,
        point_rename: { from: payload.oldName, to: payload.newName, at: new Date().toISOString() },
        timestamp: new Date().toISOString()
      }
    });
  } catch (e) {
    console.warn('[PointRename] ⚠️ Could not persist rename to workflow state:', e);
  }

  dbPointNames.value.delete(payload.oldName);
  dbPointNames.value.add(payload.newName);
  const oldDbId = dbPointIds.value.get(payload.oldName);
  if (oldDbId !== undefined) { dbPointIds.value.delete(payload.oldName); dbPointIds.value.set(payload.newName, oldDbId); }

  // 5. Propagate into land_parcels.metadata.cape_lo_points (Resolved #3)
  try {
    const rows = await listLandParcels(Number(projectId));
    const { written, failed } = await propagateRename(rows, payload.oldName, payload.newName, {
      updateParcel: async (parcelId, { metadata }) => {
        await updateLandParcel(parcelId, { metadata });
      }
    });
    if (written.length) {
      console.log(`[PointRename] ✅ Propagated to ${written.length} parcel(s): ${written.join(', ')}`);
    }
    if (failed.length) {
      console.warn('[PointRename] ⚠️ Some parcels were not updated:', failed);
    }
  } catch (e) {
    console.warn('[PointRename] ⚠️ Could not propagate rename to parcels:', e);
  }

  console.log(`[PointRename] ✅ Renamed "${payload.oldName}" → "${payload.newName}"`);
}
```

`confirmBeaconSave` (`:1842-1933`): normalise `name` at `:1846` and make the duplicate check case-fold aware:

```ts
async function confirmBeaconSave() {
  const modal = beaconModal.value;
  if (!modal || modal.saving) return;

  const name = normalizeBeaconName(modal.name.trim());
  // ...
  if (modal.mode === 'add') {
    if (coordinatePoints.value.some((p: any) => normalizeBeaconName(p.id) === name)) {
      modal.error = `"${name}" already exists.`;
      modal.saving = false;
      return;
    }
  }
```

The `handlePointRename` call inside `editPanelHandler` (`:1364`) now receives the normalised name because `editPanelHandler` normalises `patch.name` before it reaches `:1363`; no double-normalisation occurs.

- [ ] **Step 6: Verify**

```bash
cd app-frontend && vitest run beaconName-entry
```

Expected: PASS.

```bash
cd app-frontend && npm test
```

Expected: baseline + new tests, no new failures. `beaconReconcile.test.ts`, `vertexCascade.test.ts`, `vertexSnap.test.ts` unchanged and green.

```bash
cd app-frontend && npm run build
```

Expected: BUILD SUCCESSFUL.

**Manual browser checklist (mandatory, Task 5):**

1. On a project with a CSV import, open Coordinate List, rename a beacon to a lowercase form (e.g. `2474a`) → it is stored and shown as `2474A`. The map labels update. Open a saved parcel's metadata in the DB → its `cape_lo_points` list already shows the new name.
2. Open the MapLibre beacon-add/edit modal, type `2474a` as a new beacon name → it is stored as `2474A` on save.
3. Type `1464An` as a new beacon name → it is stored byte-for-byte as `1464An` (mixed-case, deliberate naming form).
4. Import a CSV holding both `99a` and `99A` → import is rejected, naming the pair `99a / 99A`. The CSV does not load.
5. Import a CSV holding `2474a` → imports cleanly; the point id shows `2474A` in the coordinate list and on the map.
6. Reload the page → `2474A` still shows (A2 persistence survived the reload).
7. Regenerate the Area/Consistency PDF → every From/To reference, area, distance and direction is unchanged (repair did not touch numbers or geometry).

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/utils/cadastral-csv.ts app-frontend/src/utils/__tests__/beaconName-entry.test.ts app-frontend/src/services/spatial.ts app-frontend/src/views/modules/cadastral-standard/CoordinateListView.vue app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(beacon-names): normalise names at every frontend entry point + propagate renames"
```
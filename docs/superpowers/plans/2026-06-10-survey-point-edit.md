# Survey-Point Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing "Edit Point Names" panel in the Area & Consistency view so surveyors can search a point by name and edit its name, coordinates, description, or delete it — with an affected-parcels confirm gate and auto-recompute after destructive changes.

**Architecture:** Two-file change. `PointRenamePanel.vue` grows from rename-only to a full edit modal (name + Y + X + description + delete). `MapLibreAreaView.vue` widens its panel handler into a unified `editPanelHandler` + new `deletePanelHandler`, both gated by an affected-parcels confirm modal for destructive changes. Backend (`PUT /coordinate-points/:id`, `DELETE /coordinate-points/:id`) and the `spatial.ts` service layer are already complete — no work there.

**Tech Stack:** Vue 3 SFC (`<script setup lang="ts">`), Pinia (existing stores untouched), Axios (`api` service), existing PointRow/PointInput component contract.

**Spec:** `docs/superpowers/specs/2026-06-10-survey-point-edit-design.md`

**Verification model:** This frontend has no test framework (no vitest/jest config, no `.test.ts` outside `node_modules`). Per `CLAUDE.md` ("For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete"), every task ends with manual verification in the dev server. The dev servers are already running (backend at 127.0.0.1:3050, frontend at localhost:5173).

**One spec deviation, called out here so reviewers see it:** the spec said `handleRenameComplete` would be renamed to `handleEditComplete`. While planning I found `handleRenameComplete` has 5 callsites unrelated to the rename panel (lines 996, 1045, 1368, 1540, 2975) — it's a generic "rebuild map labels" hook that happens to be called on rename success. Renaming would churn 5 unrelated sites with no behavioural gain. The plan keeps `handleRenameComplete` and wires the new `'edit-complete'` emit straight to it.

---

## Task 1: Refactor PointRenamePanel contract from rename-only to editHandler shape (no behaviour change)

**Why first:** The new patch-shaped handler is the foundation everything else hangs off. Doing it as a pure refactor (no behaviour change) keeps a clean diff that reviewers can read in one pass.

**Files:**
- Modify: `app-frontend/src/components/cadastral/PointRenamePanel.vue`
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue:81-87, 1158-1160`

**Steps:**

- [ ] **Step 1.1: Update PointRenamePanel props and emits**

In `app-frontend/src/components/cadastral/PointRenamePanel.vue`, replace the `defineProps` and `defineEmits` blocks (around lines 177–185):

```typescript
const props = defineProps<{
  points: PointInput[];
  editHandler: (
    oldName: string,
    patch: { name?: string; y?: number; x?: number; description?: string }
  ) => Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit-complete', payload: { oldName: string; patch: { name?: string; y?: number; x?: number; description?: string } }): void;
}>();
```

- [ ] **Step 1.2: Update PointRenamePanel's confirmRename to use editHandler**

In the same file, replace the `confirmRename` function (around lines 256–277). The function still only changes the name in this task — the new fields land in Task 2.

```typescript
async function confirmRename() {
  if (!modalRow.value || !canSave.value || isSaving.value) return;
  const trimmed = modalNewName.value.trim();
  const row = modalRow.value;

  isSaving.value = true;
  try {
    const patch = { name: trimmed };
    await props.editHandler(row.currentName, patch);
    const prev = row.currentName;
    row.currentName = trimmed;
    row.originalName = trimmed;
    row.saved = true;
    savedCount.value++;
    emit('edit-complete', { oldName: prev, patch });
    cancelModal();
    setTimeout(() => { row.saved = false; }, 4000);
  } catch (err: any) {
    modalError.value = err?.message || 'Save failed. Please try again.';
  } finally {
    isSaving.value = false;
  }
}
```

- [ ] **Step 1.3: Rename caller in MapLibreAreaView template**

In `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` lines 81–87, replace the two prop/event binding lines:

```vue
      <PointRenamePanel
        v-else
        :points="surveyPegPoints"
        :edit-handler="editPanelHandler"
        @close="showRenamePanel = false"
        @edit-complete="handleRenameComplete"
      />
```

(`handleRenameComplete` keeps its current name — see the spec deviation note in the header.)

- [ ] **Step 1.4: Replace renamePanelHandler with editPanelHandler**

Replace the entire `renamePanelHandler` function at lines 1158–1160 with:

```typescript
async function editPanelHandler(
  oldName: string,
  patch: { name?: string; y?: number; x?: number; description?: string }
): Promise<void> {
  if (patch.name && patch.name !== oldName) {
    await handlePointRename({ oldName, newName: patch.name });
  }
  // Task 2 will extend this to handle y / x / description.
}
```

- [ ] **Step 1.5: Verify in browser**

Servers are already running. Reload the frontend tab pointing at the Area & Consistency view (a Vite HMR refresh is enough; no server restart needed). Open "Edit Point Names" → click a point → rename → confirm. Behaviour must match before: rename succeeds, "✓ renamed" badge appears, panel works identically.

Expected: no console errors, rename persists to DB (`coordinate_points.name` column changes — check via `psql -c "SELECT name FROM coordinate_points WHERE project_id = <id> ORDER BY id DESC LIMIT 5;"` if you want hard proof).

- [ ] **Step 1.6: Commit**

```bash
git add app-frontend/src/components/cadastral/PointRenamePanel.vue \
        app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "$(cat <<'EOF'
refactor(point-rename-panel): contract from rename-only to editHandler shape

Pure refactor in preparation for adding coord/description/delete to the same
modal. renameHandler prop becomes editHandler with a patch shape; emit
rename-complete becomes edit-complete with the same patch. Behaviour
unchanged — confirmRename still only ever sends { name } in the patch.

Spec: docs/superpowers/specs/2026-06-10-survey-point-edit-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Y / X / description fields to the edit modal

**Files:**
- Modify: `app-frontend/src/components/cadastral/PointRenamePanel.vue`
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` (editPanelHandler)

**Steps:**

- [ ] **Step 2.1: Extend PointRow type and the points→rows mapper**

In `PointRenamePanel.vue`, replace the `PointRow` interface (around line 160) and the `watch(() => props.points, ...)` block (around lines 198–207):

```typescript
interface PointRow {
  originalName: string;
  currentName: string;
  y: string;        // display-formatted (2dp)
  x: string;        // display-formatted (2dp)
  status: string;
  saved: boolean;
  // Diff tracking — current numeric values + original snapshot
  numericY: number;
  numericX: number;
  description: string;
  originalY: number;
  originalX: number;
  originalDescription: string;
}
```

```typescript
watch(() => props.points, (pts) => {
  rows.value = pts.map(p => {
    const yNum = typeof p.y === 'number' ? p.y : parseFloat(p.y as any);
    const xNum = typeof p.x === 'number' ? p.x : parseFloat(p.x as any);
    const desc = p.description ?? '';
    return {
      originalName: p.id,
      currentName: p.id,
      y: yNum.toFixed(2),
      x: xNum.toFixed(2),
      status: p.status || 'P',
      saved: false,
      numericY: yNum,
      numericX: xNum,
      description: desc,
      originalY: yNum,
      originalX: xNum,
      originalDescription: desc,
    };
  });
}, { immediate: true });
```

- [ ] **Step 2.2: Add modal field refs**

In `PointRenamePanel.vue` script setup, after the `modalNewName` ref (around line 194), add:

```typescript
const modalY = ref<string>('');
const modalX = ref<string>('');
const modalDescription = ref<string>('');
```

- [ ] **Step 2.3: Initialise the new fields in openModal**

Replace `openModal` (around lines 223–231):

```typescript
function openModal(row: PointRow) {
  modalRow.value = row;
  modalNewName.value = row.currentName;
  modalY.value = String(row.numericY);
  modalX.value = String(row.numericX);
  modalDescription.value = row.description;
  modalError.value = '';
  nextTick(() => {
    modalInputRef.value?.focus();
    modalInputRef.value?.select();
  });
}
```

And update `cancelModal` to clear them (lines 233–237):

```typescript
function cancelModal() {
  modalRow.value = null;
  modalNewName.value = '';
  modalY.value = '';
  modalX.value = '';
  modalDescription.value = '';
  modalError.value = '';
}
```

- [ ] **Step 2.4: Update canSave + validation watcher**

Replace `canSave` (around lines 218–221) and the `watch(modalNewName, ...)` block (around lines 239–254) with a single combined validation block:

```typescript
function parseCoord(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const canSave = computed(() => {
  if (!modalRow.value || modalError.value) return false;
  const trimmedName = modalNewName.value.trim();
  if (!trimmedName) return false;
  const y = parseCoord(modalY.value);
  const x = parseCoord(modalX.value);
  if (y === null || x === null) return false;
  const row = modalRow.value;
  const nameChanged = trimmedName !== row.originalName;
  const yChanged    = y !== row.originalY;
  const xChanged    = x !== row.originalX;
  const descChanged = modalDescription.value !== row.originalDescription;
  return nameChanged || yChanged || xChanged || descChanged;
});

// Live validation feedback (errors only — disablement is via canSave)
watch([modalNewName, modalY, modalX], () => {
  if (!modalRow.value) return;
  const trimmedName = modalNewName.value.trim();
  if (!trimmedName) {
    modalError.value = 'Name cannot be empty';
    return;
  }
  if (trimmedName !== modalRow.value.currentName) {
    const dup = rows.value.some(r => r !== modalRow.value && r.currentName === trimmedName);
    if (dup) {
      modalError.value = `"${trimmedName}" already exists`;
      return;
    }
  }
  if (parseCoord(modalY.value) === null) {
    modalError.value = 'Y must be a number';
    return;
  }
  if (parseCoord(modalX.value) === null) {
    modalError.value = 'X must be a number';
    return;
  }
  modalError.value = '';
});
```

- [ ] **Step 2.5: Build the patch in confirmRename (rename it to confirmEdit)**

Replace `confirmRename` (the version from Task 1) with:

```typescript
async function confirmEdit() {
  if (!modalRow.value || !canSave.value || isSaving.value) return;
  const row = modalRow.value;
  const trimmedName = modalNewName.value.trim();
  const newY = parseCoord(modalY.value)!;
  const newX = parseCoord(modalX.value)!;
  const newDesc = modalDescription.value;

  const patch: { name?: string; y?: number; x?: number; description?: string } = {};
  if (trimmedName !== row.originalName)   patch.name = trimmedName;
  if (newY !== row.originalY)             patch.y = newY;
  if (newX !== row.originalX)             patch.x = newX;
  if (newDesc !== row.originalDescription) patch.description = newDesc;

  isSaving.value = true;
  try {
    const prev = row.currentName;
    await props.editHandler(prev, patch);
    if (patch.name)        { row.currentName = patch.name; row.originalName = patch.name; }
    if (patch.y !== undefined) { row.numericY = patch.y; row.originalY = patch.y; row.y = patch.y.toFixed(2); }
    if (patch.x !== undefined) { row.numericX = patch.x; row.originalX = patch.x; row.x = patch.x.toFixed(2); }
    if (patch.description !== undefined) { row.description = patch.description; row.originalDescription = patch.description; }
    row.saved = true;
    savedCount.value++;
    emit('edit-complete', { oldName: prev, patch });
    cancelModal();
    setTimeout(() => { row.saved = false; }, 4000);
  } catch (err: any) {
    if (err?.message !== 'cancelled') {
      modalError.value = err?.message || 'Save failed. Please try again.';
    }
  } finally {
    isSaving.value = false;
  }
}
```

- [ ] **Step 2.6: Replace the modal body template with the all-fields layout**

In the same file, replace the existing modal body (currently the `<!-- Point info -->`, `<!-- Input -->`, and `<!-- Actions -->` blocks at lines 99–149) with this single block:

```vue
          <!-- Point badge -->
          <div class="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
            <div :class="[
              'w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0',
              modalRow.status === 'TRIG' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            ]">{{ modalRow.status || 'P' }}</div>
            <div>
              <p class="font-mono text-xs text-gray-500">Original: {{ modalRow.originalName }}</p>
              <p class="text-[11px] text-gray-400">Edit any field and click Save</p>
            </div>
          </div>

          <!-- Edit form -->
          <div class="px-5 py-4 space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                ref="modalInputRef"
                v-model="modalNewName"
                @keydown.escape="cancelModal"
                type="text"
                class="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                :placeholder="modalRow.originalName"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Y (north)</label>
                <input
                  v-model="modalY"
                  @keydown.escape="cancelModal"
                  type="number"
                  step="0.001"
                  class="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">X (east)</label>
                <input
                  v-model="modalX"
                  @keydown.escape="cancelModal"
                  type="number"
                  step="0.001"
                  class="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                v-model="modalDescription"
                @keydown.escape="cancelModal"
                rows="3"
                class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 border-gray-300"
                placeholder="Optional"
              />
            </div>
            <p v-if="modalError" class="text-xs text-red-600">{{ modalError }}</p>
          </div>

          <!-- Actions (Delete goes left, Cancel/Save go right; Delete wired in Task 3) -->
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
            <span />
            <div class="flex gap-2">
              <button
                @click="cancelModal"
                :disabled="isSaving"
                class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="confirmEdit"
                :disabled="isSaving || !canSave"
                class="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <span v-if="isSaving" class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                {{ isSaving ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
```

Also remove the stray `@keydown.enter="confirmRename"` from the name input — Enter-to-submit on a textarea is hostile, so we drop it for all fields and keep Escape-to-cancel.

- [ ] **Step 2.7: Widen editPanelHandler to do the API update for non-name fields**

In `MapLibreAreaView.vue`, replace the `editPanelHandler` stub (added in Task 1.4) with:

```typescript
async function editPanelHandler(
  oldName: string,
  patch: { name?: string; y?: number; x?: number; description?: string }
): Promise<void> {
  // Name change goes through the existing rename pipeline (DB + workflow +
  // land_parcels.metadata.cape_lo_points + map labels).
  if (patch.name && patch.name !== oldName) {
    await handlePointRename({ oldName, newName: patch.name });
  }

  // Y / X / description go through PUT /coordinate-points/:id.
  const hasFieldChange = patch.y !== undefined
    || patch.x !== undefined
    || patch.description !== undefined;
  if (!hasFieldChange) return;

  const currentName = patch.name ?? oldName;
  const point = coordinatePoints.value.find((p: any) => p.id === currentName || p.name === currentName);
  if (!point || point.dbId === undefined) {
    throw new Error(`Cannot find point id for "${currentName}"`);
  }

  const apiPatch: { y?: number; x?: number; description?: string } = {};
  if (patch.y !== undefined)           apiPatch.y = patch.y;
  if (patch.x !== undefined)           apiPatch.x = patch.x;
  if (patch.description !== undefined) apiPatch.description = patch.description;
  await updateCoordinatePoint(point.dbId, apiPatch);

  // Update local workflowState entries so other views (and reactive computed
  // bindings on this page) see the new values without a refetch.
  const updateEntry = (entry: any) => {
    if (entry === null || typeof entry !== 'object') return entry;
    const id = entry.pointId || entry.id || entry.name;
    if (id !== currentName) return entry;
    return {
      ...entry,
      ...(patch.y !== undefined && { y: patch.y }),
      ...(patch.x !== undefined && { x: patch.x }),
      ...(patch.description !== undefined && { description: patch.description }),
    };
  };

  if (Array.isArray(workflowState?.adjustedCoordinates)) {
    workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.map(updateEntry);
  }
  if (Array.isArray(workflowState?.importedPoints)) {
    workflowState.importedPoints = workflowState.importedPoints.map(updateEntry);
  }

  const projectId = workflowState?.projectInfo?.projectId;
  if (projectId) {
    try {
      await api.patch(`/survey-projects/${projectId}/workflow`, {
        step: 'calculations-part1',
        action: 'update',
        metadata: {
          adjusted_coordinates: workflowState.adjustedCoordinates,
          point_edit: { name: currentName, patch: apiPatch, at: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn('[PointEdit] Could not persist edit to workflow state:', e);
    }
  }
}
```

(Note: `point.dbId` here means the numeric `id` PK on `coordinate_points`. Confirm in Step 2.8 that the `coordinatePoints` computed exposes it under that name; if it's exposed as `point.id` or `point.numericId`, use that field name instead. Don't guess — read the computed.)

- [ ] **Step 2.8: Confirm the dbId field name on the coordinatePoints computed**

Open `MapLibreAreaView.vue` and search for `const coordinatePoints =` (it is a `computed(() => ...)`). Read the mapper that builds each point object and note which field carries the numeric `coordinate_points.id` PK. Update the field name in Step 2.7's code if it isn't `dbId`. Do not skip this — using the wrong field is the single most likely cause of a "Cannot find point id" runtime error.

- [ ] **Step 2.9: Verify in browser**

Open the dev server's Area & Consistency view. Open the panel, click a point.

1. Edit only the **description**, click Save. Open the DB:
   `psql -d surveypro_v1 -c "SELECT name, description FROM coordinate_points WHERE name = '<that name>';"`
   Expected: description column matches.
2. Edit **Y** by 0.500, click Save. Re-run the same query plus `ST_Y(geom)` / `ST_X(geom)`. Expected: new Y reflected.
3. Edit **name** + Y in one save. Expected: both persist; existing rename machinery handles the name, new path handles the Y.
4. Cancel a mid-edit and reopen — fields should reset to the saved values.

- [ ] **Step 2.10: Commit**

```bash
git add app-frontend/src/components/cadastral/PointRenamePanel.vue \
        app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "$(cat <<'EOF'
feat(point-edit): expose Y/X/description in PointRenamePanel modal

Modal grows from rename-only to all-fields-visible. Patch is built from the
diff of original vs current values; only changed fields are sent. The
editPanelHandler in MapLibreAreaView routes name changes through the
existing rename pipeline and Y/X/description through updateCoordinatePoint
+ a workflow step_data sync mirroring the rename pattern.

Spec: docs/superpowers/specs/2026-06-10-survey-point-edit-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add the Delete button + deletePanelHandler

**Files:**
- Modify: `app-frontend/src/components/cadastral/PointRenamePanel.vue`
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Steps:**

- [ ] **Step 3.1: Add deleteHandler prop and isDeleting state**

In `PointRenamePanel.vue`, extend the `defineProps` block (the one from Task 1.1):

```typescript
const props = defineProps<{
  points: PointInput[];
  editHandler: (
    oldName: string,
    patch: { name?: string; y?: number; x?: number; description?: string }
  ) => Promise<void>;
  deleteHandler: (name: string) => Promise<void>;
}>();
```

After the `isSaving` ref, add:

```typescript
const isDeleting = ref(false);
```

- [ ] **Step 3.2: Add confirmDelete function**

After `confirmEdit` (the one from Task 2.5), add:

```typescript
async function confirmDelete() {
  if (!modalRow.value || isDeleting.value || isSaving.value) return;
  const row = modalRow.value;
  isDeleting.value = true;
  try {
    await props.deleteHandler(row.currentName);
    rows.value = rows.value.filter(r => r !== row);
    cancelModal();
  } catch (err: any) {
    if (err?.message !== 'cancelled') {
      modalError.value = err?.message || 'Delete failed. Please try again.';
    }
  } finally {
    isDeleting.value = false;
  }
}
```

- [ ] **Step 3.3: Wire Delete button in the modal footer**

In the modal-actions block from Task 2.6, replace the `<span />` placeholder on the left with:

```vue
            <button
              @click="confirmDelete"
              :disabled="isSaving || isDeleting"
              class="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <span v-if="isDeleting" class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
              🗑 {{ isDeleting ? 'Deleting...' : 'Delete' }}
            </button>
```

- [ ] **Step 3.4: Add deletePanelHandler in MapLibreAreaView**

In `MapLibreAreaView.vue`, after the `editPanelHandler` block from Task 2.7, add:

```typescript
async function deletePanelHandler(name: string): Promise<void> {
  const point = coordinatePoints.value.find((p: any) => p.id === name || p.name === name);
  if (!point || point.dbId === undefined) {
    throw new Error(`Cannot find point id for "${name}"`);
  }
  await deleteCoordinatePoint(point.dbId);

  // Strip the point out of the workflow snapshot.
  const stripEntry = (entry: any) => {
    if (entry === null || typeof entry !== 'object') return true;
    const id = entry.pointId || entry.id || entry.name;
    return id !== name;
  };
  if (Array.isArray(workflowState?.adjustedCoordinates)) {
    workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.filter(stripEntry);
  }
  if (Array.isArray(workflowState?.importedPoints)) {
    workflowState.importedPoints = workflowState.importedPoints.filter(stripEntry);
  }

  // Keep the dbPointNames Set in sync for downstream logic that checks it.
  if (dbPointNames.value.has(name)) dbPointNames.value.delete(name);

  const projectId = workflowState?.projectInfo?.projectId;
  if (projectId) {
    try {
      await api.patch(`/survey-projects/${projectId}/workflow`, {
        step: 'calculations-part1',
        action: 'update',
        metadata: {
          adjusted_coordinates: workflowState.adjustedCoordinates,
          point_delete: { name, at: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn('[PointDelete] Could not persist delete to workflow state:', e);
    }
  }
}
```

- [ ] **Step 3.5: Pass deletePanelHandler to the panel**

Update the PointRenamePanel mount (the template block from Step 1.3) to include the new prop:

```vue
      <PointRenamePanel
        v-else
        :points="surveyPegPoints"
        :edit-handler="editPanelHandler"
        :delete-handler="deletePanelHandler"
        @close="showRenamePanel = false"
        @edit-complete="handleRenameComplete"
      />
```

- [ ] **Step 3.6: Verify in browser**

1. Pick a point that is **not** referenced by any saved parcel (or accept that affected parcels will be orphaned — Task 4 adds the confirm).
2. Open the panel, open the modal, click Delete.
3. Expected: the row disappears from the grid; the modal closes; `SELECT * FROM coordinate_points WHERE name = '<that name>'` returns 0 rows.

- [ ] **Step 3.7: Commit**

```bash
git add app-frontend/src/components/cadastral/PointRenamePanel.vue \
        app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "$(cat <<'EOF'
feat(point-edit): delete survey points from PointRenamePanel

Red Delete button in the modal footer calls a new deleteHandler prop,
backed by deletePanelHandler in MapLibreAreaView. The handler removes the
point from the coordinate_points table, strips it from
workflowState.adjustedCoordinates + importedPoints, and persists a
point_delete breadcrumb to step_data.

Affected-parcels confirm gate comes in Task 4.

Spec: docs/superpowers/specs/2026-06-10-survey-point-edit-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Affected-parcels confirm gate + recompute on destructive change + description-only fast-path

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Steps:**

- [ ] **Step 4.1: Add confirm-modal state ref**

In `MapLibreAreaView.vue`, near the other modal state refs (`beaconModal`, `mapRenameModal`), add:

```typescript
const affectedParcelsConfirm = ref<{
  pointName: string;
  parcels: Array<{ id: number; stand: string; designation: string }>;
  intent: 'edit' | 'delete';
  resolve: () => void;
  reject: (e: Error) => void;
} | null>(null);
```

- [ ] **Step 4.2: Add findAffectedParcels helper**

Above `editPanelHandler`, add:

```typescript
async function findAffectedParcels(
  pointName: string
): Promise<Array<{ id: number; stand: string; designation: string }>> {
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) return [];
  const parcels = await listLandParcels(Number(projectId));
  const out: Array<{ id: number; stand: string; designation: string }> = [];
  for (const p of parcels) {
    const capeLoPoints: any[] = (p.metadata as any)?.cape_lo_points ?? [];
    if (capeLoPoints.some(v => v?.id === pointName)) {
      out.push({
        id: p.id,
        stand: p.stand,
        designation: (p as any).designation ?? p.stand,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4.3: Add requireAffectedParcelsConfirm helper**

Right after `findAffectedParcels`, add:

```typescript
async function requireAffectedParcelsConfirm(
  pointName: string,
  intent: 'edit' | 'delete'
): Promise<void> {
  const parcels = await findAffectedParcels(pointName);
  if (parcels.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    affectedParcelsConfirm.value = { pointName, parcels, intent, resolve, reject };
  });
}
```

- [ ] **Step 4.4: Gate editPanelHandler**

Replace the `editPanelHandler` from Task 2.7 with this gated version. The change is the classifier block at the top and the recompute call at the bottom — the API/workflow body in the middle is unchanged from Task 2.7, just indented one level deeper.

```typescript
async function editPanelHandler(
  oldName: string,
  patch: { name?: string; y?: number; x?: number; description?: string }
): Promise<void> {
  // Classify the patch. Description-only is non-destructive: no affected-
  // parcels confirm, no recompute. Anything else (name / y / x) is destructive.
  const onlyDescription =
    patch.description !== undefined
    && patch.name === undefined
    && patch.y === undefined
    && patch.x === undefined;

  if (!onlyDescription) {
    try {
      await requireAffectedParcelsConfirm(oldName, 'edit');
    } catch (e: any) {
      // User cancelled the confirm. Surface as a quiet message the panel
      // catch swallows without showing a red banner.
      throw new Error('cancelled');
    }
  }

  // ── unchanged from Task 2.7 below ──
  if (patch.name && patch.name !== oldName) {
    await handlePointRename({ oldName, newName: patch.name });
  }

  const hasFieldChange = patch.y !== undefined
    || patch.x !== undefined
    || patch.description !== undefined;

  if (hasFieldChange) {
    const currentName = patch.name ?? oldName;
    const point = coordinatePoints.value.find((p: any) => p.id === currentName || p.name === currentName);
    if (!point || point.dbId === undefined) {
      throw new Error(`Cannot find point id for "${currentName}"`);
    }
    const apiPatch: { y?: number; x?: number; description?: string } = {};
    if (patch.y !== undefined)           apiPatch.y = patch.y;
    if (patch.x !== undefined)           apiPatch.x = patch.x;
    if (patch.description !== undefined) apiPatch.description = patch.description;
    await updateCoordinatePoint(point.dbId, apiPatch);

    const updateEntry = (entry: any) => {
      if (entry === null || typeof entry !== 'object') return entry;
      const id = entry.pointId || entry.id || entry.name;
      if (id !== currentName) return entry;
      return {
        ...entry,
        ...(patch.y !== undefined && { y: patch.y }),
        ...(patch.x !== undefined && { x: patch.x }),
        ...(patch.description !== undefined && { description: patch.description }),
      };
    };
    if (Array.isArray(workflowState?.adjustedCoordinates)) {
      workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.map(updateEntry);
    }
    if (Array.isArray(workflowState?.importedPoints)) {
      workflowState.importedPoints = workflowState.importedPoints.map(updateEntry);
    }

    const projectId = workflowState?.projectInfo?.projectId;
    if (projectId) {
      try {
        await api.patch(`/survey-projects/${projectId}/workflow`, {
          step: 'calculations-part1',
          action: 'update',
          metadata: {
            adjusted_coordinates: workflowState.adjustedCoordinates,
            point_edit: { name: currentName, patch: apiPatch, at: new Date().toISOString() },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.warn('[PointEdit] Could not persist edit to workflow state:', e);
      }
    }
  }

  // Recompute once, at the end, for destructive changes only.
  if (!onlyDescription) {
    await recomputeAllParcels();
  }
}
```

- [ ] **Step 4.5: Gate deletePanelHandler**

Replace the `deletePanelHandler` from Task 3.4 by prefixing the confirm gate and appending the recompute:

```typescript
async function deletePanelHandler(name: string): Promise<void> {
  try {
    await requireAffectedParcelsConfirm(name, 'delete');
  } catch (e: any) {
    throw new Error('cancelled');
  }

  // ── unchanged body from Task 3.4 (point lookup + delete + workflow sync) ──
  const point = coordinatePoints.value.find((p: any) => p.id === name || p.name === name);
  if (!point || point.dbId === undefined) {
    throw new Error(`Cannot find point id for "${name}"`);
  }
  await deleteCoordinatePoint(point.dbId);

  const stripEntry = (entry: any) => {
    if (entry === null || typeof entry !== 'object') return true;
    const id = entry.pointId || entry.id || entry.name;
    return id !== name;
  };
  if (Array.isArray(workflowState?.adjustedCoordinates)) {
    workflowState.adjustedCoordinates = workflowState.adjustedCoordinates.filter(stripEntry);
  }
  if (Array.isArray(workflowState?.importedPoints)) {
    workflowState.importedPoints = workflowState.importedPoints.filter(stripEntry);
  }
  if (dbPointNames.value.has(name)) dbPointNames.value.delete(name);

  const projectId = workflowState?.projectInfo?.projectId;
  if (projectId) {
    try {
      await api.patch(`/survey-projects/${projectId}/workflow`, {
        step: 'calculations-part1',
        action: 'update',
        metadata: {
          adjusted_coordinates: workflowState.adjustedCoordinates,
          point_delete: { name, at: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn('[PointDelete] Could not persist delete to workflow state:', e);
    }
  }

  await recomputeAllParcels();
}
```

- [ ] **Step 4.6: Add the confirm modal to the template**

In `MapLibreAreaView.vue`, immediately after the existing `mapRenameModal` Teleport (it closes around line 815, the `</Teleport>` for the rename modal), add a new Teleport:

```vue
    <!-- Affected-parcels confirm modal (destructive point edits/deletes) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="affectedParcelsConfirm"
          class="fixed inset-0 flex items-center justify-center"
          style="z-index: 99999;"
          @click.self="affectedParcelsConfirm?.reject(new Error('cancelled'))"
        >
          <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
          <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div class="px-5 py-4 bg-amber-500">
              <h3 class="text-white font-semibold text-base">
                {{ affectedParcelsConfirm.intent === 'delete' ? 'Delete this point?' : 'Apply this change?' }}
              </h3>
              <p class="text-amber-100 text-xs mt-0.5">
                Point "{{ affectedParcelsConfirm.pointName }}" is used by {{ affectedParcelsConfirm.parcels.length }} parcel{{ affectedParcelsConfirm.parcels.length === 1 ? '' : 's' }}.
              </p>
            </div>
            <div class="px-5 py-3 max-h-48 overflow-y-auto bg-gray-50">
              <ul class="text-xs text-gray-700 space-y-1 font-mono">
                <li v-for="p in affectedParcelsConfirm.parcels" :key="p.id">
                  • {{ p.stand }} — {{ p.designation }}
                </li>
              </ul>
            </div>
            <div class="px-5 py-3 text-xs text-gray-600 bg-amber-50 border-t border-amber-100">
              Proceeding will apply the change and re-run parcel computation so the affected parcels pick up the new beacon geometry.
            </div>
            <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                @click="affectedParcelsConfirm?.reject(new Error('cancelled'))"
                class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="affectedParcelsConfirm?.resolve()"
                class="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
```

- [ ] **Step 4.7: Clear modal state on resolve/reject**

The resolve/reject handlers in 4.6 don't yet clear the modal state. Wrap them: at the top of `MapLibreAreaView.vue`'s script setup, near `affectedParcelsConfirm`, add helper functions and switch the template bindings to call these instead of the raw resolve/reject.

```typescript
function resolveAffectedParcelsConfirm() {
  const m = affectedParcelsConfirm.value;
  if (!m) return;
  affectedParcelsConfirm.value = null;
  m.resolve();
}

function rejectAffectedParcelsConfirm() {
  const m = affectedParcelsConfirm.value;
  if (!m) return;
  affectedParcelsConfirm.value = null;
  m.reject(new Error('cancelled'));
}
```

Update the three template handlers in Step 4.6:
- `@click.self="affectedParcelsConfirm?.reject(...)"` → `@click.self="rejectAffectedParcelsConfirm"`
- Cancel `@click` → `rejectAffectedParcelsConfirm`
- Proceed `@click` → `resolveAffectedParcelsConfirm`

- [ ] **Step 4.8: Verify in browser**

1. Edit only the **description** of a point used by parcels → save. No confirm dialog appears. No recompute log fires.
2. Edit **Y** of a point used by 2 parcels → save. Confirm dialog appears listing the 2 parcels. Click Cancel → modal stays open, edits preserved. Click Save again → Proceed → API + recompute fire (watch the dev tools Network tab for `PUT /coordinate-points/:id` and the recompute requests; watch console for `[Recompute]` logs).
3. **Delete** a point not used by any parcel → no confirm; gone.
4. **Delete** a point used by parcels → confirm dialog → Proceed → point gone + recompute fires.

- [ ] **Step 4.9: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "$(cat <<'EOF'
feat(point-edit): affected-parcels confirm gate + recompute on destructive change

Description-only edits flow straight through. Name / Y / X edits and deletes
fetch land_parcels, list parcels whose metadata.cape_lo_points references
the point, and require the surveyor to confirm via a modal before
proceeding. recomputeAllParcels runs after every destructive change so
saved parcels pick up the new beacon coordinates.

Spec: docs/superpowers/specs/2026-06-10-survey-point-edit-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TRIG points read-only in the grid

**Files:**
- Modify: `app-frontend/src/components/cadastral/PointRenamePanel.vue`

**Steps:**

- [ ] **Step 5.1: Update card template to show lock badge and disable click for TRIG**

In `PointRenamePanel.vue`, modify the point-card `<button>` in the grid (around lines 42–66). Change the opening tag's `@click` and add a disabled attribute, then swap the "✏️ edit" badge for the TRIG case:

```vue
        <button
          v-for="row in filteredRows"
          :key="row.originalName"
          :disabled="row.status === 'TRIG'"
          @click="row.status !== 'TRIG' && openModal(row)"
          :class="[
            'flex flex-col items-center gap-1 p-2 rounded-lg border text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-400',
            row.status === 'TRIG'
              ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-90'
              : (row.saved
                ? 'border-green-400 bg-green-50 hover:bg-green-100 hover:shadow-md'
                : 'border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 hover:shadow-md')
          ]"
          :title="row.status === 'TRIG' ? `${row.currentName} (TRIG — read-only)` : `Click to edit ${row.currentName}`"
        >
          <span :class="[
            'text-xs font-bold px-2 py-0.5 rounded-full w-full text-center truncate',
            row.status === 'TRIG' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          ]">{{ row.status || 'P' }}</span>
          <span class="font-mono text-xs font-semibold text-gray-800 truncate w-full text-center">
            {{ row.currentName }}
          </span>
          <span class="text-gray-400 text-xs truncate w-full text-center">
            {{ row.y }}, {{ row.x }}
          </span>
          <span v-if="row.status === 'TRIG'" class="text-red-500 text-xs font-semibold">🔒 TRIG</span>
          <span v-else-if="row.saved" class="text-green-600 text-xs font-semibold">✓ saved</span>
          <span v-else class="text-blue-400 text-xs">✏️ edit</span>
        </button>
```

- [ ] **Step 5.2: Verify in browser**

1. The Area & Consistency view's existing `surveyPegPoints` computed already filters out TRIG (`p.status !== 'TRIG'`), so currently the panel never sees them. Temporarily relax this for testing: in `MapLibreAreaView.vue:1154-1156`, change `filter((p: any) => p.status !== 'TRIG')` to `filter(() => true)` to surface TRIG points.
2. Reload. TRIG cards show the 🔒 badge with a red tint. Clicking them does nothing.
3. Revert the filter change in `surveyPegPoints` — that's deliberately upstream scope and outside this feature's intent. (The lock badge is still the right behaviour for any future surface that does include TRIG points.)

- [ ] **Step 5.3: Commit**

```bash
git add app-frontend/src/components/cadastral/PointRenamePanel.vue
git commit -m "$(cat <<'EOF'
feat(point-edit): TRIG points are read-only in the rename/edit grid

TRIG cards show a "🔒 TRIG" badge with a red tint, are disabled, and the
click handler is a no-op. Search still finds them. National TRIG control
points shouldn't be editable inside a single project's UI.

Spec: docs/superpowers/specs/2026-06-10-survey-point-edit-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: End-to-end smoke verification + cross-module sync check

**Files:** none (verification only — no commit)

**Steps:**

- [ ] **Step 6.1: Pick a real project with ≥3 saved parcels**

Log in to the dev frontend at http://localhost:5173. Open a project that has at least 3 saved parcels in its Area & Consistency view.

- [ ] **Step 6.2: Search test**

Open "Edit Point Names". Type a partial name in the search box. Filter narrows in real-time. Pass: at least one result matches; non-matching cards hidden.

- [ ] **Step 6.3: Description-only edit (no confirm, no recompute)**

Click a non-TRIG point. Edit only the description (e.g. add "Updated 2026-06-10"). Save.
- No confirm dialog appears.
- Modal closes; "✓ saved" badge shows briefly.
- DB check: `SELECT description FROM coordinate_points WHERE name = '<that name>';` matches.
- Console: no `[Recompute]` log line.

- [ ] **Step 6.4: Coordinate edit (confirm + recompute)**

Pick a point used by ≥1 saved parcel (use the parcel sidebar to read off a beacon name first). Open it, change Y by 0.500. Save.
- Confirm dialog opens listing the affected parcels.
- Click Cancel → modal stays open, edits preserved.
- Click Save again, then Proceed.
- API: `PUT /coordinate-points/<id>` fires with `{ y: <new> }`.
- Recompute runs (look for the existing recompute spinner/log).
- DB check: `SELECT ST_Y(geom) FROM coordinate_points WHERE name = '<that name>';` matches.

- [ ] **Step 6.5: Name edit (confirm + recompute + cape_lo_points cascade)**

Open the same point. Change only the name. Save → Proceed.
- DB: row's `name` column changed.
- DB: `SELECT metadata->'cape_lo_points' FROM land_parcels WHERE id = <affected id>;` shows the new name in the matching entry.

- [ ] **Step 6.6: Delete (confirm + recompute)**

Pick a different point that has ≥1 parcel reference. Open it, click Delete → Proceed.
- Point disappears from the grid.
- DB: `SELECT * FROM coordinate_points WHERE name = '<that name>';` returns 0 rows.
- Recompute runs.

- [ ] **Step 6.7: Reload page → state persists**

Hard-reload (Ctrl+Shift+R) the Area & Consistency view. Open the panel. The deleted point is still gone; the renamed/coord-edited point shows the new values. This proves both the DB write and the workflow snapshot write happened.

- [ ] **Step 6.8: Cross-module sync — QGIS Export view**

Navigate to QGIS Export (still cadastral-standard module). Its mount calls `listCoordinatePoints`. Confirm the renamed/coord-edited point shows the new values; the deleted point is absent.

- [ ] **Step 6.9: Cross-module sync — AreaComputationView**

Navigate to Area Computation (same module). It reads `workflowState.adjustedCoordinates`. Confirm the edits/delete are reflected.

- [ ] **Step 6.10: TRIG read-only sanity check**

(Skip if you didn't apply the Task 5.2 temporary unfilter — TRIG points are not surfaced in this panel by default.) Otherwise: open the panel, observe the 🔒 badge on TRIG points, confirm they don't open the modal on click.

- [ ] **Step 6.11: Document any regressions**

If anything failed: write up a short note in this section listing the failure + repro steps. Do NOT proceed to the merge / PR step until the regression is fixed in a follow-up task (slot in as Task 6.x with TDD cycle if reproducible in code, or as a fast-follow note if it's a UX nitpick).

No commit for this task.

---

## Done definition

All six tasks committed. The Area & Consistency view's "Edit Point Names" panel lets the surveyor:

- Search a point by name (unchanged).
- Open it and edit name + Y + X + description in one modal.
- Delete it.
- See a list of parcels that will be affected before any destructive change, and explicitly confirm before proceeding.
- Recompute fires automatically after destructive changes so parcels stay in sync.
- TRIG points are visibly read-only.
- After reload, edits persist. Other cadastral-standard views see the new state on next mount.

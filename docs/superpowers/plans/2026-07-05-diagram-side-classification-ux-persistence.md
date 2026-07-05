# Diagram Side-Classification: Modal UX + Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating side-classifier with a centered modal, make sides easy to click, and persist classifications per subject to the `survey-plan` workflow step (saved on each Save/Clear, hydrated on load).

**Architecture:** Add three pure helpers to `sideAnnotations.ts` (per-subject map ops + hydration). In `SurveyPlanMapView.vue`, replace the single annotations ref with a per-subject map + computed, add a wide transparent hit-line + hover cursor, swap the floating panel for a centered modal, and persist via the existing `PATCH …/workflow` `update` action.

**Tech Stack:** Vue 3 + TypeScript, MapLibre GL, Vitest.

## Global Constraints

- Frontend only. Backend workflow route unchanged (`action:'update'` merges `metadata` into `step_data[step]`).
- Storage: `step_data['survey-plan'].sideAnnotations = { [subjectParcelId: string]: SideAnnotation[] }`.
- Persist on each Save/Clear via `api.patch('/survey-projects/:id/workflow', { step:'survey-plan', action:'update', metadata:{ sideAnnotations: <map> } })`.
- Subject change must NOT wipe annotations — it loads that subject's saved set.
- Hit line: `line-width: 14`, `line-opacity: 0`; hover → canvas cursor `'pointer'`.
- Frontend tests: `npx vitest run <pattern>` from `app-frontend/`. The `.vue` has no DOM test infra — verify by `npm run build` + manual.

---

### Task 1: Per-subject helpers in `sideAnnotations.ts`

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts`

**Interfaces:**
- Consumes: existing `SideAnnotation` type.
- Produces:
  - `annotationsForSubject(map: Record<string, SideAnnotation[]>, subjectId: string|number|null): SideAnnotation[]`
  - `withSubjectAnnotations(map: Record<string, SideAnnotation[]>, subjectId: string|number, list: SideAnnotation[]): Record<string, SideAnnotation[]>`
  - `hydrateAnnotationsMap(raw: unknown): Record<string, SideAnnotation[]>`

- [ ] **Step 1: Add the failing tests**

Append to `app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts` (and add the three names to its top `import … from '../sideAnnotations'`):

```ts
import { annotationsForSubject, withSubjectAnnotations, hydrateAnnotationsMap } from '../sideAnnotations'

describe('annotationsForSubject', () => {
  const map = { '5': [{ side: 'AB', role: 'road' as const }] }
  it('returns the subject list (by string or number id) or [] / [] for null', () => {
    expect(annotationsForSubject(map, 5)).toEqual([{ side: 'AB', role: 'road' }])
    expect(annotationsForSubject(map, '5')).toHaveLength(1)
    expect(annotationsForSubject(map, 9)).toEqual([])
    expect(annotationsForSubject(map, null)).toEqual([])
  })
})

describe('withSubjectAnnotations', () => {
  it('immutably sets the subject key, leaving others', () => {
    const map = { '5': [] as any[] }
    const next = withSubjectAnnotations(map, 7, [{ side: 'BC', role: 'servitude', widthM: 3 }])
    expect(next).not.toBe(map)
    expect(next['7']).toHaveLength(1)
    expect(next['5']).toEqual([])
  })
})

describe('hydrateAnnotationsMap', () => {
  it('passes a valid map and coerces junk to {}', () => {
    expect(hydrateAnnotationsMap({ '5': [{ side: 'AB', role: 'road' }] }))
      .toEqual({ '5': [{ side: 'AB', role: 'road' }] })
    expect(hydrateAnnotationsMap(undefined)).toEqual({})
    expect(hydrateAnnotationsMap('nope')).toEqual({})
    expect(hydrateAnnotationsMap({ '5': 'notarray', '6': [] })).toEqual({ '6': [] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app-frontend && npx vitest run sideAnnotations`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`:

```ts
/** The list for a subject id (string or number), or [] (incl. null id). */
export function annotationsForSubject(
  map: Record<string, SideAnnotation[]>,
  subjectId: string | number | null,
): SideAnnotation[] {
  if (subjectId == null) return []
  return map?.[String(subjectId)] ?? []
}

/** New map with `subjectId` set to `list` (immutable). */
export function withSubjectAnnotations(
  map: Record<string, SideAnnotation[]>,
  subjectId: string | number,
  list: SideAnnotation[],
): Record<string, SideAnnotation[]> {
  return { ...map, [String(subjectId)]: list }
}

/** Coerce a loaded value into a per-subject map: drop non-array entries; {} if not an object. */
export function hydrateAnnotationsMap(raw: unknown): Record<string, SideAnnotation[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, SideAnnotation[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v as SideAnnotation[]
  }
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-frontend && npx vitest run sideAnnotations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts
git commit -m "feat(diagram-ui): per-subject annotation helpers (annotationsForSubject/withSubjectAnnotations/hydrateAnnotationsMap)"
```

---

### Task 2: Modal + hit-layer + per-subject persistence in `SurveyPlanMapView.vue`

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: Task 1 helpers; existing `selectedDiagramParcelId`, `isDiagramMode`, `parcels`, `map`, `transformParcelGeometry`, `subjectSides`, `upsertAnnotation`, `removeAnnotation`, `api`, `props.projectId`, `computed`, `watch`.

- [ ] **Step 1: Extend the sideAnnotations import**

Change the import (line ~628) to add the three helpers:
```ts
import { subjectSides, upsertAnnotation, removeAnnotation, annotationsForSubject, withSubjectAnnotations, hydrateAnnotationsMap, type SideAnnotation, type SideRole } from './sideAnnotations'
```

- [ ] **Step 2: Replace the state refs**

Replace (lines ~733-734):
```ts
const sideAnnotations = ref<SideAnnotation[]>([])
const activeSideEditor = ref<{ side: string; x: number; y: number; role: SideRole; label: string; widthM: number | null } | null>(null)
```
with:
```ts
const sideAnnotationsBySubject = ref<Record<string, SideAnnotation[]>>({})
const currentSideAnnotations = computed(() => annotationsForSubject(sideAnnotationsBySubject.value, selectedDiagramParcelId.value))
const activeSideEditor = ref<{ side: string; role: SideRole; label: string; widthM: number | null } | null>(null)
```

- [ ] **Step 3: Sides layer uses `currentSideAnnotations` + add the hit layer & hover**

In `updateSubjectSidesLayer` (line ~1924), change:
```ts
      const roleBySide = new Map(sideAnnotations.value.map(a => [a.side, a.role]))
```
to:
```ts
      const roleBySide = new Map(currentSideAnnotations.value.map(a => [a.side, a.role]))
```
Then, right before the closing `}` of `updateSubjectSidesLayer` (after the `-dashed` `addLayer` block, line ~1951), add:
```ts
  // Wide transparent hit line: easy click target + hover cursor.
  map.value.addLayer({
    id: `${srcId}-hit`, type: 'line', source: srcId,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 },
  })
  map.value.on('mouseenter', `${srcId}-hit`, () => { if (map.value) map.value.getCanvas().style.cursor = 'pointer' })
  map.value.on('mouseleave', `${srcId}-hit`, () => { if (map.value) map.value.getCanvas().style.cursor = '' })
```
(These sit inside the `if (existing) { … return }` guard's *else* path — i.e. after the two `addLayer` calls that only run on first creation — so the hover handlers register once.)

- [ ] **Step 4: Click uses the hit layer + `currentSideAnnotations`, no x/y**

Replace the side-priority block in `onMapClickSelectParcel` (lines ~1956-1972):
```ts
  // Side classification takes priority over re-selecting the subject.
  const sideLayers = ['diagram-subject-sides-solid', 'diagram-subject-sides-dashed']
    .filter(id => map.value!.getLayer(id))
  if (sideLayers.length) {
    const sideHits = map.value.queryRenderedFeatures(e.point, { layers: sideLayers })
    if (sideHits.length) {
      const side = String(sideHits[0].properties?.side ?? '')
      if (side) {
        const cur = sideAnnotations.value.find(a => a.side === side)
        activeSideEditor.value = {
          side, x: e.point.x, y: e.point.y,
          role: cur?.role ?? 'contiguous', label: cur?.label ?? '', widthM: cur?.widthM ?? null,
        }
        return
      }
    }
  }
```
with:
```ts
  // Side classification takes priority over re-selecting the subject.
  const hitLayer = 'diagram-subject-sides-hit'
  if (map.value.getLayer(hitLayer)) {
    const sideHits = map.value.queryRenderedFeatures(e.point, { layers: [hitLayer] })
    if (sideHits.length) {
      const side = String(sideHits[0].properties?.side ?? '')
      if (side) {
        const cur = currentSideAnnotations.value.find(a => a.side === side)
        activeSideEditor.value = {
          side, role: cur?.role ?? 'contiguous', label: cur?.label ?? '', widthM: cur?.widthM ?? null,
        }
        return
      }
    }
  }
```

- [ ] **Step 5: Save/Clear update the per-subject map + persist**

Replace `saveSideEditor` and `clearSideEditor` (lines ~1991-2011) with:
```ts
function saveSideEditor() {
  const ed = activeSideEditor.value
  if (!ed || selectedDiagramParcelId.value == null) return
  const ann: SideAnnotation = {
    side: ed.side,
    role: ed.role,
    label: ed.label?.trim() || undefined,
    widthM: ed.role === 'servitude' && ed.widthM != null ? ed.widthM : undefined,
  }
  const list = upsertAnnotation(currentSideAnnotations.value, ann)
  sideAnnotationsBySubject.value = withSubjectAnnotations(sideAnnotationsBySubject.value, selectedDiagramParcelId.value, list)
  activeSideEditor.value = null
  updateSubjectSidesLayer()
  persistSideAnnotations()
}

function clearSideEditor() {
  const ed = activeSideEditor.value
  if (!ed || selectedDiagramParcelId.value == null) return
  const list = removeAnnotation(currentSideAnnotations.value, ed.side)
  sideAnnotationsBySubject.value = withSubjectAnnotations(sideAnnotationsBySubject.value, selectedDiagramParcelId.value, list)
  activeSideEditor.value = null
  updateSubjectSidesLayer()
  persistSideAnnotations()
}

async function persistSideAnnotations() {
  try {
    await api.patch(`/survey-projects/${props.projectId}/workflow`, {
      step: 'survey-plan',
      action: 'update',
      metadata: { sideAnnotations: sideAnnotationsBySubject.value },
    })
  } catch (e: any) {
    console.warn('[SurveyPlanMap] failed to persist side annotations:', e?.message)
  }
}
```

- [ ] **Step 6: Hydrate on workflow load**

In the workflow-load block, right after (line ~4154):
```ts
    const workflowState = workflowResponse.data.workflow_state
```
add:
```ts
    sideAnnotationsBySubject.value = hydrateAnnotationsMap(workflowState?.step_data?.['survey-plan']?.sideAnnotations)
    updateSubjectSidesLayer()
```

- [ ] **Step 7: Payload sends the current subject's list**

Change (line ~3962):
```ts
    sideAnnotations: sideAnnotations.value,
```
to:
```ts
    sideAnnotations: currentSideAnnotations.value,
```

- [ ] **Step 8: Subject-change watcher no longer wipes**

Replace (lines ~5718-5722):
```ts
watch(selectedDiagramParcelId, () => {
  sideAnnotations.value = []
  activeSideEditor.value = null
  updateSubjectSidesLayer()
})
```
with:
```ts
watch(selectedDiagramParcelId, () => {
  activeSideEditor.value = null
  updateSubjectSidesLayer()
})
```

- [ ] **Step 9: Replace the floating panel with a centered modal**

Replace the floating-panel block in `<template>` (the `<div v-if="activeSideEditor" class="side-editor" …>` … `</div>`, lines ~12-36) with:
```html
      <div v-if="activeSideEditor" class="side-modal-backdrop" @click.self="activeSideEditor = null">
        <div class="side-modal">
          <div class="side-modal-title">Classify side {{ activeSideEditor.side }}</div>
          <label>Role
            <select v-model="activeSideEditor.role">
              <option value="contiguous">Contiguous parcel</option>
              <option value="road">Road</option>
              <option value="servitude">Servitude</option>
            </select>
          </label>
          <label>Label
            <input v-model="activeSideEditor.label" type="text" placeholder="e.g. STAND 86 … / Klein Road" />
          </label>
          <label v-if="activeSideEditor.role === 'servitude'">Width (m)
            <input v-model.number="activeSideEditor.widthM" type="number" min="0" step="0.1" />
          </label>
          <div class="side-modal-actions">
            <button type="button" class="btn-primary" @click="saveSideEditor">Save</button>
            <button type="button" @click="clearSideEditor">Clear</button>
            <button type="button" @click="activeSideEditor = null">Cancel</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 10: Replace the panel styles with modal styles**

In `<style scoped>`, remove the old `.side-editor*` rules and add:
```css
.side-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.side-modal {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.side-modal-title { font-weight: 600; font-size: 14px; }
.side-modal label { display: flex; flex-direction: column; gap: 3px; }
.side-modal select, .side-modal input { padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; }
.side-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.side-modal button { cursor: pointer; padding: 5px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; }
.side-modal .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
```

- [ ] **Step 11: Verify build + tests**

Run: `cd app-frontend && npx vitest run sideAnnotations planPayload project-directory`
Expected: PASS.
Run: `cd app-frontend && npm run build`
Expected: build succeeds (no unresolved `sideAnnotations` ref, no type errors).

- [ ] **Step 12: Manual end-to-end acceptance (controller / user)**

With the backend running: open a diagram project, select the subject, hover a side (cursor → pointer), click it (easy target) → the **centered modal** opens; classify road / servitude(+width) / contiguous(+label) → sides recolour. Reload the project → classifications persist. Switch to another subject and back → each keeps its own set. Generate → the saved PDF shows the strips.

- [ ] **Step 13: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(diagram-ui): centered modal classifier, hit-line clicking, per-subject persistence"
```

---

## Self-Review

**Spec coverage:**
- Pure helpers (`annotationsForSubject`/`withSubjectAnnotations`/`hydrateAnnotationsMap`) → Task 1. ✔
- Per-subject state + computed → Task 2 Step 2. ✔
- Hit layer + hover → Task 2 Step 3-4. ✔
- Click → modal (no x/y) → Task 2 Step 4. ✔
- Centered modal + styles → Task 2 Steps 9-10. ✔
- Save/Clear update map + persist via workflow patch → Task 2 Step 5. ✔
- Hydrate on load → Task 2 Step 6. ✔
- Payload = current subject's list → Task 2 Step 7. ✔
- Subject change no longer wipes → Task 2 Step 8. ✔
- Testing (Vitest helpers; build + manual) → Tasks 1-2. ✔

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `annotationsForSubject`/`withSubjectAnnotations`/`hydrateAnnotationsMap` defined in Task 1 and imported+called in Task 2 with matching signatures; `activeSideEditor` shape changed to `{ side, role, label, widthM }` (x/y dropped) consistently in Steps 2/4/9; layer id `diagram-subject-sides-hit` consistent between Step 3 (create) and Step 4 (query); `currentSideAnnotations` used in Steps 3/4/5/7.

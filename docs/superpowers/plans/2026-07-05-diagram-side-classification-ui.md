# Diagram Side-Classification UI Implementation Plan (Sub-project B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the surveyor click a subject boundary side on the diagram map and classify it (contiguous / road / servitude, with label / width), producing `metadata.sideAnnotations` that the sub-project A renderer already consumes.

**Architecture:** A new pure module `sideAnnotations.ts` derives the subject's sides (letters by ring index, matching the backend) and edits the annotation array. `SurveyPlanMapView.vue` renders the sides as a colour-coded line layer, opens a small floating classifier on side-click, keeps `sideAnnotations` state (reset per subject), and includes it in the generate payload.

**Tech Stack:** Vue 3 + TypeScript, MapLibre GL, Vitest.

## Global Constraints

- Frontend only. No backend change (the renderer is done; contract is `metadata.sideAnnotations`).
- **Consistency invariant:** derive side letters by **ring index** of `subject.geometry.coordinates[0]` (drop the closing duplicate), `A,B,C…` then `AA,AB…` — identical to the backend `letterAt`/`deriveSubjectGeometry`, so `side:'AB'` matches the renderer.
- `SideAnnotation = { side: string; role: 'contiguous'|'road'|'servitude'; label?: string; widthM?: number }`.
- Per-role map colours reuse sub-project A: road `#B7410E`, servitude `#1F6FB2`, contiguous `#000000`, unannotated `#9aa0a6`.
- No mode toggle: the sides layer takes click priority; a miss falls through to subject selection.
- `sideAnnotations` resets to `[]` whenever `selectedDiagramParcelId` changes.
- Frontend tests: `npx vitest run <pattern>` from `app-frontend/`. The `.vue` has no DOM test infra — verify by `npm run build` + manual.

---

### Task 1: `sideAnnotations.ts` pure module

**Files:**
- Create: `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts`

**Interfaces:**
- Produces:
  - `letterAt(i: number): string`
  - `subjectSides(ring: [number,number][]): SubjectSide[]` where `SubjectSide = { side, from, to, a:[number,number], b:[number,number] }`. Drops a trailing closing-duplicate point; letters by ring index; `side = from+to`.
  - `upsertAnnotation(list: SideAnnotation[], ann: SideAnnotation): SideAnnotation[]` (replace-by-`side` or append; new array).
  - `removeAnnotation(list: SideAnnotation[], side: string): SideAnnotation[]`.
  - Types `SideRole`, `SideAnnotation`, `SubjectSide`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { letterAt, subjectSides, upsertAnnotation, removeAnnotation, type SideAnnotation } from '../sideAnnotations'

describe('letterAt', () => {
  it('is A..Z then AA', () => {
    expect(letterAt(0)).toBe('A')
    expect(letterAt(25)).toBe('Z')
    expect(letterAt(26)).toBe('AA')
  })
})

describe('subjectSides', () => {
  const square: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]] // closed
  it('gives AB,BC,CD,DA with endpoints, dropping the closing duplicate', () => {
    const sides = subjectSides(square)
    expect(sides.map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
    expect(sides[0]).toMatchObject({ side: 'AB', from: 'A', to: 'B', a: [0, 0], b: [0, 10] })
    expect(sides[3]).toMatchObject({ side: 'DA', from: 'D', to: 'A', a: [10, 0], b: [0, 0] })
  })
  it('handles an open ring (no closing duplicate) the same', () => {
    const open: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
    expect(subjectSides(open).map(s => s.side)).toEqual(['AB', 'BC', 'CD', 'DA'])
  })
  it('returns [] for a degenerate ring (<3 points)', () => {
    expect(subjectSides([[0, 0], [1, 1]])).toEqual([])
  })
})

describe('upsertAnnotation / removeAnnotation', () => {
  it('adds, replaces by side, and removes', () => {
    let list: SideAnnotation[] = []
    list = upsertAnnotation(list, { side: 'AB', role: 'road', label: 'Klein Road' })
    expect(list).toHaveLength(1)
    list = upsertAnnotation(list, { side: 'AB', role: 'servitude', widthM: 3 }) // replace AB
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ side: 'AB', role: 'servitude', widthM: 3 })
    list = upsertAnnotation(list, { side: 'BC', role: 'contiguous', label: 'STAND 86' })
    expect(list).toHaveLength(2)
    list = removeAnnotation(list, 'AB')
    expect(list.map(a => a.side)).toEqual(['BC'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app-frontend && npx vitest run sideAnnotations`
Expected: FAIL — module `../sideAnnotations` not found.

- [ ] **Step 3: Implement `sideAnnotations.ts`**

Create `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`:

```ts
export type SideRole = 'contiguous' | 'road' | 'servitude'

export interface SideAnnotation {
  side: string
  role: SideRole
  label?: string
  widthM?: number
}

export interface SubjectSide {
  side: string
  from: string
  to: string
  a: [number, number]
  b: [number, number]
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A..Z then AA, AB… — mirrors the backend diagram letterAt(). */
export function letterAt(i: number): string {
  if (i < 26) return LETTERS[i]
  return LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]
}

/**
 * One entry per subject boundary side. Letters are assigned by ring index (matching
 * the backend deriveSubjectGeometry), so `side:'AB'` is the same edge the renderer
 * resolves. Drops a trailing closing-duplicate point. `a`/`b` carry the input ring's
 * coordinates (pass a WGS84-transformed ring to draw the map layer).
 */
export function subjectSides(ring: [number, number][]): SubjectSide[] {
  if (!Array.isArray(ring) || ring.length < 3) return []
  const first = ring[0]
  const last = ring[ring.length - 1]
  const pts = last && first && last[0] === first[0] && last[1] === first[1]
    ? ring.slice(0, -1)
    : ring.slice()
  if (pts.length < 3) return []
  const sides: SubjectSide[] = []
  for (let i = 0; i < pts.length; i++) {
    const from = letterAt(i)
    const to = letterAt((i + 1) % pts.length)
    sides.push({ side: `${from}${to}`, from, to, a: pts[i], b: pts[(i + 1) % pts.length] })
  }
  return sides
}

/** Replace the entry for `ann.side` if present, else append. Returns a new array. */
export function upsertAnnotation(list: SideAnnotation[], ann: SideAnnotation): SideAnnotation[] {
  const out = list.filter((a) => a.side !== ann.side)
  out.push(ann)
  return out
}

/** Drop the entry for `side`. Returns a new array. */
export function removeAnnotation(list: SideAnnotation[], side: string): SideAnnotation[] {
  return list.filter((a) => a.side !== side)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app-frontend && npx vitest run sideAnnotations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts app-frontend/src/views/modules/cadastral-standard/__tests__/sideAnnotations.test.ts
git commit -m "feat(diagram-ui): sideAnnotations pure module (subjectSides + upsert/remove)"
```

---

### Task 2: Wire the classification UI into `SurveyPlanMapView.vue`

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `subjectSides`, `upsertAnnotation`, `removeAnnotation`, `SideAnnotation`, `SideRole` (Task 1); existing `selectedDiagramParcelId`, `isDiagramMode`, `parcels`, `map`, `transformParcelGeometry`, `onMapClickSelectParcel`, the `buildDiagramPayload` `metadata` object.
- Produces: `metadata.sideAnnotations` in the generate payload.

- [ ] **Step 1: Import the module and add state**

Add the import near the other `./` imports in `<script setup>`:
```ts
import { subjectSides, upsertAnnotation, removeAnnotation, type SideAnnotation, type SideRole } from './sideAnnotations'
```
Ensure `watch` is in the `vue` import (add it if missing). After the `selectedDiagramParcelId` ref (~line 706), add:
```ts
const sideAnnotations = ref<SideAnnotation[]>([])
const activeSideEditor = ref<{ side: string; x: number; y: number; role: SideRole; label: string; widthM: number | null } | null>(null)
```

- [ ] **Step 2: Reset annotations when the subject changes**

Add near the other refs/watchers:
```ts
watch(selectedDiagramParcelId, () => {
  sideAnnotations.value = []
  activeSideEditor.value = null
  updateSubjectSidesLayer()
})
```

- [ ] **Step 3: Add the sides layer builder**

Add this function (place it near `applyDiagramHighlight`):
```ts
function updateSubjectSidesLayer() {
  if (!map.value) return
  const srcId = 'diagram-subject-sides'
  const feats: any[] = []
  const subj = parcels.value.find((p: any) => String(p.id) === String(selectedDiagramParcelId.value))
  if (isDiagramMode.value && subj?.geom) {
    const tf = transformParcelGeometry(subj.geom)
    const ring = tf?.geometry?.coordinates?.[0] as [number, number][] | undefined
    if (ring) {
      const roleBySide = new Map(sideAnnotations.value.map(a => [a.side, a.role]))
      for (const s of subjectSides(ring)) {
        feats.push({
          type: 'Feature',
          properties: { side: s.side, role: roleBySide.get(s.side) ?? '' },
          geometry: { type: 'LineString', coordinates: [s.a, s.b] },
        })
      }
    }
  }
  const data = { type: 'FeatureCollection', features: feats } as any
  const existing = map.value.getSource(srcId) as any
  if (existing) { existing.setData(data); return }
  map.value.addSource(srcId, { type: 'geojson', data })
  const colour = ['match', ['get', 'role'], 'road', '#B7410E', 'servitude', '#1F6FB2', 'contiguous', '#000000', '#9aa0a6'] as any
  // Solid layer for road/servitude.
  map.value.addLayer({
    id: `${srcId}-solid`, type: 'line', source: srcId,
    filter: ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']] as any,
    paint: { 'line-color': colour, 'line-width': 4 },
  })
  // Dashed layer for contiguous + unannotated (dasharray is not data-driven, so a
  // separate fixed-dash layer).
  map.value.addLayer({
    id: `${srcId}-dashed`, type: 'line', source: srcId,
    filter: ['!', ['any', ['==', ['get', 'role'], 'road'], ['==', ['get', 'role'], 'servitude']]] as any,
    paint: { 'line-color': colour, 'line-width': 4, 'line-dasharray': [2, 2] },
  })
}
```

- [ ] **Step 4: Build the layer after parcels load, and expose the click layers**

Find the diagram click-handler registration (currently around line 1721-1724):
```ts
  map.value!.off('click', onMapClickSelectParcel)
  map.value!.on('click', onMapClickSelectParcel)
  applyDiagramHighlight(selectedDiagramParcelId.value)
```
Immediately after `applyDiagramHighlight(selectedDiagramParcelId.value)`, add:
```ts
  updateSubjectSidesLayer()
```

- [ ] **Step 5: Give side-clicks priority in the click handler**

In `onMapClickSelectParcel(e)`, immediately after the `if (!map.value || !isDiagramMode.value) return` guard, insert:
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
(The rest of the function — the parcel-fill selection — is unchanged and runs only when no side was hit.)

- [ ] **Step 6: Add the save/clear handlers**

Add near the other functions:
```ts
function saveSideEditor() {
  const ed = activeSideEditor.value
  if (!ed) return
  const ann: SideAnnotation = {
    side: ed.side,
    role: ed.role,
    label: ed.label?.trim() || undefined,
    widthM: ed.role === 'servitude' && ed.widthM != null ? ed.widthM : undefined,
  }
  sideAnnotations.value = upsertAnnotation(sideAnnotations.value, ann)
  activeSideEditor.value = null
  updateSubjectSidesLayer()
}

function clearSideEditor() {
  const ed = activeSideEditor.value
  if (!ed) return
  sideAnnotations.value = removeAnnotation(sideAnnotations.value, ed.side)
  activeSideEditor.value = null
  updateSubjectSidesLayer()
}
```

- [ ] **Step 7: Add the floating classifier panel to the template**

Inside the map-container element in `<template>` (the element that wraps the MapLibre canvas — it must be `position: relative`; the existing map container is), add as a child, after the map div:
```html
      <div
        v-if="activeSideEditor"
        class="side-editor"
        :style="{ left: activeSideEditor.x + 'px', top: activeSideEditor.y + 'px' }"
      >
        <div class="side-editor-title">Side {{ activeSideEditor.side }}</div>
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
        <div class="side-editor-actions">
          <button type="button" @click="saveSideEditor">Save</button>
          <button type="button" @click="clearSideEditor">Clear</button>
          <button type="button" @click="activeSideEditor = null">Cancel</button>
        </div>
      </div>
```

- [ ] **Step 8: Add scoped styles**

In the `<style scoped>` block, add:
```css
.side-editor {
  position: absolute;
  z-index: 20;
  transform: translate(8px, 8px);
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
}
.side-editor-title { font-weight: 600; }
.side-editor label { display: flex; flex-direction: column; gap: 2px; }
.side-editor-actions { display: flex; gap: 6px; }
.side-editor button { cursor: pointer; }
```

- [ ] **Step 9: Include sideAnnotations in the payload**

In `buildDiagramPayload`, inside the `metadata` object literal (after `...diagramReferenceMetadata(props.projectInfo as any),`), add:
```ts
    sideAnnotations: sideAnnotations.value,
```

- [ ] **Step 10: Verify build + existing frontend tests**

Run: `cd app-frontend && npx vitest run sideAnnotations planPayload project-directory`
Expected: PASS.
Run: `cd app-frontend && npm run build`
Expected: build succeeds (no type errors; the new imports/refs/handlers resolve).

- [ ] **Step 11: Manual end-to-end acceptance (controller)**

With the backend running (sub-project A merged): open a diagram project, select the subject parcel, click each boundary side, classify one as road, one as servitude (+width), one as contiguous (+label) — confirm the sides recolour on the map (sienna / blue / dashed black) and the classifier pre-fills when re-clicking. Generate the diagram and confirm the saved PDF shows the burnt-sienna road strip, blue servitude strip of the right width, and dashed contiguous stub + label.

- [ ] **Step 12: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(diagram-ui): click-a-side classification producing metadata.sideAnnotations"
```

---

## Self-Review

**Spec coverage:**
- Consistency invariant (index→letter) → Task 1 `subjectSides` + test. ✔
- Pure module (`subjectSides`, `upsert`, `remove`, `letterAt`) → Task 1. ✔
- State + reset-on-subject-change → Task 2 Steps 1-2. ✔
- Sides layer + per-role colouring (`#B7410E`/`#1F6FB2`/`#000000`/`#9aa0a6`) → Task 2 Step 3. ✔
- Click-a-side priority, no toggle → Task 2 Step 5. ✔
- Classifier popup (role/label/width, save/clear) → Task 2 Steps 6-8. ✔
- Payload `metadata.sideAnnotations` → Task 2 Step 9. ✔
- Testing (Vitest pure module; build + manual for `.vue`) → Tasks 1-2. ✔

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `SideAnnotation`/`SideRole`/`SubjectSide` defined in Task 1 and imported in Task 2; `subjectSides(ring)`, `upsertAnnotation(list, ann)`, `removeAnnotation(list, side)` signatures match their call sites; layer ids `diagram-subject-sides-solid`/`-dashed` are consistent between the builder (Step 3) and the click query (Step 5).

**Deviation noted:** the spec's per-role **dashing** is implemented as **two line layers** (solid for road/servitude, fixed-dash for contiguous+unannotated) because MapLibre `line-dasharray` is not a data-driven property — same visual result, MapLibre-idiomatic.

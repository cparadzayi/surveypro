# Shared ParcelSelect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable in-house `ParcelSelect` combobox (searchable, keyboard-navigable, single-select) and wire it into the Diagram-subject and Parcel-management stages so a parcel can be chosen by search as well as by map click.

**Architecture:** A presentation-only `inputs/ParcelSelect.vue` renders a text input + floating filtered list over a `ParcelOption[]` passed by the parent; it holds no parcel data and never touches MapLibre. All decision logic (option building + Outside-Figure exclusion, filtering, keyboard-index math, label formatting) lives in a pure, unit-tested `inputs/parcelSelect.ts`. Parents map their own parcels into options and react to the `@select` event to highlight/zoom the map.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Vite, Vitest (pure-helper tests only), MapLibre GL (parent-side only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-shared-parcel-select-design.md`.
- **In-house only** — no new third-party dependency.
- **Single-select only.** No multi-select mode (no surface needs it).
- Component is **map-agnostic**: never import/use MapLibre inside `ParcelSelect.vue`.
- Component does **no data fetching**.
- No DOM/component test infra exists (`@vue/test-utils`/jsdom not installed). Only the pure `parcelSelect.ts` helpers get unit tests; `.vue` and wiring tasks are verified with `npm run build` (compile gate) + manual check.
- Import alias `@/` → `app-frontend/src` is configured; use it for the new component.
- Frontend commands run from `app-frontend/`. Tests: `npm test -- <pattern>`. Compile gate: `npm run build`.
- Reuse the existing idioms: `inputs/LayerSelect.vue` (v-model shape), `SmartSuggestionDropdown.vue` + `Areas2View.vue` (keyboard-nav list). Label fallback mirrors the blank-name resilience already in the preview topology.

---

### Task 1: Pure helpers `parcelSelect.ts` (option building, filter, keyboard, label)

**Files:**
- Create: `app-frontend/src/components/inputs/parcelSelect.ts`
- Test: `app-frontend/src/components/inputs/__tests__/parcelSelect.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface ParcelOption { id: string | number; stand?: string | number | null; designation?: string | null; areaM2?: number | null }`
  - `buildParcelOptions(parcels, opts?: { excludeId?: string | number | null }) => ParcelOption[]` — maps raw parcels (`{ id, stand?, designation?, area_m2? }`), drops `excludeId`, natural-sorts by stand number then designation then id.
  - `filterParcelOptions(options: ParcelOption[], query: string) => ParcelOption[]` — case-insensitive match on stand + designation; empty query returns all.
  - `nextHighlightIndex(current: number, length: number, direction: 1 | -1) => number` — wrapping index; `-1`/empty-safe.
  - `labelForOption(option: ParcelOption) => { primary: string; secondary: string }` — `Stand {stand}` primary; designation+area secondary; `#{id}` fallback.

- [ ] **Step 1: Write the failing tests**

Create `app-frontend/src/components/inputs/__tests__/parcelSelect.test.ts`:
```ts
import {
  buildParcelOptions, filterParcelOptions, nextHighlightIndex, labelForOption,
} from '../parcelSelect'

const raw = [
  { id: 'B', stand: '303', designation: 'Stand 303', area_m2: 4000 },
  { id: 'A', stand: '302', designation: 'Stand 302', area_m2: 5000 },
  { id: 'OF', stand: '', designation: 'Outside Figure', area_m2: 100000 },
]

describe('buildParcelOptions', () => {
  it('maps raw parcels and sorts by stand number (blank stand last)', () => {
    expect(buildParcelOptions(raw).map(o => o.id)).toEqual(['A', 'B', 'OF'])
  })
  it('excludes the given id (Outside Figure)', () => {
    expect(buildParcelOptions(raw, { excludeId: 'OF' }).map(o => o.id)).toEqual(['A', 'B'])
  })
  it('coerces area to number, null when missing', () => {
    const o = buildParcelOptions([{ id: 1, stand: '5' }])
    expect(o[0].areaM2).toBeNull()
  })
})

describe('filterParcelOptions', () => {
  const opts = buildParcelOptions([
    { id: 'A', stand: '302', designation: 'Brackenhurst' },
    { id: 'B', stand: '303', designation: 'Hillside' },
  ])
  it('returns all for an empty/blank query', () => {
    expect(filterParcelOptions(opts, '  ')).toHaveLength(2)
  })
  it('matches on stand and designation, case-insensitive', () => {
    expect(filterParcelOptions(opts, '303').map(o => o.id)).toEqual(['B'])
    expect(filterParcelOptions(opts, 'brack').map(o => o.id)).toEqual(['A'])
  })
})

describe('nextHighlightIndex', () => {
  it('wraps forward and backward and seeds from -1', () => {
    expect(nextHighlightIndex(-1, 3, 1)).toBe(0)
    expect(nextHighlightIndex(2, 3, 1)).toBe(0)
    expect(nextHighlightIndex(0, 3, -1)).toBe(2)
    expect(nextHighlightIndex(-1, 3, -1)).toBe(2)
  })
  it('returns -1 for an empty list', () => {
    expect(nextHighlightIndex(0, 0, 1)).toBe(-1)
  })
})

describe('labelForOption', () => {
  it('uses Stand as primary and designation+area as secondary', () => {
    const l = labelForOption({ id: 'A', stand: '302', designation: 'Brackenhurst', areaM2: 5019 })
    expect(l.primary).toBe('Stand 302')
    expect(l.secondary).toContain('Brackenhurst')
  })
  it('falls back to #id when stand and designation are blank', () => {
    expect(labelForOption({ id: 7, stand: '', designation: '' }).primary).toBe('#7')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app-frontend/`): `npm test -- parcelSelect`
Expected: FAIL — cannot resolve `../parcelSelect`.

- [ ] **Step 3: Implement**

Create `app-frontend/src/components/inputs/parcelSelect.ts`:
```ts
export interface ParcelOption {
  id: string | number
  stand?: string | number | null
  designation?: string | null
  areaM2?: number | null
}

interface RawParcel {
  id: string | number
  stand?: string | number | null
  designation?: string | null
  area_m2?: number | null
}

function standNum(o: ParcelOption): number {
  const m = /\d+/.exec(String(o.stand ?? ''))
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY
}

function compareOptions(a: ParcelOption, b: ParcelOption): number {
  const na = standNum(a), nb = standNum(b)
  if (na !== nb) return na - nb
  const da = String(a.designation ?? ''), db = String(b.designation ?? '')
  if (da !== db) return da.localeCompare(db)
  return String(a.id).localeCompare(String(b.id))
}

export function buildParcelOptions(
  parcels: RawParcel[],
  opts: { excludeId?: string | number | null } = {},
): ParcelOption[] {
  const exclude = opts.excludeId == null ? null : String(opts.excludeId)
  return parcels
    .filter(p => p != null && (exclude == null || String(p.id) !== exclude))
    .map(p => ({
      id: p.id,
      stand: p.stand ?? null,
      designation: p.designation ?? null,
      areaM2: p.area_m2 == null ? null : Number(p.area_m2),
    }))
    .sort(compareOptions)
}

export function filterParcelOptions(options: ParcelOption[], query: string): ParcelOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(o =>
    `${o.stand ?? ''} ${o.designation ?? ''}`.toLowerCase().includes(q))
}

export function nextHighlightIndex(current: number, length: number, direction: 1 | -1): number {
  if (length <= 0) return -1
  if (current < 0) return direction === 1 ? 0 : length - 1
  return (current + direction + length) % length
}

export function labelForOption(option: ParcelOption): { primary: string; secondary: string } {
  const stand = option.stand == null ? '' : String(option.stand).trim()
  const designation = (option.designation ?? '').trim()
  const primary = stand ? `Stand ${stand}` : (designation || `#${option.id}`)
  const parts: string[] = []
  if (stand && designation) parts.push(designation)  // designation is primary when no stand
  if (option.areaM2 != null && Number.isFinite(option.areaM2)) {
    const ha = option.areaM2 / 10000
    parts.push(ha >= 1 ? `${ha.toFixed(4)} ha` : `${option.areaM2.toFixed(2)} m²`)
  }
  return { primary, secondary: parts.join(' · ') }
}
```

- [ ] **Step 4: Verify pass**

Run: `npm test -- parcelSelect`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/components/inputs/parcelSelect.ts app-frontend/src/components/inputs/__tests__/parcelSelect.test.ts
git commit -m "feat(parcel-select): pure option/filter/keyboard/label helpers"
```

---

### Task 2: `ParcelSelect.vue` component

**Files:**
- Create: `app-frontend/src/components/inputs/ParcelSelect.vue`

**Interfaces:**
- Consumes: `filterParcelOptions`, `nextHighlightIndex`, `labelForOption`, `type ParcelOption` from `./parcelSelect` (Task 1).
- Produces: default-exported SFC. Props `{ options: ParcelOption[]; modelValue: string | number | null; disabled?: boolean; placeholder?: string }`. Emits `update:modelValue` (id or null) and `select` (the picked `ParcelOption`).

**Context:** No DOM test infra, so this task is verified by the compile gate + manual check. The pure logic it uses is already tested in Task 1.

- [ ] **Step 1: Create the component**

Create `app-frontend/src/components/inputs/ParcelSelect.vue`:
```vue
<template>
  <div class="parcel-select" @keydown.esc.prevent="close">
    <input
      ref="inputEl"
      type="text"
      class="parcel-select__input"
      :placeholder="placeholder"
      :disabled="disabled"
      v-model="query"
      @focus="onFocus"
      @input="onInput"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="pickHighlighted"
    />
    <ul v-if="isOpen" class="parcel-select__list">
      <li v-if="filtered.length === 0" class="parcel-select__empty">No parcels</li>
      <li
        v-for="(opt, i) in filtered"
        :key="opt.id"
        class="parcel-select__row"
        :class="{ 'is-active': i === highlight }"
        @mousedown.prevent="pick(opt)"
        @mousemove="highlight = i"
      >
        <span class="parcel-select__primary">{{ labelForOption(opt).primary }}</span>
        <span v-if="labelForOption(opt).secondary" class="parcel-select__secondary">
          {{ labelForOption(opt).secondary }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  filterParcelOptions, nextHighlightIndex, labelForOption, type ParcelOption,
} from './parcelSelect'

const props = withDefaults(defineProps<{
  options: ParcelOption[]
  modelValue: string | number | null
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: 'Search stand or designation…',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number | null): void
  (e: 'select', option: ParcelOption): void
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const query = ref('')
const isOpen = ref(false)
const highlight = ref(-1)

const filtered = computed(() => filterParcelOptions(props.options, query.value))
const selectedOption = computed(() =>
  props.options.find(o => String(o.id) === String(props.modelValue)) ?? null)

// When closed, keep the input text showing the current external selection.
watch([selectedOption, isOpen], ([opt, open]) => {
  if (!open) query.value = opt ? labelForOption(opt).primary : ''
}, { immediate: true })

function onFocus() {
  if (props.disabled) return
  isOpen.value = true
  query.value = ''          // fresh search on focus
  highlight.value = -1
}
function close() {
  isOpen.value = false
  query.value = selectedOption.value ? labelForOption(selectedOption.value).primary : ''
}
function onInput() {
  isOpen.value = true
  highlight.value = filtered.value.length ? 0 : -1
}
function move(direction: 1 | -1) {
  isOpen.value = true
  highlight.value = nextHighlightIndex(highlight.value, filtered.value.length, direction)
}
function pickHighlighted() {
  const opt = filtered.value[highlight.value]
  if (opt) pick(opt)
}
function pick(opt: ParcelOption) {
  emit('update:modelValue', opt.id)
  emit('select', opt)
  isOpen.value = false
  query.value = labelForOption(opt).primary
  inputEl.value?.blur()
}
</script>

<style scoped>
.parcel-select { position: relative; }
.parcel-select__input {
  width: 100%; padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1;
  border-radius: 0.375rem; font-size: 0.8rem;
}
.parcel-select__input:disabled { background: #f1f5f9; cursor: not-allowed; }
.parcel-select__list {
  position: absolute; z-index: 50; top: 100%; left: 0; right: 0; margin-top: 2px;
  max-height: 16rem; overflow-y: auto; background: #fff; list-style: none;
  border: 1px solid #cbd5e1; border-radius: 0.375rem; padding: 0.25rem 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.parcel-select__row { display: flex; flex-direction: column; padding: 0.35rem 0.6rem; cursor: pointer; }
.parcel-select__row.is-active { background: #eff6ff; }
.parcel-select__primary { font-size: 0.8rem; color: #0f172a; }
.parcel-select__secondary { font-size: 0.7rem; color: #64748b; }
.parcel-select__empty { padding: 0.5rem 0.6rem; font-size: 0.8rem; color: #94a3b8; }
</style>
```

- [ ] **Step 2: Compile gate**

Run (from `app-frontend/`): `npm run build`
Expected: build succeeds (no unresolved import / template compile errors). Warnings unrelated to this file are acceptable.

- [ ] **Step 3: Commit**

```bash
git add app-frontend/src/components/inputs/ParcelSelect.vue
git commit -m "feat(parcel-select): searchable single-select ParcelSelect component"
```

---

### Task 3: Wire ParcelSelect into the Diagram subject stage (Phase 1)

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`

**Interfaces:**
- Consumes: `ParcelSelect` (Task 2), `buildParcelOptions` + `type ParcelOption` (Task 1). Existing in-file symbols: `parcels` (ref, each item has `id, stand, designation, area_m2, geom, color`), `selectedDiagramParcelId` (ref), `isDiagramMode` (computed), `getOutsideFigureParcel()`, `applyDiagramHighlight(id)`, `transformParcelGeometry(geom)`, `map` (ref), `maplibregl`.
- Produces: no new exports; the diagram-subject block gains a searchable picker synced with map-click, and picking zooms the map to the parcel.

**Context:** The template block to modify is `SurveyPlanMapView.vue:269` (`diagram-subject-hint`). The zoom follows the existing `fitBounds()` idiom (`:3097`) but scoped to one parcel’s transformed ring.

- [ ] **Step 1: Add imports**

After the existing `import { pickDiagramSubjectId } from './diagramSubjectPick'` line, add:
```ts
import ParcelSelect from '@/components/inputs/ParcelSelect.vue'
import { buildParcelOptions } from '@/components/inputs/parcelSelect'
```

- [ ] **Step 2: Add the options computed + select handler**

Immediately after the `selectedDiagramStand` computed (around `:694-697`), add:
```ts
const diagramSubjectOptions = computed(() =>
  buildParcelOptions(parcels.value, { excludeId: getOutsideFigureParcel()?.id ?? null }))

function onDiagramSubjectPicked(option: { id: string | number }) {
  applyDiagramHighlight(option.id)
  zoomToParcel(option.id)
}

function zoomToParcel(id: string | number) {
  if (!map.value) return
  const parcel = parcels.value.find((p: any) => String(p.id) === String(id))
  if (!parcel?.geom) return
  const feature = transformParcelGeometry(parcel.geom)
  const ring = feature?.geometry?.coordinates?.[0] as [number, number][] | undefined
  if (!ring || ring.length === 0) return
  const bounds = new maplibregl.LngLatBounds(ring[0], ring[0])
  for (const c of ring) bounds.extend(c as [number, number])
  map.value.fitBounds(bounds, { padding: 60, maxZoom: 19 })
}
```
> Verify `getOutsideFigureParcel`, `applyDiagramHighlight`, `transformParcelGeometry`, `map`, and `maplibregl` are already in scope (they are used elsewhere in this file). If `transformParcelGeometry` returns a differently-shaped object, adapt the `ring` extraction to reach the WGS84 outer-ring `[lng,lat][]` and note it in your report.

- [ ] **Step 3: Add the picker to the template**

Replace the `diagram-subject-hint` block (`:269-276`):
```html
        <div v-if="isDiagramMode" class="config-group diagram-subject-hint">
          <p v-if="!selectedDiagramParcelId" class="text-xs text-amber-600">
            👆 Click the parcel on the map to choose the diagram subject.
          </p>
          <p v-else class="text-xs text-green-700">
            ✓ Diagram subject: <strong>Stand {{ selectedDiagramStand }}</strong>
          </p>
        </div>
```
with:
```html
        <div v-if="isDiagramMode" class="config-group diagram-subject-hint">
          <label class="config-label">Diagram subject</label>
          <ParcelSelect
            :options="diagramSubjectOptions"
            v-model="selectedDiagramParcelId"
            placeholder="Search stand or designation, or click the map…"
            @select="onDiagramSubjectPicked"
          />
          <p v-if="!selectedDiagramParcelId" class="mt-1 text-xs text-amber-600">
            👆 Or click the parcel on the map to choose the diagram subject.
          </p>
          <p v-else class="mt-1 text-xs text-green-700">
            ✓ Diagram subject: <strong>Stand {{ selectedDiagramStand }}</strong>
          </p>
        </div>
```

- [ ] **Step 4: Compile gate**

Run (from `app-frontend/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

With backend + frontend dev servers running: open a project's survey plan, choose Plan Type = **Diagram**. Confirm:
1. The "Diagram subject" dropdown lists stands (Outside Figure absent), is searchable, and keyboard-navigable.
2. Picking a stand highlights it and zooms/pans the map to it.
3. Clicking a stand on the map updates the dropdown’s shown value (and still never selects the Outside Figure).
Note this as deferred if the servers aren’t running in your shell.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(parcel-select): searchable diagram-subject picker synced with map click"
```

---

### Task 4: Wire ParcelSelect into Parcel management (Phase 2)

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Interfaces:**
- Consumes: `ParcelSelect` (Task 2), `buildParcelOptions` (Task 1). Existing in-file symbols: `savedParcels` (ref `Map<string, dbParcel>` where `dbParcel` has `id, stand, designation, area_m2, geom`), `map` (`let map: maplibregl.Map | null`), `maplibregl`.
- Produces: a searchable picker above the saved-parcels list that zooms the map to the chosen parcel.

**Context:** The saved-parcels panel header is `MapLibreAreaView.vue:373-386`. `dbParcel.geom` is already WGS84 (it is used directly as MapLibre feature geometry at `:1203-1213`), so bounds are built straight from `geom.coordinates[0]` — no transform needed here.

- [ ] **Step 1: Add imports**

Near the existing component imports (around `:900-902`), add:
```ts
import ParcelSelect from '@/components/inputs/ParcelSelect.vue'
import { buildParcelOptions } from '@/components/inputs/parcelSelect'
```
> These views use both `@/` and relative imports; `@/` is correct here.

- [ ] **Step 2: Add options computed + zoom handler**

In the `<script setup>` body (after `savedParcels` is defined; place it with the other computeds), add:
```ts
const savedParcelOptions = computed(() =>
  buildParcelOptions(Array.from(savedParcels.value.values()) as any[]))

function onManagedParcelPicked(option: { id: string | number }) {
  if (!map) return
  const dbParcel = Array.from(savedParcels.value.values())
    .find((p: any) => String(p.id) === String(option.id)) as any
  const ring = dbParcel?.geom?.coordinates?.[0] as [number, number][] | undefined
  if (!ring || ring.length === 0) return
  const bounds = new maplibregl.LngLatBounds(ring[0], ring[0])
  for (const c of ring) bounds.extend(c as [number, number])
  map.fitBounds(bounds, { padding: 60, maxZoom: 19 })
}
const managedParcelSelection = ref<string | number | null>(null)
```
> If `computed`/`ref` are not yet imported from `vue` in this file, add them to the existing `vue` import.

- [ ] **Step 3: Add the picker to the saved-parcels panel**

At the top of the saved-parcels panel body (immediately after the panel header at `:373-386`, before the `v-for` list of `savedParcels`), insert:
```html
          <div class="mb-2">
            <ParcelSelect
              :options="savedParcelOptions"
              v-model="managedParcelSelection"
              placeholder="Find a saved parcel…"
              @select="onManagedParcelPicked"
            />
          </div>
```
> Match the surrounding indentation of the panel. This adds a “find/jump to parcel” control; the existing rename/delete/edit-vertices actions are untouched.

- [ ] **Step 4: Compile gate**

Run (from `app-frontend/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

With the dev servers running and a project that has saved parcels: open the Area view. Confirm the "Find a saved parcel…" dropdown lists saved parcels, is searchable, and picking one zooms the map to that parcel. Existing rename/delete/edit still work. Note as deferred if servers aren’t running.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(parcel-select): searchable find-parcel picker in Parcel management"
```

---

## Self-Review

**Spec coverage:**
- In-house `inputs/ParcelSelect.vue`, presentation-only, v-model + `select` → Task 2. ✓
- Pure helpers (`buildParcelOptions` w/ Outside-Figure exclusion, `filterParcelOptions`, `nextHighlightIndex`, `labelForOption`) unit-tested → Task 1. ✓
- Searchable, keyboard-navigable, single-select combobox; blank-name `#id` fallback; empty/disabled states → Tasks 1 (label/filter) + 2 (component). ✓
- Phase 1 Diagram: options exclude OF, `v-model` = `selectedDiagramParcelId`, `@select` highlights + zooms, click stays synced → Task 3. ✓
- Phase 2 Parcel management: find/jump picker above the list, zoom on select, existing actions untouched → Task 4. ✓
- Map-agnostic component (no MapLibre inside it); parents own map behaviour → Tasks 2 (no map import) + 3/4 (parent zoom). ✓
- No multi-select, no Merge, no new dependency, no DOM test infra → Global Constraints; verified by build + manual. ✓

**Placeholder scan:** No TBD/TODO. `.vue`/wiring tasks intentionally use `npm run build` + manual verification (documented rationale: no DOM test infra) rather than automated tests; the two "verify the helper/return shape when wiring" notes are concrete integration checks with fallback instructions.

**Type consistency:** `ParcelOption` defined in Task 1 is imported unchanged in Tasks 2–4. `buildParcelOptions(parcels, { excludeId })`, `filterParcelOptions(options, query)`, `nextHighlightIndex(current, length, direction)`, `labelForOption(option)` names/signatures match across Task 1 (definition), Task 2 (component use), Tasks 3–4 (`buildParcelOptions` use). Component props `{ options, modelValue, disabled?, placeholder? }` and emits `update:modelValue` / `select` are consistent between Task 2 (definition) and Tasks 3–4 (usage). `selectedDiagramParcelId` (Task 3) and `managedParcelSelection` (Task 4) are the `v-model` targets, both `string | number | null`.

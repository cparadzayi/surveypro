# Shared ParcelSelect — Design

**Status:** Approved (design phase)
**Date:** 2026-07-02
**Author:** cparadzayi (with Claude)

## Problem

Selecting a parcel happens in several workflow stages, each with its own ad-hoc
mechanism, and the map-click path had a bug where clicks resolved to the Outside
Figure instead of the intended stand (fixed on `fix/diagram-subject-click-outside-figure`
via `pickDiagramSubjectId`). There is no shared, searchable way to pick a parcel,
which hurts dense plans, sliver stands, and touch/mobile use.

We want one reusable, in-house picker used across the stages that genuinely need
parcel selection.

## Scope note (why single-select only)

Discovery found only single-parcel selection surfaces:
- **Diagram subject** (`SurveyPlanMapView`) — single-select, map-click + wants a dropdown.
- **Parcel management** (`MapLibreAreaView`) — a parcel list with rename/delete/edit-vertices.

The Merge dialog (`MergeAnalysisDialog`, opened from `CadastralStandardView` after
a CSV-import `analyzeMerge`) is a **review** surface, not a picker — parcels are
auto-categorized and the only interaction is a per-parcel action dropdown. Area
computation selects **points** to build a new parcel, not existing parcels. There
is no genuine multi-parcel picking, so multi-select is **out of scope** (YAGNI);
adding a `multiple` mode later is a clean, isolated extension.

## Goals

- A single presentation-only component `inputs/ParcelSelect.vue` with a `v-model`
  API, built from the existing in-house idioms (`inputs/LayerSelect.vue`,
  `ControlPointSelector.vue`, `SmartSuggestionDropdown.vue`, the `Areas2View`
  keyboard-nav autocomplete). **No new third-party dependency.**
- Searchable, keyboard-navigable (↑/↓/Enter/Esc), single-select combobox.
- Map-agnostic: never touches MapLibre. Parents react to selection.
- Wired into two stages, phased: Diagram → Parcel management.

## Non-goals (YAGNI)

- Multi-select mode (no surface needs it — see Scope note).
- The Merge dialog and `AreaComputationView` (neither is an existing-parcel picker).
- No third-party UI/combobox library (repo currently has none; keep it that way).
- The component does no data fetching and no map manipulation.
- No DOM/component test infrastructure added (`@vue/test-utils`/jsdom are not
  installed). Testable logic lives in pure helpers instead (see Testing).

## Architecture

### Component: `app-frontend/src/components/inputs/ParcelSelect.vue`

Presentation-only. Parents map their own parcel data into `ParcelOption[]` and
pass it in; the component never fetches.

```ts
export interface ParcelOption {
  id: string | number
  stand?: string | number | null
  designation?: string | null
  areaM2?: number | null
}

// props
{
  options: ParcelOption[]
  modelValue: string | number | null
  disabled?: boolean
  placeholder?: string        // default 'Search stand or designation…'
}
// emits
'update:modelValue'           // v-model
'select'                      // (option: ParcelOption) — fired on a pick; parents
                              // use it to highlight + zoom/pan the map
```

- **Behaviour:** text input + floating filtered list; typing filters, ↑/↓ moves the
  highlight, Enter picks the highlighted row, Esc closes, clicking a row picks it.
  Picking sets the model, shows the chosen label in the input, closes the panel,
  and emits `select`.
- **Label rule:** primary = `Stand {stand}`; secondary line = designation and, if
  present, area. When `stand` and `designation` are both blank, fall back to
  `#{id}`. Mirrors the blank-name resilience added to the preview topology.
- **Empty state:** empty (or fully filtered) `options` → muted "No parcels" row;
  `disabled` → inert with placeholder.

### Pure logic (unit-tested), separate from the `.vue`

`app-frontend/src/components/inputs/parcelSelect.ts`:

- `buildParcelOptions(parcels, opts?) => ParcelOption[]`
  - Maps raw parcels `{ id, stand, designation, area_m2 }` → `ParcelOption`.
  - `opts.excludeId` drops a parcel (Diagram excludes the Outside Figure — the
    same exclusion the click fix applies).
  - Natural sort by stand number, then designation, then id.
- `filterParcelOptions(options, query) => ParcelOption[]`
  - Case-insensitive match on stand + designation; empty query → all.
- `nextHighlightIndex(current, length, direction) => number`
  - Pure keyboard-nav index math (wraps; `-1`/empty-safe).
- `labelForOption(option) => { primary: string; secondary: string }` — the label rule.

The `.vue` is a thin template binding these helpers to input/list markup.

## Data flow per stage (phased)

### Phase 1 — Diagram subject (`SurveyPlanMapView.vue`)
- In the `diagram-subject-hint` block (`:269`), add
  `<ParcelSelect :options="subjectOptions" v-model="selectedDiagramParcelId"
  @select="onSubjectPicked" />` where `subjectOptions =
  buildParcelOptions(parcels.value, { excludeId: getOutsideFigureParcel()?.id })`.
- `onSubjectPicked(option)` → `applyDiagramHighlight(option.id)` **and** fit the
  map to the parcel (build a `LngLatBounds` from
  `transformParcelGeometry(parcel.geom).geometry.coordinates[0]`, following the
  existing `fitBounds()` idiom, `:3097`).
- Map-click (already fixed) continues to write the same `selectedDiagramParcelId`,
  so click and dropdown stay in sync with **no new state**.

### Phase 2 — Parcel management (`MapLibreAreaView.vue`)
- Add a single-select `ParcelSelect` above the parcel list to jump to a parcel:
  on `@select`, highlight/zoom it on the map. Existing rename/delete/edit-vertices
  actions are unchanged.

## Error handling / edge cases

- Selected id no longer present in `options` (parcel deleted): input shows the
  placeholder; model is left as-is until the user picks again (parents already
  clear `selectedDiagramParcelId` when leaving diagram mode).
- Blank stand/designation → `#{id}` fallback (no crash, no empty rows).
- Empty `options` → "No parcels"; `disabled` → inert.
- Duplicate stand numbers across parcels are allowed; id is the source of truth.

## Testing

- `parcelSelect.ts` helpers — Vitest unit tests: option building + Outside-Figure
  exclusion, natural sort, filter matching, keyboard index wrap, label fallback.
- `.vue` template wiring — manual verification + Vite HMR (consistent with the
  repo, which unit-tests pure helpers and not `.vue` DOM).
- Regression: existing `planPayload` / `diagramSubjectPick` tests stay green.

## Rollout

Single spec, phased implementation plan. Component + Phase 1 land together (proves
the component); Phase 2 follows.

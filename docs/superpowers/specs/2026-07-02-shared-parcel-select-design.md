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

We want one reusable, in-house picker used across the stages that need parcel
selection, supporting both single- and multi-select.

## Goals

- A single presentation-only component `inputs/ParcelSelect.vue` with a `v-model`
  API, built from the existing in-house idioms (`inputs/LayerSelect.vue`,
  `ControlPointSelector.vue`, `SmartSuggestionDropdown.vue`, the `Areas2View`
  keyboard-nav autocomplete). **No new third-party dependency.**
- Searchable, keyboard-navigable (↑/↓/Enter/Esc).
- Single-select (combobox) and multi-select (checklist + chips) modes.
- Map-agnostic: never touches MapLibre. Parents react to selection.
- Wired into three stages, phased: Diagram → Parcel management → Merge.

## Non-goals (YAGNI)

- `AreaComputationView` — it constructs *new* parcels from points; it is not an
  existing-parcel picker. Out of scope.
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
  modelValue: (string | number) | (string | number)[] | null  // array when multiple
  multiple?: boolean          // default false
  disabled?: boolean
  placeholder?: string        // default 'Search stand or designation…'
}
// emits
'update:modelValue'           // v-model
'select'                      // (option: ParcelOption) — fired on a single pick;
                              // parents use it to highlight + zoom/pan the map
```

- **Single mode:** text input + floating filtered list; picking sets the model,
  closes the panel, and emits `select`.
- **Multiple mode:** same search box; list rows show a checkmark when selected;
  selected parcels render as a chips row with an "N selected" count and per-chip
  remove (×). Picking toggles membership and keeps the panel open. `select` is
  not required by multi consumers but is still emitted on each toggle-on.
- **Label rule:** primary = `Stand {stand}`; secondary line = designation and, if
  present, area (`formatAreaValue`-style). When `stand` and `designation` are both
  blank, fall back to `#{id}`. This mirrors the blank-name resilience added to the
  preview topology.
- **Empty state:** when `options` is empty (or all filtered out), show a muted
  "No parcels" row; when `disabled`, the control is inert with the placeholder.

### Pure logic (unit-tested), separate from the `.vue`

`app-frontend/src/components/inputs/parcelSelect.ts`:

- `buildParcelOptions(parcels, opts?) => ParcelOption[]`
  - Maps raw parcels `{ id, stand, designation, area_m2 }` → `ParcelOption`.
  - `opts.excludeId` drops a parcel (used by Diagram to exclude the Outside
    Figure — the same exclusion the click fix applies).
  - Natural sort by stand number, then designation, then id.
- `filterParcelOptions(options, query) => ParcelOption[]`
  - Case-insensitive match on stand + designation; empty query → all.
- `nextHighlightIndex(current, length, direction) => number`
  - Pure keyboard-nav index math (wraps; `-1`/empty-safe).
- `labelForOption(option) => { primary, secondary }` — the label rule above.

The `.vue` is a thin template binding these helpers to input/list/chips markup.

## Data flow per stage (phased)

### Phase 1 — Diagram subject (`SurveyPlanMapView.vue`)
- In the `diagram-subject-hint` block (`:269`), add
  `<ParcelSelect :options="subjectOptions" v-model="selectedDiagramParcelId"
  @select="onSubjectPicked" />` where `subjectOptions =
  buildParcelOptions(parcels.value, { excludeId: getOutsideFigureParcel()?.id })`.
- `onSubjectPicked(option)` → `applyDiagramHighlight(option.id)` **and** pan/zoom
  the map to the parcel (fit to its bounds).
- Map-click (already fixed) continues to write the same `selectedDiagramParcelId`,
  so click and dropdown stay in sync with **no new state**.

### Phase 2 — Parcel management (`MapLibreAreaView.vue`)
- Add a single-select `ParcelSelect` above the parcel list to jump to a parcel:
  on `@select`, scroll the list to that parcel and highlight/zoom it on the map.
- Existing rename/delete/edit-vertices actions are unchanged.

### Phase 3 — Merge analysis (`MergeAnalysisDialog.vue`)
- Use `multiple` mode to choose the set of parcels to merge, replacing/augmenting
  the current per-parcel selection with the shared chips+checklist UI. Existing
  merge-action logic downstream consumes the selected id array.

## Error handling / edge cases

- Selected id no longer present in `options` (parcel deleted/removed): single mode
  clears to `null`; multi mode drops missing ids from the model on next change.
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

Single spec, phased implementation plan. Each phase is independently reviewable
and shippable. Component + Phase 1 land together (proves the component); Phases 2
and 3 follow.

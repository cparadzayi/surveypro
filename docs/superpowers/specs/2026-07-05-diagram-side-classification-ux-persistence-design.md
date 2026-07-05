# Diagram Side-Classification — Modal UX + Persistence (B refinement)

**Status:** Approved (design phase)
**Date:** 2026-07-05
**Author:** cparadzayi (with Claude)

## Problem / context

Sub-project B (merged `ab30490`) lets the surveyor click a subject boundary side and
classify it (contiguous / road / servitude) into `metadata.sideAnnotations`. Live testing
found two problems:
1. **Fiddly UX:** the classifier is a small floating panel at the click point, and the
   thin (4 px) side line is hard to hit.
2. **Not persistent:** classifications live in a local ref that resets on subject change
   and is lost on reload; the surveyor must re-classify every time.

## Scope

Frontend only (`SurveyPlanMapView.vue` + the existing `sideAnnotations.ts` pure module).
The backend already stores per-step workflow state and the diagram renderer already
consumes `metadata.sideAnnotations` — both unchanged.

**In scope:** a centered modal classifier; a wide transparent hit-line + hover cursor for
easy clicking; per-subject persistence saved to the `survey-plan` workflow step on each
Save/Clear, hydrated on load.

**Non-goals (YAGNI):** any backend route change (the `update` workflow action already
merges); DXF; cross-project sharing of classifications.

## Persistence storage

Per-subject map, stored in the `survey-plan` step's data:
`step_data['survey-plan'].sideAnnotations = { [subjectParcelId: string]: SideAnnotation[] }`.
Saved via the existing `PATCH /survey-projects/:id/workflow` with
`{ step:'survey-plan', action:'update', metadata:{ sideAnnotations: <map> } }` — the
`update` action does `step_data[step] = { ...step_data[step], ...metadata }`, so it merges
and never clobbers other survey-plan data.

## Design

### 1. Pure helpers (add to `sideAnnotations.ts`)
```ts
export function annotationsForSubject(map: Record<string, SideAnnotation[]>, subjectId: string | number | null): SideAnnotation[]
export function withSubjectAnnotations(map: Record<string, SideAnnotation[]>, subjectId: string | number, list: SideAnnotation[]): Record<string, SideAnnotation[]>
export function hydrateAnnotationsMap(raw: unknown): Record<string, SideAnnotation[]>
```
- `annotationsForSubject` → `map[String(subjectId)] ?? []` (null id → `[]`).
- `withSubjectAnnotations` → new map with `String(subjectId)` set to `list` (immutable).
- `hydrateAnnotationsMap` → defensively coerce a loaded value into a `Record<string, SideAnnotation[]>` (drop non-array entries; `{}` if not an object).

### 2. `SurveyPlanMapView.vue` — state
- Replace the single `sideAnnotations` ref with
  `sideAnnotationsBySubject = ref<Record<string, SideAnnotation[]>>({})` and a computed
  `currentSideAnnotations = computed(() => annotationsForSubject(sideAnnotationsBySubject.value, selectedDiagramParcelId.value))`.
- `watch(selectedDiagramParcelId, …)` **no longer resets** — it just closes the modal and
  calls `updateSubjectSidesLayer()` (which now reads `currentSideAnnotations`).

### 3. Easy clicking — hit layer + hover
`updateSubjectSidesLayer` adds a third layer `diagram-subject-sides-hit`: `type:'line'`,
`line-width: 14`, `line-opacity: 0`, no role filter (covers every side). The visible
`-solid` / `-dashed` colour layers stay. Clicks and hover query `-hit`. On first creation,
register `map.on('mouseenter', 'diagram-subject-sides-hit', …)` → canvas cursor `'pointer'`
and `mouseleave` → `''`.

### 4. Click → open modal
In `onMapClickSelectParcel`, query `['diagram-subject-sides-hit']` first; a hit sets
`activeSideEditor = { side, role, label, widthM }` (pre-filled from `currentSideAnnotations`)
— **no x/y** (the modal is centered). Miss → existing subject selection.

### 5. Centered modal (replaces the floating panel)
A backdrop overlay + centered card, `v-if="activeSideEditor"`, at the root of the
component template (fixed positioning, high z-index): side header, **role** `<select>`,
**label** `<input>`, **width (m)** `<input>` (servitude only), **Save / Clear / Cancel**.
Backdrop click or Cancel → `activeSideEditor = null` (no save).

### 6. Save/Clear → update map + persist
- `saveSideEditor`: `list = upsertAnnotation(currentSideAnnotations.value, ann)`;
  `sideAnnotationsBySubject.value = withSubjectAnnotations(sideAnnotationsBySubject.value, selectedDiagramParcelId.value, list)`; close; `updateSubjectSidesLayer()`; `persistSideAnnotations()`.
- `clearSideEditor`: same with `removeAnnotation`.
- `persistSideAnnotations()`: `await api.patch('/survey-projects/${props.projectId}/workflow', { step:'survey-plan', action:'update', metadata:{ sideAnnotations: sideAnnotationsBySubject.value } })`; on failure `console.warn` (do not block the UI).

### 7. Hydrate on load
In the existing workflow-load block (where `api.get('/survey-projects/:id/workflow')` is
read), set
`sideAnnotationsBySubject.value = hydrateAnnotationsMap(workflowState?.step_data?.['survey-plan']?.sideAnnotations)`.

### 8. Payload
`buildDiagramPayload`'s `metadata.sideAnnotations` → `currentSideAnnotations.value` (the
selected subject's list), not the whole map.

## Error handling / edge cases
- No subject selected → `currentSideAnnotations` is `[]`; no sides layer.
- `persistSideAnnotations` failure → warn, keep the in-memory change (next Save retries).
- Loading a project with no saved annotations → `hydrateAnnotationsMap(undefined)` = `{}`.
- Switching subject with unsaved modal open → the watcher closes the modal.

## Testing
- **`sideAnnotations.test.ts` (Vitest), add:** `annotationsForSubject` (present / missing /
  null id); `withSubjectAnnotations` (immutable set, replaces key); `hydrateAnnotationsMap`
  (valid map passes; non-object → `{}`; non-array entries dropped).
- **`.vue` (modal, hit layer, hover, persist, hydrate):** `npm run build` + manual:
  classify sides via the centered modal, confirm easy clicking + hover cursor, reload the
  project and confirm the classifications persist, switch subjects and confirm each keeps
  its own set, generate and confirm the strips render.

## Rollout
Single spec → single plan. Order: `sideAnnotations.ts` helpers (TDD) →
`SurveyPlanMapView.vue` state/hit-layer/modal/persist/hydrate → build + manual.

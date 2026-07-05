# Diagram Side-Classification UI — Design (Sub-project B)

**Status:** Approved (design phase)
**Date:** 2026-07-05
**Author:** cparadzayi (with Claude)

## Problem / context

Sub-project A shipped the diagram renderer that draws adjoining features (roads =
burnt-sienna, servitudes = blue, contiguous = dashed) from a per-side contract
`metadata.sideAnnotations` (`{ side, role, label?, widthM? }[]`; see
`2026-07-05-diagram-adjoining-features-renderer-design.md` and memory
`diagram-adjoining-features`). Nothing **produces** that array yet.

Sub-project B builds the **interactive map UI**: in the diagram map view, after the
surveyor selects the subject parcel, they **click a boundary side** and classify it
(contiguous / road / servitude, with a label and — for servitudes — a width). The
classifications become `sideAnnotations`, sent in the generate payload's `metadata`.

## Scope

- Frontend only (`SurveyPlanMapView.vue` + one new pure module). The backend renderer is
  done and unchanged.
- **In scope:** derive the subject's clickable sides; a side-layer with per-role
  colouring; click-a-side → classification popup; keep `sideAnnotations` state; include it
  in the payload.
- **Non-goals (YAGNI):** auto-population from a future cadastral base layer; a "select
  subject vs classify" mode toggle (not needed — see Interaction); DXF; any backend change.

## Consistency invariant (the key correctness point)

The backend assigns side letters (`A,B,C…`, then `AA,AB…`) by **ring index** of the
subject's `geometry.coordinates[0]` after dropping the closing duplicate
(`deriveSubjectGeometry`). The frontend sends that exact ring, so the frontend derives
sides by the **same index→letter rule**, guaranteeing a frontend `side:'AB'` is the same
edge the renderer resolves. Coordinate normalization changes point *values*, not ring
*order*, so it does not affect letters.

## Components

### New pure module `app-frontend/src/views/modules/cadastral-standard/sideAnnotations.ts`
```ts
export type SideRole = 'contiguous' | 'road' | 'servitude'
export interface SideAnnotation { side: string; role: SideRole; label?: string; widthM?: number }
export interface SubjectSide { side: string; from: string; to: string; a: [number, number]; b: [number, number] }

// A..Z then AA, AB… — mirrors the backend letterAt().
export function letterAt(i: number): string

// Ring (any coord space; closing duplicate optional) → one entry per edge, letters by
// ring index. `a`/`b` carry the input ring's coordinates so the caller can pass a
// WGS84-transformed ring for the map layer.
export function subjectSides(ring: [number, number][]): SubjectSide[]

// Array edits keyed by `side` (immutably returns a new array).
export function upsertAnnotation(list: SideAnnotation[], ann: SideAnnotation): SideAnnotation[]
export function removeAnnotation(list: SideAnnotation[], side: string): SideAnnotation[]
```

### `SurveyPlanMapView.vue` changes
- **State:** `sideAnnotations = ref<SideAnnotation[]>([])`; a `watch(selectedDiagramParcelId, …)` **resets it to `[]`** on subject change (annotations are per subject).
- **Sides layer:** when a subject is selected in diagram mode, build a GeoJSON source
  `diagram-subject-sides` — one `LineString` feature per side, `properties.side` +
  `properties.role` (role from the current `sideAnnotations`, else `''`). Rebuilt when the
  subject or `sideAnnotations` changes. Uses the subject's **WGS84** ring (existing
  parcel transform) → `subjectSides(wgs84Ring)`.
- **Per-role colouring** (data-driven paint), reusing sub-project A's shades: `line-color`
  via `['match', ['get','role'], 'road', '#B7410E', 'servitude', '#1F6FB2', 'contiguous',
  '#000000', /* unannotated */ '#9aa0a6']`; `line-dasharray` for contiguous + unannotated,
  solid for road/servitude; a clickable line width (~4 px) so thin edges are easy to hit.
- **Click handling (no toggle):** extend `onMapClickSelectParcel` — first
  `map.queryRenderedFeatures(e.point, { layers: ['diagram-subject-sides'] })`; a hit opens
  the classification popup for that `side`; a miss falls through to the existing
  parcel-fill subject selection. The sides layer sits on top, so it takes click priority.
- **Classification popup:** a small floating Vue panel positioned at the click
  (`activeSideEditor = ref<{ side, x, y } | null>`, `x/y` from `e.point`), pre-filled from
  the side's current annotation. Fields: **role** `<select>` (contiguous/road/servitude),
  **label** `<input>`, **width (m)** `<input type=number>` shown only when
  role==='servitude'. Buttons: **Save** → `sideAnnotations = upsertAnnotation(list, {side, role, label, widthM})` then close + refresh the sides source; **Clear** →
  `removeAnnotation(list, side)` then close + refresh; clicking outside closes without
  change.
- **Payload:** in `buildDiagramPayload`'s `metadata` object, add
  `sideAnnotations: sideAnnotations.value`.

## Error handling / edge cases
- No subject selected → no sides layer, no annotations (diagram still generates).
- Servitude saved without a positive width → allowed (the renderer already labels-only +
  warns); the width input is optional.
- Changing the subject clears annotations (they reference the old subject's sides).
- Degenerate subject (<3 vertices) → `subjectSides` returns `[]`; nothing clickable.

## Testing
- **`sideAnnotations.test.ts` (Vitest):**
  - `subjectSides`: a closed square ring `[[0,0],[0,10],[10,10],[10,0],[0,0]]` → four sides
    `AB,BC,CD,DA` with the right endpoints; the closing duplicate is dropped; an open ring
    (no closing dup) gives the same; `letterAt(26)==='AA'`.
  - `upsertAnnotation`: adds a new side; replaces the entry for an existing side (no
    duplicates); returns a new array. `removeAnnotation`: drops the matching side, leaves
    others.
- **`.vue` wiring:** verified by `npm run build` (frontend has no DOM test infra) + manual:
  select a subject, click each side, classify road/servitude(+width)/contiguous, confirm
  per-role colouring on the map, generate → the saved diagram shows the burnt-sienna road
  strip / blue servitude / dashed contiguous with labels (end-to-end with A).

## Rollout
Single spec → single plan. Order: `sideAnnotations.ts` pure module (TDD) →
`SurveyPlanMapView.vue` sides layer + click + popup + payload → build + manual end-to-end
with the sub-project A renderer.

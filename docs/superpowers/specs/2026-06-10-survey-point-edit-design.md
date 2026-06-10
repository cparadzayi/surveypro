# Survey-Point Edit in the Area & Consistency Module — Design

**Date:** 2026-06-10
**Status:** Draft (pending user review)
**Module:** `cadastral-standard` / `MapLibreAreaView`
**Component touched primarily:** `PointRenamePanel.vue`

## Goal

In the Area & Consistency view (`MapLibreAreaView.vue`), surveyors already have a
"Edit Point Names" panel that lets them search and rename survey points. Extend
that panel so the surveyor can also, from the same UI:

- Edit a point's coordinates (Y, X).
- Edit a point's description.
- Delete a point.

All four actions (rename, edit coords, edit description, delete) flow through
the same point-card click → modal interaction. The search box already in the
panel covers the "search by name" requirement; no new search UI is added.

## Scope decisions (already settled with the user)

- **Affected-parcels gate.** Before any name/coordinate/delete action, the user
  must see a list of parcels that reference the point and explicitly confirm.
  Description-only edits skip the gate (no cadastral impact).
- **Description column.** Already exists on `coordinate_points` (migration
  `017.do.sql`). No migration needed.
- **TRIG points are read-only** in this UI. Search still finds them; their
  cards display a "🔒 TRIG" badge and the click handler is a no-op.
- **Modal layout.** All four fields and the Delete button are visible at once
  (no expand-collapse or tabs).
- **Cross-module sync.** Persist + reload on view enter. The edit writes the
  source of truth (`coordinate_points` row) and the workflow snapshot
  (`step_data['calculations-part1'].adjusted_coordinates`); other views
  refetch from those sources when the surveyor navigates to them. No global
  event bus, no full-page reload. See *Cross-module sync* below for the audit
  and what concretely changes.

## What does not change

- The point-card grid, the search input, the "✓ renamed" badge styling, and the
  open/close mechanics of the panel.
- Backend endpoints. `PUT /coordinate-points/:id` and `DELETE /coordinate-points/:id`
  already support every field this UI needs.
- Frontend service layer. `updateCoordinatePoint`, `deleteCoordinatePoint`, and
  `listLandParcels` in `app-frontend/src/services/spatial.ts` are already
  wired and used elsewhere.
- The Area & Consistency PDF generation pipeline.

## UI

The edit modal that opens when a point card is clicked grows from a name-only
form into a single panel with these fields, in this order:

```
┌─ Edit Point ──────────────────┐
│ Name      [BCN-12     ]       │
│ Y (north) [123456.789 ]       │
│ X (east)  [9876543.210]       │
│ Description                   │
│ [Stone beacon, NE corner...]  │
│                               │
│ [🗑 Delete]      [Cancel][Save]│
└───────────────────────────────┘
```

Field rules:

- **Name.** Validated as today (non-empty, no duplicate within the project).
- **Y / X.** Numeric inputs. Step `0.001`. Empty input is invalid.
- **Description.** Textarea (3 rows). Blank is allowed (NULL on the backend).
- **Save** is enabled only when at least one field differs from the original
  point and no validation error is present.
- **Delete** is always enabled (subject to the affected-parcels gate). Styled
  red, bottom-left, separated from the Cancel/Save cluster.

Cards in the grid get one new state: when `point.status === 'TRIG'`, the card
shows a "🔒 TRIG" pill instead of the "✏️ edit" hint and the click handler
short-circuits. The search filter still includes TRIG cards.

## Data flow

The panel is dumb about parcels. It collects user intent and emits it; the
parent (`MapLibreAreaView`) does the cadastral bookkeeping.

1. User edits fields and clicks **Save** → panel calls
   `props.editHandler(oldName, patch)` where `patch` is
   `{ name?, y?, x?, description? }` with only the changed fields.
2. User clicks **Delete** → panel calls `props.deleteHandler(name)`.
3. The handler in `MapLibreAreaView` proceeds as follows:

   a. **Classify the change.** A patch that contains only `description` is
      *non-destructive*. Anything else, plus every delete, is *destructive*.

   b. **Destructive → look up affected parcels.** Fetch `listLandParcels(projectId)`,
      filter to those whose `metadata.cape_lo_points` array contains an entry
      with `id === oldName`. Collect `{ id, stand, designation }`.

   c. **Destructive with ≥1 affected parcel → confirm.** Open a modal listing
      the parcels (stand and designation, scrollable if long) with **Proceed**
      and **Cancel** buttons. On Cancel, reject the handler's promise so the
      panel keeps its modal open with the user's edits intact.

   d. **Destructive with 0 affected parcels → no confirm.** Skip straight to the
      API call.

   e. **Non-destructive → no confirm.** Skip straight to the API call.

   f. **API call.** `updateCoordinatePoint(point.id, patch)` for edits,
      `deleteCoordinatePoint(point.id)` for delete.

   g. **Destructive → recompute.** Call the existing `recomputeAllParcels`
      after a successful destructive change. Non-destructive changes skip this.

   h. **Local state sync.** Mirror the existing `handlePointRename` pattern:
      on rename, walk `workflowState.adjustedCoordinates` and
      `workflowState.importedPoints` and replace the matching entries with new
      objects (mutating in place does not trigger Vue reactivity). For
      coordinate changes, also update `y`/`x` on the same objects. For deletes,
      filter the entries out. Persist back to the `calculations-part1` step via
      the same `api.patch('/survey-projects/:id/workflow', ...)` call already
      used for rename.

4. After the handler resolves, the panel closes the modal, marks the row's
   `saved` flag (for the green "✓ saved" badge), and clears it after 4s — the
   same UX pattern used by today's rename success.

## Affected-parcels confirm dialog

Lives in `MapLibreAreaView.vue` alongside the existing rename and beacon
modals. Reuses the same Teleport-to-body + backdrop pattern as the
`mapRenameModal` (lines 696–810 in `MapLibreAreaView.vue`).

Content:

```
┌─ Affect parcels? ─────────────────────────┐
│ The point "BCN-12" is used by 3 parcels:  │
│                                           │
│   • 12345 — Stand 12345                   │
│   • 12346 — Stand 12346                   │
│   • 12347 — Stand 12347                   │
│                                           │
│ Proceeding will:                          │
│   • Apply your change to the point.       │
│   • Re-run parcel computation             │
│     so the affected parcels pick up       │
│     the new beacon coordinates.           │
│                                           │
│              [Cancel]    [Proceed]        │
└───────────────────────────────────────────┘
```

The dialog text is rendered from a small state object held in
`MapLibreAreaView`: `affectedParcelsConfirm = { pointName, parcels: [...],
intent: 'edit' | 'delete', resolve, reject }`. Proceed → `resolve()`; Cancel →
`reject(new Error('cancelled'))`. The handler catches `'cancelled'` quietly so
the panel's modal stays open without a red error banner.

## Component contract change

`PointRenamePanel.vue` props transform:

- `renameHandler: (oldName: string, newName: string) => Promise<void>`
  becomes
  `editHandler: (oldName: string, patch: { name?: string; y?: number; x?: number; description?: string }) => Promise<void>`.
- New prop `deleteHandler: (name: string) => Promise<void>`.
- The `'rename-complete'` emit is renamed to `'edit-complete'` with payload
  `{ oldName, patch }` so the parent can refresh derived state uniformly. The
  `'close'` emit is unchanged.
- The parent's existing `handleRenameComplete` is renamed to
  `handleEditComplete` to match.

There is no backwards-compat shim. The single consumer (`MapLibreAreaView`) is
updated in the same PR.

## Cross-module sync

Two layers of state cache survey points across the cadastral-standard module:

1. **The database** (`coordinate_points` rows + `land_parcels.metadata`).
2. **The workflow snapshot** (`survey_projects.step_data['calculations-part1']
   .adjusted_coordinates` plus `imported_points`). Views read this via the
   injected `workflowState` reactive object.

The edit handler updates both, so the next time any view reads either it gets
the new state. No client-side broadcast is required.

**Audit of views that consume point data:**

| View                    | How points are read on mount                                  | Action |
|-------------------------|---------------------------------------------------------------|--------|
| `MapLibreAreaView`      | `coordinatePoints` computed over `workflowState.adjustedCoordinates` | The edit happens here; local computed refreshes when we mutate `workflowState.adjustedCoordinates` (proven by the existing rename path). |
| `SurveyPlanMapView`     | `onMounted` → `listCoordinatePoints(projectId)`               | No change. Already refetches on entry. |
| `QGISExportView`        | `onMounted` → reads `workflowState.adjustedCoordinates`, falls back to `listCoordinatePoints` | No change. Workflow snapshot reflects our edit; DB fallback would too. |
| `FoundBeaconsView`      | `onMounted` → `listCoordinatePoints(projectId)`               | No change. |
| `AreaComputationView`   | `onMounted` → reads `workflowState.adjustedCoordinates` only  | Verify during implementation that the injected `workflowState` is the same reactive instance shared across the module (it is, by injection contract). If so, no change. If a snapshot copy is taken on mount, swap to refetching from `workflowState` on enter. |

**What the edit handler must do beyond the existing rename path:**

- On Y/X change → also update the `y` and `x` fields on the matching entry in
  `workflowState.adjustedCoordinates` and `workflowState.importedPoints`,
  using the same object-replacement pattern (don't mutate in place).
- On description change → update the `description` field on the same entries.
- On delete → filter the entry out of both arrays.
- Persist the resulting arrays back to `step_data['calculations-part1']` via
  the same `api.patch('/survey-projects/:id/workflow', ...)` call, with an
  audit breadcrumb (`point_edit` or `point_delete`) mirroring today's
  `point_rename` breadcrumb shape.

This means the cross-module guarantee is: **after a successful edit/delete in
the Area view, the next time the surveyor opens any other cadastral-standard
view, that view sees the new state.** It does not guarantee real-time sync
between two views open simultaneously — that case is rare in this app
(single-pane UI) and was not requested.

## Files touched

- `app-frontend/src/components/cadastral/PointRenamePanel.vue` — extend modal
  fields, add delete button, add TRIG read-only state, rename handler prop.
- `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` —
  widen `renamePanelHandler` to a full edit handler, add a delete handler, add
  the affected-parcels confirm modal + state, wire `recomputeAllParcels` after
  destructive changes.

No new files. No backend or service-layer changes.

## Validation & error surfaces

- **Duplicate name** on save — surfaced inline in the modal's name field, same
  red-border pattern as the current rename validation.
- **Empty Y/X** — inline error under the offending field; Save disabled.
- **Backend rejection** (e.g. constraint violation) — the panel's existing
  catch path sets `modalError`; we keep that behaviour for the unified handler.
- **Affected-parcels lookup failure** (e.g. network) — show a toast/banner from
  `MapLibreAreaView`, do not proceed with the change, keep the panel modal
  open.

## Acceptance criteria

1. Searching for a point in the panel still works exactly as today.
2. Clicking a non-TRIG point opens the new modal with all current values
   pre-filled.
3. Editing only the description, saving, succeeds without showing the
   affected-parcels dialog and without triggering recompute.
4. Editing Y/X (or name) and clicking Save:
   - Shows the affected-parcels dialog if any parcels reference the point.
   - Cancelling the dialog leaves the panel modal open with edits intact.
   - Proceeding applies the change, triggers `recomputeAllParcels`, closes the
     modal, and marks the row "✓ saved".
5. Deleting a point follows the same affected-parcels flow and removes the
   point from the grid on success.
6. TRIG cards show the lock badge and do not open the modal on click.
7. After any successful destructive change, the page reflects the new state
   without a manual refresh (existing reactivity patterns suffice; no extra
   refetch is added).

## Out of scope

- Multi-point bulk edit / bulk delete.
- Undo/redo for point edits.
- Audit log of who edited what (the rename path already writes a
  `point_rename` breadcrumb to `step_data`; we'll extend it to
  `point_edit` / `point_delete` mirroring the existing shape, but no new
  surface).
- Editing TRIG points.
- Real-time sync between two cadastral-standard views open in separate
  browser tabs at the same instant. The single-pane navigation pattern this
  module uses makes that case effectively impossible, and the cross-module
  sync described above covers every realistic flow.

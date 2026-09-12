# Parcel Vertex Drag-to-Snap Editing — Design

**Date:** 2026-09-10
**Status:** Approved for planning — amended 2026-09-12, see below
**Module:** `cadastral-standard` / `MapLibreAreaView`

## Amendment — 2026-09-12: the two flows coexist, the old one is not replaced

**This reverses the "replaced, not supplemented" decision below.** User-directed,
after the shipped feature was used: not a defect in what was built, a wrong call
about what it could stand in for.

Drag-to-snap can only **re-reference** a vertex the parcel already has, to another
point that already exists — decision 1 below makes that exact and is unchanged. It
can neither **add** a vertex to a parcel nor **remove** one. The click-to-insert flow
is the only UI that can, so retiring it removed the ability to change a parcel's
vertex count at all. Part 4 acknowledged this ("the only UI for dropping a vertex
from a saved parcel") and accepted it; that acceptance was wrong.

The two flows now divide the work:

| Flow | Entry | What it does |
|---|---|---|
| Click-to-insert vertex editing | the 🔺 buttons on a parcel card | adds a vertex (append or insert at a position) and removes one |
| Drag-to-snap | click the parcel on the map, drag a marker | re-references one vertex to another existing point, cascading to every parcel that shared the beacon |

**What this amendment changes in the text below:**

- **Problem**, last paragraph — "The click-to-insert flow is **replaced**, not
  supplemented" no longer holds. It is kept, and supplemented.
- **Part 4 — What is retired** — no longer applies. Nothing in it is retired:
  `startEditingVertices`, `cancelVertexEdit`, `removeVertexByIndex`,
  `commitVertexEdit`, the five pieces of state, the toolbar panel, the mode banner
  branches, the 🔺 buttons, and `handlePointClick`'s insert branch all stay. So does
  the `isInsertingMidSequence` carve-out: its reason — `wouldCreateIntersection`
  tests an append and false-positives on a mid-sequence insertion — applies again the
  moment `handlePointClick` can insert again.
- **Out of scope**, "Adding or removing a vertex from a saved parcel without deleting
  the beacon" — that is in scope and is what the kept flow does.
- **Decision 8** (`isDrawing` is not reused) stands for the *new* flow, which has its
  own state and never sets `isDrawing`. The kept flow still sets it, as it always did.

**Mutual exclusion** (the one new decision, not in the original): `isDrawing` is the
switch between the two editors. Click-to-insert sets it (to reuse `handlePointClick`
and Undo), and every drag-to-snap entry point — the `parcels-fill` click, the
`vertices-circle` `mousedown`/`touchstart`, `beginVertexDrag` — refuses while it is
true. `exitVertexDragMode()` is the other half: `startDrawing` and
`startEditingVertices` both call it, cancelling any drag in flight and clearing the
parcel selection, so no selection, no vertex markers and no half-finished drag survive
into a mode that does not own them. A drag cancelled that way writes nothing, so the
all-or-nothing cascade invariant is untouched.

Implemented in `118df52`, on top of the Task 6 deletion `ad8d0a2` rather than by
rewriting it — the history of the retirement stays readable.

## Problem

When a surveyor spots a mistake in an area/consistency polygon — a corner pegged to
the wrong beacon — the only repair today is to open the parcel's vertex list and
*click beacons to append or insert*, then delete the wrong one. That flow cannot
express the actual intent ("this corner belongs on **that** peg"), it cannot keep an
adjoining parcel's boundary coincident, and it recomputes only the parcel that was
clicked.

We want: click the parcel → grab the offending vertex marker → drag it → it snaps to
an existing point → every parcel that shared that beacon moves with it, and all of
them are recomputed and persisted. The click-to-insert flow is **replaced**, not
supplemented.

## Context (as-found)

- **Surface.** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
  (6923 lines). `AreaComputationView.vue` (Leaflet) is deprecated and is not touched.
- **The flow being replaced** — four functions plus a toolbar panel:
  - `startEditingVertices(designation)` (`MapLibreAreaView.vue:4370`) loads
    `metadata.cape_lo_points` into `selectedPoints`, sets `isEditingVertices` **and
    `isDrawing = true`** (`:4408`) so the drawing-mode click handler is reused.
  - `handlePointClick(point)` (`:3711`) appends, or inserts at
    `insertAfterIndex + 1` (`:3740`). It rejects a repeated vertex (`:3721`) and
    self-intersections — with an explicit carve-out (`:3730-3737`) because the
    intersection test assumes an append and false-positives on insertion. That
    carve-out exists only because the two modes share one handler.
  - `removeVertexByIndex(idx)` (`:4435`), `cancelVertexEdit()` (`:4420`).
  - `commitVertexEdit()` (`:4443`): `areaCompute` (`:4466`) → closure error (`:4473`)
    → Cape Lo ring (`:4478`) → `closure_ratio` (`:4487`) → `updateLandParcel(dbId,
    { geom, metadata })` (`:4506`) → `refreshParcelsFromDatabase()` (`:4514`).
    **Single parcel only.**
  - Toolbar panel at `:146-210`; entry buttons at `:417` and `:489`.
- **The multi-parcel machinery already exists**, built for the 2026-06-10 point-edit
  work (`docs/superpowers/specs/2026-06-10-survey-point-edit-design.md`):
  - `findAffectedParcels(pointName)` (`:1253`) fetches `listLandParcels(projectId)`
    and returns every parcel whose `metadata.cape_lo_points` contains an entry with
    `id === pointName`.
  - `requireAffectedParcelsConfirm(pointName, intent)` (`:1273`) + the confirm modal
    (template `:834-860`, state `:1032`) — resolve/reject promise pair; Cancel
    rejects with `'cancelled'`.
  - `rebuildAffectedParcels(affected, mutation)` (`:4717`) substitutes or removes the
    named point in each parcel's `cape_lo_points`, re-runs `areaCompute` (`:4756`),
    rebuilds the ring and metadata, `updateLandParcel` (`:4793`), then one
    `refreshParcelsFromDatabase()` (`:4800`). Its body is `commitVertexEdit`'s body
    with a loop around it — the duplication is verbatim down to the `|| 0.001`
    closure-error floor.
  - Two hazards in that loop, both inherited if we reuse it naively: it resolves each
    parcel through `savedParcels.value.get(af.designation)` and **silently `continue`s**
    when the key misses (`:4730`), and `savedParcels` is keyed `designation || stand`
    at `:4193` but `stand || designation` at `:5598`, while `findAffectedParcels`
    uses `designation ?? stand` (`:1266`). Per-parcel failures are `console.error`ed
    and swallowed (`:4795`).
- **Vertex identity.** `Parcel.points[].id` (`composables/useAreaCompliance.ts:17`) is
  a **string** and holds the coordinate point's `name`, not its numeric row id:
  `CoordinatePoint` is `{ id: number, name: string, y, x, ... }`
  (`services/spatial.ts:134`), and the view normalises with `id: p.name` (`:1633`,
  comment at `:1631`). The numeric id is kept separately in `dbPointIds`
  (name → id, `:949`, `:957`). Names are unique per project — `ON CONFLICT
  (project_id, name)` (`app-backend/src/models/coordinatePoint.js:200`) and the rename
  endpoint's 409 (`routes/coordinatePoints.js:139`). **So "shared beacon" = the same
  name appearing in more than one parcel's `cape_lo_points`**, which is exactly what
  `findAffectedParcels` already tests.
- **Stale names are a real condition.** `repairParcelBeaconNames()` (`:1604`) exists
  because `cape_lo_points` entries can reference names no longer in
  `coordinate_points`; it re-matches by coordinate proximity at 0.5 m.
- **Rendering.** Parcels: source `parcels` + layers `parcels-fill` (`:2505`),
  `parcels-outline` (`:2521`), `parcels-labels` (`:2538`). Points: `survey-pegs`
  circles (`:3141`) and `trig-beacons` symbols (`:3121`), fed by `addSurveyPoints`
  (`:3039`). **There is no click handler on `parcels-fill` and no parcel-selection
  state anywhere in the file** — both are new. Preview line: `temp-polygon` /
  `updateTempPolygon` (`:4928`).
- **No drag code exists anywhere in the frontend.** The only `mousedown`/`mousemove`
  hits are `@mousedown.prevent` in two dropdowns and a Leaflet cursor readout
  (`components/maps/DataMap.vue:1508`); the one draggable UI is an HTML5 row reorder
  in `lite/areas2/Areas2View.vue:127`. MapLibre GL has no vertex-drag primitive.
- **CRS.** Geometry is stored in the project's native Lo zone; the map is WGS84.
  `capeLoArrayToWGS84` (`utils/coordinateTransform.ts:116`) converts for display with
  `workflowState.projectInfo.centralMeridian` (`:2226`, `:4330`, `:4937`);
  `wgs84ToCape` (`utils/geodeticTransform.ts:202`) is the inverse. The save path is
  deliberately round-trip-free ("LOSSLESS DATA FLOW", `:4539`).
- **Backend.** `PUT /land-parcels/:id` (`app-backend/src/routes/landParcels.js:259`)
  → `LandParcel.update` (`models/landParcel.js:97`), which re-derives the SRID from
  the project's central meridian (`:113-122`) and ignores the GeoJSON `crs` member
  the frontend attaches — so the hardcoded `EPSG:22291` at `:4483`/`:4772` is inert.
  `PUT /coordinate-points/:id` (`routes/coordinatePoints.js:163`) updates
  name/y/x/elevation/description/survey_date/surveyor. `metadata` is plain `jsonb`
  (`migrations/029.do.sql:30`; per-surveyor table `migrations/040.do.sql:117`) —
  `cape_lo_points` is an application convention, not a column.
- **Snap-adjacent utility.** `utils/beaconNameMatch.ts` — `findBeaconNameBySpatialMatch`
  returns the **first** point under 2 m, not the nearest (`beaconNameMatch.ts:20`),
  and returns only a name. Usable for "does this vertex still resolve to a live
  beacon", not as the snap search.
- **Testing.** Vitest (`app-frontend/package.json:11`), no `@vue/test-utils`. The
  convention is to extract logic into a plain `.ts` and test that —
  `components/inputs/ParcelSelect.vue` + `parcelSelect.ts`, as cited in
  `docs/superpowers/specs/2026-09-10-record-composition-design.md`.

## Decisions

Recorded because each rules out an approach that looked reasonable.

1. **A drag is a re-reference, never a coordinate change.** The dragged vertex's entry
   is replaced by the snap target's stored `{ id, y, x, status, description }`, copied
   verbatim. The cursor position selects a target; it never supplies coordinates, so
   `wgs84ToCape` is not called and the lossless-import precision at `:4539` is
   preserved. `PUT /coordinate-points/:id` is **never** called — no beacon row is
   touched. Moving a beacon's coordinates remains the Edit-Coordinates path
   (`editPanelHandler:1285`), which already cascades correctly.
2. **Substitute in place, by index.** Delete-then-append would rotate the ring and
   change the traverse order that `areaCompute`'s residuals and edge list are built
   from. Index substitution leaves ring order and orientation untouched.
3. **Snapping is mandatory and measured in screen pixels, not ground metres.** Drop
   with no candidate under the cursor = cancel, no write. A pixel radius (12 px) is
   what makes the gesture honest: at any zoom the surveyor can see what they are about
   to hit. Precision is unaffected — decision 1 means the committed numbers are the
   target's own.
4. **Candidate set = project coordinate points ∪ every saved parcel's vertices**,
   keyed by name, `coordinate_points` winning where a name is in both. That is
   requirement 2(a) and 2(b) in one index. A parcel-only vertex — the stale-name case
   `repairParcelBeaconNames` (`:1604`) exists for — stays a legal target but is
   badged in the hover chip, because it cannot be cross-checked against a beacon row.
5. **The cascade is driven by the DB rows, keyed by parcel `id`.** Not by
   `savedParcels`, whose key precedence contradicts itself (`:4193` vs `:5598`), and
   never with a silent skip (`:4730`). A parcel that cannot be rebuilt aborts or
   reports; it does not quietly stay behind, because a parcel left behind is precisely
   the non-coincident boundary this feature exists to prevent.
6. **All-or-nothing, gated by the existing confirm.** Requirement 3 is implemented as
   written: every parcel sharing the beacon is updated. The existing affected-parcels
   modal (`:834`) shows the list first and Cancel aborts before any write.
7. **A cascade that would duplicate a vertex aborts the whole commit, pre-flight.**
   If a sharing parcel already contains the target beacon, substituting would list it
   twice — a degenerate ring. Collapsing the pair instead would silently delete a
   corner from a *neighbouring* parcel. Refuse, naming the parcel.
8. **`isDrawing` is not reused.** The new mode gets its own state. Piggybacking on
   drawing mode (`:4408`) is what forced the insert-mode intersection carve-out at
   `:3730-3737`; that carve-out dies with the flow.
9. **No backend change, no migration, no new endpoint.** `updateLandParcel` +
   `refreshParcelsFromDatabase` already carry everything.

## Part 1 — Selecting a parcel and entering drag mode

New state in `MapLibreAreaView.vue`:

```ts
const selectedParcelId       = ref<number | null>(null)   // DB id, not designation
const draggingVertexIndex    = ref<number | null>(null)
const snapCandidate          = ref<SnapCandidate | null>(null)
```

**Click `parcels-fill`** (new handler, alongside the existing `survey-pegs-circle` one
at `:3253`) → set `selectedParcelId` from the feature's properties. `refreshParcels‑
FromDatabase` (`:4299-4344`) must add `id` to the feature `properties` block; today it
emits only `designation`, `area`, `status`, `closureRatio`, `closureError` (`:4337`).

While a parcel is selected:

- A new `vertices` GeoJSON source + `vertices-circle` layer renders that parcel's
  `cape_lo_points`, converted with `capeLoArrayToWGS84` and the project meridian
  (same call shape as `updateTempPolygon:4937`). Properties: `index`, `id`.
  Drawn above `parcels-outline` so the markers are always grabbable.
- `parcels-fill`/`parcels-outline` get a selected-state paint expression driven by
  `['==', ['get', 'id'], selectedParcelId]`.
- Clicking empty map clears the selection. `Esc` cancels a drag in flight.

**The drag gesture.** MapLibre has no vertex dragging, so it is assembled from raw
handlers on the `vertices-circle` layer:

| Event | Action |
|---|---|
| `mousedown` on `vertices-circle` | `e.preventDefault()` (suppresses map pan), record `draggingVertexIndex`, cursor `grabbing` |
| `mousemove` (map-level, while dragging) | project candidates to screen, pick the nearest within 12 px, set `snapCandidate`, redraw the rubber-band preview |
| `mouseup` / `touchend` | commit if `snapCandidate` is set, otherwise cancel |
| `touchstart` / `touchmove` | same path, single-touch only — field use is on tablets |

Feedback while dragging: the dragged marker follows the cursor; the two incident edges
rubber-band through `temp-polygon` (`updateTempPolygon:4928` already draws a LineString
from Cape Lo points and is reused unchanged); the live candidate is ringed and named in
a hover chip; with no candidate the chip reads "release to cancel — no point within
snap range". Nothing is written until `mouseup`.

## Part 2 — The snap index (`vertexSnap.ts`)

New pure module `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts` —
the whole feature's decision logic, with no MapLibre and no Vue in it.

```ts
export interface SnapCandidate {
  id: string                 // beacon name — the cape_lo_points id
  y: number; x: number       // Cape Lo, verbatim from the source
  status?: string
  description?: string
  source: 'coordinate-point' | 'parcel-vertex'
}
```

| Function | Responsibility |
|---|---|
| `buildSnapIndex(coordinatePoints, parcels)` | Union keyed by name; `coordinate_points` wins on collision; a parcel-only name yields `source: 'parcel-vertex'`. Reports names present in both whose coordinates differ by > 0.5 m (the `repairParcelBeaconNames` tolerance) so the UI can warn instead of silently preferring one. |
| `eligibleCandidates(index, parcel, draggedIndex)` | Excludes the dragged vertex and **every other vertex of the parcel being edited** — a parcel may not list a beacon twice (`:3721`). |
| `nearestCandidate(candidates, cursorPx, project, radiusPx)` | Nearest by squared pixel distance; `null` past the radius. `project` is injected (`map.project`) so the module stays map-free and testable. |
| `applySubstitution(points, index, candidate)` | Returns a new array with `points[index]` replaced. Pure. |
| `planCascade(fromName, candidate, affected)` | The pre-flight. `{ writes: Array<{ parcelId, designation, points }>, blockers: Array<{ designation, reason }> }`. Blocks on: target already present (decision 7); fewer than 3 vertices left; `cape_lo_points` missing or unparseable. Any blocker ⇒ no writes at all. |

Self-intersection is checked with the existing `wouldCreateIntersection`
(`:3664`)/`useParcelGeometry.generatePolygon` path against the *substituted* ring — a
correct use of it, unlike the append-shaped test the old insert mode had to skip.
A crossing result blocks the commit with the same message style.

## Part 3 — Commit: cascade, recompute, persist

`commitVertexDrag()` replaces `commitVertexEdit()`.

```
mouseup with a candidate
  └─ affected = findAffectedParcels(draggedVertexName)          (:1253, DB-fresh)
     └─ plan = planCascade(draggedVertexName, candidate, affected)
        ├─ blockers → alert naming the parcel + reason; nothing written
        └─ requireAffectedParcelsConfirm(draggedVertexName, 'edit')   (:1273)
           ├─ Cancel → nothing written, selection and drag state reset
           └─ Proceed → for each write:  areaCompute → geom + metadata → updateLandParcel
                        then one refreshParcelsFromDatabase()
```

`findAffectedParcels` returns the edited parcel too (it contains the beacon), so the
"directly edited" parcel and its sharers go down **one** path — requirement 4 is
satisfied by construction rather than by a second code path that could drift.
The Outside Figure is an ordinary `land_parcels` row with its own `cape_lo_points`
(`:4207`, `:4247`), so it cascades like any other parcel when it shares the beacon.

**Reuse over duplication.** `rebuildAffectedParcels` (`:4717`) already *is* this loop.
Extend its mutation union with a third kind:

```ts
| { kind: 'substitute'; name: string; replacement: SnapCandidate }
```

and delete `commitVertexEdit`'s duplicated body. Per parcel the existing steps stand
unchanged: `areaCompute` with `includeResiduals` (`:4756`), `closureError =
√(ΣdY² + ΣdX²)` (`:4763`), closed Cape Lo ring (`:4767`), `closure_ratio` /
`closure_error_m` / `residuals` / `cape_lo_points` / `points_count` metadata (`:4781`),
`updateLandParcel(id, { geom, metadata })` (`:4793`). `area_m2`/`area_ha`/`perimeter_m`
are generated columns (`migrations/040.do.sql:108-110`) and are never sent — the
service already strips them (`services/spatial.ts:376`).

Three changes to that loop, all consequences of decision 5:

- Resolve each parcel from the `listLandParcels` rows `findAffectedParcels` already
  fetched, by `id`. Drop the `savedParcels.value.get(designation)` lookup and its
  silent `continue` (`:4729-4733`).
- Replace the per-parcel swallow (`:4795`) with an outcome list.
- Stamp `vertex_drag_snap_at` alongside the existing `point_edit_rebuilt_at` (`:4790`).

**Partial failure.** Each parcel is its own `PUT`; there is no cross-parcel
transaction. If a write fails after at least one succeeded, the boundaries are now
inconsistent, so the surveyor must be told in those terms — a blocking dialog naming
which parcels were written and which were not, and instructing a re-run. Do not
degrade this into a console warning. (See open question 2.)

## Part 4 — What is retired

Deleted outright from `MapLibreAreaView.vue`:

- `startEditingVertices` (`:4370`), `cancelVertexEdit` (`:4420`),
  `removeVertexByIndex` (`:4435`), `commitVertexEdit` (`:4443`).
- State `isEditingVertices` (`:1980`), `editingParcelDesignation` (`:1981`),
  `editingParcelDbId` (`:1982`), `insertAfterIndex` (`:1983`), `setInsertAfter`
  (`:1984`).
- The vertex-edit toolbar panel (`:146-210`), the mode banner branches (`:328-342`),
  and the 🔺 entry buttons (`:417`, `:489`) — replaced by clicking the parcel itself.
- In `handlePointClick` (`:3711`): the insert branch (`:3740-3744`) and the
  `isInsertingMidSequence` carve-out (`:3730-3737`). The function survives for
  **drawing new parcels only** and gets simpler.

This removes the only UI for dropping a vertex from a saved parcel without deleting
the beacon. Deleting the beacon itself still removes it from every parcel it appears
in (`deletePanelHandler:1412` → `rebuildAffectedParcels` `'delete'` `:4749`). A
per-parcel vertex removal is listed under Out of scope rather than smuggled in.

## Part 5 — Testing

TDD, Vitest, following the extract-logic-and-test-the-`.ts` convention.

| File | Coverage |
|---|---|
| `views/modules/cadastral-standard/__tests__/vertexSnap.test.ts` *(new)* | `buildSnapIndex` union + precedence + the >0.5 m divergence report; `eligibleCandidates` excludes the dragged vertex and the parcel's own vertices; `nearestCandidate` picks the **nearest** (not the first) and returns `null` past the radius, with an injected `project` stub; `applySubstitution` preserves index, length and ring order; `planCascade` blockers — duplicate target, <3 vertices, missing `cape_lo_points` — each producing zero writes |
| `views/modules/cadastral-standard/__tests__/vertexCascade.test.ts` *(new)* | Given a beacon in 3 parcels, the plan writes all 3 including the edited one; given it in 1, exactly 1 write; the same substituted coordinates land in every parcel (the coincidence invariant, asserted on the output, not the process) |
| existing suites | `npm test` from `app-frontend` stays green; `parcelDetection`, `sideAnnotations`, `workingPlanSpec` all read `cape_lo_points` and are the regression net for its shape |

The drag gesture itself (`mousedown`/`mousemove`/`mouseup` on a MapLibre layer) is
**not** unit-tested — there is no component harness and no map in jsdom. It is covered
by the manual checklist below, per `vue-views-have-no-test-harness`.

Manual browser steps, on a project with at least two parcels sharing a boundary:

1. Click a parcel → vertex markers appear on that parcel only.
2. Drag a vertex onto a peg → chip names the target → release → both parcels redraw
   with the corner in the same place; both cards show new area and closure ratio.
3. Drag and release over empty ground → nothing changes, no request fires.
4. Drag onto a beacon the neighbouring parcel already uses → blocked, parcel named,
   nothing written.
5. Cancel the affected-parcels dialog → nothing written; reload confirms.
6. Reload the view → the moved corner persists in both parcels.

## Resolved decisions

1. **The `auto_generate_metadata` trigger is not live anywhere.** Queried
   `pg_trigger` directly against `surveypro_db` on 2026-09-11: every schema with a
   `land_parcels` table — `public` and all eight `surveyor_*` schemas
   (`surveyor_kuziva_paradzayi`, `surveyor_surveyor_charles`,
   `surveyor_surveyor_chitsikef`, `surveyor_surveyor_cline`, `surveyor_surveyor_elon`,
   `surveyor_surveyor_kuda`, `surveyor_surveyor_kuziva`,
   `surveyor_surveyor_mapamulart`) — carries only
   `trigger_update_land_parcels_updated_at` (a plain `updated_at` bump). No trigger
   named or resembling `auto_generate_metadata` exists on any of them.
   `generate_parcel_metadata` / `generate_parcel_metadata_trigger` (`\df` in `public`)
   exist as **functions only**, never attached to a trigger in any schema. The
   `058_enable_auto_metadata_trigger.sql` / `060_auto_metadata_generation.sql` /
   `061_trigger_with_bankers_rounding.sql` migrations cited in the original open
   question were never applied by hand, in this database, despite
   `docs/ENABLE_AUTO_METADATA.md` describing how to. **No mitigation needed** — this
   feature's `UPDATE ... SET geom = ...` writes will not be intercepted or rewritten.
   Re-check `pg_trigger` if this is ever deployed against a different database where
   someone *did* run those migrations by hand.
2. **Should a partial cascade failure be recoverable, or prevented?** Part 3 reports
   it. Preventing it needs a batch endpoint (`POST /land-parcels/batch-update`) so the
   N parcel writes share one transaction. That is a backend change and is deliberately
   not in this pass; the report-loudly behaviour is the interim. Revisit if the
   failure is seen in practice.

## Out of scope

- Any backend change, new endpoint, or migration.
- Free-placement dragging, and any path that writes coordinates derived from the
  cursor.
- Moving a beacon's coordinates (that is `editPanelHandler:1285`, already cascading).
- Adding or removing a vertex from a saved parcel without deleting the beacon.
- Undo/redo for a committed drag.
- Multi-vertex or box-select drag.
- `AreaComputationView.vue` (deprecated Leaflet viewer).
- Snapping to an edge (perpendicular projection onto a boundary line) — requirement 2
  is point-to-point only.
- Cleaning up the `savedParcels` key-precedence contradiction (`:4193` vs `:5598`)
  beyond not depending on it.

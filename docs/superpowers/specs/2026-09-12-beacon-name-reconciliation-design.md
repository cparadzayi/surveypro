# Beacon Name Reconciliation & Suffix Capitalisation — Design

**Date:** 2026-09-12 (revision 2)
**Status:** Draft — awaiting review; see Unresolved
**Module:** `cadastral-standard` (+ `app-backend` coordinate-point write paths, `app-shared`)

Two related but distinct pieces of work on one subject, the beacon name.
**Piece 1** makes a parcel's *saved* area/consistency data carry the beacon names that
are current in `coordinate_points`. **Piece 2** makes a numeric-prefix beacon name's
suffix uppercase throughout the application.

**Citation convention.** A bare `:NNNN` is
`app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` **on
`feat/vertex-drag-snap` @ `8d36203`**, the branch this work builds on (decision 10).
That file is 664 lines longer there than on `main` (`repairParcelBeaconNames` is
`:1651` on the branch, `:1604` on `main`). Every other cited file is identical on both
(`git diff --stat main feat/vertex-drag-snap`).

## Revision note

The first cut of this file (`94ae066`, amended `4a16010`) was re-checked against the
code and is superseded where it was wrong:

- It said the vertex-drag-snap work was "not built". It is built: 9 commits
  (`cf585da`…`8d36203`, 2026-09-12 06:55–13:57), unmerged. The first cut only looked at
  `main`.
- Its Piece 2 display-site inventory listed 8 sites. There are about 30 print sites
  plus about 20 template interpolations (Context). That inventory was the basis of its
  decision to fix at display sites, and **that decision is reversed** (decision 11).
- It re-ran `areaCompute` and wrote `geom` during a rename repair. **Both reversed**
  (decisions 3, 4): stored residuals can predate the current computation, and a rename
  tool must not rewrite geometry.
- It missed the paths that keep *producing* stale names (Context, "Is something
  broken?").
- Route line citations were off (`POST /coordinate-points` is `:36`, not `:60`).

The two decisions the surveyor confirmed on 2026-09-12 are carried over unchanged
(Resolved).

## Problem

**Piece 1.** Beacons get renamed after parcels have been digitized: by hand, or by
re-importing a CSV with corrected names. Each parcel's saved area/consistency data in
`land_parcels.metadata` still carries the old names. The repair must key on
**vertex coincidence with beacon position**. Spatial matching is required because the
name is the thing that is wrong. If a stored vertex sits within tolerance of a current
`coordinate_points` row, that vertex takes the row's name.

**Piece 2.** In a name with a numeric prefix and an alphabetic suffix, the suffix
should be uppercase (`2474a` → `2474A`). Today it is uppercase in some places and not
others.

## Context (as-found)

### Where a beacon name is stored

1. **`coordinate_points.name`**, unique per project: `ON CONFLICT (project_id, name)`
   (`app-backend/src/models/coordinatePoint.js:200`) and the rename 409
   (`routes/coordinatePoints.js:135-141`). The comparison is case-sensitive, so `2474a`
   and `2474A` are two legal rows.
2. **`land_parcels.metadata`** (plain `jsonb`) holds four name-bearing snapshots:
   - `cape_lo_points[].id` / `.description`, e.g. as written by
     `rebuildAffectedParcels` (`:5055-5057`).
   - `residuals.edges[].from` / `.to`, as `{ y, x, id, name }`. These are built by
     `app-backend/src/utils/edge-computation.js:55-56`, returned by `/compute/area`
     (`routes/compute.js:181`), and stored verbatim (`:5054`).
   - `vertices[].id` (QGIS parcels). These are labels aligned **by index** with the
     `geom` exterior ring (`:6232-6242`).
   - The Outside Figure's `points[]`, written by the on-load auto-update
     (`:4470-4478`).
3. **`workflow_state.step_data`**: `calculations-part1.adjusted_coordinates` (persisted
   by `handlePointRename`, `:1574-1583`) and the imported points born in the CSV parser
   (`app-frontend/src/utils/cadastral-csv.ts:285`). Documents such as the coordinate
   list are built from workflow state (`CadastralStandardView.vue:3506-3509`), not
   from `coordinate_points`.
4. Generated output files on disk: snapshots, out of scope.

### Piece 1: what the screen shows vs what the document prints

- **The loader re-derives names, but only in memory.** `loadParcelsFromDatabase`
  (`:4173`; `refreshParcelsFromDatabase` just calls it at `:4516`) rebuilds every
  parcel's vertex list from `geom` (comment `:4255-4256`). It uses the nearest
  coordinate point under 0.5 m (`:4273`, `:4307-4315`) and falls back to
  `${stand}_P${i+1}` (`:4348-4355`). It then attaches the **stored** residuals
  unchanged: `residuals: dbParcel.metadata?.residuals` (`:4409`). The map therefore
  looks right while the persisted metadata is not.
- **The Area/Consistency PDF prints the stale half.** `useAreaConsistencyPDF.ts`
  reads `residuals.edges` (`:145`, `:158`). Its `getBeaconName` (`:170-188`) prints
  the edge's stored `id || name` and only falls back to spatial matching when that
  name is *generic* (`isGenericFallbackName`, `utils/beaconNameMatch.ts:1-7`). A stale
  but real-looking name such as `1620` is not generic, so it is printed (`:379`).
  **This is the reported "area and consistency data" symptom.**
- The plan views read only *numbers* from stored edges, by index
  (`SurveyPlanMapView.vue:1339-1343`, `:3798-3805`), and resolve the Outside Figure's
  names spatially (`:5871`). They are not where the stale names surface.

### Piece 1 (a): does `repairParcelBeaconNames` fix the consistency data? No.

`:1651-1753`, reached only from the 🔧 **Repair Beacon Names** button (`:41-49`). It
fetches `listLandParcels` + `listCoordinatePoints` fresh (`:1662-1665`). For each
`cape_lo_points` entry it takes the globally nearest point (`:1703-1708`), accepts it
at `TOLERANCE = 0.5` (`:1685`, `:1709`), and writes
`updateLandParcel(id, { metadata: { ...metadata, cape_lo_points } })` (`:1719-1721`).

- **It never calls `areaCompute` and never touches `residuals`.** `residuals.edges`
  keeps the old names, and that is exactly what the PDF prints. Pressing the button
  leaves the symptom in place.
- **Would re-running `areaCompute` change any number? No, verified.**
  `computeAreaConsistency` computes the shoelace area, centroid, perimeter and closure
  from `y`/`x` only (`utils/area-computation.js:42-73`). `computeEdgesWithResiduals`
  computes dy, dx, distance and bearing from `y`/`x` (`edge-computation.js:34-40`),
  and runs the residual traverse from the rounded observations (`:68-89`). Names are
  **copied, never read**: `from: { y, x, id: a.id, name: a.name }` (`:55-56`, carried
  into the edge at `:93-94`). Attribution is by ring index, not by name. A rename
  changes only the label text inside `residuals.edges`.
- **But re-running is not neutral for old parcels.** `recomputeAllParcels` exists to
  bring stored results up to date with newer backend code: "updates existing parcels
  with new fields like directionDMS" (`:5078-5081`), and its confirm says "banker's
  rounding for directions and other improvements" (`:5100-5102`). Stored residuals can
  predate the current computation, so a recompute can change a parcel's stored
  dy/dx/directions.
- Further defects:
  - It overwrites `description` with the name unconditionally (`:1712`). The rename
    path gets this right at `:1615`.
  - It skips parcels with no `cape_lo_points` (`:1694-1697`), so a QGIS parcel's
    `vertices` names are never repaired.
  - It has no ambiguity check (second candidate within tolerance) and no duplicate
    check (two vertices resolving to one beacon).
  - It swallows per-parcel failures (`:1734-1736`), and its closing `alert`
    (`:1739-1745`) is a receipt shown after the writes.

### Piece 1 (b): does it need the drag-snap cascade?

`feat/vertex-drag-snap` built `rebuildAffectedParcels` (`:4954-5076`):

- Its mutation union is keyed by **one** beacon name (`:4956-4959`).
- It resolves parcels from fresh DB rows by `id` (`:4977-4988`).
- It re-runs `areaCompute` (`:5023-5028`), builds `geom` from `cape_lo_points`
  (`:5034-5040`), and writes both (`:5062`).
- It returns a `CascadeOutcome` (`:4961`, `:5063-5071`), which `commitVertexDrag`
  renders through `describeCascadeOutcome` (`:5509`, in `vertexSnap.ts`; its wording
  is drag-specific).

The cascade exists because a drag or coordinate edit changes what **one name** refers
to, while every other parcel holds that reference *by name* (`findAffectedParcels`
matches `id === pointName`, `:1294`). Reconciliation has no such reference to
propagate. It derives each vertex's name from **its own position**, against one beacon
table, for every parcel in one pass. Two parcels that share a corner resolve it
independently to the same row, because they share its position. **Per-parcel repair
is sufficient.** Routing through `rebuildAffectedParcels` would also inherit a
recompute (decision 3) and a `geom` write (decision 4) that a rename must not do. That
`geom` hazard is real: `SurveyPlanMapView.vue:5854-5864` exists because `geom` gets
edited outside the app (QGIS) without the metadata following.

### Piece 1 (c): is something broken or missing? Yes.

1. **The button does not repair the consistency data** (above).
2. **Stale names are produced continuously, not just historically.** Three paths do
   it:
   - `CoordinateListView.vue:241-292` (`commitRename`) calls `renameCoordinatePoint`
     (`:260`) and patches workflow copies (`:262-281`). It **never touches
     `land_parcels`**.
   - The map rename modal (`confirmMapRename` `:1103`, `resolveRenameConflict`
     `:1140`) calls only `handlePointRename` (`:1122`, `:1171`). That function
     propagates into `cape_lo_points` alone (`:1606-1635`), through `savedParcels`
     (`:1609`, i.e. only parcels currently loaded), with a metadata-only write
     (`:1620`). **`residuals` stays stale.**
   - CSV re-import (`routes/csvImports.js`, execute-merge `:448`) deletes every
     coordinate point (`:513-519`) and re-inserts under the file's names
     (`:596-602`). Every parcel can go stale at once; the loader's tolerance comment
     names exactly this case (`:4271-4272`).

   Only the Edit Points panel path is complete. `editPanelHandler` (`:1332`) renames
   (`:1363-1365`) and then runs `rebuildAffectedParcels` with `kind: 'edit'`
   (`:1442-1450`).
3. Description loss and silent failures (above).

### Piece 2: suffix-derivation sites (every numeric-prefix regex)

Swept `app-frontend/src`, `app-backend/src` and `app-shared` for `^(\d+)`-style
patterns, trailing-letter extraction, and `.toUpperCase()` on names.

| # | Site | Pattern | Uppercases suffix? | Notes |
|---|---|---|---|---|
| 1 | `SurveyPlanMapView.vue:1209` → `:1229` | `/^(\d+)([a-z]+)$/i` | **Yes, unconditionally** | Suffix → `text` (`:1270`) → refined labels → PDF/DXF. Full-name branches `:1216`, `:1289` emit raw. Unconditional uppercasing turns `1464An` into `AN`, which violates Resolved #1. |
| 2 | `SurveyPlanMapView.vue:4250` → `:4268` | same | **Yes, unconditionally** | PDF-payload twin of #1; full branches `:4255`, `:4292` raw; same `1464An` defect. |
| 3 | `app-backend/src/services/dxfGenerator.js:1532` → `:1535` | `/^(\d+)([A-Za-z]+)$/` | **Yes, unconditionally** | Fallback only; the UI-label branch passes text verbatim (`:1519-1528`). Full fallback `:1537` raw. Same `1464An` defect. |
| 4 | `pdfkitGeoPDF.js:2870` → `:2890`, `:2903` | `/^(\d+)([A-Z]+)$/`, no `i` | **No** | `2474a` and `1464An` **fail to match** and fall into the control-beacon branch (`:2873-2887`): full raw name, **outside** the parcel. This is a placement bug, not just casing. `:3014` gates the bold suffix font on `/^[A-Z]+$/`. |
| 5 | `pdfkitGeoPDF.js:3311` (`findParcelWithBeaconPrefix`) | `/^(\d+)([A-Z]+)$/` | n/a | **Dead:** defined at `:3307`, no call site. |
| 6 | `:6756` → `:6773` | `/^(\d+)([A-Z][a-z]*)$/` | **No** | `2474a` and `2474AB` fail → full-name branch (`:6785-6792`). Feeds the comprehensive document's beacon labels. |
| 7 | `app-backend/src/routes/surveyPlanPreview.js:792` → `:811` | same as #6 | **No** | Preview payload twin of #6. |
| 8 | `app-shared/block-definitions.js:632-640` (`extractBeaconSuffix`) | `/^(\d+)([A-Z]+)$/i` | **No** | **Dead:** exported (`:834`), no importer anywhere. |
| 9 | `app-backend/src/utils/topologyBuilder.js:260-267` (`extractBeaconSuffix(name, stand)`) | `replace(stand, '')` | **No** | Test-only (`topologyBuilder.test.js:240-253`); stand-relative semantics. |
| 10 | `app-frontend/src/utils/automatedParcelDetector.ts:694-697`, `:1018-1022` | `/^(\d+)[A-Z]?$/` after `.toUpperCase()` | n/a | Classification only, never emits a label. Correct as is. |
| 11 | `utils/beaconNameMatch.ts` | none | n/a | Matching only; the generic patterns (`:4`) are letter-only. Not a site. |

### Piece 2: full-name display sites (print the stored string, no suffix logic)

- **Frontend documents:**
  - `utils/field-book.ts:227`, `:300`
  - `utils/calculations-part1.ts:319`, `:447`, `:762`, `:874`, `:1005`
  - `utils/coordinate-list.ts:610`
  - `utils/area-computation-report.ts:232`
  - `composables/useAreaConsistencyPDF.ts:379`
  - `utils/beaconComparisonSection.ts:271`
  - `utils/beaconAdjustmentReport.js:160`, `:520`
  - `utils/pdf-generator.ts:194`
  - `utils/professionalSurveyPlanExporter.ts:1699`
  - `utils/surveyPlanSummaryReport.ts:279`
- **Frontend map labels:** `:3380` (`trig-beacons-labels`) and `:3411`
  (`survey-pegs-labels`), both `'text-field': ['get', 'id']`.
- **Frontend templates:** 20 `{{ point.id }}`-style interpolations across 15 `.vue`
  files, e.g. `CoordinateListView.vue`, `CalculationsPart1View.vue`,
  `MergeAnalysisDialog.vue`.
- **Backend:**
  - `pdfkitGeoPDF.js:1520`, `:9164`
  - `utils/surveyPlanGenerator.js:231`
  - `services/diagramPdf.js:159`, via `diagram/sidesTable.js:46` →
    `diagram/beaconName.js:21-22`
  - `workingPlan/working-plan.js:1289`, `:1422`
  - The beacon schedule: `classifyBeaconGroups` pushes raw names
    (`block-definitions.js:496-502`), consumed at `dxfGenerator.js:2257` and
    `pdfkitGeoPDF.js:9229`.

That is about 30 print sites and about 20 template sites, before counting CSV, GeoJSON
and DXF-attribute exports. Every future document would add more.

### Piece 2: every write door for a beacon name

- **Backend.** All SQL writing `coordinate_points.name` lives in three files:
  - `models/coordinatePoint.js`:
    - `create` INSERT (`:70-76`; `POST /coordinate-points`, `routes/coordinatePoints.js:36`)
    - `batchCreate` (`:87`; `POST /coordinate-points/batch`, `:73`). It dedupes by
      exact name (`:106-153`): duplicates within 0.5 m are averaged (`:115-128`),
      others are **dropped with only a console warning** (`:129-140`). It then upserts
      `ON CONFLICT` (`:197-208`).
    - `update` (`:275-288`; `PUT /coordinate-points/:id`, `:163`)
  - `routes/coordinatePoints.js`: `PATCH /coordinate-points/rename` (`:117`), with its
    own SQL (conflict check `:135-141`, UPDATE `:143-149`).
  - `routes/csvImports.js`: execute-merge UPDATE `name = newId` (`:528-535`) and
    INSERT (`:596-602`). `newId` is minted in analyze-merge (`:311`).
- **Frontend API calls.** Every write goes through `services/spatial.ts`
  (`createCoordinatePoint` `:185`, `renameCoordinatePoint` `:204`,
  `updateCoordinatePoint` `:213`, `batchCreateCoordinatePoints` `:226`) or
  `services/csvImports.ts` (execute-merge `:178`).
- **Frontend typing/parsing points:**
  - `cadastral-csv.ts:243`, `:285` (`record['point']` verbatim)
  - `confirmMapRename` `:1106` and `resolveRenameConflict` `:1143` (`.trim()` only)
  - `CoordinateListView.vue:242`
  - `editPanelHandler` `patch.name` (`:1363`)
  - `confirmBeaconSave` (`:1842` → `createCoordinatePoint` `:1869`)
- **Callers keep their typed string for in-memory updates.** `handlePointRename` uses
  `payload.newName` throughout `:1545-1635` (including the `dbPointIds` re-key at
  `:1600-1604`); `CoordinateListView` does the same at `:264-281`. A backend-only
  normalisation would desynchronise the frontend's own name joins.
- **Duplicate checks compare raw strings:** `CoordinateListView.vue:249-251`, `:1111`,
  `coordinatePoints.js:135-141`, `batchCreate` `:107`.

### Testing & plumbing

- `repairParcelBeaconNames` has no test coverage.
- No batch *update* endpoint exists for parcels. `POST /land-parcels/batch`
  (`routes/landParcels.js:173`) calls `LandParcel.create` (`:216`). Each parcel write
  is its own `PUT /land-parcels/:id` (`:259`).
- `app-shared/` is imported by the backend (`dxfGenerator.js:38`) and the frontend
  (`paperSizeOptions.ts:1`), and is Jest-tested from the backend
  (`services/__tests__/block-definitions-schedule.test.js`).
- Frontend: Vitest, no `@vue/test-utils`; extract logic into plain `.ts`. Backend: Jest
  under `--experimental-vm-modules`.
- No backend PDF/DXF fixture contains a lowercase or mixed-case numeric-suffix name
  (grep of `services/__tests__/fixtures/`).

## Decisions

Recorded because each rules out an approach that looked reasonable.

### Piece 1

1. **Manual trigger only.** Settled; not revisited. The 🔧 button (`:41-49`) stays the
   sole entry point. The loader's in-memory re-derivation (`:4255`) is unchanged.
2. **The repair corrects every name-bearing snapshot, not just `cape_lo_points`:**
   `cape_lo_points[].id`, `residuals.edges[].from/.to` `.id` and `.name`,
   `vertices[].id`, and the Outside Figure's `points[].id`. `residuals` is what "area
   and consistency data" means in practice; it is what the PDF prints.
3. **Names are patched in place; `areaCompute` is not re-run** (reverses the first
   cut). The numbers are provably name-independent (Context (a)). Re-running would
   silently rewrite old parcels' dy/dx/directions under a button about names
   (`:5078-5081`). A patch is pure and cannot perturb a number. Guard: the edges must
   match the ring (`edges.length === points.length`, and `edges[i].from` / `.to`
   within 1 mm of `points[i]` / `points[(i+1) % N]`). Otherwise the parcel is
   **blocked**: "consistency data does not match its vertex list — recompute this
   parcel first". Area, closure and residual numbers are untouched by construction.
4. **Metadata only; `geom` is never sent** (reverses the first cut). This matches
   today's repair (`:1721`). Guard: every `cape_lo_points` vertex must coincide within
   1 mm with a distinct `geom` exterior-ring vertex, with equal counts, converted with
   `geoJsonToCapeLoPoint` as the loader does (`:4285`). Otherwise block. We do not name
   a ring that is not the parcel's geometry.
5. **No cascade.** Per-parcel re-derivation is sufficient (Context (b)).
   `rebuildAffectedParcels` is not used: its mutation union has the wrong shape, and it
   recomputes and writes `geom`.
6. **Nearest wins; ambiguity blocks.** Resolved #2. If a second coordinate point is
   also within 0.5 m, the vertex is ambiguous and its parcel is not written. The report
   names the vertex, the parcel, and the candidates with distances. Ambiguity is a
   function of position, so a neighbour sharing that corner hits the same block.
7. **Two vertices resolving to one beacon blocks the parcel.** A ring listing a beacon
   twice is degenerate. This mirrors vertex-drag-snap decision 7.
8. **`description` is preserved.** It is rewritten only when it equalled the old id,
   which is the rule at `:1615`.
9. **Plan, confirm, write, report.** The whole plan is pure and knowable before any
   write, so the surveyor sees it first. Failures are collected into a
   `CascadeOutcome`, never swallowed.
10. **Built on `feat/vertex-drag-snap`.** It reuses `CascadeOutcome`, a generalised
    `describeCascadeOutcome`, and `readVertex` (module-private in `vertexSnap.ts`;
    exported by this work). None of these exist on `main`.

### Piece 2 — the central decision

11. **Normalise at the source, not at display sites** (reverses the first cut).

| | Per-display-site fix | Single source of truth (write doors + backfill) |
|---|---|---|
| Sites to change | ~30 print + ~20 template + exports; open-ended | 3 backend files, 2 frontend services, ~6 frontend entry points; closed |
| Completeness | The first cut, which chose this, found 8 of ~50 | Every reader sees the stored value |
| Future documents | Each must remember the helper | Nothing to remember |
| Exports (CSV/GeoJSON/DXF attributes) | Raw; disagree with the printed plan | Consistent |
| Frontend name joins | Unaffected (data untouched) | Must normalise the typed name at entry (decision 14) |
| Case-fold collisions (`2474a` + `2474A`) | Invisible | Must be detected and blocked (decisions 13, 15) |
| Existing data | Fixed on screen instantly | Needs a backfill (decision 13) |

The first cut's three objections, re-checked:

- *"There is no single source."* True of *storage* (four copies), false of *writes*.
  The jsonb copies are downstream of a small, enumerable set of doors (Context). What
  is already stored is the backfill's job.
- *"It would manufacture Piece 1's bug"* by breaking name-joins to saved parcels. Only
  for existing data, and Piece 1 is precisely the position-keyed repair that heals it.
  The backfill runs both in one pass (decision 13).
- *"Names can collide."* Yes. Collisions are blocked and reported, never merged.

The table's last row is the one real cost. It is paid once per project, by the
surveyor, with the button they already use.

12. **The rule** (settled; refined by Resolved #1). A name matching
    `^(\d+)([A-Za-z]+)$` whose suffix is **all lowercase** has its suffix uppercased
    (`2474a` → `2474A`, `15b` → `15B`). Anything else passes through byte for byte:
    - a mixed-case suffix (`1464An`)
    - an already-uppercase suffix (`2474A`)
    - a letter-only name (`A`, `SD4`, `TSM5025`)
    - a trailing digit (`2474A1`)

    The rule is idempotent.
13. **Existing data is backfilled per project, by the same manual button, not by a
    migration.** A migration cannot do Piece 1's spatial parcel repair. It would run
    blind across every surveyor schema, cannot surface collisions to the person who can
    resolve them, and cannot reach `workflow_state` copies safely. One run does: beacon
    renames, then workflow copies, then parcel reconciliation.
14. **Both sides normalise, one implementation.** `app-shared/beaconName.js` is the
    only place the rule exists:
    - The frontend applies it where a name is typed or parsed, so the typed string
      equals the stored string and in-memory joins agree.
    - The backend applies it again at every door, defensively (idempotent).
    - Duplicate checks compare normalised forms.
15. **Case-fold duplicates are an error, not a merge.** A payload holding two raw names
    that normalise to one (`2474a` and `2474A`) is rejected with a 400 naming the pair.
    Otherwise `batchCreate` would average them (`:115-128`) or silently drop one
    (`:129-140`). Exact duplicates keep today's behaviour.
16. **Suffix-derivation sites move onto the shared splitter anyway, for matching, not
    casing.**
    - Sites #4, #6 and #7 fail to *match* legitimate names (`1464An` permanently;
      lowercase until backfilled; `2474AB` at #6/#7) and misplace their labels.
    - Sites #1–#3 uppercase `1464An`, violating decision 12.
    - Dead sites #5 and #8 are deleted, not left as dialects to copy.
    - #9, #10 and #11 are untouched.
17. **Full-name display sites are not touched.** A project that has not been backfilled
    keeps printing its stored case in tables until the surveyor runs the button. That
    is the stated cost of decision 11, not an oversight.

Backend change is required (decisions 13–15), including one new endpoint.

## Part 1 — Piece 1: the pure planner (`beaconReconcile.ts`)

New `app-frontend/src/views/modules/cadastral-standard/beaconReconcile.ts`. No Vue, no
network, no MapLibre.

```ts
export type VertexOutcome =
  | { kind: 'unchanged'; index: number; id: string }
  | { kind: 'rename';    index: number; from: string; to: string; distanceM: number }
  | { kind: 'ambiguous'; index: number; id: string; candidates: Array<{ name: string; distanceM: number }> }
  | { kind: 'unmatched'; index: number; id: string; nearestM: number | null }

export interface ParcelPlan {
  parcelId: number
  designation: string
  source: 'cape_lo_points' | 'vertices'
  outcomes: VertexOutcome[]
  blocked?: { reason: 'ambiguous' | 'duplicate-vertex' | 'too-few-points'
                    | 'ring-not-geom' | 'edges-not-ring'; detail: string }
  metadata?: object          // the patched metadata, present only when there is a write
}
```

| Function | Responsibility |
|---|---|
| `matchVertex(vertex, beacons, tolM)` | Strictly nearest by Euclidean distance. `ambiguous` if a second beacon is also within `tolM`; `unmatched` past it (with the nearest distance); `unchanged` if the name already matches. |
| `readRing(row)` | `cape_lo_points` if non-empty. Otherwise the `geom` ring zipped **by index** with `vertices[].id`, as `:6232-6242` reads it. Otherwise null. |
| `ringMatchesGeom(points, geom)` / `edgesMatchRing(edges, points)` | Decision 4 and decision 3 guards, 1 mm. A parcel without `residuals` passes `edgesMatchRing` vacuously. |
| `patchParcelMetadata(metadata, source, renames)` | **Pure.** Returns new metadata with `cape_lo_points[i].id` (and `description`, per decision 8), `residuals.edges[i].from` and `edges[(i-1+N)%N].to` `.id`/`.name`, `vertices[i].id`, and matching Outside Figure `points[]` entries renamed. Nothing else changes. |
| `planParcel(row, beacons, tolM)` | Reads the ring, applies the guards and decisions 6–8, and produces `blocked` or `metadata`. |
| `planReconciliation(rows, beacons, tolM)` | `{ writes, blocked, unchanged }`. A blocked parcel never blocks its neighbours. |
| `summarise(beaconPlan, parcelPlan)` | Dialog text: beacon renames, collisions, per-parcel renames (`1425: "1620" → "2474A" (0.003 m)`), blocked parcels with reasons, counts. |

`tolM` defaults to 0.5 m, the figure at `:1685`, `:4273` and
`diagram/beaconName.js:8`.

## Part 2 — Piece 1 + backfill: rewiring the button

`repairParcelBeaconNames` keeps its name, its button and its manual trigger.

```
🔧 Repair Beacon Names  (:43)
 └─ fetch listLandParcels + listCoordinatePoints, fresh               (as :1662-1665)
    ├─ beaconPlan = planNameNormalization(points)                     (app-shared, pure)
    ├─ parcelPlan = planReconciliation(parcels, beaconPlan.after, 0.5)  (pure — sees post-rename names)
    └─ confirm modal: summarise(beaconPlan, parcelPlan)
       ├─ Cancel  → nothing written
       └─ Proceed →
            A1  POST /coordinate-points/normalize-names          one transaction; skipped if no renames
                  └─ fails → stop; nothing else is written
            A2  workflow_state copies: exact old→new name map, one PATCH
            B   for each parcelPlan.write: updateLandParcel(id, { metadata })   — never geom
            then one refreshParcelsFromDatabase(), then the outcome dialog
```

- **Order is load-bearing.** A1 comes before B: parcels must never be renamed to names
  that do not exist yet. A re-run after any partial failure is safe. A1 has nothing
  left to do, and B's planner re-derives from positions, so already-written parcels
  plan as `unchanged`.
- **A2.** `handlePointRename` shows two copies: in-memory `importedPoints`
  (`:1564-1568`) and persisted `calculations-part1.adjusted_coordinates`
  (`:1574-1583`). `CoordinateListView.vue:269-274` adds
  `documents.coordinateList.points`. Where `importedPoints` is persisted was **not
  established** by this research; the plan must locate it before implementing A2.
- **The confirm modal** follows the resolve/reject promise pattern of
  `showAffectedParcelsConfirm` (`:1312-1321`), but is a new scrollable list. That
  modal is keyed by one point name and cannot show a multi-rename plan.
- **Outcomes.** A `CascadeOutcome` per phase. `describeCascadeOutcome` is generalised
  (it says "The drag could not be applied…") so both callers share it. A partial phase
  B is reported in the same blocking terms as the drag.
- **Unchanged:** the `isRecomputing` guard (`:1658`) and the empty-project exits
  (`:1667-1674`). The in-memory cache sync (`:1722-1731`) is deleted:
  `refreshParcelsFromDatabase` replaces it, and it keys `savedParcels` by
  `stand || designation` (`:1691`) against the loader's `designation || stand`
  (`:4416`).

## Part 3 — Piece 2: normalisation at the doors

### `app-shared/beaconName.js`

```js
export function splitBeaconName(name)      // '2474a' → { prefix: '2474', suffix: 'a' }; 'SD4' → null
export function normalizeBeaconName(name)  // decision 12; total, idempotent, never throws
export function findCaseFoldDuplicates(names)   // [['2474a', '2474A'], …] among raw names
export function planNameNormalization(rows)     // { renames: [{ id, from, to }], collisions: [{ from, existing }], after }
```

One regex: `/^(\d+)([A-Za-z]+)$/`. `planNameNormalization` puts a rename whose target
already exists in `collisions` instead of `renames`. `after` is the point list with the
renames applied, which is what Part 1 matches against.

### Backend doors (defensive; decision 14)

| Door | Change |
|---|---|
| `models/coordinatePoint.js` `create` (`:70-76`), `update` (`:275-288`) | `normalizeBeaconName(name)` before the SQL. |
| `models/coordinatePoint.js` `batchCreate` (`:106`) | `findCaseFoldDuplicates` → 400 (decision 15); then normalise **before** the dedupe map at `:107`, so the `ON CONFLICT` key (`:200`) is the normalised name. |
| `routes/coordinatePoints.js` rename (`:131-149`) | Normalise `new_name` before the conflict check (`:135`) and the UPDATE (`:143`). The response already returns the stored row (`RETURNING *`, `:147`). |
| `routes/csvImports.js` analyze-merge (`:311`) and execute-merge (`:528-535`, `:596-602`) | Normalise `newId` / `newPt.id`; case-fold duplicates → 400. |
| **New** `POST /coordinate-points/normalize-names` | Body `{ project_id, renames }`. The server recomputes `planNameNormalization` from its own rows and requires it to equal `renames`; otherwise **409 "plan changed — re-run"**. It applies every rename in **one transaction** and never touches a collision. |

### Frontend entry points

Each normalises the name where it already trims it, and uses the normalised string for
both the API call and its in-memory updates:

- `cadastral-csv.ts:243`, `:285`
- `confirmMapRename` (`:1106`) and `resolveRenameConflict` (`:1143`)
- `CoordinateListView.vue:242`
- `editPanelHandler` (`:1363`)
- `handlePointRename` (normalise `payload.newName` on entry, `:1540`)
- `confirmBeaconSave` (`:1842`)

The duplicate checks at `CoordinateListView.vue:249-251` and `:1111` compare normalised
forms.

## Part 4 — Piece 2: suffix-derivation sites

| Site | Change |
|---|---|
| #1 `SurveyPlanMapView.vue:1209-1229`, #2 `:4250-4268` | `splitBeaconName`; suffix via `normalizeBeaconName` (drops the unconditional `.toUpperCase()` that breaks `1464An`). |
| #3 `dxfGenerator.js:1532-1535` | Same. The UI-label branch (`:1519-1528`) stays verbatim; it is fed by #1/#2. |
| #4 `pdfkitGeoPDF.js:2870-2903` | `splitBeaconName`. `2474a`/`1464An` now match and are placed **inside** their stand. The `:3014` bold gate is left as is: an uppercased suffix passes it, and a mixed-case `An` keeps plain type. |
| #6 `:6756-6773`, #7 `surveyPlanPreview.js:792-811` | `splitBeaconName` (now matches `2474AB` and lowercase); emitted suffix normalised. |
| #5 `pdfkitGeoPDF.js:3307-3330`, #8 `block-definitions.js:631-640` (+ its entry in the default export `:834`) | Delete (dead). |

## Part 5 — Testing

TDD, following the extract-logic-and-test-the-`.ts` convention.

| File | Coverage |
|---|---|
| `app-backend/src/services/__tests__/beaconName-shared.test.js` *(new; imports `app-shared/beaconName.js` like `block-definitions-schedule.test.js`)* | `normalizeBeaconName`: `2474a`→`2474A`, `15b`→`15B`, `1464an`→`1464AN`. Byte-for-byte: `1464An`, `2474A`, `A`, `SD4`, `TSM5025`, `2474A1`, `1425`, `''`. Idempotence; non-string input does not throw. `findCaseFoldDuplicates`. `planNameNormalization`: a rename vs a collision, and `after`. |
| `views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts` *(new)* | `matchVertex`: nearest not first, `ambiguous`, `unmatched` distance, `unchanged`. `readRing`: `cape_lo_points`, else `vertices` by index. Guards: a ring that is not the geom and edges that do not match the ring each block. `patchParcelMetadata`: renames land in `cape_lo_points`, `edges[i].from` **and** `edges[i-1].to` (wrap-around at index 0), `vertices`, OF `points`; description rule. `planReconciliation`: a blocked parcel does not block others; the `after` list from a beacon plan is honoured. |
| `beaconReconcile.test.ts` — the invariant | **A patched parcel's metadata differs from the input only in name strings.** Deep-compare with every `id`/`name`/`description` stripped: identical, including every residual number and `closure_ratio`. This is decision 3 asserted on the output. |
| `app-backend` route/model suites | `batchCreate` and execute-merge reject a case-fold pair with 400 and normalise otherwise. Rename normalises before its 409 check. `normalize-names` returns 409 on a stale plan and leaves collisions untouched. |
| existing `pdfkitGeoPDF`/`dxfGenerator` suites | A beacon `2474a` on stand 2474 is labelled `A` **inside** the stand; `1464An` is labelled `An` inside. |
| existing suites | `cd app-frontend && npm test`; `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`. `vertexSnap`/`vertexCascade` stay green after `describeCascadeOutcome` is generalised. |

**Snapshot risk, to check rather than assume.** `pdfkitGeoPDF.snapshot.test.js`
snapshots exact text x/y. No fixture holds a lowercase or mixed-case numeric-suffix
name, so Part 4 should not move anything there. If it fires, inspect every moved label
before regenerating.

**Manual browser steps** (no component harness for `.vue`):

1. On a project whose parcels were digitized before a beacon rename, generate the
   Area/Consistency PDF and note the stale From/To names.
2. Click 🔧 → the dialog lists beacon case renames, collisions, and parcel renames with
   distances. Cancel → reload → nothing changed.
3. Re-run and Proceed → regenerate the PDF. Names are current, and every area,
   distance, direction and dy/dx is identical to step 1.
4. Coordinate list, field book, plan PDF/DXF and diagram all show `2474A`.
5. Rename a beacon to `2474b` in Coordinate List → it is stored and shown as `2474B`.
   Import a CSV holding both `99a` and `99A` → rejected, naming the pair.

## Resolved (confirmed with the surveyor, 2026-09-12)

1. **`1464An` is a deliberate naming form and must not be touched.** Decision 12's
   all-lowercase guard is the mechanism.
2. **Ambiguity blocks; there is no pick-one dialog.** If two coordinate points sit
   within 0.5 m of a vertex, it is left untouched and reported with the candidates and
   their distances (decision 6).
3. **A rename finishes its own propagation, going forward.** After
   `handlePointRename` and `CoordinateListView.commitRename`, apply
   `patchParcelMetadata` with the exact old→new name to every parcel that lists it —
   metadata-only, no recompute, reusing Part 1's pure patcher. This resolves former
   Unresolved #1: reconciliation stops being purely retroactive; only *pre-existing*
   staleness (parcels renamed before this ships, or renamed via CSV re-import, which
   replaces every name at once and is not a single old→new pair) still needs the
   manual 🔧 button.
4. **A partial phase-B failure is reported loudly, not prevented.** Consistent with
   vertex-drag-snap's own resolution of the identical question: no transactional
   batch-update endpoint in this pass. The blocking dialog names which parcels wrote
   and which did not; a re-run is safe because the planner re-derives from position
   and already-correct parcels plan as `unchanged` (Part 2's ordering note).

## All formerly open questions are now resolved

1. **Whether an in-going rename should finish its own propagation** — resolved above
   (Resolved #3): yes, going forward.
2. **Whether a partial phase-B failure should be preventable** — resolved above
   (Resolved #4): reported, not prevented.
3. **How much existing data is affected** — measured against every
   `coordinate_points` table in `surveypro_db`, 2026-09-12:

   | Schema | Lowercase-suffix names | Total | Case-fold collisions |
   |---|---|---|---|
   | `public` | 0 | 0 | — |
   | `surveyor_kuziva_paradzayi` | 0 | 1,272 | none |
   | `surveyor_surveyor_charles` | 0 | 308 | — |
   | `surveyor_surveyor_chitsikef` | **1,733** | 6,374 | none |
   | `surveyor_surveyor_cline` | 0 | 0 | — |
   | `surveyor_surveyor_elon` | 0 | 0 | — |
   | `surveyor_surveyor_kuda` | 0 | 3,069 | none |
   | `surveyor_surveyor_kuziva` | 0 | 0 | — |
   | `surveyor_surveyor_mapamulart` | **268** | 268 | none |

   Not theoretical: one schema is 27% lowercase-suffix, another is 100%. **No
   `2474a`/`2474A` case-fold pair exists in any schema today** — decision 15's
   collision path is a safety net, not something the backfill will trip over in
   practice, in this data. The `mapamulart` schema — every name lowercase-suffix —
   is worth a manual spot-check before backfilling: confirm those are genuine
   `\d+[a-z]+` beacon names and not some other naming convention that happens to
   match the regex.

Nothing is left open for the implementation plan to re-litigate.

## Out of scope

- Automatic reconciliation on load, rename or import (decision 1).
- A database migration for the backfill (decision 13).
- Recomputing `areaCompute` or writing `geom` during the repair (decisions 3, 4).
  Stale-numbers repair stays `recomputeAllParcels`.
- Any name outside decision 12's rule, including letter-only names.
- Already-generated output files on disk; regenerate them.
- `project_control_points`, `public.zim_control_points`, historical survey points, and
  the unmerged `feat/gnss-calibration-import` ingestion. Any **new** name-ingestion
  path must call `normalizeBeaconName`; flagged for that branch.
- Placing or renaming a vertex that matches no beacon (`unmatched`); that is the
  vertex-drag-snap feature's job.
- `topologyBuilder.extractBeaconSuffix` (site #9), `automatedParcelDetector.ts` (#10).
- Consolidating the five spatial matchers (`:1703`, `:4307`,
  `diagram/beaconName.js:8`, `areaCalculations.js`, `beaconNameMatch.ts:10`) onto one
  rule; this work adds no sixth.
- Removing the Outside Figure on-load auto-update (`:4428-4498`).
- `AreaComputationView.vue` (deprecated Leaflet viewer).

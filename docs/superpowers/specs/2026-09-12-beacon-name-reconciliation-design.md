# Beacon Name Reconciliation & Suffix Capitalisation — Design

**Date:** 2026-09-12
**Status:** Approved for planning
**Module:** `cadastral-standard` (+ `app-backend/src/services`, `app-shared`)

Two related features against one subject — the beacon name. **Feature 1** makes a
parcel's *saved* area/consistency data agree with the beacons that are actually on
the ground. **Feature 2** makes the *rendering* of a beacon name agree with itself
across the map, the PDF, the DXF and the preview.

## Problem

**Feature 1 — stale names in saved area/consistency data.** A surveyor renames a
beacon (or re-imports a CSV with corrected names) after parcels have already been
digitized. The map then shows the new names, but the area/consistency table, the
Area/Consistency PDF and the plan views still carry the old ones. The repair must
key on **vertex coincidence with beacon positions** — spatial matching, not name
matching — because the name is the thing that is wrong.

**Feature 2 — the suffix is capitalised in some places and not others.** A beacon
named `2474a` renders as `A` on the survey-plan map and in the DXF, but as `2474a`
on the digitizing map, in the coordinate schedule, in the diagram's S.G. No. column,
and — worst — as a full-name control beacon *outside* its own parcel in the PDF.

## Context (as-found)

### Where a beacon name lives

- **Canonical row:** `coordinate_points.name`, unique per project — `ON CONFLICT
  (project_id, name)` (`app-backend/src/models/coordinatePoint.js:200`) and the
  rename endpoint's 409 (`routes/coordinatePoints.js:139`). PostgreSQL string
  equality is case-sensitive, so `2474a` and `2474A` are two legal, distinct rows.
- **Three name-bearing snapshots inside `land_parcels.metadata`** (plain `jsonb`;
  `cape_lo_points` and friends are application conventions, not columns):
  - `metadata.cape_lo_points[].id` (and `.description`) — written at save
    (`MapLibreAreaView.vue:4658`).
  - `metadata.residuals.edges[].from.{id,name}` / `.to.{id,name}` — built by
    `app-backend/src/utils/edge-computation.js:55-56` and returned through
    `/compute/area` (`routes/compute.js:181`), then stored verbatim
    (`MapLibreAreaView.vue:4657`).
  - `metadata.vertices[].id` — the QGIS-import shape, read at
    `MapLibreAreaView.vue:5668-5679`; and the Outside Figure's own
    `metadata.points`, written by the on-load auto-update at `:4250`.
- **Names enter the system unnormalised at every door.** `POST /coordinate-points`
  (`routes/coordinatePoints.js:60`), `POST /coordinate-points/batch` (`:99`),
  `PATCH /coordinate-points/rename` (`:143`), `PUT /coordinate-points/:id` (`:163`)
  and the CSV parser (`app-frontend/src/utils/cadastral-csv.ts:243`, which takes
  `record['point']` verbatim) all store the string as typed. Lowercase suffixes are
  real field data — the existing fixture uses `'1620a'`
  (`utils/__tests__/beaconNameMatch.test.ts:30`).

### The load path already reconciles — but only in memory

This is the crux of Feature 1. `refreshParcelsFromDatabase` rebuilds every parcel's
vertex list **from `geom`, re-matched spatially against the current coordinate
points at 0,5 m**, and deliberately ignores the stored names:

```
// ALWAYS extract from geometry and re-match to get correct beacon names
// (ignore old metadata which may have generic A, B, C names)
```
— `MapLibreAreaView.vue:4032-4034`, matcher at `:4084-4092`, tolerance at `:4050`.
There is no fallback to `metadata.cape_lo_points`: a parcel whose `geom` yields no
ring is **skipped** (`:4144-4148`).

The same loop then attaches the **stored** residuals unchanged —
`residuals: dbParcel.metadata?.residuals` (`:4186`). So one in-memory parcel holds
freshly re-matched `points` next to a stale, name-bearing `residuals.edges`. The
Area/Consistency PDF reads the stale half: `parcel.areaResult.residuals.edges`
(`composables/useAreaConsistencyPDF.ts:145,158`), with `parcel.points` used only as
a per-index fallback (`:194-195`). `SurveyPlanMapView.vue:5852` calls
`metadata.residuals.edges` the *"single source of truth"* for the Outside Figure
table, and `:3798-3805` prefers it for every parcel's edge export.

**That is the reported inconsistency**: the screen is right because it re-derives;
the persisted metadata is wrong because nothing re-derives it.

### `repairParcelBeaconNames` as it stands

`MapLibreAreaView.vue:1604-1706`, triggered only by the 🔧 **Repair Beacon Names**
button (`:42-49`). It fetches `listLandParcels` + `listCoordinatePoints` fresh
(`:1615-1618`) — pointedly *not* in-memory state — then per parcel maps each
`cape_lo_points` entry to the globally nearest coordinate point (`:1658-1661`),
accepts it at `TOLERANCE = 0.5` m when the name differs (`:1662`), and writes back
`updateLandParcel(id, { metadata })` (`:1674`). It reports repaired/skipped counts
in an `alert` (`:1692-1698`).

What it does **not** do, all verified against the code:

- It rewrites `cape_lo_points` **only**. `metadata.residuals.edges[].from/.to` keep
  the old names, and that is the block the area/consistency surfaces read.
- `:1665` returns `{ ...p, id: bestMatch.id, description: bestMatch.id }` —
  **unconditionally overwriting `description` with the name**, destroying a real
  description such as "Iron peg". (The rename path at `:1568` gets this right: it
  only rewrites `description` when it equalled the old name.)
- Parcels with an empty `cape_lo_points` are counted as skipped and `continue`d
  (`:1647-1650`) — so a QGIS parcel whose names live in `metadata.vertices` is
  never repaired, and neither is the Outside Figure's `metadata.points`.
- Per-parcel failures are `console.error`ed and swallowed (`:1687-1689`); the final
  alert's "Repaired: N" does not distinguish a parcel that failed from one that
  needed nothing.
- No ambiguity handling. The inner loop takes the global nearest with no
  second-candidate check and no claimed-set, so two vertices of one parcel can both
  resolve to the same beacon, producing a duplicate `id` in the ring.

### Five spatial matchers, four tolerances

Worth recording because Feature 1 adds decision logic that must not become a sixth:

| Where | Tolerance | Picks |
|---|---|---|
| `MapLibreAreaView.vue:1658` (the repair) | 0,5 m | nearest |
| `MapLibreAreaView.vue:4086` (on-load re-derivation) | 0,5 m | nearest |
| `app-backend/src/services/diagram/beaconName.js:8` `resolveVertexBeaconName` | 0,5 m | nearest |
| `app-backend/src/utils/areaCalculations.js:246-253` | 0,5 m per-axis box | **first** |
| `app-frontend/src/utils/beaconNameMatch.ts:10` `findBeaconNameBySpatialMatch` | 2 m (10 m generic) | **first** under tolerance (`:20`) |

### Relationship to the vertex-drag-snap work

`docs/superpowers/specs/2026-09-10-vertex-drag-snap-design.md` designs a *snap
index* (`vertexSnap.ts`) and a cascade that substitutes one named beacon across
every parcel sharing it, via `findAffectedParcels` (`:1253`),
`requireAffectedParcelsConfirm` (`:1273`) and `rebuildAffectedParcels` (`:4717`).
**None of it is built.** `git log main..HEAD` is empty on
`feat/beacon-name-reconciliation`, the last three commits on `main` are the spec
and its plan, and no `vertexSnap.ts` exists under
`views/modules/cadastral-standard/`.

`rebuildAffectedParcels` (`:4717`) is a `for` loop over parcels doing
`areaCompute` (`:4756`) → `closureError = √(ΣdY²+ΣdX²)` (`:4763`) → closed Cape Lo
ring (`:4767`) → `closure_ratio`/`closure_error_m`/`residuals`/`cape_lo_points`
metadata (`:4781-4791`) → `updateLandParcel` (`:4793`) → one
`refreshParcelsFromDatabase` (`:4800`). **That recipe already exists three times**:
here, in `commitVertexEdit` (`:4443-4514`), and in an abbreviated form in
`recomputeAllParcels` (`:4876-4894`). The three differ: `rebuildAffectedParcels`
passes `{ y, x, id, name: p.id }` to `areaCompute` (`:4757`) while
`recomputeAllParcels` passes `{ y, x, id }` (`:4872`), leaving `edge.from.name`
undefined — harmless today only because consumers read `id || name`
(`useAreaConsistencyPDF.ts:172`).

### Suffix capitalisation — the call-site inventory

The sweep covered `app-frontend/src` and `app-backend/src` for numeric-prefix +
alpha-suffix regexes, for `[A-Za-z]+$`-style trailing-letter extraction, for
`.toUpperCase()` on a point name, and for map/PDF/DXF label emission.

**Three regex dialects exist for one concept:**

| Pattern | Sites |
|---|---|
| `/^(\d+)([a-z]+)$/i` | `SurveyPlanMapView.vue:1209`, `:4250` |
| `/^(\d+)([A-Za-z]+)$/` | `app-backend/src/services/dxfGenerator.js:1532` |
| `/^(\d+)([A-Z]+)$/` | `app-backend/src/services/pdfkitGeoPDF.js:2870` |
| `/^(\d+)([A-Z][a-z]*)$/` | `MapLibreAreaView.vue:6192`, `app-backend/src/routes/surveyPlanPreview.js:792` |

**Correct today (uppercase the suffix):**

1. `SurveyPlanMapView.vue:1209` → `:1229` `prefixMatch[2].toUpperCase()` → `text`
   at `:1270`, stored as `refinedBeaconLabels` (`:1315`) and shipped to the PDF/DXF.
2. `SurveyPlanMapView.vue:4250` → `:4268` → `:4280`, the PDF-payload twin of (1).
3. `dxfGenerator.js:1532` → `:1535` `m[2].toUpperCase()`. Correct, but only on the
   *fallback* branch; the priority branch passes `uiLabel.text` verbatim (`:1522`),
   which is safe precisely because that text came from (1)/(2).

The MapLibre `beacon-labels` layer (`SurveyPlanMapView.vue:2475`,
`'text-field': ['get','name']`) is fed `name: beacon.text` at `:2447` — i.e. from
(1). **Not a defect.**

**Inconsistent — each verified by reading the line:**

| # | Site | Defect |
|---|---|---|
| A | `pdfkitGeoPDF.js:2870`, `:2890`, `:2903` | Regex is `[A-Z]+` with no `i`, so `2474a` **does not match at all** → falls into the control-beacon branch (`:2873-2887`) and renders the **full raw name outside** the parcel. A matched suffix is also emitted with no `.toUpperCase()`. Two defects, one line apart. Note `:3014` gates the suffix font/bold on `/^[A-Z]+$/.test(displayLabel)`, so a lowercase suffix would silently lose its cartographic treatment even if it reached that far. |
| B | `MapLibreAreaView.vue:6192`, `:6209` | `displayLabel: suffix` verbatim; `2474a` does not match `[A-Z][a-z]*` and falls to the full-name branch (`:6221-6228`). Feeds the comprehensive/area-consistency document (`:6550`). |
| C | `surveyPlanPreview.js:792`, `:811` | Identical to (B) in the preview payload (`:824-841` is the fall-through). |
| D | `MapLibreAreaView.vue:3160` (`trig-beacons`) and `:3191` (`survey-pegs`) | `'text-field': ['get','id']` — the raw name on the digitizing map. |
| E | `app-frontend/src/utils/coordinate-list.ts:610` | `pdf.text(point.pointId, …)` — raw name into the SI 727 coordinate schedule. |
| F | `diagram/beaconName.js:22` → `diagram/sidesTable.js:46` → `diagramPdf.js:159` and `diagramDxf.js:341` | `resolveVertexBeaconName` returns the stored name verbatim into the diagram's DIAGRAM S.G. No. column, PDF and DXF alike. |

`utils/automatedParcelDetector.ts` (`:415`, `:516`, `:694`, `:1018`, `:1142`) also
uppercases names, but only to *classify* (road reserve, corner letter, TSM). It
never emits a label. **Out of scope** — it is already case-insensitive and correct.

### Testing & plumbing

- `repairParcelBeaconNames` has **no test coverage of any kind**. It is defined at
  `MapLibreAreaView.vue:1604` and referenced once, from the button at `:43`. Nothing
  in any `__tests__` directory mentions it.
- **No batch-update endpoint exists.** `POST /land-parcels/batch`
  (`routes/landParcels.js:173`) is batch **create** only: it calls
  `LandParcel.create` (`:216`), does not accept `metadata` in its schema
  (`:186-200`), and loops non-transactionally anyway (`:214-239`). Every repair is
  N × `PUT /land-parcels/:id` (`:259`) from the frontend loop, exactly as today.
- `app-shared/` is importable from **both** sides: backend by relative path
  (`dxfGenerator.js:38`), frontend likewise
  (`views/modules/cadastral-standard/paperSizeOptions.ts:1`), and the frontend one
  is Vitest-covered (`__tests__/paperSizeOptions.test.ts`).
- Frontend is Vitest with no `@vue/test-utils`; the convention is to extract logic
  into a plain `.ts` and test that. Backend is Jest under
  `--experimental-vm-modules`.

## Decisions

Recorded because each rules out an approach that looked reasonable.

1. **Reconciliation stays a MANUAL trigger.** Settled by the surveyor and not
   revisited here. The 🔧 Repair Beacon Names button (`:42-49`) remains the only
   entry point; nothing runs on load. The load-time re-derivation at `:4032` stays
   exactly as it is — in memory, writing nothing — so the button remains the only
   thing that touches the database.
2. **Capitalisation scope is numeric-prefix + alpha-suffix ONLY — and only when the
   suffix is currently all-lowercase.** Settled, refined 2026-09-12 after the
   surveyor confirmed Unresolved #1: a mixed-case suffix such as `An` (as in
   `1464An`) is a deliberate, distinct naming form, not a capitalisation lapse, and
   must be preserved byte-for-byte. So `normalizeBeaconName` uppercases the suffix
   **only when `suffix === suffix.toLowerCase()`** — i.e. every letter in it is
   currently lowercase (`2474a` → `2474A`, `15b` → `15B`). A suffix that already
   contains any uppercase letter, mixed-case or not (`An`, `AN`, `Ab`), is left
   exactly as stored. A letter-only name with no numeric prefix (`A`, `SD4`,
   `TSM5025`, `PEGGINGB`) is never touched, matched or not — this part of the rule
   is unchanged from the reference sites at `SurveyPlanMapView.vue:1229` and
   `:4268`, which is why those two need the guard added in Part 4, not just be left
   as the reference.
3. **Fix capitalisation at every display site, NOT at the source.** Source-side
   normalisation — uppercasing `coordinate_points.name` on write — was considered
   and rejected on three grounds, each verified:
   - **There is no single source.** Names arrive through five endpoints plus the
     CSV parser, and — decisively — the names that the plan surfaces actually read
     live in `land_parcels.metadata` jsonb (`cape_lo_points`, `residuals.edges`,
     `vertices`, the OF's `points`), not in `coordinate_points` at all. Normalising
     the table would leave every snapshot untouched.
   - **It would manufacture Feature 1's bug.** Rewriting `2474a` → `2474A` in
     `coordinate_points` breaks the name-join that `findAffectedParcels:1262` and
     the rename propagation at `:1564` depend on, leaving every saved parcel stale
     — the exact condition the repair exists to undo.
   - **It can collide.** `(project_id, name)` is unique and case-sensitive
     (`coordinatePoint.js:200`), so uppercasing `2474a` in a project that also holds
     `2474A` fails the constraint, or silently merges two distinct beacons.
   A display-time helper is idempotent, needs no migration, cannot collide, and
   cannot desynchronise anything.
4. **One shared helper, in `app-shared/`.** `app-shared/beaconName.js` — a single
   pure module consumed by frontend and backend alike, following
   `si727SheetSizes.js` / `block-definitions.js`. The four regex dialects collapse
   into one. Copying a corrected regex to six more places is how four dialects
   became five.
5. **Feature 1 must rewrite `residuals.edges`, not just `cape_lo_points`** — and it
   does so by **re-running `areaCompute`**, not by patching names into the stored
   edges. Re-running is cheaper to get right (the edge shape is the backend's, at
   `edge-computation.js:53-63`) and self-consistent.
6. **A pure rename changes no area.** Confirmed, not assumed: `areaCompute` is
   `computeAreaConsistency(points, …)` (`routes/compute.js:143`) and every figure it
   returns — shoelace area, distance, bearing, `sumDy`/`sumDx`, `closureError` — is
   a function of `y`/`x` only; `id`/`name` are carried through
   (`edge-computation.js:55-56`) and never read arithmetically. A reconciliation that
   changes only names therefore **must produce byte-identical numbers**. That is
   asserted as a test, not trusted: it is the cheapest guard against a repair that
   quietly perturbs a surveyed area.
7. **Reconciliation is a separate concern from the vertex-drag-snap cascade — but
   shares its write step.** They are not the same operation:
   `rebuildAffectedParcels`'s mutation union is keyed by *one* point name
   (`:4720-4721`), which a reconciliation does not have; the cascade propagates a
   deliberate change outward from a beacon, while the repair re-derives names
   inward from position for every vertex of every parcel. Unifying them would force
   a `Set`-shaped mutation through an interface built for a scalar. What **is**
   shared is the per-parcel recompute-and-persist recipe, which already exists three
   times (`:4443`, `:4717`, `:4876`). Extract it once (Part 3) and let both callers
   use it. Feature 1 does not depend on `vertexSnap.ts` and must not wait for it.
8. **Ambiguity blocks the vertex, never the run.** When a second coordinate point
   sits within tolerance of the same vertex, the correct name is not knowable from
   position. The vertex is left untouched and reported by name, parcel and the
   competing candidates with their distances. The alternative — take the nearest and
   say nothing — is how a 3 mm floating-point difference silently renames a beacon.
9. **A repair that would duplicate a vertex name aborts that parcel, pre-flight.**
   If two vertices of one parcel resolve to the same beacon, the ring would list it
   twice — degenerate. Refuse the parcel, name it, write nothing for it. (Mirrors
   decision 7 of the vertex-drag-snap spec.)
10. **`description` is preserved.** The repair rewrites `id`, and rewrites
    `description` only when it equalled the old `id` — the rule the rename path
    already applies at `:1568`. Fixes the data loss at `:1665`.
11. **No backend change, no migration, no new endpoint.** For Feature 1,
    `updateLandParcel` + `refreshParcelsFromDatabase` carry everything, N writes as
    today. For Feature 2 the backend changes are label-rendering call sites only.

## Part 1 — Feature 1: the reconciliation plan (`beaconReconcile.ts`)

New pure module
`app-frontend/src/views/modules/cadastral-standard/beaconReconcile.ts`. All of the
decision logic, no Vue, no network, no MapLibre.

```ts
export interface BeaconCandidate { name: string; y: number; x: number
                                   description?: string; status?: string }

export type VertexOutcome =
  | { kind: 'unchanged';  index: number; id: string }
  | { kind: 'rename';     index: number; from: string; to: string; distanceM: number }
  | { kind: 'ambiguous';  index: number; id: string
      candidates: Array<{ name: string; distanceM: number }> }
  | { kind: 'unmatched';  index: number; id: string; nearestM: number | null }

export interface ParcelPlan {
  parcelId: number
  designation: string
  source: 'cape_lo_points' | 'vertices' | 'points'   // which metadata key holds the ring
  outcomes: VertexOutcome[]
  points: Array<{ id: string; y: number; x: number; status?: string; description?: string }>
  blocked?: { reason: 'duplicate-vertex' | 'ambiguous' | 'too-few-points'; detail: string }
}
```

| Function | Responsibility |
|---|---|
| `matchVertex(vertex, candidates, tolM)` | Nearest by Euclidean distance in Cape Lo metres. Returns `ambiguous` when a **second** candidate also falls within `tolM`; `unmatched` when none does (carrying the nearest distance, for the report); `unchanged` when the winner's name already equals `vertex.id`. |
| `planParcel(parcel, candidates, tolM)` | Runs `matchVertex` per vertex, resolves the ring from `cape_lo_points`, else `vertices`, else `points` (recording which in `source`), applies decisions 9 and 10, and sets `blocked` if any outcome is `ambiguous`, if two outcomes name the same beacon, or if fewer than 3 points survive. |
| `planReconciliation(parcels, coordinatePoints, tolM)` | Maps `planParcel` over every parcel and partitions into `writes` (changed and unblocked), `blocked`, and `unchanged`. **Pure — performs no writes.** |
| `summarise(plan)` | The human-readable report: per-parcel rename lines (`1425: "2474a" → "2474A" (0,003 m)`), the blocked list with reasons, and the counts. Replaces the ad-hoc string assembly at `:1692-1698`. |

`tolM` defaults to **0,5 m**, the figure already used at `:1638`, `:4050` and
`diagram/beaconName.js:8`.

**The Outside Figure is not special-cased.** It is an ordinary `land_parcels` row
whose designation contains "outside figure" (`:3836`, `:4208`), digitized and saved
through the same path, so it plans and writes like any other parcel — which is what
`repairParcelBeaconNames` already does today. One asymmetry is worth knowing and is
deliberately left alone: the on-load auto-update at `:4205-4270` re-derives the OF's
`metadata.points` and `metadata.residuals` on **every** load from the freshly
re-matched in-memory parcel, so the OF partially self-heals while ordinary parcels
do not. After Part 2 that write becomes redundant rather than wrong; removing it is
out of scope.

## Part 2 — Feature 1: rewiring `repairParcelBeaconNames`

The function keeps its name, its signature, its button and its manual-only trigger
(decision 1). Its body becomes three phases.

```
🔧 Repair Beacon Names
  └─ fetch  listLandParcels(projectId) + listCoordinatePoints(projectId)   (:1615, unchanged)
     └─ plan = planReconciliation(dbParcels, dbPoints, 0.5)                (pure)
        └─ confirm: a modal showing summarise(plan) — renames, blocks, counts
           ├─ Cancel  → nothing written
           └─ Proceed → for each plan.writes:
                          areaCompute(points, includeResiduals)            → residuals + edges
                          geom = closed Cape Lo ring
                          metadata = { …, cape_lo_points, residuals,
                                       closure_ratio, closure_error_m,
                                       points_count, beacon_names_repaired_at }
                          updateLandParcel(id, { geom, metadata })
                        then one refreshParcelsFromDatabase()
```

Four substantive changes from today:

- **`residuals` is regenerated** (decision 5). This is what actually fixes the
  reported symptom: the edge names the Area/Consistency PDF
  (`useAreaConsistencyPDF.ts:158`) and the plan views
  (`SurveyPlanMapView.vue:3798`, `:5852`) read are rebuilt from the repaired ring.
  `areaCompute` is called with `{ y, x, id, name: id }` — the
  `rebuildAffectedParcels:4757` shape, not the `recomputeAllParcels:4872` shape, so
  `edge.from.name` is populated too.
- **Confirm before write.** Today the alert is a *receipt* (`:1698`); it arrives
  after N `PUT`s. A plan is knowable before any write, so the surveyor sees the
  rename list first. This also makes ambiguities actionable rather than
  retrospective.
- **Outcomes replace the swallow.** The per-parcel `catch` at `:1687-1689` becomes
  an entry in an outcome list, and the closing report distinguishes *written*,
  *nothing to do*, *blocked* and *failed*. There is no cross-parcel transaction
  (no batch endpoint exists — see Context), so a partial failure is possible; the
  report must name which parcels were written and which were not, and instruct a
  re-run. Not a console warning. Same posture as the vertex-drag-snap spec's Part 3.
- **`description` preserved** (decision 10), replacing `:1665`.

Unchanged and deliberately so: the fresh-from-API fetch (`:1615-1618`), the
`isRecomputing` guard (`:1611`), the empty-parcel and empty-point early exits
(`:1620-1627`), and the in-memory cache sync (`:1676-1684`) — which becomes
redundant once `refreshParcelsFromDatabase` runs, but is not this feature's to
remove.

## Part 3 — The shared write step

`areaCompute → closureError → closed ring → metadata → updateLandParcel` exists
verbatim at `MapLibreAreaView.vue:4443-4514` (`commitVertexEdit`) and `:4717-4801`
(`rebuildAffectedParcels`), and in reduced form at `:4876-4894`
(`recomputeAllParcels`). Feature 1 needs it a fourth time.

Extract it once as `persistRecomputedParcel(parcelId, points, baseMetadata, stamp)`
and have the repair call it. The `|| 0.001` closure-error floor (`:4779`), the
`closure_ratio` string form, the generated-column omission (`area_m2`/`area_ha`/
`perimeter_m` are `GENERATED ALWAYS`, `migrations/040.do.sql:108-110`, and are
stripped by `services/spatial.ts:376`) and the inert GeoJSON `crs` member (`:4772`
— `LandParcel.update` re-derives the SRID from the project meridian) all carry over
unchanged. `stamp` is the metadata key: `beacon_names_repaired_at` here,
`point_edit_rebuilt_at` for the existing callers.

**Sequencing note.** The vertex-drag-snap plan
(`docs/superpowers/plans/2026-09-10-vertex-drag-snap.md`) also rewrites
`rebuildAffectedParcels` and deletes `commitVertexEdit`. Whichever lands second
inherits the merge. Doing this extraction here is the smaller change and leaves
that plan strictly simpler; it must not be deferred *into* that plan, because
Feature 1 is a bug fix and vertex-drag-snap is unbuilt (decision 7).

## Part 4 — Feature 2: `app-shared/beaconName.js`

```js
/** A beacon name's numeric stand prefix and trailing alpha suffix, or null. */
export function splitBeaconName(name)      // '2474a' → { prefix: '2474', suffix: 'a' }
                                           // 'SD4', 'A', 'TSM5025' → null
/** The name with an all-lowercase alpha suffix uppercased; unchanged otherwise. */
export function normalizeBeaconName(name)  // '2474a' → '2474A'; 'SD4' → 'SD4'
                                           // '1464An' → '1464An' (mixed case, untouched)
```

One regex: `/^(\d+)([A-Za-z]+)$/`, matching `dxfGenerator.js:1532`'s character
class. `normalizeBeaconName` uppercases the suffix **only when it is currently
all-lowercase** (decision 2, refined 2026-09-12) — `suffix === suffix.toLowerCase()`
is the guard, checked before `.toUpperCase()` is applied. A suffix already holding
any uppercase letter, `1464An` included, passes through unchanged. Both functions
are **total and idempotent**: any string in, a string (or `null`) out, never a
throw, and `normalizeBeaconName(normalizeBeaconName(n)) === n`.

**Call-site changes**, by the inventory in Context:

| Site | Change |
|---|---|
| `SurveyPlanMapView.vue:1209`, `:4250` | Replace the inline regex **and** the unconditional `prefixMatch[2].toUpperCase()` with `splitBeaconName` + `normalizeBeaconName`. **Not behaviour-preserving as of this refinement**: today these two sites uppercase every suffix unconditionally, including a mixed-case one — under the refined decision 2 they must stop doing that, so this is now a real, not cosmetic, change to the reference sites themselves. Also pass the `full`-branch names (`:1216`, `:1289`, `:4255`, `:4292`) through `normalizeBeaconName` — today even these sites emit the raw name when no suffix match occurs. |
| `pdfkitGeoPDF.js:2870-2903` (A) | `splitBeaconName`. Fixes both defects at once: `2474a` now matches, so it is placed **inside** its stand rather than rendered full-name outside, and the emitted suffix is normalised (uppercased only if all-lowercase) — which also lets the `/^[A-Z]+$/` gate at `:3014` apply the intended bold suffix font to an all-lowercase-turned-uppercase suffix; a mixed-case suffix such as `An` correctly fails that gate and keeps its plain font, since it was never a case lapse. |
| `MapLibreAreaView.vue:6192-6228` (B) | `splitBeaconName`; `displayLabel` becomes the normalised suffix, and the non-standard branch emits `normalizeBeaconName(beaconName)`. |
| `surveyPlanPreview.js:792-841` (C) | Same as (B). |
| `MapLibreAreaView.vue:3160`, `:3191` (D) | The `survey-pegs` / `trig-beacons` GeoJSON is built by `addSurveyPoints`; normalise the `id` **property** there so `'text-field': ['get','id']` needs no change. Display only — the underlying `coordinatePoints` entries and `dbPointIds` keys stay raw (decision 3). |
| `coordinate-list.ts:610` (E) | `pdf.text(normalizeBeaconName(point.pointId), …)`. |
| `diagram/beaconName.js:22` (F) | Return `normalizeBeaconName(String(name))`. One line fixes `diagramPdf.js:159` and `diagramDxf.js:341` together, since both read `coordinateRows[].beaconName` from `sidesTable.js:46`. |
| `dxfGenerator.js:1532` | `splitBeaconName`. The `uiLabel.text` branch (`:1522`) stays verbatim — it is fed by the now-normalised (1)/(2). |

**Not changed:** `automatedParcelDetector.ts` (classification only),
`beaconNameMatch.ts` (matching only), and every write path listed in decision 3.

**`1464An` — resolved 2026-09-12, no longer open.** The surveyor confirmed the
lowercase second character in a form like `1464An` is deliberate and carries real
meaning; it must render exactly as stored. Decision 2's all-lowercase guard is the
mechanism: `splitBeaconName('1464An')` still returns `{ prefix: '1464', suffix:
'An' }` — the shape is unchanged — but `normalizeBeaconName('1464An')` now returns
`'1464An'` unchanged, because `'An' !== 'an'`. This resolves what was Unresolved #1
in the first cut of this spec; the two `MapLibreAreaView.vue:6191` /
`surveyPlanPreview.js:791` comments documenting the form were correct, and the
reference sites' former unconditional `.toUpperCase()` was the actual bug for this
one case, not the rule to copy verbatim.

## Part 5 — Testing

TDD, following the extract-logic-and-test-the-`.ts` convention.

| File | Coverage |
|---|---|
| `views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts` *(new)* | `matchVertex`: nearest wins, not first; `ambiguous` when a second candidate is inside tolerance; `unmatched` past tolerance with the nearest distance reported; `unchanged` when the name already matches. `planParcel`: reads `cape_lo_points`, falls back to `vertices` then `points` and records `source`; preserves `description` unless it equalled the old id; blocks on duplicate assignment, on any ambiguity, and on <3 points. `planReconciliation`: a blocked parcel contributes zero writes and does not block its neighbours. |
| `views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts` — invariant | **A rename-only plan leaves every coordinate untouched**: `writes[].points` map 1:1 by index onto the input `y`/`x`, identical to full float precision. This is decision 6 asserted on the output. |
| `app-shared/__tests__/beaconName.test.js` *(new)* | `2474a`→`2474A`, `15b`→`15B`, `1464An`→`1464An` (**unchanged** — mixed-case suffix, decision 2), `2474A`→`2474A` (idempotent, all-uppercase), `1464AN`→`1464AN` (idempotent, all-uppercase). `null` from `splitBeaconName` for `A`, `SD4`, `TSM5025`, `PEGGINGB`, `''`, `'1425'` (digits only), `'2474A1'` (trailing digit) — but `splitBeaconName('1464An')` still returns `{ prefix: '1464', suffix: 'An' }`, since splitting and normalising are separate steps. Non-string and `undefined` input do not throw. |
| `app-backend/src/services/__tests__/` (existing PDF/DXF suites) | A beacon named with a lowercase suffix is placed **inside** its matching stand, labelled with the uppercase suffix — the `pdfkitGeoPDF.js:2870` regression, which is the one defect that changes *placement* and not merely case. |
| existing suites | `cd app-frontend && npm test`; `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js` for the whole backend suite. |

**Known regression risk, to check rather than assume.**
`pdfkitGeoPDF.snapshot.test.js` snapshots exact rendered text x/y for three
fixtures. Part 4's change to `pdfkitGeoPDF.js:2870` moves any lowercase-suffixed
beacon's label from outside the parcel to inside it — so if a fixture contains one,
that snapshot **will** fire, legitimately. Inspect the diff and confirm each moved
label corresponds to such a beacon before regenerating. Do not regenerate blind.

**Manual browser steps** (no component harness exists for `.vue` views):

1. On a project with parcels saved before a rename, open the digitizing map:
   peg labels show uppercase suffixes.
2. Click 🔧 Repair Beacon Names → the plan dialog lists the renames with distances
   before anything is written. Cancel → reload → nothing changed.
3. Re-run, Proceed → generate the Area/Consistency PDF: the From/To beacon columns
   carry the **new** names, and every area, distance and bearing is unchanged from
   the pre-repair PDF.
4. Generate the survey plan PDF and DXF: a lowercase-suffixed beacon is labelled
   with an uppercase suffix inside its own stand in both.
5. Generate a diagram: the DIAGRAM S.G. No. column shows uppercase suffixes; the
   DXF diagram matches.

## Resolved (confirmed with the user, 2026-09-12)

1. **`1464An` is a real, deliberate naming form and must not be touched.** See the
   Part 4 amendment above — `normalizeBeaconName` only uppercases an all-lowercase
   suffix, so a mixed-case suffix passes through unchanged. No documented exception
   list is needed; the guard is general.
2. **Ambiguity blocks, never resolves via a picker.** Confirmed: if two coordinate
   points legitimately sit within 0,5 m of each other (decision 8 already specified
   this behaviour as the safer default; the surveyor has now confirmed it as the
   only behaviour, not one of two candidates). The vertex is left untouched, and is
   reported by name, parcel, and the competing candidates with their distances, same
   as decision 8's original text. No pick-one-in-the-dialog affordance is built.

## Unresolved

1. **Should a partial repair failure be preventable rather than reported?**
   Inherited unchanged from the vertex-drag-snap spec's open question 2, and now
   confirmed: `POST /land-parcels/batch` is create-only
   (`routes/landParcels.js:216`), so preventing it needs a new batch-update endpoint
   sharing one transaction. Deliberately not in this pass. Revisit if a partial
   failure is seen in practice.

## Out of scope

- Any backend change beyond label rendering; no new endpoint, no migration, no
  batch-update transaction.
- Automatic reconciliation on load, on rename, or on CSV re-import (decision 1).
- Normalising `coordinate_points.name` or any stored name, in the database or at any
  write endpoint (decision 3).
- Capitalising letter-only names, or any name not matching `^(\d+)([A-Za-z]+)$`
  (decision 2).
- Building, or depending on, `vertexSnap.ts` and the vertex-drag-snap cascade.
- Consolidating the five spatial matchers onto one tolerance and one
  nearest-vs-first rule. Feature 1 adds no sixth; the existing five stay.
- Removing the Outside Figure's on-load auto-update (`MapLibreAreaView.vue:4205-4270`)
  once Part 2 makes it redundant.
- Reconciling a vertex that matches **no** beacon within tolerance. It is reported
  as `unmatched` and left alone; placing it is the vertex-drag-snap feature's job.
- `AreaComputationView.vue` (deprecated Leaflet viewer).
- The `savedParcels` key-precedence contradiction (`:4193` vs `:5599`) beyond not
  depending on it — the repair reads `listLandParcels` rows directly, as it already
  does.

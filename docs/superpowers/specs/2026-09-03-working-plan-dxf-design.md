# Working Plan as DXF — replacing the SI 727 sheet with a purpose-built one

## Problem

The Working Plan module does not produce a working plan.

`app-frontend/src/views/modules/cadastral-standard/WorkingPlanView.vue` is a
56-line wrapper that renders `SurveyPlanMapView` with `planType: 'working-plan'`.
That plan type is inert: neither `dxfGenerator.js` nor `pdfkitGeoPDF.js` contains
a single `working-plan` branch. So a "Working Plan" today is an SI 727 General
Plan with a different heading above it.

A working plan is a different document. It is the sheet a surveyor works from in
the field and during calculations: A4, beacon symbols, a coordinate grid, parcel
rings and areas — not a statutory General Plan.

## What is being integrated

A reverse-engineered, zero-dependency ESM module supplied as
`workin plan reverse engineered.zip`, with porting notes in `INTEGRATION.md`.

| File | Purpose |
|---|---|
| `dxf-r12.js` | Minimal DXF R12 writer (`DxfDocument`): LINE, POLYLINE, CIRCLE, POINT, SOLID, TEXT, INSERT, blocks, layers, linetypes, text styles |
| `working-plan.js` | `generateWorkingPlan(spec)` — sheet layout, symbols, grid, title block, approval box, locality inset |
| `generate-brackenhurst.mjs` | Worked example rebuilding the Brackenhurst 403–405 sheet from the final coordinate list |
| `Working_Plan_generated.dxf` | Reference output |

`generateWorkingPlan(spec)` returns
`{ dxf, scale, gridInterval: { e, n }, gridTicks, areas }`.

### Verified before designing, not assumed

- The module **runs unmodified** in this repo's Node (v22) and reproduces its
  documented output exactly. The DXF it generated here is **byte-identical** to
  the shipped reference (32,706 bytes, `cmp` clean).
- `app-backend/package.json` is already `"type": "module"`, so INTEGRATION.md's
  step 1A applies: no `.mjs` renaming, no dynamic-import workaround.
- Its coordinate convention — `DXF easting = -Y(Lo)`, `DXF northing = -X(Lo)` —
  is **exactly** `capeLoToDxfSouthUp` in `dxfGenerator.js:256`, which returns
  `{ x: -y, y: -x }`. This is the likeliest source of silent breakage in a port
  and it already agrees.
- `working-plan` is **already a first-class plan type**: `planTypes.ts` gives it
  `PLAN_TYPE_META['working-plan']` (whole-set, no summary), and
  `planTypeOutputSubdir` already routes it to `output/working-plans/`. The
  plumbing exists; only the renderer is missing.

### The risk that turned out not to exist

The module wants parcels as rings of **beacon names**
(`ring: ['SD4','86B','87B','SD1','SD5']`), while our parcels are polygons.
INTEGRATION.md §6 supplies SQL to snap ring vertices back to beacon names by
proximity, which implies the author hit this problem — and proximity snapping
fails in the worst way, producing a plausible wrong plan rather than an error.
This codebase already carries such a matcher: `beaconsForParcel` in
`planPayload.ts` links beacons to rings by coordinate coincidence at
`VERTEX_TOL = 0.05` m, because "beacon features carry no parcel id".

We do not need it. `land_parcels.metadata.cape_lo_points` already stores each
ring as **named** points, in ring order:

```json
{"x":2144027.04,"y":-85673.91,"id":"SD4","status":"P","description":"12mm iron peg in concrete"}
```

`id` is the beacon name and `x`/`y` map straight onto the module's `X`/`Y` with
no conversion. No snapping, no tolerance, no nearest-neighbour ambiguity.

## Decisions taken

**Replace, not add.** The Working Plan stops routing its DXF through
`SurveyPlanMapView`'s SI 727 pipeline and produces this A4 sheet instead. The
current SI 727-style Working Plan DXF goes away — deliberately.

**DXF now, matching PDF later.** The module emits DXF only. The Working Plan PDF
continues to come from the existing pipeline for now, so the two will not match
in layout. That inconsistency is accepted and explicitly temporary: a matching
A4 working-plan PDF is follow-up work, not a silent omission.

## Design

### 1. Vendored module

`dxf-r12.js` and `working-plan.js` are copied **verbatim** into
`app-backend/src/services/workingPlan/`. Unmodified matters: it keeps them
re-syncable against upstream, and confines our adaptation to one adapter file
instead of scattering edits through 20 KB of vendored code.

`generate-brackenhurst.mjs` is not vendored. Its `spec` object becomes a test
fixture (below), which is the part with lasting value.

### 2. Adapter — in the frontend, beside `planPayload.ts`

`app-frontend/src/views/modules/cadastral-standard/workingPlanSpec.ts`.

The adapter belongs on the frontend, not the backend, because that is where the
data already is and where every other plan payload is built. `SurveyPlanMapView`
holds `coordinatePoints.value` (the final coordinate list) and `parcels.value`
(each with `metadata.cape_lo_points`), and it has already applied the
swapped-coordinate correction that `exportBeaconsAsGeoJSON` performs. Rebuilding
that in a backend route would duplicate live logic and invite divergence.
`planPayload.ts` — pure, unit-tested, no Vue — is the precedent this follows.

```ts
buildWorkingPlanSpec(ctx: WorkingPlanSpecContext): WorkingPlanSpec
```

| Spec field | Source |
|---|---|
| `beacons` | the final coordinate list → `{ name, X: x, Y: y, symbol, label: 'auto' }` |
| `parcels` | `{ label: stand, ring: metadata.cape_lo_points.map(p => p.id) }`, **excluding the Outside Figure** |
| `title` | up to four lines: "Survey of", designation, parent property, district |
| `certificate` | `{ line1, line2 }` from surveyor name and survey date |
| `scale` | `'auto'` — the module picks and reports it |

Only beacons a ring actually names are emitted, so the coordinate list's control
and reference points do not inflate the sheet extent.

**The Outside Figure is excluded.** It is the one member of `parcels.value` that
is not a stand, and the SI 727 path already treats it specially:
`exportParcelsAsGeoJSON` tags it `isOutsideFigure: true` so the backend
suppresses its label. Without the same handling here the module draws it as an
ordinary parcel and prints its `stand` string — which contains the words
"Outside Figure" — across the centre of the sheet. It is skipped silently, not
reported in `skippedParcels`: that list warns about parcels that *failed* to
resolve, and burying a by-design exclusion in it would train surveyors to ignore
a real warning.

**Symbol mapping, flagged as a judgement call.** The module takes `peg`, `rm` or
`trig`. We store `status` (`F` found / `P` placed) plus a free-text description.
Both statuses map to `peg`; `rm` and `trig` are used only when the description
says so ("reference mark", "RM", "trig"). Status describes whether a beacon was
found or placed, not what kind of beacon it is, so it cannot drive the symbol on
its own. This is the one mapping that can misrepresent a beacon on the plan, and
it is deliberately conservative: an unrecognised description draws a peg rather
than guessing.

### 3. Backend route — stateless, like the DXF route beside it

`app-backend/src/routes/workingPlan.js`, registered in `server.js` with an
explicit prefix, following the `control-points` / `parcels` / `survey-plan`
pattern already there:

```
app.register(route.default, { prefix: '/api/working-plan' })

POST /api/working-plan/dxf   body: the spec   ->   application/dxf
```

It takes the spec in the request body rather than a project id. This mirrors
`POST /api/geopdf/dxf` in `geopdf-vector.js`, which likewise receives
frontend-assembled parcels and beacons and touches no database. The route
therefore needs no schema-isolation handling, because it makes no query — which
is also why the adapter is not here.

Scale, grid interval and computed areas come back on `x-plan-scale`,
`x-plan-grid` and `x-plan-areas` headers.

`generateWorkingPlan` throws exactly one error —
`generateWorkingPlan: unknown beacon "<name>"` (`working-plan.js:160`) — when a
ring names a beacon absent from the beacon list. That is a data problem the
surveyor can act on, so it returns 400 with the beacon name intact, not a 500.

### 4. Frontend wiring — one branch, nothing else

In `SurveyPlanMapView.vue`'s `generatePlanDocuments`, the DXF step currently
reads:

```ts
if (exportFormats.dxf) {
  const dxfPayload = { ...payload, scale: usedScale || payload.scale, sheetSize: ... }
  const { blob, warningCount, warningsSummary } = await generateDXF(dxfPayload)
  docs.dxf = blob
```

For `planType === 'working-plan'` it calls the new endpoint instead and assigns
`docs.dxf`. Everything downstream is already correct and untouched:
`composePlanBaseName` names the file, `planTypeOutputSubdir('working-plan')`
returns `working-plans`, and `saveWithOverwritePrompt({ workingDirectory, subdir,
fileName, blob }, confirmOverwrite)` writes it with the 409-EXISTS prompt.

No change to `documentStorage.ts`. Plans do not go through `saveDocument` and
have no `documentType`; they use the plan-file path above, whose argument is
already called `blob`.

`WorkingPlanView.vue` is unchanged. It already sets `planType: 'working-plan'`,
which `SurveyPlanMapView` picks up at line 715.

### 5. Areas

`generateWorkingPlan` returns `areas` computed from the plotted ring
coordinates. These are **not** a substitute for the SI 727 area computation and
must not be written back as parcel areas. They are useful only as an independent
cross-check, and the route surfaces them on a header for exactly that.

## Testing

**Golden test — the load-bearing one.** Backend Jest. The Brackenhurst spec,
lifted verbatim from `generate-brackenhurst.mjs`, must produce a DXF
byte-identical to the shipped reference. This holds today (verified with `cmp`),
so it pins the vendored module against accidental edits permanently. If someone
"tidies" `working-plan.js`, this fails immediately and specifically.

**Route test.** Backend Jest: a valid spec returns the DXF body with the three
headers; a ring naming a missing beacon returns 400 carrying that beacon's name.

**Adapter tests.** Frontend Vitest, beside `planPayload.test.ts`:
- rings map to the beacon names in `cape_lo_points`, in ring order;
- a beacon shared between adjoining parcels appears once in `beacons` and in
  both rings;
- coordinate-list points that no ring names are excluded;
- symbol mapping, including a description that yields `rm` and one that falls
  back to `peg`.

**No golden test for other jobs.** See below.

## Risks

**The worked example is this very survey.** The module's example beacons
(`SD1` at 2144017.17 / −85765.13) are from the same Brackenhurst job as our
fixture data. The byte-identical reproduction therefore demonstrates fidelity
for *this* survey and considerably less about others. The first genuinely new
evidence comes from a different job with different beacon naming, and until then
the golden test guards the module's stability, not its generality.

**The vendored module emitted invalid R12, and every automated check missed
it.** `dxf-r12.js` wrote group code 370 (lineweight) on each LAYER entry while
declaring `$ACADVER = AC1009`. Group 370 arrived with AutoCAD 2000; in an R12
file AutoCAD rejects the entire drawing. Nothing caught it: the golden test
compared bytes against a reference carrying the same defect, `ezdxf` parsed and
audited the file with zero errors and zero fixes, and the route and integration
tests asserted status, headers and absence of `NaN` -- all of which passed while
the sheet would not open. Only opening it in AutoCAD failed.

The module is therefore now a deliberate one-line fork of upstream, the golden
fixture was regenerated from the corrected code (32,706 -> 32,615 bytes), and a
new invariant test rejects ANY group code that postdates the declared DXF
version. That invariant matters more than the byte comparison: byte-matching
only pins drift from a known file, and the known file was wrong.

The lesson generalises past this bug: a DXF is not verified because a library
parsed it. Lenient parsers accept what AutoCAD refuses, so a CAD deliverable
needs opening in CAD before anyone calls it done.

**Replacement removes the current output.** The SI 727-style Working Plan DXF
disappears the moment this ships. That is the decision taken, recorded here so it
is not discovered later as a regression.

**PDF and DXF will not match** for Working Plans until the follow-up PDF work
lands.

**Parcels without `cape_lo_points`.** Parcels imported from QGIS carry no
`cape_lo_points` — `MapLibreAreaView.vue:5604` already tests for exactly that.
Such a parcel cannot yield a named ring, so it is skipped with a warning rather
than proximity-matched, and the caller is told which parcels were omitted.

## Out of scope

- The matching A4 working-plan PDF.
- Any change to General Plan or Diagram generation.
- Writing the module's computed areas back to `land_parcels`.
- The `existing`, `roads`, `notes` and `inset` spec fields. The module supports
  them and the golden fixture exercises them, but we have no data model for
  dashed parent boundaries, road offsets or locality insets, so the adapter
  omits them rather than faking them.

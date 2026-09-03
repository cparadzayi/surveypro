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
| `dxf-r12.js` | Minimal DXF R12 writer: LINE, POLYLINE, CIRCLE, POINT, SOLID, TEXT, INSERT, blocks, layers, linetypes, text styles |
| `working-plan.js` | `generateWorkingPlan(spec)` — sheet layout, symbols, grid, title block, approval box, locality inset |
| `generate-brackenhurst.mjs` | Worked example rebuilding the Brackenhurst 403–405 sheet from coordinates |
| `Working_Plan_generated.dxf` | Reference output |

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

### The risk that turned out not to exist

The module wants parcels as rings of **beacon names**
(`ring: ['SD4','86B','87B','SD1','SD5']`), while our parcels are PostGIS
polygons. INTEGRATION.md §6 supplies SQL to snap ring vertices back to beacon
names by proximity, which implies the author hit this problem — and proximity
snapping fails in the worst way, producing a plausible wrong plan rather than an
error.

It is unnecessary here. `land_parcels.metadata.cape_lo_points` already stores
each ring as named points:

```json
{"x":2144027.04,"y":-85673.91,"id":"SD4","status":"P","description":"12mm iron peg in concrete"}
```

`id` is the beacon name and `x`/`y` map straight onto the module's `X`/`Y` with
no conversion. No snapping, no tolerance, no nearest-neighbour ambiguity.

## Decisions taken

**Replace, not add.** The Working Plan module stops routing its DXF through
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

### 2. Adapter — `buildWorkingPlanSpec`

`app-backend/src/services/workingPlan/buildWorkingPlanSpec.js`. The only file
that knows both our data model and the module's spec.

```
buildWorkingPlanSpec({ parcels, metadata, surveyorInfo }) -> spec
```

| Spec field | Source |
|---|---|
| `beacons` | union of `metadata.cape_lo_points` across parcels → `{ name: p.id, X: p.x, Y: p.y, symbol, label: 'auto' }` |
| `parcels` | `{ label: stand, ring: cape_lo_points.map(p => p.id) }` |
| `title` | project designation and district, up to 4 lines |
| `certificate` | surveyor name and survey date |
| `scale` | `'auto'` — the module picks and reports it |

De-duplication is by name: a beacon shared between adjoining parcels appears
once, and the ring references it from both.

**Symbol mapping, flagged as a judgement call.** The module takes `peg`, `rm` or
`trig`. We store `status` (`F` found / `P` placed) plus a free-text description.
Both statuses map to `peg`; `rm` and `trig` are used only when the description
says so ("reference mark", "RM", "trig"). Status describes whether a beacon was
found or placed, not what kind of beacon it is, so it cannot drive the symbol on
its own. This is the one mapping that can misrepresent a beacon on the plan, and
it is deliberately conservative: an unrecognised description draws a peg rather
than guessing.

### 3. Backend route

`app-backend/src/routes/workingPlan.js`, registered in `server.js` with an
explicit prefix, following the `control-points` / `parcels` / `survey-plan`
pattern already there:

```
app.register(route.default, { prefix: '/api/working-plan' })

POST /api/working-plan/:projectId/dxf  ->  image/vnd.dxf
```

Schema-aware, so it reads the surveyor's own `land_parcels` — the same mistake
the Reset Import bug made (an unqualified lookup resolving to `public`) must not
be repeated here. Returns the DXF body with `x-plan-scale`, `x-plan-grid` and
`x-plan-areas` headers, matching INTEGRATION.md.

`generateWorkingPlan` throws exactly one error —
``unknown beacon "<name>"`` (`working-plan.js:160`) — when a ring names a beacon
absent from the beacon list. That is a data problem the surveyor can act on, so
it returns 400 with the beacon name intact rather than a 500.

Generation stays in the backend, consistent with `dxfGenerator.js`.

### 4. Frontend

`WorkingPlanView.vue` calls the endpoint for its DXF instead of delegating to
`SurveyPlanMapView`, and saves through the existing output-folder convention
with its 409-EXISTS overwrite gate.

`documentStorage.ts` gains one `documentType: 'working-plan'` and its output
subfolder — additive, touching no existing type.

It also needs one small rename. `SaveDocumentOptions.pdfBlob` is PDF-named but
already format-agnostic in behaviour: it is appended to the form as a plain
`file`. A DXF would pass through it unchanged, but writing
`pdfBlob: dxfBlob` at every working-plan save bakes a falsehood into the call
site. The field becomes `blob`, updating its existing callers — mechanical, and
the honest option.

### 5. Areas

`generateWorkingPlan` returns `areas` computed from the plotted ring
coordinates. These are **not** a substitute for the SI 727 area computation and
must not be written back as parcel areas. They are useful only as an independent
cross-check, and the route surfaces them on a header for exactly that.

## Testing

**Golden test — the load-bearing one.** The Brackenhurst spec must produce a DXF
byte-identical to the shipped reference. This holds today (verified with `cmp`),
so it pins the vendored module against accidental edits permanently. If someone
"tidies" `working-plan.js`, this fails immediately and specifically.

**Adapter tests**, against project 20's real stored parcels:
- rings map to the beacon names in `cape_lo_points`, in order;
- a beacon shared between adjoining parcels appears once in `beacons` and in
  both rings;
- symbol mapping, including a description that should yield `rm` and one that
  should fall back to `peg`;
- a ring naming a beacon absent from the beacon list surfaces the module's
  message with the name in it, not a 500.

**No golden test for other jobs.** See below.

## Risks

**The worked example is this very survey.** The module's example beacons
(`SD1` at 2144017.17 / −85765.13) are from the same Brackenhurst job as our
fixture data. The byte-identical reproduction therefore demonstrates fidelity
for *this* survey and considerably less about others. The first genuinely new
evidence comes from a different job with different beacon naming, and until then
the golden test guards the module's stability, not its generality.

**Replacement removes the current output.** The SI 727-style Working Plan DXF
disappears the moment this ships. That is the decision taken, recorded here so it
is not discovered later as a regression.

**PDF and DXF will not match** for Working Plans until the follow-up PDF work
lands.

## Out of scope

- The matching A4 working-plan PDF.
- Any change to General Plan or Diagram generation.
- Writing the module's computed areas back to `land_parcels`.
- `existing`, `roads` and `notes` spec fields: the module supports them, we have
  no data model for them yet, and they are omitted rather than faked.

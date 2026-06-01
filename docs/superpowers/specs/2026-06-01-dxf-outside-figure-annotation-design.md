# DXF Outside-Figure Annotation — Design

**Date:** 2026-06-01
**Status:** Approved (design)
**Component:** `app-backend` — `services/dxfGenerator.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, 14,222 lines). This is the
**first** of six independent sub-projects in that re-baselining; the others
(beacon enrichment, title-block SI 727 lines, schedule-of-areas multi-column,
cartographic label collision avoidance, multi-sheet tiling) get their own
spec → plan → implementation cycles.

## Purpose

The current DXF export draws the outside-figure boundary as a single
`POLYLINE` but adds no annotation: no vertex coordinate labels, no boundary
tick marks, no per-edge distance/bearing labels. On a real survey plan
exported from `pdfkitGeoPDF.js`, the outside figure carries Cape Lo (Y, X)
coordinates at every vertex plus distance + bearing on every edge — the
information a surveyor needs to verify the figure independently of the
parcel detail. The PDF/DXF visual divergence is most pronounced at the
outside figure; closing that gap is the highest-impact step in the parity
re-baseline.

Goal: **emit, on the DXF, every annotation `pdfkitGeoPDF.js` places on or
around the outside-figure boundary**, at the functional-minimum quality
level (no collision avoidance — that ships as a later sub-project).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Sub-project priority | Outside-figure annotation first; beacon enrichment, title-block SI 727 lines, schedule multi-column, label collision avoidance, multi-sheet tiling deferred to their own specs |
| Annotation sophistication | Functional minimum — tick + label at each vertex, distance + bearing at each edge midpoint, no collision detection |
| File structure | Approach A — extend `dxfGenerator.js` in place (~1,200 → ~1,400 lines) |
| New layer | One — `OUTSIDE_FIGURE_LABELS` (color 8 dark grey); total layer count goes 12 → 13 |
| Edge label layers | Reuse existing `DISTANCES` + `DIRECTIONS` (so toggling CAD layers hides parcel + OF labels together) |
| Coordinate label precision | Whole metres (`Y=50000 X=2200000`) — sub-metre precision is noise at typical paper scales |
| Tick direction (functional minimum) | Centroid-to-vertex unit vector; angle-bisector approach deferred |
| DXF version target | R12 (AC1009) unchanged |

## Conventions (carried)

Cape Lo P(Y, X): Y = Westing, X = Southing. Bearings are South-oriented
(0° = +X, 90° = +Y), formatted via the existing `degToDMS()` helper.
Coordinate transform `capeLoToDxfSouthUp` produces DXF X = Cape Lo Y,
DXF Y = Cape Lo X (south-up orientation, established by the prior parity
work). All paper-mm sizes scale to ground via the existing `mm()` shorthand.

## Architecture

Single file change: `app-backend/src/services/dxfGenerator.js`.

Three structural moves:

1. **One new layer** appended to the `layers` array — `OUTSIDE_FIGURE_LABELS`
   (color 8). The existing 12 layers (including `DISTANCES` + `DIRECTIONS`,
   which we reuse) stay untouched. Layer-table assertion in the integration
   test updates from 12 to 13 required layers.

2. **One helper + three emitters** added inside `generateDXF()`'s closure:
   - `computeOutsideFigureVertices(outsideFigureData)` — returns the ordered
     vertex list with closing duplicate, filtering non-finite entries.
   - `addOutsideFigureVertexLabels(layer, vertices, centroidGround)` — TEXT
     entities reading `"Y=<westing> X=<southing>"` at each vertex, offset
     outward.
   - `addOutsideFigureTickMarks(layer, vertices, centroidGround)` — short
     LINE ticks at each vertex pointing outward.
   - `addOutsideFigureEdgeLabels(distLayer, dirLayer, vertices, edges, centroidGround)`
     — distance + bearing TEXT at each edge midpoint, placed on the existing
     `DISTANCES` and `DIRECTIONS` layers.

3. **One new invocation block** in the existing OF rendering section
   (around line 322, just after `addPolyline('OUTSIDE_FIGURE', polyOFPts)`),
   wired only when `outsideFigureData?.edges?.length >= 3`.

After the change, the OF rendering section grows from ~10 lines (polyline +
extent tracking) to ~30 lines (polyline + centroid + three new emitter
calls). The emitter implementations themselves live with the other chrome
emitters higher in `generateDXF()`'s closure.

## Components

### a. `computeOutsideFigureVertices(outsideFigureData)`

Walks `outsideFigureData.edges`; each `edges[i]` carries the **start**
vertex of edge i (`{ pointId, y, x }`). Returns an ordered
`[{ y, x, pointId }, …]` array around the boundary with the closing
duplicate included (so consumers can pair `vertices[i]` with
`vertices[i+1]` without index-modulo wraparound). Mirrors the shape the
existing `masterVerticesFromOfd` helper in `app-frontend/src/utils/ofdClipping.ts`
produces on the frontend.

Behaviour:

- Empty or missing `edges` → returns `[]`.
- Each edge's `{ y, x }` is validated as finite + within plausible Cape Lo
  bounds (`|coord| ≤ 1e7`); non-finite vertices are filtered out and the
  caller bumps `warnings.summary.outsideFigureVertices`.
- The closing duplicate is the first valid vertex appended to the end.

### b. `addOutsideFigureVertexLabels(layer, vertices, centroidGround)`

For each non-duplicate vertex V, emit one TEXT entity on `layer`
(`OUTSIDE_FIGURE_LABELS`) reading `"Y=<westing> X=<southing>"` with Cape Lo
values formatted via `Math.round(v.y)` and `Math.round(v.x)` (whole metres).

Anchor:

- Centroid-to-vertex unit vector: `n = normalise(V_DXF − centroidGround)`.
- Label position: `V_DXF + n · mm(5)` (5 mm offset on paper, scaled to ground).
- Text height: `mm(2)`.
- Rotation: 0 (horizontal — surveyors expect coordinate labels readable as
  paper text, not following the boundary edge).

If `|V_DXF − centroidGround| < 1e-6` (degenerate centroid relative to
vertex), fall back to `n = { x: 1, y: 0 }` and log once via `logger.warn`.

### c. `addOutsideFigureTickMarks(layer, vertices, centroidGround)`

For each non-duplicate vertex V, emit one LINE on `layer` pointing outward:

- Same `n = normalise(V_DXF − centroidGround)` as the labels.
- LINE from `V_DXF` to `V_DXF + n · mm(3)` (3 mm tick on paper).

This is the "I am here" indicator on the boundary; each tick + label pair
identifies a corner.

The functional-minimum centroid-to-vertex direction works for convex
outside figures. The pdfkit version uses an angle-bisector approach for
concave corners — that's a future iteration if real-world output shows
ticks pointing inward at re-entrant vertices.

### d. `addOutsideFigureEdgeLabels(distLayer, dirLayer, vertices, edges, centroidGround)`

For each edge i (`vertices[i] → vertices[i+1]`):

- Midpoint `M = (vertices[i]_DXF + vertices[i+1]_DXF) / 2`.
- Outward perpendicular `n`: with edge direction `(dx, dy) = (B − A)/‖B − A‖`,
  initialise `n = (-dy, dx)` (counter-clockwise 90° rotation), then flip
  the sign if `n · (M − centroidGround) < 0` so the final vector always
  points away from the polygon centre regardless of the edge's traversal
  direction.
- Distance text:
  - Prefer `edges[i].distance` if numeric.
  - Else parse `edges[i].distance` as float.
  - Else derive from `‖vertices[i+1]_DXF − vertices[i]_DXF‖`.
  - Format `n.toFixed(2)` (e.g., `"100.00"`).
- Bearing text:
  - Prefer `edges[i].direction` if it's a non-empty string matching DMS
    pattern (`/\d+°\d+'\d+"/`).
  - Else derive South-oriented bearing from the vertex delta and format
    via `degToDMS()`.
- Distance TEXT on `distLayer` (`DISTANCES`) at `M + n · mm(3)`,
  height = existing `distHeight` already in scope.
- Bearing TEXT on `dirLayer` (`DIRECTIONS`) at `M + n · mm(6)` (stacked
  outside the distance, matching the parcel-edge spacing convention),
  height = existing `bearHeight`.
- Text rotation: angle of the edge in degrees, normalised so text reads
  upright using the existing parcel-edge idiom: `if (ang > 90 || ang < -90) ang += 180`.

Reusing `DISTANCES` + `DIRECTIONS` rather than emitting on
`OUTSIDE_FIGURE_LABELS` is a deliberate choice: a surveyor toggling the
`DISTANCES` layer in CAD sees/hides *every* distance label in one motion,
parcel or OF.

### e. Wiring inside `generateDXF()`

Around line 322, just after `addPolyline('OUTSIDE_FIGURE', polyOFPts)`,
guarded by the existing `if (outsideFigureData?.edges?.length)`:

```js
const ofVerts = computeOutsideFigureVertices(outsideFigureData)
if (ofVerts.length >= 3) {
  const ofDxfPts = ofVerts.slice(0, -1).map(v => capeLoToDxfSouthUp(v.y, v.x))
  const ofCentroid = shoelaceCentroid(ofDxfPts)
  addOutsideFigureVertexLabels('OUTSIDE_FIGURE_LABELS', ofVerts, ofCentroid)
  addOutsideFigureTickMarks('OUTSIDE_FIGURE_LABELS', ofVerts, ofCentroid)
  addOutsideFigureEdgeLabels('DISTANCES', 'DIRECTIONS',
                              ofVerts, outsideFigureData.edges, ofCentroid)
}
```

## Data flow

No new request fields, no new TypeScript surface, no frontend payload
changes. All inputs the new emitters consume are inside
`options.outsideFigureData`, which already arrives on
`POST /api/geopdf/dxf` and is already used by the existing OF polyline
emitter at line 322.

### Existing `outsideFigureData` shape

```ts
{
  edges: Array<{
    side: string         // e.g. "A-B"
    distance: number | string  // metres along this edge
    direction: string    // DMS string, e.g. "90°00'00\""
    pointId: string      // the START vertex of this edge
    y: number            // Cape Lo westing of the start vertex
    x: number            // Cape Lo southing of the start vertex
  }>
  constants: { pointId: string; y: number; x: number }   // unused by this work
}
```

### Field provenance

| New content | Source | Default when missing |
|---|---|---|
| Vertex coord labels (`Y=… X=…`) | `edges[i].y`, `edges[i].x` | vertex skipped, no label, no tick |
| Vertex tick LINEs | same | vertex skipped |
| Edge distance text | `edges[i].distance` (number or numeric string), else `‖Δ‖` from vertex pair | label omitted for that edge only |
| Edge bearing text | `edges[i].direction` (DMS string), else South-oriented bearing derived via `degToDMS()` | label omitted for that edge only |
| Outward normal | `(vertex − centroid)` normalised; centroid via `shoelaceCentroid` | falls back to `{ x: 1, y: 0 }` on degenerate centroid |

### Generator signature unchanged

```js
export function generateDXF(options, logger): { buffer, warnings }
```

The new emitters mutate `dxf` and `warnings` through the existing closure;
no extra parameters threaded. The frontend `services/geopdf.ts`'s
`VectorGeoPDFRequest` interface stays as-is.

## Error handling

The generator's contract from the prior parity work is preserved: always
returns `{ buffer, warnings }`, never throws to the user, failures are
logged + counted + surfaced through the response headers.

### Per-entity behaviour

**Per-vertex guards.** Before computing any label or tick for a vertex,
check finiteness + plausibility bound (`|coord| ≤ 1e7`). The check happens
once per vertex inside `computeOutsideFigureVertices` (the filter step); a
non-finite vertex bumps `warnings.summary.outsideFigureVertices` exactly
once and is omitted from the vertex list both emitters consume. No
double-counting.

**Per-edge guards.** An edge is skipped (no distance + bearing labels)
when either endpoint is non-finite (already filtered out at vertex stage)
or the edge length is zero (`‖vertices[i+1] − vertices[i]‖ < 1e-6`). No
separate warning category — the vertex warning already accounts for the
upstream issue.

**Degenerate centroid.** If `shoelaceCentroid` returns a near-zero-area
result (collinear vertices), the outward-normal computation falls back to
a fixed `{ x: 1, y: 0 }` direction and `logger.warn` fires once. No
warning bumped — degenerate outside figures are upstream data problems,
not renderer problems.

### Warnings aggregator extension

One key added to the existing `warnings.summary` initialiser inside
`generateDXF()`:

```js
const warnings = {
  count: 0,
  summary: {
    beacons: 0,
    parcels: 0,
    outsideFigureVertices: 0,   // NEW
    scaleFallback: false,
    beaconDescTruncated: 0,
    priorDiagramsTruncated: 0,
    nonAscii: false,
  },
}
```

The `warn(category, n)` helper handles it identically to the existing
numeric categories. The route's `X-DXF-Warnings` header serialises the
full summary object; the frontend toast composer iterates the keys.
Both flows already work without code changes — only the initialiser line
is new.

### Layout overflow

Labels live **outside** the polygon (vertex labels at `V + n · mm(5)`,
ticks at `V + n · mm(3)`, edge labels at `M + n · mm(3..6)`). On a
tight-fit drawing the labels can spill into the margin or beyond the
drawing border. Functional minimum does not fix this — the surveyor sees
the overflow in CAD and either re-exports at a smaller scale or moves the
labels manually. No truncation, no extra warning.

### Hard failures (still 500)

Unhandled exceptions still return 500 with `{ error: message }`. None of
the new emitters introduce throw paths: all math uses safe operations
(`+`, `-`, `*`, `Math.sqrt`, `Math.atan2`); no division by raw user input;
no JSON.parse on untrusted strings.

## Testing

Three layers. ~80 lines of new test code total.

### Layer 1 — Unit tests (`__tests__/dxfGenerator.test.js`)

Two new test suites added beside the existing ones:

**`computeOutsideFigureVertices`**:

- Walks a 4-edge fixture and returns 5 entries (4 unique + closing duplicate)
  with `pointId`s in the expected order.
- Returns `[]` when `edges` missing or empty.
- Filters non-finite vertices from the output.

**Warnings aggregator extension**:

- An OF with one NaN vertex produces `warnings.summary.outsideFigureVertices === 1`.

### Layer 2 — Integration tests (`dxfGenerator.integration.test.js`)

The existing fixture's `outsideFigureData` is a 4-vertex square at
known Cape Lo coordinates; it exercises every emitter without
modification. Four new tests:

- `OUTSIDE_FIGURE_LABELS` layer is declared exactly once.
- Exactly 4 TEXT entities (vertex coord labels) and 4 LINE entities (ticks)
  land on `OUTSIDE_FIGURE_LABELS`.
- Each vertex's `"Y=<westing> X=<southing>"` string appears in the DXF.
- Distance + direction TEXT counts on `DISTANCES` and `DIRECTIONS` each
  rise by exactly 4 (parcel edges + OF edges).

The existing "required layers declared exactly once" test array gets
`'OUTSIDE_FIGURE_LABELS'` appended; the layer count assertion goes from
12 to 13.

The existing graceful-degradation regression test gets a sibling:

- A fixture mutated to include a NaN-coord OF vertex bumps
  `warnings.summary.outsideFigureVertices` to 1 and does not throw.

### Layer 3 — Manual CAD verification

The existing checklist at
`docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`
gets three new tick items appended (verbatim):

- Each outside-figure vertex carries a small tick mark pointing outward
  plus a Cape Lo coordinate label (`Y=… X=…`) just outside the boundary.
- Each outside-figure edge has a distance label (metres, 2 dp) and a
  bearing label (DMS) at its midpoint, offset outward.
- Toggling the CAD `DISTANCES` layer off hides BOTH parcel edge distances
  AND outside-figure edge distances simultaneously (proves they share the
  layer).

Suggested screenshot filename: `12-outside-figure-annotation.png`.

## Out of scope

- **Angle-bisector tick directions** for concave outside figures — functional
  minimum uses centroid-to-vertex direction; bisector is a future iteration
  if real plans show ticks pointing the wrong way.
- **Label collision avoidance** — labels can overlap parcels, beacons, or
  the OF boundary itself in tight-fit plans. Surveyor adjusts in CAD.
  Sophisticated placement ships as a separate sub-project later.
- **Tick mark length adaptation** based on local crowding — pdfkit does
  this; we use a fixed 3 mm tick.
- **Coordinate label precision below whole metres** — the production PDF
  uses whole metres at typical scales; sub-metre precision would clutter.
- **Edge label flipping for upside-down text** — already inherited from
  the parcel-edge convention (`if (ang > 90 || ang < -90) ang += 180`).
- **Multi-sheet tiling, beacon enrichment, title-block SI 727 lines,
  schedule multi-column, cartographic label placement** — separate
  sub-projects with their own specs.

## Risk assessment

| Risk | Mitigation |
|---|---|
| New OF labels overlap parcel content on tight-fit plans | Functional minimum accepts this; surveyor adjusts in CAD. Upgrade to collision-aware placement is a separate sub-project. |
| Centroid degenerate on collinear OF vertices | `n = { x: 1, y: 0 }` fallback + one-time `logger.warn` keeps emission going; no crash. |
| File grows from ~1,200 to ~1,400 lines | Each new emitter is well-bounded (one function, one purpose). The next sub-project (beacon enrichment) is the natural point to re-evaluate file structure (Approach B from brainstorming). |
| Sharing `DISTANCES` + `DIRECTIONS` with parcel edges confuses the surveyor | The shared-layer choice is documented in the manual checklist; the CAD-layer toggle behaviour is explicit in test 3 of Layer 3. |

## Acceptance criteria

This work lands when:

1. Layer 1 + Layer 2 tests pass in CI (`npm run test` in `app-backend`).
2. Layer 3 manual verification screenshot added to the PR description,
   showing the three new visual elements (vertex coord labels, vertex
   ticks, edge distance/bearing labels) on a real CAD viewer.
3. A regression case (the existing integration fixture) renders correctly
   in LibreCAD with the new annotation visible alongside the prior
   parity work (north arrow, scale bar, endorsement zone, etc.).
4. The synthetic NaN-vertex edge case produces
   `warnings.summary.outsideFigureVertices === 1` and the
   `X-DXF-Warnings` response header serialises the count.

## References

- Production PDF generator (the parity reference):
  `app-backend/src/services/pdfkitGeoPDF.js` — specifically
  `renderOutsideFigureVertexLabels` (line 2621),
  `renderOutsideFigureTickMarks` (line 3165),
  `renderOutsideFigureLabels` (line 2910).
- Existing DXF generator (the file under edit):
  `app-backend/src/services/dxfGenerator.js` — OF polyline emission
  around line 322, primitives near line 280.
- Frontend OF vertex helper (mirror for `computeOutsideFigureVertices`):
  `app-frontend/src/utils/ofdClipping.ts` — `masterVerticesFromOfd`.
- Prior DXF/PDF parity spec (context):
  `docs/superpowers/specs/2026-05-31-survey-plan-dxf-pdf-parity-design.md`.
- Manual verification checklist (extended by this work):
  `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`.

# Fallback figure boundary from parcel union when Outside Figure is absent

## Problem

The collision-avoidance system used for placing the Schedule of Areas (and
every other collision-aware block — tick marks' reserved regions, scale
bar, north arrow) only knows where the survey figure actually is via an
explicit `outsideFigure` GeoJSON polygon. When a plan has no separately
digitized outer boundary — common for "general-developed" township plans
defined only by their individual stand parcels — the collision system sees
**zero polygon vertices** and treats the entire map as open whitespace.

Confirmed by direct reproduction (systematic-debugging session,
2026-08-08): generating a 240-stand fixture with no `outsideFigure` field
produced a PDF where the Schedule of Areas sub-tables render directly on
top of the stand grid. The same overlap reproduced on the pre-existing
`main` baseline (commit `42fb5f0`), confirming this is a pre-existing bug,
unrelated to the Schedule-of-Areas column-width or coordinate-grid
tick-mark work already shipped this week.

## Scope decisions (confirmed with user)

- Fix the **general** polygon-awareness gap (not a schedule-specific
  band-aid) — this benefits every collision-aware block that consumes the
  same obstacle polygon, not just the Schedule of Areas.
- Fallback boundary method: **true polygon union of all parcels**, via
  `clipper-lib` (already a dependency, already used elsewhere in this
  codebase for polygon offset/intersection — this adds the first `ctUnion`
  use). Rejected simpler alternatives (bounding box, convex hull) as either
  too crude (bbox can falsely block real whitespace inside the box but
  outside the parcels) or still inaccurate for notched/L-shaped layouts
  (convex hull).
- This is **sub-project A** of two. Sub-project B (fixing the paper-size
  escalation gate that's explicitly disabled for schedules that split into
  sub-tables) is a separate, later effort — not addressed here.

## Architecture context

PDF and DXF do **not** have two separate implementations of this gap —
they share one function. Both `pdfkitGeoPDF.js:12039` and
`dxfGenerator.js:1949` call `buildPlannerObstacles()` in
`app-backend/src/services/polygonForPlanner.js`, which internally calls
`_buildPlannerTransform()`. That internal function returns `null` whenever
`outsideFigure` is missing or isn't a valid `Polygon` geometry
(`polygonForPlanner.js:118,123`), which cascades to both callers returning
an empty obstacle set (`{ polyPts: [], parcelSegments: [] }`). Fixing this
one function fixes both output formats at once.

(DXF's coordinate-grid tick marks, `dxfGenerator.js`'s `addCornerCrosses`,
already work without `outsideFigure` — but not because DXF solved this
problem elsewhere. `addCornerCrosses` was never dependent on the
parcel/OF boundary polygon in the first place; it derives tick positions
from the page's content-area rectangle. This confirms the gap is isolated
to the shared obstacle-polygon path, not something already solved
elsewhere that this fix should port from.)

No hull/union utility exists anywhere in the codebase today. `clipper-lib`
is used in exactly two files, both under
`app-backend/src/services/diagram/`:
`offsetPolygon.js` (single-polygon offset/buffer) and
`neighbourBuffer.js` (`bufferRing`: offset; `clipRingToPolygon`: two-input
intersection via `ClipType.ctIntersection`). Neither performs a
many-polygon union. This spec's fallback reuses the exact same
integer-scaling convention (`SCALE = 1000`, metres → millimetre-precision
integers, since Clipper requires integer coordinates) and Clipper API
shape (`new ClipperLib.Clipper()`, `AddPaths`, `Execute`) already
established in `neighbourBuffer.js`, just with `ClipType.ctUnion` instead
of `ctIntersection`, and multiple `ptSubject` inputs (all parcels) instead
of one subject + one clip.

`buildPlannerObstacles` already receives `parcels` (a GeoJSON
FeatureCollection) at both of its production call sites — no new data
needs to be threaded in from further up the call stack, only forwarded one
level deeper into `_buildPlannerTransform`.

The sibling function `buildPolygonForPlanner` also calls
`_buildPlannerTransform` but has **zero production call sites** (only
`buildPlannerObstacles` is actually called, per the two sites above) and
doesn't currently accept a `parcels` parameter at all. It is left
untouched — out of scope, since it isn't exercising the bug.

## Design

### 1. `unionParcelsToRing` — new function in `polygonForPlanner.js`

```js
import ClipperLib from 'clipper-lib'

const CLIPPER_SCALE = 1000 // metres → integer (mm) for Clipper, matches
                            // the convention in diagram/neighbourBuffer.js

function toClipperPath(yxRing) {
  return yxRing.map(([y, x]) => ({
    X: Math.round(y * CLIPPER_SCALE),
    Y: Math.round(x * CLIPPER_SCALE),
  }))
}
function fromClipperPath(path) {
  return path.map((p) => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE])
}
function ringArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i]
    const [y2, x2] = ring[(i + 1) % ring.length]
    a += y1 * x2 - y2 * x1
  }
  return Math.abs(a) / 2
}

/**
 * Fallback figure boundary when no explicit Outside Figure polygon is
 * supplied: unions every parcel's ring into its combined outline. Plans
 * with no digitized outer boundary (e.g. "general-developed" township
 * plans defined only by their stand parcels) still get an accurate
 * hard-reject collision polygon this way, instead of the collision system
 * treating the whole map as empty space.
 *
 * @param {object} parcels - GeoJSON FeatureCollection of parcel Polygons
 * @param {object} [logger=console]
 * @returns {Array<[number,number]>|null} [y,x] ring of the largest unioned
 *          region, or null if no usable parcel geometry was found.
 */
export function unionParcelsToRing(parcels, logger = console) {
  const features = parcels?.features ?? []
  const paths = []
  for (const feat of features) {
    const geom = feat?.geometry
    if (geom?.type !== 'Polygon') continue
    let ring = geom.coordinates?.[0]
    if (!Array.isArray(ring) || ring.length < 3) continue
    if (ring.length === 1 && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0]
    const yx = []
    for (const v of ring) {
      const [y, x] = readRingVertex(v)
      if (Number.isFinite(y) && Number.isFinite(x)) yx.push([y, x])
    }
    if (yx.length >= 3) paths.push(toClipperPath(yx))
  }
  if (paths.length === 0) return null

  const c = new ClipperLib.Clipper()
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true)
  const sol = new ClipperLib.Paths()
  c.Execute(
    ClipperLib.ClipType.ctUnion, sol,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero,
  )
  const rings = sol.map(fromClipperPath).filter((r) => r.length >= 3)
  if (rings.length === 0) return null
  rings.sort((a, b) => ringArea(b) - ringArea(a))
  if (rings.length > 1) {
    logger.warn?.(
      `[polygonForPlanner] Parcel union produced ${rings.length} disjoint ` +
      `regions (${features.length} parcels total) — no explicit Outside ` +
      `Figure was supplied; using the largest region as the figure boundary.`
    )
  }
  return rings[0]
}
```

Exported (not just internal) so it can be unit-tested directly, matching
the existing pattern of `neighbourBuffer.js`'s exported `bufferRing`/
`clipRingToPolygon`.

### 2. Refactor `_buildPlannerTransform` to use it as a fallback

Extract the existing inline Outside-Figure-ring extraction into its own
helper first (pure refactor, no behavior change — makes the fallback a
one-line addition instead of a tangled conditional):

```js
/** Extract a validated [y,x] ring from an Outside Figure GeoJSON input, or null. */
function _extractOutsideFigureRing(outsideFigure) {
  if (!outsideFigure) return null
  const feat = outsideFigure.features ? outsideFigure.features[0] : outsideFigure
  const geom = feat?.geometry
  if (geom?.type !== 'Polygon') return null

  let ring = geom.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length < 3) return null
  if (ring.length === 1 && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0]

  const yx = []
  for (const v of ring) {
    const [y, x] = readRingVertex(v)
    if (Number.isFinite(y) && Number.isFinite(x)) yx.push([y, x])
  }
  // Strip a trailing closing-duplicate vertex if present (GeoJSON convention).
  if (yx.length > 1) {
    const [fy, fx] = yx[0]
    const [ly, lx] = yx[yx.length - 1]
    if (fy === ly && fx === lx) yx.pop()
  }
  return yx.length >= 3 ? yx : null
}
```

Then `_buildPlannerTransform` becomes:

```js
function _buildPlannerTransform({ outsideFigure, parcels, scaleDenom, mapBounds, logger = console }) {
  if (!Number.isFinite(scaleDenom) || scaleDenom <= 0) return null
  if (!mapBounds || !Number.isFinite(mapBounds.width) || !Number.isFinite(mapBounds.height)) return null

  const capeVerts = _extractOutsideFigureRing(outsideFigure) ?? unionParcelsToRing(parcels, logger)
  if (!capeVerts) return null

  const M_TO_PT = (1000 / scaleDenom) * PT_PER_MM

  let minCapY = Infinity, maxCapY = -Infinity
  let minCapX = Infinity, maxCapX = -Infinity
  for (const [cy, cx] of capeVerts) {
    if (cy < minCapY) minCapY = cy
    if (cy > maxCapY) maxCapY = cy
    if (cx < minCapX) minCapX = cx
    if (cx > maxCapX) maxCapX = cx
  }

  const polyWidthPt  = (maxCapY - minCapY) * M_TO_PT
  const polyHeightPt = (maxCapX - minCapX) * M_TO_PT
  const offsetX = mapBounds.x + (mapBounds.width  - polyWidthPt)  / 2
  const offsetY = mapBounds.y + (mapBounds.height - polyHeightPt) / 2

  const project = (cy, cx) => ({
    x: (cy - minCapY) * M_TO_PT + offsetX,
    y: (maxCapX - cx) * M_TO_PT + offsetY,
  })

  return { project, capeVerts }
}
```

(Unchanged: the bbox/offset/`project` math below the ring extraction — only
the ring's *source* changes.)

### 3. Thread `parcels`/`logger` one level deeper

`buildPlannerObstacles` already receives `parcels`; it just needs to
forward it (and accept an optional `logger`) into `_buildPlannerTransform`:

```js
export function buildPlannerObstacles({ outsideFigure, parcels, scaleDenom, mapBounds, closeRing = false, logger = console }) {
  const t = _buildPlannerTransform({ outsideFigure, parcels, scaleDenom, mapBounds, logger })
  // ...unchanged below this line
}
```

Both call sites (`pdfkitGeoPDF.js:12039`, `dxfGenerator.js:1949`) already
have a real `logger` in scope (used a few lines away for `planSheetLayout`
calls) and get one new argument added: `logger`.

`buildPolygonForPlanner` is left untouched — it doesn't pass `parcels`
today and has no production callers, so `_buildPlannerTransform` simply
receives `parcels: undefined` from it, `unionParcelsToRing(undefined)`
returns `null` gracefully (empty `features` array), and behavior is
unchanged for that unused path.

## Edge cases

- **No `outsideFigure` and no usable `parcels` either**: still returns
  `null` — no fallback possible. Not worse than today, just not improved
  for this (rare — a plan with literally no geometry at all) case.
- **Parcels form disjoint groups**: shouldn't normally happen for a real
  General Plan (its stands are physically contiguous by definition), but
  if it does, the largest region by area is used as the figure boundary,
  with a warning logged noting the exclusion.
- **Degenerate parcel rings** (fewer than 3 points, non-finite
  coordinates): skipped individually — one bad parcel doesn't take down
  the whole union, matching the existing tolerance in
  `buildPlannerObstacles`'s `parcelSegments` builder.
- **`outsideFigure` present and valid**: completely unchanged behavior —
  the fallback path never executes.

## Testing

- Unit tests for `unionParcelsToRing` (new, in `polygonForPlanner.js`):
  several touching parcels → combined outline; disjoint parcel groups →
  largest group's outline plus the warning log; degenerate/empty parcel
  input → `null`.
- Unit tests for `_buildPlannerTransform`'s fallback wiring (via
  `buildPlannerObstacles`, its only production entry point): no
  `outsideFigure` + parcels present → non-empty `polyPts`; `outsideFigure`
  present → fallback never invoked (regression guard on existing
  behavior); neither present → empty result, matching current behavior.
- Integration test reproducing the original bug: a fixture styled like the
  240-stand Maglas fixture used in the original debugging session (many
  stands, **no** `outsideFigure` field), run through both `generateGeoPDF`
  and `generateDXF`, asserting the Schedule of Areas' final placed bounds
  don't overlap the parcel figure — using the existing
  `rectangleOverlapsPolygon` helper (exported from
  `pdfkitGeoPDF/geometry.js` and `dxfGeometry.js`) against the same
  parcel-union polygon this fix produces. This is the concrete regression
  test for the reported bug.
- Full backend suite run at the end.
- Visual verification: regenerate that same fixture and look at the
  rendered PDF, same approach used for the coordinate-grid tick-mark work.

## Out of scope

- Sub-project B: the paper-size escalation gate that's explicitly disabled
  for schedules that split into sub-tables (`isScheduleWithFluidFallback`
  in `pdfkitGeoPDF.js`), which can still let a schedule land on an
  overlapping position even with correct polygon awareness when the truly
  available whitespace is insufficient. Separate follow-up.
- `buildPolygonForPlanner` (unused in production) — not extended with the
  same fallback, since nothing calls it.

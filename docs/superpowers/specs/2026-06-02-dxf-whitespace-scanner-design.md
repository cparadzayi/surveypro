# DXF Topological Whitespace Scanner (sub-project 4b) — Design

**Date:** 2026-06-02
**Status:** Approved (design)
**Component:** `app-backend` — new `services/dxfTopology.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, ~14,222 lines). This is
**sub-project 4b** of the 4a/4b/4c/4d decomposition of what was
originally scoped as sub-project #4. The full re-baseline status:

| # | Sub-project | Status |
|---|---|---|
| 1 | Outside-figure annotation | shipped |
| 2 | Title-block SI 727 lines | shipped |
| 3 | Schedule of Areas multi-column | shipped (known design gap; see 3-v2) |
| 4a | Geometric primitives (`dxfGeometry.js`) | shipped at `46ce0e0` |
| **4b** | **Topological whitespace scanner (`dxfTopology.js`)** | **this spec** |
| 4c | Generic block placer | pending after 4b |
| 4d | Per-feature label placement | pending |
| 3-v2 | Schedule of Areas placement using 4c | pending after 4c |
| 5 | Multi-sheet tiling | pending |
| 6 | Beacon enrichment | deferred (depends on 4d) |

## Purpose

Sub-project 4c (the block placer) needs to find homes for floating
blocks — schedule sub-tables, beacon-description block, etc. — inside
the drawing zone without overlapping the outside-figure polygon. The PDF
generator solves this with a topological whitespace scanner: it walks
the polygon's perimeter, computes per-axis profile dictionaries, then
scans each side of the bounding rectangle to identify contiguous bands
of usable whitespace, and emits those bands as zone rectangles ranked
by side preference and area.

That scanner lives in `pdfkitGeoPDF.js:9021` (`computePolygonProfile`)
and `pdfkitGeoPDF.js:9070` (`computeWhitespaceZones`). It's the
infrastructure 4c needs.

Goal: **port the PDF whitespace scanner into a new dependency-free
`dxfTopology.js` module, with interfaces normalised to match 4a's
`{x, y}` convention and the PDF's positional argument list replaced by
a named-argument object for the public function. Fully unit-tested,
with zero changes to `dxfGenerator.js`.**

This sub-project produces no user-visible change. The DXF output is
byte-for-byte identical before and after 4b ships. It's pure foundation,
same shape as 4a.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Where does the scanner live? | New module `app-backend/src/services/dxfTopology.js`. Sibling to 4a's `dxfGeometry.js`. The sub-project decomposition maps 1:1 to modules (geometry / topology / block-placer / label-placer) |
| Implementation style | Port **algorithms** verbatim from `pdfkitGeoPDF.js`. Interfaces normalised to uniform `{x, y}` polygon vertices and a named-argument signature for `computeWhitespaceZones` |
| Coordinate convention | Unit-agnostic. Polygon is `Array<{x, y}>`, `mapBounds` is `{x, y, width, height}`, all scalars (`buffer`, `tableMinWidth`, `scanStep`) in the same unit. Caller (4c) will use ground metres at the chosen scale |
| Output zone shape | `{x, y, width, height, side: 'right'|'left'|'bottom'|'top'|'full', area: number}` — 6 fields. The PDF's `groundWidthM` annotation is dropped (redundant when inputs are already in ground units) |
| Public exports | Both `computePolygonProfile` and `computeWhitespaceZones`. The PDF doesn't export the profile helper but exporting it here enables direct unit-test coverage |
| `calculateMapFeatureBounds` (the PDF's "compute bounding box of features to avoid" helper at `pdfkitGeoPDF.js:6973`) | Deferred to sub-project 4c (the block placer is the natural consumer of "things to avoid") |
| Closed-polygon assumption | `computePolygonProfile` iterates `polygon.length - 1` edges, matching the PDF. Polygon MUST be closed (last vertex repeats first). Same convention as 4a's `isPointNearPolygon`. Documented in JSDoc |
| Tests | New file `dxfTopology.test.js`; per-function unit tests against hand-verifiable synthetic polygons |
| Manual CAD verification | None — no DXF output changes |

## Architecture

Single new file: `app-backend/src/services/dxfTopology.js`.

Properties:

- **Zero dependencies** on the rest of the repo. No imports from
  `dxfGenerator.js`, `dxfGeometry.js`, `app-shared/block-definitions.js`,
  or any other internal module. Standard library only (`Math.*`).
- **Zero side effects.** Pure functions. No module-level mutable state.
  No file I/O, network, or DXF emission.
- **Zero changes** to `dxfGenerator.js` in this sub-project. The new
  module has no consumer in production code until 4c ships; only its
  own test file consumes it for now.
- **Two named exports.** No default export. JSDoc on every function.

## Components

### `computePolygonProfile(polygon, scanStep) → { rightAt, leftAt, bottomAt, topAt }`

Port of `pdfkitGeoPDF.js:9021`. Walks each polygon edge and samples it
at integer multiples of `scanStep`, recording for each sampled
coordinate the most-extreme x or y at that slice:

| Dictionary | Key | Value |
|---|---|---|
| `rightAt[y]` | sampled y (multiple of `scanStep`) | rightmost x at this y across all edges that pass through it |
| `leftAt[y]` | sampled y | leftmost x at this y |
| `bottomAt[x]` | sampled x | bottommost y at this x (DXF convention: y decreases downward, so max) |
| `topAt[x]` | sampled x | topmost y at this x (min) |

**Algorithm:**

For each edge `polygon[i]` → `polygon[i+1]` (iterating `i < length-1`,
which is the **closed-polygon assumption** — the last vertex must equal
the first):

- If edge spans y (vertical component > threshold), sample at each
  multiple of `scanStep` between `min(p1.y, p2.y)` and `max(p1.y, p2.y)`;
  interpolate x at that y; update `rightAt[y]` / `leftAt[y]`.
- If edge spans x (horizontal component > threshold), sample at each
  multiple of `scanStep` between `min(p1.x, p2.x)` and `max(p1.x, p2.x)`;
  interpolate y at that x; update `bottomAt[x]` / `topAt[x]`.

The sampling-at-multiples-of-step convention is important: the keys
produced here must match the keys `computeWhitespaceZones` iterates by.
Both functions align their scans via `Math.ceil(coord / step) * step`.

**Inputs:**
- `polygon`: `Array<{x: number, y: number}>`, closed (last vertex = first)
- `scanStep`: number, the sampling resolution

**Output:** object with 4 dictionaries (keyed by sampled coordinate).

### `computeWhitespaceZones({ polygon, mapBounds, buffer, tableMinWidth, scanStep }) → Array<Zone>`

Port of `pdfkitGeoPDF.js:9070`. Named-argument object signature (5
inputs) rather than the PDF's positional form — reduces call-site
errors when 4c invokes this with optional/defaulted params.

**Algorithm:**

1. Special case: `polygon` is null/undefined or has fewer than 3
   vertices → return `[{x: mapBounds.x, y: mapBounds.y, width: mapBounds.width,
   height: mapBounds.height, side: 'full', area: width * height}]`.
2. Call `computePolygonProfile(polygon, scanStep)` to get the 4
   dictionaries.
3. For each of 4 sides, scan along the perpendicular axis at
   `scanStep`, finding contiguous bands where available space ≥
   `tableMinWidth`. Within each band, track the **most conservative**
   boundary (rightmost `rightAt[y]` on the right strip, leftmost
   `leftAt[y]` on the left strip, etc.) to ensure the emitted zone
   doesn't overlap the polygon.
4. For each band, emit a zone `{x, y, width, height, side, area}`
   where `side` ∈ `{'right', 'left', 'bottom', 'top'}`.
5. Bottom and top strips apply an extra height heuristic: zone
   `height` must be ≥ `tableMinWidth / 2` (reflects that horizontal
   strips are typically wider than tall; preserved verbatim from PDF).
6. Filter out zero-width/zero-height zones (defensive against
   scan-resolution artefacts).
7. Sort by side preference (right=0, bottom=1, left=2, top=3), then
   `area` descending.

**Inputs (named-argument object):**
- `polygon`: `Array<{x, y}>`, closed
- `mapBounds`: `{x, y, width, height}` — the rectangular region within which to find whitespace
- `buffer`: number — minimum clear distance between zone edge and polygon
- `tableMinWidth`: number — minimum zone width to be considered usable
- `scanStep`: number — sampling resolution (passed through to `computePolygonProfile`)

**Output:** array of zones, sorted right-preferred then area-descending.

Per-zone fields:

| Field | Type | Meaning |
|---|---|---|
| `x`, `y` | number | top-left corner of zone |
| `width`, `height` | number | zone dimensions in the same unit as input |
| `side` | `'right'|'left'|'bottom'|'top'|'full'` | which boundary of mapBounds the zone hugs (`'full'` only on the empty-polygon special case) |
| `area` | number | `width * height` |

## Data flow

Trivial — pure functions. No chaining inside the module beyond
`computeWhitespaceZones` internally calling `computePolygonProfile`.

Future consumers (4c, 4d, 3-v2) will import:

```js
import { computeWhitespaceZones } from './dxfTopology.js'
const zones = computeWhitespaceZones({
  polygon: outsideFigurePolygon,    // ground metres, closed
  mapBounds: drawingZoneRect,        // ground metres
  buffer: mm(3),                     // 3mm clearance at chosen scale
  tableMinWidth: mm(50),             // 50mm minimum zone width
  scanStep: mm(5),                   // 5mm sampling resolution
})
// zones[0] is the highest-priority zone (right side, largest area)
```

## Error handling

**None required.** Pure functions, no I/O.

- Polygon < 3 vertices → handled by special-case `'full'` zone path.
- Negative or zero `scanStep`, `buffer`, `tableMinWidth` → produces
  garbage outputs; no defensive guards (PDF original doesn't guard).
- Polygon with non-finite coordinates → garbage outputs; the
  polygon-to-DXF pipeline filters these upstream (sub-project #1's
  `outsideFigureVertices` warning category catches NaN/Infinity in the
  outside-figure feed).
- Calling `computePolygonProfile` with an open polygon → silently
  misses the final closing edge from `polygon[n-1]` to `polygon[0]`.
  Documented in JSDoc; callers responsible for closing the polygon.

**No new warning category** in `dxfGenerator.js`'s aggregator. This
sub-project doesn't run inside `generateDXF()`.

## Testing

Single new file: `app-backend/src/services/__tests__/dxfTopology.test.js`.

Per-function unit tests against hand-verifiable synthetic polygons.
No fixtures, no mocks, no DXF involvement.

### `computePolygonProfile` (8 tests)

- Empty polygon → all 4 dictionaries empty.
- Open polygon (last vertex != first) → final edge from `polygon[n-1]`
  to `polygon[0]` not iterated; document via test.
- Axis-aligned 10×10 closed rectangle → `rightAt[y]` returns 10 for all
  multiples of `scanStep` in `[0, 10]`; `leftAt[y]` returns 0.
- Same rectangle → `topAt[x]` and `bottomAt[x]` return 0 and 10
  respectively (or whatever the rect's y range produces) across the x range.
- Diagonal edge — sampling interpolates correctly. Edge from (0,0) to
  (10,10) with scanStep=2 → at y=2, the edge x is 2; etc.
- Step alignment — edge spanning y ∈ [3, 47] with `scanStep=10` samples
  appear at y=10, 20, 30, 40 (multiples of step).
- L-shape (concave polygon) — `rightAt[y]` at the L's notch records
  the inner-right boundary (max across multiple edges at that y).
- Two edges crossing the same y slice — `rightAt[y]` takes the max of
  both edge x values.

### `computeWhitespaceZones` (10 tests)

- Empty/null polygon → returns one `{side: 'full'}` zone covering
  `mapBounds`.
- Polygon fully fills `mapBounds` with no usable margin → returns `[]`.
- Square polygon inset from `mapBounds` on the right → at least one
  `{side: 'right'}` zone with width ≈ available right margin.
- Polygon flush against right edge but with bottom margin → returns a
  `{side: 'bottom'}` zone, no right zone.
- L-shape polygon with usable notch on the right → at least one right
  zone; notch span produces a zone.
- L-shape with two separated usable-width bands on the right → returns
  two `{side: 'right'}` zones (one per band).
- `tableMinWidth` larger than any available band → returns `[]`.
- Sort order: zones returned ordered by side preference (right, bottom,
  left, top) then `area` descending.
- `buffer` parameter increases required clear distance — a zone that
  fits at `buffer=0` may not fit at `buffer=20`.
- Bottom-strip height heuristic — narrow horizontal strips with
  `height < tableMinWidth/2` are filtered out.

Total: **18 unit tests**. Run via existing `npm run test -- dxfTopology`
infrastructure.

**No Layer 2 (integration) tests.** Nothing in `generateDXF()` calls
the new module yet. 4c will add integration tests when it wires the
zones into actual DXF emission.

**No Layer 3 (manual CAD verification).** No DXF output changes.

## Non-goals

- **Wiring into `dxfGenerator.js`.** Sub-projects 4c, 4d, and 3-v2 are
  the consumers; this sub-project ships the module only.
- **`calculateMapFeatureBounds`** (the PDF's "compute bounding box of
  features to avoid" helper at `pdfkitGeoPDF.js:6973`). Deferred to
  sub-project 4c (the block placer is the consumer that needs "things
  to avoid").
- **PDF-specific helpers** (PDF-coordinate transforms, `groundWidthM`
  conversion). Out of scope; DXF inputs are already in ground units.
- **Algorithmic improvements / rewrites.** Port verbatim. Any
  modernisation or cleanup is a separate concern.
- **Multi-polygon support.** `computeWhitespaceZones` takes a single
  polygon (the outside figure). The PDF original is the same. If
  multi-polygon avoidance is ever needed (e.g., avoiding multiple
  islands of features inside the drawing), that's a future extension.
- **Block-block collision avoidance.** This module finds whitespace
  against the polygon only. Block-vs-already-placed-block avoidance
  lives in 4c (using `hasBlockToBlockCollision` derived from 4a's
  primitives).

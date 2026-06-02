# DXF Geometric Primitives (sub-project 4a) — Design

**Date:** 2026-06-02
**Status:** Approved (design)
**Component:** `app-backend` — new `services/dxfGeometry.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, ~14,222 lines). This is
**sub-project 4a** of a four-way decomposition (4a/4b/4c/4d) of what was
originally scoped as sub-project #4 (cartographic label collision avoidance
+ topological placement). The full re-baseline plan:

| # | Sub-project | Status |
|---|---|---|
| 1 | Outside-figure annotation | shipped |
| 2 | Title-block SI 727 lines | shipped |
| 3 | Schedule of Areas multi-column | shipped (known design gap; see 3-v2) |
| **4a** | **Geometric primitives** | **this spec** |
| 4b | Topological whitespace scanner | pending |
| 4c | Generic block placer | pending |
| 4d | Per-feature label placement | pending |
| 3-v2 | Schedule of Areas placement using 4c | pending after 4c |
| 5 | Multi-sheet tiling | pending |
| 6 | Beacon enrichment | deferred (depends on 4d) |

## Purpose

Sub-projects 4b, 4c, and 4d all need the same set of geometric helpers
(point-distance, point-in-polygon, line-segment intersection,
rectangle-rectangle overlap, rectangle-polygon overlap, and a few more)
to do their work. Those helpers exist in `pdfkitGeoPDF.js` and have been
in production for ~year+. This sub-project extracts them into a
dependency-free module so the three downstream sub-projects can import
them without each having to port their own copy.

Goal: **port the 8 PDF geometric primitives that 4b and 4c will need into
a new `dxfGeometry.js` module, fully unit-tested, with zero changes to
`dxfGenerator.js` itself.**

This sub-project produces no user-visible change. The DXF output is
byte-for-byte identical before and after 4a ships. It's pure foundation.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Where do the primitives live? | New module `app-backend/src/services/dxfGeometry.js`. Keeps `dxfGenerator.js` from growing past ~2,300 lines and gives 4b/4c/4d a clean import surface |
| Which primitives are in scope? | The 8 functions 4b (whitespace scanner) and 4c (block placer) will use. 4d (per-feature label placement) ports its own additions when it ships |
| Implementation style | Port verbatim from `pdfkitGeoPDF.js`. These are battle-tested implementations; rewriting from scratch risks subtle algorithm bugs (line-intersection collinear/parallel cases are famously fiddly) |
| Coordinate convention | Unit-agnostic. Functions accept `{x, y}` points and treat all inputs as one unit. Caller's responsibility to keep units consistent within one call |
| Composite helpers | `hasBlockToBlockCollision` and `isRectOutsidePolygons` (the PDF's one-line wrappers over the primitives) are deferred to 4c, which owns the `placedBlocks` array. 4a stays pure primitives |
| Tests | New file `dxfGeometry.test.js`; per-primitive unit tests against hand-computed expected values |
| Manual CAD verification | None — no DXF output changes |

## Architecture

Single new file: `app-backend/src/services/dxfGeometry.js`.

Properties:

- **Zero dependencies** on the rest of the repo. No imports from
  `dxfGenerator.js`, `app-shared/block-definitions.js`, or any other
  internal module. Standard library only (`Math.*`).
- **Zero side effects.** Pure functions. No module-level mutable state.
  No file I/O, network, or DXF emission.
- **Zero changes** to `dxfGenerator.js` in this sub-project. The new
  module is imported by 4b/4c/4d when they ship; until then it has no
  consumer in production code, only in its own test file.
- **Eight named exports.** No default export. JSDoc on every function
  documenting inputs, output, and unit-agnosticism.

## Components

Eight pure functions, ported verbatim from `pdfkitGeoPDF.js`. PDF source
line numbers are the canonical reference for the algorithm; the only
modifications during the port are JSDoc and `export` syntax.

### Point-level helpers (3)

**`pointDistance(p1, p2) → number`**
Euclidean distance. PDF source: `pdfkitGeoPDF.js:86`.
Inputs: two `{x, y}` points. Output: non-negative number.

**`pointToLineDistance(point, lineStart, lineEnd) → number`**
Perpendicular distance from a point to an infinite line through
`lineStart`/`lineEnd`. PDF source: `pdfkitGeoPDF.js:95`.
Cross-product magnitude over line length.

**`distanceToSegment(point, segStart, segEnd) → number`**
Distance to a finite line segment (clamps to nearest endpoint when the
perpendicular projection falls outside the segment). PDF source:
`pdfkitGeoPDF.js:167`.

### Polygon containment (2)

**`isPointInPolygon(point, polygon) → boolean`**
Ray-casting point-in-polygon test. `polygon` is `[{x,y}, ...]`. PDF
source: `pdfkitGeoPDF.js:66`. Standard winding-number algorithm.

**`isPointNearPolygon(point, polygon, bufferDistance) → boolean`**
True if the point is inside the polygon OR within `bufferDistance` of
any edge. PDF source: `pdfkitGeoPDF.js:129`. Wraps `isPointInPolygon` +
per-edge `distanceToSegment`.

### Line/segment intersection (1)

**`lineSegmentsIntersect(seg1, seg2) → boolean`**
True if two line segments cross. Each `seg` is `[{x,y}, {x,y}]`. PDF
source: `pdfkitGeoPDF.js:7317`. Orientation-of-three-points (cross-product
sign) test plus collinear-case handling.

### Rectangle helpers (2)

**`rectanglesOverlap(rect1, rect2, buffer = 0) → boolean`**
Axis-aligned rectangle overlap test with optional buffer. Each `rect` is
`{x, y, width, height}` (top-left + dimensions). PDF source:
`pdfkitGeoPDF.js:7556`. Separating-axis style.

**`rectangleOverlapsPolygon(rect, polygon, buffer = 0) → boolean`**
True if any vertex of the rect lies inside the polygon, OR any polygon
vertex lies inside the rect, OR any edge of one crosses any edge of the
other. PDF source: `pdfkitGeoPDF.js:7222`. Composed from the four
helpers above.

## Data flow

Trivial — pure functions. No chaining inside the module; no state.

Future consumers (4b/4c/4d) will import individually:

```js
import { rectanglesOverlap, isPointInPolygon } from './dxfGeometry.js'
```

No re-export aggregation, no namespace import recommended.

## Error handling

**None required.** Pure functions, no I/O, no config reads.

Inputs that violate the documented contracts (`null` points, polygons
with < 3 vertices, non-numeric coordinates) produce `NaN`/`false`/garbage
outputs — same as the PDF's versions do today. We don't add defensive
guards because:

1. Callers in 4b/4c/4d are internal code we control; they won't pass
   malformed inputs.
2. Adding `if (!polygon || polygon.length < 3) throw ...` to every
   primitive bloats the code with checks that never fire and obscures
   the math.
3. The PDF's versions don't guard either, and the PDF has been in
   production with them for ~year+.

**No new warning category** in `dxfGenerator.js`'s `warnings.summary`.
This sub-project doesn't run inside `generateDXF()`. If 4b/4c/4d hit a
real data-integrity issue, those sub-projects will add their own warning
categories the same way sub-project #3 added `scheduleOverflow`.

## Testing

Single new file: `app-backend/src/services/__tests__/dxfGeometry.test.js`.

Per-primitive unit tests against hand-computed expected values. No
fixtures, no mocks, no DXF involvement. All tests pure-input/pure-output.

| Function | Test cases | Notes |
|---|---|---|
| `pointDistance` | 3 | Zero (same point); axis-aligned (3-4-5 triangle); negative coords |
| `pointToLineDistance` | 4 | Point on line → 0; perpendicular for axis-aligned line; perpendicular for diagonal; degenerate zero-length line |
| `distanceToSegment` | 5 | On segment → 0; projection inside segment; projection past `segEnd` (clamps); past `segStart` (clamps); zero-length segment |
| `isPointInPolygon` | 6 | Clearly inside square; outside; on vertex; on edge; star-shape; ray crosses a vertex |
| `isPointNearPolygon` | 4 | Inside → true regardless of buffer; outside-within-buffer → true; outside-beyond-buffer → false; buffer=0 reduces to `isPointInPolygon` |
| `lineSegmentsIntersect` | 6 | Crossing; parallel non-touching; parallel endpoint-touch; collinear overlap; endpoint exactly on the other; T-intersection |
| `rectanglesOverlap` | 5 | Clear overlap; clear separation; touching edges → false (zero overlap); buffer makes touching count as overlap; one fully inside the other |
| `rectangleOverlapsPolygon` | 5 | Rect fully inside polygon; fully outside; straddling boundary; rect contains polygon; rect-corner-in / polygon-vertex-in / edges-cross variations |

Total: **38 unit tests**. Run via existing `npm run test -- dxfGeometry`
infrastructure. No new test framework or config.

**No Layer 2 (integration) tests in this sub-project.** Nothing in
`generateDXF()` calls the new module yet. 4b/4c/4d will add integration
tests when they wire the primitives into actual DXF emission.

**No Layer 3 (manual CAD verification).** No DXF output changes.

## Non-goals

- **Wiring into `dxfGenerator.js`.** Sub-projects 4b/4c/4d are the
  consumers; this sub-project ships the module only.
- **Label-placement primitives** (`calculatePolygonArea`,
  `findLargestInscribedCircle`, `calculateAvoidanceVector`,
  `isRectClearOfPolygonBoundary`, `isRectOverlappingPolygon`).
  Sub-project 4d ports these when its per-feature label placement
  needs them.
- **Composite collision helpers** (`hasBlockToBlockCollision`,
  `isRectOutsidePolygons`). One-line wrappers over the primitives;
  belong with the `placedBlocks` array they consume, which lives in
  4c (the block placer).
- **PDF-specific helpers** (`isPointInsidePolygonPDF`, `transformCoords`,
  PDF-coordinate variants). These have PDF unit assumptions baked in and
  are out of scope.
- **Algorithmic improvements / rewrites.** Port verbatim. Any
  modernisation or cleanup is a separate concern.

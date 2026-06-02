# DXF Generic Block Placer (sub-project 4c) — Design

**Date:** 2026-06-02
**Status:** Approved (design)
**Component:** `app-backend` — new `services/dxfBlockPlacer.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, ~14,222 lines). This is
**sub-project 4c** of the 4a/4b/4c/4d decomposition. The full
re-baseline status:

| # | Sub-project | Status |
|---|---|---|
| 1 | Outside-figure annotation | shipped |
| 2 | Title-block SI 727 lines | shipped |
| 3 | Schedule of Areas multi-column | shipped (known design gap; see 3-v2) |
| 4a | Geometric primitives (`dxfGeometry.js`) | shipped at `46ce0e0` |
| 4b | Topological whitespace scanner (`dxfTopology.js`) | shipped at `90dbb4f` |
| **4c** | **Generic block placer (`dxfBlockPlacer.js`)** | **this spec** |
| 4d | Per-feature label placement | pending |
| 3-v2 | Schedule of Areas placement using 4c | pending after 4c |
| 5 | Multi-sheet tiling | pending |
| 6 | Beacon enrichment | deferred (depends on 4d) |

## Purpose

Sub-project 3-v2 (Schedule of Areas placement using topological zones)
needs a placer that takes a block size + a description of obstacles
(outside-figure polygon + already-placed blocks + buffer/spacing
constraints) and returns a valid `{x, y}` position or `null`. This is
the infrastructure 3-v2 will call once per sub-table to find a home.

The PDF generator has **two** placement strategies in production:

1. **Generic placer** (`findOptimalPosition` at `pdfkitGeoPDF.js:7572`)
   used by `calculateBlockPositions` to place fixed blocks (title block,
   scale bar, north arrow, outside-figure data, beacon description,
   survey statement). Uses grid candidates, not topology zones. ~260
   lines.
2. **Schedule-specific placer** inside `drawScheduleOfAreasMultiTable`
   (`pdfkitGeoPDF.js:9297-9530`) that uses topology zones from
   `computeWhitespaceZones` first, then grid scan as fallback, then
   "fluid heights". ~250 lines.

**The DXF doesn't need the generic placer.** Its fixed blocks live in
the legacy bottom-zone partition (col1/col2/col3); no equivalent of
`calculateBlockPositions` orchestrator exists in `dxfGenerator.js`. The
only consumer that genuinely needs topology-aware placement is 3-v2.

So 4c ports just the **topology-aware** placement infrastructure that
3-v2 needs, generalised to a single-block API.

Goal: **port the topology-aware placement pieces of
`drawScheduleOfAreasMultiTable` into a new dependency-free
`dxfBlockPlacer.js` module that exposes a generic single-block placer
(`findBlockPosition`) on top of 4a's primitives + 4b's whitespace
zones. Fully unit-tested, zero changes to `dxfGenerator.js`.**

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope | Focused: only the topology-aware placer 3-v2 needs. Skip `findOptimalPosition` (PDF's generic grid placer) — the DXF has no caller for it; the legacy bottom-zone handles fixed blocks |
| API shape | Single public function `findBlockPosition` that places ONE block. Caller iterates over blocks, accumulates placed-blocks state between calls. Maximises caller control over retry / shrink-block logic |
| Fluid heights | NOT generalised in 4c. 3-v2 handles its own size variations by submitting blocks at multiple `(width, height)` combinations to single-pass `findBlockPosition` calls |
| Tick marks | Composed into `placedBlocks` by callers — 4c treats tick marks as just another obstacle, same shape as placed blocks. Matches PDF's `otherBlocks` pattern at `pdfkitGeoPDF.js:9383` |
| Candidate layers | Two: topology zones first (`computeWhitespaceZones`), full-grid fallback second. Matches PDF's two-tier approach. Grid fallback is ~50 lines and covers irregular polygons where the topology scan finds nothing |
| `calculateMapFeatureBounds` | Lives in 4c as an exported utility — small polygon-bbox helper that 3-v2 + any future caller needs. Not worth retroactively amending 4a |
| Logger | Optional parameter; defaults to no-op. Callers can pass `fastify.log` when integrating |
| File layout | New module `dxfBlockPlacer.js` (sibling to `dxfGeometry.js` and `dxfTopology.js`). Continues the 4-series naming pattern |
| Polygon shape | `Array<{x, y}>` — matches 4a/4b convention |
| Rectangle shape | `{x, y, width, height}` — matches 4a's rectangles |
| Tests | New file `dxfBlockPlacer.test.js`; per-helper unit tests + integration-style scenario test |
| Manual CAD verification | None — no DXF output changes |

## Architecture

Single new file: `app-backend/src/services/dxfBlockPlacer.js`.

Properties:

- **Imports two siblings:** `rectangleOverlapsPolygon`, `rectanglesOverlap`
  from `./dxfGeometry.js` (4a); `computeWhitespaceZones` from
  `./dxfTopology.js` (4b). No other repo dependencies.
- **Zero side effects.** Pure functions. No module-level state. No I/O
  except an optional caller-injected logger.
- **Zero changes** to `dxfGenerator.js`, `dxfGeometry.js`, or
  `dxfTopology.js`. The new module has no consumer in production code
  until 3-v2 ships.
- **Three named exports:** `findBlockPosition` (primary public function),
  `computeMapFeatureBounds` (polygon-bbox helper exported for caller
  convenience), `isValidPosition` (predicate exported for testability +
  caller reuse). No default export.
- **Two internal helpers** (not exported): `generateTopologyCandidates`,
  `generateGridCandidates`. These exist as testable units but only
  matter to the placer's internals; callers should use
  `findBlockPosition`.

## Components

### Public API

#### `findBlockPosition({ block, mapBounds, polygon, placedBlocks, buffer, blockSpacing, scanStep, tableMinWidth, logger? }) → { x, y } | null`

The primary placer. Returns the top-left corner of a valid position for
`block` inside `mapBounds` that avoids `polygon` and every entry in
`placedBlocks`, or `null` if no position found.

**Inputs:**

| Field | Type | Meaning |
|---|---|---|
| `block` | `{width, height}` | Size of the block to place |
| `mapBounds` | `{x, y, width, height}` | Rectangular region within which to place |
| `polygon` | `Array<{x, y}>` or `null` | Outside-figure polygon to avoid; null skips polygon checks |
| `placedBlocks` | `Array<{x, y, width, height}>` | Already-placed blocks (including tick marks if relevant) |
| `buffer` | `number` | Clearance distance for polygon collision (passed to `rectangleOverlapsPolygon`) |
| `blockSpacing` | `number` | Minimum separation between blocks (passed to `rectanglesOverlap`) |
| `scanStep` | `number` | Candidate-grid resolution (passed to `computeWhitespaceZones` and grid-scan loops) |
| `tableMinWidth` | `number` | Minimum zone width considered usable by `computeWhitespaceZones` |
| `logger` (optional) | `{info, warn, error}` | For diagnostic messages; defaults to no-op |

**Algorithm:**

1. Generate Layer 1 (topology) candidates via `generateTopologyCandidates`.
2. If Layer 1 yields ≥ 1 candidate, iterate them in order; for each, call
   `isValidPosition`. Return the first valid position.
3. If Layer 1 yields zero candidates OR all fail validation, generate
   Layer 2 (grid fallback) candidates via `generateGridCandidates`,
   skipping any already in the Layer-1 set.
4. Iterate Layer 2 candidates; for each, call `isValidPosition`. Return
   the first valid position.
5. If both layers exhausted without finding a valid position, return
   `null`.

Logger emits `info` at each layer transition and `warn` when returning
`null`.

### Exported helpers

#### `computeMapFeatureBounds(polygon) → { x, y, width, height, right, bottom, polygon } | null`

Returns axis-aligned bounding box of the polygon plus the polygon
itself wrapped in one object. Same shape consumers (the placer; 3-v2's
caller setup) want.

Returns `null` if `polygon` is null/undefined or empty.

```js
computeMapFeatureBounds([{x: 5, y: 3}, {x: 10, y: 8}, {x: 7, y: 1}])
// → { x: 5, y: 1, width: 5, height: 7, right: 10, bottom: 8, polygon: <input> }
```

Deferred from 4b's spec.

#### `isValidPosition({ rect, polygon, placedBlocks, buffer, blockSpacing }) → boolean`

Composes the three obstacle checks the PDF's `isValidPosition` does:

1. Polygon overlap: `rectangleOverlapsPolygon(rect, polygon, buffer)`
   from 4a. Skipped when `polygon` is null/empty.
2. Block overlap: for each `placedBlocks[i]`,
   `rectanglesOverlap(rect, placedBlocks[i], blockSpacing)` from 4a.
   Returns `false` on first overlap.
3. Returns `true` if all checks pass.

True predicate (boolean). No `{valid, reason}` shape like the PDF
original — DXF callers don't currently surface placement-failure
reasons. If diagnostics are needed later, that's a follow-up.

### Internal helpers (not exported)

#### `generateTopologyCandidates({ polygon, mapBounds, buffer, tableMinWidth, scanStep, blockWidth, blockHeight }) → Array<{x, y}>`

Calls `computeWhitespaceZones({ polygon, mapBounds, buffer, tableMinWidth, scanStep })`
and decimates each returned zone into `(x, y)` positions at `scanStep`
resolution.

Per zone:
- `x` iterates from `zone.x` to `zone.x + zone.width - blockWidth` at
  `scanStep`.
- `y` iterates from `zone.y` to `min(zone.y + zone.height, mapBounds.y + mapBounds.height - blockHeight)` at `scanStep`.

The `y` cap is important (and explicit in the PDF at line 9410-9413):
band height can be smaller than `blockHeight`, but the block's BOTTOM
can extend below the band's y range if the polygon doesn't intrude
there. `isValidPosition` filters those cases via polygon-overlap, so
generation here is permissive.

Deduplicates positions within `scanStep` epsilon (matches PDF's dedup
at line 9417-9420).

#### `generateGridCandidates({ mapBounds, scanStep, blockWidth, blockHeight, existingCandidates }) → Array<{x, y}>`

Full-grid fallback. Scans right-to-left first (matches PDF priority at
line 9431-9450), then left-to-right (line 9452-9472). Skips positions
within `scanStep` epsilon of any in `existingCandidates`.

## Data flow

```
3-v2 caller setup (future)
  └─ polygon = outsideFigure→{x,y} array (closed)
  └─ mapFeatureBounds = computeMapFeatureBounds(polygon)
  └─ tickMarkBounds = […]                    // from sub-project #1
  └─ placedBlocks = […tickMarkBounds]        // compose tick marks in
  │
  └─ for each scheduleSubTable {
        const pos = findBlockPosition({
          block: { width, height },
          mapBounds, polygon, placedBlocks,
          buffer: mm(3),        // 3mm clearance from polygon
          blockSpacing: mm(2),  // 2mm spacing between sub-tables
          scanStep: mm(5),      // 5mm candidate grid
          tableMinWidth: scheduleSubTable.width,
        })
        if (pos) {
          render sub-table at pos
          placedBlocks.push({ ...pos, width, height })  // track for next sub-table
        } else {
          warnings.summary.schedulePlacementFailure = …  // 3-v2 decides
        }
     }
```

Internal flow within `findBlockPosition`:

```
findBlockPosition
  ├─ topologyCandidates = generateTopologyCandidates(...)
  │    └─ computeWhitespaceZones(...) [4b]
  │       └─ each zone → decimate to (x, y) grid
  ├─ for each c in topologyCandidates:
  │    └─ if isValidPosition({rect: {...c, ...block}, polygon, placedBlocks, ...})
  │         return c
  ├─ if no topology hit:
  │    gridCandidates = generateGridCandidates(..., existingCandidates: topologyCandidates)
  │    for each c in gridCandidates:
  │      └─ if isValidPosition(...) return c
  └─ return null
```

## Error handling

**None required beyond null returns.** Pure functions, no I/O.

- Block too big / no candidates valid → `findBlockPosition` returns
  `null`. Caller decides what to do (fallback, error surfaced via
  warnings, retry with shrunk block, etc.).
- Missing `polygon` → topology layer is skipped; grid layer runs.
  Returns a valid position from grid scan or `null`.
- Empty `placedBlocks` → no block-collision checks performed.
- Negative `buffer`, `blockSpacing`, `scanStep` → garbage outputs; no
  defensive guards (matches 4a/4b pattern).
- `mapBounds` with negative dimensions → garbage outputs; no defensive
  guards.
- `block.width > mapBounds.width` (or height too tall) → all candidates
  fail bounds checks inside the generators; returns `null`.
- `computeMapFeatureBounds(null)` / `(undefined)` / `([])` → returns
  `null`. Caller checks before passing to placer.

**No new warning category** in `dxfGenerator.js`'s aggregator. 4c
doesn't run inside `generateDXF()`. 3-v2 will add a
`schedulePlacementFailure` (or similar) category if it needs to surface
"placer returned null" to the response payload.

## Testing

Single new file:
`app-backend/src/services/__tests__/dxfBlockPlacer.test.js`.

Per-helper unit tests against synthetic obstacles with hand-verifiable
expected positions. No fixtures, no mocks, no DXF involvement.

### `computeMapFeatureBounds` (4 tests)
- 3-vertex polygon → correct min/max bbox + `right`, `bottom`,
  `polygon` field intact.
- Square polygon → bbox dimensions match polygon dimensions.
- Empty array → returns `null`.
- `null` input → returns `null`.

### `isValidPosition` (8 tests)
- No polygon, no placed blocks → always valid (regardless of rect).
- Polygon overlap → false (uses `rectangleOverlapsPolygon` with
  `buffer`).
- Polygon nearly-overlap, buffer adjusts the cutoff — at smaller buffer
  the same position becomes valid.
- One placed block, no overlap → valid.
- One placed block, overlapping → false.
- Two placed blocks, second overlaps → false (returns on first hit;
  test verifies it doesn't accidentally pass on second iteration).
- `blockSpacing` increases required separation — touching becomes
  overlapping.
- Empty `polygon` + empty `placedBlocks` → valid regardless of
  position.

### `findBlockPosition` — topology layer (7 tests)
- Simple right-margin scenario (polygon takes left 40%, mapBounds
  100×100) → returns a position in the right whitespace.
- L-shape with notch → returns a position in the notch (the headline
  topology-aware test).
- Polygon fills mapBounds → returns `null`.
- Block too big for any whitespace → returns `null`.
- Multiple placed blocks blocking the natural right zone → returns a
  position elsewhere (left or bottom side).
- Polygon = null → falls through to grid scan; returns a valid position
  somewhere in `mapBounds`.
- `placedBlocks` = empty + polygon present → topology zones yield first
  valid position; verify position is outside the polygon.

### `findBlockPosition` — grid-fallback layer (3 tests)
- Polygon shape that produces no `computeWhitespaceZones` output (e.g.,
  star with no usable strips) → grid fallback fires; returns a valid
  position somewhere.
- Right-to-left iteration ordering: when topology yields nothing AND
  the right side is clear, the grid scan finds a right-side position
  first.
- Grid fallback respects polygon — no candidate position overlaps the
  polygon when polygon is provided.

### Integration-style test (1 test)
- Realistic Maglas-shaped scenario: polygon roughly approximating the
  Maglas outline (with notches); 3 schedule sub-table-sized blocks
  placed in sequence; each subsequent call adds the prior placement to
  `placedBlocks`; assert all 3 land in valid non-overlapping positions
  inside `mapBounds` and outside `polygon`.

Total: **23 unit tests**. Run via existing `npm run test -- dxfBlockPlacer`
infrastructure.

**No Layer 2 (integration) tests in `dxfGenerator.integration.test.js`.**
Nothing in `generateDXF()` calls this module yet. 3-v2 will add the
integration tests when it wires the placer into the C1 schedule
emission.

**No Layer 3 (manual CAD verification).** No DXF output changes.

## Non-goals

- **Wiring into `dxfGenerator.js`.** Sub-project 3-v2 is the primary
  consumer; this sub-project ships the module only.
- **`findOptimalPosition` (PDF's generic placer).** Out of scope. The
  DXF has no caller for it; the legacy bottom-zone partition handles
  fixed blocks today, and no current re-baseline sub-project changes
  that.
- **Fluid heights** (PDF's 75%/50%/33% block-height fallback). Out of
  scope. 3-v2 handles its own size variations by submitting blocks at
  different `(width, height)` to single-pass `findBlockPosition` calls.
- **Diagnostic `{valid, reason}` return shape** from `isValidPosition`.
  Out of scope. DXF callers don't currently surface placement-failure
  reasons; boolean predicate is enough.
- **Block-block avoidance vector** (`calculateAvoidanceVector` at
  `pdfkitGeoPDF.js:7012`). Out of scope. The PDF uses this to refine
  positions after a collision is detected; the DXF placer doesn't
  refine, it picks first-valid.
- **Algorithmic improvements / rewrites.** Port algorithms verbatim
  from the schedule-multi-table source. Any modernisation is a separate
  concern.

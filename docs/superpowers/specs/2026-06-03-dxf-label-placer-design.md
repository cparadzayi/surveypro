# DXF Per-Feature Label Placer (sub-project 4d) — Design

**Date:** 2026-06-03
**Status:** Approved (design)
**Component:** `app-backend` — new `services/dxfLabelPlacer.js` + integration into `services/dxfGenerator.js`
**Part of:** Re-baselining DXF parity against the production PDF generator
(`app-backend/src/services/pdfkitGeoPDF.js`, ~14,222 lines). This is
**sub-project 4d** of the 4a/4b/4c/4d decomposition. The full
re-baseline status:

| # | Sub-project | Status |
|---|---|---|
| 1 | Outside-figure annotation | shipped |
| 2 | Title-block SI 727 lines | shipped |
| 3 | Schedule of Areas multi-column | shipped (known design gap; see 3-v2) |
| 4a | Geometric primitives (`dxfGeometry.js`) | shipped at `46ce0e0` |
| 4b | Topological whitespace scanner (`dxfTopology.js`) | shipped at `90dbb4f` |
| 4c | Generic block placer (`dxfBlockPlacer.js`) | shipped at `4b000ba` |
| **4d** | **Per-feature label placer (`dxfLabelPlacer.js`)** | **this spec** |
| 3-v2 | Schedule of Areas placement using 4c | pending after 4d (or before) |
| 5 | Multi-sheet tiling | pending |
| 6 | Beacon enrichment | deferred (depends on 4d) |

## Purpose

The current DXF emits **stand numbers, distance labels, and direction
labels** with naive positioning that doesn't match the PDF's
per-feature intelligence:

- **Stand numbers** (`dxfGenerator.js:1191-1221`): emitted at the
  polygon's shoelace centroid with area-bucketed adaptive font sizing
  (8/10/12/14/16 pt). No check that the centroid actually lies inside
  the parcel polygon (concave parcels can have the centroid outside).
  No check that the rendered string width fits within the parcel.
- **Edge labels** (`dxfGenerator.js:1271-1273`): emitted at a fixed
  perpendicular offset from the edge midpoint, toward the parcel
  centroid. No check that the rotated label bbox actually fits inside
  the parcel — edge labels can extend beyond the parcel boundary into
  neighbouring parcels.

The PDF generator has per-feature placement intelligence that closes
both gaps:

- `calculateStandLabelPosition` (`pdfkitGeoPDF.js:1136-1225`): centroid
  inside-check + iterative font-size shrink to fit rendered string into
  parcel-allowable bounds.
- `calculateSmartLabelPosition` (`pdfkitGeoPDF.js:4321-4427`): iterative
  perpendicular-offset search with rotated-corner fit-inside-parcel
  check.
- `checkLabelFitsInParcel` (`pdfkitGeoPDF.js:6038-6070`): small utility
  used by both placers.

Goal: **port the PDF's per-feature label intelligence into a new
dependency-free `dxfLabelPlacer.js` module, integrate the placer into
`dxfGenerator.js`'s existing parcel-emission block, and verify the
Maglas plan's stand numbers and edge labels visibly improve while the
existing integration tests (entity counts, layer presence) stay
unchanged.**

This is the **first 4-series sub-project with end-user-visible output
changes**. 4a/4b/4c shipped pure foundation modules with zero
`dxfGenerator.js` integration. 4d ships the foundation module AND
integrates it.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope | Single 4d sub-project covering stand-label intelligence + edge-label intelligence + the shared `checkLabelFitsInParcel` utility. No beacon-label work (that's sub-project #6, deferred). No inter-label collision avoidance (the PDF doesn't do this either for distance/direction labels) |
| Integration | Wire INTO `dxfGenerator.js` immediately — two find/replace sites in the parcel-emission block. The DXF output changes (smarter positions) but entity counts and layer structure stay identical |
| Module name | New `app-backend/src/services/dxfLabelPlacer.js`. Continues the 4-series naming pattern |
| `findLargestInscribedCircle` fallback | Drop — the PDF's version is a stub that just returns the centroid (PDF line 1247-1251: `// TODO: Implement proper pole of inaccessibility algorithm if needed`). When centroid is outside the polygon, we just use the centroid anyway (matches PDF behaviour) |
| Font-width estimation | DXF can't query rendered string width like the PDF's `doc.widthOfString`. Use `charWidthRatio = 0.55` approximation (matches the value used in sub-project #2's `splitToWidth`) |
| `minFontHeightRatio` parameter | Default `0.5` — caps how aggressively the iterative shrink can shrink (no smaller than 50% of input `fontHeight`) |
| Returned `{x, y}` anchor convention | The DXF `addText` primitive uses **baseline-left** insertion (not the PDF's bottom-left convention). The placer returns the position the caller passes directly to `addText`. For stand labels that's the centroid (matching existing DXF behavior). For edge labels that's the perpendicular-offset midpoint. The PDF's `width/2, height/2` subtractions are NOT applied — they belong to the PDF's coordinate system, not DXF's |
| Iteration step in `findEdgeLabelPosition` | `labelHeight * 0.1` by default (configurable) so iteration count stays bounded across scales (PDF's hardcoded 1pt step is too fine for ground-metres at typical DXF scales) |
| Polygon shape | `Array<{x, y}>` — matches 4a/4b/4c convention |
| Tests | New file `dxfLabelPlacer.test.js`; 27 unit tests across 3 describe blocks. Existing integration tests verify the integration doesn't break entity counts |
| Manual CAD verification | Optional — listed because this is the first 4-series sub-project with visible output, but not required for completion |

## Architecture

**Two-file change:** new `dxfLabelPlacer.js` module + integration into
the existing `dxfGenerator.js:1164-1310` parcel-emission block.

### Module: `dxfLabelPlacer.js`

- **Imports:** `isPointInPolygon` from `./dxfGeometry.js` (4a). Standard
  library only beyond that.
- **Exports:** 3 named — `findStandLabelPosition`,
  `findEdgeLabelPosition`, `checkLabelFitsInParcel`. No default export.
  No module state.
- **Polygon shape:** `Array<{x, y}>` — matches 4a/4b/4c convention.
- **Unit-agnostic:** caller passes consistent units throughout.
  Caller (`dxfGenerator.js`) uses ground metres at the chosen scale.
- **No DXF emission inside the module** — pure position-computation.
  The caller does the actual `addText()` emission with the returned
  coordinates.

### Integration: `dxfGenerator.js`

Three insertion sites in the existing `// ── 3. Parcels + stand
numbers + edge labels ──` block:

1. **Stand label emission** (currently lines 1191-1221): replace the
   inline centroid + adaptive-font-bucket logic with a single call
   to `findStandLabelPosition`. Keep the `longestAngle` computation
   inline (current code does it correctly). Keep the
   `addText('STAND_NUMBERS', ...)` emission inline using the returned
   position and font height.

2. **Edge label perpendicular offset** (currently lines 1271-1273):
   replace the fixed `edgeOffset` toward-centroid offset with the
   iterative-search call to `findEdgeLabelPosition`. Both distance and
   direction labels at this edge share the returned anchor (offset
   between them handled by the existing label-pair emission).

3. **No structural changes** to the surrounding code: the parcel loop,
   shared-edge detection (`sharedEdges` / `labeledEdges` maps),
   distance/direction text computation (`distText`, `dirText`), layer
   assignments, warnings — all stay the same.

**No new layer, no new warning category, no route changes, no frontend
change.** Existing dxfGenerator integration tests assert entity counts
and layer presence; those should pass unchanged. The output
*coordinates* change (smarter positions), but the *count* of TEXT
entities per layer stays the same.

## Components

### Public API

#### `findStandLabelPosition({ polygon, standNumber, fontHeight, charWidthRatio?, minFontHeightRatio? }) → { x, y, fontHeight, width, height } | null`

The stand-label placer. Returns the bottom-left anchor for the label
plus the (possibly shrunk) font height and the estimated label bbox
dimensions. Returns `null` if the polygon is empty/invalid (< 3
vertices).

**Inputs:**

| Field | Type | Meaning |
|---|---|---|
| `polygon` | `Array<{x, y}>` | Parcel polygon (3+ vertices) |
| `standNumber` | `string` | The stand number to render (e.g. "1234") |
| `fontHeight` | `number` | Initial font height; may shrink during iteration |
| `charWidthRatio` (optional) | `number` | Character-width-to-height ratio for width estimation. Default `0.55` |
| `minFontHeightRatio` (optional) | `number` | Floor for the iterative shrink, as a fraction of input `fontHeight`. Default `0.5` (no smaller than half the input) |

**Algorithm** (verbatim from `pdfkitGeoPDF.js:1136-1225` with the DXF
font-width adaptation):

1. Compute polygon centroid via the shoelace formula (inline; doesn't
   depend on `dxfGenerator.js`'s helper).
2. Check `isPointInPolygon(centroid, polygon)`. If inside, use centroid.
   If outside (concave parcel), fall back to centroid anyway (PDF's
   "inscribed circle" is a stub).
3. Compute polygon bbox + the PDF's `edgeLabelReserve = 25` shrinkage
   to leave room for edge labels:
   - `maxAllowedWidth = max(15, bboxWidth - 2 * edgeLabelReserve)`
   - `maxAllowedHeight = max(10, bboxHeight - 2 * edgeLabelReserve)`
4. Estimate label width: `widthEstimate = standNumber.length * fontHeight * charWidthRatio`.
   Estimate label height: `heightEstimate = fontHeight * 1.2` (matches
   PDF's line-height factor).
5. Iterative shrink: while `widthEstimate > maxAllowedWidth * 0.5 OR
   heightEstimate > maxAllowedHeight * 0.5` AND `fontHeight >
   fontHeight_input * minFontHeightRatio`, reduce `fontHeight` by 10%
   of input and recompute estimates.
6. Return:
   - `x = centroid.x`, `y = centroid.y` — **the DXF `addText` insertion point** (baseline-left convention, matching existing DXF stand-label emission at `dxfGenerator.js:1220`)
   - `fontHeight` (final, possibly shrunk)
   - `width = widthEstimate` (informational, for caller's collision-checking or layout decisions)
   - `height = heightEstimate` (informational)

**Important:** the PDF's `calculateStandLabelPosition` subtracts
`width/2` and `height/2` from the position because PDF coordinates +
PDF text rendering use bottom-left anchor. DXF uses baseline-left at
the insertion point; the existing DXF stand emission passes `centroid.x,
centroid.y` directly to `addText`. The placer matches that convention.

#### `findEdgeLabelPosition({ edgeStart, edgeEnd, polygon, labelHeight, labelWidth, angle, maxOffsetMultiplier?, stepSize? }) → { x, y } | null`

The edge-label placer. Returns the anchor point for an edge label that
fits inside the parcel. Returns `null` for degenerate inputs
(zero-length edge or empty polygon).

**Inputs:**

| Field | Type | Meaning |
|---|---|---|
| `edgeStart` | `{x, y}` | Edge start point |
| `edgeEnd` | `{x, y}` | Edge end point |
| `polygon` | `Array<{x, y}>` | Parent parcel polygon |
| `labelHeight` | `number` | Label height (ground units) |
| `labelWidth` | `number` | Label width (ground units, estimated by caller) |
| `angle` | `number` | Label rotation in degrees |
| `maxOffsetMultiplier` (optional) | `number` | Max offset as multiple of `labelHeight`. Default `1` (matches PDF's `labelHeight + 5`) |
| `stepSize` (optional) | `number` | Iteration step. Default `labelHeight * 0.1` so iteration count stays bounded across scales (PDF's hardcoded 1pt is too fine in ground units) |

**Algorithm** (verbatim from `pdfkitGeoPDF.js:4321-4427`):

1. Compute edge midpoint and perpendicular direction
   (`perpNorm = {-edgeDy, edgeDx} / length`).
2. Test both perpendicular directions at small offset (5 ground units)
   to find which is inward via `isPointInPolygon`. Set `offsetDir = +1`
   or `-1` accordingly. If neither side is inside, default to `+1`.
3. Iterate offset from `2` up to `labelHeight * maxOffsetMultiplier +
   5` in `stepSize` increments. For each offset:
   - Compute label anchor: `labelX = midX + perpNorm.x * offsetDir * offset`,
     `labelY = midY + perpNorm.y * offsetDir * offset`.
   - Compute the 4 rotated corners of the label bbox using `angle`
     and `labelWidth`, `labelHeight`.
   - Check all 4 corners are inside `polygon` via `isPointInPolygon`.
   - First offset where all 4 corners are inside: return that anchor.
4. If no offset produces a fully-inside label, return the max-offset
   position (best-effort, same as PDF).

**Returned `{x, y}` is the DXF `addText` insertion point** (baseline-left
convention), matching the existing edge-label emission at
`dxfGenerator.js:1288`. The PDF's `labelOffset = -labelHeight/2`
vertical adjustment is NOT applied — that's a PDF text-rendering
artifact.

#### `checkLabelFitsInParcel({ centerX, centerY, labelWidth, labelHeight, polygon, padding? }) → boolean`

Simple bbox-with-padding check (PDF `:6038-6070` verbatim). Used
internally by both placers; exported so callers can validate label
positions independently.

- `padding` defaults to `5` ground units (matches PDF).
- Returns `true` if the label's bbox is fully inside the polygon's
  bbox minus padding on all sides.
- Cheap bbox check — doesn't do per-corner `isPointInPolygon`. Use
  the iterative-corner-check inside `findEdgeLabelPosition` for stricter
  validation.

### Internal helpers (not exported)

- Shoelace centroid: inlined in `findStandLabelPosition`.
- Rotated 4-corner computation: inlined in `findEdgeLabelPosition`.
- Polygon bbox: inlined where needed.

None are independently testable; their behaviour is verified through
the public functions.

## Data flow

```
dxfGenerator.js (line 1191 area — stand label emission)
  ├─ const standLabel = findStandLabelPosition({
  │     polygon: polyPts, standNumber: String(stand),
  │     fontHeight: standHeight,
  │   })
  └─ if (standLabel) addText('STAND_NUMBERS',
       standLabel.x, standLabel.y, String(stand),
       standLabel.fontHeight, longestAngle, 'BOLD')

dxfGenerator.js (line 1271 area — edge label perpendicular offset)
  ├─ const distWidth = String(distText).length * distHeight * 0.55
  │     // estimate; caller's char-width approximation
  ├─ const edgeLabelPos = findEdgeLabelPosition({
  │     edgeStart: a, edgeEnd: b, polygon: polyPts,
  │     labelHeight: distHeight, labelWidth: distHeight * 4, angle: ang,
  │   })
  ├─ const labelX = edgeLabelPos?.x ?? (mx + nx * edgeOffset)
  │     // fallback to old behaviour if placer returns null
  ├─ const labelY = edgeLabelPos?.y ?? (my + ny * edgeOffset)
  └─ addText('DISTANCES' or 'DIRECTIONS', labelX, labelY, ..., ang)
```

The null-fallback for `findEdgeLabelPosition` returning null is
important: if the polygon is degenerate or the edge is zero-length,
we want to preserve the existing inline behaviour rather than skipping
the label entirely.

## Error handling

**None required beyond null returns.** Pure functions, no I/O.

- Empty/invalid polygon (< 3 vertices) → returns `null`. Caller in
  `dxfGenerator.js` falls back to the existing inline behaviour (skip
  the label for stand labels; use the fixed `edgeOffset` for edge
  labels).
- Negative `fontHeight`, `labelHeight`, `labelWidth` → garbage outputs;
  no defensive guards (matches 4-series pattern).
- Polygon with non-finite coordinates → the existing dxfGenerator code
  filters these upstream (`dxfGenerator.js:1176-1182`); the placer
  doesn't see them.
- `isPointInPolygon` boundary ambiguity (documented in 4a) → resolved
  by the iterative offset stepping inward.

**No new warning category.** If a placer returns `null`, the caller
silently skips or falls back (matches the existing behaviour for
non-finite centroids at `dxfGenerator.js:1219`).

## Testing

Single new file: `app-backend/src/services/__tests__/dxfLabelPlacer.test.js`.

Per-helper unit tests against synthetic parcels with hand-verifiable
expected outcomes. No fixtures, no mocks, no DXF involvement.

### `checkLabelFitsInParcel` (5 tests)
- Label fully inside parcel bbox → `true`.
- Label fully outside → `false`.
- Label straddles one edge → `false`.
- Label fits exactly at padding boundary → `true` (boundary inclusive).
- Padding parameter adjusts cutoff — same position passing at
  padding=0 fails at padding=10.

### `findStandLabelPosition` (10 tests)
- Square parcel with short stand number → centroid returned at full
  input font height.
- Long stand number that needs shrink → returned `fontHeight` is
  smaller than input.
- Extremely long stand number → `fontHeight` floors at the
  `minFontHeightRatio` default (50% of input).
- Concave (L-shape) parcel where centroid is outside → falls back
  gracefully (returns centroid anyway; stub-equivalent).
- Empty polygon → returns `null`.
- Single-vertex / 2-vertex polygon → returns `null`.
- Returned `{x, y}` matches the centroid (DXF baseline-left anchor for
  `addText` insertion; NOT bottom-left like the PDF).
- Returned `width` ≈ `standNumber.length * fontHeight * charWidthRatio`
  ± epsilon (informational only).
- `width <= maxAllowedWidth * 0.5` after the shrink loop terminates
  (when sufficiently small parcel + long string).
- `charWidthRatio` parameter adjusts the width estimate — same input
  at ratio 0.7 produces a wider label.

### `findEdgeLabelPosition` (12 tests)
- Square parcel, horizontal edge at bottom → label placed above
  (inward), small offset.
- Square parcel, vertical edge on right → label placed left (inward).
- Concave parcel where the natural-offset position is outside →
  iterative search lands at a larger offset.
- Edge too close to perpendicular boundary → max-offset returned
  (best-effort, label not fully inside).
- Empty polygon → returns `null`.
- Zero-length edge (start == end) → returns `null` (defensive).
- `angle` parameter affects corner positions — same edge with
  different angle produces different corner-fit results.
- `maxOffsetMultiplier` larger value lets the iteration explore further.
- Both perpendicular directions tested — if the "natural" inward
  direction is outside, the opposite direction is tried.
- Step size is `labelHeight * 0.1` by default; explicit override via
  `stepSize` parameter works.
- Returned anchor is on the inward side of the edge midpoint (positive
  perpendicular toward parcel interior).
- DXF baseline-left anchor convention — caller's `addText` uses the
  returned `{x, y}` directly (no further offset).

### Integration regression (existing tests, no new file)

The existing `dxfGenerator.integration.test.js` has 13 tests in the
"sample fixture" describe block plus the entity-count assertions in
the layer-presence checks. After 4d's integration, these should still
pass:

- Entity counts on `STAND_NUMBERS`, `DISTANCES`, `DIRECTIONS` layers
  stay the same (one per parcel / edge as before).
- Layer presence unchanged (13 required layers, no new ones).
- No new warning categories trigger.
- `warnings.count === 0` for the clean sample fixture.

If any existing integration test fails after the rewrite, that's a
real regression. The new placer should produce different
**coordinates** but the same **count** of TEXT entities.

Total new: **27 unit tests** + the existing integration regression
suite must continue to pass.

### Optional manual CAD verification

Generate a DXF from the Maglas test fixture, open in LibreCAD,
eyeball:
- Stand numbers stay inside parcels (concave parcels improved).
- Edge labels don't extend across edges into neighbouring parcels.
- Stand-number font sizes shrunk appropriately for long numbers.

Not required for sub-project completion — listed because this is the
first 4-series sub-project with visible output changes.

## Non-goals

- **Beacon-label placement.** That's sub-project #6 (beacon
  enrichment), deferred. Beacon labels involve different geometric
  constraints (label-toward-beacon-then-toward-centroid) and the
  beacon-specific `calculateLabelPositionQuality` Imhof scoring.
- **Inter-label collision avoidance.** The PDF doesn't do this for
  distance/direction labels either; each label only checks
  fit-inside-its-parcel. Adding cross-label tracking would be a
  meaningful new abstraction — separate sub-project if it's ever
  needed.
- **`findLargestInscribedCircle` (pole of inaccessibility).** The PDF's
  version is a stub (`// TODO`). Properly implementing it is out of
  scope; we match the PDF's stub behaviour (centroid fallback).
- **Algorithmic improvements / rewrites.** Port verbatim from the PDF.
  Any modernisation is a separate concern.
- **New layers or warning categories.** Existing
  STAND_NUMBERS/DISTANCES/DIRECTIONS layers and existing warnings
  schema unchanged.

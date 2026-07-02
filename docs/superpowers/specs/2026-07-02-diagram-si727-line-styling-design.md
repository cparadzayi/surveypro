# Diagram SI 727 Line Styling — Design

**Status:** Approved (design phase)
**Date:** 2026-07-02
**Author:** cparadzayi (with Claude)

## Problem

The S.G. Diagram must follow SI 727 line-styling rules, verified against a real
sample (STAND 302, S.G. No. 221/2023, `Desktop/tecno 7/IMG-20260630-WA0026.jpg`):

- The boundaries of the land represented (the subject figure) shall be **continuous,
  well-defined black lines**. (Currently drawn green.)
- Adjacent boundaries of contiguous properties, road-ways and servitudes shall be
  **broken black lines**. (Neighbours currently solid grey.)
- The figure shall be distinguished by a **uniform colour border on the inner side**
  of the boundary — the sample uses a **green** band inside the black boundary —
  the colour not so dark as to obscure detail. (No inner border today.)
- Roads and servitudes necessarily depicted shall be coloured **burnt sienna** and
  **blue** respectively. (The sample's "Klein Road" is burnt sienna.)

## Scope

- Diagram plan type only (`diagramPdf.js` + `diagram/*` helpers).
- **In scope now:** black subject boundary; green inner figure-border band;
  dashed-black contiguous (neighbour) boundaries.
- **Deferred:** road = burnt sienna / servitude = blue colouring. The diagram data
  has **no per-feature road/servitude typing** (only parcels/neighbours), so there
  is nothing to colour yet. Add when road/servitude features become identifiable.

## Non-goals (YAGNI)

- No road/servitude colouring (deferred, see Scope).
- No change to the table, statement, scale bar, margins, beacons, or labels beyond
  their draw order relative to the new green band.
- No DXF (2c).

## Constants

- `PT_PER_MM = 72 / 25.4`.
- `FIGURE_GREEN = '#2f9e4f'` — medium green matching the sample; light enough not
  to obscure detail. (Replaces the old boundary green `#0a7d34`.)
- `INNER_BAND_PT = 1.3 * PT_PER_MM` (≈ 3.69 pt) — page-relative band width, so it
  prints at a consistent ~1.3 mm regardless of scale.
- `BOUNDARY_BLACK = '#000000'`, subject boundary line width `1.2` pt.
- Neighbour boundary: `BOUNDARY_BLACK`, width `0.5` pt, dashed `doc.dash(2, { space: 2 })`.

## Architecture

### New pure helper: `app-backend/src/services/diagram/offsetPolygon.js`

A generic planar polygon offset in an arbitrary coordinate space (used here in PDF
points), separate from `neighbourBuffer.js` (which is Cape-Lo-specific and normalizes
coordinates — not wanted here).

- `offsetPolygonPt(points, deltaPt) => Array<Array<[x, y]>>`
  - `points`: the polygon as `[[x, y], …]` (no normalization).
  - Offsets by `deltaPt` (negative = inward) via `clipper-lib` `ClipperOffset`
    (`jtMiter` or `jtRound`; round is fine), integer-scaled by `PT_SCALE = 100`
    (points → 0.01 pt precision).
  - Returns the offset polygon(s) as `[[x, y], …]` rings; `[]` if the inward offset
    collapses the polygon (band too wide for a tiny figure).

### `diagramPdf.js` changes — subject figure

Replace the current subject draw (green `drawRing` + beacon circles + labels) with,
in this order:

1. **Green inner band.** Compute `inner = offsetPolygonPt(subjPt→[[px,py]], -INNER_BAND_PT)`.
   If non-empty, fill the ring (outer `subjPt` subpath + each inner subpath) with
   `FIGURE_GREEN` using the **even-odd** rule (`doc.fill('#2f9e4f')` after building
   both subpaths with `doc.fillRule('even-odd')` / `doc.fill(color, 'even-odd')`).
   The even-odd rule leaves the interior of the figure clear and paints only the
   band between the boundary and the inward offset.
2. **Black boundary.** `drawRing(doc, subjPt, { color: BOUNDARY_BLACK, width: 1.2 })`
   — continuous, on top of the band.
3. **Beacon circles** (white knockout) — unchanged, on top.
4. **Vertex labels** — unchanged placement (already outside, line-avoiding).

If `inner` is empty (band too wide for a very small figure), skip the band and just
draw the black boundary (graceful degrade).

### `diagramPdf.js` changes — neighbours

In the neighbour loop, stroke the boundary segments **dashed black** instead of solid
grey: `doc.save().dash(2, { space: 2 }).lineWidth(0.5).strokeColor(BOUNDARY_BLACK)`
… draw segments … `doc.stroke().undash().restore()`. Segment collection for label
avoidance (`neighbourSegs`) is unchanged. Neighbour stand labels keep their current
colour/placement.

## Error handling / edge cases

- `offsetPolygonPt` returns `[]` when the figure is smaller than ~2×`INNER_BAND_PT`
  → band skipped, black boundary still drawn.
- Degenerate subject (<3 vertices) → no band, boundary drawing already guards `<3`.
- `doc.dash`/`undash` are wrapped in `save()`/`restore()` so dashing never leaks into
  the subject boundary or other strokes.

## Testing

- `offsetPolygon.js` (Jest, pure): a 100 pt square offset inward by 10 pt yields a
  polygon whose bbox is ~10 pt smaller on each side; a large inward offset that
  collapses the square returns `[]`.
- `diagramPdf.test.js`: existing tests still pass (valid `%PDF-`, no throw) with the
  new draw order.
- Manual visual acceptance: regenerate the STAND 302/303 diagram and confirm the
  figure has a green inner band, continuous black boundary, and dashed-black
  contiguous boundaries — matching the sample.

## Rollout

Single spec + plan. Order: `offsetPolygon.js` helper (TDD) → `diagramPdf.js` subject
band + black boundary + dashed neighbours → manual visual. Diagram-only.

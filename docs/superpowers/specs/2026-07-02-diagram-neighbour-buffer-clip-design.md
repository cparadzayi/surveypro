# Diagram Neighbour Buffer Clip — Design

**Status:** Approved (design phase)
**Date:** 2026-07-02
**Author:** cparadzayi (with Claude)

## Problem

The S.G. Diagram currently draws every non-subject parcel in full at the
subject's scale, so whole neighbouring stands and the site's OUTSIDE FIGURE
sprawl across the sheet (see the STANDS 403-405 sample). A diagram should show
the subject parcel plus only a thin ring of surrounding context — the abutting
properties near the subject boundary — not the entire survey site.

## Goal

Show, around the subject, only the portion of each abutting/contiguous property
that falls within a **true ~10 m offset buffer** of the subject parcel, labelled
with its stand/designation. Everything beyond the buffer is omitted.

## Scope

- Diagram plan type only (`diagramPdf.js`). No change to General/Working/DXF.
- Buffer = **shape-following 10 m outward offset** of the subject polygon (planar,
  in Cape Lo metres), not a padded bounding box.
- Neighbours are **clipped** (polygon intersection) to that buffer and labelled.
- The enclosing **OUTSIDE FIGURE parcel is excluded entirely** from the diagram.
- The figure area is scaled to the buffer (subject + 10 m) so the context ring
  fits on the sheet.

## Non-goals (YAGNI)

- No user-configurable buffer distance (fixed 10 m).
- No named roads, no dashed connection lines, no neighbour edge-length labels
  (still deferred).
- No change to the subject figure, table, bearings, margins, or paper size.
- Not applied to DXF (that is diagram sub-project 2c).

## Dependency

Add **`clipper-lib@6.4.2`** (Angus Johnson's Clipper, pure JS, zero deps) to
`app-backend`. It provides both operations we need in the metre plane:
- `ClipperLib.ClipperOffset` — the 10 m outward polygon offset (round joins).
- `ClipperLib.Clipper` with `ctIntersection` — clip neighbours to the buffer.

Clipper works in **integer** coordinates, so all metre coordinates are scaled by
`CLIPPER_SCALE = 1000` (⇒ mm precision) before, and divided after. `@turf/buffer`
is explicitly rejected: it is geodesic and assumes WGS84 lng/lat, producing
garbage on projected Cape Lo metres (Southing ≈ 2.14 M).

## Architecture

### New pure helper: `app-backend/src/services/diagram/neighbourBuffer.js`

All geometry is canonical `[Y=Westing, X=Southing]` metres; every incoming ring
point is passed through `normalizeCapeLoYX` (from `../pdfkitGeoPDF/geometry.js`)
first, matching the rest of the diagram pipeline.

Constants: `BUFFER_M = 10`, `CLIPPER_SCALE = 1000`.

- `bufferRing(ring, distanceM = BUFFER_M) => Array<Array<[y,x]>>`
  Offsets the (normalized, de-duplicated) subject ring outward by `distanceM`
  using `ClipperOffset` (`jtRound`, `etClosedPolygon`). Returns one or more
  polygons as arrays of `[y,x]` metre points. Round join tolerance chosen so a
  vertex arc is smooth at diagram scale.

- `clipRingToPolygon(neighbourRing, clipPolys) => Array<Array<[y,x]>>`
  Intersects a neighbour ring against the buffer polygon(s) via
  `Clipper.Execute(ctIntersection, …)`. Returns the clipped polygon(s); `[]` when
  the neighbour does not reach the buffer (non-abutting → omitted).

- `ringExtent(polys) => { minY, maxY, minX, maxX }`
  Bounding box over one or more `[y,x]` polygons (used to size the figure to the
  buffer).

- `isOutsideFigureFeature(feature) => boolean`
  Port of the frontend `getOutsideFigureParcel` heuristic: true when
  `properties.designation` / `properties.stand` / `properties.description`
  (case-insensitive) contains `outside figure` / `outside_figure` /
  `outsidefigure`, or `stand` === `of`, or `properties.is_outside_figure` /
  `properties.metadata?.is_outside_figure` / `properties.metadata?.isOutsideFigure`
  is `true`.

Internal helpers: `toClipper(ring)` (normalize + scale to `{X,Y}` int paths),
`fromClipper(path)` (unscale to `[y,x]`), and de-duplication of the closing point.

### `diagramPdf.js` changes

1. Import `bufferRing`, `clipRingToPolygon`, `ringExtent`, `isOutsideFigureFeature`.
2. After resolving the subject: `const buffer = bufferRing(subjectRing)` where
   `subjectRing = subject.geometry.coordinates[0]`.
3. **Figure extent** = `ringExtent(buffer)` (falls back to `parcelExtent(subject)`
   if the buffer is empty/degenerate). Feed this extent to
   `pickDiagramScale`/`makeTransform` so the subject + 10 m ring fills the figure.
   (`parcelExtent` keeps its current subject-only role as the fallback.)
4. Neighbours loop: for each feature that is **not** the subject and **not**
   `isOutsideFigureFeature`, compute `clipRingToPolygon(featureRing, buffer)`;
   for each returned strip draw the faint outline (existing style: `#999`, 0.5 pt)
   and, once per feature, draw its `stand`/`designation` label at the clipped
   centroid (centroid of the largest strip). Empty result → skip the feature.
5. Subject drawing, table, bearings, scale bar, border, etc. unchanged.

The existing `ringToPt(feature, tf)` full-ring path for neighbours is replaced by
drawing the clipped strips (each strip → points via `tf`).

## Error handling / edge cases

- Subject ring with < 3 points, or `bufferRing` throws/returns empty → skip the
  buffer/neighbour step, draw the subject only (figure extent = `parcelExtent(subject)`).
- `clipRingToPolygon` returning multiple polygons → draw each; label at the
  largest-area strip's centroid.
- Neighbour fully inside the buffer → clip returns the whole neighbour (fine).
- Degenerate/zero-area clip results are dropped.
- Clipper integer overflow avoided by `CLIPPER_SCALE = 1000` (Cape Lo values ≈
  2.14 M × 1000 = 2.14e9, within Clipper's safe `hiRange`).

## Testing

- `neighbourBuffer.js` (Jest, pure):
  - `bufferRing` of a 100 m square (realistic Cape Lo coords, stored
    `[Southing,Westing]`) yields a polygon whose bbox is ~10 m larger on every
    side (tolerance for round joins).
  - `clipRingToPolygon`: a large neighbour overlapping the subject clips to a
    strip whose bbox lies within the buffer bbox; a far neighbour clips to `[]`.
  - `isOutsideFigureFeature`: true for designation "OUTSIDE FIGURE" / stand "OF" /
    `metadata.is_outside_figure`; false for a normal stand.
- `diagramPdf.test.js`: subject + one abutting neighbour + one far neighbour +
  one OUTSIDE FIGURE parcel → valid `%PDF-`, non-trivial length, no throw
  (far parcel and OF omitted; asserted indirectly via no-crash + size guard).
- Manual visual acceptance: regenerate the STANDS 403-405 diagram and confirm
  only the ~10 m ring of 404 / 405 / REM/87 shows around the subject, labelled,
  with no OUTSIDE FIGURE and no full-site sprawl.

## Rollout

Single spec + plan. Order: add dependency + `neighbourBuffer.js` helper (TDD),
then wire `diagramPdf.js`, then manual visual check. Diagram-only; no impact on
other renderers.

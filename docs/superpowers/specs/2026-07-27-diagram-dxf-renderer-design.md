# DXF diagram renderer (line-art twin of the PDF diagram)

**Date:** 2026-07-27
**Status:** Design approved, pending spec review
**Scope:** New backend renderer + one route branch. Frontend needs no change.

## Problem

The app has two diagram-generation paths that should agree but don't:

- **PDF path** (`POST /api/geopdf/vector`): branches on `planType === 'diagram'` to
  `generateDiagramPDF` (`app-backend/src/services/diagramPdf.js`) — the real SI 727 diagram
  layout (co-ordinate table, beacon description, figure with lettered beacons, adjoining
  road/servitude/contiguous annotations, scale bar, north arrow, statement, reg-53 grid).
- **DXF path** (`POST /api/geopdf/dxf`): has **no such branch**. It always calls
  `generateDXF` in `dxfGenerator.js` — the **general plan** DXF generator — regardless of
  `planType`. So requesting a Diagram's DXF silently produces a general-plan DXF instead.

There is currently no DXF diagram renderer at all.

## Desired behaviour

A DXF "twin" of the PDF diagram: same layout, same blocks, same content — rendered as DXF
line art (DXF has no fills/opacity) instead of PDFKit. `POST /api/geopdf/dxf` routes to it
when `planType === 'diagram'`, exactly mirroring how `/vector` already routes the PDF side.
No frontend change is required — the frontend already sends `planType` on both endpoints and
already requests PDF+DXF together when both checkboxes are ticked.

## Fidelity target: full 1:1 layout twin

Every block the PDF diagram renders gets a DXF counterpart, in this order (matching
`generateDiagramPDF`'s draw sequence):

1. Border (`layout.border` rect)
2. Subject boundary + inner "figure band" (green in the PDF) — outline in DXF, see Colour below
3. Adjoining features (road / servitude / contiguous) — diagram-specific: roads and
   servitudes are FILLED bands in the diagram (unlike the general plan, which is label-only
   for roads); contiguous stays dashed stubs. Reuses `contiguousMarks` + `roadBandRibbon`.
4. Beacon circles (white-knockout look in the PDF — see Beacon circles below) + vertex letters
5. Neighbour stand labels
6. Sides/Directions/Co-ordinates table + "Lo NN" label + DIAGRAM S.G. No. column
7. Description of Beacons block
8. North arrow
9. Approved box
10. Scale bar
11. Statement ("The figure represents … of land called … situate in the district of … Surveyed … by me")
12. Reference grid (reg-53), when present in metadata

## Architecture

### New file: `app-backend/src/services/diagramDxf.js`

Mirrors `diagramPdf.js` block-for-block and **imports the identical shared, pure helpers**
already used by the PDF renderer, so DXF and PDF can never structurally drift:

- `diagram/subjectGeometry.js` — `deriveSubjectGeometry`
- `diagram/diagramScale.js` — `parcelExtent`, `pickDiagramScale`, `makeTransform`, `beaconRadiusPt`
- `diagram/sidesTable.js` — `buildSidesTable`, `buildFigureRepresents`, `formatDiagramArea`
- `diagram/designation.js` — `resolveStatementDesignation`
- `diagram/referenceGrid.js` — `buildReferenceGrid`
- `diagram/diagramLayout.js` — `computeDiagramLayout`, `pageDimsPt`, `marginsPt`
- `diagram/offsetPolygon.js` — `offsetPolygonPt`
- `diagram/neighbourBuffer.js` — `bufferRing`, `clipRingToPolygon`, `ringExtent`,
  `isOutsideFigureFeature`, `neighbourBoundaryEdges`
- `diagram/edgeStrip.js` — `edgeStrip`
- `diagram/contiguousMarks.js` — `contiguousMarks`
- `diagram/roadBandRibbon.js` — `roadBandRibbon`
- `diagram/beaconDescription.js` — `buildBeaconDescription`
- `diagram/numberFormat.js` — `formatSI`

`diagram/vertexLabel.js`'s `placeVertexLabel` returns a top-left `{x,y}` sized for a text
box in PDF-point space; the DXF renderer reuses it unchanged (same collision-avoidance
math) since the whole layout is computed in PDF points before the final mm conversion —
see Coordinate space below.

**Not reused:** `adjoiningFeaturesDxf.js` (that module is the general-plan's label-only
road treatment — the diagram fills roads, so `diagramDxf.js` ports `diagramPdf.js`'s
`drawAdjoiningFeatures` logic directly, in DXF primitives).

### New file: `app-backend/src/services/diagram/dxfPrimitives.js`

A small, **self-contained** DXF file writer — group-code helper + HEADER/LAYER-table/
ENTITIES/EOF assembly + entity emitters (`addLine`, `addLwpolyline`, `addText`, `addTextC`,
`addCircle`, `addRect`). This is a deliberate duplication of the low-level plumbing that
already exists privately inside `dxfGenerator.js`: extracting a shared module and refactoring
`dxfGenerator.js` to use it was considered and rejected for this project — `dxfGenerator.js`
has existing snapshot/parity tests and refactoring it is out of scope and adds risk for no
behavioural benefit here. `dxfGenerator.js` is **not modified**. The duplicated plumbing is
~150-200 lines of boilerplate that rarely changes; a future consolidation is a separate,
optional project if the duplication becomes a maintenance problem.

### Route wiring

`app-backend/src/routes/geopdf-vector.js`, in the `/dxf` handler: branch on
`planType === 'diagram'` to `generateDiagramDXF(...)` (new), else keep calling `generateDXF`
(unchanged) — mirroring the existing `if (planType === 'diagram')` branch already present in
the `/vector` handler for the PDF side. Same request payload shape both branches already
receive (`parcels, beacons, outsideFigureData, metadata, projection, scale, sheetSize,
orientation, planType`).

## Coordinate space: real ground coordinates (revised)

**Correction to the original design:** a plain paper-mm conversion (dividing PDF points by
points-per-mm) would draw the whole diagram floating near ground-space origin (0,0),
disconnected from the parcel's real Cape Lo location — useless for CAD overlay, and
inconsistent with `dxfGenerator.js`'s own convention. `dxfGenerator.js` instead places
parcel geometry at its **true, unscaled ground (Cape Lo) coordinates** via
`capeLoToDxfSouthUp(y, x) -> {x: -y, y: -x}` (exported from `dxfGenerator.js`), and
positions its title-block/table content in **ground metres, sized via `ptToGround`/
`mmToGround` at the plan's own scale `S`**, anchored to the drawing's real extent centre —
the standard survey-CAD convention (plot at 1:S and the sheet reproduces correctly around
the real parcel location).

`diagramDxf.js` reuses `diagramPdf.js`'s exact PDF-point layout math (`computeDiagramLayout`,
`pickDiagramScale`, `makeTransform`) unchanged, then applies **one conversion function** that
maps every page-point coordinate — figure geometry AND every annotation block alike — into
ground DXF coordinates:

```js
const groundPerPt = ptToGround(1, denom)          // ground metres per PDF point at this diagram's scale
const figCenterPx = layout.figure.x + layout.figure.width / 2
const figCenterPy = layout.figure.y + layout.figure.height / 2
const centerY = (extent.minY + extent.maxY) / 2   // canonical Cape Lo Y/X centre of the drawing extent
const centerX = (extent.minX + extent.maxX) / 2
const groundCenter = { x: -centerY, y: -centerX } // = capeLoToDxfSouthUp(centerY, centerX)

function pageToGround({ px, py }) {
  return {
    x: groundCenter.x + (px - figCenterPx) * groundPerPt,
    y: groundCenter.y - (py - figCenterPy) * groundPerPt,   // PDF y-down → ground y-up
  }
}
```

This is verified algebraically (not just asserted): composing `pageToGround(tf(v))` for any
geographic vertex `v` transformed by the shared `makeTransform` reduces EXACTLY to
`capeLoToDxfSouthUp(v.y, v.x)` — i.e. the subject figure, beacons, and adjoining features
land at their true, real Cape Lo ground coordinates automatically, with **no separate
code path** needed for geometry vs. annotation. Every other block (border, table, beacon
description, north arrow, approved box, scale bar, statement, reference grid) is already
computed in the same page-point space by the shared layout helpers, so the identical
`pageToGround` call places all of them in ground-metres, correctly scaled and anchored
around the real parcel location — matching `dxfGenerator.js`'s own technique.

Text/symbol sizes (font heights, beacon radius, line widths) convert via the same scalar:
`groundPerPt * sizeInPt` (equivalently `ptToGround(sizeInPt, denom)`).

## Colour / line-art conventions

DXF has no fill-opacity; the PDF's coloured fills become **outlines on coloured layers**
(the convention `dxfGenerator.js` already uses for its own adjoining features):

| PDF element | PDF treatment | DXF treatment |
|---|---|---|
| Figure boundary | black stroke | `FIGURE` layer (ACI 7/white), boundary polyline |
| Inner figure band | green fill (`FIGURE_GREEN`) between boundary and inset | `FIGURE_BAND` layer (ACI 3/green), TWO polylines (outer boundary + inset ring) — no fill |
| Beacon circles | white-fill-knockout over lines, black stroke | `BEACONS` layer circle, drawn AFTER the boundary/adjoining lines so it reads as a clear circle (DXF has no knockout — plain circle outline; entity draw order in most CAD viewers doesn't clip, so this is a known, accepted visual difference from the PDF, not a defect) |
| Vertex letters | black text | `FIGURE_LABELS` layer (ACI 7) |
| Road band (filled) | burnt-sienna fill, thin ribbon bent to offshoots | new `DIAGRAM_ROAD` layer, ACI 1 (red — the closest standard AutoCAD colour to burnt-sienna; there's no filled-road convention to reuse from `dxfGenerator.js`, whose `ADJOINING` layer is label-only/unfilled), outline of the `roadBandRibbon` polygon |
| Servitude strip | blue fill | `ADJOINING_SERVITUDE` layer (ACI 5/blue, same name+colour `dxfGenerator.js` already uses) outline of the `edgeStrip` quad |
| Contiguous stubs | black dashed line | `ADJOINING` layer (ACI 7, same name+colour `dxfGenerator.js` already uses for contiguous stubs/labels), DASHED linetype |
| Table / statement / beacon description / title text | black text | respective layers (ACI 7), `addText`/`addTextC` |
| Scale bar checkerboard | black fill alternating cells | `SCALE_BAR` layer, each filled cell as a small `addRect`-equivalent outline OR a filled `SOLID` entity (2D solid) — filled cells use DXF `SOLID` (a real filled primitive, unlike the road/band treatment) since a checkerboard read as outlines only would be illegible |
| Reference grid (reg-53) | black ruled grid + text | `GRID` layer lines + text |

Layer list mirrors `dxfGenerator.js`'s existing ACI palette where the same concept appears
(e.g. `ADJOINING`, `ADJOINING_SERVITUDE`) for visual consistency between the two DXF outputs
a surveyor might open side by side.

## Scope boundaries (YAGNI)

- **No new frontend code.** The existing "DXF" checkbox and `planType` payload already
  reach the backend unchanged; only the backend route branch is new.
- **No refactor of `dxfGenerator.js`.** It is untouched, byte-for-byte, by this project.
- **No PDF-visual-parity pixel matching.** DXF is line art; the beacon-knockout difference
  (see table above) is accepted, not solved.
- **No changes to `diagramPdf.js`** beyond none needed — it is only *read from* (its helper
  imports), never modified.

## Testing

- New `app-backend/src/services/diagram/__tests__/dxfPrimitives.test.js`: the primitive
  writer produces a well-formed DXF (starts with `SECTION`/`HEADER`, ends `EOF`, declares
  every layer used).
- New `app-backend/src/services/__tests__/diagramDxf.test.js`, mirroring
  `diagramPdf.test.js`'s cases: returns a valid DXF buffer; throws when the subject parcel
  is missing; renders with beacons + Lo system; honors sheet size; renders adjoining-feature
  annotations (road/servitude/contiguous, single- and both-terminal); reference grid present
  only when `metadata` supplies reg-53 data.
- Route test: no test file exists yet for `geopdf-vector.js` (confirmed — there is no
  `app-backend/src/routes/__tests__/geopdf-vector*.test.js`). Add a new, focused
  `app-backend/src/routes/__tests__/geopdf-vector.dxf.test.js` covering only the `/dxf`
  handler's branch: `planType: 'diagram'` calls `generateDiagramDXF` and returns its
  buffer; any other `planType` still calls `generateDXF` unchanged. Does not attempt to
  cover the rest of the route file.
- Manual/visual: import a generated diagram DXF into a CAD viewer (or reuse this session's
  `pymupdf`-based visual-QA habit, adapted — a DXF viewer or a DXF→image conversion path)
  to confirm the layout matches the PDF diagram for the same input.

## Files touched

New:
- `app-backend/src/services/diagram/dxfPrimitives.js`
- `app-backend/src/services/diagramDxf.js`
- `app-backend/src/services/diagram/__tests__/dxfPrimitives.test.js`
- `app-backend/src/services/__tests__/diagramDxf.test.js`
- `app-backend/src/routes/__tests__/geopdf-vector.dxf.test.js`

Modified:
- `app-backend/src/routes/geopdf-vector.js` (`/dxf` handler: add the `planType === 'diagram'` branch)

Untouched:
- `app-backend/src/services/dxfGenerator.js`
- `app-backend/src/services/adjoiningFeaturesDxf.js`
- `app-backend/src/services/diagramPdf.js`
- All frontend files

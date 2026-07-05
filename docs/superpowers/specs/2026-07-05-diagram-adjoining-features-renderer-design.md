# Diagram Adjoining Features — Renderer + Data Contract (Sub-project A)

**Status:** Approved (design phase)
**Date:** 2026-07-05
**Author:** cparadzayi (with Claude)

## Problem / context

A cadastral diagram must show what lies beyond the subject figure's boundaries:
**contiguous properties, roads, and servitudes** (SI 727). Roads render burnt-sienna,
servitudes blue; contiguous boundaries are broken black lines with the neighbour's
designation. The colouring was **deferred** earlier because the diagram data had no
per-feature road/servitude typing (see `2026-07-02-diagram-si727-line-styling-design.md`).

Neighbours are **not fully surveyed** and (for now) do **not exist in the database**, so
there is no neighbour geometry to draw. What we *do* have is the subject figure's
**lettered boundary sides** (AB, BC, …). The chosen model is therefore **per-side
adjacency annotation**: for each subject side, record what lies beyond it, and render
accordingly. When a cadastral base layer exists later, the existing adjacent-properties
logic can auto-populate the same annotations (out of scope here — sub-project B builds
the interactive UI that produces them).

## Scope

**Sub-project A (this spec):** the **data contract** + the **backend rendering** of
adjoining features from that contract. Diagram plan type only
(`diagramPdf.js` + a new `diagram/edgeStrip.js` helper).

**Non-goals (YAGNI):**
- The interactive map UI that lets a surveyor classify sides (**sub-project B**).
- Auto-population from a cadastral base layer (future).
- DXF (2c).
- No change to the current auto-derived neighbour buffer/clip — this adds an
  annotation-driven layer on top; the two coexist.

## Data contract

`metadata.sideAnnotations: SideAnnotation[]`, passed frontend → `/geopdf/vector` →
`generateDiagramPDF(options)` (already receives `metadata`).

```ts
SideAnnotation = {
  side: string            // a subject side, e.g. 'AB' (from-letter + to-letter)
  role: 'contiguous' | 'road' | 'servitude'
  label?: string          // designation / road name / servitude description
  widthM?: number         // servitude only: defined width in ground metres
}
```
- Unknown/empty `sideAnnotations` → nothing new drawn (fully backward compatible).
- A `side` that doesn't match any subject edge is skipped (logged via `logger.warn`).

## Rendering

The subject figure is already transformed to PDF points in `generateDiagramPDF`:
`subjPt = geometry.vertices.map(v => tf([v.y, v.x]))` (each `{px,py}`, index i ↔
`geometry.vertices[i].letter`), with `subjCentroid = centroidPt(subjPt)` and scale
denominator `denom`. A side `'AB'` resolves to the edge between the vertex whose letter
is `A` and the next vertex (`B`): find `i` where
`vertices[i].letter+vertices[i+1].letter === side`; edge = `subjPt[i] → subjPt[(i+1)%n]`.

New pure helper `app-backend/src/services/diagram/edgeStrip.js`:
```
edgeStrip([x1,y1], [x2,y2], widthPt, [cx,cy]) → [[x,y] × 4]
```
Returns the quad formed by the edge and its **outward** parallel (outward = the normal
direction that moves the edge midpoint *away* from the centroid `[cx,cy]`), width
`widthPt`. Pure, deterministic, unit-tested.

Per annotation, a new `drawAdjoiningFeatures(doc, { geometry, subjPt, subjCentroid, denom, annotations, layout, logger })` in `diagramPdf.js` (called after the neighbour
boundaries + subject figure, before/feeding the label pass):

- **road** → fill `edgeStrip(edge, ROAD_STRIP_PT, centroid)` with `BURNT_SIENNA` at
  `STRIP_FILL_OPACITY`; place the `label` (road name) outside the edge.
- **servitude** → fill `edgeStrip(edge, widthM · ptPerGroundM, centroid)` with
  `SERVITUDE_BLUE` at `STRIP_FILL_OPACITY`; place the `label` outside. `widthM` is
  ground metres scaled to the page via `ptPerGroundM = (72/25.4) · 1000 / denom` (same
  factor the scale bar uses). Missing/0 `widthM` → skip the strip, still label + warn.
- **contiguous** → the shared boundary is already the subject's continuous black line, so
  draw a short **dashed black outward stub** at each edge endpoint (length
  `CONTIG_STUB_PT`, perpendicular-outward) to indicate the neighbour continues, and place
  the `label` (designation) outside the edge.

Labels use the existing outward, line-avoiding placement (`placeVertexLabel` with the
edge **midpoint** as anchor against `subjCentroid`), and are added to the label-obstacle
set so vertex/stand labels avoid them.

### Constants (`diagramPdf.js`)
- `PT_PER_MM = 72/25.4` (exists).
- `BURNT_SIENNA = '#B7410E'`, `SERVITUDE_BLUE = '#1F6FB2'` (medium tones; final shades a
  visual-acceptance item).
- `ROAD_STRIP_PT = 1.3 * PT_PER_MM` (≈3.69 pt — same nominal width as the green inner
  band, per the "strip just like the inner colour strip" decision).
- `STRIP_FILL_OPACITY = 0.6` (so the colour does not obscure detail).
- `CONTIG_STUB_PT = 6 * PT_PER_MM`.

### Draw order
Neighbour dashed boundaries → subject green band + black boundary + beacons →
**adjoining strips/stubs (this feature)** → vertex/stand/adjoining labels (single
collision-avoiding pass). Strips sit outside the subject edge, so they never cover the
figure interior; `doc.save()/restore()` wraps every fill/dash so opacity/dash never leak.

## Error handling / edge cases
- No `sideAnnotations` → no-op.
- `side` not found among edges → skip + `logger.warn`.
- `role: 'servitude'` without `widthM` → label only, warn (no zero-width strip).
- Very small figure / edge shorter than the strip width → still fills the quad (degenerate
  but valid); no special-casing.
- `edgeStrip` with a zero-length edge → returns a degenerate quad; guarded by the
  side-resolution (distinct vertices), so not hit in practice.

## Testing
- **`edgeStrip.js` (Jest, pure):** horizontal edge `[0,0]→[10,0]`, centroid `[5,5]`,
  width `4` → the two new points are on the far side from the centroid (`y = -4`), edge
  points unchanged; a vertical edge offsets in ±x correctly; outward flips with the
  centroid on the other side.
- **`diagramPdf.test.js`:** add cases passing `metadata.sideAnnotations` with one of each
  role (contiguous / road / servitude with `widthM`) → still a valid `%PDF-`, buffer
  > 2000 bytes, no throw; and a `side` that matches no edge is skipped without throwing.
- **Manual visual acceptance:** regenerate a diagram with annotations and confirm a
  burnt-sienna road strip (like the sample's "Klein Road"), a blue servitude strip of the
  right width, and a dashed-black contiguous stub + designation label — none obscuring the
  figure, labels not colliding.

## Rollout
Single spec → single plan for sub-project A. Order: `edgeStrip.js` (TDD) →
`drawAdjoiningFeatures` + constants + wiring in `diagramPdf.js` → `diagramPdf.test.js`
cases → manual visual. Sub-project B (map side-classification UI producing
`sideAnnotations`) follows in its own spec.
